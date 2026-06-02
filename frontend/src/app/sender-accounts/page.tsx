"use client";

import { useCallback, useEffect, useState } from "react";
import { PlugZap, RefreshCcw, ShieldCheck } from "lucide-react";
import { EmptyState, MetricCard, OutboundShell, StatusBadge } from "@/components/OutboundShell";
import { ClientDate } from "@/lib/ClientDate";
import { fetchOutbound, type OutboundSenderSummary, type SenderVerificationResult } from "@/lib/outbound";

const demoSenders: OutboundSenderSummary[] = [
  {
    id: "demo-sender",
    label: "Warm Texas sender",
    provider: "DRY_RUN",
    fromName: "GeoLead AI",
    fromEmail: "outreach@geoleadai.local",
    replyTo: "admin@geoleadai.local",
    status: "active",
    dailyLimit: 35,
    hourlyLimit: 8,
    warmupEnabled: true,
    warmupTarget: 20,
    dkimStatus: "pending",
    spfStatus: "pending",
    dmarcStatus: "pending",
    deliverabilityScore: 76,
    bounceRate: 0.014,
    spamComplaintRate: 0,
    hasEncryptedConfig: false,
    createdAt: "2026-05-22T10:00:00.000Z",
    updatedAt: "2026-05-23T10:00:00.000Z",
  },
];

export default function SenderAccountsPage() {
  const [senders, setSenders] = useState<OutboundSenderSummary[]>(demoSenders);
  const [message, setMessage] = useState("");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: "New sender account",
    provider: "DRY_RUN",
    fromName: "GeoLead AI",
    fromEmail: "outreach@geoleadai.local",
    replyTo: "admin@geoleadai.local",
    dailyLimit: "100",
    hourlyLimit: "20",
    timezone: "UTC",
    providerConfig: "",
  });

  const load = useCallback(async () => {
    try {
      const data = await fetchOutbound<OutboundSenderSummary[]>("/api/outbound/senders");
      setSenders(data);
    } catch {
      setSenders(demoSenders);
      setMessage("Backend offline. Showing demo sender data.");
    }
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const data = await fetchOutbound<OutboundSenderSummary[]>("/api/outbound/senders");
        if (!active) return;
        setSenders(data);
      } catch {
        if (!active) return;
        setSenders(demoSenders);
        setMessage("Backend offline. Showing demo sender data.");
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
    } catch {
      setMessage("Save failed because the backend is offline.");
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
      subtitle="Manage multiple sender identities, rotation, warm-up, SPF/DKIM/DMARC status, and provider config encryption."
      actions={
        <button
          onClick={() => {
            setMessage("");
            void load();
          }}
          className="h-10 px-3 rounded-lg border border-slate-800 bg-slate-900/70 text-sm text-slate-300 hover:text-white inline-flex items-center gap-2"
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </button>
      }
    >
      {message ? <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">{message}</div> : null}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Senders" value={senders.length} helper="rotation pool" />
        <MetricCard label="Warm-up" value={senders.filter((sender) => sender.warmupEnabled).length} helper="enabled" />
        <MetricCard label="Verified" value={senders.filter((sender) => sender.dkimStatus === "verified" && sender.spfStatus === "verified").length} helper="SPF/DKIM" />
        <MetricCard label="Avg health" value={`${Math.round(senders.reduce((sum, sender) => sum + sender.deliverabilityScore, 0) / Math.max(1, senders.length))}%`} helper="deliverability" />
      </section>

      <section className="mt-6 grid grid-cols-1 xl:grid-cols-[0.85fr_1.15fr] gap-5">
        <form
          className="rounded-lg border border-slate-800 bg-slate-900/35 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void saveSender();
          }}
        >
          <div className="flex items-center gap-2">
            <PlugZap className="h-5 w-5 text-indigo-300" />
            <h2 className="text-base font-black text-slate-100">Add Sender</h2>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              ["label", "Label"],
              ["fromName", "From name"],
              ["fromEmail", "From email"],
              ["replyTo", "Reply-to"],
              ["timezone", "Timezone"],
            ].map(([field, label]) => (
              <label key={field} className="text-xs font-bold text-slate-400">
                {label}
                <input
                  value={form[field as keyof typeof form]}
                  onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                  className="mt-2 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-indigo-400"
                />
              </label>
            ))}

            <label className="text-xs font-bold text-slate-400">
              Provider
              <select
                value={form.provider}
                onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
                className="mt-2 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-indigo-400"
              >
                <option value="DRY_RUN">Dry run</option>
                <option value="RESEND">Resend</option>
                <option value="SENDGRID">SendGrid</option>
                <option value="MAILGUN">Mailgun</option>
                <option value="SES">Amazon SES</option>
                <option value="SMTP">SMTP</option>
              </select>
            </label>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <label className="text-xs font-bold text-slate-400">
              Daily limit
              <input
                value={form.dailyLimit}
                onChange={(event) => setForm((current) => ({ ...current, dailyLimit: event.target.value }))}
                className="mt-2 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-indigo-400"
              />
            </label>
            <label className="text-xs font-bold text-slate-400">
              Hourly limit
              <input
                value={form.hourlyLimit}
                onChange={(event) => setForm((current) => ({ ...current, hourlyLimit: event.target.value }))}
                className="mt-2 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-indigo-400"
              />
            </label>
          </div>

          <label className="mt-4 block text-xs font-bold text-slate-400">
            Provider config JSON
            <textarea
              value={form.providerConfig}
              onChange={(event) => setForm((current) => ({ ...current, providerConfig: event.target.value }))}
              className="mt-2 h-44 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-100 outline-none focus:border-indigo-400"
            />
          </label>

          <button className="mt-5 h-11 w-full rounded-lg bg-indigo-600 text-sm font-black text-white hover:bg-indigo-500 inline-flex items-center justify-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Save sender
          </button>
        </form>

        <section className="rounded-lg border border-slate-800 bg-slate-900/35 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-300" />
            <h2 className="text-base font-black text-slate-100">Sender Fleet</h2>
          </div>
          <div className="mt-5 space-y-4">
            {senders.length === 0 ? (
              <EmptyState title="No sender accounts" body="Add a sender account to rotate, warm up, and monitor deliverability." />
            ) : (
              senders.map((sender) => (
                <article key={sender.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black text-slate-100">{sender.label}</h3>
                      <p className="mt-1 text-xs text-slate-500">{sender.fromEmail}</p>
                    </div>
                    <StatusBadge value={sender.status} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                      <div className="text-slate-500">Provider</div>
                      <div className="mt-1 font-black text-slate-100">{sender.provider}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                      <div className="text-slate-500">Warm-up</div>
                      <div className="mt-1 font-black text-slate-100">{sender.warmupEnabled ? "On" : "Off"}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                      <div className="text-slate-500">DKIM/SPF</div>
                      <div className="mt-1 font-black text-slate-100">{sender.dkimStatus}/{sender.spfStatus}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                      <div className="text-slate-500">Health</div>
                      <div className="mt-1 font-black text-emerald-300">{sender.deliverabilityScore}/100</div>
                    </div>
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${sender.deliverabilityScore}%` }} />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-500">
                      {sender.lastVerifiedAt ? <>Last verified <ClientDate value={sender.lastVerifiedAt} /></> : "DNS verification pending"}
                    </div>
                    <button
                      onClick={() => void verifySender(sender.id)}
                      disabled={verifyingId === sender.id}
                      className="h-8 px-3 rounded-lg border border-indigo-400/25 bg-indigo-500/10 text-xs font-bold text-indigo-200 hover:bg-indigo-500/15 disabled:opacity-60"
                    >
                      {verifyingId === sender.id ? "Verifying..." : "Verify DNS"}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </OutboundShell>
  );
}
