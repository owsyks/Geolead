// Core authentication service: password hashing, JWT access tokens, DB-backed
// refresh sessions, and hashed single-use tokens for email verification and
// password reset. Also owns the one-time admin seed + claim of pre-existing
// (single-user era) data so the live workspace isn't orphaned by multi-tenancy.
import { createHash, randomBytes } from 'node:crypto';
import { hash as bcryptHash, compare as bcryptCompare } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TTL_DAYS_DEFAULT = 7;
const REFRESH_TTL_DAYS_REMEMBER = 30;
const RESET_TTL_MIN = 60;
const VERIFY_TTL_HOURS = 48;
const BCRYPT_ROUNDS = 12;

function jwtSecret(): string {
  return process.env.JWT_SECRET || process.env.OUTBOUND_SECRET_KEY || 'geolead-ai-local-dev-jwt';
}

// ---- Validation ---------------------------------------------------------

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Returns an error string if weak, or null if acceptable.
export function validatePasswordStrength(password: string): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include a number.';
  return null;
}

// ---- Passwords ----------------------------------------------------------

export function hashPassword(plain: string): Promise<string> {
  return bcryptHash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcryptCompare(plain, hash);
}

// ---- Access tokens (stateless JWT) -------------------------------------

export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
}

export function issueAccessToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email } as AccessTokenPayload, jwtSecret(), {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    return jwt.verify(token, jwtSecret()) as AccessTokenPayload;
  } catch {
    return null;
  }
}

// ---- Refresh sessions (DB-backed, hashed at rest) ----------------------

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface IssuedRefresh {
  token: string; // raw token returned to the client (only time it's visible)
  expiresAt: Date;
}

export async function issueRefreshToken(
  userId: string,
  opts: { remember?: boolean; userAgent?: string; ip?: string } = {}
): Promise<IssuedRefresh> {
  const token = randomBytes(32).toString('hex');
  const days = opts.remember ? REFRESH_TTL_DAYS_REMEMBER : REFRESH_TTL_DAYS_DEFAULT;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      userAgent: opts.userAgent?.slice(0, 300) ?? null,
      ip: opts.ip ?? null,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

// Validate a refresh token and rotate it (single-use). Returns the user + a
// fresh refresh token, or null if invalid/expired/revoked.
export async function rotateRefresh(
  rawToken: string,
  opts: { remember?: boolean; userAgent?: string; ip?: string } = {}
): Promise<{ userId: string; email: string; refresh: IssuedRefresh } | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(rawToken) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (!session.user.isActive) return null;

  // Rotate: revoke the old session, mint a new one.
  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  const refresh = await issueRefreshToken(session.userId, opts);
  return { userId: session.userId, email: session.user.email, refresh };
}

export async function revokeRefresh(rawToken: string): Promise<void> {
  await prisma.session
    .updateMany({ where: { tokenHash: sha256(rawToken), revokedAt: null }, data: { revokedAt: new Date() } })
    .catch(() => undefined);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

// ---- Verification + reset tokens (hashed, single-use) -------------------

export async function createVerificationToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await prisma.verificationToken.create({
    data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + VERIFY_TTL_HOURS * 3600 * 1000) },
  });
  return token;
}

export async function consumeVerificationToken(rawToken: string): Promise<string | null> {
  const row = await prisma.verificationToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  await prisma.verificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return row.userId;
}

export async function createResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MIN * 60 * 1000) },
  });
  return token;
}

export async function consumeResetToken(rawToken: string): Promise<string | null> {
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  await prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return row.userId;
}

// ---- Default workspace bootstrap ---------------------------------------

// Ensure a user has the per-user singletons (settings + notification prefs).
export async function ensureUserWorkspace(userId: string): Promise<void> {
  await prisma.userSettings.upsert({ where: { userId }, update: {}, create: { userId } });
  await prisma.notificationPreference.upsert({ where: { userId }, update: {}, create: { userId } });
}

// ---- Admin seed + claim of pre-existing data ---------------------------

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL || 'elmountaknat@gmail.com').toLowerCase();
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'owsyks';

// Idempotent. Runs at boot. Creates the admin user if missing and assigns every
// orphaned (userId/ownerId NULL) row from the single-user era to that admin so
// the live workspace remains intact once data becomes per-user. The admin's
// password is set out-of-band via the forgot-password flow (no plaintext seed).
export async function seedAdminAndClaim(): Promise<void> {
  try {
    let admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!admin) {
      admin = await prisma.user.create({
        data: { email: ADMIN_EMAIL, name: ADMIN_NAME, role: 'ADMIN', emailVerified: true },
      });
      console.log(`[Auth] Seeded admin user ${ADMIN_EMAIL}. Use "forgot password" to set its password.`);
    }
    await ensureUserWorkspace(admin.id);

    const id = admin.id;
    const [domains, leads, campaigns, templates, senders, mailboxes, settings, tasks] = await Promise.all([
      prisma.domain.updateMany({ where: { userId: null }, data: { userId: id } }),
      prisma.lead.updateMany({ where: { ownerId: null }, data: { ownerId: id } }),
      prisma.campaign.updateMany({ where: { userId: null }, data: { userId: id } }),
      prisma.template.updateMany({ where: { userId: null }, data: { userId: id } }),
      prisma.senderAccount.updateMany({ where: { userId: null }, data: { userId: id } }),
      prisma.mailbox.updateMany({ where: { userId: null }, data: { userId: id } }),
      prisma.setting.updateMany({ where: { userId: null }, data: { userId: id } }),
      prisma.searchTask.updateMany({ where: { userId: null }, data: { userId: id } }),
    ]);
    const claimed =
      domains.count + leads.count + campaigns.count + templates.count + senders.count + mailboxes.count + settings.count + tasks.count;
    if (claimed > 0) {
      console.log(`[Auth] Claimed ${claimed} pre-existing record(s) for admin ${ADMIN_EMAIL}.`);
    }
  } catch (err) {
    console.error('[Auth] seedAdminAndClaim failed:', err);
  }
}
