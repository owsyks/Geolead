"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, RefreshCcw } from "lucide-react";
import { OutboundShell } from "@/components/OutboundShell";
import { GlassCard, KanbanColumn, StatusBadge } from "@/components/ui";
import { useDomainContext } from "@/lib/domainContext";
import {
  DOMAIN_STATUSES,
  fetchOutbound,
  type PortfolioDomain,
  type PortfolioStatus,
} from "@/lib/outbound";

type KanbanColumns = Record<PortfolioStatus, PortfolioDomain[]>;

const emptyColumns: KanbanColumns = {
  Available: [],
  Prospecting: [],
  "Contacting Buyers": [],
  Negotiating: [],
  Sold: [],
  Archived: [],
};

export default function PortfolioKanbanPage() {
  const { refresh, setActiveDomainId } = useDomainContext();
  const [columns, setColumns] = useState<KanbanColumns>(emptyColumns);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [mobileStatus, setMobileStatus] = useState<PortfolioStatus>("Available");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOutbound<KanbanColumns>("/api/domains/kanban");
      setColumns({ ...emptyColumns, ...data });
    } catch {
      setMessage("Could not load Kanban.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const moveTo = async (id: string, status: PortfolioStatus) => {
    try {
      await fetchOutbound(`/api/domains/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
      await refresh();
    } catch {
      setMessage("Move failed.");
    }
  };

  const onDrop = (status: PortfolioStatus) => {
    if (!dragId) return;
    setDragId(null);
    void moveTo(dragId, status);
  };

  return (
    <OutboundShell
      title="Sales Kanban"
      eyebrow="Pipeline"
      subtitle="Drag domains across the pipeline. Status changes propagate everywhere — campaigns, dashboards, and recommendations stay in sync."
      fullBleed
      actions={
        <button
          onClick={() => void load()}
          className="h-9 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text hover:bg-surface-2 inline-flex items-center gap-2 transition-colors"
        >
          <RefreshCcw className="h-4 w-4" /> Refresh
        </button>
      }
    >
      <div className="flex flex-col h-full">
        {message ? (
          <div className="shrink-0 mx-3 sm:mx-6 mt-3 rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm text-text-muted">
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="p-6 text-sm text-text-muted">Loading…</div>
        ) : (
          <>
          <div className="md:hidden flex-1 min-h-0 overflow-y-auto bg-bg p-3 pb-20">
            <div className="sticky top-0 z-10 pb-3 bg-bg">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted">Pipeline stage</label>
              <select value={mobileStatus} onChange={(event) => setMobileStatus(event.target.value as PortfolioStatus)} className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-bold text-text">
                {DOMAIN_STATUSES.map((status) => <option key={status} value={status}>{status} ({columns[status]?.length || 0})</option>)}
              </select>
            </div>
            <div className="space-y-3 pb-4">
              {(columns[mobileStatus] || []).map((domain) => (
                <GlassCard key={domain.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/portfolio/${domain.id}`} className="block truncate text-base font-black text-text hover:text-brand">{domain.name}</Link>
                      <div className="mt-1 text-xs text-text-muted truncate">{[domain.niche, [domain.city, domain.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "Uncategorized"}</div>
                    </div>
                    <button onClick={() => { setActiveDomainId(domain.id); setMessage(`Active: ${domain.name}`); }} className="shrink-0 h-8 px-2.5 rounded-lg border border-brand/30 bg-brand-soft text-[11px] font-bold text-brand inline-flex items-center gap-1"><ArrowUpRight className="h-3 w-3" /> Use</button>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface-2/40 p-3">
                    <div><div className="text-[10px] uppercase text-text-muted">AI estimate</div><div className="font-mono font-black text-brand">${(domain.estimatedValue || 0).toLocaleString()}</div></div>
                    <div><div className="text-[10px] uppercase text-text-muted">Your price</div><div className="font-mono font-black text-text">{domain.askingPrice != null ? `$${domain.askingPrice.toLocaleString()}` : "Not set"}</div></div>
                    <div className="col-span-2 text-[11px] text-text-muted">Brand {domain.brandingScore} · Demand {domain.buyerDemandScore}</div>
                  </div>
                  <label className="mt-4 block text-[10px] font-bold uppercase tracking-wider text-text-muted">Move to</label>
                  <select value={domain.status} onChange={(event) => void moveTo(domain.id, event.target.value as PortfolioStatus)} className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text">
                    {DOMAIN_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </GlassCard>
              ))}
              {(columns[mobileStatus]?.length || 0) === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-muted">No domains in this stage.</div> : null}
            </div>
          </div>
          <div className="hidden md:flex flex-1 overflow-x-auto p-6 bg-bg gap-6">
            {DOMAIN_STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                title={status}
                count={columns[status]?.length || 0}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => onDrop(status)}
                className="min-h-[320px]"
              >
                {(columns[status] || []).map((domain) => (
                  <GlassCard
                    key={domain.id}
                    draggable
                    onDragStart={() => setDragId(domain.id)}
                    onDragEnd={() => setDragId(null)}
                    className="p-4 cursor-grab active:cursor-grabbing flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/portfolio/${domain.id}`}
                        className="font-bold text-text hover:text-brand text-[15px] truncate transition-colors leading-tight"
                      >
                        {domain.name}
                      </Link>
                      <button
                        onClick={() => {
                          setActiveDomainId(domain.id);
                          setMessage(`Active: ${domain.name}`);
                        }}
                        className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-brand hover:text-brand-hover"
                        title="Use for workflows"
                      >
                        <ArrowUpRight className="h-3 w-3" /> Use
                      </button>
                    </div>
                    <div className="text-[12px] text-text-muted truncate">
                      {[domain.niche, [domain.city, domain.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "Uncategorized"}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <StatusBadge status={domain.status} />
                      <span className="font-mono text-[11px] text-text-faint">
                        Brand {domain.brandingScore} · Demand {domain.buyerDemandScore}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-border/50">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-text-muted">Est / your price</span>
                      <span className="text-right font-mono font-bold text-sm"><span className="text-brand">${(domain.estimatedValue || 0).toLocaleString()}</span><span className="block text-[10px] text-text">{domain.askingPrice != null ? `$${domain.askingPrice.toLocaleString()}` : "Not set"}</span></span>
                    </div>
                  </GlassCard>
                ))}
                {(columns[status]?.length || 0) === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center text-[11px] text-text-muted">
                    Drop here
                  </div>
                ) : null}
              </KanbanColumn>
            ))}
          </div>
          </>
        )}

        <div className="hidden md:flex shrink-0 px-6 pb-4 text-xs text-text-muted items-center gap-2">
          <ArrowRight className="h-3 w-3" />
          Hover over a card and drag it to a new column to update its status.
        </div>
      </div>
    </OutboundShell>
  );
}
