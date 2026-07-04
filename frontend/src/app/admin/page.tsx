"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Users, Bug, Activity, DollarSign, Search, ShieldAlert, CheckCircle2,
  MoreHorizontal, RefreshCw, Ban, Trash2, CreditCard, BarChart2, UserCheck,
  Download, Loader2, Server, AlertTriangle, RotateCcw, ChevronDown, ChevronUp,
  Send, UserX,
} from "lucide-react";
import { OutboundShell } from "@/components/OutboundShell";
import { cn, Modal } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import {
  getAdminUsers, suspendUser, changeUserPlan, deleteUser, downloadUsersCsv,
  getRevenue, getSystem, getTickets, patchTicket, getTicketThread, replyToTicket,
  type AdminUser, type RevenueSummary, type SystemHealth, type AdminTicket, type AdminTicketDetail,
} from "@/lib/admin";

/* ── style maps ── */
const planColor: Record<string, string> = {
  pro: "text-brand bg-brand/10 border-brand/25",
  starter: "text-copper bg-copper/10 border-copper/25",
  trial: "text-text-muted bg-surface-2 border-border",
};
const svcDot: Record<string, string> = {
  UP: "bg-success", DEGRADED: "bg-copper animate-pulse", DOWN: "bg-danger animate-pulse",
};
const svcText: Record<string, string> = { UP: "text-success", DEGRADED: "text-copper", DOWN: "text-danger" };

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function planChip(plan: string) {
  return planColor[plan] ?? planColor.trial;
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border", className)}>
      {children}
    </span>
  );
}

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub: string; color: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider text-text-faint">{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-2">
          <Icon className={cn("w-4 h-4", color)} />
        </div>
      </div>
      <div>
        <div className={cn("text-[2rem] font-black font-mono tabular-nums leading-none", color)}>{value}</div>
        <div className="text-[11px] text-text-faint mt-1">{sub}</div>
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="flex items-center justify-center py-16 text-text-faint"><Loader2 className="w-5 h-5 animate-spin" /></div>;
}

const TABS = [
  { id: "overview", label: "Overview", icon: BarChart2 },
  { id: "users", label: "Users", icon: Users },
  { id: "tickets", label: "Tickets", icon: Bug },
  { id: "system", label: "System", icon: Activity },
  { id: "revenue", label: "Revenue", icon: DollarSign },
];

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [system, setSystem] = useState<SystemHealth | null>(null);
  const [tickets, setTickets] = useState<AdminTicket[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isAdmin = !!user?.isAdmin;

  // On failure, keep whatever was already loaded instead of wiping it to an
  // empty list — a transient reload failure shouldn't make existing rows vanish.
  const loadUsers = useCallback(async () => {
    try { const r = await getAdminUsers(); setUsers(r.users); return true; }
    catch { setUsers((prev) => prev ?? []); setLoadError("Couldn't load users — check your connection and retry."); return false; }
  }, []);
  const loadTickets = useCallback(async () => {
    try { const r = await getTickets(); setTickets(r.tickets); return true; }
    catch { setTickets((prev) => prev ?? []); setLoadError("Couldn't load tickets — check your connection and retry."); return false; }
  }, []);
  const loadRevenue = useCallback(async () => {
    try { setRevenue(await getRevenue()); return true; }
    catch { setLoadError("Couldn't load revenue data — check your connection and retry."); return false; }
  }, []);
  const loadSystem = useCallback(async () => {
    try { setSystem(await getSystem()); return true; }
    catch { setLoadError("Couldn't load system health — check your connection and retry."); return false; }
  }, []);

  const loadAll = useCallback(async () => {
    setLoadError(null);
    await Promise.all([loadUsers(), loadTickets(), loadRevenue(), loadSystem()]);
  }, [loadUsers, loadTickets, loadRevenue, loadSystem]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadAll();
  }, [isAdmin, loadAll]);

  if (user && !isAdmin) {
    return (
      <OutboundShell title="Admin Panel" eyebrow="Internal">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ShieldAlert className="w-10 h-10 text-danger mb-3" />
          <div className="text-lg font-bold">Not authorized</div>
          <div className="text-sm text-text-muted mt-1">This area is restricted to platform administrators.</div>
        </div>
      </OutboundShell>
    );
  }

  const openTickets = (tickets ?? []).filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS").length;
  const urgentTickets = (tickets ?? []).filter((t) => t.priority === "URGENT" && t.status !== "DONE").length;

  return (
    <OutboundShell title="Admin Panel" subtitle="Full system control" eyebrow="Internal" fullBleed>
      <div className="flex flex-col h-full">
        {urgentTickets > 0 && (
          <div className="bg-danger/10 border-b border-danger/20 px-5 py-2.5 flex items-center gap-3">
            <ShieldAlert className="w-4 h-4 text-danger flex-shrink-0" />
            <span className="text-[12px] font-bold text-danger">
              {urgentTickets} urgent ticket{urgentTickets > 1 ? "s" : ""} need attention —
            </span>
            <button className="text-[12px] text-danger underline font-bold" onClick={() => setTab("tickets")}>View tickets</button>
          </div>
        )}

        {loadError && (
          <div className="bg-danger/10 border-b border-danger/20 px-5 py-2.5 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0" />
            <span className="text-[12px] font-bold text-danger">{loadError}</span>
            <button className="text-[12px] text-danger underline font-bold" onClick={() => void loadAll()}>Retry</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 lg:p-6 flex flex-col gap-5">
          {/* tab bar */}
          <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1 self-start overflow-x-auto max-w-full">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-bold transition-all whitespace-nowrap",
                  tab === t.id ? "bg-bg text-text shadow-sm border border-border" : "text-text-muted hover:text-text")}>
                <t.icon className="w-4 h-4" />
                {t.label}
                {t.id === "tickets" && openTickets > 0 && (
                  <span className="min-w-[16px] h-4 px-1 rounded-full bg-danger text-bg text-[9px] font-black flex items-center justify-center">{openTickets}</span>
                )}
              </button>
            ))}
          </div>

          {tab === "overview" && <OverviewTab users={users} revenue={revenue} tickets={tickets} system={system} onGoToTickets={() => setTab("tickets")} />}
          {tab === "users" && <UsersTab users={users} reload={loadUsers} selfId={user?.id} />}
          {tab === "tickets" && <TicketsTab tickets={tickets} reload={loadTickets} />}
          {tab === "system" && <SystemTab system={system} reload={loadSystem} />}
          {tab === "revenue" && <RevenueTab revenue={revenue} />}
        </div>
      </div>
    </OutboundShell>
  );
}

/* ══ OVERVIEW ══ */
function OverviewTab({ users, revenue, tickets, system, onGoToTickets }: {
  users: AdminUser[] | null; revenue: RevenueSummary | null; tickets: AdminTicket[] | null; system: SystemHealth | null; onGoToTickets: () => void;
}) {
  if (!users || !tickets) return <Spinner />;
  const health = system ? Math.round((system.healthy / Math.max(system.total, 1)) * 100) : null;
  const planCounts = users.reduce<Record<string, number>>((a, u) => { a[u.plan] = (a[u.plan] ?? 0) + 1; return a; }, {});
  const urgent = tickets.filter((t) => t.priority === "URGENT" || t.priority === "HIGH").slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="Total Users" value={String(users.length)} sub="all accounts" color="text-brand" />
        <KpiCard icon={DollarSign} label="MRR" value={revenue ? `$${revenue.mrr}` : "—"} sub={revenue ? `${revenue.activeUsers} active` : ""} color="text-success" />
        <KpiCard icon={Bug} label="Open Tickets" value={String(tickets.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS").length)} sub={`${tickets.filter((t) => t.priority === "URGENT" && t.status !== "DONE").length} urgent`} color="text-copper" />
        <KpiCard icon={Activity} label="System Health" value={health != null ? `${health}%` : "—"} sub={system ? `${system.healthy}/${system.total} services up` : ""} color="text-info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border font-bold text-[13px]">Recent Signups</div>
          <div className="divide-y divide-border">
            {users.slice(0, 5).map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-8 h-8 rounded-full bg-brand/15 border border-brand/25 flex items-center justify-center font-black text-brand text-[11px]">
                  {u.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[13px] truncate">{u.name}</div>
                  <div className="text-[11px] text-text-faint truncate">{u.email}</div>
                </div>
                <Chip className={planChip(u.plan)}>{u.plan}</Chip>
                <span className="text-[11px] text-text-faint w-16 text-right">{fmtDate(u.createdAt)}</span>
              </div>
            ))}
            {users.length === 0 && <div className="px-5 py-8 text-center text-text-faint text-sm">No users yet.</div>}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
            <span className="font-bold text-[13px]">Priority Tickets</span>
            <button onClick={onGoToTickets} className="text-[11px] text-danger font-mono font-bold hover:underline">view all</button>
          </div>
          <div className="divide-y divide-border">
            {urgent.map((t) => (
              <div key={t.id} className="px-5 py-3">
                <div className="text-[12px] font-medium line-clamp-2 leading-snug">{t.subject}</div>
                <div className="text-[10px] text-text-faint mt-1">{t.priority} · {t.user}</div>
              </div>
            ))}
            {urgent.length === 0 && <div className="px-5 py-8 text-center text-text-faint text-sm">No priority tickets.</div>}
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="font-bold text-[13px] mb-4">Plan Distribution</div>
        <div className="grid grid-cols-3 gap-6">
          {(["pro", "starter", "trial"] as const).map((plan) => {
            const count = planCounts[plan] ?? 0;
            const pct = users.length ? Math.round((count / users.length) * 100) : 0;
            const color = plan === "pro" ? "#14b8a6" : plan === "starter" ? "#d97706" : "#6b645e";
            return (
              <div key={plan}>
                <div className="flex justify-between items-end mb-2">
                  <span className="font-mono text-[10px] font-black uppercase tracking-wider" style={{ color }}>{plan}</span>
                  <span className="font-mono text-[13px] font-black text-text">{count}</span>
                </div>
                <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                </div>
                <div className="text-[10px] text-text-faint mt-1">{pct}% of base</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ══ USERS ══ */
function UsersTab({ users, reload, selfId }: { users: AdminUser[] | null; reload: () => void; selfId?: string }) {
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("ALL");
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [planModal, setPlanModal] = useState<AdminUser | null>(null);
  const [deleteModal, setDeleteModal] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);

  // The action menu is rendered in a portal (fixed-positioned) so it isn't
  // clipped by the table's overflow-hidden/overflow-x-auto wrappers — close it
  // if the page scrolls or resizes underneath it so it doesn't detach from the
  // trigger button.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  if (!users) return <Spinner />;

  const filtered = users
    .filter((u) => planFilter === "ALL" || u.plan === planFilter.toLowerCase())
    .filter((u) => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));

  async function toggleSuspend(u: AdminUser) {
    setBusy(true);
    try { await suspendUser(u.id, !u.isActive); reload(); } finally { setBusy(false); setMenu(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-faint" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..."
              className="bg-surface border border-border rounded-lg pl-8 pr-3 py-2 text-[13px] focus:border-brand focus:outline-none w-[200px] placeholder:text-text-faint" />
          </div>
          {["ALL", "TRIAL", "STARTER", "PRO"].map((p) => (
            <button key={p} onClick={() => setPlanFilter(p)}
              className={cn("px-3 py-1.5 text-[11px] font-bold rounded-lg border transition-colors",
                planFilter === p ? "bg-brand/10 border-brand/30 text-brand" : "bg-surface border-border text-text-muted hover:text-text")}>
              {p === "ALL" ? `All (${users.length})` : `${p} (${users.filter((u) => u.plan === p.toLowerCase()).length})`}
            </button>
          ))}
        </div>
        <button onClick={() => { downloadUsersCsv(search, planFilter).catch((e) => alert(e?.message || "Export failed.")); }}
          className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-lg text-[12px] font-bold text-text-muted hover:text-text transition-colors">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[900px]">
            <thead className="border-b border-border bg-surface-2/50">
              <tr className="text-[10px] uppercase tracking-wider text-text-faint font-black">
                <th className="px-4 py-3">User</th><th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3 text-right">Searches</th><th className="px-4 py-3 text-right">Campaigns</th>
                <th className="px-4 py-3">Status</th><th className="px-4 py-3">Revenue</th>
                <th className="px-4 py-3">Last Seen</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9} className="text-center py-10 text-text-faint text-sm">No users match your filter.</td></tr>}
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-border hover:bg-surface-2/30 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-brand/15 border border-brand/20 flex items-center justify-center font-black text-brand text-[10px]">
                        {u.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-bold text-[13px] flex items-center gap-1.5">
                          {u.name}
                          {u.isAdmin && <span className="text-[9px] font-black text-brand border border-brand/30 rounded px-1">ADMIN</span>}
                        </div>
                        <div className="text-[11px] text-text-faint">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><Chip className={planChip(u.plan)}>{u.plan}</Chip></td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-[13px]">{u.searches}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-[13px]">{u.campaigns}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className={cn("w-1.5 h-1.5 rounded-full", u.isActive ? "bg-success" : "bg-danger")} />
                      <span className={cn("text-[12px] font-bold", u.isActive ? "text-success" : "text-danger")}>{u.isActive ? "ACTIVE" : "SUSPENDED"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-text-muted">${u.revenue}<span className="text-text-faint">/mo</span></td>
                  <td className="px-4 py-3 text-[12px] text-text-muted">{fmtDate(u.lastSeenAt)}</td>
                  <td className="px-4 py-3 text-[12px] text-text-faint">{fmtDate(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="relative">
                      <button onClick={(e) => {
                          if (menu?.id === u.id) { setMenu(null); return; }
                          const r = e.currentTarget.getBoundingClientRect();
                          const MENU_W = 192, MENU_H = 140;
                          const openUpward = r.bottom + MENU_H > window.innerHeight;
                          setMenu({ id: u.id, top: openUpward ? r.top - MENU_H - 4 : r.bottom + 4, left: Math.max(8, r.right - MENU_W) });
                        }}
                        aria-label={`Actions for ${u.name}`} title="Actions"
                        className="p-2 rounded-lg hover:bg-surface text-text-faint hover:text-text transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {menu?.id === u.id && createPortal(
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                          <div className="fixed z-50 w-48 bg-bg border border-border rounded-xl shadow-2xl overflow-hidden py-1" style={{ top: menu.top, left: menu.left }}>
                            <button onClick={() => { setPlanModal(u); setMenu(null); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium hover:bg-surface-2 text-text">
                              <CreditCard className="w-3.5 h-3.5" /> Change Plan
                            </button>
                            <button disabled={u.isAdmin || busy} onClick={() => toggleSuspend(u)}
                              className={cn("w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed",
                                u.isActive ? "text-copper" : "text-success")}>
                              {u.isActive ? <Ban className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                              {u.isActive ? "Suspend" : "Unsuspend"}
                            </button>
                            <button disabled={u.isAdmin || u.id === selfId} onClick={() => { setDeleteModal(u); setMenu(null); }}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium hover:bg-surface-2 text-danger disabled:opacity-40 disabled:cursor-not-allowed">
                              <Trash2 className="w-3.5 h-3.5" /> Delete Account
                            </button>
                          </div>
                        </>,
                        document.body
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {planModal && <PlanModal user={planModal} onClose={() => setPlanModal(null)} onSaved={() => { setPlanModal(null); reload(); }} />}
      {deleteModal && <DeleteModal user={deleteModal} onClose={() => setDeleteModal(null)} onDeleted={() => { setDeleteModal(null); reload(); }} />}
    </div>
  );
}

function PlanModal({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => void }) {
  const [plan, setPlan] = useState(user.plan);
  const [status, setStatus] = useState(user.planStatus);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const SELECT = "h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text outline-none focus:border-brand";

  async function save() {
    setBusy(true); setErr(null);
    try { await changeUserPlan(user.id, plan, status); onSaved(); }
    catch (e: any) { setErr(e?.message || "Failed to update plan."); }
    finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Change plan — ${user.email}`} maxWidth="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">Plan</label>
          <select className={SELECT} value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="trial">Trial</option><option value="starter">Starter</option><option value="pro">Pro</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">Status</label>
          <select className={SELECT} value={status} onChange={(e) => setStatus(e.target.value)}>
            {["trialing", "active", "past_due", "canceled", "expired"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {err && <div className="text-danger text-sm">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-bold text-text-muted hover:text-text">Cancel</button>
          <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-brand text-bg text-sm font-bold disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteModal({ user, onClose, onDeleted }: { user: AdminUser; onClose: () => void; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function doDelete() {
    setBusy(true); setErr(null);
    try { await deleteUser(user.id, confirm); onDeleted(); }
    catch (e: any) { setErr(e?.message || "Failed to delete."); }
    finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title="Delete account" maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="flex items-start gap-2 text-sm text-text-muted">
          <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
          <span>This permanently deletes <b className="text-text">{user.email}</b> and all of their leads, campaigns, and data. This cannot be undone.</span>
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">Type the email to confirm</label>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={user.email}
            className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text outline-none focus:border-danger" />
        </div>
        {err && <div className="text-danger text-sm">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-bold text-text-muted hover:text-text">Cancel</button>
          <button onClick={doDelete} disabled={busy || confirm.trim().toLowerCase() !== user.email.toLowerCase()}
            className="px-4 py-2 rounded-lg bg-danger text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ══ TICKETS ══ */
function TicketThreadRow({ ticket, onChanged }: { ticket: AdminTicket; onChanged: () => void }) {
  const [detail, setDetail] = useState<AdminTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTicketThread(ticket.id).then((d) => { if (!cancelled) { setDetail(d); setLoading(false); } });
    return () => { cancelled = true; };
  }, [ticket.id]);

  async function send() {
    const body = reply.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const { message } = await replyToTicket(ticket.id, body);
      setDetail((d) => d ? { ...d, messages: [...d.messages, message], status: d.status === "OPEN" ? "IN_PROGRESS" : d.status } : d);
      setReply("");
      onChanged();
    } finally {
      setSending(false);
    }
  }

  return (
    <tr className="border-b border-border bg-surface-2/20">
      <td colSpan={6} className="px-4 py-4">
        {loading ? (
          <div className="py-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-text-faint" /></div>
        ) : detail ? (
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-border">
              <div className="text-[12px]">
                <span className="font-bold text-text">{detail.userName || "Unnamed contact"}</span>
                {" · "}
                <a href={`mailto:${detail.user}`} className="font-mono text-brand hover:underline">{detail.user}</a>
              </div>
              {detail.isGuest && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-copper bg-copper/10 border border-copper/25 rounded px-1.5 py-0.5">
                  <UserX className="w-2.5 h-2.5" /> Guest — no account
                </span>
              )}
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {detail.messages.map((m) => (
                <div key={m.id} className={cn("max-w-[85%] px-3 py-2 rounded-xl text-[13px] leading-snug",
                  m.sender === "ADMIN" ? "ml-auto bg-brand/10 border border-brand/20 text-text" : "bg-surface border border-border text-text")}>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-text-faint mb-0.5">
                    {m.sender === "ADMIN" ? "You (Admin)" : m.sender === "BOT" ? "Bot" : detail.userName || detail.user}
                  </div>
                  {m.body}
                  <div className="text-[10px] text-text-faint mt-1">{fmtDate(m.createdAt)}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Reply to this ticket..."
                className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-[13px] focus:border-brand focus:outline-none"
              />
              <button onClick={send} disabled={sending || !reply.trim()}
                className="px-3 py-2 rounded-lg bg-brand text-bg text-[12px] font-bold flex items-center gap-1.5 hover:bg-brand-hover disabled:opacity-50">
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Reply
              </button>
            </div>
          </div>
        ) : (
          <div className="text-[13px] text-text-muted">Couldn't load this thread.</div>
        )}
      </td>
    </tr>
  );
}

function TicketsTab({ tickets, reload }: { tickets: AdminTicket[] | null; reload: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  if (!tickets) return <Spinner />;

  async function setStatus(id: string, status: string) {
    setBusyId(id);
    try { await patchTicket(id, { status }); reload(); } finally { setBusyId(null); }
  }

  async function doRefresh() {
    setRefreshing(true);
    try { await reload(); } finally { setRefreshing(false); }
  }

  // New tickets only ever show up after this reload runs — mount only
  // fetches once, so make refreshing a single visible click instead of
  // requiring a full page reload to check "did that submission arrive?"
  const refreshButton = (
    <button onClick={doRefresh} disabled={refreshing}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border rounded-lg text-[12px] font-bold text-text-muted hover:text-text disabled:opacity-60">
      <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} /> Refresh
    </button>
  );

  if (tickets.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{refreshButton}</div>
        <div className="bg-surface border border-border rounded-xl py-16 flex flex-col items-center text-center">
          <Bug className="w-8 h-8 text-text-faint mb-3" />
          <div className="font-bold text-[14px]">No tickets yet</div>
          <div className="text-sm text-text-muted mt-1">Support requests submitted by users will appear here.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">{refreshButton}</div>
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[800px]">
          <thead className="border-b border-border bg-surface-2/50">
            <tr className="text-[10px] uppercase tracking-wider text-text-faint font-black">
              <th className="px-4 py-3">Issue</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th><th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <Fragment key={t.id}>
                <tr className="border-b border-border hover:bg-surface-2/30 group cursor-pointer"
                  onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                  <td className="px-4 py-3 max-w-[320px]">
                    <div className="flex items-center gap-1.5">
                      {expanded === t.id ? <ChevronUp className="w-3.5 h-3.5 text-text-faint shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-text-faint shrink-0" />}
                      <div className="min-w-0">
                        <div className="font-medium text-[13px] leading-snug truncate">{t.subject}</div>
                        <div className="text-[11px] text-text-faint mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">{t.userName || t.user}</span>
                          {/* Name alone doesn't tell an admin how to reach a guest — always
                              surface the email too, since that's the only contact channel. */}
                          {t.userName && <span className="truncate">· {t.user}</span>}
                          {t.isGuest && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-copper bg-copper/10 border border-copper/25 rounded px-1 py-0.5">
                              <UserX className="w-2.5 h-2.5" /> Guest
                            </span>
                          )}
                          {t.messageCount > 1 && <span className="text-text-faint">· {t.messageCount} msgs</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><Chip className="text-text-muted bg-surface-2 border-border">{t.type}</Chip></td>
                  <td className="px-4 py-3"><Chip className={t.priority === "URGENT" ? "text-danger bg-danger/10 border-danger/25" : t.priority === "HIGH" ? "text-copper bg-copper/10 border-copper/25" : "text-text-muted bg-surface-2 border-border"}>{t.priority}</Chip></td>
                  <td className="px-4 py-3"><span className={cn("text-[12px] font-bold", t.status === "DONE" ? "text-success" : t.status === "IN_PROGRESS" ? "text-brand" : "text-copper")}>{t.status}</span></td>
                  <td className="px-4 py-3 text-[12px] text-text-faint">{fmtDate(t.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      {t.status !== "DONE" ? (
                        <button disabled={busyId === t.id} onClick={() => setStatus(t.id, "DONE")} title="Mark done"
                          className="p-2 rounded-md hover:bg-surface border border-transparent hover:border-border text-text-faint hover:text-success"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                      ) : (
                        <button disabled={busyId === t.id} onClick={() => setStatus(t.id, "OPEN")} title="Reopen"
                          className="p-2 rounded-md hover:bg-surface border border-transparent hover:border-border text-text-faint hover:text-copper"><RotateCcw className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </td>
                </tr>
                {expanded === t.id && <TicketThreadRow ticket={t} onChanged={reload} />}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

/* ══ SYSTEM ══ */
function SystemTab({ system, reload }: { system: SystemHealth | null; reload: () => Promise<unknown> }) {
  const [refreshing, setRefreshing] = useState(false);
  if (!system) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", system.healthy === system.total ? "bg-success" : "bg-copper animate-pulse")} />
          <span className="text-[13px] font-bold">{system.healthy} / {system.total} services healthy</span>
        </div>
        <button onClick={async () => { setRefreshing(true); await reload(); setRefreshing(false); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border rounded-lg text-[12px] font-bold text-text-muted hover:text-text">
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} /> Refresh
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border font-bold text-[13px]">Services</div>
        <div className="divide-y divide-border">
          {system.services.map((s) => (
            <div key={s.name} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", svcDot[s.status])} />
                <span className="font-medium text-[13px]">{s.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-text-faint">{s.detail}</span>
                <span className={cn("text-[12px] font-bold w-20 text-right", svcText[s.status])}>{s.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3"><Server className="w-4 h-4 text-text-faint" /><span className="font-bold text-[13px]">Task Pipeline</span></div>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(system.tasks.byStatus).map(([k, v]) => (
              <div key={k} className="bg-surface-2/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-text-faint font-black">{k}</div>
                <div className="font-mono font-black text-lg">{v}</div>
              </div>
            ))}
          </div>
          {system.tasks.stuck > 0 && <div className="mt-3 text-[12px] text-copper font-bold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {system.tasks.stuck} task(s) stuck &gt; 1h</div>}
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="font-bold text-[13px] mb-3">Deliverability</div>
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between"><span className="text-text-muted">Sender accounts</span><span className="font-mono font-bold">{system.deliverability.senders}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Avg bounce rate</span><span className="font-mono font-bold">{system.deliverability.avgBounceRate}%</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Avg spam rate</span><span className="font-mono font-bold">{system.deliverability.avgSpamRate}%</span></div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border font-bold text-[13px]">Recent Send Errors</div>
        <div className="divide-y divide-border">
          {system.recentErrors.length === 0 && <div className="px-5 py-8 text-center text-text-faint text-sm">No recent errors.</div>}
          {system.recentErrors.map((e, i) => (
            <div key={i} className="px-5 py-3.5 flex items-start gap-4">
              <span className="font-mono text-[11px] text-text-faint w-14 flex-shrink-0 pt-0.5">{fmtDate(e.time)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold text-danger mb-0.5">{e.svc} → {e.to}</div>
                <div className="text-[12px] text-text-muted font-mono truncate">{e.msg}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══ REVENUE ══ */
function RevenueTab({ revenue }: { revenue: RevenueSummary | null }) {
  if (!revenue) return <Spinner />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign} label="MRR" value={`$${revenue.mrr}`} sub={`${revenue.activeUsers} paying`} color="text-success" />
        <KpiCard icon={BarChart2} label="ARR (proj.)" value={`$${revenue.arr}`} sub="on current MRR" color="text-brand" />
        <KpiCard icon={Users} label="ARPU" value={`$${revenue.arpu}`} sub="per active user" color="text-copper" />
        <KpiCard icon={Activity} label="Trial / Churned" value={`${revenue.trialUsers} / ${revenue.churned}`} sub="active trials / lapsed" color="text-info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border font-bold text-[13px]">Revenue by Plan</div>
          <div className="p-5 space-y-5">
            {revenue.byPlan.length === 0 && <div className="text-text-faint text-sm">No active subscriptions yet.</div>}
            {revenue.byPlan.map((p) => {
              const pct = revenue.mrr > 0 ? (p.revenue / revenue.mrr) * 100 : 0;
              const color = p.plan === "pro" ? "#14b8a6" : p.plan === "starter" ? "#d97706" : "#6b645e";
              return (
                <div key={p.plan}>
                  <div className="flex justify-between items-end mb-1.5">
                    <span className="font-mono text-[11px] font-black uppercase" style={{ color }}>{p.plan} · {p.users} users</span>
                    <span className="font-mono font-black text-[14px]">${p.revenue}</span>
                  </div>
                  <div className="h-2 bg-surface-2 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border font-bold text-[13px]">Recent Transactions</div>
          <div className="divide-y divide-border">
            {revenue.transactions.length === 0 && <div className="px-5 py-8 text-center text-text-faint text-sm">No transactions yet.</div>}
            {revenue.transactions.map((t, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div><div className="font-medium text-[13px]">{t.user}</div><div className="text-[11px] text-text-faint">{fmtDate(t.date)} · {t.provider}</div></div>
                <div className="flex items-center gap-3">
                  <Chip className={planChip(t.plan)}>{t.plan}</Chip>
                  <span className="font-mono font-black text-[13px] w-12 text-right">${t.amount}</span>
                  <span className={cn("text-[11px] font-bold w-16 text-right", t.status === "active" ? "text-success" : "text-text-faint")}>{t.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
