// Platform-admin API. Every route requires a valid session AND membership in the
// ADMIN_EMAILS allowlist (requireAdmin). Powers the /admin panel: user management
// (list/suspend/plan/delete/export), revenue rollups, honest system health, and
// support-ticket triage. All data is real — nothing here is mocked.
import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import axios from 'axios';
import prisma from '../config/db.js';
import { requireAuth, requireAdmin, isAdminEmail } from '../middleware/auth.js';
import { revokeAllSessions } from '../services/auth.js';
import { sendTicketReplyEmail } from '../services/mailer.js';
import { PLANS, planFor, isTier, type Tier } from '../config/plans.js';
import { redisConnection } from '../queues/queues.js';

const router = Router();
router.use(requireAuth, requireAdmin);

function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const PLAN_STATUSES = ['trialing', 'active', 'past_due', 'canceled', 'expired'];

function priceForUser(plan: string, planStatus: string): number {
  if (planStatus !== 'active') return 0;
  return isTier(plan) ? planFor(plan).priceUSD : 0;
}

// ---- Users --------------------------------------------------------------
async function queryUsers(search: string, plan: string) {
  const where: any = {};
  if (plan && plan !== 'ALL') where.plan = plan.toLowerCase();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }
  const rows = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { searchTasks: true, campaigns: true } } },
  });
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    plan: u.plan,
    planStatus: u.planStatus,
    isActive: u.isActive,
    isAdmin: isAdminEmail(u.email),
    searches: u._count.searchTasks,
    campaigns: u._count.campaigns,
    revenue: priceForUser(u.plan, u.planStatus),
    lastSeenAt: u.lastSeenAt,
    createdAt: u.createdAt,
  }));
}

router.get('/users', wrap(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const plan = String(req.query.plan || 'ALL');
  res.json({ users: await queryUsers(search, plan) });
}));

router.get('/users/export.csv', wrap(async (req, res) => {
  const users = await queryUsers(String(req.query.search || '').trim(), String(req.query.plan || 'ALL'));
  const header = ['Name', 'Email', 'Plan', 'Status', 'Active', 'Searches', 'Campaigns', 'Revenue', 'Last Seen', 'Joined'];
  // Neutralise CSV formula injection: user-controlled fields (name/email) that
  // begin with = + - @ | are prefixed with ' so Excel/Sheets treat them as text.
  const esc = (v: unknown) => {
    let s = String(v ?? '');
    if (/^[=+\-@|]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = users.map((u) =>
    [u.name, u.email, u.plan, u.planStatus, u.isActive ? 'yes' : 'no', u.searches, u.campaigns, `$${u.revenue}`,
     u.lastSeenAt ? new Date(u.lastSeenAt).toISOString() : '', new Date(u.createdAt).toISOString()].map(esc).join(',')
  );
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
  res.send([header.map(esc).join(','), ...lines].join('\n'));
}));

router.patch('/users/:id/suspend', wrap(async (req, res) => {
  const active = !!req.body?.active;
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, email: true } });
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (!active && isAdminEmail(target.email)) return res.status(400).json({ error: 'Cannot suspend an admin account.' });
  await prisma.user.update({ where: { id: target.id }, data: { isActive: active } });
  if (!active) await revokeAllSessions(target.id); // kick existing sessions immediately
  res.json({ ok: true, isActive: active });
}));

router.patch('/users/:id/plan', wrap(async (req, res) => {
  const plan = String(req.body?.plan || '').toLowerCase();
  const planStatus = String(req.body?.planStatus || '').toLowerCase();
  if (!isTier(plan)) return res.status(400).json({ error: 'Invalid plan.' });
  if (!PLAN_STATUSES.includes(planStatus)) return res.status(400).json({ error: 'Invalid plan status.' });
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!target) return res.status(404).json({ error: 'User not found.' });
  const updated = await prisma.user.update({ where: { id: target.id }, data: { plan, planStatus } });
  res.json({ ok: true, plan: updated.plan, planStatus: updated.planStatus });
}));

router.delete('/users/:id', wrap(async (req, res) => {
  const confirmEmail = String(req.body?.confirmEmail || '').trim().toLowerCase();
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, email: true } });
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === req.userId) return res.status(400).json({ error: 'You cannot delete your own account here.' });
  if (isAdminEmail(target.email)) return res.status(400).json({ error: 'Cannot delete an admin account.' });
  if (confirmEmail !== target.email.toLowerCase()) {
    return res.status(400).json({ error: 'Confirmation email does not match.' });
  }
  await prisma.user.delete({ where: { id: target.id } }); // cascades remove owned rows
  res.json({ ok: true });
}));

// ---- Revenue ------------------------------------------------------------
router.get('/revenue', wrap(async (_req, res) => {
  const [activeSubs, recentSubs, trialCount, churnCount] = await Promise.all([
    prisma.subscription.findMany({ where: { status: 'active' }, include: { user: { select: { name: true, email: true } } } }),
    prisma.subscription.findMany({ orderBy: { updatedAt: 'desc' }, take: 10, include: { user: { select: { name: true, email: true } } } }),
    prisma.user.count({ where: { planStatus: 'trialing', trialEndsAt: { gt: new Date() } } }),
    prisma.user.count({ where: { planStatus: { in: ['canceled', 'expired'] } } }),
  ]);

  const priceOf = (tier: string) => (isTier(tier) ? planFor(tier).priceUSD : 0);
  const mrr = activeSubs.reduce((sum, s) => sum + priceOf(s.planTier), 0);

  const byPlanMap: Record<string, { plan: string; users: number; revenue: number }> = {};
  for (const s of activeSubs) {
    const key = s.planTier;
    byPlanMap[key] ??= { plan: key, users: 0, revenue: 0 };
    byPlanMap[key].users += 1;
    byPlanMap[key].revenue += priceOf(key);
  }

  res.json({
    mrr,
    arr: mrr * 12,
    arpu: activeSubs.length ? Math.round((mrr / activeSubs.length) * 100) / 100 : 0,
    activeUsers: activeSubs.length,
    trialUsers: trialCount,
    churned: churnCount,
    byPlan: Object.values(byPlanMap),
    transactions: recentSubs.map((s) => ({
      user: s.user?.name || s.user?.email || '—',
      plan: s.planTier,
      amount: priceOf(s.planTier),
      provider: s.provider,
      date: s.updatedAt,
      status: s.status,
    })),
  });
}));

// ---- System health (real signals only) ----------------------------------
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

router.get('/system', wrap(async (_req, res) => {
  const services: { name: string; status: 'UP' | 'DEGRADED' | 'DOWN'; detail: string }[] = [];

  // Database
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 3000);
    services.push({ name: 'Database (Primary)', status: 'UP', detail: 'reachable' });
  } catch {
    services.push({ name: 'Database (Primary)', status: 'DOWN', detail: 'unreachable' });
  }

  // Redis (BullMQ) — falls back to in-process tick when down, hence DEGRADED not DOWN.
  try {
    await withTimeout(redisConnection.ping(), 2500);
    services.push({ name: 'Redis / Queue', status: 'UP', detail: 'reachable' });
  } catch {
    services.push({ name: 'Redis / Queue', status: 'DEGRADED', detail: 'unreachable — using in-process fallback' });
  }

  // Crawler service
  const crawlerBase = process.env.CRAWLER_BASE_URL;
  if (!crawlerBase) {
    services.push({ name: 'Crawler Service', status: 'DEGRADED', detail: 'CRAWLER_BASE_URL not set' });
  } else {
    try {
      await withTimeout(axios.get(`${crawlerBase.replace(/\/+$/, '')}/health`, { timeout: 3000 }), 3500);
      services.push({ name: 'Crawler Service', status: 'UP', detail: 'reachable' });
    } catch {
      services.push({ name: 'Crawler Service', status: 'DOWN', detail: 'health check failed' });
    }
  }

  // Task pipeline health from real SearchTask statuses
  const taskGroups = await prisma.searchTask.groupBy({ by: ['status'], _count: true });
  const taskStatus = Object.fromEntries(taskGroups.map((g) => [g.status, g._count]));
  const stuckTasks = await prisma.searchTask.count({
    where: { status: { in: ['PENDING', 'PROCESSING'] }, createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
  });

  // Sender deliverability signals
  const senderAgg = await prisma.senderAccount.aggregate({ _avg: { bounceRate: true, spamComplaintRate: true }, _count: true });

  // Recent send errors (global — admin view)
  const errors = await prisma.emailLog.findMany({
    where: { errorMessage: { not: null } },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: { updatedAt: true, provider: true, toEmail: true, errorMessage: true, status: true },
  });

  res.json({
    services,
    healthy: services.filter((s) => s.status === 'UP').length,
    total: services.length,
    tasks: { byStatus: taskStatus, stuck: stuckTasks },
    deliverability: {
      senders: senderAgg._count,
      avgBounceRate: Math.round((senderAgg._avg.bounceRate || 0) * 1000) / 10,
      avgSpamRate: Math.round((senderAgg._avg.spamComplaintRate || 0) * 1000) / 10,
    },
    recentErrors: errors.map((e) => ({
      time: e.updatedAt,
      svc: e.provider || 'send',
      msg: `${e.status}: ${e.errorMessage}`.slice(0, 200),
      to: e.toEmail,
    })),
  });
}));

// ---- Support tickets (admin triage) -------------------------------------
router.get('/tickets', wrap(async (req, res) => {
  const status = String(req.query.status || '').toUpperCase();
  const where = status && status !== 'ALL' ? { status } : {};
  const tickets = await prisma.supportTicket.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: { select: { name: true, email: true } }, _count: { select: { messages: true } } },
  });
  res.json({
    tickets: tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      body: t.body,
      type: t.type,
      priority: t.priority,
      status: t.status,
      assignedTo: t.assignedTo,
      user: t.user?.email || t.guestEmail || '—',
      userName: t.user?.name || t.guestName || null,
      isGuest: !t.userId,
      messageCount: t._count.messages,
      createdAt: t.createdAt,
    })),
  });
}));

router.get('/tickets/:id', wrap(async (req, res) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { name: true, email: true } }, messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  res.json({
    id: ticket.id,
    subject: ticket.subject,
    type: ticket.type,
    priority: ticket.priority,
    status: ticket.status,
    assignedTo: ticket.assignedTo,
    user: ticket.user?.email || ticket.guestEmail || '—',
    userName: ticket.user?.name || ticket.guestName || null,
    isGuest: !ticket.userId,
    createdAt: ticket.createdAt,
    messages: ticket.messages,
  });
}));

router.patch('/tickets/:id', wrap(async (req, res) => {
  const data: any = {};
  const status = req.body?.status ? String(req.body.status).toUpperCase() : null;
  const priority = req.body?.priority ? String(req.body.priority).toUpperCase() : null;
  if (status && ['OPEN', 'IN_PROGRESS', 'DONE', 'BACKLOG'].includes(status)) data.status = status;
  if (priority && ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority)) data.priority = priority;
  if (typeof req.body?.assignedTo === 'string') data.assignedTo = req.body.assignedTo.trim() || null;
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update.' });
  const updated = await prisma.supportTicket.update({ where: { id: req.params.id }, data }).catch(() => null);
  if (!updated) return res.status(404).json({ error: 'Ticket not found.' });
  res.json({ ok: true, status: updated.status, priority: updated.priority, assignedTo: updated.assignedTo });
}));

router.post('/tickets/:id/reply', wrap(async (req, res) => {
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'A reply message is required.' });
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { email: true } } },
  });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  const message = await prisma.supportMessage.create({
    data: { ticketId: ticket.id, sender: 'ADMIN', body: body.slice(0, 5000) },
  });
  if (ticket.status === 'OPEN') {
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'IN_PROGRESS' } });
  }

  const recipient = ticket.user?.email || ticket.guestEmail;
  if (recipient) {
    sendTicketReplyEmail(recipient, ticket.subject, body).catch(() => {});
  }
  res.status(201).json({ ok: true, message });
}));

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Admin API] Error:', err);
  res.status(500).json({ error: 'Admin request failed.' });
});

export default router;
