// User-facing support: authenticated users submit a ticket (bug / feature /
// support). These surface in the admin Tickets tab. Read/triage lives in admin.ts.
import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

const TYPES = ['BUG', 'FEATURE', 'SUPPORT'];

router.post('/tickets', requireAuth, rateLimit('support-create', 10, 60 * 60 * 1000), async (req, res) => {
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
    },
  });
  res.status(201).json({ ok: true, id: ticket.id });
});

export default router;
