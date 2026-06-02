import prisma from '../config/db.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

// Single-entry cache structure per domain. `promise` is reused while in flight
// and after resolution until the TTL expires. After TTL, the next call resolves
// a new promise atomically — concurrent callers all see the same new promise.
interface CacheEntry {
  promise: Promise<DomainStats | null>;
  expiresAt: number; // valid until this timestamp
}
const repCache = new Map<string, CacheEntry>();

export interface DomainStats {
  domain: string;
  totalSent: number;
  totalDelivered: number;
  totalBounced: number;
  totalReplied: number;
  bounceRate: number;
  deliveryRate: number;
  replyRate: number;
  reputationDelta: number;
  lastUpdatedAt: Date;
}

/**
 * Read aggregated per-domain stats with a short cache. Returns null if no data.
 */
export async function getDomainReputation(domain: string): Promise<DomainStats | null> {
  const key = domain.toLowerCase();
  const existing = repCache.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    return existing.promise;
  }

  const promise = prisma.domainReputation
    .findUnique({ where: { domain: key } })
    .then((row) => {
      if (!row) return null;
      return {
        domain: row.domain,
        totalSent: row.totalSent,
        totalDelivered: row.totalDelivered,
        totalBounced: row.totalBounced,
        totalReplied: row.totalReplied,
        bounceRate: row.bounceRate,
        deliveryRate: row.deliveryRate,
        replyRate: row.replyRate,
        reputationDelta: row.reputationDelta,
        lastUpdatedAt: row.lastUpdatedAt,
      } as DomainStats;
    });

  repCache.set(key, { promise, expiresAt: Date.now() + CACHE_TTL_MS });
  return promise;
}

/**
 * Record a campaign-side outcome (SENT, DELIVERED, BOUNCED, REPLIED, etc.) for an
 * email and roll the aggregate up into DomainReputation. Called by webhook handlers
 * and queue-time send tracking.
 */
export async function recordCampaignOutcome(email: string, event: 'SENT' | 'DELIVERED' | 'BOUNCED' | 'OPENED' | 'CLICKED' | 'REPLIED' | 'COMPLAINT') {
  const domain = (email.split('@')[1] || '').toLowerCase();
  if (!domain) return;

  // Atomic upsert with field-specific increments
  const fields: Record<string, { increment: number }> = {};
  const now = new Date();
  const update: any = { lastUpdatedAt: now };

  if (event === 'SENT') fields.totalSent = { increment: 1 };
  else if (event === 'DELIVERED') {
    fields.totalDelivered = { increment: 1 };
    update.lastDeliveryAt = now;
  } else if (event === 'BOUNCED') {
    fields.totalBounced = { increment: 1 };
    update.lastBounceAt = now;
  } else if (event === 'OPENED') fields.totalOpened = { increment: 1 };
  else if (event === 'REPLIED') fields.totalReplied = { increment: 1 };
  else if (event === 'COMPLAINT') fields.totalComplaints = { increment: 1 };
  else return;

  await prisma.domainReputation.upsert({
    where: { domain },
    create: {
      domain,
      totalSent: event === 'SENT' ? 1 : 0,
      totalDelivered: event === 'DELIVERED' ? 1 : 0,
      totalBounced: event === 'BOUNCED' ? 1 : 0,
      totalOpened: event === 'OPENED' ? 1 : 0,
      totalReplied: event === 'REPLIED' ? 1 : 0,
      totalComplaints: event === 'COMPLAINT' ? 1 : 0,
      lastBounceAt: event === 'BOUNCED' ? now : null,
      lastDeliveryAt: event === 'DELIVERED' ? now : null,
    },
    update: { ...fields, ...update },
  });

  // Recompute rates + reputationDelta (cheap — single row)
  await recomputeRates(domain);

  // Invalidate cache for this domain
  repCache.delete(domain);
}

async function recomputeRates(domain: string) {
  const row = await prisma.domainReputation.findUnique({ where: { domain } });
  if (!row) return;
  const sent = Math.max(1, row.totalSent);
  const bounceRate = row.totalBounced / sent;
  const deliveryRate = row.totalDelivered / sent;
  const replyRate = row.totalReplied / sent;

  // Reputation delta: -30 (bad) to +20 (good). Used as a direct score modifier.
  let delta = 0;
  if (sent >= 5) {
    if (bounceRate > 0.20) delta -= 30;
    else if (bounceRate > 0.10) delta -= 15;
    else if (bounceRate > 0.05) delta -= 7;
    else if (bounceRate < 0.01 && deliveryRate > 0.95) delta += 12;
    if (replyRate > 0.05) delta += 8;
    if (row.totalComplaints > 0) delta -= 25;
  }

  await prisma.domainReputation.update({
    where: { domain },
    data: { bounceRate, deliveryRate, replyRate, reputationDelta: delta },
  });
}

/**
 * Backfill DomainReputation from existing EmailLog rows. Useful one-shot
 * after deploying the feature, and for periodic full recomputes.
 */
export async function backfillDomainReputation(): Promise<{ domains: number; rows: number }> {
  // Group logs by domain
  const logs = await prisma.emailLog.findMany({
    select: { toEmail: true, status: true, bouncedAt: true, deliveredAt: true, repliedAt: true, openedAt: true },
  });

  const agg = new Map<string, {
    sent: number; delivered: number; bounced: number; opened: number; replied: number;
    lastBounce: Date | null; lastDelivery: Date | null;
  }>();

  for (const log of logs) {
    const dom = (log.toEmail.split('@')[1] || '').toLowerCase();
    if (!dom) continue;
    if (!agg.has(dom)) {
      agg.set(dom, { sent: 0, delivered: 0, bounced: 0, opened: 0, replied: 0, lastBounce: null, lastDelivery: null });
    }
    const a = agg.get(dom)!;
    a.sent++;
    if (log.deliveredAt) { a.delivered++; if (!a.lastDelivery || log.deliveredAt > a.lastDelivery) a.lastDelivery = log.deliveredAt; }
    if (log.bouncedAt) { a.bounced++; if (!a.lastBounce || log.bouncedAt > a.lastBounce) a.lastBounce = log.bouncedAt; }
    if (log.openedAt) a.opened++;
    if (log.repliedAt) a.replied++;
  }

  let rows = 0;
  for (const [domain, a] of agg) {
    const bounceRate = a.bounced / Math.max(1, a.sent);
    const deliveryRate = a.delivered / Math.max(1, a.sent);
    const replyRate = a.replied / Math.max(1, a.sent);
    let delta = 0;
    if (a.sent >= 5) {
      if (bounceRate > 0.20) delta -= 30;
      else if (bounceRate > 0.10) delta -= 15;
      else if (bounceRate > 0.05) delta -= 7;
      else if (bounceRate < 0.01 && deliveryRate > 0.95) delta += 12;
      if (replyRate > 0.05) delta += 8;
    }
    await prisma.domainReputation.upsert({
      where: { domain },
      create: {
        domain,
        totalSent: a.sent,
        totalDelivered: a.delivered,
        totalBounced: a.bounced,
        totalOpened: a.opened,
        totalReplied: a.replied,
        bounceRate, deliveryRate, replyRate, reputationDelta: delta,
        lastBounceAt: a.lastBounce,
        lastDeliveryAt: a.lastDelivery,
      },
      update: {
        totalSent: a.sent,
        totalDelivered: a.delivered,
        totalBounced: a.bounced,
        totalOpened: a.opened,
        totalReplied: a.replied,
        bounceRate, deliveryRate, replyRate, reputationDelta: delta,
        lastBounceAt: a.lastBounce,
        lastDeliveryAt: a.lastDelivery,
      },
    });
    rows++;
  }

  repCache.clear();
  return { domains: agg.size, rows };
}
