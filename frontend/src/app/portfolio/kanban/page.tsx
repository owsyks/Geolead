"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, RefreshCcw } from "lucide-react";
import { OutboundShell, StatusBadge } from "@/components/OutboundShell";
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
      subtitle="Drag domains across the pipeline. Status changes propagate everywhere — campaigns, dashboards, and recommendations stay in sync."
      actions={
        <button
          onClick={() => void load()}
          className="h-10 px-3 rounded-lg border border-slate-800 bg-slate-900/70 text-sm text-slate-300 inline-flex items-center gap-2"
        >
          <RefreshCcw className="h-4 w-4" /> Refresh
        </button>
      }
    >
      {message ? (
        <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="p-6 text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
          {DOMAIN_STATUSES.map((status) => (
            <div
              key={status}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDrop(status)}
              className="rounded-lg border border-slate-800 bg-slate-900/35 p-3 min-h-[320px]"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-300">{status}</h3>
                <span className="text-[11px] text-slate-500">{columns[status]?.length || 0}</span>
              </div>
              <div className="space-y-2">
                {(columns[status] || []).map((domain) => (
                  <div
                    key={domain.id}
                    draggable
                    onDragStart={() => setDragId(domain.id)}
                    onDragEnd={() => setDragId(null)}
                    className="rounded-md border border-slate-800 bg-slate-950 p-3 cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/portfolio/${domain.id}`}
                        className="font-bold text-slate-100 hover:text-indigo-200 text-sm truncate"
                      >
                        {domain.name}
                      </Link>
                      <button
                        onClick={() => {
                          setActiveDomainId(domain.id);
                          setMessage(`Active: ${domain.name}`);
                        }}
                        className="text-[10px] text-indigo-300 hover:text-indigo-200"
                        title="Use for workflows"
                      >
                        Use
                      </button>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {[domain.niche, [domain.city, domain.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "Uncategorized"}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                      <span>${(domain.estimatedValue || 0).toLocaleString()}</span>
                      <span>B{domain.brandingScore} · D{domain.buyerDemandScore}</span>
                    </div>
                  </div>
                ))}
                {(columns[status]?.length || 0) === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-800 p-4 text-center text-[11px] text-slate-600">
                    Drop here
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 text-xs text-slate-500 flex items-center gap-2">
        <ArrowRight className="h-3 w-3" />
        Hover over a card and drag it to a new column to update its status.
      </div>
    </OutboundShell>
  );
}
