// Authentication routes: register, login, token refresh, logout, email
// verification, password reset, and profile (/me). Email + password only this
// pass; the schema is OAuth-ready for a later provider integration.
import { Router } from 'express';
import prisma from '../config/db.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
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
  ensureUserWorkspace,
} from '../services/auth.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/mailer.js';
import { trialEndFromNow } from '../services/billing.js';

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
  };
}

function sessionMeta(req: any) {
  return { userAgent: req.headers['user-agent'], ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip };
}

// ---- Register -----------------------------------------------------------
router.post('/register', rateLimit('auth-register', 10, 15 * 60 * 1000), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!name) return res.status(400).json({ error: 'Name is required.' });
  if (!validateEmail(email)) return res.status(400).json({ error: 'A valid email is required.' });
  const weak = validatePasswordStrength(password);
  if (weak) return res.status(400).json({ error: weak });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // If the seeded admin (no password yet) registers, let them set it here.
    if (!existing.passwordHash) {
      const passwordHash = await hashPassword(password);
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          passwordHash,
          // Only start a trial clock if this account has never had a plan set.
          ...(existing.planStatus === 'trialing' && !existing.trialEndsAt
            ? { plan: 'trial', trialEndsAt: trialEndFromNow() }
            : {}),
        },
      });
      await ensureUserWorkspace(updated.id);
      const token = await createVerificationToken(updated.id);
      sendVerificationEmail(updated.email, token).catch(err => console.error('[Auth] Failed to send verification email:', err));
      const access = issueAccessToken(updated.id, updated.email);
      const refresh = await issueRefreshToken(updated.id, sessionMeta(req));
      return res.status(201).json({ user: publicUser(updated), accessToken: access, refreshToken: refresh.token });
    }
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: 'ADMIN', plan: 'trial', planStatus: 'trialing', trialEndsAt: trialEndFromNow() },
  });
  await ensureUserWorkspace(user.id);

  const token = await createVerificationToken(user.id);
  sendVerificationEmail(user.email, token).catch(err => console.error('[Auth] Failed to send verification email:', err));

  const access = issueAccessToken(user.id, user.email);
  const refresh = await issueRefreshToken(user.id, sessionMeta(req));
  return res.status(201).json({ user: publicUser(user), accessToken: access, refreshToken: refresh.token });
});

// ---- Login --------------------------------------------------------------
router.post('/login', rateLimit('auth-login', 20, 15 * 60 * 1000), async (req, res) => {
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
  return res.json({ user: publicUser(user), accessToken: access, refreshToken: refresh.token });
});

// ---- Refresh ------------------------------------------------------------
router.post('/refresh', rateLimit('auth-refresh', 60, 15 * 60 * 1000), async (req, res) => {
  const rawToken = String(req.body?.refreshToken || '');
  if (!rawToken) return res.status(401).json({ error: 'Missing refresh token.' });
  const rotated = await rotateRefresh(rawToken, sessionMeta(req));
  if (!rotated) return res.status(401).json({ error: 'Session expired. Please log in again.' });
  const access = issueAccessToken(rotated.userId, rotated.email);
  return res.json({ accessToken: access, refreshToken: rotated.refresh.token });
});

// ---- Logout -------------------------------------------------------------
router.post('/logout', async (req, res) => {
  const rawToken = String(req.body?.refreshToken || '');
  if (rawToken) await revokeRefresh(rawToken);
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

router.post('/resend-verification', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.emailVerified) return res.json({ ok: true, message: 'Email already verified.' });
  const token = await createVerificationToken(user.id);
  sendVerificationEmail(user.email, token).catch(err => console.error('[Auth] Failed to send verification email:', err));
  return res.json({ ok: true });
});

// ---- Change password (authenticated) -----------------------------------
router.post('/change-password', requireAuth, async (req, res) => {
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
  if (typeof req.body?.name === 'string' && req.body.name.trim()) data.name = req.body.name.trim();
  if (typeof req.body?.avatarUrl === 'string') data.avatarUrl = req.body.avatarUrl.trim() || null;
  if (typeof req.body?.timezone === 'string') data.timezone = req.body.timezone;
  if (typeof req.body?.locale === 'string') data.locale = req.body.locale;
  if (typeof req.body?.dateFormat === 'string') data.dateFormat = req.body.dateFormat;
  const user = await prisma.user.update({ where: { id: req.userId! }, data });
  return res.json({ user: publicUser(user) });
});

export default router;
