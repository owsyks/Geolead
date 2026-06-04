import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listWatchlist,
  addToWatchlist,
  updateWatched,
  removeFromWatchlist,
  addReminder,
  deleteReminder,
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  checkDomainNow,
  moveToPortfolio,
  type AddToWatchlistInput,
  type WatchPriority,
  type WatchStatus,
} from '../services/watchlistService.js';

const router = Router();
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.use(requireAuth);

// ─── Watchlist CRUD ───────────────────────────────────────────────────────────

router.get('/', wrap(async (req, res) => {
  res.json(await listWatchlist(req.userId!));
}));

router.post('/', wrap(async (req, res) => {
  const domainName = asString(req.body.domainName);
  if (!domainName) return res.status(400).json({ error: 'domainName is required.' });
  const input: AddToWatchlistInput = {
    domainName,
    priority: (asString(req.body.priority) || undefined) as WatchPriority | undefined,
    notes: asString(req.body.notes) || undefined,
    addedFrom: asString(req.body.addedFrom) || undefined,
    brandScore: asNumber(req.body.brandScore) ?? undefined,
    marketScore: asNumber(req.body.marketScore) ?? undefined,
    acquisitionScore: asNumber(req.body.acquisitionScore) ?? undefined,
    estimatedValue: asNumber(req.body.estimatedValue) ?? undefined,
    aiRecommendation: (asString(req.body.aiRecommendation) || undefined) as any,
    aiReasoning: asString(req.body.aiReasoning) || undefined,
  };
  res.status(201).json(await addToWatchlist(req.userId!, input));
}));

router.patch('/:id', wrap(async (req, res) => {
  const changes: any = {};
  if (req.body.priority !== undefined) changes.priority = asString(req.body.priority);
  if (req.body.status !== undefined) changes.status = asString(req.body.status);
  if (req.body.notes !== undefined) changes.notes = asString(req.body.notes) || null;
  if (req.body.isFavorite !== undefined) changes.isFavorite = Boolean(req.body.isFavorite);
  res.json(await updateWatched(req.params.id, req.userId!, changes));
}));

router.delete('/:id', wrap(async (req, res) => {
  res.json(await removeFromWatchlist(req.params.id, req.userId!));
}));

// ─── Actions ──────────────────────────────────────────────────────────────────

router.post('/:id/check', wrap(async (req, res) => {
  res.json(await checkDomainNow(req.params.id, req.userId!));
}));

router.post('/:id/move-to-portfolio', wrap(async (req, res) => {
  res.json(await moveToPortfolio(req.params.id, req.userId!));
}));

// ─── Reminders ────────────────────────────────────────────────────────────────

router.post('/:id/reminders', wrap(async (req, res) => {
  const type = asString(req.body.type) as 'DAYS' | 'STATUS_CHANGE' | 'AVAILABLE';
  if (!type) return res.status(400).json({ error: 'type is required.' });
  res.status(201).json(await addReminder(req.params.id, req.userId!, {
    type,
    label: asString(req.body.label) || undefined,
    daysFromNow: asNumber(req.body.daysFromNow) ?? undefined,
    notifyVia: (asString(req.body.notifyVia) || 'IN_APP') as any,
  }));
}));

router.delete('/:id/reminders/:reminderId', wrap(async (req, res) => {
  res.json(await deleteReminder(req.params.reminderId, req.userId!));
}));

// ─── Notifications ────────────────────────────────────────────────────────────

router.get('/notifications', wrap(async (req, res) => {
  res.json(await getNotifications(req.userId!));
}));

router.get('/notifications/unread-count', wrap(async (req, res) => {
  res.json({ count: await getUnreadCount(req.userId!) });
}));

router.post('/notifications/:id/read', wrap(async (req, res) => {
  await markRead(req.params.id, req.userId!);
  res.json({ ok: true });
}));

router.post('/notifications/mark-all-read', wrap(async (req, res) => {
  await markAllRead(req.userId!);
  res.json({ ok: true });
}));

// ─── Error handler ────────────────────────────────────────────────────────────

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Watchlist API]', err);
  res.status(500).json({ error: (err as any)?.message || 'Request failed.' });
});

export default router;

function wrap(h: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(h(req, res, next)).catch(next);
}
function asString(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return '';
}
function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
