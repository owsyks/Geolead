"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Check, HelpCircle, ArrowLeft, Loader2, CreditCard, Bitcoin } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getPlans, subscribe, createCryptoCharge, type PlanCatalogItem, type Tier } from "@/lib/billing";
import { ApiError } from "@/lib/outbound";

type PayMethod = "card" | "crypto";

const FEATURE_LINES: Record<Tier, string[]> = {
  trial: [
    "7 days free — no card required",
    "15 searches for the whole trial",
    "Search depth up to 25",
    "Up to 500 stored leads",
    "25 email sends / day",
  ],
  starter: [
    "100 searches / month",
    "Search depth up to 50",
    "Up to 5,000 stored leads",
    "200 email sends / day",
    "2 sender accounts",
    "AI email generation + scoring",
  ],
  pro: [
    "500 searches / month",
    "Full search depth (200)",
    "Up to 50,000 stored leads",
    "1,000 email sends / day",
    "10 sender accounts",
    "Priority AI + all features",
  ],
};

export default function PricingPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [cardReady, setCardReady] = useState(true);
  const [cryptoReady, setCryptoReady] = useState(true);
  const [cryptoDays, setCryptoDays] = useState(30);
  const [busy, setBusy] = useState<{ tier: Tier; method: PayMethod } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlans()
      .then((res) => {
        setPlans(res.plans);
        setCardReady(res.cardConfigured);
        setCryptoReady(res.cryptoConfigured);
        setCryptoDays(res.cryptoAccessDays);
      })
      .catch(() => {/* fall back to static copy below */});
  }, []);

  const priceFor = (tier: Tier, fallback: number) =>
    plans.find((p) => p.tier === tier)?.priceUSD ?? fallback;

  async function handleCheckout(tier: Tier, method: PayMethod) {
    setError(null);
    // Logged-out visitors register first (they start on the free trial).
    if (!user) {
      window.location.href = "/register";
      return;
    }
    setBusy({ tier, method });
    try {
      const res = method === "card" ? await subscribe(tier) : await createCryptoCharge(tier);
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl; // hand off to Paddle / Coinbase
      } else {
        setError("Could not start checkout. Please try again.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start checkout.");
    } finally {
      setBusy(null);
    }
  }

  const cards: Array<{ tier: Tier; name: string; blurb: string; price: number; featured?: boolean; cta: string }> = [
    { tier: "starter", name: "Starter", blurb: "Perfect for individual domain flippers.", price: priceFor("starter", 49), cta: "Choose Starter" },
    { tier: "pro", name: "Pro", blurb: "For professional brokers and agencies.", price: priceFor("pro", 149), featured: true, cta: "Choose Pro" },
  ];

  return (
    <div className="min-h-screen bg-bg text-text py-16 px-4 relative overflow-hidden">
      <div className="glow-bg w-[400px] h-[400px] bg-brand/10 top-[-50px] right-[-50px]" />
      <div className="glow-bg w-[400px] h-[400px] bg-brand/10 bottom-[-50px] left-[-50px]" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="mb-12">
          <Link href={user ? "/overview" : "/"} className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text transition-colors">
            <ArrowLeft className="w-4 h-4" /> {user ? "Back to Dashboard" : "Back to Landing Page"}
          </Link>
        </div>

        <div className="text-center max-w-3xl mx-auto mb-12">
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-brand-soft text-brand border border-brand/20 inline-block mb-4">
            Start free — 7-day trial, no card required
          </span>
          <h1 className="text-4xl md:text-6xl font-black mb-6 text-text">
            Choose the Perfect Plan for Outbound Growth
          </h1>
          <p className="text-text-muted text-lg">
            Every account starts on a free 7-day trial. Upgrade any time to lift your limits.
          </p>
        </div>

        {!cardReady && !cryptoReady && (
          <div className="max-w-2xl mx-auto mb-8 text-center text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg py-2 px-4">
            Checkout is being finalized. Plans are visible but purchasing is temporarily unavailable.
          </div>
        )}
        {error && (
          <div className="max-w-2xl mx-auto mb-8 text-center text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg py-2 px-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-20">
          {/* Free trial card */}
          <div className="glass rounded-2xl p-8 border border-border flex flex-col justify-between relative">
            <div>
              <h3 className="text-xl font-bold text-text mb-2">Free Trial</h3>
              <p className="text-xs text-text-muted mb-6">Try the full workflow for a week.</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-4xl font-extrabold text-text">$0</span>
                <span className="text-text-muted text-sm">/ 7 days</span>
              </div>
              <ul className="space-y-4 text-sm text-text-muted">
                {FEATURE_LINES.trial.map((f) => (
                  <li key={f} className="flex items-center gap-2"><Check className="w-4 h-4 text-success shrink-0" /> {f}</li>
                ))}
              </ul>
            </div>
            <Link
              href={user ? "/overview" : "/register"}
              className="mt-8 w-full py-3 rounded-xl bg-surface border border-border text-text-muted hover:text-text hover:bg-surface-2 text-center text-sm font-bold transition-colors block"
            >
              {user ? "You're on it" : "Start free trial"}
            </Link>
          </div>

          {/* Paid cards */}
          {cards.map((card) => (
            <div
              key={card.tier}
              className={`glass rounded-2xl p-8 border flex flex-col justify-between relative ${
                card.featured ? "border-brand/30 shadow-[0_0_24px_rgba(20,184,166,0.12)]" : "border-border"
              }`}
            >
              {card.featured && (
                <span className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 px-3 py-1 rounded-full text-[10px] font-bold bg-brand text-bg uppercase tracking-wider">
                  Most Popular
                </span>
              )}
              <div>
                <h3 className="text-xl font-bold text-text mb-2">{card.name}</h3>
                <p className="text-xs text-text-muted mb-6">{card.blurb}</p>
                <div className="flex items-baseline gap-1 mb-8">
                  <span className={`text-4xl font-extrabold ${card.featured ? "text-brand" : "text-text"}`}>${card.price}</span>
                  <span className="text-text-muted text-sm">/ month</span>
                </div>
                <ul className="space-y-4 text-sm text-text-muted">
                  {FEATURE_LINES[card.tier].map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className={`w-4 h-4 shrink-0 ${card.featured ? "text-brand" : "text-success"}`} /> {f}
                    </li>
                  ))}
                </ul>
              </div>
              {!user ? (
                <button
                  onClick={() => handleCheckout(card.tier, "card")}
                  className={`mt-8 w-full py-3 rounded-xl text-center text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                    card.featured
                      ? "bg-brand text-bg hover:bg-brand-hover shadow-[0_0_12px_rgba(20,184,166,0.3)]"
                      : "bg-surface border border-border text-text-muted hover:text-text hover:bg-surface-2"
                  }`}
                >
                  Start free trial
                </button>
              ) : (
                <div className="mt-8 space-y-2">
                  <button
                    onClick={() => handleCheckout(card.tier, "card")}
                    disabled={busy !== null || !cardReady}
                    className={`w-full py-3 rounded-xl text-center text-sm font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-2 ${
                      card.featured
                        ? "bg-brand text-bg hover:bg-brand-hover shadow-[0_0_12px_rgba(20,184,166,0.3)]"
                        : "bg-surface border border-border text-text-muted hover:text-text hover:bg-surface-2"
                    }`}
                  >
                    {busy?.tier === card.tier && busy?.method === "card"
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <CreditCard className="w-4 h-4" />}
                    Pay by card
                  </button>
                  <button
                    onClick={() => handleCheckout(card.tier, "crypto")}
                    disabled={busy !== null || !cryptoReady}
                    className="w-full py-3 rounded-xl text-center text-sm font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-2 bg-surface border border-border text-text-muted hover:text-text hover:bg-surface-2"
                    title={`One crypto payment = ${cryptoDays} days of ${card.name}`}
                  >
                    {busy?.tier === card.tier && busy?.method === "crypto"
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Bitcoin className="w-4 h-4" />}
                    Pay with crypto
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="max-w-4xl mx-auto border-t border-border pt-16">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12 text-text">Frequently Asked Questions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
            {[
              { q: "How does the free trial work?", a: "Every new account gets 7 days on the trial — no credit card needed. When it ends, upgrade to Starter or Pro to keep searching and sending." },
              { q: "Are the extracted emails GDPR compliant?", a: "GeoLead AI only crawls public webpages for publicly available business contact info, and every outbound email includes a working unsubscribe link and postal address." },
              { q: "Can I cancel anytime?", a: "Yes. Cancel from your billing settings; your plan stays active until the end of the current period and won't renew." },
              { q: "What happens if I hit a limit?", a: "Actions that would exceed your plan (searches, sends, senders) are blocked with a prompt to upgrade. You never get surprise charges." },
            ].map((faq, idx) => (
              <div key={idx} className="bg-surface border border-border p-6 rounded-xl">
                <h4 className="font-bold text-text mb-2 flex items-center gap-2">
                  <HelpCircle className="w-4.5 h-4.5 text-brand shrink-0" /> {faq.q}
                </h4>
                <p className="text-text-muted leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
