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
  Mail,
  Moon,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Star,
  Sun,
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
  { href: "/inbox", label: "Inbox", icon: Inbox, dot: true },
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
  const { theme, toggle } = useTheme();
  const unreadCount = useUnreadCount();

  return (
    <div className="flex min-h-screen bg-bg text-text">
      {/* Sidebar — EXACT Figma layout */}
      <aside className="w-[288px] flex-shrink-0 h-screen glass border-r border-border flex flex-col fixed left-0 top-0 z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand text-bg flex items-center justify-center font-black text-lg shadow-[inset_0_2px_4px_rgba(255,255,255,0.4)]">
            GL
          </div>
          <div>
            <div className="font-black text-text leading-tight">GeoLead AI</div>
            <div className="text-[11px] text-text-muted leading-tight uppercase tracking-wider">
              Find. Connect. Close.
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {navItems.map((item: any) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors relative ${
                  isActive
                    ? "bg-brand-soft text-brand border border-brand/20"
                    : "text-text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-brand rounded-r-full" />
                )}
                <item.icon className="w-4 h-4" />
                {item.label}
                {item.dot && (
                  <div className="w-1.5 h-1.5 rounded-full bg-brand ml-auto shadow-[0_0_8px_var(--brand)] animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="bg-success/10 border border-success/20 rounded-lg p-3 flex gap-2 items-start text-success">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="text-[12px] leading-relaxed font-medium">
              Opt-outs, limits, & suppression enforced by default.
            </div>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 ml-[288px] flex flex-col min-h-screen">
        {/* Header — EXACT Figma layout */}
        <header className="h-[72px] sticky top-0 z-10 glass border-b border-border flex items-center justify-between px-8">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-text-muted font-bold mb-1">✉ AI outbound email automation</div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-[22px] font-black tracking-[-0.02em] text-text">{title}</h1>
              {subtitle && <span className="text-sm text-text-muted">{subtitle}</span>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {actions}
            <Link
              href="/watchlist?tab=notifications"
              className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-2 text-text-muted hover:text-text transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full border border-bg" />
              )}
            </Link>
            <button
              onClick={toggle}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-2 text-text-muted hover:text-text transition-colors"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Mobile nav bar */}
        <div className="lg:hidden px-4 pb-3 flex gap-2 overflow-x-auto pt-2">
          {navItems.map((item: any) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`h-9 shrink-0 px-3 rounded-lg flex items-center gap-2 text-xs border ${
                  isActive ? "bg-brand-soft text-brand border-brand/20" : "bg-surface-2 text-text-muted border-border"
                }`}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="px-4 sm:px-6 lg:px-8 py-6">{children}</div>
      </main>
    </div>
  );
}

// ─── Simplified MetricCard for backward compat ────────────────────────────────
export function MetricCard({ label, value, helper }: { label: string; value: string | number; helper?: string }) {
  return (
    <div className="glass rounded-[8px] border border-border shadow-[0_1px_0_rgba(255,255,255,.03)_inset,0_8px_32px_rgba(0,0,0,.37)] p-5 flex flex-col gap-2 transition-all duration-200 hover:-translate-y-[2px] hover:border-brand">
      <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-bold">{label}</div>
      <div className="text-[28px] font-[800] font-mono tabular-nums leading-none">{value}</div>
      {helper ? <div className="text-xs text-text-muted">{helper}</div> : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="glass rounded-[8px] border border-border p-8 text-center">
      <div className="text-sm font-bold text-text">{title}</div>
      <p className="mt-1 text-sm text-text-muted">{body}</p>
    </div>
  );
}
