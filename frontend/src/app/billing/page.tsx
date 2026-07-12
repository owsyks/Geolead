"use client";

// Billing overview: current plan + status, trial countdown, usage-vs-limit
// meters, and upgrade / cancel actions. Reads GET /api/billing/me.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { OutboundShell } from "@/components/OutboundShell";
import { getBillingSummary, type BillingSummary } from "@/lib/billing";

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const danger = pct >= 100;
  const warn = pct >= 80 && pct < 100;
  return (
    <div className="glass rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider text-text-muted font-bold">{label}</span>
        <span className="text-xs font-mono tabular-nums text-text">{used.toLocaleString()} / {limit.toLocaleString()}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${danger ? "bg-danger" : warn ? "bg-amber-500" : "bg-brand"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => getBillingSummary().then(setSummary).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => {
    load();
    // The browser return is advisory; the verified Paymento IPN activates the
    // plan moments later, so nudge the user and re-check shortly.
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("payment") === "return") {
      const noticeTimer = setTimeout(() => setNotice("Payment returned — waiting for verified blockchain confirmation."), 0);
      const t = setTimeout(load, 4000);
      return () => { clearTimeout(noticeTimer); clearTimeout(t); };
    }
  }, []);

  const isPaid = summary?.tier === "starter" || summary?.tier === "pro";
  const statusLabel: Record<string, string> = {
    trialing: "Free trial", active: "Active", past_due: "Payment failed", canceled: "Canceled", expired: "Expired",
  };

  return (
    <OutboundShell title="Billing & Plan" subtitle="Manage your subscription and usage" eyebrow="💳 Billing">
      {loading ? (
        <div className="flex items-center justify-center py-24 text-text-muted"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : !summary ? (
        <div className="glass border border-border rounded-xl p-6 text-sm text-text-muted">Could not load billing details.</div>
      ) : (
        <div className="max-w-3xl space-y-6">
          {notice && (
            <div className="text-sm text-brand bg-brand-soft border border-brand/20 rounded-lg py-2.5 px-4">{notice}</div>
          )}

          {/* Current plan */}
          <div className="glass border border-border rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-text-muted font-bold mb-1">Current plan</div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black text-text capitalize">{summary.tier}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    summary.canSpend ? "bg-success/10 text-success border border-success/20" : "bg-danger/10 text-danger border border-danger/20"
                  }`}>
                    {statusLabel[summary.status] || summary.status}
                  </span>
                </div>
                {summary.status === "trialing" && summary.trialDaysLeft != null && (
                  <p className="text-xs text-text-muted mt-2">
                    {summary.trialDaysLeft > 0 ? `${summary.trialDaysLeft} day${summary.trialDaysLeft === 1 ? "" : "s"} left in your trial.` : "Your trial ends today."}
                  </p>
                )}
                {summary.currentPeriodEnd && (
                  <p className="text-xs text-text-muted mt-2">Access through {new Date(summary.currentPeriodEnd).toLocaleDateString()}.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Link href="/pricing" className="px-4 py-2.5 rounded-xl bg-brand text-bg text-sm font-bold hover:bg-brand-hover transition-colors flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> {isPaid ? "Change plan" : "Upgrade"}
                </Link>
              </div>
            </div>

            {!summary.canSpend && (
              <div className="mt-4 flex items-start gap-2 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg py-2.5 px-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Your access is limited. Upgrade to resume searches and sending.</span>
              </div>
            )}
          </div>

          {/* Usage */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-text-muted font-bold mb-3">Usage this period</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Meter label="Searches (month)" used={summary.usage.searches.used} limit={summary.usage.searches.limit} />
              <Meter label="Email sends (today)" used={summary.usage.sends.used} limit={summary.usage.sends.limit} />
              <Meter label="Stored leads" used={summary.usage.leads.used} limit={summary.usage.leads.limit} />
              <Meter label="Sender accounts" used={summary.usage.senders.used} limit={summary.usage.senders.limit} />
            </div>
          </div>
        </div>
      )}
    </OutboundShell>
  );
}
