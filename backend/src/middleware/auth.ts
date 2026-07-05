// Auth middleware: validates the caller's identity and attaches the resolved
// local user id to the request. `requireAuth` rejects unauthenticated
// requests; `optionalAuth` resolves a user if present but never blocks.
//
// Clerk migration (in progress): Clerk is checked first via `getAuth(req)`
// (populated by `clerkMiddleware()` in server.ts from the Authorization
// header the frontend sends). A verified Clerk identity is resolved to this
// app's own local User row — via `clerkUserId` on the hot path, or by
// linking/creating on first sight — since every relation in the schema (and
// two tables with a bare, relation-less `userId` column) still key off the
// app's own id, not Clerk's. If no Clerk auth is present, this falls back to
// the legacy app-issued JWT so the still-deployed old frontend keeps working
// during the transition. Remove the legacy branch once Phase 6 of the
// migration confirms no meaningful legacy traffic remains.
import type { Request, Response, NextFunction } from 'express';
import { getAuth, clerkClient } from '@clerk/express';
import prisma from '../config/db.js';
import { verifyAccessToken } from '../services/auth.js';
import { ensureUserWorkspace } from '../services/auth.js';
import { assertQuota, PlanRequiredError, QuotaError, trialEndFromNow, type QuotaMetric } from '../services/billing.js';

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

type LocalUser = { id: string; email: string; isActive: boolean };

// Resolve a verified Clerk user id to this app's local User row, linking or
// creating it on first sight. Synchronous (not webhook-based) — a brand-new
// user's very first authenticated request can't assume a `user.created`
// webhook has already landed.
async function resolveClerkUser(clerkUserId: string): Promise<LocalUser | null> {
  const linked = await prisma.user.findUnique({ where: { clerkUserId }, select: { id: true, email: true, isActive: true } });
  if (linked) return linked;

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const email = clerkUser.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (!email) return null;
  const emailVerified = clerkUser.primaryEmailAddress?.verification?.status === 'verified';

  // Clean-cutover case: a pre-existing local account (created by the old
  // password-based flow) signs in via Clerk with the same email — attach it
  // instead of creating a duplicate, so their existing data stays theirs.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { clerkUserId, emailVerified: existing.emailVerified || emailVerified },
      select: { id: true, email: true, isActive: true },
    });
  }

  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim()
    || clerkUser.username
    || email.split('@')[0];
  const created = await prisma.user.create({
    data: {
      email,
      name,
      clerkUserId,
      emailVerified,
      role: 'ADMIN',
      plan: 'trial',
      planStatus: 'trialing',
      trialEndsAt: trialEndFromNow(),
    },
    select: { id: true, email: true, isActive: true },
  });
  await ensureUserWorkspace(created.id);
  return created;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const clerkAuth = getAuth(req);
  if (clerkAuth.userId) {
    const user = await resolveClerkUser(clerkAuth.userId);
    if (!user || !user.isActive) return res.status(401).json({ error: 'Account not found or inactive.' });
    req.userId = user.id;
    req.userEmail = user.email;
    return next();
  }

  // Legacy fallback — see file header.
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  const payload = verifyAccessToken(token);
  if (!payload?.sub) return res.status(401).json({ error: 'Invalid or expired session.' });

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, isActive: true } });
  if (!user || !user.isActive) return res.status(401).json({ error: 'Account not found or inactive.' });
  console.log(`[Auth] legacy JWT fallback used for ${user.email}`);

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
  const clerkAuth = getAuth(req);
  if (clerkAuth.userId) {
    const user = await resolveClerkUser(clerkAuth.userId);
    if (user?.isActive) {
      req.userId = user.id;
      req.userEmail = user.email;
    }
    return next();
  }

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
