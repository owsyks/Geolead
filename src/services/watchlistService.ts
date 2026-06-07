// Domain Watchlist Service
// Tracks candidate domains via DNS checks, fires reminders, and sends
// in-app + email notifications when watched domains become available.
import { promises as dnsPromises } from 'dns';
import axios from 'axios';
import prisma from '../config/db.js';
import { deriveDomainIntelligence } from './domains.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WatchPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type WatchStatus = 'WATCHING' | 'INTERESTED' | 'HIGH_PRIORITY' | 'AVAILABLE' | 'PURCHASED' | 'IN_PORTFOLIO';
export type DnsStatus = 'dns_registered' | 'dns_available' | 'dns_unknown' | 'dns_dropping';
export type AiReco = 'BUY_NOW' | 'WAIT' | 'MONITOR' | 'AVOID';

export interface AddToWatchlistInput {
  domainName: string;
  priority?: WatchPriority;
  notes?: string;
  addedFrom?: string;
  // Pre-computed scores from Acquisition Advisor (optional)
  brandScore?: number;
  marketScore?: number;
  acquisitionScore?: number;
  estimatedValue?: number;
  aiRecommendation?: AiReco;
  aiReasoning?: string;
}

export interface AddReminderInput {
  type: 'DAYS' | 'STATUS_CHANGE' | 'AVAILABLE';
  label?: string;
  daysFromNow?: number;
  notifyVia?: 'IN_APP' | 'EMAIL' | 'BOTH';
}

// ─── DNS helper ───────────────────────────────────────────────────────────────

// Determine whether a domain is actually registered.
//
// The old implementation used dns.lookup() (an A/AAAA record check) and treated
// ANY failure as "available". That is wrong: a huge number of *registered*
// domains have no A record — parked domains, domains with no website, and
// especially expiring / "about to drop" domains in redemption/pendingDelete.
// Those have no IP, so they were falsely reported as available.
//
// We now use two authoritative-ish signals:
//   1. RDAP (registry data): 200 = registered (even if expiring), 404 = the
//      registry has no record → genuinely available.
//   2. DNS delegation: NS or SOA records (or any A) mean the domain is
//      delegated, i.e. registered — even with no website.
//
// A domain is only reported "available" when RDAP says 404 AND there is no DNS
// presence. Anything inconclusive (RDAP down / rate-limited and no DNS) is
// reported as "unknown" rather than "available", so we never falsely signal a
// drop.
async function hasDnsPresence(domain: string): Promise<boolean> {
  try { const ns = await dnsPromises.resolveNs(domain); if (ns && ns.length > 0) return true; } catch { /* no NS */ }
  try { const soa = await dnsPromises.resolveSoa(domain); if (soa && soa.nsname) return true; } catch { /* no SOA */ }
  try { await dnsPromises.lookup(domain); return true; } catch { /* no A/AAAA */ }
  return false;
}

export interface DomainStatusResult {
  status: DnsStatus;
  eppStatuses: string[];      // normalized EPP codes, e.g. ['clientTransferProhibited','redemptionPeriod']
  registrar: string | null;
  expiration: Date | null;
}

// EPP lifecycle codes that mean the domain is registered but on its way out — it
// has expired and is in the redemption / deletion window, i.e. "about to drop".
const DROP_STATUSES = new Set(['redemptionPeriod', 'pendingDelete', 'pendingRestore']);

// RDAP status strings are lowercase space-separated ("redemption period").
// Normalize to the conventional camelCase EPP code ("redemptionPeriod").
function normalizeEppStatus(s: string): string {
  const parts = String(s).trim().toLowerCase().split(/[\s_]+/).filter(Boolean);
  if (parts.length === 0) return String(s).trim();
  return parts.map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join('');
}

function extractRdapRegistrar(data: any): string | null {
  if (!Array.isArray(data?.entities)) return null;
  for (const e of data.entities) {
    if (Array.isArray(e?.roles) && e.roles.includes('registrar')) {
      const vcard = e?.vcardArray?.[1];
      if (Array.isArray(vcard)) {
        const fn = vcard.find((f: any) => Array.isArray(f) && f[0] === 'fn');
        if (fn && typeof fn[3] === 'string' && fn[3].trim()) return fn[3].trim();
      }
      if (typeof e.handle === 'string' && e.handle.trim()) return e.handle.trim();
    }
  }
  return null;
}

function extractRdapExpiration(data: any): Date | null {
  if (!Array.isArray(data?.events)) return null;
  const ev = data.events.find((e: any) => e?.eventAction === 'expiration');
  if (ev?.eventDate) {
    const d = new Date(ev.eventDate);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

// Resolve the full registration status from RDAP (authoritative registry data):
// the lifecycle status (registered / dropping / available / unknown), the raw
// EPP status codes (clientTransferProhibited, redemptionPeriod, …), the
// registrar, and the expiration date.
async function resolveDomainStatus(domain: string): Promise<DomainStatusResult> {
  let rdapStatus: number | null = null;
  let data: any = null;
  try {
    const res = await axios.get(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      timeout: 8000,
      maxRedirects: 5,
      validateStatus: (s) => s < 500, // we want to read 404 ourselves
      headers: { Accept: 'application/rdap+json' },
    });
    rdapStatus = res.status;
    if (res.status === 200) data = res.data;
  } catch {
    rdapStatus = null; // network/timeout — fall back to DNS
  }

  const eppStatuses: string[] = Array.isArray(data?.status)
    ? Array.from(new Set(data.status.map((s: string) => normalizeEppStatus(s))))
    : [];
  const registrar = extractRdapRegistrar(data);
  const expiration = extractRdapExpiration(data);

  if (rdapStatus === 200) {
    // Registered. If it's in the redemption/pending-delete window, flag it as
    // dropping — that's the high-opportunity "about to become available" state.
    const dropping = eppStatuses.some((s) => DROP_STATUSES.has(s));
    return { status: dropping ? 'dns_dropping' : 'dns_registered', eppStatuses, registrar, expiration };
  }

  // RDAP didn't return a record. NS/SOA/A present → still clearly registered
  // (covers TLDs RDAP doesn't serve, so a 404 isn't misread as available).
  if (await hasDnsPresence(domain)) {
    return { status: 'dns_registered', eppStatuses, registrar, expiration };
  }

  // No DNS presence. Only an authoritative RDAP 404 means truly available.
  if (rdapStatus === 404) return { status: 'dns_available', eppStatuses, registrar, expiration };

  // RDAP inconclusive (timeout / rate-limited) and no DNS → unknown, never a
  // guessed "available".
  return { status: 'dns_unknown', eppStatuses, registrar, expiration };
}

// ─── Score derivation ─────────────────────────────────────────────────────────

function deriveScores(domainName: string, overrides?: Partial<AddToWatchlistInput>) {
  const intel = deriveDomainIntelligence(domainName);
  const brandScore = overrides?.brandScore ?? intel.brandingScore;
  const marketScore = overrides?.marketScore ?? intel.buyerDemandScore;
  const acquisitionScore = overrides?.acquisitionScore
    ?? Math.round(brandScore * 0.3 + marketScore * 0.4 + intel.leadOpportunityScore * 0.3);
  const estimatedValue = overrides?.estimatedValue ?? intel.estimatedValue;
  let aiRecommendation: AiReco = overrides?.aiRecommendation ?? (
    acquisitionScore >= 72 ? 'BUY_NOW' :
    acquisitionScore >= 55 ? 'WAIT' :
    acquisitionScore >= 40 ? 'MONITOR' : 'AVOID'
  );
  return { brandScore, marketScore, acquisitionScore, estimatedValue, aiRecommendation };
}

// ─── Notification helpers ─────────────────────────────────────────────────────

async function createNotification(
  userId: string,
  watchedDomainId: string,
  domainName: string,
  type: string,
  title: string,
  body: string,
  priority: string = 'NORMAL'
) {
  await prisma.watchlistNotification.create({
    data: { userId, watchedDomainId, domainName, type, title, body, priority },
  });
}

// Where watchlist alert/reminder emails are delivered. A WATCHLIST_REMINDER_EMAIL
// env override wins (so all alerts go to one inbox regardless of the acting
// user), otherwise the user's own account email.
function reminderRecipient(userEmail?: string | null): string | null {
  return process.env.WATCHLIST_REMINDER_EMAIL?.trim() || userEmail || null;
}

async function sendWatchlistEmail(
  userId: string,
  subject: string,
  html: string
) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const to = reminderRecipient(user?.email);
    if (!to) return;
    const key = process.env.RESEND_API_KEY;
    if (!key) return;
    const from = `${process.env.RESEND_FROM_NAME || 'GeoLead AI'} <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`;
    await axios.post(
      'https://api.resend.com/emails',
      { from, to, subject, html },
      { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 10000 }
    );
  } catch { /* non-blocking */ }
}

function availableEmailHtml(domain: string, acquisitionScore: number, aiReco: string) {
  return `
<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center">
    <div style="font-size:28px;font-weight:900;color:#059669">${domain}</div>
    <div style="font-size:18px;font-weight:700;color:#10b981;margin-top:8px">⚡ AVAILABLE NOW</div>
  </div>
  <p style="margin:0 0 16px;color:#334155">A domain you're watching just became available for registration.</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <tr><td style="padding:8px;color:#64748b;font-size:13px">Acquisition Score</td><td style="padding:8px;font-weight:700">${acquisitionScore}/100</td></tr>
    <tr><td style="padding:8px;color:#64748b;font-size:13px">AI Recommendation</td><td style="padding:8px;font-weight:700;color:#4f46e5">${aiReco}</td></tr>
  </table>
  <p style="font-size:12px;color:#94a3b8">GeoLead AI — Domain Watchlist Alert</p>
</div>`;
}

// Send a test "domain available" reminder email to the signed-in user so they can
// verify the drop-alert email path (Resend key, from-address, recipient,
// formatting) without waiting for a real domain to drop. Returns a clear result
// instead of swallowing errors, so the UI can show why it failed.
export async function sendTestReminderEmail(userId: string, watchedDomainId?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const to = reminderRecipient(user?.email);
  if (!to) return { ok: false, reason: 'No reminder email configured (set WATCHLIST_REMINDER_EMAIL or an account email).' };

  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, reason: 'Email sending is not configured (RESEND_API_KEY missing on the server).' };

  // Use a real watched domain if one was given, otherwise a sample.
  let domainName = 'example-watchlist-domain.com';
  let acquisitionScore = 78;
  let aiReco = 'BUY_NOW';
  if (watchedDomainId) {
    const w = await prisma.watchedDomain.findFirst({ where: { id: watchedDomainId, userId } });
    if (w) { domainName = w.domainName; acquisitionScore = w.acquisitionScore; aiReco = w.aiRecommendation || 'MONITOR'; }
  }

  const from = `${process.env.RESEND_FROM_NAME || 'GeoLead AI'} <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`;
  try {
    await axios.post(
      'https://api.resend.com/emails',
      {
        from,
        to,
        subject: `[Test] Domain Available: ${domainName}`,
        html: availableEmailHtml(domainName, acquisitionScore, aiReco),
      },
      { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    return { ok: true, to, domainName };
  } catch (err: any) {
    const detail = err?.response?.data?.message || err?.message || 'Unknown error';
    return { ok: false, reason: `Resend rejected the send: ${detail}` };
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listWatchlist(userId: string) {
  return prisma.watchedDomain.findMany({
    where: { userId },
    include: { reminders: true, events: { orderBy: { createdAt: 'desc' }, take: 5 } },
    orderBy: [{ priority: 'asc' }, { acquisitionScore: 'desc' }],
  });
}

export async function addToWatchlist(userId: string, input: AddToWatchlistInput) {
  const name = input.domainName.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  const scores = deriveScores(name, input);

  const existing = await prisma.watchedDomain.findUnique({ where: { userId_domainName: { userId, domainName: name } } });
  if (existing) return existing;

  const w = await prisma.watchedDomain.create({
    data: {
      userId,
      domainName: name,
      priority: input.priority || 'MEDIUM',
      notes: input.notes,
      addedFrom: input.addedFrom || 'manual',
      ...scores,
      aiReasoning: input.aiReasoning,
    },
  });

  // Kick off an initial DNS check
  void checkAndUpdateDns(w.id, userId).catch(() => {});
  return w;
}

export async function updateWatched(
  id: string,
  userId: string,
  changes: Partial<{ priority: WatchPriority; status: WatchStatus; notes: string; isFavorite: boolean }>
) {
  await assertOwner(id, userId);
  return prisma.watchedDomain.update({ where: { id }, data: changes });
}

export async function removeFromWatchlist(id: string, userId: string) {
  await assertOwner(id, userId);
  await prisma.watchedDomain.delete({ where: { id } });
  return { deleted: true };
}

export async function addReminder(id: string, userId: string, input: AddReminderInput) {
  await assertOwner(id, userId);
  const triggerAt = input.type === 'DAYS' && input.daysFromNow
    ? new Date(Date.now() + input.daysFromNow * 86400000)
    : null;
  return prisma.watchlistReminder.create({
    data: {
      watchedDomainId: id,
      userId,
      type: input.type,
      label: input.label,
      triggerAt,
      notifyVia: input.notifyVia || 'IN_APP',
    },
  });
}

export async function deleteReminder(reminderId: string, userId: string) {
  await prisma.watchlistReminder.deleteMany({ where: { id: reminderId, userId } });
  return { deleted: true };
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function getNotifications(userId: string, limit = 50) {
  return prisma.watchlistNotification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getUnreadCount(userId: string) {
  return prisma.watchlistNotification.count({ where: { userId, read: false } });
}

export async function markRead(id: string, userId: string) {
  await prisma.watchlistNotification.updateMany({
    where: { id, userId },
    data: { read: true, readAt: new Date() },
  });
}

export async function markAllRead(userId: string) {
  await prisma.watchlistNotification.updateMany({
    where: { userId, read: false },
    data: { read: true, readAt: new Date() },
  });
}

// ─── DNS check ────────────────────────────────────────────────────────────────

async function checkAndUpdateDns(id: string, userId: string) {
  const w = await prisma.watchedDomain.findFirst({ where: { id, userId } });
  if (!w) return;

  const result = await resolveDomainStatus(w.domainName);
  const newStatus = result.status;
  const prevStatus = w.registrationStatus;
  const changed = newStatus !== prevStatus;
  const flipToAvailable = newStatus === 'dns_available'
    && ['WATCHING', 'INTERESTED', 'HIGH_PRIORITY'].includes(w.status);

  await prisma.watchedDomain.update({
    where: { id },
    data: {
      registrationStatus: newStatus,
      registrar: result.registrar ?? w.registrar,
      expirationDate: result.expiration ?? w.expirationDate,
      lastCheckedAt: new Date(),
      metadata: {
        ...((w.metadata as Record<string, unknown> | null) ?? {}),
        eppStatuses: result.eppStatuses,
        statusCheckedAt: new Date().toISOString(),
      },
      ...(flipToAvailable ? { status: 'AVAILABLE' } : {}),
    },
  });

  await prisma.watchedDomainEvent.create({
    data: {
      watchedDomainId: id,
      type: changed ? 'DNS_CHANGE' : 'CHECKED',
      details: { previous: prevStatus, current: newStatus, eppStatuses: result.eppStatuses },
    },
  });

  if (changed && newStatus === 'dns_available') {
    const priority = w.priority === 'CRITICAL' ? 'URGENT' : w.priority === 'HIGH' ? 'HIGH' : 'NORMAL';
    await createNotification(
      userId, id, w.domainName, 'AVAILABLE',
      `⚡ ${w.domainName} is now AVAILABLE`,
      `The domain you're watching appears to be available for registration. Acquisition score: ${w.acquisitionScore}/100. AI recommendation: ${w.aiRecommendation || 'MONITOR'}.`,
      priority
    );

    // Fire STATUS_CHANGE and AVAILABLE reminders
    const reminders = await prisma.watchlistReminder.findMany({
      where: { watchedDomainId: id, triggered: false, type: { in: ['STATUS_CHANGE', 'AVAILABLE'] } },
    });
    for (const r of reminders) {
      await prisma.watchlistReminder.update({ where: { id: r.id }, data: { triggered: true, triggeredAt: new Date() } });
      if (r.notifyVia === 'EMAIL' || r.notifyVia === 'BOTH') {
        await sendWatchlistEmail(
          userId,
          `Domain Available: ${w.domainName}`,
          availableEmailHtml(w.domainName, w.acquisitionScore, w.aiRecommendation || 'MONITOR')
        );
      }
    }
  } else if (changed && newStatus === 'dns_dropping') {
    // Registered but in redemption / pending-delete — likely to become available
    // soon. High-opportunity signal.
    const priority = w.priority === 'CRITICAL' || w.priority === 'HIGH' ? 'HIGH' : 'NORMAL';
    const codes = result.eppStatuses.filter((s) => DROP_STATUSES.has(s)).join(', ') || 'redemption/pending-delete';
    await createNotification(
      userId, id, w.domainName, 'STATUS_CHANGE',
      `⏳ ${w.domainName} may drop soon`,
      `The domain has expired and is in ${codes}. It often becomes available for registration shortly after this stage. Acquisition score: ${w.acquisitionScore}/100.`,
      priority
    );
    const reminders = await prisma.watchlistReminder.findMany({
      where: { watchedDomainId: id, triggered: false, type: 'STATUS_CHANGE' },
    });
    for (const r of reminders) {
      await prisma.watchlistReminder.update({ where: { id: r.id }, data: { triggered: true, triggeredAt: new Date() } });
    }
  } else if (changed) {
    await createNotification(
      userId, id, w.domainName, 'STATUS_CHANGE',
      `${w.domainName} DNS status changed`,
      `Previous: ${prevStatus ?? 'unknown'} → Now: ${newStatus}`
    );
    const reminders = await prisma.watchlistReminder.findMany({
      where: { watchedDomainId: id, triggered: false, type: 'STATUS_CHANGE' },
    });
    for (const r of reminders) {
      await prisma.watchlistReminder.update({ where: { id: r.id }, data: { triggered: true, triggeredAt: new Date() } });
    }
  }

  return { id, registrationStatus: newStatus, changed };
}

export async function checkDomainNow(id: string, userId: string) {
  return checkAndUpdateDns(id, userId);
}

// ─── Portfolio move ───────────────────────────────────────────────────────────

export async function moveToPortfolio(id: string, userId: string) {
  const w = await prisma.watchedDomain.findFirst({ where: { id, userId } });
  if (!w) throw new Error('Watched domain not found.');

  // Create portfolio domain if not already there
  const existing = await prisma.domain.findFirst({ where: { userId, name: w.domainName } });
  let domain = existing;
  if (!domain) {
    const intel = deriveDomainIntelligence(w.domainName);
    domain = await prisma.domain.create({
      data: {
        userId,
        name: w.domainName,
        status: 'Available',
        niche: intel.niche,
        industry: intel.industry,
        category: intel.category,
        city: intel.city,
        state: intel.state,
        country: intel.country,
        brandingScore: w.brandScore || intel.brandingScore,
        buyerDemandScore: intel.buyerDemandScore,
        leadOpportunityScore: intel.leadOpportunityScore,
        estimatedValue: w.estimatedValue || intel.estimatedValue,
        recommendedPrice: intel.recommendedPrice,
        saleProbability: intel.saleProbability,
        bestIndustries: intel.bestIndustries,
        bestCities: intel.bestCities,
        outreachStrategy: intel.outreachStrategy,
        aiSummary: w.aiReasoning || intel.aiSummary,
        notes: w.notes,
        intelligenceUpdatedAt: new Date(),
      },
    });
  }

  await prisma.watchedDomain.update({ where: { id }, data: { status: 'IN_PORTFOLIO' } });
  await prisma.watchedDomainEvent.create({
    data: { watchedDomainId: id, type: 'STATUS_CHANGE', details: { status: 'IN_PORTFOLIO', portfolioDomainId: domain.id } },
  });

  return { portfolioDomainId: domain.id };
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const STALE_THRESHOLD_MS = 5 * 60 * 60 * 1000; // check domains not checked in 5h

async function runScheduledChecks() {
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);
  const domains = await prisma.watchedDomain.findMany({
    where: {
      status: { notIn: ['PURCHASED', 'IN_PORTFOLIO'] },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: staleThreshold } }],
    },
    select: { id: true, userId: true },
    take: 200,
  });

  for (const d of domains) {
    await checkAndUpdateDns(d.id, d.userId).catch(() => {});
    await new Promise(r => setTimeout(r, 300)); // 300ms between checks to avoid burst
  }

  // Fire due DAYS reminders
  const dueReminders = await prisma.watchlistReminder.findMany({
    where: { type: 'DAYS', triggered: false, triggerAt: { lte: new Date() } },
    include: { watchedDomain: true },
  });
  for (const r of dueReminders) {
    const w = r.watchedDomain;
    await createNotification(
      r.userId, w.id, w.domainName, 'REMINDER',
      `Reminder: ${w.domainName}`,
      r.label || `Scheduled reminder for ${w.domainName}. Acquisition score: ${w.acquisitionScore}/100.`
    );
    if (r.notifyVia === 'EMAIL' || r.notifyVia === 'BOTH') {
      await sendWatchlistEmail(r.userId, `Watchlist Reminder: ${w.domainName}`, `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h2>Reminder: ${w.domainName}</h2>
  <p>${r.label || 'This is your scheduled watchlist reminder.'}</p>
  <p>Acquisition Score: ${w.acquisitionScore}/100 · Status: ${w.registrationStatus ?? 'Unknown'}</p>
</div>`).catch(() => {});
    }
    await prisma.watchlistReminder.update({ where: { id: r.id }, data: { triggered: true, triggeredAt: new Date() } });
  }

  console.log(`[Watchlist] Checked ${domains.length} domains, fired ${dueReminders.length} reminders.`);
}

let schedulerRunning = false;

export function startWatchlistScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  void runScheduledChecks(); // run immediately on boot
  setInterval(() => void runScheduledChecks(), CHECK_INTERVAL_MS).unref();
  console.log('[Watchlist] Scheduler started (6h interval).');
}

// ─── Utils ────────────────────────────────────────────────────────────────────

async function assertOwner(id: string, userId: string) {
  const w = await prisma.watchedDomain.findFirst({ where: { id, userId } });
  if (!w) throw new Error('Watched domain not found.');
  return w;
}
