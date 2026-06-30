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
  Menu,
  Moon,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Star,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "./ThemeProvider";
import { cn } from "./ui";

const navItems = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
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

// Key nav items for mobile bottom bar
const bottomNavItems = [
  { href: "/overview", label: "Home", icon: LayoutDashboard },
  { href: "/dashboard", label: "Leads", icon: Search },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/inbox", label: "Inbox", icon: Inbox },
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
  eyebrow = "✉ AI outbound email automation",
  fullBleed = false,
  contentClassName,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  eyebrow?: string;
  fullBleed?: boolean;
  contentClassName?: string;
}) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const unreadCount = useUnreadCount();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  return (
    <div className="flex min-h-screen bg-bg text-text">
      {/* ── Mobile Sidebar Overlay (full-screen) ── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-bg">
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-brand text-bg flex items-center justify-center font-black text-lg shadow-[inset_0_2px_4px_rgba(255,255,255,0.4)]">GL</div>
              <div>
                <div className="font-black text-text">GeoLead AI</div>
                <div className="text-[11px] text-text-muted uppercase tracking-wider">Find. Connect. Close.</div>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-surface-2 rounded-lg text-text-muted">
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
            {navItems.map((item: any) => {
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 h-12 rounded-lg text-sm font-medium transition-colors relative ${
                    isActive ? "bg-brand-soft text-brand border border-brand/20" : "text-text-muted hover:bg-surface-2 hover:text-text"
                  }`}>
                  {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-brand rounded-r-full" />}
                  <item.icon className="w-4 h-4" />
                  {item.label}
                  {item.dot && <div className="w-1.5 h-1.5 rounded-full bg-brand ml-auto shadow-[0_0_8px_var(--brand)] animate-pulse" />}
                </Link>
              );
            })}
          </nav>
          {/* Footer */}
          <div className="p-4 border-t border-border flex items-center justify-between">
            <button onClick={toggle} className="p-2 hover:bg-surface-2 rounded-lg text-text-muted hover:text-text transition-colors">
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span>Opt-outs & limits enforced</span>
              <ShieldCheck className="w-4 h-4 text-success" />
            </div>
          </div>
        </div>
      )}

      {/* ── Desktop Sidebar (288px fixed) ── */}
      <aside className="hidden lg:flex w-[288px] shrink-0 h-screen glass border-r border-border flex-col fixed left-0 top-0 z-40">
        <div className="p-6 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand text-bg flex items-center justify-center font-black text-lg shadow-[inset_0_2px_4px_rgba(255,255,255,0.4)]">GL</div>
          <div>
            <div className="font-black text-text leading-tight">GeoLead AI</div>
            <div className="text-[11px] text-text-muted leading-tight uppercase tracking-wider">Find. Connect. Close.</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {navItems.map((item: any) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors relative ${
                  isActive ? "bg-brand-soft text-brand border border-brand/20" : "text-text-muted hover:bg-surface-2 hover:text-text"
                }`}>
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-brand rounded-r-full" />}
                <item.icon className="w-4 h-4" />
                {item.label}
                {item.dot && <div className="w-1.5 h-1.5 rounded-full bg-brand ml-auto shadow-[0_0_8px_var(--brand)] animate-pulse" />}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border">
          <div className="bg-success/10 border border-success/20 rounded-lg p-3 flex gap-2 items-start text-success">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="text-[12px] leading-relaxed font-medium">Opt-outs, limits, & suppression enforced by default.</div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button onClick={toggle} className="text-xs text-text-muted hover:text-text transition-colors flex items-center gap-1.5">
              {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {theme === "dark" ? "Light" : "Dark"}
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className={cn("flex-1 ml-0 lg:ml-[288px] flex flex-col pb-16 lg:pb-0", fullBleed ? "h-screen overflow-hidden" : "min-h-screen")}>
        {/* Header */}
        <header className="h-[52px] lg:h-[72px] shrink-0 sticky top-0 z-10 glass border-b border-border flex items-center justify-between px-3 lg:px-8">
          <div className="flex items-center gap-2 lg:gap-3 min-w-0 flex-1">
            <button onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 -ml-1 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text transition-colors shrink-0">
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="hidden lg:block text-[11px] uppercase tracking-wider text-text-muted font-bold mb-1">{eyebrow}</div>
              <h1 className="text-sm lg:text-[22px] font-black tracking-[-0.02em] text-text truncate">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-1 lg:gap-4 shrink-0">
            {actions && <div className="hidden sm:flex items-center gap-2">{actions}</div>}
            <Link href="/watchlist?tab=notifications" className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-2 text-text-muted">
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full border border-bg" />}
            </Link>
            <button onClick={toggle} className="hidden lg:flex w-8 h-8 items-center justify-center rounded-full hover:bg-surface-2 text-text-muted">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Subtitle bar (mobile) */}
        {subtitle && <div className="lg:hidden px-3 py-1.5 text-[11px] text-text-muted border-b border-border bg-surface-2/30">{subtitle}</div>}

        {/* Content */}
        {fullBleed ? (
          <div className={cn("flex-1 min-h-0 overflow-hidden", contentClassName)}>{children}</div>
        ) : (
          <div className={cn("px-3 lg:px-8 py-3 lg:py-6", contentClassName)}>{children}</div>
        )}

        {/* ── Mobile Bottom Nav Bar ── */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-20 glass border-t border-border flex items-center justify-around h-14 px-1 safe-bottom">
          {bottomNavItems.map((item: any) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 h-full px-2 min-w-0 flex-1 transition-colors ${
                  isActive ? "text-brand" : "text-text-muted hover:text-text"
                }`}>
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}

// ─── Simplified MetricCard for backward compat ────────────────────────────────
export function MetricCard({ label, value, helper }: { label: string; value: string | number; helper?: string }) {
  return (
    <div className="glass rounded-[8px] border border-border shadow-[0_1px_0_rgba(255,255,255,.03)_inset,0_8px_32px_rgba(0,0,0,.37)] p-3 lg:p-5 flex flex-col gap-1 lg:gap-2 transition-all duration-200 hover:-translate-y-[2px] hover:border-brand">
      <div className="text-[10px] lg:text-[11px] uppercase tracking-[0.12em] text-text-muted font-bold">{label}</div>
      <div className="text-lg lg:text-[28px] font-[800] font-mono tabular-nums leading-none">{value}</div>
      {helper ? <div className="text-[10px] lg:text-xs text-text-muted">{helper}</div> : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="glass rounded-[8px] border border-border p-6 lg:p-8 text-center">
      <div className="text-sm font-bold text-text">{title}</div>
      <p className="mt-1 text-xs lg:text-sm text-text-muted">{body}</p>
    </div>
  );
}
