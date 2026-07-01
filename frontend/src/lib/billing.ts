// Frontend billing client: plan catalogue, current subscription summary, and the
// checkout calls — cards via Paddle, crypto via Coinbase Commerce. All go through
// fetchOutbound so the Bearer token + 402 upgrade handling are shared app-wide.
import { fetchOutbound } from "@/lib/outbound";

export type Tier = "trial" | "starter" | "pro";

export interface PlanLimits {
  searchesPerMonth: number;
  maxDepth: number;
  leadCap: number;
  sendsPerDay: number;
  senderCap: number;
}

export interface PlanCatalogItem {
  tier: Tier;
  label: string;
  priceUSD: number;
  purchasable: boolean;
  configured: boolean;
  limits: PlanLimits;
}

export interface PlansResponse {
  plans: PlanCatalogItem[];
  cardConfigured: boolean;
  cryptoConfigured: boolean;
  cryptoAccessDays: number;
}

export interface UsageMetric { used: number; limit: number }

export interface BillingSummary {
  tier: Tier;
  status: string;
  canSpend: boolean;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  currentPeriodEnd: string | null;
  limits: PlanLimits;
  usage: {
    searches: UsageMetric;
    leads: UsageMetric;
    sends: UsageMetric;
    senders: UsageMetric;
  };
}

export function getPlans(): Promise<PlansResponse> {
  return fetchOutbound<PlansResponse>("/api/billing/plans");
}

export function getBillingSummary(): Promise<BillingSummary> {
  return fetchOutbound<BillingSummary>("/api/billing/me");
}

export interface CheckoutResponse {
  provider: "paddle" | "coinbase";
  checkoutUrl: string | null;
  tier: Tier;
}

// Card checkout via Paddle — returns a hosted checkout URL to redirect to.
export function subscribe(tier: Tier): Promise<CheckoutResponse> {
  return fetchOutbound("/api/billing/subscribe", {
    method: "POST",
    body: JSON.stringify({ tier }),
  });
}

// Crypto checkout via Coinbase Commerce — returns a hosted charge URL.
export function createCryptoCharge(tier: Tier): Promise<CheckoutResponse> {
  return fetchOutbound("/api/billing/crypto/charge", {
    method: "POST",
    body: JSON.stringify({ tier }),
  });
}

export function cancelSubscription(): Promise<{ ok: boolean; message: string }> {
  return fetchOutbound("/api/billing/cancel", { method: "POST" });
}
