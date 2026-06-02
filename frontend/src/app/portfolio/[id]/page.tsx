"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Briefcase,
  ChevronRight,
  DollarSign,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { EmptyState, MetricCard, OutboundShell, StatusBadge } from "@/components/OutboundShell";
import { useDomainContext } from "@/lib/domainContext";
import {
  DOMAIN_STATUSES,
  fetchOutbound,
  type BuyerDiscoveryParams,
  type DomainBuyer,
  type DomainDetail,
  type DomainOffer,
} from "@/lib/outbound";

export default function DomainDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const { setActiveDomainId, refresh } = useDomainContext();
  const [domain, setDomain] = useState<DomainDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showBuyer, setShowBuyer] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const [showSale, setShowSale] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await fetchOutbound<DomainDetail>(`/api/domains/${id}`);
      setDomain(data);
    } catch {
      setMessage("Could not load this domain.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalOffersValue = useMemo(
    () => (domain?.offers || []).reduce((sum, offer) => sum + (offer.amount || 0), 0),
    [domain]
  );

  if (!id) return null;

  if (loading && !domain) {
    return (
      <OutboundShell title="Loading domain…" subtitle="" >
        <div className="p-6 text-sm text-slate-500">Loading…</div>
      </OutboundShell>
    );
  }

  if (!domain) {
    return (
      <OutboundShell title="Domain not found" subtitle="">
        <Link href="/portfolio" className="text-indigo-300 underline text-sm">← Back to portfolio</Link>
      </OutboundShell>
    );
  }

  const changeStatus = async (status: string) => {
    try {
      await fetchOutbound(`/api/domains/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setMessage(`Status set to ${status}.`);
      await load();
      await refresh();
    } catch {
      setMessage("Status update failed.");
    }
  };

  const useForWorkflows = () => {
    setActiveDomainId(domain.id);
    setMessage("This domain will drive lead-gen, email gen, and campaigns until you change it.");
  };

  const reanalyze = async () => {
    try {
      await fetchOutbound(`/api/domains/${id}/analyze`, { method: "POST" });
      setMessage("AI intelligence refreshed.");
      await load();
      await refresh();
    } catch {
      setMessage("Analyze failed.");
    }
  };

  const launchBuyerDiscovery = async () => {
    try {
      const params = await fetchOutbound<BuyerDiscoveryParams>(`/api/domains/${id}/buyer-discovery`);
      const query = new URLSearchParams({
        keyword: params.keyword,
        domainIdea: params.domainName,
        cityState: params.cityState,
      }).toString();
      // Active domain is already set so the Lead Explorer auto-fills, but we
      // also pass the query string for an extra-explicit handoff.
      setActiveDomainId(domain.id);
      router.push(`/dashboard?${query}`);
    } catch {
      setMessage("Could not derive buyer-discovery parameters.");
    }
  };

  return (
    <OutboundShell
      title={domain.name}
      subtitle={domain.aiSummary || "Domain detail and CRM workspace."}
      actions={
        <>
          <Link href="/portfolio" className="h-10 px-3 rounded-lg border border-slate-800 bg-slate-900/70 text-sm text-slate-300 inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Portfolio
          </Link>
          <button
            onClick={useForWorkflows}
            className="h-10 px-3 rounded-lg border border-indigo-400/30 bg-indigo-500/15 text-sm text-indigo-100 inline-flex items-center gap-2"
          >
            <ArrowUpRight className="h-4 w-4" /> Use for workflows
          </button>
          <button
            onClick={launchBuyerDiscovery}
            className="h-10 px-3 rounded-lg border border-slate-800 bg-slate-900/70 text-sm text-slate-300 inline-flex items-center gap-2"
          >
            <Users className="h-4 w-4" /> Find buyers
          </button>
          <button
            onClick={() => void reanalyze()}
            className="h-10 px-3 rounded-lg border border-slate-800 bg-slate-900/70 text-sm text-slate-300 inline-flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4" /> Re-analyze
          </button>
          <button
            onClick={() => void load()}
            className="h-10 px-3 rounded-lg border border-slate-800 bg-slate-900/70 text-sm text-slate-300 inline-flex items-center gap-2"
          >
            <RefreshCcw className="h-4 w-4" />
          </button>
        </>
      }
    >
      {message ? (
        <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300 flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage("")} className="text-slate-500 hover:text-slate-300">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <section className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <MetricCard label="Estimated value" value={`$${(domain.estimatedValue || 0).toLocaleString()}`} helper={`Rec $${(domain.recommendedPrice || 0).toLocaleString()}`} />
        <MetricCard label="Branding" value={`${domain.brandingScore}/100`} helper="memorability" />
        <MetricCard label="Buyer demand" value={`${domain.buyerDemandScore}/100`} helper="intent fit" />
        <MetricCard label="Lead opportunity" value={`${domain.leadOpportunityScore}/100`} helper="SMB density" />
        <MetricCard label="Sale probability" value={`${domain.saleProbability}%`} helper="AI estimate" />
        <MetricCard label="Open offers" value={(domain.offers || []).filter((offer) => offer.status === "OPEN").length} helper={`$${totalOffersValue.toLocaleString()} on table`} />
      </section>

      <section className="mt-6 grid grid-cols-1 xl:grid-cols-[1.1fr_1.4fr] gap-5">
        <div className="rounded-lg border border-slate-800 bg-slate-900/35 p-5">
          <h2 className="text-base font-black text-slate-100">Pipeline status</h2>
          <div className="mt-2"><StatusBadge value={domain.status} /></div>
          <div className="mt-4 flex flex-wrap gap-2">
            {DOMAIN_STATUSES.map((status) => (
              <button
                key={status}
                onClick={() => void changeStatus(status)}
                className={`h-9 px-3 rounded-md text-xs border ${
                  domain.status === status
                    ? "bg-indigo-500/15 border-indigo-400/30 text-indigo-100"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-100"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          {domain.status !== "Sold" ? (
            <button
              onClick={() => setShowSale(true)}
              className="mt-4 h-10 px-3 rounded-lg border border-emerald-400/30 bg-emerald-500/15 text-sm text-emerald-200 inline-flex items-center gap-2"
            >
              <DollarSign className="h-4 w-4" /> Mark as sold
            </button>
          ) : null}
          {domain.sale ? (
            <div className="mt-4 rounded-md border border-emerald-400/20 bg-emerald-500/5 p-3 text-xs text-slate-300">
              <div className="font-bold text-emerald-200">Sold for ${domain.sale.salePrice.toLocaleString()} {domain.sale.currency}</div>
              <div className="mt-1">Buyer: {domain.sale.buyerName}</div>
              {domain.sale.marketplace ? <div>Marketplace: {domain.sale.marketplace}</div> : null}
              {domain.sale.notes ? <div className="mt-2 italic">{domain.sale.notes}</div> : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/35 p-5">
          <h2 className="text-base font-black text-slate-100">AI recommendations</h2>
          <p className="mt-1 text-xs text-slate-500">Generated from the domain name; refresh after edits.</p>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300">
            <Block label="Niche">{domain.niche || "—"}</Block>
            <Block label="Industry">{domain.industry || "—"}</Block>
            <Block label="Geo">{[domain.city, domain.state].filter(Boolean).join(", ") || "—"}</Block>
            <Block label="Best industries">{(domain.bestIndustries || []).join(", ") || "—"}</Block>
            <Block label="Best cities">{(domain.bestCities || []).join(", ") || "—"}</Block>
            <Block label="Recommended price">${(domain.recommendedPrice || 0).toLocaleString()}</Block>
          </div>
          <div className="mt-4 rounded-md border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Outreach strategy</div>
            <p className="mt-1">{domain.outreachStrategy || "Pitch the domain as a brandable, geo-anchored landing page for local SMBs."}</p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="rounded-lg border border-slate-800 bg-slate-900/35 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-slate-100 flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-300" /> Interested buyers
            </h2>
            <button
              onClick={() => setShowBuyer(true)}
              className="h-8 px-3 rounded-md border border-slate-800 bg-slate-950 text-xs text-slate-300 inline-flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          {domain.buyers.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No buyers tracked" body="Run buyer discovery or add prospects manually." />
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {domain.buyers.map((buyer) => (
                <BuyerRow key={buyer.id} buyer={buyer} domainId={id} onChange={() => void load()} />
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/35 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-slate-100 flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-indigo-300" /> Negotiation timeline
            </h2>
            <button
              onClick={() => setShowOffer(true)}
              className="h-8 px-3 rounded-md border border-slate-800 bg-slate-950 text-xs text-slate-300 inline-flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Record offer
            </button>
          </div>
          {domain.offers.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No offers yet" body="Log every inbound offer, counter, and rejection to keep the negotiation history clean." />
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {domain.offers.map((offer) => (
                <OfferRow key={offer.id} offer={offer} domainId={id} onChange={() => void load()} />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-800 bg-slate-900/35 p-5">
        <h2 className="text-base font-black text-slate-100">Linked campaigns</h2>
        {domain.campaigns.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No campaigns yet"
              body="Use the selector and head to Campaigns to launch outreach from this domain."
            />
          </div>
        ) : (
          <table className="mt-4 min-w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left">Name</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-right">Leads</th>
                <th className="px-2 py-2 text-right">Sent</th>
                <th className="px-2 py-2 text-right">Replies</th>
                <th className="px-2 py-2 text-right">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {domain.campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td className="px-2 py-2 text-slate-200">{campaign.name}</td>
                  <td className="px-2 py-2"><StatusBadge value={campaign.status} /></td>
                  <td className="px-2 py-2 text-right">{campaign._count.campaignLeads}</td>
                  <td className="px-2 py-2 text-right">{campaign._count.emailLogs}</td>
                  <td className="px-2 py-2 text-right">{campaign._count.replies}</td>
                  <td className="px-2 py-2 text-right text-slate-500">{new Date(campaign.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {showBuyer ? (
        <BuyerModal
          domainId={id}
          onClose={() => setShowBuyer(false)}
          onSaved={async () => {
            setShowBuyer(false);
            await load();
          }}
        />
      ) : null}

      {showOffer ? (
        <OfferModal
          domainId={id}
          buyers={domain.buyers}
          onClose={() => setShowOffer(false)}
          onSaved={async () => {
            setShowOffer(false);
            await load();
          }}
        />
      ) : null}

      {showSale ? (
        <SaleModal
          domainId={id}
          defaultPrice={domain.recommendedPrice || domain.estimatedValue}
          onClose={() => setShowSale(false)}
          onSaved={async () => {
            setShowSale(false);
            setMessage("Sale recorded. Pipeline updated.");
            await load();
            await refresh();
          }}
        />
      ) : null}
    </OutboundShell>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-slate-200">{children}</div>
    </div>
  );
}

function BuyerRow({ buyer, domainId, onChange }: { buyer: DomainBuyer; domainId: string; onChange: () => void }) {
  return (
    <li className="rounded-md border border-slate-800 bg-slate-950 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-slate-100 truncate">{buyer.businessName}</div>
          <div className="text-[11px] text-slate-500">
            {[buyer.contactName, buyer.email, buyer.location].filter(Boolean).join(" · ")}
          </div>
          {buyer.notes ? <p className="mt-1 text-xs text-slate-400">{buyer.notes}</p> : null}
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Score</div>
          <div className="text-sm font-bold text-slate-200">{buyer.buyerScore}</div>
          <button
            onClick={async () => {
              if (!confirm(`Remove ${buyer.businessName}?`)) return;
              try {
                await fetchOutbound(`/api/domains/${domainId}/buyers/${buyer.id}`, { method: "DELETE" });
                onChange();
              } catch { /* ignore */ }
            }}
            className="mt-1 text-rose-300 hover:text-rose-200"
            title="Remove"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </li>
  );
}

function OfferRow({ offer, domainId, onChange }: { offer: DomainOffer; domainId: string; onChange: () => void }) {
  return (
    <li className="rounded-md border border-slate-800 bg-slate-950 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-slate-100">
            ${offer.amount.toLocaleString()} {offer.currency}
            <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500">{offer.direction}</span>
          </div>
          <div className="text-[11px] text-slate-500">
            {offer.buyer?.businessName || "Anonymous buyer"} · {new Date(offer.receivedAt).toLocaleDateString()}
          </div>
          {offer.notes ? <p className="mt-1 text-xs text-slate-400">{offer.notes}</p> : null}
        </div>
        <div className="text-right shrink-0">
          <StatusBadge value={offer.status} />
          <button
            onClick={async () => {
              if (!confirm("Delete this offer?")) return;
              try {
                await fetchOutbound(`/api/domains/${domainId}/offers/${offer.id}`, { method: "DELETE" });
                onChange();
              } catch { /* ignore */ }
            }}
            className="mt-1 text-rose-300 hover:text-rose-200"
            title="Remove"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </li>
  );
}

function BuyerModal({ domainId, onClose, onSaved }: { domainId: string; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [form, setForm] = useState({
    businessName: "",
    contactName: "",
    email: "",
    phone: "",
    location: "",
    industry: "",
    buyerScore: "50",
    notes: "",
    status: "Prospect",
  });
  const [error, setError] = useState("");

  const submit = async () => {
    if (!form.businessName.trim()) { setError("Business name is required."); return; }
    try {
      await fetchOutbound(`/api/domains/${domainId}/buyers`, {
        method: "POST",
        body: JSON.stringify({ ...form, buyerScore: Number(form.buyerScore) || 0 }),
      });
      await onSaved();
    } catch (err: any) {
      setError(err?.message || "Save failed.");
    }
  };

  return (
    <Modal title="Add buyer" onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Business name" required>
          <input
            value={form.businessName}
            onChange={(event) => setForm((c) => ({ ...c, businessName: event.target.value }))}
            className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100"
          />
        </Field>
        <Field label="Contact name">
          <input value={form.contactName} onChange={(event) => setForm((c) => ({ ...c, contactName: event.target.value }))} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100" />
        </Field>
        <Field label="Email">
          <input value={form.email} onChange={(event) => setForm((c) => ({ ...c, email: event.target.value }))} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100" />
        </Field>
        <Field label="Phone">
          <input value={form.phone} onChange={(event) => setForm((c) => ({ ...c, phone: event.target.value }))} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100" />
        </Field>
        <Field label="Location">
          <input value={form.location} onChange={(event) => setForm((c) => ({ ...c, location: event.target.value }))} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100" />
        </Field>
        <Field label="Industry">
          <input value={form.industry} onChange={(event) => setForm((c) => ({ ...c, industry: event.target.value }))} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100" />
        </Field>
        <Field label="Buyer score (0-100)">
          <input type="number" min={0} max={100} value={form.buyerScore} onChange={(event) => setForm((c) => ({ ...c, buyerScore: event.target.value }))} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100" />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(event) => setForm((c) => ({ ...c, status: event.target.value }))} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100">
            <option value="Prospect">Prospect</option>
            <option value="Contacted">Contacted</option>
            <option value="Interested">Interested</option>
            <option value="Negotiating">Negotiating</option>
            <option value="Won">Won</option>
            <option value="Lost">Lost</option>
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Notes">
            <textarea value={form.notes} onChange={(event) => setForm((c) => ({ ...c, notes: event.target.value }))} className="min-h-20 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
          </Field>
        </div>
      </div>
      {error ? <div className="mt-2 text-xs text-rose-300">{error}</div> : null}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={onClose} className="h-10 px-3 rounded-lg border border-slate-800 bg-slate-900 text-sm text-slate-300">Cancel</button>
        <button onClick={() => void submit()} className="h-10 px-3 rounded-lg border border-indigo-400/30 bg-indigo-500/15 text-sm text-indigo-100">Add buyer</button>
      </div>
    </Modal>
  );
}

function OfferModal({ domainId, buyers, onClose, onSaved }: { domainId: string; buyers: DomainBuyer[]; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [form, setForm] = useState({
    amount: "",
    direction: "INBOUND",
    status: "OPEN",
    buyerId: "",
    notes: "",
    receivedAt: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState("");

  const submit = async () => {
    if (!form.amount) { setError("Offer amount is required."); return; }
    try {
      await fetchOutbound(`/api/domains/${domainId}/offers`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(form.amount),
          direction: form.direction,
          status: form.status,
          buyerId: form.buyerId || undefined,
          notes: form.notes || undefined,
          receivedAt: form.receivedAt,
        }),
      });
      await onSaved();
    } catch (err: any) {
      setError(err?.message || "Save failed.");
    }
  };

  return (
    <Modal title="Record offer" onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Amount (USD)" required>
          <input type="number" min={0} value={form.amount} onChange={(event) => setForm((c) => ({ ...c, amount: event.target.value }))} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100" />
        </Field>
        <Field label="Direction">
          <select value={form.direction} onChange={(event) => setForm((c) => ({ ...c, direction: event.target.value }))} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100">
            <option value="INBOUND">Inbound (from buyer)</option>
            <option value="COUNTER">Counter offer</option>
            <option value="OUTBOUND">Outbound (we offered)</option>
          </select>
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(event) => setForm((c) => ({ ...c, status: event.target.value }))} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100">
            <option value="OPEN">Open</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="REJECTED">Rejected</option>
            <option value="WITHDRAWN">Withdrawn</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </Field>
        <Field label="Buyer">
          <select value={form.buyerId} onChange={(event) => setForm((c) => ({ ...c, buyerId: event.target.value }))} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100">
            <option value="">— Anonymous —</option>
            {buyers.map((buyer) => (
              <option key={buyer.id} value={buyer.id}>{buyer.businessName}</option>
            ))}
          </select>
        </Field>
        <Field label="Received at">
          <input type="date" value={form.receivedAt} onChange={(event) => setForm((c) => ({ ...c, receivedAt: event.target.value }))} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100" />
        </Field>
        <div className="md:col-span-2">
          <Field label="Notes">
            <textarea value={form.notes} onChange={(event) => setForm((c) => ({ ...c, notes: event.target.value }))} className="min-h-20 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
          </Field>
        </div>
      </div>
      {error ? <div className="mt-2 text-xs text-rose-300">{error}</div> : null}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={onClose} className="h-10 px-3 rounded-lg border border-slate-800 bg-slate-900 text-sm text-slate-300">Cancel</button>
        <button onClick={() => void submit()} className="h-10 px-3 rounded-lg border border-indigo-400/30 bg-indigo-500/15 text-sm text-indigo-100">Save offer</button>
      </div>
    </Modal>
  );
}

function SaleModal({ domainId, defaultPrice, onClose, onSaved }: { domainId: string; defaultPrice?: number | null; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [form, setForm] = useState({
    buyerName: "",
    buyerEmail: "",
    salePrice: defaultPrice ? String(defaultPrice) : "",
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
      await fetchOutbound(`/api/domains/${domainId}/sale`, {
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
    <Modal title="Record sale" onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Buyer name" required>
          <input value={form.buyerName} onChange={(event) => setForm((c) => ({ ...c, buyerName: event.target.value }))} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100" />
        </Field>
        <Field label="Buyer email">
          <input value={form.buyerEmail} onChange={(event) => setForm((c) => ({ ...c, buyerEmail: event.target.value }))} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100" />
        </Field>
        <Field label="Sale price (USD)" required>
          <input type="number" value={form.salePrice} onChange={(event) => setForm((c) => ({ ...c, salePrice: event.target.value }))} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100" />
        </Field>
        <Field label="Sale date">
          <input type="date" value={form.saleDate} onChange={(event) => setForm((c) => ({ ...c, saleDate: event.target.value }))} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100" />
        </Field>
        <Field label="Marketplace">
          <input value={form.marketplace} onChange={(event) => setForm((c) => ({ ...c, marketplace: event.target.value }))} placeholder="Dan, Sedo, direct" className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100" />
        </Field>
        <Field label="Fees">
          <input type="number" value={form.fees} onChange={(event) => setForm((c) => ({ ...c, fees: event.target.value }))} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100" />
        </Field>
        <div className="md:col-span-2">
          <Field label="Notes">
            <textarea value={form.notes} onChange={(event) => setForm((c) => ({ ...c, notes: event.target.value }))} className="min-h-20 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
          </Field>
        </div>
      </div>
      {error ? <div className="mt-2 text-xs text-rose-300">{error}</div> : null}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={onClose} className="h-10 px-3 rounded-lg border border-slate-800 bg-slate-900 text-sm text-slate-300">Cancel</button>
        <button onClick={() => void submit()} className="h-10 px-3 rounded-lg border border-emerald-400/30 bg-emerald-500/15 text-sm text-emerald-200">Save sale</button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl mt-12 rounded-lg border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-900 px-5 py-3">
          <h3 className="text-base font-black text-slate-100">{title}</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-md text-slate-400 hover:text-slate-100 inline-flex items-center justify-center">
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
      {required ? <span className="text-rose-300">*</span> : null}
      <div className="mt-1">{children}</div>
    </label>
  );
}
