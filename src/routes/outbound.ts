import type { Prisma } from '@prisma/client';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Router } from 'express';
import prisma from '../config/db.js';
import { getSetting } from '../services/settings.js';
import {
  addSuppressionEntry,
  applyInboxAction,
  createCampaign,
  generateEmail,
  getAnalytics,
  getCampaignDetail,
  getOutboundOverview,
  getReplyThread,
  handleProviderWebhook,
  handleResendInbound,
  ingestReply,
  listCampaigns,
  listWebhookEvents,
  listInbox,
  listSenderAccounts,
  listSuppressionEntries,
  listTemplates,
  listAuditLogs,
  queueCampaignSends,
  deleteCampaign,
  recordClick,
  recordOpen,
  rewriteGeneratedEmail,
  saveSenderAccount,
  saveTemplate,
  sendOneOff,
  suggestReply,
  unsubscribe,
  updateCampaignStatus,
  updateLeadCrm,
  verifySenderAccount,
} from '../services/outboundPlatform.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const trackingPixel = Buffer.from(
  'R0lGODlhAQABAPAAAP///////yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64'
);

type Role = 'ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER';

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Public, unauthenticated endpoints hit by email clients and providers (open/
// click pixels, unsubscribe links, provider + inbound webhooks). Everything
// else requires a valid Bearer token and is scoped to the authenticated user.
const PUBLIC_PREFIXES = ['/track/', '/unsubscribe/', '/inbound/', '/webhooks/'];
router.use((req, res, next) => {
  if (PUBLIC_PREFIXES.some((p) => req.path.startsWith(p))) return next();
  return requireAuth(req, res, next);
});

router.get('/overview', wrap(async (req, res) => {
  res.json(await getOutboundOverview(req.userId!));
}));

router.get('/campaigns', wrap(async (req, res) => {
  res.json(await listCampaigns(req.userId!));
}));

router.get('/campaigns/:id', wrap(async (req, res) => {
  const campaign = await getCampaignDetail(req.params.id, req.userId!);
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found.' });
  }

  res.json(campaign);
}));

router.post(
  '/campaigns',
  rateLimit({ key: 'campaign-create', limit: 12, windowMs: 15 * 60 * 1000 }),
  requireRoles('ADMIN', 'MANAGER'),
  wrap(async (req, res) => {
    const campaign = await createCampaign(
      {
        name: asString(req.body.name) || 'New outbound campaign',
        domainId: asString(req.body.domainId) || undefined,
        geoDomain: asString(req.body.geoDomain) || undefined,
        niche: asString(req.body.niche) || undefined,
        cityState: asString(req.body.cityState),
        objective: asString(req.body.objective),
        tone: asString(req.body.tone),
        language: asString(req.body.language),
        dailyLimit: asNumber(req.body.dailyLimit),
        smartDelayMin: asNumber(req.body.smartDelayMin),
        smartDelayMax: asNumber(req.body.smartDelayMax),
        leadIds: asStringArray(req.body.leadIds),
        uploadedEmails: asStringArray(req.body.uploadedEmails),
        templateId: asString(req.body.templateId),
        status: asString(req.body.status),
        instant: Boolean(req.body.instant),
        senderAccountId: asString(req.body.senderAccountId) || undefined,
      },
      getActor(req).userId || undefined
    );

    res.status(201).json(campaign);
  })
);

router.patch(
  '/campaigns/:id/status',
  rateLimit({ key: 'campaign-status', limit: 30, windowMs: 10 * 60 * 1000 }),
  requireRoles('ADMIN', 'MANAGER'),
  wrap(async (req, res) => {
    const status = asString(req.body.status);
    if (!status) {
      return res.status(400).json({ error: 'status is required.' });
    }

    const updated = await updateCampaignStatus(req.params.id, status, getActor(req).userId || undefined);
    await writeAudit(getActor(req), 'Campaign', req.params.id, `STATUS_${status.toUpperCase()}`, { status });
    res.json(updated);
  })
);

router.post(
  '/campaigns/:id/queue',
  rateLimit({ key: 'campaign-queue', limit: 20, windowMs: 10 * 60 * 1000 }),
  requireRoles('ADMIN', 'MANAGER'),
  wrap(async (req, res) => {
    const result = await queueCampaignSends(req.params.id, asString(req.body.senderAccountId) || undefined, req.userId!);
    await writeAudit(getActor(req), 'Campaign', req.params.id, 'QUEUE_SENDS', result);
    res.json(result);
  })
);

router.delete(
  '/campaigns/:id',
  rateLimit({ key: 'campaign-delete', limit: 40, windowMs: 10 * 60 * 1000 }),
  requireRoles('ADMIN', 'MANAGER'),
  wrap(async (req, res) => {
    const result = await deleteCampaign(req.params.id, getActor(req).userId || undefined);
    if (!result.deleted) return res.status(404).json({ error: 'Campaign not found.' });
    res.json(result);
  })
);

router.get('/templates', wrap(async (req, res) => {
  res.json(await listTemplates(req.userId!));
}));

router.post(
  '/templates',
  rateLimit({ key: 'template-create', limit: 20, windowMs: 10 * 60 * 1000 }),
  requireRoles('ADMIN', 'MANAGER'),
  wrap(async (req, res) => {
    const template = await saveTemplate(
      {
        name: asString(req.body.name) || 'Untitled template',
        type: asString(req.body.type),
        purpose: asString(req.body.purpose),
        language: asString(req.body.language),
        tone: asString(req.body.tone),
        subject: asString(req.body.subject) || 'Follow-up on {{geoDomain}}',
        previewText: asString(req.body.previewText),
        body: asString(req.body.body) || '',
        tags: asStringArray(req.body.tags),
      },
      getActor(req).userId || undefined
    );

    await writeAudit(getActor(req), 'Template', template.id, 'TEMPLATE_CREATED', { name: template.name });
    res.status(201).json(template);
  })
);

router.get('/senders', wrap(async (req, res) => {
  res.json(await listSenderAccounts(req.userId!));
}));

router.post(
  '/senders',
  rateLimit({ key: 'sender-create', limit: 16, windowMs: 10 * 60 * 1000 }),
  requireRoles('ADMIN', 'MANAGER'),
  wrap(async (req, res) => {
    const sender = await saveSenderAccount(
      {
        label: asString(req.body.label) || 'Sender account',
        provider: asString(req.body.provider) || 'DRY_RUN',
        fromName: asString(req.body.fromName) || 'GeoLead AI',
        fromEmail: asString(req.body.fromEmail) || 'outreach@geoleadai.local',
        replyTo: asString(req.body.replyTo),
        status: asString(req.body.status),
        dailyLimit: asNumber(req.body.dailyLimit),
        hourlyLimit: asNumber(req.body.hourlyLimit),
        timezone: asString(req.body.timezone),
        providerConfig: asObject(req.body.providerConfig),
      },
      getActor(req).userId || undefined
    );

    await writeAudit(getActor(req), 'SenderAccount', sender.id, 'SENDER_CREATED', { provider: sender.provider });
    res.status(201).json(sender);
  })
);

router.post(
  '/senders/:id/verify',
  rateLimit({ key: 'sender-verify', limit: 20, windowMs: 15 * 60 * 1000 }),
  requireRoles('ADMIN', 'MANAGER'),
  wrap(async (req, res) => {
    const result = await verifySenderAccount(req.params.id, getActor(req).userId || undefined);
    if (!result) {
      return res.status(404).json({ error: 'Sender account not found.' });
    }

    res.json(result);
  })
);

router.post(
  '/send-now',
  rateLimit({ key: 'send-now', limit: 30, windowMs: 10 * 60 * 1000 }),
  wrap(async (req, res) => {
    const senderAccountId = asString(req.body.senderAccountId);
    const to = asString(req.body.to);
    const subject = asString(req.body.subject);
    const body = asString(req.body.body);
    if (!senderAccountId || !to || !subject || !body) {
      return res.status(400).json({ error: 'senderAccountId, to, subject, and body are required.' });
    }
    try {
      const result = await sendOneOff({ senderAccountId, to, subject, body, bodyHtml: asString(req.body.bodyHtml) });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Send failed.' });
    }
  })
);

router.get('/inbox', wrap(async (req, res) => {
  res.json(await listInbox(req.userId!));
}));

router.get(
  '/inbox/:id/thread',
  requireRoles('ADMIN', 'MANAGER', 'MEMBER'),
  wrap(async (req, res) => {
    const thread = await getReplyThread(req.params.id, req.userId!);
    if (!thread) {
      return res.status(404).json({ error: 'Reply not found.' });
    }

    res.json(thread);
  })
);

router.post(
  '/inbox/:id/action',
  rateLimit({ key: 'inbox-action', limit: 60, windowMs: 10 * 60 * 1000 }),
  requireRoles('ADMIN', 'MANAGER', 'MEMBER'),
  wrap(async (req, res) => {
    const result = await applyInboxAction(
      req.params.id,
      {
        action: asString(req.body.action),
        reminderAt: asString(req.body.reminderAt),
      },
      getActor(req).userId || undefined
    );
    if (!result) {
      return res.status(404).json({ error: 'Reply not found.' });
    }

    res.json(result);
  })
);

router.post(
  '/inbox/:id/suggest',
  rateLimit({ key: 'reply-suggest', limit: 30, windowMs: 10 * 60 * 1000 }),
  requireRoles('ADMIN', 'MANAGER', 'MEMBER'),
  wrap(async (req, res) => {
    const reply = await suggestReply(req.params.id);
    if (!reply) {
      return res.status(404).json({ error: 'Reply not found.' });
    }

    res.json(reply);
  })
);

router.post(
  '/replies',
  rateLimit({ key: 'reply-ingest', limit: 60, windowMs: 10 * 60 * 1000 }),
  requireRoles('ADMIN', 'MANAGER'),
  wrap(async (req, res) => {
    const reply = await ingestReply({
      campaignLeadId: asString(req.body.campaignLeadId) || undefined,
      emailLogId: asString(req.body.emailLogId) || undefined,
      fromEmail: asString(req.body.fromEmail) || 'prospect@example.com',
      subject: asString(req.body.subject) || 'Re: your email',
      body: asString(req.body.body) || '',
    });

    await writeAudit(getActor(req), 'Reply', reply.id, 'REPLY_INGESTED', { campaignId: reply.campaignId });
    res.status(201).json(reply);
  })
);

router.get('/analytics', wrap(async (req, res) => {
  res.json(await getAnalytics(req.userId!));
}));

router.get(
  '/audit',
  requireRoles('ADMIN', 'MANAGER'),
  wrap(async (req, res) => {
    const limit = Number.parseInt(asString(req.query.limit) || '25', 10);
    res.json(await listAuditLogs(Number.isFinite(limit) ? limit : 25));
  })
);

router.get(
  '/webhooks',
  requireRoles('ADMIN', 'MANAGER'),
  wrap(async (req, res) => {
    const limit = Number.parseInt(asString(req.query.limit) || '25', 10);
    res.json(await listWebhookEvents(Number.isFinite(limit) ? limit : 25));
  })
);

router.get(
  '/suppressions',
  requireRoles('ADMIN', 'MANAGER'),
  wrap(async (req, res) => {
    const limit = Number.parseInt(asString(req.query.limit) || '25', 10);
    res.json(await listSuppressionEntries(Number.isFinite(limit) ? limit : 25));
  })
);

router.post(
  '/suppressions',
  rateLimit({ key: 'suppression-create', limit: 40, windowMs: 15 * 60 * 1000 }),
  requireRoles('ADMIN', 'MANAGER'),
  wrap(async (req, res) => {
    const actor = getActor(req);
    const entry = await addSuppressionEntry(
      {
        email: asString(req.body.email) || '',
        reason: asString(req.body.reason),
        source: 'manual',
      },
      actor.userId || undefined
    );
    res.status(201).json(entry);
  })
);

router.post(
  '/generate',
  rateLimit({ key: 'email-generate', limit: 40, windowMs: 60 * 60 * 1000 }),
  requireRoles('ADMIN', 'MANAGER', 'MEMBER'),
  wrap(async (req, res) => {
    // If a domain is selected from the portfolio, prefill geoDomain/niche/city
    // from it so the email generator doesn't need the user to retype them.
    const domainId = asString(req.body.domainId);
    const domain = domainId ? await prisma.domain.findFirst({ where: { id: domainId, userId: req.userId! } }) : null;
    const cityFromDomain = [domain?.city, domain?.state].filter(Boolean).join(', ');

    const result = await generateEmail({
      businessName: asString(req.body.businessName) || undefined,
      senderName: asString(req.body.senderName) || undefined,
      geoDomain: asString(req.body.geoDomain) || domain?.name || 'yourdomain.com',
      niche: asString(req.body.niche) || domain?.niche || domain?.industry || undefined,
      category: asString(req.body.category) || domain?.category || undefined,
      cityState: asString(req.body.cityState) || cityFromDomain || domain?.state || undefined,
      website: asString(req.body.website),
      businessDescription: asString(req.body.businessDescription),
      painPoints: asString(req.body.painPoints),
      tone: asString(req.body.tone),
      language: asString(req.body.language),
      variant: asVariant(req.body.variant),
      userId: req.userId!,
    });

    res.json(result);
  })
);

router.post(
  '/rewrite',
  rateLimit({ key: 'email-rewrite', limit: 80, windowMs: 60 * 60 * 1000 }),
  requireRoles('ADMIN', 'MANAGER', 'MEMBER'),
  wrap(async (req, res) => {
    const body = asString(req.body.body) || '';
    const action = asRewriteAction(req.body.action);
    res.json(rewriteGeneratedEmail(body, action));
  })
);

router.patch(
  '/leads/:id/crm',
  rateLimit({ key: 'lead-crm', limit: 40, windowMs: 15 * 60 * 1000 }),
  requireRoles('ADMIN', 'MANAGER', 'MEMBER'),
  wrap(async (req, res) => {
    const lead = await updateLeadCrm(req.params.id, req.body as Record<string, unknown>, req.userId!);
    await writeAudit(getActor(req), 'Lead', req.params.id, 'LEAD_CRM_UPDATED', req.body as Record<string, unknown>);
    res.json(lead);
  })
);

router.post(
  '/webhooks/:provider',
  rateLimit({ key: 'outbound-webhook', limit: 120, windowMs: 10 * 60 * 1000 }),
  wrap(async (req, res) => {
    const result = await handleProviderWebhook(req.params.provider, req.body);
    res.json(result);
  })
);

// Resend Inbound: configure an MX record + webhook URL in the Resend dashboard
// pointing here. Optional shared secret check via INBOUND_WEBHOOK_SECRET (sent
// as ?secret=... or X-Inbound-Secret header) until svix signature verification
// is added.
router.post(
  '/inbound/resend',
  rateLimit({ key: 'inbound-resend', limit: 240, windowMs: 10 * 60 * 1000 }),
  wrap(async (req, res) => {
    const expected = await getSetting('inboundWebhookSecret');
    if (expected) {
      const provided = asString(req.query.secret) || asString(req.headers['x-inbound-secret']);
      if (provided !== expected) {
        return res.status(401).json({ error: 'Invalid secret.' });
      }
    }
    const result = await handleResendInbound(req.body);
    res.json(result);
  })
);

router.get('/track/open/:trackingToken.gif', wrap(async (req, res) => {
  await recordOpen(req.params.trackingToken, requestInfo(req));
  sendTrackingPixel(res);
}));

router.get('/track/click/:trackingToken', wrap(async (req, res) => {
  const url = safeUrl(asString(req.query.url) || '');
  await recordClick(req.params.trackingToken, requestInfo(req));
  res.redirect(url);
}));

router.get('/unsubscribe/:unsubscribeToken', wrap(async (req, res) => {
  const log = await unsubscribe(req.params.unsubscribeToken);
  if (!log) {
    return res.status(404).type('text/plain').send('Unsubscribe token not found.');
  }

  res
    .status(200)
    .type('html')
    .send(
      `<html><body style="font-family:Arial,sans-serif;background:#0f172a;color:#e2e8f0;padding:40px"><h1>Unsubscribed</h1><p>You will not receive more email from this campaign.</p></body></html>`
    );
}));

router.get('/track/open/:trackingToken', wrap(async (req, res) => {
  await recordOpen(req.params.trackingToken, requestInfo(req));
  sendTrackingPixel(res);
}));

router.post('/audit', requireRoles('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const actor = getActor(req);
  await writeAudit(actor, asString(req.body.entityType) || 'System', asString(req.body.entityId) || null, asString(req.body.action) || 'MANUAL_EVENT', req.body as Record<string, unknown>);
  res.json({ ok: true });
}));

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Outbound API] Error:', err);
  res.status(500).json({ error: 'Outbound request failed.' });
});

export default router;

function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function rateLimit(config: { key: string; limit: number; windowMs: number }): RequestHandler {
  return (req, res, next) => {
    const bucketKey = `${config.key}:${getClientId(req)}`;
    const now = Date.now();
    const bucket = rateBuckets.get(bucketKey);

    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(bucketKey, { count: 1, resetAt: now + config.windowMs });
      return next();
    }

    if (bucket.count >= config.limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Rate limit exceeded.' });
    }

    bucket.count += 1;
    next();
  };
}

function requireRoles(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    const role = getRole(req);
    if (!roles.includes(role)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    next();
  };
}

function getRole(_req: Request): Role {
  // Roles are not yet differentiated per user; every authenticated user acts as
  // ADMIN within their own workspace. (Team roles are a future enhancement.)
  return 'ADMIN';
}

function getActor(req: Request) {
  return {
    userId: req.userId || null,
    userName: req.userEmail || null,
    role: getRole(req),
  };
}

function getClientId(req: Request) {
  const forwarded = asString(req.headers['x-forwarded-for']);
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return req.ip || req.socket.remoteAddress || 'unknown';
}

function requestInfo(req: Request) {
  return {
    ipAddress: getClientId(req),
    userAgent: asString(req.headers['user-agent']) || undefined,
    url: req.originalUrl,
  };
}

async function writeAudit(
  actor: { userId: string | null; role: Role; userName: string | null },
  entityType: string,
  entityId: string | null,
  action: string,
  payload: Record<string, unknown>
) {
  await prisma.auditLog.create({
    data: {
      userId: actor.userId,
      entityType,
      entityId,
      action,
      payload: payload as Prisma.InputJsonObject,
    },
  });
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return undefined;
}

function asObject(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

function asVariant(value: unknown) {
  const variant = asString(value);
  if (
    variant === 'cold' ||
    variant === 'follow_up' ||
    variant === 'short' ||
    variant === 'long' ||
    variant === 'persuasive' ||
    variant === 'friendly'
  ) {
    return variant;
  }

  return undefined;
}

function asRewriteAction(value: unknown) {
  const action = asString(value);
  if (action === 'shorter' || action === 'professional' || action === 'persuasive' || action === 'friendly') {
    return action;
  }

  return 'professional';
}

function sendTrackingPixel(res: Response) {
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Content-Length', String(trackingPixel.length));
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.status(200).send(trackingPixel);
}

function safeUrl(input: string) {
  try {
    const parsed = new URL(input);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return 'https://geolead.ai';
  }

  return 'https://geolead.ai';
}
