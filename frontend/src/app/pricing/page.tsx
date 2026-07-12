"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bitcoin, Check, HelpCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { createPaymentoCheckout, getBillingSummary, getPlans, type BillingSummary, type PlanCatalogItem, type Tier } from "@/lib/billing";
import { ApiError } from "@/lib/outbound";

const FEATURES: Record<Tier, string[]> = {
  trial: ["7 days free", "15 searches", "Up to 500 stored leads", "25 email sends per day", "1 sender account"],
  starter: ["100 searches per month", "Search depth up to 50", "Up to 5,000 stored leads", "200 email sends per day", "2 sender accounts"],
  pro: ["500 searches per month", "Full search depth", "Up to 50,000 stored leads", "1,000 email sends per day", "10 sender accounts"],
};

export default function PricingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [cryptoDays, setCryptoDays] = useState(30);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlans().then((result) => {
      setPlans(result.plans);
      setConfigured(result.cryptoConfigured);
      setCryptoDays(result.cryptoAccessDays);
    }).catch(() => setError("Could not load the plan catalogue."));
  }, []);
  useEffect(() => { if (user) getBillingSummary().then(setSummary).catch(() => {}); }, [user]);

  async function checkout(tier: Tier) {
    if (!user) { router.push("/register"); return; }
    setBusy(tier); setError(null);
    try {
      const result = await createPaymentoCheckout(tier);
      const url = new URL(result.checkoutUrl);
      if (url.origin !== "https://app.paymento.io" || url.pathname !== "/gateway") throw new Error("Invalid checkout destination.");
      window.location.assign(url.toString());
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Could not start checkout.");
    } finally {
      setBusy(null);
    }
  }

  const paid = plans.filter((plan) => plan.purchasable);
  const activePro = summary?.tier === "pro" && summary.status === "active";

  return (
    <div className="min-h-screen bg-bg text-text py-16 px-4 relative overflow-hidden">
      <div className="glow-bg w-[400px] h-[400px] bg-brand/10 top-[-50px] right-[-50px]" />
      <div className="max-w-7xl mx-auto relative z-10">
        <Link href={user ? "/overview" : "/"} className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text"><ArrowLeft className="w-4 h-4" />Back</Link>
        <header className="text-center max-w-3xl mx-auto my-12">
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-brand-soft text-brand border border-brand/20">No card required — crypto only</span>
          <h1 className="text-4xl md:text-6xl font-black mt-5 mb-5">Choose your access</h1>
          <p className="text-text-muted text-lg">Start with the free trial or make a one-time Paymento crypto payment. Paid purchases add {cryptoDays} days; nothing renews automatically.</p>
        </header>

        {!configured && <div className="max-w-2xl mx-auto mb-8 text-center text-sm text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-xl py-3 px-4">Crypto checkout is unavailable until the rotated Paymento credentials are configured.</div>}
        {error && <div className="max-w-2xl mx-auto mb-8 text-center text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl py-3 px-4">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-20">
          <PlanCard name="Free Trial" price="$0" detail="7 days" features={FEATURES.trial}>
            <Link href={user ? "/overview" : "/register"} className="block w-full py-3 rounded-xl bg-surface border border-border text-center text-sm font-bold">{user ? "Continue with trial" : "Create account"}</Link>
          </PlanCard>

          {paid.map((plan) => {
            const blockedDowngrade = plan.tier === "starter" && activePro;
            const sameTier = summary?.tier === plan.tier && summary.status === "active";
            return (
              <PlanCard key={plan.tier} name={plan.label} price={`$${plan.priceUSD}`} detail={`one-time · ${cryptoDays} days`} features={FEATURES[plan.tier]} featured={plan.tier === "pro"}>
                <button onClick={() => checkout(plan.tier)} disabled={busy !== null || !configured || blockedDowngrade} className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 ${plan.tier === "pro" ? "bg-brand text-bg" : "bg-surface border border-border"}`}>
                  {busy === plan.tier ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bitcoin className="w-4 h-4" />}
                  {blockedDowngrade ? "Available after Pro expires" : sameTier ? `Add ${cryptoDays} days` : `Pay crypto for ${plan.label}`}
                </button>
              </PlanCard>
            );
          })}
        </div>

        <section className="max-w-4xl mx-auto border-t border-border pt-14 grid md:grid-cols-2 gap-6 text-sm">
          {[
            ["Does this renew?", "No. Every Paymento checkout is a one-time crypto payment that adds a fixed access period."],
            ["How do upgrades work?", `Starter to Pro applies immediately and preserves remaining access while adding ${cryptoDays} days.`],
            ["Can I downgrade?", "Pro cannot be downgraded while active. Starter becomes available after Pro access expires."],
            ["When is access granted?", "Only after a signed Paymento notification is independently verified as paid or approved."],
          ].map(([question, answer]) => <div key={question} className="bg-surface border border-border rounded-xl p-6"><h2 className="font-bold flex gap-2 mb-2"><HelpCircle className="w-4 h-4 text-brand" />{question}</h2><p className="text-text-muted">{answer}</p></div>)}
        </section>
      </div>
    </div>
  );
}

function PlanCard({ name, price, detail, features, featured, children }: { name: string; price: string; detail: string; features: string[]; featured?: boolean; children: React.ReactNode }) {
  return <div className={`glass rounded-2xl p-8 border flex flex-col justify-between ${featured ? "border-brand/40" : "border-border"}`}><div><h2 className="text-xl font-bold">{name}</h2><div className="my-6"><span className={`text-4xl font-black ${featured ? "text-brand" : ""}`}>{price}</span><span className="text-sm text-text-muted ml-2">{detail}</span></div><ul className="space-y-3 mb-8 text-sm text-text-muted">{features.map((feature) => <li key={feature} className="flex gap-2"><Check className="w-4 h-4 text-success shrink-0" />{feature}</li>)}</ul></div>{children}</div>;
}
