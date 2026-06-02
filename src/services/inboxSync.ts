// IMAP inbox sync engine (the InboxSyncWorker).
// Connects to a Gmail/IMAP mailbox, pulls recent messages, matches each to an
// outbound email/lead/campaign/domain, runs AI analysis, creates a Reply,
// stops follow-up sequences, advances the sales pipeline, and broadcasts a
// realtime notification. Designed for a local single-user app.
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import prisma from '../config/db.js';
import { decryptSecret, isEncrypted } from '../config/secrets.js';
import { analyzeReply, type ReplyAnalysis } from './replyAnalysis.js';
import { broadcastOutboundEvent } from './outboundRealtime.js';

const FIRST_SYNC_LOOKBACK_DAYS = 14;
const MAX_MESSAGES_PER_SYNC = 100;

export interface SyncResult {
  ok: boolean;
  imported: number;
  scanned: number;
  matched: number;
  skipped: number;
  error?: string;
}

let syncing = false;
let workerStarted = false;
let workerTimer: NodeJS.Timeout | null = null;

export async function getMailbox() {
  return prisma.mailbox.findFirst({ orderBy: { createdAt: 'asc' } });
}

// Background InboxSyncWorker: polls the mailbox on its configured interval
// whenever it is enabled. Self-reschedules; safe to call once at boot.
export function startInboxSyncWorker() {
  if (workerStarted) return;
  workerStarted = true;

  const tick = async () => {
    let intervalSec = 60;
    try {
      const mailbox = await getMailbox();
      if (mailbox) {
        intervalSec = Math.max(30, mailbox.syncIntervalSec || 60);
        if (mailbox.enabled && !syncing) {
          const res = await syncMailbox();
          if (res.imported > 0) console.log(`[InboxSyncWorker] Imported ${res.imported} reply(ies).`);
          else if (res.error && res.error !== 'A sync is already running.') {
            console.warn('[InboxSyncWorker]', res.error);
          }
        }
      }
    } catch (err: any) {
      console.warn('[InboxSyncWorker] tick failed:', err?.message);
    } finally {
      workerTimer = setTimeout(() => void tick(), intervalSec * 1000);
      workerTimer.unref?.();
    }
  };

  // First run shortly after boot so the server is ready first.
  workerTimer = setTimeout(() => void tick(), 8000);
  workerTimer.unref?.();
  console.log('[InboxSyncWorker] started');
}

// Test an IMAP connection with the given (already-decrypted) credentials.
export async function testImapConnection(opts: {
  imapHost: string;
  imapPort: number;
  useSsl: boolean;
  username: string;
  password: string;
}): Promise<{ ok: boolean; message: string }> {
  const client = new ImapFlow({
    host: opts.imapHost,
    port: opts.imapPort,
    secure: opts.useSsl,
    auth: { user: opts.username, pass: opts.password },
    logger: false,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    lock.release();
    await client.logout();
    return { ok: true, message: `Connected to ${opts.imapHost} as ${opts.username}.` };
  } catch (err: any) {
    try { client.close(); } catch { /* ignore */ }
    return { ok: false, message: friendlyImapError(err) };
  }
}

// imapflow surfaces terse errors ("Command failed") on auth failures. Map the
// common Gmail cases to actionable guidance.
function friendlyImapError(err: any): string {
  const text = `${err?.responseText || err?.message || ''}`.toLowerCase();
  if (err?.authenticationFailed || text.includes('invalid credentials') || text.includes('authenticationfailed') || text.includes('command failed')) {
    return 'Authentication failed. Use a Gmail App Password (not your normal password), and make sure IMAP is enabled in Gmail settings.';
  }
  if (text.includes('timeout') || text.includes('etimedout')) return 'Connection timed out — check the host/port and your network.';
  if (text.includes('enotfound') || text.includes('econnrefused')) return `Could not reach ${err?.host || 'the IMAP host'}. Check the host and port.`;
  return err?.message || 'IMAP connection failed.';
}

// Run a single sync pass for the configured mailbox.
export async function syncMailbox(force = false): Promise<SyncResult> {
  if (syncing) return { ok: false, imported: 0, scanned: 0, matched: 0, skipped: 0, error: 'A sync is already running.' };
  const mailbox = await getMailbox();
  if (!mailbox) return { ok: false, imported: 0, scanned: 0, matched: 0, skipped: 0, error: 'No mailbox configured.' };
  if (!mailbox.enabled && !force) return { ok: false, imported: 0, scanned: 0, matched: 0, skipped: 0, error: 'Mailbox sync is disabled.' };

  syncing = true;
  await prisma.mailbox.update({ where: { id: mailbox.id }, data: { lastSyncStatus: 'running' } });

  const password = isEncrypted(mailbox.appPassword) ? decryptSecret(mailbox.appPassword) : mailbox.appPassword;
  const client = new ImapFlow({
    host: mailbox.imapHost,
    port: mailbox.imapPort,
    secure: mailbox.useSsl,
    auth: { user: mailbox.username || mailbox.email, pass: password },
    logger: false,
  });

  const result: SyncResult = { ok: true, imported: 0, scanned: 0, matched: 0, skipped: 0 };
  let maxUid = mailbox.lastSeenUid;
  let capturedUidValidity = mailbox.uidValidity ?? undefined;

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const status = await client.status('INBOX', { uidValidity: true, uidNext: true });
      const uidValidity = String(status.uidValidity ?? '');
      const uidNext = Number(status.uidNext ?? 0);
      capturedUidValidity = uidValidity || capturedUidValidity;
      const sameMailbox = mailbox.uidValidity === uidValidity && mailbox.lastSeenUid > 0;

      // Nothing new since last cursor — skip the fetch. (A UID range of `N:*`
      // where N > the highest UID would otherwise re-return the newest message
      // every tick.) The post-loop update still refreshes lastSyncAt.
      const nothingNew = sameMailbox && uidNext > 0 && mailbox.lastSeenUid + 1 >= uidNext;

      // Choose what to fetch: incremental UID range when the cursor is valid,
      // otherwise a recent-window search on first sync / uidvalidity reset.
      const range: any = sameMailbox
        ? `${mailbox.lastSeenUid + 1}:*`
        : { since: new Date(Date.now() - FIRST_SYNC_LOOKBACK_DAYS * 86400_000) };

      let processed = 0;
      if (!nothingNew) for await (const msg of client.fetch(range, { uid: true, source: true, envelope: true }, { uid: true })) {
        if (processed >= MAX_MESSAGES_PER_SYNC) break;
        processed += 1;
        result.scanned += 1;
        if (typeof msg.uid === 'number' && msg.uid > maxUid) maxUid = msg.uid;
        if (!msg.source) { result.skipped += 1; continue; }

        try {
          const parsed = await simpleParser(msg.source as Buffer);
          const outcome = await ingestParsedMessage(parsed, mailbox.id);
          if (outcome === 'imported') result.imported += 1;
          else if (outcome === 'matched-duplicate') result.matched += 1;
          else result.skipped += 1;
        } catch (err: any) {
          console.warn('[InboxSync] Failed to process a message:', err?.message);
          result.skipped += 1;
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();

    await prisma.mailbox.update({
      where: { id: mailbox.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'ok',
        lastSyncError: null,
        lastSeenUid: maxUid,
        uidValidity: capturedUidValidity ?? mailbox.uidValidity,
        totalImported: { increment: result.imported },
      },
    });
  } catch (err: any) {
    result.ok = false;
    result.error = err?.message || 'Sync failed.';
    try { client.close(); } catch { /* ignore */ }
    await prisma.mailbox.update({
      where: { id: mailbox.id },
      data: { lastSyncAt: new Date(), lastSyncStatus: 'error', lastSyncError: result.error },
    });
  } finally {
    syncing = false;
  }

  if (result.imported > 0) {
    broadcastOutboundEvent({ type: 'INBOX_SYNCED', payload: { imported: result.imported } });
  }
  return result;
}

type IngestOutcome = 'imported' | 'matched-duplicate' | 'skipped';

// Parse → match → analyze → persist a single inbound message.
async function ingestParsedMessage(parsed: ParsedMail, mailboxId: string): Promise<IngestOutcome> {
  const messageId = parsed.messageId || undefined;
  const fromAddr = firstAddress(parsed.from?.value);
  const subject = parsed.subject || '(no subject)';
  const body = (parsed.text || htmlToText(parsed.html) || '').slice(0, 50000);

  // Dedup on Message-ID.
  if (messageId) {
    const existing = await prisma.reply.findUnique({ where: { messageId } });
    if (existing) return 'matched-duplicate';
  }

  const match = await matchMessage(parsed, fromAddr, parsed.date || new Date());
  if (!match) {
    // Not one of our outreach threads — ignore (keeps the inbox focused).
    return 'skipped';
  }

  const domainName = match.campaign?.geoDomain;
  const niche = match.campaign?.niche;
  const analysis: ReplyAnalysis = await analyzeReply(body, subject, {
    domain: domainName || undefined,
    niche: niche || undefined,
    businessName: match.lead?.businessName,
  });

  const reply = await prisma.reply.create({
    data: {
      mailboxId,
      campaignId: match.campaignId,
      campaignLeadId: match.campaignLeadId,
      leadId: match.leadId,
      emailLogId: match.emailLogId,
      fromEmail: fromAddr || 'unknown',
      subject,
      body,
      threadId: parsed.references ? asArray(parsed.references)[0] : undefined,
      messageId,
      inReplyTo: parsed.inReplyTo || undefined,
      direction: 'INBOUND',
      source: 'imap',
      matchConfidence: match.confidence,
      matchMethod: match.method,
      isRead: false,
      aiCategory: analysis.category,
      aiSummary: analysis.summary,
      sentiment: analysis.sentiment,
      intentScore: analysis.intentScore,
      buyingIntent: analysis.buyingIntent,
      suggestedResponse: analysis.suggestedResponse,
      status: 'NEW',
      tags: analysis.tags,
      receivedAt: parsed.date || new Date(),
    },
  });

  await applyReplyEffects(match, analysis);

  broadcastOutboundEvent({
    type: 'NEW_REPLY',
    payload: {
      replyId: reply.id,
      category: analysis.category,
      sentiment: analysis.sentiment,
      fromEmail: fromAddr,
      businessName: match.lead?.businessName,
      domain: domainName,
      buyingIntent: analysis.buyingIntent,
    },
  });

  return 'imported';
}

interface MatchResult {
  campaignId: string;
  leadId: string;
  campaignLeadId: string | null;
  emailLogId: string | null;
  campaign: { id: string; geoDomain: string; niche: string; domainId: string | null } | null;
  lead: { id: string; businessName: string } | null;
  confidence: number;
  method: string;
}

// Match an inbound message to an outbound email/lead using, in order of
// confidence: Message-ID/In-Reply-To/References → tracking token → recipient
// email → known lead email.
async function matchMessage(parsed: ParsedMail, fromAddr: string | undefined, messageDate: Date): Promise<MatchResult | null> {
  const refs = `${parsed.inReplyTo || ''} ${asArray(parsed.references).join(' ')}`;
  const ids = extractIds(refs);

  // 1. Header references → providerMessageId (Resend message id is a UUID).
  // Only sent emails have a providerMessageId, so this is inherently a reply.
  for (const id of ids) {
    const log = await findLog({ providerMessageId: id });
    if (log) return toMatch(log, 95, 'message-id');
  }

  // 2. Tracking / unsubscribe token quoted in the reply body.
  const tokens = extractTrackingTokens(`${parsed.text || ''}\n${(parsed.html as string) || ''}`);
  for (const token of tokens) {
    const log = await findLog({ OR: [{ trackingToken: token }, { unsubscribeToken: token }] });
    if (log) return toMatch(log, 90, 'tracking-token');
  }

  // 3. Reply sender == a recipient we actually SENT to, and the inbound
  // message is newer than that send. This prevents unrelated/older inbox mail
  // from a known address being misread as a campaign reply (and stopping a
  // sequence). A QUEUED/unsent email never counts.
  if (fromAddr) {
    const tolerance = 60_000; // allow a minute of clock skew
    const log = await prisma.emailLog.findFirst({
      where: {
        toEmail: { equals: fromAddr, mode: 'insensitive' },
        sentAt: { not: null, lte: new Date(messageDate.getTime() + tolerance) },
      },
      orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
      include: { campaign: true, lead: true },
    });
    if (log) return toMatch(log, 60, 'recipient-email');

    // 4. Sender is a known lead with a sent outbound predating the reply.
    const leadEmail = await prisma.leadEmail.findFirst({
      where: { email: { equals: fromAddr, mode: 'insensitive' } },
      include: { lead: true },
    });
    if (leadEmail) {
      const sentLog = await prisma.emailLog.findFirst({
        where: {
          leadId: leadEmail.leadId,
          sentAt: { not: null, lte: new Date(messageDate.getTime() + tolerance) },
        },
        orderBy: { sentAt: 'desc' },
        include: { campaign: true, lead: true },
      });
      if (sentLog) return toMatch(sentLog, 50, 'lead-email');
    }
  }

  return null;
}

async function findLog(where: any) {
  return prisma.emailLog.findFirst({ where, orderBy: { createdAt: 'desc' }, include: { campaign: true, lead: true } });
}

function toMatch(log: any, confidence: number, method: string): MatchResult {
  return {
    campaignId: log.campaignId,
    leadId: log.leadId,
    campaignLeadId: log.campaignLeadId ?? null,
    emailLogId: log.id,
    campaign: log.campaign
      ? { id: log.campaign.id, geoDomain: log.campaign.geoDomain, niche: log.campaign.niche, domainId: log.campaign.domainId }
      : null,
    lead: log.lead ? { id: log.lead.id, businessName: log.lead.businessName } : null,
    confidence,
    method,
  };
}

// Stop sequences + advance the CRM pipeline based on the AI category.
async function applyReplyEffects(match: MatchResult, analysis: ReplyAnalysis) {
  const now = new Date();
  const category = analysis.category;
  const isAutoReply = category === 'Out Of Office';
  const isSpam = category === 'Spam';

  // Auto-replies and spam don't represent a real human reply: keep the
  // sequence running and don't move the pipeline.
  if (isAutoReply || isSpam) return;

  // Stop any queued follow-ups for this lead's campaign thread.
  if (match.campaignLeadId) {
    await prisma.emailLog.updateMany({
      where: { campaignLeadId: match.campaignLeadId, status: 'QUEUED' },
      data: { status: 'CANCELLED', errorMessage: 'Sequence stopped after inbound reply.' },
    });
  }

  const interested = category === 'Interested' || category === 'Negotiating';
  const unsubscribe = category === 'Unsubscribe';
  const notInterested = category === 'Not Interested';

  const leadStage = interested ? (category === 'Negotiating' ? 'Negotiating' : 'Interested')
    : unsubscribe ? 'Unsubscribed'
    : notInterested ? 'Not Interested'
    : 'Replied';
  const leadStatus = interested ? (category === 'Negotiating' ? 'Negotiating' : 'Interested')
    : unsubscribe ? 'Unsubscribed'
    : notInterested ? 'Not Interested'
    : 'Replied';

  // Lead
  const prevLead = await prisma.lead.findUnique({ where: { id: match.leadId }, select: { pipelineStage: true } });
  await prisma.lead.update({
    where: { id: match.leadId },
    data: {
      leadStatus,
      pipelineStage: leadStage,
      replyCount: { increment: 1 },
      engagementScore: { increment: interested ? 40 : 15 },
      lastContactedAt: now,
      ...(unsubscribe ? { unsubscribed: true, doNotContact: true } : {}),
    },
  });

  // CampaignLead
  if (match.campaignLeadId) {
    await prisma.campaignLead.update({
      where: { id: match.campaignLeadId },
      data: {
        status: interested ? 'INTERESTED' : unsubscribe ? 'UNSUBSCRIBED' : notInterested ? 'NOT_INTERESTED' : 'REPLIED',
        stage: leadStage,
        repliedAt: now,
        engaged: true,
        positiveReply: analysis.sentiment === 'positive',
        negativeReply: analysis.sentiment === 'negative',
        engagementScore: { increment: interested ? 40 : 15 },
        ...(unsubscribe ? { unsubscribedAt: now } : {}),
      },
    });
  }

  // Pipeline history
  await recordLeadStatus(match.leadId, leadStage, {
    fromStatus: prevLead?.pipelineStage,
    campaignId: match.campaignId,
    domainId: match.campaign?.domainId ?? undefined,
    reason: `Inbound reply classified as ${category}.`,
    source: 'imap-reply',
  });

  // Domain pipeline: interested/negotiating replies move the domain forward.
  if (match.campaign?.domainId && interested) {
    const domain = await prisma.domain.findUnique({ where: { id: match.campaign.domainId } });
    if (domain && domain.status !== 'Sold' && domain.status !== 'Archived') {
      await prisma.domain.update({ where: { id: domain.id }, data: { status: 'Negotiating' } });
    }
  }

  // Unsubscribe → suppression list.
  if (unsubscribe) {
    const reply = await prisma.lead.findUnique({ where: { id: match.leadId }, include: { emails: true } });
    const email = reply?.emails?.[0]?.email;
    if (email) {
      await prisma.suppressionEntry.upsert({
        where: { email },
        update: { reason: 'unsubscribe', source: 'imap-reply' },
        create: { email, reason: 'unsubscribe', source: 'imap-reply', leadId: match.leadId, campaignId: match.campaignId },
      });
    }
  }
}

export async function recordLeadStatus(
  leadId: string,
  toStatus: string,
  opts: { fromStatus?: string | null; campaignId?: string; domainId?: string; reason?: string; source?: string } = {}
) {
  if (opts.fromStatus && opts.fromStatus === toStatus) return;
  await prisma.leadStatusHistory.create({
    data: {
      leadId,
      toStatus,
      fromStatus: opts.fromStatus ?? null,
      campaignId: opts.campaignId ?? null,
      domainId: opts.domainId ?? null,
      reason: opts.reason ?? null,
      source: opts.source ?? 'system',
    },
  });
}

// ---- helpers ------------------------------------------------------------

function firstAddress(value: any): string | undefined {
  if (!value) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  const addr = arr[0]?.address;
  return addr ? String(addr).toLowerCase() : undefined;
}

function asArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function extractIds(text: string): string[] {
  const ids = new Set<string>();
  const uuidRe = /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g;
  let m: RegExpExecArray | null;
  while ((m = uuidRe.exec(text)) !== null) ids.add(m[1].toLowerCase());
  const localRe = /<([^@>\s]+)@[^>]+>/g;
  while ((m = localRe.exec(text)) !== null) ids.add(m[1]);
  return Array.from(ids);
}

// Pull GeoLead tracking/unsubscribe tokens out of a quoted reply body.
function extractTrackingTokens(text: string): string[] {
  const tokens = new Set<string>();
  const re = /\/(?:track\/(?:open|click)|unsubscribe)\/([A-Za-z0-9._-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) tokens.add(m[1].replace(/\.gif$/, ''));
  return Array.from(tokens);
}

function htmlToText(html: string | false | undefined): string {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
