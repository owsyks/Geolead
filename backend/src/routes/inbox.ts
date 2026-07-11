import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Router } from 'express';
import prisma from '../config/db.js';
import { encryptSecret, decryptSecret, isEncrypted } from '../config/secrets.js';
import { getMailbox, syncMailbox, testImapConnection } from '../services/inboxSync.js';
import { REPLY_CATEGORIES } from '../services/replyAnalysis.js';
import { requireAuth } from '../middleware/auth.js';
import { assertSafeNetworkTarget } from '../services/ssrfGuard.js';

const router = Router();

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// The inbox is per-user.
router.use(requireAuth);

// A reply belongs to a user if it's in their mailbox, tied to their campaign,
// or matched to a lead they own.
const ownershipWhere = (userId: string) => ({
  OR: [{ mailbox: { userId } }, { campaign: { userId } }, { lead: { ownerId: userId } }],
});

// ---- Mailbox configuration ---------------------------------------------

router.get('/mailbox', wrap(async (req, res) => {
  const mailbox = await getMailbox(req.userId!);
  res.json({ mailbox: mailbox ? redactMailbox(mailbox) : null, categories: REPLY_CATEGORIES });
}));

router.patch('/mailbox', wrap(async (req, res) => {
  const existing = await getMailbox(req.userId!);
  const email = asString(req.body.email) || existing?.email;
  if (!email) return res.status(400).json({ error: 'email is required.' });

  const data: any = {
    userId: req.userId!,
    email,
    label: asString(req.body.label) || existing?.label || 'Gmail',
    imapHost: asString(req.body.imapHost) || existing?.imapHost || 'imap.gmail.com',
    imapPort: asNumber(req.body.imapPort) ?? existing?.imapPort ?? 993,
    useSsl: req.body.useSsl === undefined ? (existing?.useSsl ?? true) : Boolean(req.body.useSsl),
    username: asString(req.body.username) || existing?.username || email,
    enabled: req.body.enabled === undefined ? (existing?.enabled ?? false) : Boolean(req.body.enabled),
    syncIntervalSec: asNumber(req.body.syncIntervalSec) ?? existing?.syncIntervalSec ?? 60,
  };
  if (process.env.NODE_ENV === 'production' && !data.useSsl) return res.status(400).json({ error: 'TLS is required for IMAP in production.' });
  await assertSafeNetworkTarget(data.imapHost, data.imapPort, data.useSsl ? [993] : [143]);

  // Only overwrite the app password when a new one is supplied.
  const newPassword = asString(req.body.appPassword);
  if (newPassword) data.appPassword = encryptSecret(newPassword.replace(/\s+/g, ''));

  let mailbox;
  if (existing) {
    mailbox = await prisma.mailbox.update({ where: { id: existing.id }, data });
  } else {
    if (!data.appPassword) return res.status(400).json({ error: 'appPassword is required for a new mailbox.' });
    mailbox = await prisma.mailbox.create({ data });
  }
  res.json({ mailbox: redactMailbox(mailbox) });
}));

router.post('/mailbox/test', wrap(async (req, res) => {
  const existing = await getMailbox(req.userId!);
  const password = asString(req.body.appPassword)
    ? asString(req.body.appPassword).replace(/\s+/g, '')
    : existing && isEncrypted(existing.appPassword)
      ? decryptSecret(existing.appPassword)
      : existing?.appPassword || '';
  if (!password) return res.status(400).json({ error: 'No app password available to test.' });
  const imapHost = asString(req.body.imapHost) || existing?.imapHost || 'imap.gmail.com';
  const imapPort = asNumber(req.body.imapPort) ?? existing?.imapPort ?? 993;
  const useSsl = req.body.useSsl === undefined ? (existing?.useSsl ?? true) : Boolean(req.body.useSsl);
  if (process.env.NODE_ENV === 'production' && !useSsl) return res.status(400).json({ error: 'TLS is required for IMAP in production.' });
  await assertSafeNetworkTarget(imapHost, imapPort, useSsl ? [993] : [143]);

  const result = await testImapConnection({
    imapHost,
    imapPort,
    useSsl,
    username: asString(req.body.username) || existing?.username || asString(req.body.email) || existing?.email || '',
    password,
  });
  res.status(result.ok ? 200 : 400).json(result);
}));

router.delete('/mailbox', wrap(async (req, res) => {
  const existing = await getMailbox(req.userId!);
  if (existing) await prisma.mailbox.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

// ---- Sync ---------------------------------------------------------------

router.post('/sync', wrap(async (req, res) => {
  const mailbox = await getMailbox(req.userId!);
  if (!mailbox) return res.status(400).json({ ok: false, error: 'No mailbox configured.' });
  const result = await syncMailbox(mailbox.id, true);
  res.status(result.ok ? 200 : 400).json(result);
}));

// ---- Unified inbox listing with filters --------------------------------

router.get('/', wrap(async (req, res) => {
  const filter = asString(req.query.filter); // unread | interested | not_interested | negotiating | sold | archived | all
  const search = asString(req.query.search);
  const where: any = { AND: [ownershipWhere(req.userId!)] };

  switch (filter) {
    case 'unread': where.isRead = false; break;
    case 'interested': where.aiCategory = { in: ['Interested', 'Maybe Interested'] }; break;
    case 'negotiating': where.aiCategory = 'Negotiating'; break;
    case 'not_interested': where.aiCategory = { in: ['Not Interested', 'Unsubscribe'] }; break;
    case 'archived': where.status = 'ARCHIVED'; break;
    case 'sold': where.campaign = { domain: { status: 'Sold' } }; break;
    default: break;
  }
  if (search) {
    where.OR = [
      { fromEmail: { contains: search, mode: 'insensitive' } },
      { subject: { contains: search, mode: 'insensitive' } },
      { body: { contains: search, mode: 'insensitive' } },
      { lead: { businessName: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const replies = await prisma.reply.findMany({
    where,
    orderBy: { receivedAt: 'desc' },
    take: 100,
    include: {
      lead: { select: { id: true, businessName: true, website: true, pipelineStage: true } },
      campaign: { select: { id: true, name: true, geoDomain: true, niche: true, domainId: true } },
    },
  });

  const [unreadCount, counts] = await Promise.all([
    prisma.reply.count({ where: { isRead: false, ...ownershipWhere(req.userId!) } }),
    prisma.reply.groupBy({ by: ['aiCategory'], _count: { aiCategory: true }, where: ownershipWhere(req.userId!) }),
  ]);

  res.json({
    replies: replies.map((r) => ({
      id: r.id,
      fromEmail: r.fromEmail,
      subject: r.subject,
      body: r.body,
      receivedAt: r.receivedAt,
      isRead: r.isRead,
      status: r.status,
      direction: r.direction,
      source: r.source,
      aiCategory: r.aiCategory,
      aiSummary: r.aiSummary,
      sentiment: r.sentiment,
      intentScore: r.intentScore,
      buyingIntent: r.buyingIntent,
      matchConfidence: r.matchConfidence,
      matchMethod: r.matchMethod,
      suggestedResponse: r.suggestedResponse,
      tags: r.tags,
      lead: r.lead,
      campaign: r.campaign,
    })),
    unreadCount,
    categoryCounts: Object.fromEntries(counts.map((c) => [c.aiCategory || 'Uncategorized', c._count.aiCategory])),
  });
}));

router.post('/:id/read', wrap(async (req, res) => {
  const owned = await prisma.reply.findFirst({ where: { id: req.params.id, ...ownershipWhere(req.userId!) }, select: { id: true } });
  if (!owned) return res.status(404).json({ error: 'Reply not found.' });
  const reply = await prisma.reply.update({ where: { id: req.params.id }, data: { isRead: true } });
  res.json({ id: reply.id, isRead: reply.isRead });
}));

router.get('/history/:leadId', wrap(async (req, res) => {
  // Only expose history for leads the user owns.
  const lead = await prisma.lead.findFirst({ where: { id: req.params.leadId, ownerId: req.userId! }, select: { id: true } });
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });
  const history = await prisma.leadStatusHistory.findMany({
    where: { leadId: req.params.leadId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(history);
}));

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Inbox API] Error:', err);
  res.status(500).json({ error: (err as any)?.message || 'Inbox request failed.' });
});

export default router;

function redactMailbox(mailbox: any) {
  return {
    id: mailbox.id,
    label: mailbox.label,
    email: mailbox.email,
    imapHost: mailbox.imapHost,
    imapPort: mailbox.imapPort,
    useSsl: mailbox.useSsl,
    username: mailbox.username,
    enabled: mailbox.enabled,
    syncIntervalSec: mailbox.syncIntervalSec,
    hasPassword: !!mailbox.appPassword,
    lastSyncAt: mailbox.lastSyncAt,
    lastSyncStatus: mailbox.lastSyncStatus,
    lastSyncError: mailbox.lastSyncError,
    totalImported: mailbox.totalImported,
  };
}

function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
