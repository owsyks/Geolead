// Single source of truth for plan tiers, limits, and pricing. Everything that
// enforces "what can this user do" reads from here — change a number and the
// whole app (search dispatch, sender caps, send caps, lead caps, billing UI)
// follows. Usage is derived from existing tables (SearchTask/Lead/EmailLog/
// SenderAccount) in billing.ts, so these are pure limits with no counter state.
//
// Payments: cards via Paddle Billing (recurring, priced by paddlePriceId), and
// crypto via Coinbase Commerce (one-time payment granting CRYPTO_ACCESS_DAYS of
// the tier, since crypto can't auto-charge on a schedule).

export type Tier = 'trial' | 'starter' | 'pro';

// A confirmed crypto payment grants this many days of the purchased tier.
export const CRYPTO_ACCESS_DAYS = Number(process.env.CRYPTO_ACCESS_DAYS || 30);

export interface PlanLimits {
  searchesPerMonth: number;
  maxDepth: number;
  leadCap: number;
  sendsPerDay: number;
  senderCap: number;
}

export interface PlanDef extends PlanLimits {
  tier: Tier;
  label: string;
  priceUSD: number; // monthly (card) / per-purchase (crypto); 0 for trial
  // Paddle Billing price id, injected from env for paid tiers. null for trial.
  paddlePriceId: string | null;
  purchasable: boolean;
}

// 7-day, no-card trial grants the Starter feature set but with tighter caps.
export const TRIAL_DAYS = 7;

export const PLANS: Record<Tier, PlanDef> = {
  trial: {
    tier: 'trial',
    label: 'Free Trial',
    priceUSD: 0,
    paddlePriceId: null,
    purchasable: false,
    searchesPerMonth: 15,
    maxDepth: 25,
    leadCap: 500,
    sendsPerDay: 25,
    senderCap: 1,
  },
  starter: {
    tier: 'starter',
    label: 'Starter',
    priceUSD: 49,
    paddlePriceId: process.env.PADDLE_PRICE_STARTER_ID || null,
    purchasable: true,
    searchesPerMonth: 100,
    maxDepth: 50,
    leadCap: 5000,
    sendsPerDay: 200,
    senderCap: 2,
  },
  pro: {
    tier: 'pro',
    label: 'Pro',
    priceUSD: 149,
    paddlePriceId: process.env.PADDLE_PRICE_PRO_ID || null,
    purchasable: true,
    searchesPerMonth: 500,
    maxDepth: 200,
    leadCap: 50000,
    sendsPerDay: 1000,
    senderCap: 10,
  },
};

export const PURCHASABLE_TIERS: Tier[] = ['starter', 'pro'];

export function isTier(value: unknown): value is Tier {
  return value === 'trial' || value === 'starter' || value === 'pro';
}

export function planFor(tier: Tier): PlanDef {
  return PLANS[tier];
}
