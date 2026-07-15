"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  Check,
  Download,
  Edit3,
  ExternalLink,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { EmptyState, MetricCard, OutboundShell } from "@/components/OutboundShell";
import { GlassCard, ScoreRing, StatusBadge } from "@/components/ui";
import { DomainSelector } from "@/components/DomainSelector";
import { useDomainContext } from "@/lib/domainContext";
import {
  DOMAIN_STATUSES,
  fetchOutbound,
  type PortfolioDashboard,
  type PortfolioDomain,
  type PortfolioStatus,
} from "@/lib/outbound";
import { readCache, writeCache } from "@/lib/cache";

const PORTFOLIO_CACHE_KEY = "portfolio.domains";
const PORTFOLIO_DASH_CACHE_KEY = "portfolio.dashboard";

const INPUT = "h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-text focus:border-brand outline-none transition-colors";

type SortKey = "updatedAt" | "name" | "estimatedValue" | "brandingScore" | "buyerDemandScore" | "leadOpportunityScore" | "saleProbability";

const SORT_LABELS: Record<SortKey, string> = {
  updatedAt: "Recently updated",
  name: "Name",
  estimatedValue: "Highest value",
  brandingScore: "Best brand",
  buyerDemandScore: "Most demand",
  leadOpportunityScore: "Best opportunity",
  saleProbability: "Most likely to sell",
};

const EMPTY_FORM = {
  name: "",
  status: "Available" as PortfolioStatus,
  purchaseDate: "",
  purchasePrice: "",
  askingPrice: "",
  registrar: "",
  expirationDate: "",
  tags: "",
  targetIndustries: "",
  targetLocations: "",
  notes: "",
};

type FormState = typeof EMPTY_FORM;

export default function PortfolioPage() {
  const { setActiveDomainId, refresh } = useDomainContext();
  const [domains, setDomains] = useState<PortfolioDomain[]>(() => readCache<PortfolioDomain[]>(PORTFOLIO_CACHE_KEY) ?? []);
  const [dashboard, setDashboard] = useState<PortfolioDashboard | null>(() => readCache<PortfolioDashboard>(PORTFOLIO_DASH_CACHE_KEY));
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSale, setShowSale] = useState<PortfolioDomain | null>(null);
  const [editing, setEditing] = useState<PortfolioDomain | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, stats] = await Promise.all([
        fetchOutbound<PortfolioDomain[]>(`/api/domains?includeArchived=${showArchived ? "true" : "false"}`),
        fetchOutbound<PortfolioDashboard>("/api/domains/dashboard"),
      ]);
      setDomains(list);
      setDashboard(stats);
      // Cache only the default (non-archived) view so the seed matches the paint.
      if (!showArchived) {
        writeCache(PORTFOLIO_CACHE_KEY, list);
        writeCache(PORTFOLIO_DASH_CACHE_KEY, stats);
      }
    } catch {
      setMessage("Could not reach the backend. Portfolio data may be stale.");
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    domains.forEach((domain) => domain.tags.forEach((tag) => set.add(tag)));
    return Array.from(set).sort();
  }, [domains]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    domains.forEach((domain) => {
      if (domain.category) set.add(domain.category);
    });
    return Array.from(set).sort();
  }, [domains]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return domains
      .filter((domain) => (statusFilter ? domain.status === statusFilter : true))
      .filter((domain) => (categoryFilter ? domain.category === categoryFilter : true))
      .filter((domain) => (tagFilter ? domain.tags.includes(tagFilter) : true))
      .filter((domain) => {
        if (!term) return true;
        return [domain.name, domain.niche, domain.industry, domain.city, domain.state, domain.notes]
          .map((value) => (value || "").toLowerCase())
          .some((value) => value.includes(term));
      })
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        const raw = (item: PortfolioDomain) => {
          const v = item[sortKey as keyof PortfolioDomain];
          if (v === null || v === undefined) return sortKey === "name" ? "" : 0;
          return v as string | number;
        };
        const va = raw(a);
        const vb = raw(b);
        if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
        return (Number(va) - Number(vb)) * dir;
      });
  }, [domains, statusFilter, categoryFilter, tagFilter, search, sortKey, sortDir]);

  const resetForm = () => setForm(EMPTY_FORM);

  const openAdd = () => {
    resetForm();
    setEditing(null);
    setShowAdd(true);
  };

  const openEdit = (domain: PortfolioDomain) => {
    setEditing(domain);
    setForm({
      name: domain.name,
      status: (DOMAIN_STATUSES.includes(domain.status as PortfolioStatus) ? domain.status : "Available") as PortfolioStatus,
      purchaseDate: domain.purchaseDate ? domain.purchaseDate.slice(0, 10) : "",
      purchasePrice: domain.purchasePrice != null ? String(domain.purchasePrice) : "",
      askingPrice: domain.askingPrice != null ? String(domain.askingPrice) : "",
      registrar: domain.registrar || "",
      expirationDate: domain.expirationDate ? domain.expirationDate.slice(0, 10) : "",
      tags: domain.tags.join(", "),
      targetIndustries: domain.targetIndustries.join(", "),
      targetLocations: domain.targetLocations.join(", "),
      notes: domain.notes || "",
    });
    setShowAdd(true);
  };

  const saveDomain = async () => {
    if (!form.name.trim()) {
      setMessage("Domain name is required.");
      return;
    }
    const body = {
      name: form.name.trim(),
      status: form.status,
      purchaseDate: form.purchaseDate || null,
      purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
      askingPrice: form.askingPrice ? Number(form.askingPrice) : null,
      registrar: form.registrar || null,
      expirationDate: form.expirationDate || null,
      tags: form.tags.split(",").map((value) => value.trim()).filter(Boolean),
      targetIndustries: form.targetIndustries.split(",").map((value) => value.trim()).filter(Boolean),
      targetLocations: form.targetLocations.split(",").map((value) => value.trim()).filter(Boolean),
      notes: form.notes || null,
    };
    try {
      if (editing) {
        await fetchOutbound(`/api/domains/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
        setMessage(`Updated ${body.name}.`);
      } else {
        await fetchOutbound("/api/domains", { method: "POST", body: JSON.stringify(body) });
        setMessage(`Added ${body.name} to the portfolio.`);
      }
      setShowAdd(false);
      setEditing(null);
      resetForm();
      await load();
      await refresh();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Save failed.");
    }
  };

  const archiveDomain = async (domain: PortfolioDomain) => {
    try {
      await fetchOutbound(`/api/domains/${domain.id}/archive`, { method: "POST" });
      setMessage(`Archived ${domain.name}.`);
      await load();
      await refresh();
    } catch {
      setMessage("Archive failed.");
    }
  };

  const restoreDomain = async (domain: PortfolioDomain) => {
    try {
      await fetchOutbound(`/api/domains/${domain.id}/restore`, { method: "POST" });
      setMessage(`Restored ${domain.name}.`);
      await load();
      await refresh();
    } catch {
      setMessage("Restore failed.");
    }
  };

  const deleteDomain = async (domain: PortfolioDomain) => {
    if (!confirm(`Delete ${domain.name}? This cannot be undone.`)) return;
    try {
      await fetchOutbound(`/api/domains/${domain.id}`, { method: "DELETE" });
      setMessage(`Deleted ${domain.name}.`);
      await load();
      await refresh();
    } catch {
      setMessage("Delete failed.");
    }
  };

  const analyzeDomain = async (domain: PortfolioDomain) => {
    try {
      await fetchOutbound(`/api/domains/${domain.id}/analyze`, { method: "POST" });
      setMessage(`Re-analyzed ${domain.name}.`);
      await load();
      await refresh();
    } catch {
      setMessage("Analyze failed.");
    }
  };

  return (
    <OutboundShell
      title="Domain Portfolio"
      eyebrow="Asset Management"
      subtitle="Add, categorize, analyze, and pipeline domains all the way to sale."
      actions={
        <>
          <button
            onClick={() => setShowImport(true)}
            className="h-9 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text hover:bg-surface-2 inline-flex items-center gap-2 transition-colors"
          >
            <Upload className="h-4 w-4" /> Import
          </button>
          <button
            onClick={openAdd}
            className="h-9 px-4 rounded-lg bg-brand text-sm font-bold text-bg hover:bg-brand-hover inline-flex items-center gap-2 shadow-[0_0_12px_rgba(20,184,166,0.3)] transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Domain
          </button>
          <button
            onClick={() => void load()}
            className="h-9 w-9 rounded-lg border border-border bg-surface text-text-muted hover:text-text hover:bg-surface-2 inline-flex items-center justify-center transition-colors"
            title="Refresh"
          >
            <RefreshCcw className="h-4 w-4" />
          </button>
        </>
      }
    >
      {message ? (
        <div className="mb-6 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-text-muted flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage("")} className="text-text-faint hover:text-text">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <MetricCard label="Domains" value={dashboard?.totals.domains ?? domains.length} helper="in portfolio" />
        <MetricCard
          label="Portfolio value"
          value={`$${(dashboard?.totals.portfolioValue || 0).toLocaleString()}`}
          helper="AI estimate"
        />
        <MetricCard label="Expiring soon" value={dashboard?.totals.expiringSoon ?? 0} helper="next 30d" />
        <MetricCard label="Active campaigns" value={dashboard?.totals.activeCampaigns ?? 0} helper="domain-linked" />
        <MetricCard label="Leads generated" value={dashboard?.totals.leadsGenerated ?? 0} helper="from portfolio" />
        <MetricCard label="Replies" value={dashboard?.totals.replies ?? 0} helper="all domains" />
        <MetricCard
          label="Domains sold"
          value={dashboard?.totals.domainsSold ?? 0}
          helper={`ROI ${dashboard?.totals.roi ?? 0}%`}
        />
      </section>

      <GlassCard className="mt-6 p-0 overflow-hidden">
        <div className="flex flex-col xl:flex-row gap-3 p-4 border-b border-border bg-surface-2/50">
          <div className="relative flex-1 min-w-0">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, niche, city, notes…"
              className="h-10 w-full rounded-lg border border-border bg-bg pl-10 pr-3 text-sm text-text outline-none focus:border-brand"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-lg border border-border bg-bg px-3 text-sm text-text">
            <option value="">All statuses</option>
            {DOMAIN_STATUSES.map((status) => (<option key={status} value={status}>{status}</option>))}
          </select>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="h-10 rounded-lg border border-border bg-bg px-3 text-sm text-text">
            {Object.entries(SORT_LABELS).map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
          </select>
          <button onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} className="h-10 px-3 rounded-lg border border-border bg-bg text-sm text-text-muted hover:text-text">
            {sortDir === "asc" ? "Asc" : "Desc"}
          </button>
          <details className="xl:hidden rounded-lg border border-border bg-bg text-sm text-text-muted">
            <summary className="h-10 cursor-pointer list-none px-3 flex items-center font-semibold">More filters</summary>
            <div className="grid gap-2 border-t border-border p-3">
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text">
                <option value="">All categories</option>
                {allCategories.map((category) => (<option key={category} value={category}>{category}</option>))}
              </select>
              <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text">
                <option value="">All tags</option>
                {allTags.map((tag) => (<option key={tag} value={tag}>#{tag}</option>))}
              </select>
              <label className="flex h-10 items-center gap-2 text-xs text-text-muted">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-4 w-4 accent-brand" />
                Show archived
              </label>
            </div>
          </details>
          <div className="hidden xl:contents">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-10 rounded-lg border border-border bg-bg px-3 text-sm text-text">
            <option value="">All categories</option>
            {allCategories.map((category) => (<option key={category} value={category}>{category}</option>))}
          </select>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="h-10 rounded-lg border border-border bg-bg px-3 text-sm text-text">
            <option value="">All tags</option>
            {allTags.map((tag) => (<option key={tag} value={tag}>#{tag}</option>))}
          </select>
          <label className="flex items-center gap-2 text-xs text-text-muted whitespace-nowrap">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-4 w-4 accent-brand" />
            Show archived
          </label>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-text-muted">Loading portfolio…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No domains match your filters" body="Add a domain manually or bulk import a list to start running campaigns from your portfolio." />
          </div>
        ) : (
          <>
          <div className="md:hidden divide-y divide-border">
            {filtered.map((domain) => (
              <article key={domain.id} className="p-4 bg-bg">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/portfolio/${domain.id}`} className="block truncate text-base font-black text-text hover:text-brand">
                      {domain.name}
                    </Link>
                    <div className="mt-1 text-xs text-text-muted truncate">
                      {[domain.niche || domain.industry, [domain.city, domain.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "Uncategorized"}
                    </div>
                  </div>
                  <StatusBadge status={domain.status} />
                </div>

                <div className="mt-4 grid grid-cols-[auto_1fr] gap-4 rounded-xl border border-border bg-surface-2/40 p-3">
                  <ScoreRing score={domain.brandingScore} size="sm" />
                  <div className="grid grid-cols-2 gap-3 min-w-0">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-text-muted">AI estimate</div>
                      <div className="font-mono text-sm font-black text-brand">${(domain.estimatedValue || 0).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-text-muted">Your price</div>
                      <div className="font-mono text-sm font-black text-text">{domain.askingPrice != null ? `$${domain.askingPrice.toLocaleString()}` : "Not set"}</div>
                    </div>
                    <div className="col-span-2 text-[11px] text-text-muted">Sale {domain.saleProbability}% · Demand {domain.buyerDemandScore}{domain.metadata?.buyerPool?.total ? ` · ~${domain.metadata.buyerPool.total.toLocaleString()} buyers` : ""}</div>
                  </div>
                </div>

                {domain.tags.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">{domain.tags.map((tag) => <span key={tag} className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] text-text-muted">#{tag}</span>)}</div>
                ) : null}

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button onClick={() => { setActiveDomainId(domain.id); setMessage(`Selected ${domain.name} for lead-gen, email, and campaign workflows.`); }} className="h-9 rounded-lg border border-brand/30 bg-brand-soft text-xs font-bold text-brand inline-flex items-center justify-center gap-1"><ArrowUpRight className="h-3.5 w-3.5" /> Use</button>
                  <Link href={`/portfolio/${domain.id}`} className="h-9 rounded-lg border border-border bg-surface text-xs font-bold text-text-muted inline-flex items-center justify-center gap-1"><ExternalLink className="h-3.5 w-3.5" /> Open</Link>
                  <button onClick={() => openEdit(domain)} className="h-9 rounded-lg border border-border bg-surface text-xs font-bold text-text-muted inline-flex items-center justify-center gap-1"><Edit3 className="h-3.5 w-3.5" /> Edit</button>
                  {domain.status !== "Sold" ? (
                    <button onClick={() => setShowSale(domain)} className="h-9 rounded-lg border border-success/30 bg-success/10 text-xs font-bold text-success inline-flex items-center justify-center gap-1"><Check className="h-3.5 w-3.5" /> Sold</button>
                  ) : (
                    <button onClick={() => void analyzeDomain(domain)} className="h-9 rounded-lg border border-border bg-surface text-xs font-bold text-text-muted inline-flex items-center justify-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Analyze</button>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button onClick={() => void analyzeDomain(domain)} className="h-8 px-3 rounded-lg text-[11px] text-text-muted hover:text-brand">Re-analyze</button>
                  <button onClick={() => void (domain.archivedAt ? restoreDomain(domain) : archiveDomain(domain))} className="h-8 px-3 rounded-lg text-[11px] text-text-muted hover:text-copper">{domain.archivedAt ? "Restore" : "Archive"}</button>
                  <button onClick={() => void deleteDomain(domain)} className="h-8 px-3 rounded-lg text-[11px] text-danger hover:bg-danger/10">Delete</button>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full text-sm border-collapse">
              <thead className="bg-surface-2/30 text-[11px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-bold">Domain</th>
                  <th className="px-4 py-3 text-left font-bold">Category</th>
                  <th className="px-4 py-3 text-left font-bold">Status</th>
                  <th className="px-4 py-3 text-center font-bold">Brand</th>
                  <th className="px-4 py-3 text-right font-bold">Value / your price</th>
                  <th className="px-4 py-3 text-left font-bold">Tags</th>
                  <th className="px-4 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((domain) => (
                  <tr key={domain.id} className="hover:bg-surface-2/30 transition-colors group">
                    <td className="px-4 py-3 align-top">
                      <Link href={`/portfolio/${domain.id}`} className="font-bold text-[15px] text-text hover:text-brand transition-colors">
                        {domain.name}
                      </Link>
                      <div className="text-[11px] text-text-muted">
                        {domain.registrar ? `Registrar: ${domain.registrar}` : "Unregistered registrar"}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-text-muted">
                      <div className="text-text">{domain.niche || domain.industry || "Uncategorized"}</div>
                      <div className="text-[11px] text-text-muted">
                        {[domain.city, domain.state].filter(Boolean).join(", ") || "Geo unknown"}
                      </div>
                      {domain.metadata?.buyerPool?.total ? (
                        <div className="mt-1 text-[11px] text-brand font-bold">
                          ~{(domain.metadata.buyerPool.total).toLocaleString()} buyers
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusBadge status={domain.status} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex justify-center">
                        <ScoreRing score={domain.brandingScore} size="sm" />
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <div className="font-mono font-bold text-brand">${(domain.estimatedValue || 0).toLocaleString()}</div>
                      <div className="text-[11px] font-mono font-bold text-text">Your price: {domain.askingPrice != null ? `$${domain.askingPrice.toLocaleString()}` : "Not set"}</div>
                      <div className="text-[11px] text-text-muted">Sale {domain.saleProbability}% · Demand {domain.buyerDemandScore}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {domain.tags.length === 0 ? (
                          <span className="text-[11px] text-text-faint">—</span>
                        ) : (
                          domain.tags.map((tag) => (
                            <span key={tag} className="px-1.5 py-0.5 bg-surface border border-border text-[10px] rounded text-text-muted">#{tag}</span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button
                          title="Use for workflows"
                          onClick={() => {
                            setActiveDomainId(domain.id);
                            setMessage(`Selected ${domain.name} for lead-gen, email, and campaign workflows.`);
                          }}
                          className="h-7 px-2 rounded-md border border-brand/30 bg-brand-soft text-[11px] text-brand inline-flex items-center gap-1 hover:bg-brand/20"
                        >
                          <ArrowUpRight className="h-3 w-3" /> Use
                        </button>
                        <Link href={`/portfolio/${domain.id}`} className="h-7 px-2 rounded-md border border-border bg-surface text-[11px] text-text-muted hover:text-text inline-flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" /> Open
                        </Link>
                        <button title="Re-analyze" onClick={() => void analyzeDomain(domain)} className="h-7 w-7 rounded-md border border-border bg-surface text-text-muted hover:text-brand hover:border-brand inline-flex items-center justify-center">
                          <Sparkles className="h-3 w-3" />
                        </button>
                        <button title="Edit" onClick={() => openEdit(domain)} className="h-7 w-7 rounded-md border border-border bg-surface text-text-muted hover:text-text inline-flex items-center justify-center">
                          <Edit3 className="h-3 w-3" />
                        </button>
                        {domain.status !== "Sold" ? (
                          <button title="Mark as sold" onClick={() => setShowSale(domain)} className="h-7 w-7 rounded-md border border-border bg-surface text-text-muted hover:text-success hover:border-success inline-flex items-center justify-center">
                            <Check className="h-3 w-3" />
                          </button>
                        ) : null}
                        {domain.archivedAt ? (
                          <button title="Restore" onClick={() => void restoreDomain(domain)} className="h-7 w-7 rounded-md border border-border bg-surface text-text-muted hover:text-text inline-flex items-center justify-center">
                            <Download className="h-3 w-3" />
                          </button>
                        ) : (
                          <button title="Archive" onClick={() => void archiveDomain(domain)} className="h-7 w-7 rounded-md border border-border bg-surface text-text-muted hover:text-copper hover:border-copper inline-flex items-center justify-center">
                            <Archive className="h-3 w-3" />
                          </button>
                        )}
                        <button title="Delete" onClick={() => void deleteDomain(domain)} className="h-7 w-7 rounded-md border border-border bg-surface text-text-muted hover:text-danger hover:border-danger inline-flex items-center justify-center">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </GlassCard>

      <GlassCard className="mt-6 p-5">
        <h2 className="text-base font-black text-text">Active selection</h2>
        <p className="mt-1 text-xs text-text-muted">
          Whatever you choose here becomes the default for lead generation, AI email generation, and campaign creation.
        </p>
        <div className="mt-3">
          <DomainSelector variant="card" />
        </div>
      </GlassCard>

      {showAdd ? (
        <DomainFormModal
          editing={editing}
          form={form}
          setForm={setForm}
          onClose={() => { setShowAdd(false); setEditing(null); resetForm(); }}
          onSave={saveDomain}
        />
      ) : null}

      {showImport ? (
        <BulkImportModal
          onClose={() => setShowImport(false)}
          onImported={async (count) => {
            setShowImport(false);
            setMessage(`Imported ${count} domain(s) from your list.`);
            await load();
            await refresh();
          }}
        />
      ) : null}

      {showSale ? (
        <SaleModal
          domain={showSale}
          onClose={() => setShowSale(null)}
          onSaved={async () => {
            setShowSale(null);
            setMessage("Sale recorded.");
            await load();
            await refresh();
          }}
        />
      ) : null}
    </OutboundShell>
  );
}

function DomainFormModal({
  editing,
  form,
  setForm,
  onClose,
  onSave,
}: {
  editing: PortfolioDomain | null;
  form: FormState;
  setForm: (f: FormState | ((current: FormState) => FormState)) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal title={editing ? `Edit ${editing.name}` : "Add domain"} onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Domain name" required>
          <input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} placeholder="TexasCarVendor.com" className={INPUT} />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value as PortfolioStatus }))} className={INPUT}>
            {DOMAIN_STATUSES.map((status) => (<option key={status} value={status}>{status}</option>))}
          </select>
        </Field>
        <Field label="Purchase date">
          <input type="date" value={form.purchaseDate} onChange={(e) => setForm((c) => ({ ...c, purchaseDate: e.target.value }))} className={INPUT} />
        </Field>
        <Field label="Purchase price (USD)">
          <input type="number" min={0} value={form.purchasePrice} onChange={(e) => setForm((c) => ({ ...c, purchasePrice: e.target.value }))} className={INPUT} />
        </Field>
        <Field label="Your asking price (USD)">
          <input type="number" min={0} step="0.01" value={form.askingPrice} onChange={(e) => setForm((c) => ({ ...c, askingPrice: e.target.value }))} placeholder="Your public sale price" className={INPUT} />
        </Field>
        <Field label="Registrar">
          <input value={form.registrar} onChange={(e) => setForm((c) => ({ ...c, registrar: e.target.value }))} placeholder="Namecheap, GoDaddy, …" className={INPUT} />
        </Field>
        <Field label="Expiration date">
          <input type="date" value={form.expirationDate} onChange={(e) => setForm((c) => ({ ...c, expirationDate: e.target.value }))} className={INPUT} />
        </Field>
        <Field label="Tags (comma separated)">
          <input value={form.tags} onChange={(e) => setForm((c) => ({ ...c, tags: e.target.value }))} placeholder="premium, auto" className={INPUT} />
        </Field>
        <Field label="Target industries (comma separated)">
          <input value={form.targetIndustries} onChange={(e) => setForm((c) => ({ ...c, targetIndustries: e.target.value }))} placeholder="Automotive, Marketing" className={INPUT} />
        </Field>
        <Field label="Target locations (comma separated)">
          <input value={form.targetLocations} onChange={(e) => setForm((c) => ({ ...c, targetLocations: e.target.value }))} placeholder="Austin TX, Dallas TX" className={INPUT} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Notes">
            <textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} className="min-h-24 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-brand" />
          </Field>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button onClick={onClose} className="h-10 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text hover:bg-surface-2">Cancel</button>
        <button onClick={onSave} className="h-10 px-4 rounded-lg bg-brand text-sm font-bold text-bg hover:bg-brand-hover shadow-[0_0_12px_rgba(20,184,166,0.3)]">
          {editing ? "Save changes" : "Add to portfolio"}
        </button>
      </div>
    </Modal>
  );
}

function BulkImportModal({ onClose, onImported }: { onClose: () => void; onImported: (count: number) => void | Promise<void> }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || "");
      const lines = raw.split(/\r?\n/);
      const names = lines
        .map((line) => line.split(/[\t,]/)[0]?.trim())
        .filter((name) => name && !/^domain/i.test(name));
      setText(names.join("\n"));
    };
    reader.readAsText(file);
  };

  const submit = async () => {
    const candidates = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (candidates.length === 0) {
      setError("Paste at least one domain name.");
      return;
    }
    setWorking(true);
    setError("");
    try {
      const result = await fetchOutbound<{ imported: number; skipped: number; errors: string[] }>(
        "/api/domains/import",
        { method: "POST", body: JSON.stringify({ rows: candidates }) }
      );
      await onImported(result.imported);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal title="Bulk import domains" onClose={onClose}>
      <p className="text-xs text-text-muted">
        Upload a CSV/TXT file or paste one domain per line. Excel: export as CSV first. AI categorization runs on every imported row.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <label className="h-10 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text inline-flex items-center gap-2 cursor-pointer">
          <Upload className="h-4 w-4" />
          Choose file
          <input type="file" accept=".csv,.txt,.tsv" hidden onChange={onFile} />
        </label>
        {fileName ? <span className="text-xs text-text-muted">{fileName}</span> : null}
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={`TexasCarVendor.com\nMiamiRoofing.com\nDallasPlumber.com`}
        className="mt-3 min-h-48 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-brand"
      />
      {error ? <div className="mt-2 text-xs text-danger">{error}</div> : null}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={onClose} className="h-10 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text hover:bg-surface-2">Cancel</button>
        <button onClick={() => void submit()} disabled={working} className="h-10 px-4 rounded-lg bg-brand text-sm font-bold text-bg hover:bg-brand-hover disabled:opacity-60 shadow-[0_0_12px_rgba(20,184,166,0.3)]">
          {working ? "Importing…" : "Import & categorize"}
        </button>
      </div>
    </Modal>
  );
}

function SaleModal({ domain, onClose, onSaved }: { domain: PortfolioDomain; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [form, setForm] = useState({
    buyerName: "",
    buyerEmail: "",
    salePrice: domain.askingPrice != null ? String(domain.askingPrice) : domain.recommendedPrice ? String(domain.recommendedPrice) : "",
    saleDate: new Date().toISOString().slice(0, 10),
    marketplace: "",
    fees: "",
    notes: "",
  });
  const [error, setError] = useState("");

  const submit = async () => {
    if (!form.buyerName.trim() || !form.salePrice) {
      setError("Buyer name and sale price are required.");
      return;
    }
    try {
      await fetchOutbound(`/api/domains/${domain.id}/sale`, {
        method: "POST",
        body: JSON.stringify({
          buyerName: form.buyerName,
          buyerEmail: form.buyerEmail || undefined,
          salePrice: Number(form.salePrice),
          saleDate: form.saleDate || undefined,
          marketplace: form.marketplace || undefined,
          fees: form.fees ? Number(form.fees) : 0,
          notes: form.notes || undefined,
        }),
      });
      await onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sale save failed.");
    }
  };

  return (
    <Modal title={`Record sale of ${domain.name}`} onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Buyer name" required>
          <input value={form.buyerName} onChange={(e) => setForm((c) => ({ ...c, buyerName: e.target.value }))} className={INPUT} />
        </Field>
        <Field label="Buyer email">
          <input value={form.buyerEmail} onChange={(e) => setForm((c) => ({ ...c, buyerEmail: e.target.value }))} className={INPUT} />
        </Field>
        <Field label="Sale price (USD)" required>
          <input type="number" value={form.salePrice} onChange={(e) => setForm((c) => ({ ...c, salePrice: e.target.value }))} className={INPUT} />
        </Field>
        <Field label="Sale date">
          <input type="date" value={form.saleDate} onChange={(e) => setForm((c) => ({ ...c, saleDate: e.target.value }))} className={INPUT} />
        </Field>
        <Field label="Marketplace">
          <input value={form.marketplace} onChange={(e) => setForm((c) => ({ ...c, marketplace: e.target.value }))} placeholder="Dan, Sedo, direct…" className={INPUT} />
        </Field>
        <Field label="Fees / commission">
          <input type="number" value={form.fees} onChange={(e) => setForm((c) => ({ ...c, fees: e.target.value }))} className={INPUT} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Notes">
            <textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} className="min-h-20 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-brand" />
          </Field>
        </div>
      </div>
      {error ? <div className="mt-2 text-xs text-danger">{error}</div> : null}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={onClose} className="h-10 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text hover:bg-surface-2">Cancel</button>
        <button onClick={() => void submit()} className="h-10 px-4 rounded-lg bg-success text-sm font-bold text-bg hover:opacity-90">Mark as sold</button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl mt-2 sm:mt-12 glass rounded-2xl border border-border shadow-[0_24px_64px_rgba(0,0,0,.5)]">
        <div className="flex items-center justify-between border-b border-border px-3 sm:px-5 py-3">
          <h3 className="text-base font-black text-text">{title}</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-md text-text-muted hover:text-text inline-flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-3 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted">
      {label}
      {required ? <span className="text-danger"> *</span> : null}
      <div className="mt-1">{children}</div>
    </label>
  );
}
