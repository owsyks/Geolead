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

async function sendEmail(to: string, subject: string, html: string, textLink: string, text?: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[Mailer] (no RESEND_API_KEY) ${subject} for ${to} -> ${textLink}`);
    return;
  }
  try {
    await axios.post(
      'https://api.resend.com/emails',
      { from: systemFrom(), to, subject, html, ...(text ? { text } : {}) },
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

// Registration codes are part of the account-creation security boundary. In
// production, delivery failure must fail closed so the UI never claims a code
// was sent when it was not. Local development may log the code when Resend is
// intentionally absent; production never logs it.
export async function sendRegistrationCode(to: string, code: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'production') throw new Error('RESEND_NOT_CONFIGURED');
    console.log(`[Mailer] Registration code for ${to}: ${code}`);
    return;
  }
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
    <h2 style="margin:0 0 12px">Verify your email</h2>
    <p style="margin:0 0 20px;line-height:1.5;color:#334155">Enter this code to create your GeoLead AI account. It expires in 10 minutes.</p>
    <div style="font-size:32px;font-weight:800;letter-spacing:10px;padding:16px 20px;background:#f1f5f9;border-radius:10px;text-align:center">${code}</div>
    <p style="margin:20px 0 0;font-size:12px;color:#64748b">If you did not request this code, you can ignore this email.</p>
  </div>`;
  await axios.post(
    'https://api.resend.com/emails',
    { from: systemFrom(), to, subject: `${code} is your GeoLead AI verification code`, html },
    { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 15000 }
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

export function renderTicketReplyEmail(subject: string, replyBody: string, ticketId: string): string {
  const safeSubject = escapeHtml(subject);
  const safeTicketId = escapeHtml(ticketId);
  const safeReply = escapeHtml(replyBody).replace(/\r?\n/g, '<br>');
  const conversationLink = `${frontendUrl()}/dashboard`;

  // Table layout and inline styles are deliberate: they render consistently
  // across Gmail, Outlook, Apple Mail, and narrow mobile clients.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>GeoLead AI support reply</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f7f6;color:#101817;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">GeoLead AI Support replied to your ticket: ${safeSubject}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f7f6;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #dce7e4;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;background:#0b1110;color:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="font-size:20px;font-weight:800;letter-spacing:-0.3px;">GeoLead <span style="color:#19c5b1;">AI</span></td>
                    <td align="right" style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#8fa39e;text-transform:uppercase;">Support</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 12px;">
                <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#0aa995;text-transform:uppercase;margin-bottom:10px;">New support reply</div>
                <h1 style="margin:0;font-size:24px;line-height:1.3;letter-spacing:-0.4px;color:#101817;">${safeSubject}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 6px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f5faf9;border-left:4px solid #19c5b1;border-radius:8px;">
                  <tr>
                    <td style="padding:20px;font-size:15px;line-height:1.7;color:#263b37;word-break:break-word;">${safeReply}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px 30px;">
                <a href="${conversationLink}" style="display:inline-block;background:#19bda9;color:#07110f;text-decoration:none;font-size:14px;font-weight:800;padding:13px 20px;border-radius:8px;">Open support conversation&nbsp;&rarr;</a>
                <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#71817d;">Ticket reference: <strong style="color:#42534f;">${safeTicketId}</strong><br>Open GeoLead AI to continue the conversation with our support team.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#f8fbfa;border-top:1px solid #e4ecea;font-size:11px;line-height:1.6;color:#82908d;">This is a transactional support notification from GeoLead AI. Please use the button above to reply inside your secure support thread.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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

export async function sendTicketReplyEmail(to: string, subject: string, replyBody: string, ticketId: string): Promise<void> {
  const link = `${frontendUrl()}/dashboard`;
  const mailSubject = /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
  const plainText = [
    'GeoLead AI Support',
    '',
    subject,
    '',
    replyBody,
    '',
    `Ticket reference: ${ticketId}`,
    `Open your support conversation: ${link}`,
  ].join('\n');
  await sendEmail(
    to,
    mailSubject,
    renderTicketReplyEmail(subject, replyBody, ticketId),
    link,
    plainText
  );
}
