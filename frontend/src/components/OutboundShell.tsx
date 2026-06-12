"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  BarChart3,
  Bell,
  Bot,
  Globe2,
  Inbox,
  Kanban,
  Layers3,
  LayoutDashboard,
  LogOut,
  Mail,
  Moon,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Star,
  Sun,
  UserCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "./ThemeProvider";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/portfolio", label: "Portfolio", icon: Globe2 },
  { href: "/portfolio/kanban", label: "Sales Kanban", icon: Kanban },
  { href: "/acquisition", label: "Acquisition Advisor", icon: ShoppingCart },
  { href: "/watchlist", label: "Watchlist", icon: Star },
  { href: "/dashboard", label: "Lead Explorer", icon: Search },
  { href: "/campaigns", label: "Campaigns", icon: LayoutDashboard },
  { href: "/quick-send", label: "Quick Send", icon: Mail },
  { href: "/ai-email-generator", label: "AI Generator", icon: Bot },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/sender-accounts", label: "Senders", icon: Send },
  { href: "/templates", label: "Templates", icon: Layers3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function useUnreadCount() {
  const [count, setCount] = useState(0);
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const fetch_ = () => {
      fetch("/api/watchlist/notifications/unread-count", { headers: { Authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.count != null) setCount(d.count); })
        .catch(() => {});
    };
    fetch_();
    const id = setInterval(fetch_, 60000);
    return () => clearInterval(id);
  }, [user]);
  return count;
}

export function OutboundShell({
  children,
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const unreadCount = useUnreadCount();

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="flex min-h-screen">
        <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-border bg-surface/90 sticky top-0 h-screen overflow-y-auto glass">
          <div className="h-16 px-5 flex items-center gap-3 border-b border-border">
            <img src="/logo.png" alt="GeoLead AI" className="h-9 w-9 rounded-lg object-cover" />
            <div>
              <div className="text-sm font-black tracking-wide text-text">GeoLead AI</div>
              <div className="text-[11px] text-text-muted">Find. Connect. Close.</div>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                    className={`h-10 px-3 rounded-lg flex items-center gap-3 text-sm transition-all duration-200 ${
                      active
                        ? "bg-brand-soft text-brand border border-brand/20"
                        : "text-text-muted hover:text-text hover:bg-surface-2"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-border space-y-3">
            <button
              onClick={toggle}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-muted hover:text-text transition"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            <div className="rounded-lg border border-success/20 bg-success/10 p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-success">
                <ShieldCheck className="h-4 w-4" />
                Compliance Guardrails
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
                Opt-outs, sender limits, suppression checks, and truthful cold-email copy are enforced by default.
              </p>
            </div>
            {user ? (
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <Link href="/profile" className="flex items-center gap-2 text-sm text-text hover:text-brand">
                  <UserCircle className="h-5 w-5 text-text-muted" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{user.name}</span>
                    <span className="block truncate text-[11px] text-text-muted">{user.email}</span>
                  </span>
                </Link>
                <button
                  onClick={() => void logout()}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs text-text-muted transition hover:text-text hover:border-border-strong"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur glass">
            <div className="px-4 sm:px-6 lg:px-8 h-auto min-h-16 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <Mail className="h-3.5 w-3.5" />
                  AI outbound email automation
                </div>
                <h1 className="mt-1 text-xl sm:text-2xl font-black text-text">{title}</h1>
                <p className="mt-1 text-sm text-text-muted max-w-3xl">{subtitle}</p>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto lg:overflow-visible">
                {actions}
                <Link
                  href="/watchlist?tab=notifications"
                  title="Watchlist alerts"
                  className="relative h-9 w-9 shrink-0 rounded-lg border border-border bg-surface-2 flex items-center justify-center text-text-muted hover:text-text transition"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-danger text-white text-[10px] font-black flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Link>
                <button
                  onClick={toggle}
                  title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  className="h-9 w-9 shrink-0 rounded-lg border border-border bg-surface-2 flex items-center justify-center text-text-muted hover:text-text transition"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="lg:hidden px-4 pb-3 flex gap-2 overflow-x-auto">
              {navItems.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`h-9 shrink-0 px-3 rounded-lg flex items-center gap-2 text-xs border transition-all duration-200 ${
                      active
                        ? "bg-brand-soft text-brand border-brand/20"
                        : "bg-surface-2 text-text-muted border-border"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </header>

          <main className="px-4 sm:px-6 lg:px-8 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper?: string;
}) {
  return (
    <div className="glass-card rounded-lg p-4">
      <div className="metric-card-label">{label}</div>
      <div className="metric-card-value text-text">{value}</div>
      {helper ? <div className="text-xs text-text-muted mt-1">{helper}</div> : null}
    </div>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone =
    normalized.includes("active") || normalized.includes("verified") || normalized.includes("sent")
      ? "status-badge-success"
      : normalized.includes("pause") || normalized.includes("draft") || normalized.includes("pending")
        ? "status-badge-copper"
        : normalized.includes("bounce") || normalized.includes("complaint") || normalized.includes("failed")
          ? "status-badge-danger"
          : "status-badge-muted";

  return (
    <span className={`status-badge ${tone}`}>
      {value}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="glass-card rounded-lg p-8 text-center">
      <div className="text-sm font-bold text-text">{title}</div>
      <p className="mt-1 text-sm text-text-muted">{body}</p>
    </div>
  );
}
