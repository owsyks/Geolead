import React from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export function GlassCard({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "glass rounded-[8px] border border-border shadow-[0_1px_0_rgba(255,255,255,.03)_inset,0_8px_32px_rgba(0,0,0,.37)] p-4 transition-all duration-200 hover:-translate-y-[2px] hover:border-brand hover:shadow-[0_0_0_1px_var(--brand),0_8px_24px_rgba(20,184,166,.18)]",
        className
      )}
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
  if (lower.includes("delivered") || lower.includes("open") || lower.includes("strong") || lower.includes("success")) {
    bg = "bg-success/10";
    fg = "text-success";
    border = "border-success/20";
  } else if (lower.includes("click") || lower.includes("info")) {
    bg = "bg-info/10";
    fg = "text-info";
    border = "border-info/20";
  } else if (lower.includes("sent") || lower.includes("buy")) {
    bg = "bg-brand/10";
    fg = "text-brand";
    border = "border-brand/20";
  } else if (lower.includes("bounce") || lower.includes("fail") || lower.includes("avoid")) {
    bg = "bg-danger/10";
    fg = "text-danger";
    border = "border-danger/20";
  } else if (lower.includes("unsub") || lower.includes("pause") || lower.includes("warn") || lower.includes("watchlist")) {
    bg = "bg-copper/10";
    fg = "text-copper";
    border = "border-copper/20";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border",
        bg,
        fg,
        border
      )}
    >
      {status.toUpperCase()}
    </span>
  );
}

export function MetricCard({
  title,
  value,
  trend,
  trendUp
}: {
  title: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
}) {
  return (
    <GlassCard className="flex flex-col gap-2 p-5">
      <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-bold">
        {title}
      </div>
      <div className="text-[28px] font-[800] font-mono tabular-nums leading-none">
        {value}
      </div>
      {trend && (
        <div
          className={cn(
            "text-[12px] font-medium flex items-center gap-1",
            trendUp ? "text-success" : "text-danger"
          )}
        >
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
        <circle
          stroke="var(--surface-2)"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke={color}
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + " " + circumference}
          style={{ strokeDashoffset }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <span
        className={cn(
          "absolute font-mono font-bold tabular-nums",
          isLg ? "text-[16px]" : isSm ? "text-[10px]" : "text-[12px]"
        )}
        style={{ color }}
      >
        {score}
      </span>
    </div>
  );
}
