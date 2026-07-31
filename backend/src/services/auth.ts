// Core authentication service: password hashing, JWT access tokens, DB-backed
// refresh sessions, and hashed single-use tokens for email verification and
// password reset. Also owns the one-time admin seed + claim of pre-existing
// (single-user era) data so the live workspace isn't orphaned by multi-tenancy.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hash as bcryptHash, compare as bcryptCompare } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TTL_DAYS_DEFAULT = 7;
const REFRESH_TTL_DAYS_REMEMBER = 30;
const RESET_TTL_MIN = 60;
const VERIFY_TTL_HOURS = 48;
const BCRYPT_ROUNDS = 12;
const JWT_ISSUER = 'geolead-api';
const JWT_AUDIENCE = 'geolead-web';
const WS_TICKET_TTL_MS = 30_000;
const wsTickets = new Map<string, { userId: string; expiresAt: number }>();

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET must be set. Server cannot start.');
  }
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters in production.');
  }
  return secret;
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
  if (password.length > 128) return 'Password must be 128 characters or fewer.';
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
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    return jwt.verify(token, jwtSecret(), {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as AccessTokenPayload;
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
  opts: { remember?: boolean; userAgent?: string; ip?: string; familyId?: string } = {}
): Promise<IssuedRefresh> {
  const token = randomBytes(32).toString('hex');
  const days = opts.remember ? REFRESH_TTL_DAYS_REMEMBER : REFRESH_TTL_DAYS_DEFAULT;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      familyId: opts.familyId || randomUUID(),
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
  if (!rawToken || rawToken.length > 256) return null;
  const now = new Date();
  const nextToken = randomBytes(32).toString('hex');
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: true },
    });
    if (!session || session.expiresAt < now || !session.user.isActive) return null;

    // A revoked token being presented again is refresh-token replay. Revoke the
    // complete family so a stolen predecessor cannot race a legitimate client.
    if (session.revokedAt) {
      await tx.session.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: now } });
      return null;
    }
    const claimed = await tx.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: now } });
    if (claimed.count !== 1) {
      await tx.session.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: now } });
      return null;
    }
    const rememberedFamily = session.expiresAt.getTime() - session.createdAt.getTime() > 8 * 24 * 60 * 60 * 1000;
    const days = (opts.remember ?? rememberedFamily) ? REFRESH_TTL_DAYS_REMEMBER : REFRESH_TTL_DAYS_DEFAULT;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await tx.session.create({
      data: {
        userId: session.userId,
        tokenHash: sha256(nextToken),
        familyId: session.familyId,
        userAgent: opts.userAgent?.slice(0, 300) ?? null,
        ip: opts.ip ?? null,
        expiresAt,
      },
    });
    return { userId: session.userId, email: session.user.email, refresh: { token: nextToken, expiresAt } };
  });
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
  const consumed = await prisma.verificationToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (consumed.count !== 1) return null;
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
  const consumed = await prisma.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (consumed.count !== 1) return null;
  return row.userId;
}

export function issueWebSocketTicket(userId: string): string {
  const ticket = randomBytes(32).toString('base64url');
  const now = Date.now();
  for (const [key, value] of wsTickets) if (value.expiresAt <= now) wsTickets.delete(key);
  wsTickets.set(sha256(ticket), { userId, expiresAt: now + WS_TICKET_TTL_MS });
  return ticket;
}

export function consumeWebSocketTicket(ticket: string): string | null {
  if (!ticket || ticket.length > 128) return null;
  const key = sha256(ticket);
  const stored = wsTickets.get(key);
  wsTickets.delete(key);
  if (!stored || stored.expiresAt <= Date.now()) return null;
  return stored.userId;
}

// ---- Default workspace bootstrap ---------------------------------------

// Ensure a user has the per-user singletons (settings + notification prefs).
export async function ensureUserWorkspace(userId: string): Promise<void> {
  await prisma.userSettings.upsert({ where: { userId }, update: {}, create: { userId } });
  await prisma.notificationPreference.upsert({ where: { userId }, update: {}, create: { userId } });
}

// ---- Admin seed + claim of pre-existing data ---------------------------

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL || '').toLowerCase();
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Admin';

// Idempotent. Runs at boot. Creates the admin user if missing and assigns every
// orphaned (userId/ownerId NULL) row from the single-user era to that admin so
// the live workspace remains intact once data becomes per-user. The admin's
// password is set out-of-band via the forgot-password flow (no plaintext seed).
export async function seedAdminAndClaim(): Promise<void> {
  if (!ADMIN_EMAIL) {
    console.warn('[Auth] SEED_ADMIN_EMAIL not set — skipping admin seed.');
    return;
  }
  try {
    let admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!admin) {
      admin = await prisma.user.create({
        data: { email: ADMIN_EMAIL, name: ADMIN_NAME, role: 'ADMIN', emailVerified: true, plan: 'enterprise', planStatus: 'active' },
      });
      console.log(`[Auth] Seeded admin user ${ADMIN_EMAIL}. Use "forgot password" to set its password.`);
    } else {
      admin = await prisma.user.update({
        where: { id: admin.id },
        data: { plan: 'enterprise', planStatus: 'active', trialEndsAt: null, role: 'ADMIN', emailVerified: true, isActive: true },
      });
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
