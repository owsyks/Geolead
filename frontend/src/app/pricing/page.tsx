"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Bitcoin, Check, Clock3, HelpCircle,
  Loader2, LockKeyhole, ShieldCheck, Sparkles, Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { createPaymentoCheckout, getBillingSummary, getPlans, type BillingSummary, type PlanCatalogItem, type Tier } from "@/lib/billing";
import { ApiError } from "@/lib/outbound";

const DISPLAY = "'Barlow Condensed', 'Geist', sans-serif";

const FEATURES: Record<Tier, string[]> = {
  trial: ["15 searches during the trial", "Search depth up to 25", "Up to 500 stored leads", "25 email sends per day", "1 sender account"],
  starter: ["100 searches per month", "Search depth up to 50", "Up to 5,000 stored leads", "200 email sends per day", "2 sender accounts"],
  pro: ["500 searches per month", "Full search depth up to 200", "Up to 50,000 stored leads", "1,000 email sends per day", "10 sender accounts"],
};

const FALLBACK: PlanCatalogItem[] = [
  { tier: "trial", label: "Free Trial", priceUSD: 0, purchasable: false, configured: true, limits: { searchesPerMonth: 15, maxDepth: 25, leadCap: 500, sendsPerDay: 25, senderCap: 1 } },
  { tier: "starter", label: "Starter", priceUSD: 7, purchasable: true, configured: false, limits: { searchesPerMonth: 100, maxDepth: 50, leadCap: 5000, sendsPerDay: 200, senderCap: 2 } },
  { tier: "pro", label: "Pro", priceUSD: 15, purchasable: true, configured: false, limits: { searchesPerMonth: 500, maxDepth: 200, leadCap: 50000, sendsPerDay: 1000, senderCap: 10 } },
];

export default function PricingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<PlanCatalogItem[]>(FALLBACK);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [cryptoDays, setCryptoDays] = useState(30);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlans().then((result) => {
      setPlans(result.plans);
      setConfigured(result.cryptoConfigured);
      setCryptoDays(result.cryptoAccessDays);
    }).catch(() => setError("The live plan catalogue could not be loaded. Purchasing is disabled."));
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

  const activePro = summary?.tier === "pro" && summary.status === "active";

  return (
    <div className="min-h-screen bg-bg text-text relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-52 right-[-10%] h-[520px] w-[520px] rounded-full bg-brand/10 blur-[130px]" />
        <div className="absolute bottom-[-25%] left-[-10%] h-[500px] w-[500px] rounded-full bg-copper/8 blur-[140px]" />
        <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)", backgroundSize: "36px 36px" }} />
      </div>

      <nav className="relative z-20 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto h-16 px-5 lg:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="GeoLead AI" className="w-8 h-8 object-contain" />
            <span className="font-black tracking-tight">GeoLead AI</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href={user ? "/overview" : "/"} className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-text-muted hover:text-text transition-colors">
              <ArrowLeft className="w-4 h-4" /> {user ? "Dashboard" : "Home"}
            </Link>
            {!user && <Link href="/login" className="hidden sm:block px-4 py-2 text-sm font-semibold text-text-muted hover:text-text">Sign in</Link>}
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-5 lg:px-8 py-14 lg:py-20">
        <header className="grid lg:grid-cols-[1.15fr_0.85fr] gap-10 lg:gap-20 items-end mb-14">
          <div>
            <div className="inline-flex items-center gap-2 border border-brand/30 bg-brand/8 px-3 py-1 rounded-sm text-[10px] font-mono font-black uppercase tracking-[0.16em] text-brand">
              <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" /> Simple pricing · crypto only
            </div>
            <h1 className="mt-5 text-[clamp(3.5rem,8vw,7rem)] font-black uppercase leading-[0.86] tracking-[-0.035em]" style={{ fontFamily: DISPLAY }}>
              Start free.<br /><span className="text-brand">Scale on demand.</span>
            </h1>
          </div>
          <div className="lg:pb-2">
            <p className="text-base lg:text-lg text-text-muted leading-relaxed max-w-lg">Seven days to test the full workflow. Paid access is a one-time crypto purchase—no card, subscription, or surprise renewal.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-mono text-text-muted">
              <TrustPill icon={<LockKeyhole />} text="Hosted Paymento checkout" />
              <TrustPill icon={<ShieldCheck />} text="Signed payment verification" />
              <TrustPill icon={<Clock3 />} text={`${cryptoDays}-day access`} />
            </div>
          </div>
        </header>

        {error && <div className="mb-6 border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}
        {configured === false && <div className="mb-6 border border-copper/30 bg-copper/10 px-4 py-3 text-sm text-copper">Checkout is temporarily unavailable. Plan details remain visible.</div>}

        <section className="grid lg:grid-cols-3 gap-px bg-border border border-border">
          {plans.map((plan) => {
            const featured = plan.tier === "pro";
            const current = summary?.tier === plan.tier && (summary.status === "active" || summary.status === "trialing");
            const blocked = plan.tier === "starter" && activePro;
            return (
              <article key={plan.tier} className={`relative bg-bg p-7 lg:p-9 flex flex-col min-h-[570px] ${featured ? "ring-1 ring-inset ring-brand/60" : ""}`}>
                {featured && <div className="absolute inset-x-0 top-0 h-1 bg-brand shadow-[0_0_20px_rgba(20,184,166,0.65)]" />}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-text-faint">{plan.tier === "trial" ? "Explore" : plan.tier === "starter" ? "Operate" : "Scale"}</div>
                    <h2 className={`mt-2 text-2xl font-black ${featured ? "text-brand" : "text-text"}`}>{plan.label}</h2>
                  </div>
                  {featured && <span className="bg-brand text-bg px-2.5 py-1 text-[9px] font-black uppercase tracking-wider">Best value</span>}
                </div>

                <div className="my-8 border-y border-border py-6">
                  <div className="flex items-end gap-2">
                    <span className="text-6xl font-black leading-none tabular-nums" style={{ fontFamily: DISPLAY }}>${plan.priceUSD}</span>
                    <span className="text-xs text-text-muted mb-1.5">{plan.tier === "trial" ? "/ 7 days" : `/ ${cryptoDays} days`}</span>
                  </div>
                  <p className="mt-3 text-xs text-text-muted">{plan.tier === "trial" ? "Created automatically after verified signup." : "One-time payment. Add more time whenever needed."}</p>
                </div>

                <ul className="space-y-3.5 text-sm text-text-muted flex-1">
                  {FEATURES[plan.tier].map((feature) => <li key={feature} className="flex gap-2.5"><Check className={`w-4 h-4 shrink-0 mt-0.5 ${featured ? "text-brand" : "text-success"}`} />{feature}</li>)}
                </ul>

                <div className="mt-8">
                  {plan.tier === "trial" ? (
                    <Link href={user ? "/overview" : "/register"} className="h-12 w-full border border-border bg-surface hover:bg-surface-2 flex items-center justify-center gap-2 text-sm font-bold transition-colors">
                      {user ? "Continue with trial" : "Create verified account"} <ArrowRight className="w-4 h-4" />
                    </Link>
                  ) : (
                    <button onClick={() => checkout(plan.tier)} disabled={busy !== null || configured !== true || blocked} className={`h-12 w-full flex items-center justify-center gap-2 text-sm font-black transition-all disabled:opacity-50 ${featured ? "bg-brand text-bg hover:bg-brand-hover shadow-[0_0_24px_rgba(20,184,166,0.25)]" : "border border-border bg-surface hover:border-brand/40 hover:text-brand"}`}>
                      {busy === plan.tier ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bitcoin className="w-4 h-4" />}
                      {blocked ? "Available after Pro expires" : current ? `Add ${cryptoDays} days` : `Choose ${plan.label}`}
                    </button>
                  )}
                  {current && <div className="mt-2 text-center text-[10px] font-mono font-bold uppercase tracking-wider text-brand">Current access</div>}
                </div>
              </article>
            );
          })}
        </section>

        <section className="mt-20 grid lg:grid-cols-[300px_1fr] gap-10 lg:gap-16 border-t border-border pt-12">
          <div><div className="inline-flex items-center gap-2 text-brand text-xs font-mono font-bold uppercase"><HelpCircle className="w-4 h-4" /> Payment rules</div><h2 className="mt-3 text-4xl font-black uppercase leading-none" style={{ fontFamily: DISPLAY }}>Clear before<br />you pay.</h2></div>
          <div className="grid sm:grid-cols-2 gap-px bg-border border border-border">
            {[
              ["No renewal", "Every checkout is a one-time crypto payment. We never store a card or charge automatically."],
              ["Immediate upgrade", `Starter to Pro applies immediately, preserves remaining access, and adds ${cryptoDays} days.`],
              ["Safe downgrade", "Active Pro access cannot be replaced by Starter. Starter becomes available after Pro expires."],
              ["Verified fulfillment", "Access is granted only after Paymento signs the callback and the backend independently verifies payment."],
            ].map(([question, answer], index) => <div key={question} className="bg-bg p-6"><div className="text-[10px] font-mono text-brand">0{index + 1}</div><h3 className="mt-2 font-black">{question}</h3><p className="mt-2 text-sm text-text-muted leading-relaxed">{answer}</p></div>)}
          </div>
        </section>

        <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border pt-6 text-[11px] font-mono text-text-faint">
          <span className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-brand" /> Access activates after blockchain confirmation</span>
          <span className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-brand" /> Prices and limits come from the live API</span>
        </div>
      </main>
    </div>
  );
}

function TrustPill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <span className="inline-flex items-center gap-1.5 border border-border bg-surface px-2.5 py-1.5 [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:text-brand">{icon}{text}</span>;
}
