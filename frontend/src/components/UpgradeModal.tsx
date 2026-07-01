"use client";

// Shown when the API returns 402 (plan required or quota exceeded). Explains the
// limit that was hit and routes the user to the pricing page to upgrade.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import type { UpgradeSignal } from "@/lib/outbound";

const METRIC_LABEL: Record<string, string> = {
  searches: "monthly searches",
  senders: "sender accounts",
  sends: "daily email sends",
  leads: "stored leads",
};

export function UpgradeModal({ signal, onClose }: { signal: UpgradeSignal; onClose: () => void }) {
  const router = useRouter();
  const isQuota = signal.code === "QUOTA_EXCEEDED";
  const metric = signal.metric ? METRIC_LABEL[signal.metric] || signal.metric : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass border border-border rounded-2xl w-full max-w-md p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-11 h-11 rounded-xl bg-brand-soft border border-brand/20 flex items-center justify-center mb-4">
          <Sparkles className="w-5 h-5 text-brand" />
        </div>

        <h2 className="text-lg font-black text-text mb-2">
          {isQuota ? "You've hit a plan limit" : "Upgrade to continue"}
        </h2>

        <p className="text-sm text-text-muted leading-relaxed mb-1">{signal.message}</p>

        {isQuota && metric && signal.limit != null && (
          <p className="text-xs text-text-muted mb-4">
            Used <span className="font-mono text-text">{signal.used ?? signal.limit}</span> of{" "}
            <span className="font-mono text-text">{signal.limit}</span> {metric} on your{" "}
            <span className="font-semibold text-text capitalize">{signal.tier || "current"}</span> plan.
          </p>
        )}

        <div className="flex items-center gap-3 mt-5">
          <Link
            href="/pricing"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-brand text-bg text-center text-sm font-bold hover:bg-brand-hover transition-colors"
          >
            View plans
          </Link>
          <button
            onClick={() => { onClose(); router.refresh(); }}
            className="px-4 py-2.5 rounded-xl bg-surface border border-border text-text-muted hover:text-text text-sm font-semibold transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
