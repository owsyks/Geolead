"use client";

import { useEffect, useState } from "react";
import { Send, CheckCircle2, AlertCircle } from "lucide-react";
import { OutboundShell } from "@/components/OutboundShell"
import { StatusBadge } from "@/components/ui"
;
import { OUTBOUND_API_BASE, fetchOutbound, authFetch, type OutboundSenderSummary } from "@/lib/outbound";

interface SendResult {
  ok: boolean;
  dryRun: boolean;
  note?: string;
  providerMessageId?: string;
  sender?: { id: string; fromEmail: string; provider: string };
}

export default function QuickSendPage() {
  const [senders, setSenders] = useState<OutboundSenderSummary[]>([]);
  const [loadingSenders, setLoadingSenders] = useState(true);
  const [senderId, setSenderId] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchOutbound<OutboundSenderSummary[]>("/api/outbound/senders");
        if (cancelled) return;
        const active = list.filter((s) => s.status === "active");
        setSenders(active);
        const preferred = active.find((s) => s.provider === "RESEND") || active[0];
        if (preferred) setSenderId(preferred.id);
      } catch {
        if (!cancelled) setError("Could not load sender accounts. Is the backend running?");
      } finally {
        if (!cancelled) setLoadingSenders(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senderId || !to || !subject || !body) return;
    setSending(true);
    setResult(null);
    setError("");
    try {
      const res = await authFetch(`${OUTBOUND_API_BASE}/api/outbound/send-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderAccountId: senderId, to, subject, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Send failed (${res.status})`);
      } else {
        setResult(data);
        if (!data.dryRun) {
          setTo("");
          setSubject("");
          setBody("");
        }
      }
    } catch (err: any) {
      setError(err?.message || "Network error");
    } finally {
      setSending(false);
    }
  };

  return (
    <OutboundShell title="Quick Send" subtitle="Fire a one-off email through any active sender account.">
      <div className="max-w-2xl">
        <form onSubmit={handleSend} className="space-y-5 bg-slate-100 dark:bg-slate-900/30 border border-slate-300 dark:border-slate-800 rounded-2xl p-6">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">From</label>
            <select
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              disabled={loadingSenders || senders.length === 0}
              className="w-full h-10 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
            >
              {loadingSenders ? (
                <option>Loading…</option>
              ) : senders.length === 0 ? (
                <option>No active senders</option>
              ) : (
                senders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.provider} — {s.fromName} &lt;{s.fromEmail}&gt;
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">To</label>
            <input
              type="email"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full h-10 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Subject</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Quick question about your business"
              className="w-full h-10 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Body</label>
            <textarea
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder="Write your message…"
              className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500 resize-y"
            />
          </div>

          <button
            type="submit"
            disabled={sending || !senderId || !to || !subject || !body}
            className="w-full h-11 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 dark:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 transition-colors"
          >
            <Send className={`w-4 h-4 ${sending ? "animate-pulse" : ""}`} />
            {sending ? "Sending…" : "Send Email"}
          </button>
        </form>

        {result && (
          <div className={`mt-4 p-4 rounded-xl border flex gap-3 ${result.dryRun ? "bg-amber-500/10 border-amber-500/30 text-amber-300" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"}`}>
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm">
              {result.dryRun ? (
                <>Dry-run sender used. {result.note && <span className="block text-xs opacity-80 mt-1">{result.note}</span>}</>
              ) : (
                <>Sent via {result.sender?.provider} from {result.sender?.fromEmail}. Message ID: <code className="font-mono text-xs">{result.providerMessageId}</code></>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 rounded-xl border bg-red-500/10 border-red-500/30 text-red-300 flex gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm">{error}</div>
          </div>
        )}
      </div>
    </OutboundShell>
  );
}
