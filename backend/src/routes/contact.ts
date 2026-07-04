// Public, unauthenticated support surface: the Contact page form (POST /) and
// the marketing-site chat bubble's guest flow (POST /start + the /tickets/:id
// thread endpoints below). Both land in the same SupportTicket system the
// authenticated /api/support routes use, just with userId: null + guestName/
// guestEmail instead of an account. Every /tickets/:id lookup here is scoped
// to `userId: null` so a guest can never read or post into a real user's
// authenticated ticket even if they guessed its id.
import { Router } from 'express';
import prisma from '../config/db.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { sendContactNotification } from '../services/mailer.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/', rateLimit('contact', 5, 60 * 60 * 1000), async (req, res) => {
  // Honeypot: a hidden checkbox real users never toggle. A plain hidden text
  // input here used to get false-positived by browser/OS contact-info
  // autofill (e.g. Safari), which silently dropped real submissions. Still
  // also catch a bot that blindly stuffs a string into any "hp"-named field
  // it finds (the old convention), just not a bare boolean false/absent.
  const hp = req.body?.hp;
  if (hp === true || (typeof hp === 'string' && hp.trim())) {
    return res.status(200).json({ ok: true });
  }

  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim();
  const company = String(req.body?.company || '').trim();
  const subject = String(req.body?.subject || 'General').trim();
  const message = String(req.body?.message || '').trim();

  if (!name) return res.status(400).json({ error: 'Your name is required.' });
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (!message) return res.status(400).json({ error: 'A message is required.' });

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: null,
      guestName: name.slice(0, 200),
      guestEmail: email.slice(0, 320),
      subject: `[Contact] ${subject}`.slice(0, 200),
      body: message.slice(0, 5000),
      type: 'CONTACT',
      messages: { create: { sender: 'USER', body: message.slice(0, 5000) } },
    },
  });

  sendContactNotification({ name, email, company, subject, message }).catch(() => {});

  res.status(201).json({ ok: true, id: ticket.id });
});

// Chat bubble, anonymous visitor: first message escalated past the FAQ bot.
// Creates a guest ticket the same way the Contact form does, just sourced
// from the bubble instead of the form (type CHAT vs CONTACT) and returns the
// ticket id so the widget can keep polling/replying via the routes below.
router.post('/start', rateLimit('contact-chat-start', 8, 60 * 60 * 1000), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!name) return res.status(400).json({ error: 'Your name is required.' });
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (!message) return res.status(400).json({ error: 'A message is required.' });

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: null,
      guestName: name.slice(0, 200),
      guestEmail: email.slice(0, 320),
      subject: `Chat: ${message}`.slice(0, 200),
      body: message.slice(0, 5000),
      type: 'CHAT',
      messages: { create: { sender: 'USER', body: message.slice(0, 5000) } },
    },
  });

  sendContactNotification({ name, email, subject: 'Live chat', message }).catch(() => {});

  res.status(201).json({ ok: true, id: ticket.id });
});

// Poll a guest ticket's thread (bot/user/admin messages). Scoped to userId:
// null so this can never expose an authenticated user's ticket.
router.get('/tickets/:id/messages', rateLimit('contact-chat-poll', 120, 60 * 60 * 1000), async (req, res) => {
  const ticket = await prisma.supportTicket.findFirst({ where: { id: req.params.id, userId: null } });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  const messages = await prisma.supportMessage.findMany({
    where: { ticketId: ticket.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ status: ticket.status, messages });
});

// Guest follow-up message in an existing chat thread.
router.post('/tickets/:id/messages', rateLimit('contact-chat-reply', 30, 60 * 60 * 1000), async (req, res) => {
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'A message is required.' });
  const ticket = await prisma.supportTicket.findFirst({ where: { id: req.params.id, userId: null } });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  const message = await prisma.supportMessage.create({
    data: { ticketId: ticket.id, sender: 'USER', body: body.slice(0, 5000) },
  });
  if (ticket.status === 'DONE') {
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'OPEN' } });
  }
  res.status(201).json({ ok: true, message });
});

export default router;
