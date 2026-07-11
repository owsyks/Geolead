import { createHmac, timingSafeEqual, verify } from 'node:crypto';
import type { Request } from 'express';

function safeEqualHex(actual: string, expected: string): boolean {
  const a = Buffer.from(actual.replace(/^sha256=/i, ''), 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function freshTimestamp(value: string, toleranceSeconds = 300): boolean {
  const seconds = Number(value);
  return Number.isFinite(seconds) && Math.abs(Date.now() / 1000 - seconds) <= toleranceSeconds;
}

export function verifyResendWebhook(req: Request, secret: string): { valid: boolean; eventId?: string } {
  const id = req.get('svix-id') || '';
  const timestamp = req.get('svix-timestamp') || '';
  const signatures = (req.get('svix-signature') || '').split(' ').map((part) => part.replace(/^v1,/, ''));
  if (!id || !freshTimestamp(timestamp) || !Buffer.isBuffer((req as any).rawBody)) return { valid: false };
  try {
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const signed = `${id}.${timestamp}.${((req as any).rawBody as Buffer).toString('utf8')}`;
    const expected = Buffer.from(createHmac('sha256', key).update(signed).digest('base64'));
    const valid = signatures.some((signature) => {
      const candidate = Buffer.from(signature);
      return candidate.length === expected.length && timingSafeEqual(candidate, expected);
    });
    return { valid, eventId: valid ? id : undefined };
  } catch { return { valid: false }; }
}

export function verifyProviderWebhook(req: Request, provider: string): { valid: boolean; eventId?: string } {
  const normalized = provider.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  if (normalized === 'RESEND') {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    return secret ? verifyResendWebhook(req, secret) : { valid: false };
  }
  if (normalized === 'MAILGUN') {
    const secret = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
    const signature = String(req.body?.signature?.signature || '');
    const timestamp = String(req.body?.signature?.timestamp || '');
    const token = String(req.body?.signature?.token || '');
    if (!secret || !freshTimestamp(timestamp) || !token || !signature) return { valid: false };
    const expected = createHmac('sha256', secret).update(`${timestamp}${token}`).digest('hex');
    return { valid: safeEqualHex(signature, expected), eventId: token };
  }
  if (normalized === 'SENDGRID') {
    const publicKey = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY;
    const signature = req.get('x-twilio-email-event-webhook-signature') || '';
    const timestamp = req.get('x-twilio-email-event-webhook-timestamp') || '';
    if (!publicKey || !signature || !freshTimestamp(timestamp) || !Buffer.isBuffer((req as any).rawBody)) return { valid: false };
    try {
      const signedPayload = Buffer.concat([Buffer.from(timestamp), (req as any).rawBody as Buffer]);
      const valid = verify('sha256', signedPayload, publicKey.replace(/\\n/g, '\n'), Buffer.from(signature, 'base64'));
      const body = req.body as Array<Record<string, unknown>> | Record<string, unknown>;
      const first = Array.isArray(body) ? body[0] : body;
      const eventId = String(first?.sg_event_id || '');
      return { valid: valid && !!eventId, eventId: valid ? eventId : undefined };
    } catch { return { valid: false }; }
  }
  const secret = process.env[`${normalized}_WEBHOOK_SECRET`];
  const signature = req.get('x-webhook-signature') || '';
  const eventId = req.get('x-webhook-id') || '';
  const timestamp = req.get('x-webhook-timestamp') || '';
  if (!secret || !eventId || !freshTimestamp(timestamp) || !Buffer.isBuffer((req as any).rawBody)) return { valid: false };
  const expected = createHmac('sha256', secret).update(`${timestamp}.${eventId}.${((req as any).rawBody as Buffer).toString('utf8')}`).digest('hex');
  return { valid: safeEqualHex(signature, expected), eventId };
}
