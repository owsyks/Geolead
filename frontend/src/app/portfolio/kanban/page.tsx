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
    void load();
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
          <div className="shrink-0 mx-6 mt-3 rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm text-text-muted">
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="p-6 text-sm text-text-muted">Loading…</div>
        ) : (
          <div className="flex-1 overflow-x-auto p-6 bg-bg flex gap-6">
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
                        B{domain.brandingScore} · D{domain.buyerDemandScore}
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
        )}

        <div className="shrink-0 px-6 pb-4 text-xs text-text-muted flex items-center gap-2">
          <ArrowRight className="h-3 w-3" />
          Hover over a card and drag it to a new column to update its status.
        </div>
      </div>
    </OutboundShell>
  );
}
