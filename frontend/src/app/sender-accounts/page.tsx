"use client";

import { useCallback, useEffect, useState } from "react";
import { PlugZap, RefreshCcw, ShieldCheck } from "lucide-react";
import { EmptyState, MetricCard, OutboundShell } from "@/components/OutboundShell";
import { GlassCard, ScoreRing, StatusBadge } from "@/components/ui";
import { ClientDate } from "@/lib/ClientDate";
import { fetchOutbound, type OutboundSenderSummary, type SenderVerificationResult } from "@/lib/outbound";

const INPUT =
  "mt-2 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text outline-none focus:border-brand transition-colors";
const LABEL = "block text-[11px] font-bold uppercase tracking-wider text-text-muted";

export default function SenderAccountsPage() {
  const [senders, setSenders] = useState<OutboundSenderSummary[]>([]);
  const [message, setMessage] = useState("");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: "New sender account",
    provider: "SMTP",
    fromName: "GeoLead AI",
    fromEmail: "",
    replyTo: "",
    dailyLimit: "100",
    hourlyLimit: "20",
    timezone: "UTC",
    providerConfig: "",
  });

  const load = useCallback(async () => {
    try {
      const data = await fetchOutbound<OutboundSenderSummary[]>("/api/outbound/senders");
      setSenders(data);
    } catch (error) {
      setSenders([]);
      setMessage(error instanceof Error ? error.message : "Could not load sender accounts.");
    }
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const data = await fetchOutbound<OutboundSenderSummary[]>("/api/outbound/senders");
        if (!active) return;
        setSenders(data);
      } catch (error) {
        if (!active) return;
        setSenders([]);
        setMessage(error instanceof Error ? error.message : "Could not load sender accounts.");
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const saveSender = async () => {
    setMessage("");
    try {
      await fetchOutbound("/api/outbound/senders", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          dailyLimit: Number(form.dailyLimit) || 100,
          hourlyLimit: Number(form.hourlyLimit) || 20,
          providerConfig: form.providerConfig ? JSON.parse(form.providerConfig) : undefined,
        }),
      });
      setMessage("Sender account saved.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the sender account.");
    }
  };

  const verifySender = async (senderId: string) => {
    setVerifyingId(senderId);
    setMessage("");
    try {
      const result = await fetchOutbound<SenderVerificationResult>(`/api/outbound/senders/${senderId}/verify`, {
        method: "POST",
      });
      setSenders((current) => current.map((sender) => (sender.id === senderId ? result.sender : sender)));
      setMessage(
        `Verified ${result.verification.domain}: SPF ${result.verification.spfStatus}, DKIM ${result.verification.dkimStatus}, DMARC ${result.verification.dmarcStatus}.`
      );
    } catch {
      setMessage("DNS verification failed because the backend is offline or DNS records could not be resolved.");
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <OutboundShell
      title="Sender Accounts"
      eyebrow="Deliverability & Reputation"
      subtitle="Manage multiple sender identities, rotation, warm-up, SPF/DKIM/DMARC status, and provider config encryption."
      actions={
        <button
          onClick={() => {
            setMessage("");
            void load();
          }}
          className="h-9 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text hover:bg-surface-2 inline-flex items-center gap-2 transition-colors"
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </button>
      }
    >
      {message ? <div className="mb-4 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-text-muted">{message}</div> : null}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Senders" value={senders.length} helper="rotation pool" />
        <MetricCard label="Warm-up" value={senders.filter((sender) => sender.warmupEnabled).length} helper="enabled" />
        <MetricCard label="Verified" value={senders.filter((sender) => sender.dkimStatus === "verified" && sender.spfStatus === "verified").length} helper="SPF/DKIM" />
        <MetricCard label="Avg health" value={`${Math.round(senders.reduce((sum, sender) => sum + sender.deliverabilityScore, 0) / Math.max(1, senders.length))}%`} helper="deliverability" />
      </section>

      <section className="mt-6 grid grid-cols-1 xl:grid-cols-[0.85fr_1.15fr] gap-5">
        <GlassCard className="p-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveSender();
            }}
          >
            <div className="flex items-center gap-2">
              <PlugZap className="h-5 w-5 text-brand" />
              <h2 className="text-base font-black text-text">Add Sender</h2>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                ["label", "Label"],
                ["fromName", "From name"],
                ["fromEmail", "From email"],
                ["replyTo", "Reply-to"],
                ["timezone", "Timezone"],
              ].map(([field, label]) => (
                <label key={field} className={LABEL}>
                  {label}
                  <input
                    value={form[field as keyof typeof form]}
                    onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                    className={INPUT}
                  />
                </label>
              ))}

              <label className={LABEL}>
                Provider
                <select
                  value={form.provider}
                  onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
                  className={INPUT}
                >
                  <option value="RESEND">Resend</option>
                  <option value="SENDGRID">SendGrid</option>
                  <option value="MAILGUN">Mailgun</option>
                  <option value="SES">Amazon SES</option>
                  <option value="SMTP">SMTP</option>
                </select>
              </label>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <label className={LABEL}>
                Daily limit
                <input
                  value={form.dailyLimit}
                  onChange={(event) => setForm((current) => ({ ...current, dailyLimit: event.target.value }))}
                  className={INPUT}
                />
              </label>
              <label className={LABEL}>
                Hourly limit
                <input
                  value={form.hourlyLimit}
                  onChange={(event) => setForm((current) => ({ ...current, hourlyLimit: event.target.value }))}
                  className={INPUT}
                />
              </label>
            </div>

            <label className={`mt-4 ${LABEL}`}>
              Provider config JSON
              <textarea
                value={form.providerConfig}
                onChange={(event) => setForm((current) => ({ ...current, providerConfig: event.target.value }))}
                className="mt-2 h-44 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm leading-6 text-text outline-none focus:border-brand transition-colors"
              />
            </label>

            <button className="mt-5 h-11 w-full rounded-lg bg-brand text-sm font-bold text-bg hover:bg-brand-hover shadow-[0_0_12px_rgba(20,184,166,0.3)] inline-flex items-center justify-center gap-2 transition-colors">
              <ShieldCheck className="h-4 w-4" />
              Save sender
            </button>
          </form>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand" />
            <h2 className="text-base font-black text-text">Sender Fleet</h2>
          </div>
          <div className="mt-5 space-y-4">
            {senders.length === 0 ? (
              <EmptyState title="No sender accounts" body="Add a sender account to rotate, warm up, and monitor deliverability." />
            ) : (
              senders.map((sender) => (
                <article key={sender.id} className="rounded-lg border border-border bg-surface-2 p-4 transition-colors hover:border-brand/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <ScoreRing score={sender.deliverabilityScore} size="sm" />
                      <div>
                        <h3 className="text-sm font-black text-text">{sender.label}</h3>
                        <p className="mt-1 text-xs text-text-muted">{sender.fromEmail}</p>
                      </div>
                    </div>
                    <StatusBadge status={sender.status} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-lg border border-border bg-surface p-3">
                      <div className="text-text-muted">Provider</div>
                      <div className="mt-1 font-black text-text">{sender.provider}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-surface p-3">
                      <div className="text-text-muted">Warm-up</div>
                      <div className="mt-1 font-black text-text">{sender.warmupEnabled ? "On" : "Off"}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-surface p-3">
                      <div className="text-text-muted">DKIM/SPF</div>
                      <div className="mt-1 font-black text-text">{sender.dkimStatus}/{sender.spfStatus}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-surface p-3">
                      <div className="text-text-muted">Health</div>
                      <div className="mt-1 font-black text-success">{sender.deliverabilityScore}/100</div>
                    </div>
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-success" style={{ width: `${sender.deliverabilityScore}%` }} />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-text-muted">
                      {sender.lastVerifiedAt ? <>Last verified <ClientDate value={sender.lastVerifiedAt} /></> : "DNS verification pending"}
                    </div>
                    <button
                      onClick={() => void verifySender(sender.id)}
                      disabled={verifyingId === sender.id}
                      className="h-8 px-3 rounded-lg border border-brand/30 bg-brand-soft text-xs font-bold text-brand hover:bg-brand/20 disabled:opacity-60 transition-colors"
                    >
                      {verifyingId === sender.id ? "Verifying..." : "Verify DNS"}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </GlassCard>
      </section>
    </OutboundShell>
  );
}
