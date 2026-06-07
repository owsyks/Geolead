"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Globe2, Search } from "lucide-react";
import { useDomainContext } from "@/lib/domainContext";

interface DomainSelectorProps {
  label?: string;
  variant?: "inline" | "card";
  required?: boolean;
  emptyAction?: { label: string; href: string };
  onChange?: (domainId: string | null) => void;
}

export function DomainSelector({
  label = "Active domain",
  variant = "card",
  required = false,
  emptyAction,
  onChange,
}: DomainSelectorProps) {
  const { domains, activeDomain, activeDomainId, setActiveDomainId, loading } = useDomainContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const available = domains.filter((domain) => !domain.archivedAt);
    if (!term) return available;
    return available.filter((domain) =>
      [domain.name, domain.niche, domain.industry, domain.city, domain.state]
        .map((value) => (value || "").toLowerCase())
        .some((value) => value.includes(term))
    );
  }, [domains, query]);

  const handleSelect = (id: string | null) => {
    setActiveDomainId(id);
    onChange?.(id);
    setOpen(false);
    setQuery("");
  };

  const containerClasses =
    variant === "card"
      ? "rounded-lg border border-teal-400/20 bg-teal-500/5 p-4"
      : "";

  return (
    <div className={containerClasses}>
      {variant === "card" ? (
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-teal-300">
          <Globe2 className="h-3.5 w-3.5" />
          {label}
          {required ? <span className="text-red-300">*</span> : null}
        </div>
      ) : null}

      <div className="relative mt-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="w-full h-11 rounded-lg border border-slate-800 bg-slate-950/70 px-3 text-left text-sm text-slate-100 flex items-center justify-between gap-3 hover:border-teal-400/40 transition-colors"
        >
          <span className="truncate">
            {loading ? (
              <span className="text-slate-500">Loading portfolio…</span>
            ) : activeDomain ? (
              <span className="flex items-center gap-2">
                <span className="font-bold">{activeDomain.name}</span>
                {activeDomain.niche ? (
                  <span className="text-xs text-slate-400">· {activeDomain.niche}</span>
                ) : null}
              </span>
            ) : (
              <span className="text-slate-500">Select a domain from your portfolio…</span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        </button>

        {open ? (
          <div className="absolute z-30 mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 shadow-xl max-h-80 overflow-y-auto">
            <div className="p-2 border-b border-slate-900">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search portfolio…"
                  className="h-9 w-full rounded-md border border-slate-800 bg-slate-900/70 pl-8 pr-3 text-sm text-slate-100 outline-none focus:border-teal-400"
                />
              </div>
            </div>

            <div className="p-1">
              {!required ? (
                <button
                  type="button"
                  onClick={() => handleSelect(null)}
                  className={`w-full text-left px-3 py-2 rounded-md text-xs ${
                    !activeDomainId ? "bg-teal-500/15 text-teal-900 dark:text-teal-100" : "text-slate-400 hover:bg-slate-900"
                  }`}
                >
                  No active domain (use manual fields)
                </button>
              ) : null}

              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-slate-500">
                  No domains match. {emptyAction ? (
                    <a href={emptyAction.href} className="text-teal-300 underline">
                      {emptyAction.label}
                    </a>
                  ) : null}
                </div>
              ) : (
                filtered.map((domain) => (
                  <button
                    key={domain.id}
                    type="button"
                    onClick={() => handleSelect(domain.id)}
                    className={`w-full text-left px-3 py-2 rounded-md flex items-center justify-between gap-3 ${
                      activeDomainId === domain.id
                        ? "bg-teal-500/15 text-teal-900 dark:text-teal-100"
                        : "text-slate-300 hover:bg-slate-900"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-bold truncate">{domain.name}</span>
                      <span className="block text-[11px] text-slate-500 truncate">
                        {[domain.niche, [domain.city, domain.state].filter(Boolean).join(", ")]
                          .filter(Boolean)
                          .join(" · ") || "Uncategorized"}
                      </span>
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500 shrink-0">
                      {domain.status}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>

      {activeDomain ? (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-400">
          <Pill label="Niche" value={activeDomain.niche || "—"} />
          <Pill label="Geo" value={[activeDomain.city, activeDomain.state].filter(Boolean).join(", ") || "—"} />
          <Pill label="Branding" value={`${activeDomain.brandingScore}/100`} />
          <Pill label="Demand" value={`${activeDomain.buyerDemandScore}/100`} />
        </div>
      ) : null}
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-xs text-slate-200 truncate">{value}</div>
    </div>
  );
}
