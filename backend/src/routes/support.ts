// User-facing support: authenticated users submit a ticket (bug / feature /
// support), read their own tickets/threads, and escalate a chat-bubble FAQ
// conversation into a ticket. Admin read/triage/reply lives in admin.ts.
import { Router, type RequestHandler } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

const TYPES = ['BUG', 'FEATURE', 'SUPPORT'];

function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

router.use(requireAuth);

router.post('/tickets', rateLimit('support-create', 10, 60 * 60 * 1000), wrap(async (req, res) => {
  const subject = String(req.body?.subject || '').trim();
  const body = String(req.body?.body || '').trim();
  const type = String(req.body?.type || 'SUPPORT').toUpperCase();
  if (!subject) return res.status(400).json({ error: 'A subject is required.' });
  if (!body) return res.status(400).json({ error: 'A message is required.' });

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: req.userId!,
      subject: subject.slice(0, 200),
      body: body.slice(0, 5000),
      type: TYPES.includes(type) ? type : 'SUPPORT',
      messages: { create: { sender: 'USER', body: body.slice(0, 5000) } },
    },
  });
  res.status(201).json({ ok: true, id: ticket.id });
}));

router.get('/tickets', wrap(async (req, res) => {
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  res.json({
    tickets: tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      lastMessage: t.messages[0]?.body || t.body,
      lastSender: t.messages[0]?.sender || 'USER',
    })),
  });
}));

router.get('/tickets/:id/messages', wrap(async (req, res) => {
  const ticket = await prisma.supportTicket.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  const messages = await prisma.supportMessage.findMany({
    where: { ticketId: ticket.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ status: ticket.status, messages });
}));

router.post('/tickets/:id/messages', rateLimit('support-reply', 30, 60 * 60 * 1000), wrap(async (req, res) => {
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'A message is required.' });
  const ticket = await prisma.supportTicket.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  const message = await prisma.supportMessage.create({
    data: { ticketId: ticket.id, sender: 'USER', body: body.slice(0, 5000) },
  });
  // A follow-up from the user re-opens a ticket the team had marked done.
  if (ticket.status === 'DONE') {
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'OPEN' } });
  }
  res.status(201).json({ ok: true, message });
}));

router.post('/escalate', rateLimit('support-escalate', 10, 60 * 60 * 1000), wrap(async (req, res) => {
  const topic = String(req.body?.topic || 'Chat bubble escalation').trim().slice(0, 200);
  const transcript = Array.isArray(req.body?.transcript) ? req.body.transcript : [];

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: req.userId!,
      subject: topic,
      body: transcript.find((m: any) => m?.from === 'user')?.text || topic,
      type: 'SUPPORT',
      messages: {
        create: transcript
          .filter((m: any) => m && typeof m.text === 'string' && m.text.trim())
          .slice(-50)
          .map((m: any) => ({ sender: m.from === 'bot' ? 'BOT' : 'USER', body: String(m.text).slice(0, 5000) })),
      },
    },
  });
  res.status(201).json({ ok: true, ticketId: ticket.id });
}));

export default router;
