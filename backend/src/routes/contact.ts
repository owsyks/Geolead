// Public "Contact us" endpoint — no auth. Submissions become a SupportTicket
// (type CONTACT, no userId) so they show up in the same admin Tickets tab as
// in-app support requests.
import { Router } from 'express';
import prisma from '../config/db.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { sendContactNotification } from '../services/mailer.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/', rateLimit('contact', 5, 60 * 60 * 1000), async (req, res) => {
  // Honeypot: real users never fill this hidden field in.
  if (String(req.body?.hp || '').trim()) {
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

export default router;
