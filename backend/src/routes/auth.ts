// Authentication routes: register, login, token refresh, logout, email
// verification, password reset, and profile (/me). Email + password only this
// pass; the schema is OAuth-ready for a later provider integration.
import { Router, type Request, type Response, type NextFunction } from 'express';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../config/db.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireAuth, isAdminEmail } from '../middleware/auth.js';
import {
  validateEmail,
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
  issueAccessToken,
  issueRefreshToken,
  rotateRefresh,
  revokeRefresh,
  revokeAllSessions,
  createVerificationToken,
  consumeVerificationToken,
  createResetToken,
  consumeResetToken,
  issueWebSocketTicket,
} from '../services/auth.js';
import { sendVerificationEmail, sendPasswordResetEmail, sendRegistrationCode } from '../services/mailer.js';
import { trialEndFromNow } from '../services/billing.js';
import { browserOrigins } from '../config/origins.js';

const router = Router();

function publicUser(u: any) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl ?? null,
    emailVerified: u.emailVerified,
    plan: u.plan,
    planStatus: u.planStatus,
    trialEndsAt: u.trialEndsAt ?? null,
    role: u.role,
    timezone: u.timezone ?? 'UTC',
    locale: u.locale ?? 'en',
    dateFormat: u.dateFormat ?? 'MMM d, yyyy',
    createdAt: u.createdAt,
    isAdmin: isAdminEmail(u.email),
  };
}

function sessionMeta(req: Request) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

const REFRESH_COOKIE = process.env.NODE_ENV === 'production' ? '__Secure-geolead_refresh' : 'geolead_refresh';

function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/api/auth',
    expires: expiresAt,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/api/auth',
  });
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) {
      try { return decodeURIComponent(rawValue.join('=')); } catch { return null; }
    }
  }
  return null;
}

function trustedBrowserOrigin(req: Request, res: Response, next: NextFunction) {
  const configured = browserOrigins();
  const origin = req.get('origin')?.replace(/\/$/, '');
  const clientHeader = req.get('x-geolead-client');
  if (!origin || !configured.includes(origin) || clientHeader !== 'web') {
    return res.status(403).json({ error: 'Untrusted request origin.' });
  }
  return next();
}

const REGISTRATION_CODE_TTL_MS = 10 * 60 * 1000;
const REGISTRATION_RESEND_MS = 60 * 1000;
const REGISTRATION_SEND_WINDOW_MS = 60 * 60 * 1000;
const REGISTRATION_MAX_SENDS = 5;
const REGISTRATION_MAX_ATTEMPTS = 5;

function registrationCodeHash(email: string, code: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required for registration codes.');
  return createHmac('sha256', secret).update(`geolead:registration:v1\0${email}\0${code}`).digest('hex');
}

function codeMatches(expectedHex: string, actualHex: string): boolean {
  if (expectedHex.length !== actualHex.length) return false;
  return timingSafeEqual(Buffer.from(expectedHex, 'ascii'), Buffer.from(actualHex, 'ascii'));
}

class RegistrationThrottleError extends Error {
  constructor(public retryAfterSeconds: number) { super('REGISTRATION_THROTTLED'); }
}

async function storeRegistrationChallenge(email: string, codeHash: string, now: Date): Promise<void> {
  for (let retry = 0; retry < 3; retry += 1) {
    try {
      await prisma.$transaction(async (tx) => {
        if (await tx.user.findUnique({ where: { email }, select: { id: true } })) throw new Error('REGISTRATION_EXISTS');
        const existing = await tx.registrationChallenge.findUnique({ where: { email } });
        if (existing && now.getTime() - existing.lastSentAt.getTime() < REGISTRATION_RESEND_MS) {
          throw new RegistrationThrottleError(Math.ceil((REGISTRATION_RESEND_MS - (now.getTime() - existing.lastSentAt.getTime())) / 1000));
        }
        const withinWindow = !!existing && now.getTime() - existing.windowStartedAt.getTime() < REGISTRATION_SEND_WINDOW_MS;
        if (withinWindow && existing!.sendCount >= REGISTRATION_MAX_SENDS) {
          const retryAfter = Math.max(1, Math.ceil((REGISTRATION_SEND_WINDOW_MS - (now.getTime() - existing!.windowStartedAt.getTime())) / 1000));
          throw new RegistrationThrottleError(retryAfter);
        }
        await tx.registrationChallenge.upsert({
          where: { email },
          create: { email, codeHash, expiresAt: new Date(now.getTime() + REGISTRATION_CODE_TTL_MS), lastSentAt: now, windowStartedAt: now },
          update: {
            codeHash,
            expiresAt: new Date(now.getTime() + REGISTRATION_CODE_TTL_MS),
            lastSentAt: now,
            attempts: 0,
            consumedAt: null,
            windowStartedAt: withinWindow ? existing!.windowStartedAt : now,
            sendCount: withinWindow ? existing!.sendCount + 1 : 1,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return;
    } catch (error: any) {
      if (error?.code === 'P2034' && retry < 2) continue;
      throw error;
    }
  }
}

// Send mailbox proof before creating any User or session.
router.post('/registration-code', trustedBrowserOrigin, rateLimit('auth-registration-code', 10, 60 * 60 * 1000), async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!validateEmail(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const now = new Date();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = registrationCodeHash(email, code);
  try {
    await storeRegistrationChallenge(email, codeHash, now);
  } catch (error) {
    if (error instanceof RegistrationThrottleError) {
      res.setHeader('Retry-After', String(error.retryAfterSeconds));
      return res.status(429).json({ error: 'Too many verification code requests. Please wait before trying again.' });
    }
    if (error instanceof Error && error.message === 'REGISTRATION_EXISTS') {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    throw error;
  }

  try {
    await sendRegistrationCode(email, code);
  } catch (error) {
    await prisma.registrationChallenge.updateMany({ where: { email, codeHash }, data: { expiresAt: now } });
    console.error('[Auth] Registration email delivery failed:', error instanceof Error ? error.message : 'unknown');
    return res.status(502).json({ error: 'Could not send the verification code. Please try again.' });
  }
  return res.json({ ok: true, expiresInSeconds: REGISTRATION_CODE_TTL_MS / 1000, resendAfterSeconds: REGISTRATION_RESEND_MS / 1000 });
});

// ---- Register -----------------------------------------------------------
router.post('/register', trustedBrowserOrigin, rateLimit('auth-register', 10, 15 * 60 * 1000), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const code = String(req.body?.code || '').trim();

  if (!name || name.length > 200) return res.status(400).json({ error: 'Name must be between 1 and 200 characters.' });
  if (!validateEmail(email)) return res.status(400).json({ error: 'A valid email is required.' });
  const weak = validatePasswordStrength(password);
  if (weak) return res.status(400).json({ error: weak });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the 6-digit verification code.' });

  const existing = await prisma.user.findUnique({ where: { email } });
  // Passwordless seeded accounts are activated only through the email-bound
  // reset flow. Registration must never let an attacker claim a known address.
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const challenge = await prisma.registrationChallenge.findUnique({ where: { email } });
  if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) {
    return res.status(400).json({ error: 'This verification code is invalid or has expired.' });
  }
  if (challenge.attempts >= REGISTRATION_MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });
  }
  const suppliedHash = registrationCodeHash(email, code);
  if (!codeMatches(challenge.codeHash, suppliedHash)) {
    await prisma.registrationChallenge.updateMany({
      where: { email, codeHash: challenge.codeHash, consumedAt: null, attempts: { lt: REGISTRATION_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    return res.status(400).json({ error: 'This verification code is invalid or has expired.' });
  }

  const passwordHash = await hashPassword(password);
  let user: any;
  try {
    user = await prisma.$transaction(async (tx) => {
      const consumed = await tx.registrationChallenge.updateMany({
        where: { email, codeHash: challenge.codeHash, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: REGISTRATION_MAX_ATTEMPTS } },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw new Error('REGISTRATION_CODE_ALREADY_USED');
      return tx.user.create({
        data: {
          name, email, passwordHash, emailVerified: true, role: 'ADMIN', plan: 'trial', planStatus: 'trialing', trialEndsAt: trialEndFromNow(),
          userSettings: { create: {} },
          notificationPreference: { create: {} },
        },
      });
    });
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'An account with this email already exists.' });
    if (error?.message === 'REGISTRATION_CODE_ALREADY_USED') return res.status(400).json({ error: 'This verification code is invalid or has expired.' });
    throw error;
  }

  const access = issueAccessToken(user.id, user.email);
  const refresh = await issueRefreshToken(user.id, sessionMeta(req));
  setRefreshCookie(res, refresh.token, refresh.expiresAt);
  return res.status(201).json({ user: publicUser(user), accessToken: access });
});

// ---- Login --------------------------------------------------------------
router.post('/login', trustedBrowserOrigin, rateLimit('auth-login', 20, 15 * 60 * 1000), async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const remember = !!req.body?.remember;

  const generic = { error: 'Invalid email or password.' };
  if (!validateEmail(email) || !password) return res.status(401).json(generic);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !user.isActive) return res.status(401).json(generic);
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json(generic);

  const access = issueAccessToken(user.id, user.email);
  const refresh = await issueRefreshToken(user.id, { remember, ...sessionMeta(req) });
  setRefreshCookie(res, refresh.token, refresh.expiresAt);
  prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  return res.json({ user: publicUser(user), accessToken: access });
});

// ---- Refresh ------------------------------------------------------------
router.post('/refresh', trustedBrowserOrigin, rateLimit('auth-refresh', 60, 15 * 60 * 1000), async (req, res) => {
  const rawToken = readCookie(req, REFRESH_COOKIE);
  if (!rawToken) return res.status(401).json({ error: 'Missing refresh token.' });
  const rotated = await rotateRefresh(rawToken, sessionMeta(req));
  if (!rotated) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  const access = issueAccessToken(rotated.userId, rotated.email);
  setRefreshCookie(res, rotated.refresh.token, rotated.refresh.expiresAt);
  prisma.user.update({ where: { id: rotated.userId }, data: { lastSeenAt: new Date() } }).catch(() => {});
  return res.json({ accessToken: access });
});

// ---- Logout -------------------------------------------------------------
router.post('/logout', trustedBrowserOrigin, async (req, res) => {
  const rawToken = readCookie(req, REFRESH_COOKIE);
  if (rawToken) await revokeRefresh(rawToken);
  clearRefreshCookie(res);
  return res.json({ ok: true });
});

// ---- Forgot / reset password -------------------------------------------
router.post('/forgot-password', rateLimit('auth-forgot', 10, 15 * 60 * 1000), async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  // Always respond success to avoid revealing whether an account exists.
  if (validateEmail(email)) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = await createResetToken(user.id);
      sendPasswordResetEmail(user.email, token).catch(err => console.error('[Auth] Failed to send password reset email:', err));
    }
  }
  return res.json({ ok: true, message: 'If an account exists for that email, a reset link has been sent.' });
});

router.post('/reset-password', rateLimit('auth-reset', 20, 15 * 60 * 1000), async (req, res) => {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  const weak = validatePasswordStrength(password);
  if (weak) return res.status(400).json({ error: weak });

  const userId = await consumeResetToken(token);
  if (!userId) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });

  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await revokeAllSessions(userId); // force re-login everywhere after a reset
  return res.json({ ok: true });
});

// ---- Email verification -------------------------------------------------
router.post('/verify-email', rateLimit('auth-verify', 30, 15 * 60 * 1000), async (req, res) => {
  const token = String(req.body?.token || '');
  const userId = await consumeVerificationToken(token);
  if (!userId) return res.status(400).json({ error: 'This verification link is invalid or has expired.' });
  await prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });
  return res.json({ ok: true });
});

router.post('/resend-verification', requireAuth, rateLimit('auth-resend-verification', 5, 60 * 60 * 1000), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.emailVerified) return res.json({ ok: true, message: 'Email already verified.' });
  const token = await createVerificationToken(user.id);
  sendVerificationEmail(user.email, token).catch(err => console.error('[Auth] Failed to send verification email:', err));
  return res.json({ ok: true });
});

// ---- Change password (authenticated) -----------------------------------
router.post('/change-password', requireAuth, rateLimit('auth-change-password', 10, 60 * 60 * 1000), async (req, res) => {
  const current = String(req.body?.currentPassword || '');
  const next = String(req.body?.newPassword || '');
  const weak = validatePasswordStrength(next);
  if (weak) return res.status(400).json({ error: weak });

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user?.passwordHash || !(await verifyPassword(current, user.passwordHash))) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  const passwordHash = await hashPassword(next);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await revokeAllSessions(user.id);
  return res.json({ ok: true });
});

router.post('/ws-ticket', requireAuth, rateLimit('auth-ws-ticket', 30, 60 * 1000), (req, res) => {
  return res.json({ ticket: issueWebSocketTicket(req.userId!), expiresInSeconds: 30 });
});

// ---- Profile ------------------------------------------------------------
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    include: { userSettings: true, notificationPreference: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  return res.json({
    user: publicUser(user),
    settings: user.userSettings,
    notifications: user.notificationPreference,
  });
});

router.patch('/me', requireAuth, async (req, res) => {
  const data: any = {};
  if (typeof req.body?.name === 'string' && req.body.name.trim()) data.name = req.body.name.trim().slice(0, 200);
  if (typeof req.body?.avatarUrl === 'string') {
    const avatar = req.body.avatarUrl.trim();
    if (avatar) {
      try {
        const parsed = new URL(avatar);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
        data.avatarUrl = parsed.toString();
      } catch { return res.status(400).json({ error: 'avatarUrl must be a valid HTTP(S) URL.' }); }
    } else data.avatarUrl = null;
  }
  if (typeof req.body?.timezone === 'string') data.timezone = req.body.timezone.slice(0, 100);
  if (typeof req.body?.locale === 'string') data.locale = req.body.locale.slice(0, 20);
  if (typeof req.body?.dateFormat === 'string') data.dateFormat = req.body.dateFormat.slice(0, 100);
  const user = await prisma.user.update({ where: { id: req.userId! }, data });
  return res.json({ user: publicUser(user) });
});

export default router;
