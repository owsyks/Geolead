import {
  BarChart,
  Box,
  Compass,
  FileText,
  Home,
  Inbox,
  LayoutGrid,
  Mail,
  PieChart,
  Search,
  Settings,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { Link, useLocation } from "react-router";
import { cn } from "./ui";

const navItems = [
  { label: "Overview", icon: Home, path: "/" },
  { label: "Portfolio", icon: Box, path: "/portfolio" },
  { label: "Sales Kanban", icon: LayoutGrid, path: "/portfolio/kanban" },
  { label: "Acquisition", icon: Compass, path: "/acquisition" },
  { label: "Watchlist", icon: PieChart, path: "/watchlist" },
  { label: "Lead Explorer", icon: Search, path: "/dashboard" },
  { label: "Campaigns", icon: Zap, path: "/campaigns" },
  { label: "Quick Send", icon: Mail, path: "/quick-send" },
  { label: "Inbox", icon: Inbox, path: "/inbox", dot: true },
  { label: "Analytics", icon: BarChart, path: "/analytics" },
  { label: "Templates", icon: FileText, path: "/templates" },
  { label: "Settings", icon: Settings, path: "/settings" },
];

export function Sidebar() {
  const location = useLocation();

  return (
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
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors relative",
                isActive
                  ? "bg-brand-soft text-brand border border-brand/20"
                  : "text-text-muted hover:bg-surface-2 hover:text-text"
              )}
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
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="text-[12px] leading-relaxed font-medium">
            Opt-outs, limits, & suppression enforced by default.
          </div>
        </div>
      </div>
    </aside>
  );
}

export function Header({ title, subtitle, eyebrow }: { title: string; subtitle?: string; eyebrow?: string }) {
  return (
    <header className="h-[72px] sticky top-0 z-10 glass border-b border-border flex items-center justify-between px-8">
      <div>
        {eyebrow && <div className="text-[11px] uppercase tracking-wider text-text-muted font-bold mb-1">{eyebrow}</div>}
        <div className="flex items-baseline gap-3">
          <h1 className="text-[22px] font-black tracking-[-0.02em] text-text">{title}</h1>
          {subtitle && <span className="text-sm text-text-muted">{subtitle}</span>}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm text-text-muted cursor-pointer hover:border-brand/50 transition-colors">
          <Search className="w-4 h-4" />
          <span>Search or ask AI...</span>
          <kbd className="ml-4 font-mono text-[10px] bg-bg px-1.5 py-0.5 rounded border border-border text-text-faint">⌘K</kbd>
        </div>
        <button className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-2 text-text-muted hover:text-text transition-colors">
          <Inbox className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full border border-bg"></span>
        </button>
      </div>
    </header>
  );
}
