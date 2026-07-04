// Transactional email for auth flows (verification + password reset). Uses the
// PLATFORM's own Resend credentials from env — a brand-new registrant has no
// provider key of their own yet, so these must be system-level. If no Resend
// key is configured, links are logged to the console so local dev still works.
import axios from 'axios';

function frontendUrl(): string {
  return (process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000').replace(/\/+$/, '');
}

function systemFrom(): string {
  const email = process.env.RESEND_FROM_EMAIL || process.env.OUTBOUND_ADMIN_EMAIL || 'no-reply@geoleadai.local';
  const name = process.env.RESEND_FROM_NAME || 'GeoLead AI';
  return `${name} <${email}>`;
}

async function sendEmail(to: string, subject: string, html: string, textLink: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[Mailer] (no RESEND_API_KEY) ${subject} for ${to} -> ${textLink}`);
    return;
  }
  try {
    await axios.post(
      'https://api.resend.com/emails',
      { from: systemFrom(), to, subject, html },
      { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
  } catch (err: any) {
    // Never block the auth flow on email failure — log and continue.
    console.error(`[Mailer] Failed to send "${subject}" to ${to}:`, err?.response?.data || err?.message);
    console.log(`[Mailer] Fallback link for ${to}: ${textLink}`);
  }
}

function wrap(title: string, body: string, buttonLabel: string, link: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
    <h2 style="margin:0 0 12px">${title}</h2>
    <p style="margin:0 0 20px;line-height:1.5;color:#334155">${body}</p>
    <p style="margin:0 0 24px">
      <a href="${link}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">${buttonLabel}</a>
    </p>
    <p style="margin:0;font-size:12px;color:#94a3b8;word-break:break-all">If the button doesn't work, paste this link:<br/>${link}</p>
  </div>`;
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${frontendUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail(
    to,
    'Verify your GeoLead AI email',
    wrap('Verify your email', 'Confirm your email address to finish setting up your GeoLead AI account. This link expires in 48 hours.', 'Verify email', link),
    link
  );
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${frontendUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail(
    to,
    'Reset your GeoLead AI password',
    wrap('Reset your password', 'We received a request to reset your password. This link expires in 60 minutes. If you didn\'t request this, you can ignore this email.', 'Reset password', link),
    link
  );
}

function wrapPlain(title: string, bodyHtml: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
    <h2 style="margin:0 0 12px">${title}</h2>
    <div style="margin:0;line-height:1.6;color:#334155;white-space:pre-wrap">${bodyHtml}</div>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendContactNotification(payload: {
  name: string;
  email: string;
  company?: string;
  subject: string;
  message: string;
}): Promise<void> {
  const admin = process.env.OUTBOUND_ADMIN_EMAIL;
  if (!admin) {
    console.log(`[Mailer] (no OUTBOUND_ADMIN_EMAIL) contact form from ${payload.email}: ${payload.message}`);
    return;
  }
  const link = `${frontendUrl()}/admin?tab=tickets`;
  const details = [
    `From: ${escapeHtml(payload.name)} <${escapeHtml(payload.email)}>`,
    payload.company ? `Company: ${escapeHtml(payload.company)}` : null,
    `Subject: ${escapeHtml(payload.subject)}`,
    '',
    escapeHtml(payload.message),
  ].filter(Boolean).join('\n');
  await sendEmail(
    admin,
    `New contact form message: ${payload.subject}`,
    wrapPlain('New contact form submission', details),
    link
  );
}

export async function sendTicketReplyEmail(to: string, subject: string, replyBody: string): Promise<void> {
  await sendEmail(
    to,
    `Re: ${subject}`,
    wrapPlain(`Re: ${subject}`, escapeHtml(replyBody)),
    `${frontendUrl()}/dashboard`
  );
}
