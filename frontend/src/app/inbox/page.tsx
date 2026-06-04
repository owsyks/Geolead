"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Bell,
  CheckCircle2,
  ClipboardCopy,
  Handshake,
  Inbox as InboxIcon,
  Loader2,
  RefreshCcw,
  Settings,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { EmptyState, MetricCard, OutboundShell } from "@/components/OutboundShell";
import { ClientDate } from "@/lib/ClientDate";
import { fetchOutbound, OUTBOUND_API_BASE, type InboxReply, type InboxResponse, type SyncResult } from "@/lib/outbound";

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "interested", label: "Interested" },
  { key: "negotiating", label: "Negotiating" },
  { key: "not_interested", label: "Not interested" },
  { key: "archived", label: "Archived" },
  { key: "sold", label: "Sold" },
];

const CATEGORY_TONE: Record<string, string> = {
  Interested: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  "Maybe Interested": "border-teal-400/30 bg-teal-500/10 text-teal-300",
  Negotiating: "border-indigo-400/30 bg-indigo-500/10 text-indigo-200",
  "Not Interested": "border-slate-400 dark:border-slate-600 bg-slate-200 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300",
  Unsubscribe: "border-rose-400/30 bg-rose-500/10 text-rose-300",
  "Out Of Office": "border-amber-400/30 bg-amber-500/10 text-amber-300",
  Spam: "border-rose-400/30 bg-rose-500/10 text-rose-300",
};

interface MailboxStatus {
  email: string;
  enabled: boolean;
  hasPassword: boolean;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  totalImported: number;
  syncIntervalSec: number;
}

export default function InboxPage() {
  const [data, setData] = useState<InboxResponse | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<InboxReply | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [notify, setNotify] = useState(false);
  const [mailbox, setMailbox] = useState<MailboxStatus | null | undefined>(undefined); // undefined = not yet loaded
  const wsRef = useRef<WebSocket | null>(null);

  const load = useCallback(async () => {
    try {
      const [inboxRes, mbRes] = await Promise.all([
        fetchOutbound<InboxResponse>(`/api/inbox?${new URLSearchParams({ filter, ...(search ? { search } : {}) }).toString()}`),
        fetchOutbound<{ mailbox: MailboxStatus | null }>("/api/inbox/mailbox"),
      ]);
      setData(inboxRes);
      setMailbox(mbRes.mailbox);
    } catch {
      setMessage("Backend offline — inbox unavailable.");
      setMailbox(null);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => { void load(); }, [load]);

  // Desktop notifications + realtime websocket for new replies.
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotify(Notification.permission === "granted");
    }
    const base = OUTBOUND_API_BASE.replace(/^http/, "ws");
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(`${base}/ws/outbound`);
      wsRef.current = ws;
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "NEW_REPLY") {
            void load();
            const p = msg.payload || {};
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              new Notification(`New reply: ${p.category || "reply"}`, {
                body: `${p.businessName || p.fromEmail || "A lead"} replied about ${p.domain || "your domain"}.`,
              });
            }
          } else if (msg.type === "INBOX_SYNCED") {
            void load();
          }
        } catch { /* ignore */ }
      };
    } catch { /* ws unavailable */ }
    return () => { try { ws?.close(); } catch { /* ignore */ } };
  }, [load]);

  const enableNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setMessage("This browser does not support desktop notifications.");
      return;
    }
    const perm = await Notification.requestPermission();
    setNotify(perm === "granted");
  };

  const syncNow = async () => {
    setSyncing(true);
    setMessage("");
    try {
      const r = await fetchOutbound<SyncResult>("/api/inbox/sync", { method: "POST" });
      if (r.ok) {
        setMessage(`Synced — scanned ${r.scanned}, imported ${r.imported} new reply(ies)${r.skipped ? `, skipped ${r.skipped}` : ""}.`);
      } else {
        setMessage(`Sync failed: ${r.error || "Unknown error. Check mailbox credentials in Settings."}`);
      }
      await load();
    } catch {
      setMessage("Sync failed. Configure your Gmail mailbox in Settings → Mailbox.");
    } finally {
      setSyncing(false);
    }
  };

  const openReply = async (reply: InboxReply) => {
    setSelected(reply);
    if (!reply.isRead) {
      try {
        await fetchOutbound(`/api/inbox/${reply.id}/read`, { method: "POST" });
        setData((d) => d ? { ...d, replies: d.replies.map((r) => r.id === reply.id ? { ...r, isRead: true } : r), unreadCount: Math.max(0, d.unreadCount - 1) } : d);
      } catch { /* ignore */ }
    }
  };

  const [acting, setActing] = useState("");

  const act = async (action: string) => {
    if (!selected || acting) return;
    const id = selected.id;
    setActing(action);
    setMessage("");
    try {
      await fetchOutbound(`/api/outbound/inbox/${id}/action`, { method: "POST", body: JSON.stringify({ action }) });
      // Re-fetch and re-select so the panel reflects the new pipeline stage.
      const params = new URLSearchParams({ filter, ...(search ? { search } : {}) });
      const res = await fetchOutbound<InboxResponse>(`/api/inbox?${params.toString()}`);
      setData(res);
      const updated = res.replies.find((r) => r.id === id) || null;
      // Archived items leave the default views — clear the panel in that case.
      setSelected(action === "archive" ? null : updated);
      const labels: Record<string, string> = {
        mark_interested: "Marked Interested — lead moved to Interested",
        send_to_negotiation: "Moved to Negotiation",
        mark_not_interested: "Marked Not Interested",
        archive: "Archived",
      };
      setMessage(labels[action] || `Applied: ${action.replace(/_/g, " ")}.`);
    } catch {
      setMessage("Action failed — is the backend running?");
    } finally {
      setActing("");
    }
  };

  const replies = data?.replies || [];
  const counts = data?.categoryCounts || {};

  const interestedCount = useMemo(
    () => (counts["Interested"] || 0) + (counts["Maybe Interested"] || 0),
    [counts]
  );

  return (
    <OutboundShell
      title="Unified Inbox"
      subtitle="Every reply from Gmail, matched to its lead, campaign, and domain — analyzed and pipelined automatically."
      actions={
        <>
          {!notify ? (
            <button onClick={() => void enableNotifications()} className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/70 text-sm text-slate-700 dark:text-slate-300 inline-flex items-center gap-2">
              <Bell className="h-4 w-4" /> Enable alerts
            </button>
          ) : null}
          <Link href="/settings" className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/70 text-sm text-slate-700 dark:text-slate-300 inline-flex items-center gap-2">
            <Settings className="h-4 w-4" /> Mailbox
          </Link>
          <button onClick={() => void syncNow()} disabled={syncing} className="h-10 px-3 rounded-lg border border-indigo-400/30 bg-indigo-500/15 text-sm text-indigo-100 inline-flex items-center gap-2 disabled:opacity-60">
            <RefreshCcw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Syncing…" : "Sync now"}
          </button>
        </>
      }
    >
      {/* Mailbox health banner */}
      <MailboxStatusBanner mailbox={mailbox} onSync={() => void syncNow()} syncing={syncing} />

      {message ? <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{message}</div> : null}

      <section className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <MetricCard label="Conversations" value={replies.length} helper="current view" />
        <MetricCard label="Unread" value={data?.unreadCount ?? 0} helper="need attention" />
        <MetricCard label="Interested" value={interestedCount} helper="buyer intent" />
        <MetricCard label="Negotiating" value={counts["Negotiating"] || 0} helper="in deal" />
        <MetricCard label="Opt-outs" value={counts["Unsubscribe"] || 0} helper="suppressed" />
      </section>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`h-9 px-3 rounded-lg text-xs border ${filter === f.key ? "bg-indigo-500/15 border-indigo-400/30 text-indigo-100" : "bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-800 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"}`}
          >
            {f.label}
          </button>
        ))}
        <div className="flex-1 min-w-[200px]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search replies, leads, subjects…"
            className="h-9 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
          />
        </div>
      </div>

      <section className="mt-5 grid grid-cols-1 xl:grid-cols-[0.85fr_1.15fr] gap-5">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 divide-y divide-slate-200 dark:divide-slate-900 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="p-6 text-sm text-slate-500">Loading…</div>
          ) : replies.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No replies here" body="Connect your Gmail in Settings and hit Sync — matched replies will appear automatically." />
            </div>
          ) : (
            replies.map((reply) => (
              <button
                key={reply.id}
                onClick={() => void openReply(reply)}
                className={`w-full text-left p-4 hover:bg-slate-100 dark:hover:bg-slate-900/60 ${selected?.id === reply.id ? "bg-slate-100 dark:bg-slate-900/70" : ""} ${!reply.isRead ? "border-l-2 border-l-indigo-400" : "border-l-2 border-l-transparent"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 dark:text-slate-100 truncate">{reply.lead?.businessName || reply.fromEmail}</span>
                  {reply.aiCategory ? (
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${CATEGORY_TONE[reply.aiCategory] || "border-slate-400 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}`}>
                      {reply.aiCategory}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-slate-400 truncate">{reply.subject}</div>
                <div className="mt-1 text-[11px] text-slate-500 truncate">{reply.aiSummary || reply.body.slice(0, 90)}</div>
                <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
                  {reply.campaign?.geoDomain ? <span className="text-indigo-300">{reply.campaign.geoDomain}</span> : null}
                  <span>·</span>
                  <ClientDate value={reply.receivedAt} />
                  <span>·</span>
                  <span>match {reply.matchConfidence}%</span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
          {selected ? (
            <ReplyDetail reply={selected} onAction={act} acting={acting} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-slate-500">
              <div className="text-center">
                <InboxIcon className="h-8 w-8 mx-auto text-slate-400 dark:text-slate-700" />
                <p className="mt-2">Select a conversation to view it.</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </OutboundShell>
  );
}

function ReplyDetail({ reply, onAction, acting }: { reply: InboxReply; onAction: (action: string) => void; acting: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reply.suggestedResponse || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-black text-slate-900 dark:text-slate-100 truncate">{reply.lead?.businessName || reply.fromEmail}</h2>
          <div className="text-xs text-slate-500">{reply.fromEmail}</div>
        </div>
        {reply.aiCategory ? (
          <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-bold ${CATEGORY_TONE[reply.aiCategory] || "border-slate-400 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}`}>
            {reply.aiCategory}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <Meta label="Pipeline" value={reply.lead?.pipelineStage || "—"} />
        <Meta label="Sentiment" value={reply.sentiment} />
        <Meta label="Intent" value={`${reply.intentScore}/100`} />
        <Meta label="Match" value={`${reply.matchConfidence}% ${reply.matchMethod || ""}`} />
      </div>

      {reply.campaign ? (
        <div className="text-xs text-slate-400">
          Campaign <span className="text-slate-800 dark:text-slate-200">{reply.campaign.name}</span> · Domain{" "}
          {reply.campaign.domainId ? (
            <Link href={`/portfolio/${reply.campaign.domainId}`} className="text-indigo-300 underline">{reply.campaign.geoDomain}</Link>
          ) : (
            <span className="text-indigo-300">{reply.campaign.geoDomain}</span>
          )}
        </div>
      ) : null}

      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Subject</div>
        <div className="text-sm text-slate-800 dark:text-slate-200">{reply.subject}</div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Message</div>
        <div className="mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
          {reply.body}
        </div>
      </div>

      {reply.suggestedResponse ? (
        <div>
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">AI suggested reply (negotiation assistant)</div>
            <button onClick={() => void copy()} className="text-[11px] text-indigo-300 inline-flex items-center gap-1">
              <ClipboardCopy className="h-3 w-3" /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-1 rounded-md border border-indigo-400/20 bg-indigo-500/5 p-3 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
            {reply.suggestedResponse}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-2">
        <button onClick={() => onAction("mark_interested")} disabled={acting !== ""} className="h-9 px-3 rounded-md border border-emerald-400/30 bg-emerald-500/10 text-xs text-emerald-200 inline-flex items-center gap-1 disabled:opacity-50">
          {acting === "mark_interested" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Interested
        </button>
        <button onClick={() => onAction("send_to_negotiation")} disabled={acting !== ""} className="h-9 px-3 rounded-md border border-indigo-400/30 bg-indigo-500/15 text-xs text-indigo-100 inline-flex items-center gap-1 disabled:opacity-50">
          {acting === "send_to_negotiation" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Handshake className="h-3.5 w-3.5" />} To negotiation
        </button>
        <button onClick={() => onAction("mark_not_interested")} disabled={acting !== ""} className="h-9 px-3 rounded-md border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 inline-flex items-center gap-1 disabled:opacity-50">
          {acting === "mark_not_interested" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Not interested
        </button>
        <button onClick={() => onAction("archive")} disabled={acting !== ""} className="h-9 px-3 rounded-md border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 inline-flex items-center gap-1 disabled:opacity-50">
          {acting === "archive" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />} Archive
        </button>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-xs text-slate-800 dark:text-slate-200 truncate capitalize">{value}</div>
    </div>
  );
}

// Diagnostic banner that tells the user *exactly* why their inbox is or isn't
// receiving replies — the #1 source of "my replies aren't showing up" confusion.
function MailboxStatusBanner({
  mailbox,
  onSync,
  syncing,
}: {
  mailbox: MailboxStatus | null | undefined;
  onSync: () => void;
  syncing: boolean;
}) {
  // Still loading — render nothing to avoid a flash.
  if (mailbox === undefined) return null;

  // No mailbox configured at all.
  if (mailbox === null) {
    return (
      <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
        <WifiOff className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-bold text-amber-300">No mailbox connected</div>
          <p className="text-xs text-amber-200/80 mt-1">
            Replies are pulled from your Gmail via IMAP. Until you connect a mailbox, nothing will appear here — even though the lead emailed you back.
          </p>
          <Link href="/settings" className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-amber-400/40 bg-amber-500/15 text-xs font-semibold text-amber-200 hover:bg-amber-500/25">
            <Settings className="h-3.5 w-3.5" /> Connect Gmail in Settings
          </Link>
        </div>
      </div>
    );
  }

  // Mailbox exists but is disabled.
  if (!mailbox.enabled) {
    return (
      <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
        <WifiOff className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-bold text-amber-300">Mailbox sync is turned off</div>
          <p className="text-xs text-amber-200/80 mt-1">
            <span className="font-mono">{mailbox.email}</span> is configured but disabled. Enable it in Settings so GeoLead can pull replies automatically.
          </p>
          <Link href="/settings" className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-amber-400/40 bg-amber-500/15 text-xs font-semibold text-amber-200 hover:bg-amber-500/25">
            <Settings className="h-3.5 w-3.5" /> Enable sync
          </Link>
        </div>
      </div>
    );
  }

  // Mailbox enabled but last sync errored (usually a bad app password).
  if (mailbox.lastSyncStatus === "error") {
    return (
      <div className="mb-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 flex items-start gap-3">
        <XCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-bold text-rose-300">Mailbox sync is failing</div>
          <p className="text-xs text-rose-200/80 mt-1">
            {mailbox.lastSyncError || "The last sync attempt failed."}
          </p>
          <p className="text-[11px] text-rose-200/60 mt-1">
            Gmail requires an <strong>App Password</strong> (not your normal password), and IMAP must be enabled in Gmail settings.
          </p>
          <div className="mt-2 flex gap-2">
            <Link href="/settings" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-rose-400/40 bg-rose-500/15 text-xs font-semibold text-rose-200 hover:bg-rose-500/25">
              <Settings className="h-3.5 w-3.5" /> Fix credentials
            </Link>
            <button onClick={onSync} disabled={syncing} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-rose-400/40 bg-rose-500/15 text-xs font-semibold text-rose-200 hover:bg-rose-500/25 disabled:opacity-50">
              <RefreshCcw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Healthy — show a compact connected status line.
  return (
    <div className="mb-4 rounded-lg border border-emerald-400/25 bg-emerald-500/5 px-4 py-2.5 flex items-center gap-3 text-xs">
      <Wifi className="h-4 w-4 text-emerald-400 shrink-0" />
      <span className="text-emerald-300 font-semibold">Connected:</span>
      <span className="font-mono text-slate-700 dark:text-slate-300">{mailbox.email}</span>
      <span className="text-slate-400 dark:text-slate-500">
        {mailbox.lastSyncAt ? <>Last sync <ClientDate value={mailbox.lastSyncAt} /></> : "Not synced yet"}
        {" · "}{mailbox.totalImported} imported total · auto every {mailbox.syncIntervalSec}s
      </span>
    </div>
  );
}
