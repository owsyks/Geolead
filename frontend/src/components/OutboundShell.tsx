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
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-950/90 sticky top-0 h-screen overflow-y-auto">
          <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-200 dark:border-slate-900">
            <img src="/logo.png" alt="GeoLead AI" className="h-9 w-9 rounded-lg object-cover" />
            <div>
              <div className="text-sm font-black tracking-wide">GeoLead AI</div>
              <div className="text-[11px] text-slate-500">Find. Connect. Close.</div>
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
                    className={`h-10 px-3 rounded-lg flex items-center gap-3 text-sm transition-colors ${
                      active
                        ? "bg-teal-500/15 text-teal-900 dark:text-teal-100 border border-teal-400/20"
                        : "text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-900/70"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-200 dark:border-slate-900 space-y-3">
            <button
              onClick={toggle}
              className="flex w-full items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/60 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                <ShieldCheck className="h-4 w-4" />
                Compliance Guardrails
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                Opt-outs, sender limits, suppression checks, and truthful cold-email copy are enforced by default.
              </p>
            </div>
            {user ? (
              <div className="rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 p-3">
                <Link href="/profile" className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white">
                  <UserCircle className="h-5 w-5 text-slate-400" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{user.name}</span>
                    <span className="block truncate text-[11px] text-slate-500">{user.email}</span>
                  </span>
                </Link>
                <button
                  onClick={() => void logout()}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 dark:border-slate-800 bg-slate-200 dark:bg-slate-950/60 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 transition hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-700"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-950/90 backdrop-blur">
            <div className="px-4 sm:px-6 lg:px-8 h-auto min-h-16 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Mail className="h-3.5 w-3.5" />
                  AI outbound email automation
                </div>
                <h1 className="mt-1 text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-50">{title}</h1>
                <p className="mt-1 text-sm text-slate-400 max-w-3xl">{subtitle}</p>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto lg:overflow-visible">
                {actions}
                <Link
                  href="/watchlist?tab=notifications"
                  title="Watchlist alerts"
                  className="relative h-9 w-9 shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/60 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Link>
                <button
                  onClick={toggle}
                  title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  className="h-9 w-9 shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/60 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
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
                    className={`h-9 shrink-0 px-3 rounded-lg flex items-center gap-2 text-xs border ${
                      active
                        ? "bg-teal-500/15 text-teal-900 dark:text-teal-100 border-teal-400/20"
                        : "bg-slate-100 dark:bg-slate-900/60 text-slate-400 border-slate-300 dark:border-slate-800"
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
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/45 p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-50">{value}</div>
      {helper ? <div className="mt-1 text-xs text-slate-500">{helper}</div> : null}
    </div>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone =
    normalized.includes("active") || normalized.includes("verified") || normalized.includes("sent")
      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : normalized.includes("pause") || normalized.includes("draft") || normalized.includes("pending")
        ? "border-amber-400/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : normalized.includes("bounce") || normalized.includes("complaint") || normalized.includes("failed")
          ? "border-red-400/25 bg-red-500/10 text-red-700 dark:text-red-300"
          : "border-slate-400 dark:border-slate-700 bg-slate-200 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300";

  return (
    <span className={`inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-bold ${tone}`}>
      {value}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/35 p-8 text-center">
      <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{title}</div>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
    </div>
  );
}
