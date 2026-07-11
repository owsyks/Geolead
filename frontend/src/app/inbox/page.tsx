"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Bell,
  Building2,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  Handshake,
  Inbox as InboxIcon,
  Loader2,
  RefreshCcw,
  Send,
  Settings,
  Sparkles,
  User,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { EmptyState, OutboundShell } from "@/components/OutboundShell";
import { VirtualList } from "@/components/VirtualList";
import { GlassCard, PillButton } from "@/components/ui";
import { ClientDate } from "@/lib/ClientDate";
import {
  authFetch,
  fetchOutbound,
  OUTBOUND_API_BASE,
  type InboxReply,
  type InboxResponse,
  type OutboundSenderSummary,
  type SyncResult,
} from "@/lib/outbound";
import { readCache, writeCache } from "@/lib/cache";

const INBOX_CACHE_KEY = "inbox";

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
  Interested: "border-success/20 bg-success/10 text-success",
  "Maybe Interested": "border-brand/20 bg-brand/10 text-brand",
  Negotiating: "border-info/20 bg-info/10 text-info",
  "Not Interested": "border-border bg-surface-2 text-text-muted",
  Unsubscribe: "border-copper/20 bg-copper/10 text-copper",
  "Out Of Office": "border-copper/20 bg-copper/10 text-copper",
  Spam: "border-danger/20 bg-danger/10 text-danger",
};

function categoryClass(category?: string | null) {
  return (category && CATEGORY_TONE[category]) || "border-border bg-surface-2 text-text-muted";
}

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
  // Seed the default (unfiltered) inbox view from cache for an instant paint.
  const [data, setData] = useState<InboxResponse | null>(() => readCache<InboxResponse>(INBOX_CACHE_KEY));
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<InboxReply | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [notify, setNotify] = useState(false);
  const [mailbox, setMailbox] = useState<MailboxStatus | null | undefined>(undefined); // undefined = not yet loaded
  const [senders, setSenders] = useState<OutboundSenderSummary[]>([]);
  const [sendingReply, setSendingReply] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const load = useCallback(async () => {
    try {
      const [inboxRes, mbRes] = await Promise.all([
        fetchOutbound<InboxResponse>(`/api/inbox?${new URLSearchParams({ filter, ...(search ? { search } : {}) }).toString()}`),
        fetchOutbound<{ mailbox: MailboxStatus | null }>("/api/inbox/mailbox"),
      ]);
      setData(inboxRes);
      setMailbox(mbRes.mailbox);
      // Only cache the default view so the seed matches the initial paint.
      if (filter === "all" && !search) writeCache(INBOX_CACHE_KEY, inboxRes);
    } catch {
      setMessage("Backend offline — inbox unavailable.");
      setMailbox(null);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => { void load(); }, [load]);

  // Load active senders once so the composer can send a reply.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchOutbound<OutboundSenderSummary[]>("/api/outbound/senders");
        if (!cancelled) setSenders(list.filter((s) => s.status === "active"));
      } catch { /* senders optional */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Desktop notifications + realtime websocket for new replies.
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotify(Notification.permission === "granted");
    }
    const base = OUTBOUND_API_BASE.replace(/^http/, "ws");
    let ws: WebSocket | null = null;
    let cancelled = false;
    void (async () => {
      try {
      const { ticket } = await fetchOutbound<{ ticket: string }>("/api/auth/ws-ticket", { method: "POST" });
      if (cancelled) return;
      ws = new WebSocket(`${base}/ws/outbound?ticket=${encodeURIComponent(ticket)}`);
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
    })();
    return () => { cancelled = true; try { ws?.close(); } catch { /* ignore */ } };
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
      const params = new URLSearchParams({ filter, ...(search ? { search } : {}) });
      const res = await fetchOutbound<InboxResponse>(`/api/inbox?${params.toString()}`);
      setData(res);
      const updated = res.replies.find((r) => r.id === id) || null;
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

  const sendReply = async (text: string) => {
    if (!selected) return;
    const sender = senders.find((s) => s.provider === "RESEND") || senders[0];
    if (!sender) {
      setMessage("No active sender account. Add one under Senders to send replies.");
      return;
    }
    setSendingReply(true);
    setMessage("");
    try {
      const subject = selected.subject && /^re:/i.test(selected.subject) ? selected.subject : `Re: ${selected.subject || ""}`.trim();
      const res = await authFetch(`${OUTBOUND_API_BASE}/api/outbound/send-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderAccountId: sender.id, to: selected.fromEmail, subject, body: text }),
      });
      const result = await res.json();
      if (!res.ok) setMessage(result.error || `Send failed (${res.status}).`);
      else setMessage(result.dryRun ? "Dry-run sender used — reply composed, not delivered." : `Reply sent to ${selected.fromEmail}.`);
    } catch {
      setMessage("Send failed — is the backend running?");
    } finally {
      setSendingReply(false);
    }
  };

  const replies = data?.replies || [];

  return (
    <OutboundShell
      title="Inbox"
      eyebrow="Triage & Respond"
      subtitle="AI-triaged replies"
      fullBleed
      actions={
        <>
          {!notify ? (
            <button onClick={() => void enableNotifications()} className="h-9 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text hover:bg-surface-2 inline-flex items-center gap-2 transition-colors">
              <Bell className="h-4 w-4" /> Enable alerts
            </button>
          ) : null}
          <Link href="/settings" className="h-9 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text hover:bg-surface-2 inline-flex items-center gap-2 transition-colors">
            <Settings className="h-4 w-4" /> Mailbox
          </Link>
          <button onClick={() => void syncNow()} disabled={syncing} className="h-9 px-4 rounded-lg bg-brand text-sm font-bold text-bg hover:bg-brand-hover inline-flex items-center gap-2 disabled:opacity-60 shadow-[0_0_12px_rgba(20,184,166,0.3)] transition-colors">
            <RefreshCcw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Syncing…" : "Sync now"}
          </button>
        </>
      }
    >
      <div className="flex flex-col h-full">
        <div className="shrink-0 px-4 pt-3 space-y-2">
          <MailboxStatusBanner mailbox={mailbox} onSync={() => void syncNow()} syncing={syncing} />
          {message ? (
            <div className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm text-text-muted">{message}</div>
          ) : null}
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Reply list — full width on mobile, 380px side panel on desktop */}
          <div className={`${selected ? 'hidden lg:flex' : 'flex'} lg:flex w-full lg:w-[380px] shrink-0 border-r border-border bg-bg flex-col`}>
            <div className="p-4 border-b border-border space-y-3 bg-surface-2/30">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search replies, leads, subjects…"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-brand"
              />
              <div className="flex gap-2 overflow-x-auto pb-1">
                {FILTERS.map((f) => (
                  <PillButton key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
                    {f.label}
                  </PillButton>
                ))}
              </div>
            </div>

            <div className="flex-1 min-h-0">
              {loading ? (
                <div className="p-6 text-sm text-text-muted">Loading…</div>
              ) : replies.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="No replies here" body="Connect your Gmail in Settings and hit Sync — matched replies will appear automatically." />
                </div>
              ) : (
                <VirtualList
                  items={replies}
                  getKey={(reply) => reply.id}
                  estimateSize={128}
                  gap={0}
                  maxHeightClass="h-full"
                  renderItem={(reply) => {
                    const active = selected?.id === reply.id;
                    return (
                      <button
                        onClick={() => void openReply(reply)}
                        className={`w-full text-left p-4 cursor-pointer transition-colors relative block border-b border-border ${
                          active ? "bg-brand/5 border-l-2 border-l-brand" : "hover:bg-surface-2/30 border-l-2 border-l-transparent"
                        }`}
                      >
                        {!reply.isRead && <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-brand animate-pulse" />}
                        <div className="flex justify-between items-start mb-1 pr-4">
                          <div className={`text-[14px] truncate ${!reply.isRead ? "font-bold" : "font-medium"}`}>
                            {reply.lead?.businessName || reply.fromEmail}
                          </div>
                          <div className="text-[11px] text-text-muted whitespace-nowrap"><ClientDate value={reply.receivedAt} /></div>
                        </div>
                        <div className="text-[12px] text-text-muted truncate mb-2">{reply.subject}</div>
                        <div className="text-[13px] text-text-muted line-clamp-2 leading-relaxed mb-3">
                          {reply.aiSummary || reply.body.slice(0, 120)}
                        </div>
                        {reply.aiCategory ? (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${categoryClass(reply.aiCategory)}`}>
                            {reply.aiCategory.toUpperCase()}
                          </span>
                        ) : null}
                      </button>
                    );
                  }}
                />
              )}
            </div>
          </div>

          {/* Reply detail — full screen on mobile when selected, side panel on desktop */}
          <div className={`${selected ? 'flex' : 'hidden lg:flex'} lg:flex flex-1 bg-surface-2/10 flex-col min-w-0`}>
            {selected ? (
              <>
                {/* Mobile back button */}
                <button onClick={() => setSelected(null)} className="lg:hidden flex items-center gap-2 px-4 py-3 border-b border-border text-sm text-text-muted hover:text-text">
                  ← Back to inbox
                </button>
                <ReplyDetail
                  reply={selected}
                  onAction={act}
                  acting={acting}
                  onSend={sendReply}
                  sending={sendingReply}
                  canSend={senders.length > 0}
                />
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-text-muted">
                <div className="text-center">
                  <InboxIcon className="h-8 w-8 mx-auto text-text-faint" />
                  <p className="mt-2">Select a conversation to view it.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </OutboundShell>
  );
}

function ReplyDetail({
  reply,
  onAction,
  acting,
  onSend,
  sending,
  canSend,
}: {
  reply: InboxReply;
  onAction: (action: string) => void;
  acting: string;
  onSend: (text: string) => void;
  sending: boolean;
  canSend: boolean;
}) {
  const [draft, setDraft] = useState(reply.suggestedResponse || "");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDraft(reply.suggestedResponse || "");
  }, [reply.id, reply.suggestedResponse]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const shorten = () => {
    const sentences = draft.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length > 3) setDraft(sentences.slice(0, 3).join(" "));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 lg:p-6 border-b border-border bg-bg flex justify-between items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-base lg:text-xl font-bold mb-1 truncate">{reply.subject || "(no subject)"}</h2>
          <div className="flex items-center gap-3 text-xs lg:text-sm text-text-muted flex-wrap">
            <span className="flex items-center gap-1"><User className="w-3.5 h-3.5 lg:w-4 lg:h-4" /> {reply.fromEmail}</span>
            {reply.lead?.businessName ? <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5 lg:w-4 lg:h-4" /> {reply.lead.businessName}</span> : null}
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 lg:w-4 lg:h-4" /> <ClientDate value={reply.receivedAt} /></span>
          </div>
          {reply.campaign && (
            <div className="mt-2 flex items-center gap-2 text-xs text-text-muted flex-wrap">
              <span className="font-bold text-text">📨 {reply.campaign.name}</span>
              <span>·</span>
              <span className="text-brand">{reply.campaign.geoDomain}</span>
            </div>
          )}
        </div>
        <div className="flex gap-1.5 lg:gap-2 shrink-0 flex-wrap">
          <button onClick={() => onAction("mark_interested")} disabled={acting !== ""} className="flex items-center gap-1 px-2.5 py-1.5 bg-surface border border-border rounded text-xs lg:text-sm font-medium hover:bg-surface-2 hover:text-success transition-colors disabled:opacity-50">
            {acting === "mark_interested" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Interested
          </button>
          <button onClick={() => onAction("send_to_negotiation")} disabled={acting !== ""} className="flex items-center gap-1 px-2.5 py-1.5 bg-surface border border-border rounded text-xs lg:text-sm font-medium hover:bg-surface-2 hover:text-info transition-colors disabled:opacity-50">
            {acting === "send_to_negotiation" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Handshake className="w-3.5 h-3.5" />} Negotiate
          </button>
          <button onClick={() => onAction("archive")} disabled={acting !== ""} className="flex items-center gap-1 px-2.5 py-1.5 bg-surface border border-border rounded text-xs lg:text-sm font-medium hover:bg-surface-2 transition-colors disabled:opacity-50">
            {acting === "archive" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />} Archive
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 lg:p-6 flex flex-col gap-4 lg:gap-6">
        {/* AI Summary */}
        <GlassCard className="bg-brand/5 border-brand/20 p-3 lg:p-5 flex flex-col sm:flex-row gap-4">
          <div className="flex flex-col items-center justify-center shrink-0">
            <div className="w-12 h-12 rounded-full border-2 border-brand flex items-center justify-center bg-bg relative">
              <Sparkles className="w-5 h-5 text-brand" />
              <div className="absolute -bottom-1 -right-1 bg-bg rounded-full p-0.5">
                <div className="w-3 h-3 rounded-full bg-success" />
              </div>
            </div>
            <div className="text-[10px] uppercase font-bold text-brand tracking-wider mt-2">AI Summary</div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex gap-2 mb-2 flex-wrap">
              {reply.aiCategory ? (
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${categoryClass(reply.aiCategory)}`}>
                  {reply.aiCategory.toUpperCase()}
                </span>
              ) : null}
              <span className="text-[12px] px-2 py-0.5 rounded border border-border bg-bg text-text-muted">Intent: {reply.intentScore}/100</span>
              <span className="text-[12px] px-2 py-0.5 rounded border border-border bg-bg text-text-muted capitalize">{reply.sentiment}</span>
            </div>
            <p className="text-sm leading-relaxed text-text-muted">
              {reply.aiSummary || "No AI summary available for this reply yet."}
            </p>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <Meta label="Pipeline" value={reply.lead?.pipelineStage || "—"} />
              <Meta label="Sentiment" value={reply.sentiment} />
              <Meta label="Intent" value={`${reply.intentScore}/100`} />
              <Meta label="Match" value={`${reply.matchConfidence}% ${reply.matchMethod || ""}`} />
            </div>
            {reply.campaign ? (
              <div className="mt-3 text-xs text-text-muted">
                Campaign <span className="text-text">{reply.campaign.name}</span> · Domain{" "}
                {reply.campaign.domainId ? (
                  <Link href={`/portfolio/${reply.campaign.domainId}`} className="text-brand underline">{reply.campaign.geoDomain}</Link>
                ) : (
                  <span className="text-brand">{reply.campaign.geoDomain}</span>
                )}
              </div>
            ) : null}
          </div>
        </GlassCard>

        {/* Email thread */}
        <div className="bg-bg border border-border rounded-lg p-5">
          <div className="flex justify-between items-start mb-4">
            <div className="font-bold">{reply.lead?.businessName || reply.fromEmail}</div>
            <div className="text-[12px] text-text-muted"><ClientDate value={reply.receivedAt} /></div>
          </div>
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-text">{reply.body}</div>
        </div>

        {/* Compose */}
        <div className="mt-auto">
          <div className="bg-bg border border-brand/40 shadow-[0_0_0_1px_rgba(20,184,166,0.1),0_8px_24px_rgba(0,0,0,0.2)] rounded-lg overflow-hidden flex flex-col">
            <div className="p-3 border-b border-border bg-surface-2 flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm">
                <Sparkles className="w-4 h-4 text-brand" />
                <span className="font-bold text-brand">AI Suggested Response</span>
                <span className="text-[11px] text-text-muted ml-2">(Editable)</span>
              </div>
              <div className="flex gap-2">
                <button onClick={shorten} className="text-[11px] px-2 py-1 bg-surface border border-border rounded hover:bg-surface-2 text-text-muted hover:text-text">Make Shorter</button>
                <button onClick={() => void copy()} className="text-[11px] px-2 py-1 bg-surface border border-border rounded hover:bg-surface-2 text-text-muted hover:text-text inline-flex items-center gap-1">
                  <ClipboardCopy className="w-3 h-3" /> {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write your reply…"
              className="w-full px-3 py-2 lg:px-4 lg:py-3 h-32 lg:h-48 bg-transparent text-sm text-text resize-none focus:outline-none"
            />
            <div className="px-3 py-2 lg:px-4 lg:py-2 border-t border-border bg-surface-2 flex justify-between items-center">
              <div className="text-[11px] text-text-muted">{canSend ? "Sends via your active sender" : "No active sender configured"}</div>
              <button
                onClick={() => onSend(draft)}
                disabled={sending || !draft.trim() || !canSend}
                className="flex items-center gap-2 px-3 py-1.5 lg:px-4 lg:py-2 bg-brand text-bg font-bold text-sm rounded-lg hover:bg-brand-hover shadow-[0_0_12px_rgba(20,184,166,0.3)] disabled:opacity-50 transition-colors"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send Reply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-bg px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-text-faint">{label}</div>
      <div className="text-xs text-text truncate capitalize">{value}</div>
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
  if (mailbox === undefined) return null;

  if (mailbox === null) {
    return (
      <div className="rounded-lg border border-copper/30 bg-copper/10 px-4 py-3 flex items-start gap-3">
        <WifiOff className="h-5 w-5 text-copper shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-bold text-copper">No mailbox connected</div>
          <p className="text-xs text-text-muted mt-1">
            Replies are pulled from your Gmail via IMAP. Until you connect a mailbox, nothing will appear here — even though the lead emailed you back.
          </p>
          <Link href="/settings" className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-copper/40 bg-copper/15 text-xs font-semibold text-copper hover:bg-copper/25">
            <Settings className="h-3.5 w-3.5" /> Connect Gmail in Settings
          </Link>
        </div>
      </div>
    );
  }

  if (!mailbox.enabled) {
    return (
      <div className="rounded-lg border border-copper/30 bg-copper/10 px-4 py-3 flex items-start gap-3">
        <WifiOff className="h-5 w-5 text-copper shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-bold text-copper">Mailbox sync is turned off</div>
          <p className="text-xs text-text-muted mt-1">
            <span className="font-mono">{mailbox.email}</span> is configured but disabled. Enable it in Settings so GeoLead can pull replies automatically.
          </p>
          <Link href="/settings" className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-copper/40 bg-copper/15 text-xs font-semibold text-copper hover:bg-copper/25">
            <Settings className="h-3.5 w-3.5" /> Enable sync
          </Link>
        </div>
      </div>
    );
  }

  if (mailbox.lastSyncStatus === "error") {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 flex items-start gap-3">
        <XCircle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-bold text-danger">Mailbox sync is failing</div>
          <p className="text-xs text-text-muted mt-1">{mailbox.lastSyncError || "The last sync attempt failed."}</p>
          <p className="text-[11px] text-text-faint mt-1">
            Gmail requires an <strong>App Password</strong> (not your normal password), and IMAP must be enabled in Gmail settings.
          </p>
          <div className="mt-2 flex gap-2">
            <Link href="/settings" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-danger/40 bg-danger/15 text-xs font-semibold text-danger hover:bg-danger/25">
              <Settings className="h-3.5 w-3.5" /> Fix credentials
            </Link>
            <button onClick={onSync} disabled={syncing} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-danger/40 bg-danger/15 text-xs font-semibold text-danger hover:bg-danger/25 disabled:opacity-50">
              <RefreshCcw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-success/25 bg-success/5 px-4 py-2.5 flex items-center gap-3 text-xs flex-wrap">
      <Wifi className="h-4 w-4 text-success shrink-0" />
      <span className="text-success font-semibold">Connected:</span>
      <span className="font-mono text-text-muted">{mailbox.email}</span>
      <span className="text-text-faint">
        {mailbox.lastSyncAt ? <>Last sync <ClientDate value={mailbox.lastSyncAt} /></> : "Not synced yet"}
        {" · "}{mailbox.totalImported} imported total · auto every {mailbox.syncIntervalSec}s
      </span>
    </div>
  );
}
