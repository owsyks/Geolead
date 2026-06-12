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
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { EmptyState, MetricCard, OutboundShell  } from "@/components/OutboundShell"
import { StatusBadge } from "@/components/ui"
;
import { DomainSelector } from "@/components/DomainSelector";
import { useDomainContext } from "@/lib/domainContext";
import {
  DOMAIN_STATUSES,
  fetchOutbound,
  type PortfolioDashboard,
  type PortfolioDomain,
  type PortfolioStatus,
} from "@/lib/outbound";

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
  const [domains, setDomains] = useState<PortfolioDomain[]>([]);
  const [dashboard, setDashboard] = useState<PortfolioDashboard | null>(null);
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
    } catch {
      setMessage("Could not reach the backend. Portfolio data may be stale.");
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    void load();
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
    } catch (err: any) {
      setMessage(err?.message || "Save failed.");
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
      subtitle="Your central workspace for every owned domain. Add, categorize, analyze, and pipeline domains all the way to sale."
      actions={
        <>
          <button
            onClick={() => setShowImport(true)}
            className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/70 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-2"
          >
            <Upload className="h-4 w-4" /> Bulk import
          </button>
          <button
            onClick={openAdd}
            className="h-10 px-3 rounded-lg border border-teal-400/30 bg-teal-500/15 text-sm text-teal-100 hover:bg-teal-500/25 inline-flex items-center gap-2 dark:text-teal-100"
          >
            <Plus className="h-4 w-4" /> Add domain
          </button>
          <button
            onClick={() => void load()}
            className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/70 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-2"
          >
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>
        </>
      }
    >
      {message ? (
        <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage("")} className="text-slate-500 hover:text-slate-300">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <section className="grid grid-cols-2 xl:grid-cols-7 gap-3">
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

      <section className="mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35">
        <div className="flex flex-col xl:flex-row gap-3 p-4 border-b border-slate-200 dark:border-slate-900">
          <div className="relative flex-1 min-w-0">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, niche, city, notes…"
              className="h-10 w-full rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 pl-10 pr-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-teal-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          >
            <option value="">All statuses</option>
            {DOMAIN_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="h-10 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          >
            <option value="">All categories</option>
            {allCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <select
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
            className="h-10 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          >
            <option value="">All tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>#{tag}</option>
            ))}
          </select>
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="h-10 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          >
            {Object.entries(SORT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <button
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-700 dark:text-slate-300"
          >
            {sortDir === "asc" ? "Asc" : "Desc"}
          </button>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="h-4 w-4 accent-teal-500"
            />
            Show archived
          </label>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading portfolio…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No domains match your filters"
              body="Add a domain manually or bulk import a list to start running campaigns from your portfolio."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950/60 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Domain</th>
                  <th className="px-4 py-3 text-left">Intelligence</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Est. value</th>
                  <th className="px-4 py-3 text-center">Scores</th>
                  <th className="px-4 py-3 text-left">Tags</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-900">
                {filtered.map((domain) => (
                  <tr key={domain.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="px-4 py-3 align-top">
                      <Link href={`/portfolio/${domain.id}`} className="font-bold text-slate-900 dark:text-slate-100 hover:text-teal-200">
                        {domain.name}
                      </Link>
                      <div className="text-[11px] text-slate-500">
                        {domain.registrar ? `Registrar: ${domain.registrar}` : "Unregistered registrar"}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-slate-700 dark:text-slate-300">
                      <div>{domain.niche || domain.industry || "Uncategorized"}</div>
                      <div className="text-[11px] text-slate-500">
                        {[domain.city, domain.state].filter(Boolean).join(", ") || "Geo unknown"}
                      </div>
                      {domain.metadata?.buyerPool?.total ? (
                        <div className="mt-1 text-[11px] text-teal-400 font-bold">
                          ~{(domain.metadata.buyerPool.total).toLocaleString()} buyers
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusBadge status={domain.status} />
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <div className="text-slate-800 dark:text-slate-200 font-bold">
                        ${(domain.estimatedValue || 0).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Rec ${(domain.recommendedPrice || 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-center">
                      <div className="inline-flex flex-col gap-1 text-[11px]">
                        <span className="text-slate-500">Brand <strong className="text-slate-800 dark:text-slate-200">{domain.brandingScore}</strong></span>
                        <span className="text-slate-500">Demand <strong className="text-slate-800 dark:text-slate-200">{domain.buyerDemandScore}</strong></span>
                        <span className="text-slate-500">Sale <strong className="text-slate-800 dark:text-slate-200">{domain.saleProbability}%</strong></span>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {domain.tags.length === 0 ? (
                          <span className="text-[11px] text-slate-500">—</span>
                        ) : (
                          domain.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 px-2 py-0.5 text-[10px] text-slate-700 dark:text-slate-300">
                              #{tag}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          title="Use for workflows"
                          onClick={() => {
                            setActiveDomainId(domain.id);
                            setMessage(`Selected ${domain.name} for lead-gen, email, and campaign workflows.`);
                          }}
                          className="h-7 px-2 rounded-md border border-teal-400/30 bg-teal-500/15 text-[11px] text-teal-100 inline-flex items-center gap-1"
                        >
                          <ArrowUpRight className="h-3 w-3" /> Use
                        </button>
                        <Link
                          href={`/portfolio/${domain.id}`}
                          className="h-7 px-2 rounded-md border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-[11px] text-slate-700 dark:text-slate-300 inline-flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" /> Open
                        </Link>
                        <button
                          title="Re-analyze"
                          onClick={() => void analyzeDomain(domain)}
                          className="h-7 px-2 rounded-md border border-slate-800 bg-slate-950 text-[11px] text-slate-300"
                        >
                          AI
                        </button>
                        <button
                          title="Edit"
                          onClick={() => openEdit(domain)}
                          className="h-7 w-7 rounded-md border border-slate-800 bg-slate-950 text-slate-300 inline-flex items-center justify-center"
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>
                        {domain.status !== "Sold" ? (
                          <button
                            title="Mark as sold"
                            onClick={() => setShowSale(domain)}
                            className="h-7 px-2 rounded-md border border-emerald-400/30 bg-emerald-500/10 text-[11px] text-emerald-200"
                          >
                            <Check className="h-3 w-3 inline" /> Sold
                          </button>
                        ) : null}
                        {domain.archivedAt ? (
                          <button
                            title="Restore"
                            onClick={() => void restoreDomain(domain)}
                            className="h-7 w-7 rounded-md border border-slate-800 bg-slate-950 text-slate-300 inline-flex items-center justify-center"
                          >
                            <Download className="h-3 w-3" />
                          </button>
                        ) : (
                          <button
                            title="Archive"
                            onClick={() => void archiveDomain(domain)}
                            className="h-7 w-7 rounded-md border border-slate-800 bg-slate-950 text-slate-300 inline-flex items-center justify-center"
                          >
                            <Archive className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          title="Delete"
                          onClick={() => void deleteDomain(domain)}
                          className="h-7 w-7 rounded-md border border-red-400/25 bg-red-500/10 text-red-300 inline-flex items-center justify-center"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/35 p-5">
          <h2 className="text-base font-black text-slate-900 dark:text-slate-100">Active selection</h2>
          <p className="mt-1 text-xs text-slate-500">
            Whatever you choose here becomes the default for lead generation, AI email generation, and campaign creation.
          </p>
          <div className="mt-3">
            <DomainSelector variant="card" />
          </div>
        </div>
      </section>

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
          <input
            value={form.name}
            onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
            placeholder="TexasCarVendor.com"
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-400 outline-none"
          />
        </Field>
        <Field label="Status">
          <select
            value={form.status}
            onChange={(event) => setForm((c) => ({ ...c, status: event.target.value as PortfolioStatus }))}
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          >
            {DOMAIN_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </Field>
        <Field label="Purchase date">
          <input
            type="date"
            value={form.purchaseDate}
            onChange={(event) => setForm((c) => ({ ...c, purchaseDate: event.target.value }))}
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          />
        </Field>
        <Field label="Purchase price (USD)">
          <input
            type="number"
            min={0}
            value={form.purchasePrice}
            onChange={(event) => setForm((c) => ({ ...c, purchasePrice: event.target.value }))}
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          />
        </Field>
        <Field label="Registrar">
          <input
            value={form.registrar}
            onChange={(event) => setForm((c) => ({ ...c, registrar: event.target.value }))}
            placeholder="Namecheap, GoDaddy, …"
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          />
        </Field>
        <Field label="Expiration date">
          <input
            type="date"
            value={form.expirationDate}
            onChange={(event) => setForm((c) => ({ ...c, expirationDate: event.target.value }))}
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          />
        </Field>
        <Field label="Tags (comma separated)">
          <input
            value={form.tags}
            onChange={(event) => setForm((c) => ({ ...c, tags: event.target.value }))}
            placeholder="premium, auto"
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          />
        </Field>
        <Field label="Target industries (comma separated)">
          <input
            value={form.targetIndustries}
            onChange={(event) => setForm((c) => ({ ...c, targetIndustries: event.target.value }))}
            placeholder="Automotive, Marketing"
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          />
        </Field>
        <Field label="Target locations (comma separated)">
          <input
            value={form.targetLocations}
            onChange={(event) => setForm((c) => ({ ...c, targetLocations: event.target.value }))}
            placeholder="Austin TX, Dallas TX"
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(event) => setForm((c) => ({ ...c, notes: event.target.value }))}
              className="min-h-24 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </Field>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button onClick={onClose} className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300">
          Cancel
        </button>
        <button onClick={onSave} className="h-10 px-3 rounded-lg border border-teal-400/30 bg-teal-500/15 text-sm text-teal-100">
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
      // CSV: take the first column; TXT: take whole line. Excel files exported
      // as .xlsx aren't text — we ask the user to save-as-CSV for now.
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
    } catch (err: any) {
      setError(err?.message || "Import failed.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal title="Bulk import domains" onClose={onClose}>
      <p className="text-xs text-slate-500">
        Upload a CSV/TXT file or paste one domain per line. Excel: export as CSV first. AI categorization runs on every imported row.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <label className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/70 text-sm text-slate-700 dark:text-slate-300 inline-flex items-center gap-2 cursor-pointer">
          <Upload className="h-4 w-4" />
          Choose file
          <input type="file" accept=".csv,.txt,.tsv" hidden onChange={onFile} />
        </label>
        {fileName ? <span className="text-xs text-slate-500">{fileName}</span> : null}
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={`TexasCarVendor.com\nMiamiRoofing.com\nDallasPlumber.com`}
        className="mt-3 min-h-48 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-teal-400"
      />
      {error ? <div className="mt-2 text-xs text-red-300">{error}</div> : null}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={onClose} className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300">
          Cancel
        </button>
        <button
          onClick={() => void submit()}
          disabled={working}
          className="h-10 px-3 rounded-lg border border-teal-400/30 bg-teal-500/15 text-sm text-teal-100 disabled:opacity-60"
        >
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
    salePrice: domain.recommendedPrice ? String(domain.recommendedPrice) : "",
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
    } catch (err: any) {
      setError(err?.message || "Sale save failed.");
    }
  };

  return (
    <Modal title={`Record sale of ${domain.name}`} onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Buyer name" required>
          <input
            value={form.buyerName}
            onChange={(event) => setForm((c) => ({ ...c, buyerName: event.target.value }))}
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          />
        </Field>
        <Field label="Buyer email">
          <input
            value={form.buyerEmail}
            onChange={(event) => setForm((c) => ({ ...c, buyerEmail: event.target.value }))}
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          />
        </Field>
        <Field label="Sale price (USD)" required>
          <input
            type="number"
            value={form.salePrice}
            onChange={(event) => setForm((c) => ({ ...c, salePrice: event.target.value }))}
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          />
        </Field>
        <Field label="Sale date">
          <input
            type="date"
            value={form.saleDate}
            onChange={(event) => setForm((c) => ({ ...c, saleDate: event.target.value }))}
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          />
        </Field>
        <Field label="Marketplace">
          <input
            value={form.marketplace}
            onChange={(event) => setForm((c) => ({ ...c, marketplace: event.target.value }))}
            placeholder="Dan, Sedo, direct…"
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          />
        </Field>
        <Field label="Fees / commission">
          <input
            type="number"
            value={form.fees}
            onChange={(event) => setForm((c) => ({ ...c, fees: event.target.value }))}
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(event) => setForm((c) => ({ ...c, notes: event.target.value }))}
              className="min-h-20 w-full rounded-md border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </Field>
        </div>
      </div>
      {error ? <div className="mt-2 text-xs text-red-300">{error}</div> : null}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={onClose} className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300">
          Cancel
        </button>
        <button onClick={() => void submit()} className="h-10 px-3 rounded-lg border border-emerald-400/30 bg-emerald-500/15 text-sm text-emerald-200">
          Mark as sold
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl mt-12 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-900 px-5 py-3">
          <h3 className="text-base font-black text-slate-900 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 inline-flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-bold text-slate-400">
      {label}
      {required ? <span className="text-red-300">*</span> : null}
      <div className="mt-1">{children}</div>
    </label>
  );
}
