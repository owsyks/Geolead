// Auth middleware: validates the Bearer access token and attaches the resolved
// user id to the request. `requireAuth` rejects unauthenticated requests;
// `optionalAuth` resolves a user if a valid token is present but never blocks.
import type { Request, Response, NextFunction } from 'express';
import prisma from '../config/db.js';
import { verifyAccessToken } from '../services/auth.js';
import { assertQuota, PlanRequiredError, QuotaError, type QuotaMetric } from '../services/billing.js';

// Augment Express Request with the authenticated principal.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  const payload = verifyAccessToken(token);
  if (!payload?.sub) return res.status(401).json({ error: 'Invalid or expired session.' });

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, isActive: true } });
  if (!user || !user.isActive) return res.status(401).json({ error: 'Account not found or inactive.' });

  req.userId = user.id;
  req.userEmail = user.email;
  return next();
}

// Require a verified email before any cost-bearing / outbound action. Read-only
// routes stay open so a half-onboarded user can still see an empty dashboard and
// trigger a resend. Must run after requireAuth.
export async function requireVerifiedEmail(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) return res.status(401).json({ error: 'Authentication required.' });
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { emailVerified: true } });
  if (!user?.emailVerified) {
    return res.status(403).json({ error: 'Please verify your email to continue.', code: 'EMAIL_UNVERIFIED' });
  }
  return next();
}

// Fail-closed plan/quota gate. Blocks when the user can't spend (trial expired /
// canceled / past_due) or when adding one more unit of `metric` would exceed the
// tier limit. Returns 402 with a machine-readable code the frontend acts on.
// Must run after requireAuth.
export function requirePlanCapacity(metric: QuotaMetric) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.userId) return res.status(401).json({ error: 'Authentication required.' });
    try {
      await assertQuota(req.userId, metric, 1);
      return next();
    } catch (err) {
      if (err instanceof PlanRequiredError) {
        return res.status(402).json({ error: err.message, code: err.code, tier: err.tier, status: err.status });
      }
      if (err instanceof QuotaError) {
        return res.status(402).json({ error: err.message, code: err.code, metric: err.metric, limit: err.limit, used: err.used, tier: err.tier });
      }
      console.error('[Plan] capacity check failed:', err);
      return res.status(500).json({ error: 'Could not verify plan capacity.' });
    }
  };
}

// Platform-admin allowlist. Source of truth is the ADMIN_EMAILS env var
// (comma-separated), falling back to SEED_ADMIN_EMAIL. Deliberately NOT the
// User.role column, which currently defaults to ADMIN for everyone.
export function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || process.env.SEED_ADMIN_EMAIL || '')
    .toLowerCase()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

// Restrict a route to platform admins. Must run after requireAuth.
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) return res.status(401).json({ error: 'Authentication required.' });
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true, isActive: true } });
  if (!user?.isActive || !isAdminEmail(user.email)) {
    return res.status(403).json({ error: 'Admin access required.', code: 'NOT_ADMIN' });
  }
  return next();
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = bearer(req);
  if (token) {
    const payload = verifyAccessToken(token);
    if (payload?.sub) {
      req.userId = payload.sub;
      req.userEmail = payload.email;
    }
  }
  return next();
}
