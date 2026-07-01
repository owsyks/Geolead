// Billing/entitlements engine. Resolves the effective plan a user is on (trial,
// paid, or expired), derives current usage from existing tables (no counter
// drift), and exposes fail-closed assertions the middleware + services call
// before any cost-bearing action. Money-affecting decisions live here, not in
// the routes.
import prisma from '../config/db.js';
import { PLANS, planFor, TRIAL_DAYS, type PlanLimits, type Tier } from '../config/plans.js';

export type QuotaMetric = 'searches' | 'senders' | 'sends' | 'leads';

// Typed errors → HTTP 402 in the middleware. Never leak these as 500s.
export class PlanRequiredError extends Error {
  code = 'PLAN_REQUIRED';
  constructor(public tier: Tier, public status: string) {
    super('Your trial has ended. Upgrade to continue.');
  }
}

export class QuotaError extends Error {
  code = 'QUOTA_EXCEEDED';
  constructor(public metric: QuotaMetric, public limit: number, public used: number, public tier: Tier) {
    super(`You've reached your plan limit for ${metric} (${used}/${limit}). Upgrade for more.`);
  }
}

export interface Entitlements {
  tier: Tier;            // effective feature tier (trial/starter/pro)
  status: string;        // planStatus: trialing | active | past_due | canceled | expired
  canSpend: boolean;     // false ⇒ every cost-bearing action is blocked
  trialEndsAt: Date | null;
  trialDaysLeft: number | null;
  currentPeriodEnd: Date | null;
  limits: PlanLimits;
}

// Resolve what a user is actually entitled to *right now*. A trialing user whose
// trialEndsAt has passed (and who never subscribed) collapses to `expired` with
// canSpend=false — the fail-closed default.
export async function getEntitlements(userId: string): Promise<Entitlements> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planStatus: true, trialEndsAt: true, currentPeriodEnd: true },
  });
  if (!user) {
    // Unknown user ⇒ no capacity. (requireAuth should prevent this.)
    return blockedEntitlements('expired', 'trial');
  }

  const now = new Date();
  const paidTier: Tier = user.plan === 'pro' ? 'pro' : user.plan === 'starter' ? 'starter' : 'trial';

  // Active paid plan (card subscription or a crypto payment still within its
  // access window). Crypto is one-time, so an active plan whose currentPeriodEnd
  // has passed with no renewal collapses to expired (fail-closed).
  if (user.planStatus === 'active' && (user.plan === 'starter' || user.plan === 'pro')) {
    const expired = user.currentPeriodEnd != null && user.currentPeriodEnd <= now;
    if (!expired) {
      return {
        tier: paidTier,
        status: 'active',
        canSpend: true,
        trialEndsAt: user.trialEndsAt ?? null,
        trialDaysLeft: null,
        currentPeriodEnd: user.currentPeriodEnd ?? null,
        limits: planFor(paidTier),
      };
    }
    return blockedEntitlements('expired', paidTier);
  }

  // On trial and still within the window.
  if (user.planStatus === 'trialing' && user.trialEndsAt && user.trialEndsAt > now) {
    return {
      tier: 'trial',
      status: 'trialing',
      canSpend: true,
      trialEndsAt: user.trialEndsAt,
      trialDaysLeft: Math.max(0, Math.ceil((user.trialEndsAt.getTime() - now.getTime()) / (24 * 3600 * 1000))),
      currentPeriodEnd: null,
      limits: planFor('trial'),
    };
  }

  // Everything else (trial expired, past_due, canceled, expired) ⇒ blocked.
  const status = user.planStatus === 'trialing' ? 'expired' : user.planStatus;
  return blockedEntitlements(status, paidTier);
}

function blockedEntitlements(status: string, tier: Tier): Entitlements {
  return {
    tier,
    status,
    canSpend: false,
    trialEndsAt: null,
    trialDaysLeft: 0,
    currentPeriodEnd: null,
    limits: planFor(tier),
  };
}

// Start of the current UTC calendar month — the window for monthly metrics.
function monthStart(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function dayStart(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export interface Usage {
  searches: number;  // this calendar month
  leads: number;     // total stored
  sends: number;     // today
  senders: number;   // active/warming senders
}

// Derive live usage from the source tables. Cheap counts, no separate ledger.
export async function getUsage(userId: string): Promise<Usage> {
  const [searches, leads, sends, senders] = await Promise.all([
    prisma.searchTask.count({ where: { userId, createdAt: { gte: monthStart() } } }),
    prisma.lead.count({ where: { ownerId: userId } }),
    prisma.emailLog.count({ where: { sentAt: { gte: dayStart() }, senderAccount: { userId } } }),
    prisma.senderAccount.count({ where: { userId, status: { in: ['active', 'warming'] } } }),
  ]);
  return { searches, leads, sends, senders };
}

function limitFor(metric: QuotaMetric, limits: PlanLimits): number {
  switch (metric) {
    case 'searches': return limits.searchesPerMonth;
    case 'senders': return limits.senderCap;
    case 'sends': return limits.sendsPerDay;
    case 'leads': return limits.leadCap;
  }
}

// Count only the metric we need, so assertQuota stays a single cheap query.
async function usedFor(userId: string, metric: QuotaMetric): Promise<number> {
  switch (metric) {
    case 'searches': return prisma.searchTask.count({ where: { userId, createdAt: { gte: monthStart() } } });
    case 'senders': return prisma.senderAccount.count({ where: { userId, status: { in: ['active', 'warming'] } } });
    case 'sends': return prisma.emailLog.count({ where: { sentAt: { gte: dayStart() }, senderAccount: { userId } } });
    case 'leads': return prisma.lead.count({ where: { ownerId: userId } });
  }
}

// Throw PlanRequiredError if the user can't spend at all (fail-closed).
export async function assertCanSpend(userId: string): Promise<Entitlements> {
  const ent = await getEntitlements(userId);
  if (!ent.canSpend) throw new PlanRequiredError(ent.tier, ent.status);
  return ent;
}

// Throw QuotaError if adding `delta` would exceed the tier's limit for `metric`.
// Always checks canSpend first. Returns the resolved entitlements for reuse.
export async function assertQuota(userId: string, metric: QuotaMetric, delta = 1): Promise<Entitlements> {
  const ent = await assertCanSpend(userId);
  const limit = limitFor(metric, ent.limits);
  const used = await usedFor(userId, metric);
  if (used + delta > limit) throw new QuotaError(metric, limit, used, ent.tier);
  return ent;
}

// Full snapshot for the billing UI: plan + status + usage vs each limit.
export async function getBillingSummary(userId: string) {
  const [ent, usage] = await Promise.all([getEntitlements(userId), getUsage(userId)]);
  return {
    tier: ent.tier,
    status: ent.status,
    canSpend: ent.canSpend,
    trialEndsAt: ent.trialEndsAt,
    trialDaysLeft: ent.trialDaysLeft,
    currentPeriodEnd: ent.currentPeriodEnd,
    limits: ent.limits,
    usage: {
      searches: { used: usage.searches, limit: ent.limits.searchesPerMonth },
      leads: { used: usage.leads, limit: ent.limits.leadCap },
      sends: { used: usage.sends, limit: ent.limits.sendsPerDay },
      senders: { used: usage.senders, limit: ent.limits.senderCap },
    },
  };
}

// Convenience for register: the trial end timestamp for a brand-new user.
export function trialEndFromNow(): Date {
  return new Date(Date.now() + TRIAL_DAYS * 24 * 3600 * 1000);
}

export { PLANS };
