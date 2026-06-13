"use client";

import React from "react";
import { X } from "lucide-react";

export function cn(...inputs: (string | undefined | null | false)[]) {
  return inputs.filter(Boolean).join(' ');
}

export function GlassCard({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`glass rounded-[8px] border border-border shadow-[0_1px_0_rgba(255,255,255,.03)_inset,0_8px_32px_rgba(0,0,0,.37)] p-4 transition-all duration-200 hover:-translate-y-[2px] hover:border-brand hover:shadow-[0_0_0_1px_var(--brand),0_8px_24px_rgba(20,184,166,.18)] ${className || ''}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  let bg = "bg-surface-2";
  let fg = "text-text-muted";
  let border = "border-border";

  const lower = status.toLowerCase();
  if (lower.includes("delivered") || lower.includes("open") || lower.includes("strong") || lower.includes("success") || lower.includes("active") || lower.includes("verified") || lower.includes("sold") || lower.includes("interested") && !lower.includes("not")) {
    bg = "bg-success/10"; fg = "text-success"; border = "border-success/20";
  } else if (lower.includes("click") || lower.includes("info") || lower.includes("negotiat")) {
    bg = "bg-info/10"; fg = "text-info"; border = "border-info/20";
  } else if (lower.includes("sent") || lower.includes("buy") || lower.includes("processing") || lower.includes("draft")) {
    bg = "bg-brand/10"; fg = "text-brand"; border = "border-brand/20";
  } else if (lower.includes("bounce") || lower.includes("fail") || lower.includes("avoid") || lower.includes("not interested") || lower.includes("spam") || lower.includes("danger")) {
    bg = "bg-danger/10"; fg = "text-danger"; border = "border-danger/20";
  } else if (lower.includes("unsub") || lower.includes("pause") || lower.includes("warn") || lower.includes("watchlist") || lower.includes("pending") || lower.includes("speculative")) {
    bg = "bg-copper/10"; fg = "text-copper"; border = "border-copper/20";
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${bg} ${fg} ${border}`}>
      {status.toUpperCase()}
    </span>
  );
}

export function MetricCard({ title, value, trend, trendUp }: { title: string; value: string | number; trend?: string; trendUp?: boolean }) {
  return (
    <GlassCard className="flex flex-col gap-2 p-5">
      <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-bold">{title}</div>
      <div className="text-[28px] font-[800] font-mono tabular-nums leading-none">{value}</div>
      {trend && (
        <div className={`text-[12px] font-medium flex items-center gap-1 ${trendUp ? "text-success" : "text-danger"}`}>
          {trendUp ? "▲" : "▼"} {trend}
        </div>
      )}
    </GlassCard>
  );
}

export function ScoreRing({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const isLg = size === "lg";
  const isSm = size === "sm";
  const radius = isLg ? 24 : isSm ? 12 : 18;
  const stroke = isLg ? 4 : isSm ? 2 : 3;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  let color = "var(--text-faint)";
  if (score >= 85) color = "var(--copper)";
  else if (score >= 70) color = "var(--brand)";
  else if (score >= 50) color = "var(--text-muted)";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: radius * 2, height: radius * 2 }}>
      <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
        <circle stroke="var(--surface-2)" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx={radius} cy={radius} />
        <circle stroke={color} fill="transparent" strokeWidth={stroke}
          strokeDasharray={circumference + " " + circumference}
          style={{ strokeDashoffset }}
          strokeLinecap="round" r={normalizedRadius} cx={radius} cy={radius}
          className="transition-all duration-1000 ease-out" />
      </svg>
      <span className={`absolute font-mono font-bold tabular-nums ${isLg ? "text-[16px]" : isSm ? "text-[10px]" : "text-[12px]"}`} style={{ color }}>{score}</span>
    </div>
  );
}

// ─── Sparkline (inline SVG, no deps) ──────────────────────────────────────────
export function Sparkline({
  data,
  className,
  stroke = "var(--brand)",
  height = 40,
  fill = false,
}: {
  data: number[];
  className?: string;
  stroke?: string;
  height?: number;
  fill?: boolean;
}) {
  if (!data || data.length === 0) return <div className={className} style={{ height }} />;
  const w = 100;
  const h = height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const denom = data.length - 1 || 1;
  const coords = data.map((v, i) => {
    const x = (i / denom) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y] as const;
  });
  const line = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <div className={className} style={{ height }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height={h}>
        {fill && <polygon points={area} fill={stroke} opacity={0.12} />}
        <polyline
          points={line}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ─── Filter pill controls ─────────────────────────────────────────────────────
const CHEVRON_BG =
  "bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M7%2010L12%2015L17%2010%22%20stroke%3D%22%23a8a29e%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20fill%3D%22none%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_10px_center]";

export function PillSelect({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "bg-surface border border-border rounded-full px-4 py-1.5 text-sm appearance-none pr-8 text-text focus:border-brand focus:outline-none",
        CHEVRON_BG,
        className
      )}
    >
      {children}
    </select>
  );
}

export function PillButton({
  active,
  className,
  children,
  ...props
}: { active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "px-3 py-1.5 text-[12px] font-bold rounded-full whitespace-nowrap transition-colors border",
        active
          ? "bg-brand-soft text-brand border-brand/20"
          : "bg-surface text-text-muted border-border hover:bg-surface-2 hover:text-text",
        className
      )}
    >
      {children}
    </button>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────
export function KanbanColumn({
  title,
  count,
  width = 320,
  className,
  children,
  ...props
}: { title: string; count?: number; width?: number } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("shrink-0 flex flex-col gap-4", className)} style={{ width }} {...props}>
      <div className="flex justify-between items-center px-1">
        <div className="text-[12px] font-bold text-text-muted uppercase tracking-wider">{title}</div>
        {count != null && (
          <div className="bg-surface-2 px-2 py-0.5 rounded text-[11px] font-mono text-text-muted">{count}</div>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative w-full glass rounded-2xl border border-border shadow-[0_24px_64px_rgba(0,0,0,.5)] max-h-[90vh] overflow-y-auto",
          maxWidth
        )}
      >
        {title && (
          <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 glass z-10">
            <h2 className="font-black text-lg text-text">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-2 text-text-muted hover:text-text transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
