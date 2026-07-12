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

export function createPaymentoCheckout(tier: Tier): Promise<{ provider: "paymento"; checkoutUrl: string; tier: Tier }> {
  return fetchOutbound("/api/billing/paymento/checkout", {
    method: "POST",
    body: JSON.stringify({ tier }),
  });
}
