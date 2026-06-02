import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Router } from 'express';
import prisma from '../config/db.js';
import {
  getKnownProviders,
  verifyEmail,
  verifyEmailsBulk,
  type EmailVerificationResult,
} from '../services/emailVerification.js';
import {
  assessDeliverability,
  assessDeliverabilityBulk,
  type DeliverabilityResult,
} from '../services/deliverabilityEngine.js';
import { emailVerificationQueue } from '../queues/queues.js';

const router = Router();
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const MAX_INLINE_BULK = 50;

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

router.post(
  '/verify',
  rateLimit({ key: 'email-verify', limit: 120, windowMs: 10 * 60 * 1000 }),
  wrap(async (req, res) => {
    const email = String(req.body?.email || '').trim();
    if (!email) return res.status(400).json({ error: 'email is required' });
    const result = await verifyEmail(email);
    res.json(result);
  })
);

router.post(
  '/verify-bulk',
  rateLimit({ key: 'email-verify-bulk', limit: 30, windowMs: 60 * 60 * 1000 }),
  wrap(async (req, res) => {
    const emails = Array.isArray(req.body?.emails) ? req.body.emails.map((e: any) => String(e).trim()).filter(Boolean) : [];
    if (emails.length === 0) return res.status(400).json({ error: 'emails array is required' });
    if (emails.length > 100_000) return res.status(400).json({ error: 'Maximum 100,000 emails per request' });

    if (emails.length <= MAX_INLINE_BULK) {
      const results = await verifyEmailsBulk(emails, 10);
      return res.json({ mode: 'inline', total: emails.length, results, summary: summarize(results) });
    }

    const job = await prisma.emailVerificationJob.create({
      data: { status: 'PENDING', totalEmails: emails.length },
    });

    try {
      await emailVerificationQueue.add(
        'verify-batch',
        { jobRecordId: job.id, emails },
        { jobId: `verify-${job.id}` }
      );
      return res.status(202).json({ mode: 'queued', jobId: job.id, total: emails.length });
    } catch (err: any) {
      console.warn('[email] Queue enqueue failed; running inline:', err?.message);
      const results = await verifyEmailsBulk(emails, 10);
      const summary = summarize(results);
      await prisma.emailVerificationJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          processedEmails: emails.length,
          validEmails: summary.valid,
          riskyEmails: summary.risky,
          invalidEmails: summary.invalid,
        },
      });
      return res.json({ mode: 'inline-fallback', jobId: job.id, total: emails.length, results, summary });
    }
  })
);

router.get(
  '/verify-bulk/:jobId',
  wrap(async (req, res) => {
    const job = await prisma.emailVerificationJob.findUnique({ where: { id: req.params.jobId } });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const percent = job.totalEmails > 0 ? Math.round((job.processedEmails / job.totalEmails) * 100) : 0;
    res.json({ ...job, percentComplete: percent });
  })
);

router.post(
  '/assess',
  rateLimit({ key: 'email-assess', limit: 60, windowMs: 10 * 60 * 1000 }),
  wrap(async (req, res) => {
    const email = String(req.body?.email || '').trim();
    if (!email) return res.status(400).json({ error: 'email is required' });
    const deep = req.body?.deep !== false; // default deep=true
    const staffNames = Array.isArray(req.body?.staffNames)
      ? req.body.staffNames.map((n: any) => String(n)).filter(Boolean)
      : undefined;
    const result = await assessDeliverability(email, { deep, staffNames });
    res.json(result);
  })
);

router.post(
  '/assess-bulk',
  rateLimit({ key: 'email-assess-bulk', limit: 10, windowMs: 60 * 60 * 1000 }),
  wrap(async (req, res) => {
    const emails = Array.isArray(req.body?.emails)
      ? req.body.emails.map((e: any) => String(e).trim()).filter(Boolean)
      : [];
    if (emails.length === 0) return res.status(400).json({ error: 'emails array required' });
    if (emails.length > 500) return res.status(400).json({ error: 'Maximum 500 emails per assess-bulk request (use /verify-bulk for larger jobs)' });
    const deep = req.body?.deep !== false;
    const results = await assessDeliverabilityBulk(emails, { deep, concurrency: 5 });
    res.json({
      total: emails.length,
      results,
      summary: summarizeDeliverability(results),
    });
  })
);

router.get(
  '/providers',
  wrap(async (_req, res) => {
    res.json({ providers: getKnownProviders() });
  })
);

router.get(
  '/statistics',
  wrap(async (_req, res) => {
    const [total, valid, risky, invalid, disposable, role, freeProv, mxValid] = await Promise.all([
      prisma.leadEmail.count(),
      prisma.leadEmail.count({ where: { status: 'VALID' } }),
      prisma.leadEmail.count({ where: { status: 'RISKY' } }),
      prisma.leadEmail.count({ where: { status: 'INVALID' } }),
      prisma.leadEmail.count({ where: { disposable: true } }),
      prisma.leadEmail.count({ where: { roleAccount: true } }),
      prisma.leadEmail.count({ where: { freeProvider: true } }),
      prisma.leadEmail.count({ where: { mxValid: true } }),
    ]);

    const ratio = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
    res.json({
      total,
      verificationRate: ratio(valid + risky),
      validRate: ratio(valid),
      riskyRate: ratio(risky),
      invalidRate: ratio(invalid),
      disposableRate: ratio(disposable),
      roleAccountRate: ratio(role),
      freeProviderRate: ratio(freeProv),
      mxValidRate: ratio(mxValid),
      estimatedDeliverability: ratio(valid) + Math.round(ratio(risky) * 0.4),
      counts: { total, valid, risky, invalid, disposable, role, freeProv, mxValid },
    });
  })
);

function summarizeDeliverability(results: DeliverabilityResult[]) {
  let safe = 0, caution = 0, review = 0, doNot = 0;
  let critical = 0, high = 0, medium = 0, low = 0;
  let totalScore = 0;
  for (const r of results) {
    totalScore += r.deliverabilityScore;
    if (r.recommendation === 'SAFE_TO_CONTACT') safe++;
    else if (r.recommendation === 'CONTACT_WITH_CAUTION') caution++;
    else if (r.recommendation === 'REVIEW_MANUALLY') review++;
    else doNot++;
    if (r.bounceRisk === 'CRITICAL') critical++;
    else if (r.bounceRisk === 'HIGH') high++;
    else if (r.bounceRisk === 'MEDIUM') medium++;
    else low++;
  }
  return {
    recommendations: { safe, caution, review, doNot },
    bounceRisk: { critical, high, medium, low },
    avgDeliverabilityScore: results.length > 0 ? Math.round(totalScore / results.length) : 0,
  };
}

function summarize(results: EmailVerificationResult[]) {
  let valid = 0, risky = 0, invalid = 0, disposable = 0, role = 0, freeProv = 0;
  for (const r of results) {
    if (r.status === 'VALID') valid++;
    else if (r.status === 'RISKY') risky++;
    else invalid++;
    if (r.disposable) disposable++;
    if (r.roleAccount) role++;
    if (r.freeProvider) freeProv++;
  }
  return { valid, risky, invalid, disposable, role, freeProv };
}

interface RateLimitConfig { key: string; limit: number; windowMs: number }

function rateLimit(config: RateLimitConfig): RequestHandler {
  return (req, res, next) => {
    const clientKey = `${config.key}:${getClientId(req)}`;
    const now = Date.now();
    const bucket = rateBuckets.get(clientKey);
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(clientKey, { count: 1, resetAt: now + config.windowMs });
      return next();
    }
    if (bucket.count >= config.limit) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Rate limit exceeded.' });
    }
    bucket.count += 1;
    return next();
  };
}

function getClientId(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function wrap(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch((err) => {
      console.error('[email] Route error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error', detail: err?.message });
      }
    });
  };
}

export default router;
