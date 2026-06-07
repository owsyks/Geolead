"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  BellOff,
  CheckCheck,
  ChevronDown,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  Plus,
  RefreshCcw,
  Star,
  Trash2,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { EmptyState, OutboundShell, StatusBadge } from "@/components/OutboundShell";
import {
  fetchOutbound,
  type AiReco,
  type WatchPriority,
  type WatchStatus,
  type WatchedDomain,
  type WatchlistNotification,
  type WatchlistReminder,
} from "@/lib/outbound";

// ─── Config ───────────────────────────────────────────────────────────────────

const PRIORITY_CFG: Record<WatchPriority, { label: string; color: string; bg: string; dot: string }> = {
  CRITICAL: { label: "Critical", color: "text-red-300", bg: "bg-red-500/10 border-red-400/30", dot: "bg-red-500" },
  HIGH:     { label: "High",     color: "text-orange-300", bg: "bg-orange-500/10 border-orange-400/30", dot: "bg-orange-500" },
  MEDIUM:   { label: "Medium",   color: "text-amber-300", bg: "bg-amber-500/10 border-amber-400/30", dot: "bg-amber-400" },
  LOW:      { label: "Low",      color: "text-slate-400", bg: "bg-slate-800/50 border-slate-700", dot: "bg-slate-500" },
};

const STATUS_CFG: Record<WatchStatus, { label: string; color: string }> = {
  WATCHING:       { label: "Watching",     color: "text-slate-400" },
  INTERESTED:     { label: "Interested",   color: "text-teal-400" },
  HIGH_PRIORITY:  { label: "High Priority",color: "text-amber-400" },
  AVAILABLE:      { label: "Available",    color: "text-emerald-400" },
  PURCHASED:      { label: "Purchased",    color: "text-amber-400" },
  IN_PORTFOLIO:   { label: "In Portfolio", color: "text-blue-400" },
};

const RECO_CFG: Record<AiReco, { label: string; color: string }> = {
  BUY_NOW: { label: "Buy Now", color: "text-emerald-400" },
  WAIT:    { label: "Wait",    color: "text-amber-400" },
  MONITOR: { label: "Monitor", color: "text-teal-400" },
  AVOID:   { label: "Avoid",   color: "text-red-400" },
};

type Tab = "all" | "available" | "high_priority" | "reminders" | "notifications";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WatchlistPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [domains, setDomains] = useState<WatchedDomain[]>([]);
  const [notifications, setNotifications] = useState<WatchlistNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, notifs] = await Promise.all([
        fetchOutbound<WatchedDomain[]>("/api/watchlist"),
        fetchOutbound<WatchlistNotification[]>("/api/watchlist/notifications"),
      ]);
      setDomains(list);
      setNotifications(notifs);
    } catch {
      setMessage("Could not load watchlist.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const available = domains.filter(d => d.registrationStatus === "dns_available");
  const highPriority = domains.filter(d => d.priority === "CRITICAL" || d.priority === "HIGH");
  const withReminders = domains.filter(d => d.reminders.some(r => !r.triggered));
  const unreadNotifs = notifications.filter(n => !n.read);

  const tabData = {
    all: domains,
    available,
    high_priority: highPriority,
    reminders: withReminders,
    notifications: [],
  };

  const sendTestEmail = async () => {
    setSendingTest(true);
    setMessage("Sending a test drop-alert email…");
    try {
      const res = await fetchOutbound<{ ok: boolean; to?: string; reason?: string }>(
        "/api/watchlist/test-email",
        { method: "POST", body: JSON.stringify({}) }
      );
      setMessage(res.ok
        ? `✅ Test drop-alert email sent to ${res.to}. Check your inbox (and spam folder).`
        : `❌ Could not send: ${res.reason}`);
    } catch {
      setMessage("❌ Failed to send the test email.");
    } finally {
      setSendingTest(false);
    }
  };

  const checkAll = async () => {
    setCheckingAll(true);
    setMessage("Checking DNS status for all watched domains…");
    try {
      await Promise.all(domains.slice(0, 30).map(d =>
        fetchOutbound(`/api/watchlist/${d.id}/check`, { method: "POST" }).catch(() => {})
      ));
      setMessage("All domains checked.");
      await load();
    } catch {
      setMessage("Some checks failed.");
    } finally {
      setCheckingAll(false);
    }
  };

  const markAllRead = async () => {
    await fetchOutbound("/api/watchlist/notifications/mark-all-read", { method: "POST" }).catch(() => {});
    await load();
  };

  return (
    <OutboundShell
      title="Domain Watchlist"
      subtitle="Monitor domains you want — get alerts when they become available or change status."
      actions={
        <>
          <button onClick={() => setShowAdd(true)} className="h-10 px-3 rounded-lg border border-teal-400/30 bg-teal-500/15 text-sm text-teal-200 inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> Watch domain
          </button>
          <button onClick={() => void checkAll()} disabled={checkingAll || domains.length === 0} className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/70 text-sm text-slate-700 dark:text-slate-300 inline-flex items-center gap-2 disabled:opacity-50">
            {checkingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Check all
          </button>
          <button onClick={() => void sendTestEmail()} disabled={sendingTest} title="Send yourself a sample 'domain available' alert to verify email delivery" className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/70 text-sm text-slate-700 dark:text-slate-300 inline-flex items-center gap-2 disabled:opacity-50">
            {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Test drop email
          </button>
        </>
      }
    >
      {message ? (
        <div className="mb-4 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 flex justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage("")}><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : null}

      {/* AVAILABLE ALERT banner */}
      {available.length > 0 && (
        <div className="mb-5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-5 py-4 flex items-center gap-3">
          <Zap className="h-5 w-5 text-emerald-400 shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-black text-emerald-300">
              {available.length} domain{available.length > 1 ? "s" : ""} {available.length > 1 ? "appear" : "appears"} AVAILABLE for registration!
            </div>
            <div className="text-xs text-emerald-500 mt-0.5">
              {available.map(d => d.domainName).join(" · ")}
            </div>
          </div>
          <button onClick={() => setTab("available")} className="h-8 px-3 rounded-lg border border-emerald-400/30 bg-emerald-500/15 text-xs text-emerald-300 shrink-0">View →</button>
        </div>
      )}

      {/* Unread notifications banner */}
      {unreadNotifs.length > 0 && tab !== "notifications" && (
        <div className="mb-4 rounded-lg border border-teal-400/20 bg-teal-500/5 px-5 py-3 flex items-center gap-3">
          <Bell className="h-4 w-4 text-teal-400 shrink-0" />
          <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">
            {unreadNotifs.length} unread alert{unreadNotifs.length > 1 ? "s" : ""}
          </span>
          <button onClick={() => setTab("notifications")} className="text-xs text-teal-400 hover:text-teal-300">View →</button>
          <button onClick={() => void markAllRead()} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Mark all read</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Watching" value={domains.length} icon={<Star className="h-4 w-4" />} />
        <StatCard label="Available" value={available.length} icon={<Zap className="h-4 w-4" />} highlight={available.length > 0} />
        <StatCard label="High Priority" value={highPriority.length} icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard label="Unread Alerts" value={unreadNotifs.length} icon={<Bell className="h-4 w-4" />} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 mb-5">
        {([
          ["all", `All (${domains.length})`],
          ["available", `Available (${available.length})`],
          ["high_priority", `High Priority (${highPriority.length})`],
          ["reminders", `Reminders (${withReminders.length})`],
          ["notifications", `Alerts (${unreadNotifs.length})`],
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm font-semibold rounded-t-lg transition-colors ${
            tab === t
              ? "bg-teal-500/15 border border-b-0 border-teal-400/30 text-teal-200"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-3 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading watchlist…
        </div>
      ) : tab === "notifications" ? (
        <NotificationsTab notifications={notifications} onMarkRead={async (id) => {
          await fetchOutbound(`/api/watchlist/notifications/${id}/read`, { method: "POST" }).catch(() => {});
          await load();
        }} onMarkAll={() => void markAllRead()} />
      ) : tabData[tab].length === 0 ? (
        <div className="py-8">
          <EmptyState
            title={tab === "available" ? "No domains available yet" : tab === "high_priority" ? "No high-priority domains" : "No domains watched yet"}
            body={tab === "all" ? "Click 'Watch domain' to start tracking a domain. You'll get alerts when it becomes available." : "Domains in this category will appear here."}
          />
        </div>
      ) : (
        <div className="space-y-2">
          {tabData[tab].map(d => (
            <DomainRow
              key={d.id}
              domain={d}
              expanded={expandedId === d.id}
              onToggle={() => setExpandedId(expandedId === d.id ? null : d.id)}
              onRefresh={load}
              onMessage={setMessage}
            />
          ))}
        </div>
      )}

      {showAdd && <AddDomainModal onClose={() => setShowAdd(false)} onSaved={async () => { setShowAdd(false); await load(); }} />}
    </OutboundShell>
  );
}

// ─── Domain row ───────────────────────────────────────────────────────────────

function DomainRow({
  domain: d, expanded, onToggle, onRefresh, onMessage,
}: {
  domain: WatchedDomain;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  onMessage: (m: string) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [archiveDomain, setArchiveDomain] = useState<string | null>(null);
  const pCfg = PRIORITY_CFG[d.priority];
  const sCfg = STATUS_CFG[d.status];
  const dnsAvailable = d.registrationStatus === "dns_available";
  const dnsDropping = d.registrationStatus === "dns_dropping";
  const dnsRegistered = d.registrationStatus === "dns_registered";
  const dnsUnknown = !d.registrationStatus || d.registrationStatus === "dns_unknown";
  const eppStatuses = d.metadata?.eppStatuses ?? [];
  const expiresLabel = d.expirationDate ? new Date(d.expirationDate).toLocaleDateString() : null;

  const checkNow = async () => {
    setChecking(true);
    try {
      await fetchOutbound(`/api/watchlist/${d.id}/check`, { method: "POST" });
      onMessage(`Checked ${d.domainName}.`);
      onRefresh();
    } catch { onMessage("Check failed."); }
    finally { setChecking(false); }
  };

  const setPriority = async (priority: WatchPriority) => {
    await fetchOutbound(`/api/watchlist/${d.id}`, { method: "PATCH", body: JSON.stringify({ priority }) }).catch(() => {});
    onRefresh();
  };

  const setStatus = async (status: WatchStatus) => {
    await fetchOutbound(`/api/watchlist/${d.id}`, { method: "PATCH", body: JSON.stringify({ status }) }).catch(() => {});
    onRefresh();
  };

  const remove = async () => {
    if (!confirm(`Remove ${d.domainName} from watchlist?`)) return;
    await fetchOutbound(`/api/watchlist/${d.id}`, { method: "DELETE" }).catch(() => {});
    onRefresh();
  };

  const moveToPortfolio = async () => {
    await fetchOutbound(`/api/watchlist/${d.id}/move-to-portfolio`, { method: "POST" }).catch(() => {});
    onMessage(`${d.domainName} added to Portfolio.`);
    onRefresh();
  };

  return (
    <div className={`rounded-lg border transition-all ${dnsAvailable ? "border-emerald-400/30 bg-emerald-500/5" : dnsDropping ? "border-orange-400/40 bg-orange-500/5" : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30"}`}>
      <div className="px-4 py-3 flex flex-wrap items-center gap-3">
        {/* Priority dot */}
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${pCfg.dot}`} title={pCfg.label} />

        {/* Domain */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-black text-slate-900 dark:text-slate-50">{d.domainName}</span>
            {dnsAvailable && <span className="text-[11px] font-black text-emerald-400 border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 rounded">AVAILABLE</span>}
            {dnsDropping && <span title="Expired and in redemption / pending-delete — often becomes available soon" className="text-[11px] font-black text-orange-400 border border-orange-400/40 bg-orange-500/10 px-1.5 py-0.5 rounded">DROPPING SOON</span>}
            {dnsRegistered && <span className="text-[11px] text-slate-500 border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 rounded">Registered</span>}
            {dnsUnknown && <span title="Couldn't confirm registry status — re-check shortly" className="text-[11px] text-amber-400/90 border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 rounded">Unverified</span>}
          </div>
          {/* WHOIS/RDAP EPP status codes */}
          {eppStatuses.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {eppStatuses.map((s) => {
                const drop = s === "redemptionPeriod" || s === "pendingDelete" || s === "pendingRestore";
                return (
                  <span
                    key={s}
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                      drop
                        ? "border-orange-400/40 bg-orange-500/10 text-orange-400"
                        : "border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {s}
                  </span>
                );
              })}
            </div>
          )}
          <div className="text-xs text-slate-500 mt-0.5">
            <span className={`font-medium ${sCfg.color}`}>{sCfg.label}</span>
            {d.registrar && <span> · {d.registrar}</span>}
            {expiresLabel && <span> · Exp {expiresLabel}</span>}
            {d.lastCheckedAt && <span> · Checked {new Date(d.lastCheckedAt).toLocaleDateString()}</span>}
          </div>
        </div>

        {/* Scores */}
        <div className="flex items-center gap-4 text-center shrink-0">
          <MiniStat label="Score" value={`${d.acquisitionScore}`} />
          <MiniStat label="Brand" value={`${d.brandScore}`} />
          {d.estimatedValue ? <MiniStat label="Value" value={`$${d.estimatedValue.toLocaleString()}`} /> : null}
          {d.aiRecommendation && (
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">AI</div>
              <div className={`text-xs font-bold ${RECO_CFG[d.aiRecommendation]?.color}`}>
                {RECO_CFG[d.aiRecommendation]?.label}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => void checkNow()} disabled={checking} title="Check DNS now" className="h-7 w-7 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-50">
            {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
          </button>
          <button onClick={() => setShowReminder(true)} title="Add reminder" className="h-7 w-7 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-500 hover:text-amber-400">
            <Clock className="h-3 w-3" />
          </button>
          <button onClick={() => void moveToPortfolio()} title="Add to Portfolio" className="h-7 px-2 rounded-md border border-teal-400/30 bg-teal-500/10 text-teal-300 text-[11px] flex items-center gap-1 hover:text-teal-200">
            <ArrowUpRight className="h-3 w-3" /> Portfolio
          </button>
          <Link href={`/acquisition?prefill=${encodeURIComponent(d.domainName)}`} title="Analyze" className="h-7 w-7 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-500 hover:text-teal-400">
            <TrendingUp className="h-3 w-3" />
          </Link>
          <button onClick={() => setArchiveDomain(d.domainName)} title="Check archive history" className="h-7 w-7 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-500 hover:text-teal-400">
            <Clock className="h-3 w-3" />
          </button>
          <button onClick={onToggle} className="h-7 w-7 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-500">
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          <button onClick={() => void remove()} className="h-7 w-7 rounded-md border border-red-400/20 bg-red-500/5 flex items-center justify-center text-red-400 hover:text-red-300">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Priority selector */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Priority</div>
              <div className="flex flex-wrap gap-1.5">
                {(["CRITICAL","HIGH","MEDIUM","LOW"] as WatchPriority[]).map(p => (
                  <button key={p} onClick={() => void setPriority(p)} className={`h-6 px-2 rounded-md text-[11px] font-bold border transition-all ${
                    d.priority === p ? PRIORITY_CFG[p].bg + " " + PRIORITY_CFG[p].color : "border-slate-300 dark:border-slate-700 text-slate-500"
                  }`}>{PRIORITY_CFG[p].label}</button>
                ))}
              </div>
            </div>

            {/* Status selector */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Status</div>
              <div className="flex flex-wrap gap-1.5">
                {(["WATCHING","INTERESTED","HIGH_PRIORITY","AVAILABLE","PURCHASED"] as WatchStatus[]).map(s => (
                  <button key={s} onClick={() => void setStatus(s)} className={`h-6 px-2 rounded-md text-[11px] font-bold border transition-all ${
                    d.status === s ? "border-teal-400/30 bg-teal-500/15 text-teal-300" : "border-slate-300 dark:border-slate-700 text-slate-500"
                  }`}>{STATUS_CFG[s].label}</button>
                ))}
              </div>
            </div>

            {/* Active reminders */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Reminders</div>
              {d.reminders.filter(r => !r.triggered).length === 0 ? (
                <div className="text-xs text-slate-500">No active reminders</div>
              ) : (
                <ul className="space-y-1">
                  {d.reminders.filter(r => !r.triggered).map(r => (
                    <li key={r.id} className="flex items-center justify-between text-xs bg-amber-500/5 border border-amber-400/20 rounded px-2 py-1">
                      <span className="text-amber-300">{r.label || r.type}{r.triggerAt ? ` · ${new Date(r.triggerAt).toLocaleDateString()}` : ""}</span>
                      <button onClick={async () => {
                        await fetchOutbound(`/api/watchlist/${d.id}/reminders/${r.id}`, { method: "DELETE" }).catch(() => {});
                        onRefresh();
                      }} className="text-slate-500 hover:text-red-400"><X className="h-3 w-3" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* AI reasoning */}
          {d.aiReasoning && (
            <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">AI Reasoning</div>
              {d.aiReasoning}
            </div>
          )}

          {/* Recent events */}
          {d.events.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Recent Events</div>
              <div className="space-y-1">
                {d.events.map(e => (
                  <div key={e.id} className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-1.5 py-0.5 rounded font-mono">{e.type}</span>
                    <span>{new Date(e.createdAt).toLocaleString()}</span>
                    {e.details && <span className="text-slate-400">{JSON.stringify(e.details)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showReminder && (
        <AddReminderModal
          domainId={d.id}
          domainName={d.domainName}
          onClose={() => setShowReminder(false)}
          onSaved={async () => { setShowReminder(false); onRefresh(); }}
        />
      )}
      {archiveDomain && (
        <ArchiveHistoryModal domain={archiveDomain} onClose={() => setArchiveDomain(null)} />
      )}
    </div>
  );
}

// ─── Notifications tab ────────────────────────────────────────────────────────

function NotificationsTab({
  notifications, onMarkRead, onMarkAll,
}: {
  notifications: WatchlistNotification[];
  onMarkRead: (id: string) => void;
  onMarkAll: () => void;
}) {
  const NOTIF_COLORS: Record<string, string> = {
    AVAILABLE: "border-emerald-400/30 bg-emerald-500/5",
    STATUS_CHANGE: "border-teal-400/20 bg-teal-500/5",
    REMINDER: "border-amber-400/20 bg-amber-500/5",
    EXPIRING: "border-red-400/20 bg-red-500/5",
  };

  if (notifications.length === 0) {
    return <EmptyState title="No notifications" body="Alerts will appear here when watched domains change status or reminders fire." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={onMarkAll} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1">
          <CheckCheck className="h-3.5 w-3.5" /> Mark all read
        </button>
      </div>
      {notifications.map(n => (
        <div key={n.id} onClick={() => !n.read && onMarkRead(n.id)} className={`rounded-lg border p-4 cursor-pointer transition-all ${NOTIF_COLORS[n.type] || "border-slate-200 dark:border-slate-800"} ${n.read ? "opacity-60" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={`text-sm font-bold ${n.priority === "URGENT" ? "text-emerald-300" : "text-slate-800 dark:text-slate-200"}`}>
                {n.title}
              </div>
              <p className="text-xs text-slate-500 mt-1">{n.body}</p>
              <div className="text-[11px] text-slate-500 mt-1.5">{new Date(n.createdAt).toLocaleString()}</div>
            </div>
            {!n.read && <span className="h-2 w-2 rounded-full bg-teal-400 shrink-0 mt-1.5" />}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Shared small components ──────────────────────────────────────────────────

function StatCard({ label, value, icon, highlight }: { label: string; value: number; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight && value > 0 ? "border-emerald-400/30 bg-emerald-500/5" : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/35"}`}>
      <div className={`flex items-center gap-2 text-[11px] uppercase tracking-wide ${highlight && value > 0 ? "text-emerald-400" : "text-slate-500"}`}>
        {icon}{label}
      </div>
      <div className={`mt-1 text-2xl font-black ${highlight && value > 0 ? "text-emerald-400" : "text-slate-900 dark:text-slate-50"}`}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center hidden sm:block">
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{value}</div>
    </div>
  );
}

// ─── Archive history modal ────────────────────────────────────────────────────

interface ArchiveSnapshot { timestamp: string; status: string; }

function ArchiveHistoryModal({ domain, onClose }: { domain: string; onClose: () => void }) {
  const [state, setState] = useState<"loading" | "done" | "empty" | "error">("loading");
  const [snapshots, setSnapshots] = useState<ArchiveSnapshot[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetchOutbound<string[][]>(`/api/domains/archive-check?domain=${encodeURIComponent(domain)}`)
      .then(rows => {
        if (!Array.isArray(rows) || rows.length <= 1) { setState("empty"); return; }
        setSnapshots(rows.slice(1).map(r => ({ timestamp: r[0], status: r[1] })));
        setState("done");
      })
      .catch(() => { setErrorMsg("Could not reach the archive service. Try again in a moment."); setState("error"); });
  }, [domain]);

  const fmt = (ts: string) => {
    try { return new Date(`${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)}`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }
    catch { return ts.slice(0, 8); }
  };

  const active = snapshots.filter(s => s.status === "200");
  const wasUsed = active.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-teal-400" /><h3 className="text-base font-black text-slate-900 dark:text-slate-100">Wayback Machine History</h3></div>
            <div className="mt-0.5 text-xs font-mono text-slate-500">{domain}</div>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">
          {state === "loading" && <div className="flex items-center justify-center gap-3 py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-teal-400" />Checking archive…</div>}
          {state === "error" && <div className="rounded-lg border border-red-400/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">{errorMsg}</div>}
          {state === "empty" && (
            <div className="text-center py-8">
              <div className="text-3xl mb-3">🆕</div>
              <div className="text-base font-black text-slate-900 dark:text-slate-100">No archive records found</div>
              <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">This domain has no history in the Wayback Machine — likely a <strong className="text-emerald-400">clean slate</strong> with no prior content.</p>
              <a href={`https://web.archive.org/web/*/${domain}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 text-xs text-teal-400 hover:text-teal-300"><ExternalLink className="h-3 w-3" />Verify on Wayback Machine</a>
            </div>
          )}
          {state === "done" && (
            <div className="space-y-4">
              <div className={`rounded-lg border p-4 ${wasUsed ? "border-amber-400/30 bg-amber-500/5" : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30"}`}>
                <div className={`text-sm font-bold ${wasUsed ? "text-amber-300" : "text-slate-600 dark:text-slate-400"}`}>
                  {wasUsed ? "⚠️ This domain was previously used as an active website" : "ℹ️ Archive records found but no active pages detected"}
                </div>
                <p className="text-xs text-slate-500 mt-1">{wasUsed ? "Prior content may affect SEO reputation or brand perception." : "May have had parking pages or redirects only."}</p>
                <div className="grid grid-cols-3 gap-3 mt-3 text-center">
                  <div><div className="text-[10px] uppercase tracking-wide text-slate-500">First seen</div><div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">{snapshots[0] ? fmt(snapshots[0].timestamp) : "—"}</div></div>
                  <div><div className="text-[10px] uppercase tracking-wide text-slate-500">Last seen</div><div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">{snapshots[snapshots.length-1] ? fmt(snapshots[snapshots.length-1].timestamp) : "—"}</div></div>
                  <div><div className="text-[10px] uppercase tracking-wide text-slate-500">Active pages</div><div className={`text-xs font-bold mt-0.5 ${wasUsed ? "text-amber-400" : "text-slate-500"}`}>{active.length}</div></div>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Snapshot history</div>
                <div className="space-y-0.5 max-h-44 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-900">
                  {snapshots.map((s, i) => (
                    <a key={i} href={`https://web.archive.org/web/${s.timestamp}/${domain}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-900/60 group">
                      <span className="text-slate-600 dark:text-slate-400">{fmt(s.timestamp)}</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold text-[11px] ${s.status==="200"?"text-emerald-500":s.status==="301"||s.status==="302"?"text-amber-400":s.status==="404"?"text-red-400":"text-slate-400"}`}>{s.status}</span>
                        <ExternalLink className="h-3 w-3 text-slate-300 dark:text-slate-600 group-hover:text-teal-400 transition" />
                      </div>
                    </a>
                  ))}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">200 = active · 301/302 = redirect · 404 = not found</div>
              </div>
              <a href={`https://web.archive.org/web/*/${domain}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 h-9 w-full rounded-lg border border-teal-400/30 bg-teal-500/10 text-sm text-teal-300 hover:text-teal-200 transition">
                <ExternalLink className="h-4 w-4" />View full timeline on Wayback Machine
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add domain modal ─────────────────────────────────────────────────────────

function AddDomainModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [form, setForm] = useState({ domainName: "", priority: "MEDIUM", notes: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.domainName.trim()) { setError("Domain name is required."); return; }
    setSaving(true);
    try {
      await fetchOutbound("/api/watchlist", { method: "POST", body: JSON.stringify({ ...form, addedFrom: "manual" }) });
      await onSaved();
    } catch (err: any) {
      setError(err?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-base font-black text-slate-900 dark:text-slate-100">Watch a domain</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <label className="block text-xs font-bold text-slate-500">
            Domain name<span className="text-red-400">*</span>
            <input
              value={form.domainName}
              onChange={e => setForm(c => ({ ...c, domainName: e.target.value }))}
              placeholder="MiamiRoofing.com"
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-teal-400"
            />
          </label>
          <label className="block text-xs font-bold text-slate-500">
            Priority
            <select value={form.priority} onChange={e => setForm(c => ({ ...c, priority: e.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100">
              {(["CRITICAL","HIGH","MEDIUM","LOW"]).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold text-slate-500">
            Notes
            <textarea value={form.notes} onChange={e => setForm(c => ({ ...c, notes: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-teal-400 resize-none" />
          </label>
          {error && <div className="text-xs text-red-400">{error}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400">Cancel</button>
            <button onClick={() => void submit()} disabled={saving} className="h-9 px-4 rounded-lg border border-teal-400/30 bg-teal-500/15 text-sm text-teal-200 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add to watchlist"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Add reminder modal ───────────────────────────────────────────────────────

function AddReminderModal({ domainId, domainName, onClose, onSaved }: {
  domainId: string; domainName: string; onClose: () => void; onSaved: () => void | Promise<void>;
}) {
  const [type, setType] = useState<"DAYS" | "STATUS_CHANGE" | "AVAILABLE">("DAYS");
  const [days, setDays] = useState("7");
  const [notifyVia, setNotifyVia] = useState<"IN_APP" | "EMAIL" | "BOTH">("IN_APP");
  const [saving, setSaving] = useState(false);

  const PRESET_DAYS = [7, 14, 30, 60, 90];
  const TYPE_LABELS = { DAYS: "In N days", STATUS_CHANGE: "On status change", AVAILABLE: "When available" };

  const submit = async () => {
    setSaving(true);
    try {
      await fetchOutbound(`/api/watchlist/${domainId}/reminders`, {
        method: "POST",
        body: JSON.stringify({ type, daysFromNow: type === "DAYS" ? Number(days) : undefined, notifyVia, label: type === "DAYS" ? `Reminder in ${days} days for ${domainName}` : TYPE_LABELS[type] }),
      });
      await onSaved();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-base font-black text-slate-900 dark:text-slate-100">Add reminder · {domainName}</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="text-xs font-bold text-slate-500 mb-2">Reminder type</div>
            <div className="flex flex-col gap-1.5">
              {(["DAYS","STATUS_CHANGE","AVAILABLE"] as const).map(t => (
                <button key={t} onClick={() => setType(t)} className={`h-9 px-3 rounded-lg border text-sm text-left transition-all ${type === t ? "border-teal-400/30 bg-teal-500/15 text-teal-200" : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"}`}>
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {type === "DAYS" && (
            <div>
              <div className="text-xs font-bold text-slate-500 mb-2">Days from now</div>
              <div className="flex gap-2 flex-wrap">
                {PRESET_DAYS.map(d => (
                  <button key={d} onClick={() => setDays(String(d))} className={`h-7 px-2.5 rounded-md border text-xs transition-all ${days === String(d) ? "border-amber-400/30 bg-amber-500/10 text-amber-300" : "border-slate-300 dark:border-slate-700 text-slate-500"}`}>{d}d</button>
                ))}
                <input type="number" value={days} onChange={e => setDays(e.target.value)} min={1} className="h-7 w-16 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-xs text-center text-slate-900 dark:text-slate-100" />
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-bold text-slate-500 mb-2">Notify via</div>
            <div className="flex gap-2">
              {(["IN_APP","EMAIL","BOTH"] as const).map(v => (
                <button key={v} onClick={() => setNotifyVia(v)} className={`h-7 px-3 rounded-md border text-xs transition-all ${notifyVia === v ? "border-teal-400/30 bg-teal-500/10 text-teal-300" : "border-slate-300 dark:border-slate-700 text-slate-500"}`}>{v}</button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400">Cancel</button>
            <button onClick={() => void submit()} disabled={saving} className="h-9 px-4 rounded-lg border border-amber-400/30 bg-amber-500/10 text-sm text-amber-300 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set reminder"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
