"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  Globe2,
  Loader2,
  Plus,
  RefreshCcw,
  Send,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { EmptyState, MetricCard, OutboundShell } from "@/components/OutboundShell";
import { GlassCard, PillButton, ScoreRing, StatusBadge } from "@/components/ui";
import { useDomainContext } from "@/lib/domainContext";
import {
  DOMAIN_STATUSES,
  fetchOutbound,
  type BuyerDiscoveryParams,
  type ChatMessage,
  type DomainAnalysis,
  type DomainBuyer,
  type DomainDetail,
  type DomainOffer,
} from "@/lib/outbound";

type Tab = "overview" | "intelligence";

export default function DomainDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const { setActiveDomainId, refresh } = useDomainContext();
  const [domain, setDomain] = useState<DomainDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
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

  useEffect(() => { void load(); }, [load]);

  const totalOffersValue = useMemo(
    () => (domain?.offers || []).reduce((sum, offer) => sum + (offer.amount || 0), 0),
    [domain]
  );

  if (!id) return null;

  if (loading && !domain) {
    return (
      <OutboundShell title="Loading domain…" subtitle="">
        <div className="p-6 text-sm text-text-muted">Loading…</div>
      </OutboundShell>
    );
  }

  if (!domain) {
    return (
      <OutboundShell title="Domain not found" subtitle="">
        <Link href="/portfolio" className="text-brand underline text-sm">← Back to portfolio</Link>
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
    setAnalyzing(true);
    setMessage("Running full intelligence analysis… this may take 15–30 seconds.");
    try {
      await fetchOutbound(`/api/domains/${id}/analyze`, { method: "POST" });
      setMessage("Intelligence report updated.");
      await load();
      await refresh();
      setTab("intelligence");
    } catch {
      setMessage("Analysis failed — check your NVIDIA API key in Settings.");
    } finally {
      setAnalyzing(false);
    }
  };

  const launchBuyerDiscovery = async () => {
    try {
      const p = await fetchOutbound<BuyerDiscoveryParams>(`/api/domains/${id}/buyer-discovery`);
      const query = new URLSearchParams({ keyword: p.keyword, domainIdea: p.domainName, cityState: p.cityState }).toString();
      setActiveDomainId(domain.id);
      router.push(`/dashboard?${query}`);
    } catch {
      setMessage("Could not derive buyer-discovery parameters.");
    }
  };

  const intel = domain.metadata as DomainAnalysis | null | undefined;

  return (
    <OutboundShell
      title={domain.name}
      eyebrow="Domain Workspace"
      subtitle={intel?.aiReport?.executiveSummary || domain.aiSummary || "Domain detail and CRM workspace."}
      actions={
        <>
          <Link href="/portfolio" className="h-9 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text hover:bg-surface-2 inline-flex items-center gap-2 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Portfolio
          </Link>
          <button onClick={useForWorkflows} className="h-9 px-3 rounded-lg border border-brand/30 bg-brand-soft text-sm text-brand hover:bg-brand/20 inline-flex items-center gap-2 transition-colors">
            <ArrowUpRight className="h-4 w-4" /> Use for workflows
          </button>
          <button onClick={launchBuyerDiscovery} className="h-9 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text hover:bg-surface-2 inline-flex items-center gap-2 transition-colors">
            <Users className="h-4 w-4" /> Find buyers
          </button>
          <button
            onClick={() => void reanalyze()}
            disabled={analyzing}
            className="h-9 px-3 rounded-lg border border-copper/30 bg-copper/15 text-sm text-copper hover:bg-copper/20 inline-flex items-center gap-2 disabled:opacity-60 transition-colors"
          >
            <Sparkles className="h-4 w-4" /> {analyzing ? "Analyzing…" : "Run analysis"}
          </button>
          <button onClick={() => void load()} className="h-9 w-9 rounded-lg border border-border bg-surface text-text-muted hover:text-text hover:bg-surface-2 inline-flex items-center justify-center transition-colors" title="Refresh">
            <RefreshCcw className="h-4 w-4" />
          </button>
        </>
      }
    >
      {message ? (
        <div className="mb-4 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-text-muted flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage("")} className="text-text-faint hover:text-text"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : null}

      {/* Score summary row */}
      <section className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <MetricCard label="Estimated value" value={`$${(domain.estimatedValue || 0).toLocaleString()}`} helper={domain.askingPrice != null ? `Your price $${domain.askingPrice.toLocaleString()}` : `Rec $${(domain.recommendedPrice || 0).toLocaleString()}`} />
        <MetricCard label="Branding" value={`${domain.brandingScore}/100`} helper="memorability" />
        <MetricCard label="Buyer demand" value={`${domain.buyerDemandScore}/100`} helper="intent fit" />
        <MetricCard label="Lead opportunity" value={`${domain.leadOpportunityScore}/100`} helper="SMB density" />
        <MetricCard label="Sale probability" value={`${domain.saleProbability}%`} helper="AI estimate" />
        <MetricCard label="Open offers" value={(domain.offers || []).filter((o) => o.status === "OPEN").length} helper={`$${totalOffersValue.toLocaleString()} on table`} />
      </section>

      {/* Tabs */}
      <div className="mt-6 flex gap-2">
        {(["overview", "intelligence"] as Tab[]).map((t) => (
          <PillButton key={t} active={tab === t} onClick={() => setTab(t)}>
            {t === "intelligence" ? "Intelligence Report" : "Overview"}
          </PillButton>
        ))}
      </div>

      {tab === "overview" ? (
        <OverviewTab
          domain={domain}
          id={id}
          onChangeStatus={changeStatus}
          onLoad={load}
          onShowBuyer={() => setShowBuyer(true)}
          onShowOffer={() => setShowOffer(true)}
          onShowSale={() => setShowSale(true)}
        />
      ) : (
        <IntelligenceTab intel={intel} onRunAnalysis={reanalyze} analyzing={analyzing} />
      )}

      {showBuyer ? (
        <BuyerModal domainId={id} onClose={() => setShowBuyer(false)} onSaved={async () => { setShowBuyer(false); await load(); }} />
      ) : null}
      {showOffer ? (
        <OfferModal domainId={id} buyers={domain.buyers} onClose={() => setShowOffer(false)} onSaved={async () => { setShowOffer(false); await load(); }} />
      ) : null}
      {showSale ? (
        <SaleModal
          domainId={id}
          defaultPrice={domain.askingPrice ?? domain.recommendedPrice ?? domain.estimatedValue}
          onClose={() => setShowSale(false)}
          onSaved={async () => { setShowSale(false); setMessage("Sale recorded."); await load(); await refresh(); }}
        />
      ) : null}
    </OutboundShell>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  domain, id, onChangeStatus, onLoad, onShowBuyer, onShowOffer, onShowSale,
}: {
  domain: DomainDetail;
  id: string;
  onChangeStatus: (s: string) => void;
  onLoad: () => void;
  onShowBuyer: () => void;
  onShowOffer: () => void;
  onShowSale: () => void;
}) {
  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1.4fr] gap-5">
        <GlassCard className="p-5">
          <h2 className="text-base font-black text-text">Pipeline status</h2>
          <div className="mt-2"><StatusBadge status={domain.status} /></div>
          <div className="mt-4 flex flex-wrap gap-2">
            {DOMAIN_STATUSES.map((status) => (
              <PillButton
                key={status}
                active={domain.status === status}
                onClick={() => onChangeStatus(status)}
              >
                {status}
              </PillButton>
            ))}
          </div>
          {domain.status !== "Sold" ? (
            <button onClick={onShowSale} className="mt-4 h-10 px-3 rounded-lg border border-success/30 bg-success/15 text-sm text-success hover:bg-success/20 inline-flex items-center gap-2 transition-colors">
              <DollarSign className="h-4 w-4" /> Mark as sold
            </button>
          ) : null}
          {domain.sale ? (
            <div className="mt-4 rounded-lg border border-success/20 bg-success/5 p-3 text-xs text-text-muted">
              <div className="font-bold text-success">Sold for ${domain.sale.salePrice.toLocaleString()} {domain.sale.currency}</div>
              <div className="mt-1">Buyer: {domain.sale.buyerName}</div>
              {domain.sale.marketplace ? <div>Marketplace: {domain.sale.marketplace}</div> : null}
              {domain.sale.notes ? <div className="mt-2 italic">{domain.sale.notes}</div> : null}
            </div>
          ) : null}
        </GlassCard>

        <GlassCard className="p-5">
          <h2 className="text-base font-black text-text">AI recommendations</h2>
          <p className="mt-1 text-xs text-text-muted">Generated from the domain name; re-run after edits.</p>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-text-muted">
            <Block label="Niche">{domain.niche || "—"}</Block>
            <Block label="Industry">{domain.industry || "—"}</Block>
            <Block label="Geo">{[domain.city, domain.state].filter(Boolean).join(", ") || "—"}</Block>
            <Block label="Best industries">{(domain.bestIndustries || []).join(", ") || "—"}</Block>
            <Block label="Best cities">{(domain.bestCities || []).join(", ") || "—"}</Block>
            <Block label="Recommended price">${(domain.recommendedPrice || 0).toLocaleString()}</Block>
            <Block label="Your asking price">{domain.askingPrice != null ? `$${domain.askingPrice.toLocaleString()}` : "Not set"}</Block>
          </div>
          <div className="mt-4 rounded-lg border border-border bg-bg p-3 text-xs text-text-muted">
            <div className="text-[10px] uppercase tracking-wide text-text-muted">Outreach strategy</div>
            <p className="mt-1">{domain.outreachStrategy || "Pitch the domain as a brandable, geo-anchored landing page for local SMBs."}</p>
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <GlassCard className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-text flex items-center gap-2">
              <Users className="h-4 w-4 text-brand" /> Interested buyers
            </h2>
            <button onClick={onShowBuyer} className="h-8 px-3 rounded-lg border border-border bg-bg text-xs text-text-muted hover:text-text hover:bg-surface-2 inline-flex items-center gap-1 transition-colors">
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          {domain.buyers.length === 0 ? (
            <div className="mt-4"><EmptyState title="No buyers tracked" body="Run buyer discovery or add prospects manually." /></div>
          ) : (
            <ul className="mt-3 space-y-2">
              {domain.buyers.map((buyer) => <BuyerRow key={buyer.id} buyer={buyer} domainId={id} onChange={onLoad} />)}
            </ul>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-text flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-brand" /> Negotiation timeline
            </h2>
            <button onClick={onShowOffer} className="h-8 px-3 rounded-lg border border-border bg-bg text-xs text-text-muted hover:text-text hover:bg-surface-2 inline-flex items-center gap-1 transition-colors">
              <Plus className="h-3 w-3" /> Record offer
            </button>
          </div>
          {domain.offers.length === 0 ? (
            <div className="mt-4"><EmptyState title="No offers yet" body="Log every inbound offer, counter, and rejection." /></div>
          ) : (
            <ul className="mt-3 space-y-2">
              {domain.offers.map((offer) => <OfferRow key={offer.id} offer={offer} domainId={id} onChange={onLoad} />)}
            </ul>
          )}
        </GlassCard>
      </div>

      <InvestorChatSection domainId={id} domainName={domain.name} metadata={domain.metadata as DomainAnalysis | null | undefined} />

      <GlassCard className="p-5">
        <h2 className="text-base font-black text-text">Linked campaigns</h2>
        {domain.campaigns.length === 0 ? (
          <div className="mt-4"><EmptyState title="No campaigns yet" body="Use the selector and head to Campaigns to launch outreach from this domain." /></div>
        ) : (
          <table className="mt-4 min-w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-2 py-2 text-left font-bold">Name</th>
                <th className="px-2 py-2 text-left font-bold">Status</th>
                <th className="px-2 py-2 text-right font-bold">Leads</th>
                <th className="px-2 py-2 text-right font-bold">Sent</th>
                <th className="px-2 py-2 text-right font-bold">Replies</th>
                <th className="px-2 py-2 text-right font-bold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {domain.campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="px-2 py-2 text-text">{c.name}</td>
                  <td className="px-2 py-2"><StatusBadge status={c.status} /></td>
                  <td className="px-2 py-2 text-right text-text-muted">{c._count.campaignLeads}</td>
                  <td className="px-2 py-2 text-right text-text-muted">{c._count.emailLogs}</td>
                  <td className="px-2 py-2 text-right text-text-muted">{c._count.replies}</td>
                  <td className="px-2 py-2 text-right text-text-muted">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>
    </div>
  );
}

// ─── Intelligence tab ─────────────────────────────────────────────────────────

const RECO_COLORS: Record<string, string> = {
  high_priority: "border-success/30 bg-success/10 text-success",
  contact_buyers: "border-brand/30 bg-brand/10 text-brand",
  increase_price: "border-copper/30 bg-copper/10 text-copper",
  reduce_price: "border-danger/30 bg-danger/10 text-danger",
  hold: "border-border bg-surface-2 text-text-muted",
  low_priority: "border-border bg-surface-2 text-text-faint",
};

const PRIORITY_COLOR: Record<string, string> = {
  high: "text-success",
  medium: "text-copper",
  low: "text-text-muted",
};

function IntelligenceTab({ intel, onRunAnalysis, analyzing }: { intel: DomainAnalysis | null | undefined; onRunAnalysis: () => void; analyzing: boolean }) {
  if (!intel) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface-2/40 p-12 text-center">
        <Sparkles className="h-10 w-10 mx-auto text-copper mb-4" />
        <div className="text-base font-black text-text">No intelligence report yet</div>
        <p className="mt-2 text-sm text-text-muted max-w-md mx-auto">
          Click <strong>Run analysis</strong> to discover potential buyers, check TLD availability, find similar domains, and get an AI-powered value estimate.
        </p>
        <button
          onClick={onRunAnalysis}
          disabled={analyzing}
          className="mt-6 h-10 px-5 rounded-lg border border-copper/30 bg-copper/15 text-sm text-copper hover:bg-copper/20 inline-flex items-center gap-2 disabled:opacity-60 transition-colors"
        >
          <Sparkles className="h-4 w-4" /> {analyzing ? "Analyzing…" : "Run analysis now"}
        </button>
      </div>
    );
  }

  const { buyerPool, tldMatrix, similarDomains, businesses, brandBreakdown, geoScore, competitionScore, domainValue, aiReport, parsed } = intel;

  return (
    <div className="mt-5 space-y-5">
      {/* AI Report banner */}
      <div className="rounded-2xl border border-brand/20 bg-brand-soft p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-brand" />
              <span className="text-[11px] font-bold text-brand uppercase tracking-wider">AI Executive Summary</span>
            </div>
            <p className="text-sm text-text leading-relaxed">{aiReport.executiveSummary}</p>
            {aiReport.keyInsights.length > 0 && (
              <ul className="mt-3 space-y-1">
                {aiReport.keyInsights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-text-muted">
                    <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-brand" />
                    {insight}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className={`inline-flex h-7 items-center rounded-full border px-3 text-xs font-bold ${RECO_COLORS[aiReport.recommendation] || RECO_COLORS.hold}`}>
              {aiReport.recommendationLabel}
            </span>
            <div className="text-[11px] text-text-muted">Outreach priority:
              <span className={`ml-1 font-bold ${PRIORITY_COLOR[aiReport.outreachPriority]}`}>
                {aiReport.outreachPriority.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Scores row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <ScoreCard label="Brand Strength" score={brandBreakdown.overall}>
          <div className="mt-2 space-y-1">
            <ScoreBar label="Memorability" value={brandBreakdown.memorability} max={25} />
            <ScoreBar label="Keywords" value={brandBreakdown.keywordRelevance} max={25} />
            <ScoreBar label="Commercial" value={brandBreakdown.commercialIntent} max={25} />
            <ScoreBar label="Geo Anchor" value={brandBreakdown.geoRelevance} max={25} />
          </div>
        </ScoreCard>

        <ScoreCard label="Geo Market" score={geoScore}>
          <p className="mt-2 text-[11px] text-text-muted">
            {parsed.city ? `City-specific: ${parsed.city}` : parsed.state ? `State: ${parsed.state}` : "National / no geo"}
          </p>
        </ScoreCard>

        <ScoreCard label="Competition" score={competitionScore}>
          <p className="mt-2 text-[11px] text-text-muted">
            {competitionScore < 40 ? "Low — few alternative domains" : competitionScore < 70 ? "Moderate competition" : "High — many alternatives registered"}
          </p>
        </ScoreCard>

        <GlassCard className="p-4">
          <div className="text-[11px] uppercase tracking-wider font-bold text-text-muted">Value Range</div>
          <div className="mt-3 h-2 rounded-full overflow-hidden bg-surface-2">
            <div className="h-full w-full rounded-full bg-gradient-to-r from-brand to-copper" />
          </div>
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Conservative</span>
              <span className="font-bold text-text-muted">${domainValue.conservative.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-faint font-medium">Expected</span>
              <span className="font-black text-text">${domainValue.expected.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Premium</span>
              <span className="font-bold text-copper">${domainValue.premium.toLocaleString()}</span>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Buyer pool */}
      <GlassCard className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-brand" />
          <h2 className="text-base font-black text-text">Estimated Buyer Pool</h2>
          <span className="text-2xl font-black text-brand ml-auto">{buyerPool.total.toLocaleString()}</span>
        </div>
        <div className="flex rounded-full overflow-hidden h-4 mb-3">
          <div className="bg-success" style={{ width: `${(buyerPool.high / buyerPool.total) * 100}%` }} title="High intent" />
          <div className="bg-copper" style={{ width: `${(buyerPool.medium / buyerPool.total) * 100}%` }} title="Medium intent" />
          <div className="bg-surface-2" style={{ width: `${(buyerPool.low / buyerPool.total) * 100}%` }} title="Low intent" />
        </div>
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-success" /><span className="text-text-muted">High Intent</span><strong className="text-text ml-1">{buyerPool.high.toLocaleString()}</strong></div>
          <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-copper" /><span className="text-text-muted">Medium</span><strong className="text-text ml-1">{buyerPool.medium.toLocaleString()}</strong></div>
          <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-surface-2" /><span className="text-text-muted">Low</span><strong className="text-text ml-1">{buyerPool.low.toLocaleString()}</strong></div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* TLD matrix */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe2 className="h-4 w-4 text-brand" />
            <h2 className="text-base font-black text-text">TLD Availability Matrix</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {tldMatrix.map((t) => (
              <div key={t.tld} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                t.status === "available"
                  ? "border-success/25 bg-success/5 text-success"
                  : "border-border bg-bg text-text-muted"
              }`}>
                <span className="font-mono font-bold">{t.tld}</span>
                <span className="flex items-center gap-1">
                  {t.status === "available"
                    ? <><CheckCircle2 className="h-3 w-3" /> Available</>
                    : <><XCircle className="h-3 w-3 text-danger" /> Registered</>}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Similar domains */}
        <GlassCard className="p-5">
          <h2 className="text-base font-black text-text mb-4">Similar Domains</h2>
          {similarDomains.length === 0 ? (
            <p className="text-xs text-text-muted">No similar domains generated.</p>
          ) : (
            <div className="space-y-2">
              {similarDomains.map((d) => (
                <div key={d.domain} className="flex items-center justify-between text-xs rounded-lg border border-border bg-bg px-3 py-2">
                  <div>
                    <span className="font-mono font-bold text-text">{d.domain}</span>
                    <span className="ml-2 text-text-muted">{d.reason}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-text-muted">{d.similarity}%</span>
                    {d.status === "available"
                      ? <span className="text-success font-bold">Available</span>
                      : <span className="text-danger font-bold">Taken</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Discovered businesses */}
      {businesses.length > 0 && (
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase className="h-4 w-4 text-brand" />
            <h2 className="text-base font-black text-text">Discovered Businesses</h2>
            <span className="text-xs text-text-muted">{businesses.length} found via Google Maps</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-2 py-2 text-left font-bold">Business</th>
                  <th className="px-2 py-2 text-left font-bold">Type</th>
                  <th className="px-2 py-2 text-left font-bold">Location</th>
                  <th className="px-2 py-2 text-right font-bold">Rating</th>
                  <th className="px-2 py-2 text-right font-bold">Buyer Score</th>
                  <th className="px-2 py-2 text-right font-bold">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {businesses.map((b, i) => (
                  <tr key={i}>
                    <td className="px-2 py-2">
                      <div className="font-medium text-text">{b.name}</div>
                      {b.website && (
                        <a href={b.website} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand hover:underline truncate max-w-[200px] block">
                          {b.website.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </td>
                    <td className="px-2 py-2 text-text-muted text-xs">{b.type || "—"}</td>
                    <td className="px-2 py-2 text-text-muted text-xs max-w-[160px] truncate">{b.address || "—"}</td>
                    <td className="px-2 py-2 text-right text-text-muted">
                      {b.rating ? `⭐ ${b.rating}` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-bold text-text">{b.buyerScore}</td>
                    <td className="px-2 py-2 text-right">
                      <span className={`text-xs font-bold ${PRIORITY_COLOR[b.priority]}`}>
                        {b.priority.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      <div className="text-[11px] text-text-muted text-right">
        Analysis generated {new Date(intel.analyzedAt).toLocaleString()} · DNS status reflects live lookup
      </div>
    </div>
  );
}

// ─── Score card components ────────────────────────────────────────────────────

function ScoreCard({ label, score, children }: { label: string; score: number; children?: React.ReactNode }) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wider font-bold text-text-muted">{label}</div>
        <ScoreRing score={score} size="md" />
      </div>
      {children}
    </GlassCard>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="flex justify-between text-[10px] text-text-muted mb-0.5">
        <span>{label}</span><span>{value}/{max}</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 text-text">{children}</div>
    </div>
  );
}

function BuyerRow({ buyer, domainId, onChange }: { buyer: DomainBuyer; domainId: string; onChange: () => void }) {
  return (
    <li className="rounded-lg border border-border bg-bg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-text truncate">{buyer.businessName}</div>
          <div className="text-[11px] text-text-muted">{[buyer.contactName, buyer.email, buyer.location].filter(Boolean).join(" · ")}</div>
          {buyer.notes ? <p className="mt-1 text-xs text-text-muted">{buyer.notes}</p> : null}
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-text-muted">Score</div>
          <div className="text-sm font-bold text-text">{buyer.buyerScore}</div>
          <button onClick={async () => {
            if (!confirm(`Remove ${buyer.businessName}?`)) return;
            try { await fetchOutbound(`/api/domains/${domainId}/buyers/${buyer.id}`, { method: "DELETE" }); onChange(); } catch { }
          }} className="mt-1 text-danger hover:text-danger/80" title="Remove"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
    </li>
  );
}

function OfferRow({ offer, domainId, onChange }: { offer: DomainOffer; domainId: string; onChange: () => void }) {
  return (
    <li className="rounded-lg border border-border bg-bg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-text">
            ${offer.amount.toLocaleString()} {offer.currency}
            <span className="ml-2 text-[10px] uppercase tracking-wide text-text-muted">{offer.direction}</span>
          </div>
          <div className="text-[11px] text-text-muted">
            {offer.buyer?.businessName || "Anonymous buyer"} · {new Date(offer.receivedAt).toLocaleDateString()}
          </div>
          {offer.notes ? <p className="mt-1 text-xs text-text-muted">{offer.notes}</p> : null}
        </div>
        <div className="text-right shrink-0">
          <StatusBadge status={offer.status} />
          <button onClick={async () => {
            if (!confirm("Delete this offer?")) return;
            try { await fetchOutbound(`/api/domains/${domainId}/offers/${offer.id}`, { method: "DELETE" }); onChange(); } catch { }
          }} className="mt-1 block text-danger hover:text-danger/80"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
    </li>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function BuyerModal({ domainId, onClose, onSaved }: { domainId: string; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [form, setForm] = useState({ businessName: "", contactName: "", email: "", phone: "", location: "", industry: "", buyerScore: "50", notes: "", status: "Prospect" });
  const [error, setError] = useState("");
  const submit = async () => {
    if (!form.businessName.trim()) { setError("Business name is required."); return; }
    try {
      await fetchOutbound(`/api/domains/${domainId}/buyers`, { method: "POST", body: JSON.stringify({ ...form, buyerScore: Number(form.buyerScore) || 0 }) });
      await onSaved();
    } catch (err: any) { setError(err?.message || "Save failed."); }
  };
  return (
    <Modal title="Add buyer" onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <MField label="Business name" required><input value={form.businessName} onChange={(e) => setForm((c) => ({ ...c, businessName: e.target.value }))} className={INPUT} /></MField>
        <MField label="Contact name"><input value={form.contactName} onChange={(e) => setForm((c) => ({ ...c, contactName: e.target.value }))} className={INPUT} /></MField>
        <MField label="Email"><input value={form.email} onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} className={INPUT} /></MField>
        <MField label="Phone"><input value={form.phone} onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))} className={INPUT} /></MField>
        <MField label="Location"><input value={form.location} onChange={(e) => setForm((c) => ({ ...c, location: e.target.value }))} className={INPUT} /></MField>
        <MField label="Industry"><input value={form.industry} onChange={(e) => setForm((c) => ({ ...c, industry: e.target.value }))} className={INPUT} /></MField>
        <MField label="Buyer score (0-100)"><input type="number" min={0} max={100} value={form.buyerScore} onChange={(e) => setForm((c) => ({ ...c, buyerScore: e.target.value }))} className={INPUT} /></MField>
        <MField label="Status">
          <select value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value }))} className={INPUT}>
            {["Prospect","Contacted","Interested","Negotiating","Won","Lost"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </MField>
        <div className="md:col-span-2"><MField label="Notes"><textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} className={TEXTAREA} /></MField></div>
      </div>
      {error ? <div className="mt-2 text-xs text-danger">{error}</div> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="h-10 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text hover:bg-surface-2 transition-colors">Cancel</button>
        <button onClick={() => void submit()} className="h-10 px-4 rounded-lg bg-brand text-sm font-bold text-bg hover:bg-brand-hover shadow-[0_0_12px_rgba(20,184,166,0.3)] transition-colors">Add buyer</button>
      </div>
    </Modal>
  );
}

function OfferModal({ domainId, buyers, onClose, onSaved }: { domainId: string; buyers: DomainBuyer[]; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [form, setForm] = useState({ amount: "", direction: "INBOUND", status: "OPEN", buyerId: "", notes: "", receivedAt: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState("");
  const submit = async () => {
    if (!form.amount) { setError("Amount is required."); return; }
    try {
      await fetchOutbound(`/api/domains/${domainId}/offers`, { method: "POST", body: JSON.stringify({ amount: Number(form.amount), direction: form.direction, status: form.status, buyerId: form.buyerId || undefined, notes: form.notes || undefined, receivedAt: form.receivedAt }) });
      await onSaved();
    } catch (err: any) { setError(err?.message || "Save failed."); }
  };
  return (
    <Modal title="Record offer" onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <MField label="Amount (USD)" required><input type="number" min={0} value={form.amount} onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))} className={INPUT} /></MField>
        <MField label="Direction">
          <select value={form.direction} onChange={(e) => setForm((c) => ({ ...c, direction: e.target.value }))} className={INPUT}>
            <option value="INBOUND">Inbound</option><option value="COUNTER">Counter</option><option value="OUTBOUND">Outbound</option>
          </select>
        </MField>
        <MField label="Status">
          <select value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value }))} className={INPUT}>
            <option value="OPEN">Open</option><option value="ACCEPTED">Accepted</option><option value="REJECTED">Rejected</option><option value="WITHDRAWN">Withdrawn</option><option value="EXPIRED">Expired</option>
          </select>
        </MField>
        <MField label="Buyer">
          <select value={form.buyerId} onChange={(e) => setForm((c) => ({ ...c, buyerId: e.target.value }))} className={INPUT}>
            <option value="">— Anonymous —</option>
            {buyers.map((b) => <option key={b.id} value={b.id}>{b.businessName}</option>)}
          </select>
        </MField>
        <MField label="Received at"><input type="date" value={form.receivedAt} onChange={(e) => setForm((c) => ({ ...c, receivedAt: e.target.value }))} className={INPUT} /></MField>
        <div className="md:col-span-2"><MField label="Notes"><textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} className={TEXTAREA} /></MField></div>
      </div>
      {error ? <div className="mt-2 text-xs text-danger">{error}</div> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="h-10 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text hover:bg-surface-2 transition-colors">Cancel</button>
        <button onClick={() => void submit()} className="h-10 px-4 rounded-lg bg-brand text-sm font-bold text-bg hover:bg-brand-hover shadow-[0_0_12px_rgba(20,184,166,0.3)] transition-colors">Save offer</button>
      </div>
    </Modal>
  );
}

function SaleModal({ domainId, defaultPrice, onClose, onSaved }: { domainId: string; defaultPrice?: number | null; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [form, setForm] = useState({ buyerName: "", buyerEmail: "", salePrice: defaultPrice ? String(defaultPrice) : "", saleDate: new Date().toISOString().slice(0, 10), marketplace: "", fees: "", notes: "" });
  const [error, setError] = useState("");
  const submit = async () => {
    if (!form.buyerName.trim() || !form.salePrice) { setError("Buyer name and sale price are required."); return; }
    try {
      await fetchOutbound(`/api/domains/${domainId}/sale`, { method: "POST", body: JSON.stringify({ buyerName: form.buyerName, buyerEmail: form.buyerEmail || undefined, salePrice: Number(form.salePrice), saleDate: form.saleDate || undefined, marketplace: form.marketplace || undefined, fees: form.fees ? Number(form.fees) : 0, notes: form.notes || undefined }) });
      await onSaved();
    } catch (err: any) { setError(err?.message || "Save failed."); }
  };
  return (
    <Modal title="Record sale" onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <MField label="Buyer name" required><input value={form.buyerName} onChange={(e) => setForm((c) => ({ ...c, buyerName: e.target.value }))} className={INPUT} /></MField>
        <MField label="Buyer email"><input value={form.buyerEmail} onChange={(e) => setForm((c) => ({ ...c, buyerEmail: e.target.value }))} className={INPUT} /></MField>
        <MField label="Sale price (USD)" required><input type="number" value={form.salePrice} onChange={(e) => setForm((c) => ({ ...c, salePrice: e.target.value }))} className={INPUT} /></MField>
        <MField label="Sale date"><input type="date" value={form.saleDate} onChange={(e) => setForm((c) => ({ ...c, saleDate: e.target.value }))} className={INPUT} /></MField>
        <MField label="Marketplace"><input value={form.marketplace} onChange={(e) => setForm((c) => ({ ...c, marketplace: e.target.value }))} placeholder="Dan, Sedo, direct" className={INPUT} /></MField>
        <MField label="Fees"><input type="number" value={form.fees} onChange={(e) => setForm((c) => ({ ...c, fees: e.target.value }))} className={INPUT} /></MField>
        <div className="md:col-span-2"><MField label="Notes"><textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} className={TEXTAREA} /></MField></div>
      </div>
      {error ? <div className="mt-2 text-xs text-danger">{error}</div> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="h-10 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text hover:bg-surface-2 transition-colors">Cancel</button>
        <button onClick={() => void submit()} className="h-10 px-4 rounded-lg bg-success text-sm font-bold text-bg hover:opacity-90 transition-opacity">Save sale</button>
      </div>
    </Modal>
  );
}

// ─── Investor chat section ────────────────────────────────────────────────────

const QUICK_QUESTIONS = [
  "Should I hold or sell now?",
  "What price should I ask?",
  "Who are the best buyers?",
  "How long should I hold?",
  "What are the main risks?",
];

function InvestorChatSection({
  domainId, domainName, metadata,
}: {
  domainId: string;
  domainName: string;
  metadata?: DomainAnalysis | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setLoading(true);
    try {
      const res = await fetchOutbound<{ reply: string }>(`/api/domains/${domainId}/investor-chat`, {
        method: "POST",
        body: JSON.stringify({ message: text, history: messages.slice(-8) }),
      });
      setMessages([...newHistory, { role: "assistant", content: res.reply }]);
    } catch {
      setMessages([...newHistory, { role: "assistant", content: "Could not reach AI right now." }]);
    } finally {
      setLoading(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  return (
    <div className="rounded-2xl border border-brand/20 bg-brand-soft p-5">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-brand" />
          <h2 className="text-base font-black text-text">Ask AI About This Domain</h2>
          {messages.length > 0 && <span className="text-xs text-brand">{messages.length} messages</span>}
        </div>
        <ChevronRight className={`h-4 w-4 text-text-muted transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Quick questions */}
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map(q => (
                <button key={q} onClick={() => void send(q)} className="h-7 px-3 rounded-full border border-brand/30 bg-brand/10 text-xs text-brand hover:bg-brand/20 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          <div className="space-y-3 max-h-72 overflow-y-auto">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-surface-2 text-text"
                    : "bg-brand-soft border border-brand/20 text-text"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-brand-soft border border-brand/20 rounded-xl px-4 py-3">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
              placeholder={`Ask about ${domainName}…`}
              className="flex-1 h-10 rounded-lg border border-border bg-bg px-3 text-sm text-text outline-none focus:border-brand transition-colors"
            />
            <button
              onClick={() => void send(input)}
              disabled={!input.trim() || loading}
              className="h-10 w-10 rounded-lg border border-brand/30 bg-brand-soft text-brand hover:bg-brand/20 flex items-center justify-center disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl mt-12 glass rounded-2xl border border-border shadow-[0_24px_64px_rgba(0,0,0,.5)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-black text-text">{title}</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 inline-flex items-center justify-center transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

const INPUT = "h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text outline-none focus:border-brand transition-colors";
const TEXTAREA = "min-h-20 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-brand transition-colors";

function MField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted">
      {label}{required ? <span className="text-danger"> *</span> : null}
      <div className="mt-1">{children}</div>
    </label>
  );
}
