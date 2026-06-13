"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  ExternalLink,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Send,
  Sparkles,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import { OutboundShell } from "@/components/OutboundShell"
import { GlassCard, StatusBadge } from "@/components/ui"
;
import { fetchOutbound, type AcquisitionResult, type AcquisitionTier, type BulkScanResult, type ChatMessage } from "@/lib/outbound";

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<AcquisitionTier, { label: string; color: string; bg: string; badge: string }> = {
  STRONG_BUY: { label: "Strong Buy", color: "text-success", bg: "bg-success/5 border-success/30", badge: "bg-success text-bg" },
  BUY: { label: "Buy", color: "text-brand", bg: "bg-brand/5 border-brand/30", badge: "bg-brand text-bg" },
  WATCHLIST: { label: "Watchlist", color: "text-copper", bg: "bg-copper/5 border-copper/30", badge: "bg-copper text-bg" },
  SPECULATIVE: { label: "Speculative", color: "text-text-muted", bg: "bg-surface-2 border-border", badge: "bg-surface-2 text-text-muted" },
  AVOID: { label: "Avoid", color: "text-danger", bg: "bg-danger/5 border-danger/30", badge: "bg-danger text-bg" },
};

const EXAMPLE_DOMAINS = `TexasCarVendor.com
MiamiRoofing.com
ChicagoDentist.com
DallasPlumber.com
AtlantaLawyer.com
SeattleCleaning.com
NashvilleSolar.com
BostonRealtor.com
PhoenixHVAC.com
LasVegasMover.com`;

// ─── Main page ────────────────────────────────────────────────────────────────

type ScanState = "idle" | "scanning" | "done" | "error";

export default function AcquisitionAdvisorPage() {
  const [input, setInput] = useState("");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [result, setResult] = useState<BulkScanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [tierFilter, setTierFilter] = useState<AcquisitionTier | "all">("all");
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const [chatDomain, setChatDomain] = useState<AcquisitionResult | null>(null);
  const [addingDomain, setAddingDomain] = useState<string | null>(null);
  const [watchingDomain, setWatchingDomain] = useState<string | null>(null);
  const [archiveDomain, setArchiveDomain] = useState<string | null>(null);

  const domainList = input
    .split(/[\n,]+/)
    .map(d => d.trim())
    .filter(Boolean);

  const scan = async () => {
    if (domainList.length === 0) return;
    if (domainList.length > 100) { setErrorMsg("Maximum 100 domains per scan."); return; }
    setScanState("scanning");
    setErrorMsg("");
    setResult(null);
    setElapsed(0);

    // Tick the elapsed counter every second
    const startTime = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);

    try {
      // Start background job — returns immediately with jobId
      const { jobId } = await fetchOutbound<{ jobId: string }>("/api/domains/acquisition-scan", {
        method: "POST",
        body: JSON.stringify({ domains: domainList }),
      });

      // Poll every 3 seconds until done (max 4 minutes)
      for (let attempt = 0; attempt < 80; attempt++) {
        await new Promise(r => setTimeout(r, 3000));
        const poll = await fetchOutbound<{ status: string; result?: BulkScanResult; error?: string }>(
          `/api/domains/acquisition-scan/status/${jobId}`
        );
        if (poll.status === "done" && poll.result) {
          clearInterval(timer);
          setResult(poll.result);
          setScanState("done");
          return;
        }
        if (poll.status === "error") {
          throw new Error(poll.error || "Scan failed on server.");
        }
      }
      throw new Error("Scan timed out after 4 minutes.");
    } catch (err: any) {
      clearInterval(timer);
      setErrorMsg(err?.message || "Scan failed. Check your connection and API keys.");
      setScanState("error");
    }
  };

  const addToPortfolio = async (domain: string) => {
    setAddingDomain(domain);
    try {
      await fetchOutbound("/api/domains", { method: "POST", body: JSON.stringify({ name: domain }) });
    } catch { /* ignore dup errors */ }
    finally { setAddingDomain(null); }
  };

  const addToWatchlist = async (r: AcquisitionResult) => {
    setWatchingDomain(r.domain);
    const tierToReco: Record<string, string> = { STRONG_BUY: "BUY_NOW", BUY: "WAIT", WATCHLIST: "MONITOR", SPECULATIVE: "MONITOR", AVOID: "AVOID" };
    try {
      await fetchOutbound("/api/watchlist", {
        method: "POST",
        body: JSON.stringify({
          domainName: r.domain,
          priority: r.recommendation.tier === "STRONG_BUY" || r.recommendation.tier === "BUY" ? "HIGH" : "MEDIUM",
          addedFrom: "acquisition_advisor",
          brandScore: r.analysis.brandBreakdown.overall,
          marketScore: r.analysis.geoScore,
          acquisitionScore: r.recommendation.confidence,
          estimatedValue: r.analysis.domainValue.expected,
          aiRecommendation: tierToReco[r.recommendation.tier] || "MONITOR",
          aiReasoning: r.recommendation.reasoning,
        }),
      });
    } catch { /* ignore dup */ }
    finally { setWatchingDomain(null); }
  };

  const exportCsv = () => {
    if (!result) return;
    const rows = [
      ["Rank", "Domain", "Tier", "Confidence", "Brand", "Buyers (High)", "Market Score", "Buy Max", "Target Sale", "ROI", "Hold", "Reasoning"],
      ...result.results.map(r => [
        r.rank,
        r.domain,
        r.recommendation.tier,
        r.recommendation.confidence,
        r.analysis.brandBreakdown.overall,
        r.analysis.buyerPool.high,
        r.analysis.geoScore,
        r.recommendation.suggestedBuyMax,
        r.recommendation.targetSalePrice,
        r.recommendation.roiPotential,
        r.recommendation.estimatedHold,
        `"${r.recommendation.reasoning.replace(/"/g, "'")}"`,
      ]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `acquisition-scan-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = result?.results.filter(r => tierFilter === "all" || r.recommendation.tier === tierFilter) ?? [];

  return (
    <OutboundShell
      title="Domain Acquisition Advisor"
      eyebrow="Investment Intelligence"
      subtitle="AI-powered investment analysis — scan any list of domains, get ranked buy/avoid recommendations with full reasoning."
      actions={
        result ? (
          <>
            <button onClick={exportCsv} className="h-10 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text hover:bg-surface-2 inline-flex items-center gap-2 transition-colors">
              <Download className="h-4 w-4" /> Export CSV
            </button>
            <button onClick={() => { setResult(null); setScanState("idle"); setInput(""); }} className="h-10 px-3 rounded-lg border border-border bg-surface text-sm text-text-muted hover:text-text hover:bg-surface-2 inline-flex items-center gap-2 transition-colors">
              <Search className="h-4 w-4" /> New scan
            </button>
          </>
        ) : null
      }
    >
      {/* Input section */}
      {scanState !== "done" && (
        <div className="max-w-3xl">
          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-text">Domain list</label>
              <button
                onClick={() => setInput(EXAMPLE_DOMAINS)}
                className="text-xs text-brand hover:text-brand-hover underline"
              >
                Load examples
              </button>
            </div>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={"Paste domains — one per line:\nTexasCarVendor.com\nMiamiRoofing.com\nChicagoDentist.com"}
              rows={10}
              className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm text-text font-mono placeholder-text-faint outline-none focus:border-brand resize-y transition-colors"
            />
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-text-muted">
                {domainList.length > 0
                  ? `${domainList.length} domain${domainList.length !== 1 ? "s" : ""} ready · max 100`
                  : "Paste domain names above (with or without TLD)"}
              </div>
              <button
                onClick={() => void scan()}
                disabled={domainList.length === 0 || scanState === "scanning"}
                className="h-10 px-5 rounded-lg bg-brand text-sm font-bold text-bg hover:bg-brand-hover inline-flex items-center gap-2 disabled:opacity-50 shadow-[0_0_12px_rgba(20,184,166,0.3)] transition-colors"
              >
                <Sparkles className="h-4 w-4" />
                Analyze {domainList.length > 0 ? `${domainList.length} domains` : ""}
              </button>
            </div>
          </GlassCard>

          {/* How it works */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: <BarChart3 className="h-5 w-5 text-brand" />, title: "Market Intelligence", body: "DNS TLD checks, buyer pool estimation, brand scoring, geo market analysis" },
              { icon: <Bot className="h-5 w-5 text-copper" />, title: "AI Dossier Review", body: "NVIDIA AI evaluates each domain like a professional domain investor + broker" },
              { icon: <TrendingUp className="h-5 w-5 text-success" />, title: "Ranked Results", body: "Strong Buy → Avoid rankings with confidence scores, ROI estimates, and reasoning" },
            ].map(item => (
              <GlassCard key={item.title} className="p-4">
                <div className="flex items-center gap-2 mb-2">{item.icon}<span className="text-sm font-bold text-text">{item.title}</span></div>
                <p className="text-xs text-text-muted">{item.body}</p>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* Loading state */}
      {scanState === "scanning" && (
        <div className="mt-8 flex flex-col items-center gap-4 py-16">
          <Loader2 className="h-10 w-10 text-brand animate-spin" />
          <div className="text-base font-bold text-text">
            Analyzing {domainList.length} domains…
            <span className="ml-2 text-sm font-normal text-text-muted">{elapsed}s</span>
          </div>
          <div className="w-64 h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all duration-1000"
              style={{ width: `${Math.min(95, (elapsed / 90) * 100)}%` }}
            />
          </div>
          <p className="text-sm text-text-muted max-w-md text-center">
            DNS checks · brand &amp; market scoring · AI investment analysis
            <br />
            <span className="text-xs">Typically 30–90 seconds depending on list size</span>
          </p>
          <div className="flex flex-wrap gap-2 mt-2 max-w-lg justify-center">
            {domainList.slice(0, 12).map(d => (
              <span key={d} className="text-xs text-text-muted font-mono bg-surface border border-border rounded px-2 py-0.5">{d}</span>
            ))}
            {domainList.length > 12 && <span className="text-xs text-text-muted">+{domainList.length - 12} more</span>}
          </div>
        </div>
      )}

      {/* Error */}
      {scanState === "error" && (
        <div className="mt-6 rounded-lg border border-danger/30 bg-danger/10 px-5 py-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold text-danger">Scan failed</div>
            <p className="text-xs text-danger/80 mt-1">{errorMsg}</p>
            <button onClick={() => { setScanState("idle"); setErrorMsg(""); }} className="mt-3 text-xs text-danger underline">Try again</button>
          </div>
        </div>
      )}

      {/* Results */}
      {scanState === "done" && result && (
        <div className="space-y-5">
          {/* Summary bar */}
          <GlassCard className="p-5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-sm font-bold text-text">{result.summary.total} domains analyzed</div>
              <div className="flex flex-wrap gap-2">
                {(["STRONG_BUY", "BUY", "WATCHLIST", "SPECULATIVE", "AVOID"] as AcquisitionTier[]).map(tier => {
                  const countKey = tier.toLowerCase().replace("_", "") as keyof typeof result.summary;
                  const count = result.summary[countKey] as number;
                  const cfg = TIER_CONFIG[tier];
                  if (count === 0) return null;
                  return (
                    <button
                      key={tier}
                      onClick={() => setTierFilter(tierFilter === tier ? "all" : tier)}
                      className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-bold border transition-all ${
                        tierFilter === tier ? cfg.bg + " " + cfg.color : "border-border bg-surface text-text-muted hover:text-text"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${cfg.badge}`} />
                      {cfg.label}: {count}
                    </button>
                  );
                })}
              </div>
              {tierFilter !== "all" && (
                <button onClick={() => setTierFilter("all")} className="text-xs text-text-muted hover:text-text flex items-center gap-1 transition-colors">
                  <X className="h-3 w-3" /> Clear filter
                </button>
              )}
            </div>
          </GlassCard>

          {/* Domain cards */}
          <div className="space-y-3">
            {filtered.length === 0 && (
              <div className="rounded-lg border border-border p-8 text-center text-sm text-text-muted">
                No domains match this tier filter.
              </div>
            )}
            {filtered.map(r => (
              <DomainCard
                key={r.domain}
                result={r}
                expanded={expandedDomain === r.domain}
                onToggle={() => setExpandedDomain(expandedDomain === r.domain ? null : r.domain)}
                onChat={() => setChatDomain(r)}
                onAddToPortfolio={() => void addToPortfolio(r.domain)}
                onAddToWatchlist={() => void addToWatchlist(r)}
                onCheckArchive={() => setArchiveDomain(r.domain)}
                adding={addingDomain === r.domain}
                watching={watchingDomain === r.domain}
              />
            ))}
          </div>
        </div>
      )}

      {/* AI Chat Modal */}
      {chatDomain && (
        <InvestorChatModal
          result={chatDomain}
          onClose={() => setChatDomain(null)}
        />
      )}

      {/* Archive History Modal */}
      {archiveDomain && (
        <ArchiveHistoryModal
          domain={archiveDomain}
          onClose={() => setArchiveDomain(null)}
        />
      )}
    </OutboundShell>
  );
}

// ─── Domain card ──────────────────────────────────────────────────────────────

function DomainCard({
  result, expanded, onToggle, onChat, onAddToPortfolio, onAddToWatchlist, onCheckArchive, adding, watching,
}: {
  result: AcquisitionResult;
  expanded: boolean;
  onToggle: () => void;
  onChat: () => void;
  onAddToPortfolio: () => void;
  onAddToWatchlist: () => void;
  onCheckArchive: () => void;
  adding: boolean;
  watching: boolean;
}) {
  const { domain, analysis: a, recommendation: r, rank } = result;
  const cfg = TIER_CONFIG[r.tier];

  return (
    <div className={`rounded-lg border ${cfg.bg} transition-all`}>
      {/* Card header */}
      <div className="p-4 flex flex-wrap items-center gap-3">
        {/* Rank */}
        <div className="h-8 w-8 rounded-full bg-surface-2 flex items-center justify-center text-xs font-black text-text-muted shrink-0">
          #{rank}
        </div>

        {/* Domain + tier */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-black text-text font-mono">{domain}</span>
            <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-black ${cfg.badge}`}>
              {cfg.label}
            </span>
            <span className="text-xs text-text-muted">{r.confidence}% confidence</span>
          </div>
          <div className="mt-0.5 text-xs text-text-muted">
            {a.parsed.niche || a.parsed.industry || "Unknown niche"} {a.parsed.geo ? `· ${a.parsed.geo}` : ""}
          </div>
        </div>

        {/* Key metrics */}
        <div className="flex items-center gap-4 text-center shrink-0">
          <MetricPill label="Brand" value={`${a.brandBreakdown.overall}`} />
          <MetricPill label="Buyers" value={a.buyerPool.high.toLocaleString()} sub="high-intent" />
          <MetricPill label="Market" value={`${a.geoScore}`} />
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-text-muted uppercase tracking-wide">Buy max</div>
            <div className="text-sm font-black text-text">${r.suggestedBuyMax.toLocaleString()}</div>
            <div className="text-[10px] text-success">Target ${r.targetSalePrice.toLocaleString()}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={onChat} title="Ask AI investor" className="h-8 w-8 rounded-lg border border-copper/30 bg-copper/10 text-copper hover:text-copper flex items-center justify-center transition-colors">
            <MessageSquare className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onAddToWatchlist}
            disabled={watching}
            title="Add to watchlist"
            className="h-8 w-8 rounded-lg border border-copper/30 bg-copper/10 text-copper hover:text-copper flex items-center justify-center transition-colors"
          >
            {watching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onCheckArchive}
            title="Check Wayback Machine archive history"
            className="h-8 w-8 rounded-lg border border-border bg-surface text-text-muted hover:text-brand flex items-center justify-center transition-colors"
          >
            <Clock className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onAddToPortfolio}
            disabled={adding}
            title="Add to portfolio"
            className="h-8 px-2 rounded-lg border border-brand/30 bg-brand-soft text-brand hover:bg-brand/20 flex items-center gap-1 text-xs transition-colors"
          >
            {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Portfolio
          </button>
          <button onClick={onToggle} className="h-8 w-8 rounded-lg border border-border bg-surface text-text-muted hover:text-text flex items-center justify-center transition-colors">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          {/* Reasoning */}
          <div className="rounded-md border border-border bg-surface p-3">
            <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">AI Reasoning</div>
            <p className="text-sm text-text-muted">{r.reasoning}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Attractors */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-text-muted mb-2">Why it's attractive</div>
              <ul className="space-y-1">
                {r.attractors.map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-success">
                    <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />{a}
                  </li>
                ))}
                {r.attractors.length === 0 && <li className="text-xs text-text-muted">—</li>}
              </ul>
            </div>

            {/* Risks */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-text-muted mb-2">Risks</div>
              <ul className="space-y-1">
                {r.risks.map((risk, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-danger">
                    <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />{risk}
                  </li>
                ))}
                {r.risks.length === 0 && <li className="text-xs text-success">No major risks identified</li>}
              </ul>
            </div>

            {/* Target buyers */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-text-muted mb-2">Target buyers</div>
              <ul className="space-y-1">
                {r.targetBuyers.map((b, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-text-muted">
                    <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />{b}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Investment metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <InfoBox label="Hold Period" value={r.estimatedHold} />
            <InfoBox label="ROI Potential" value={r.roiPotential} />
            <InfoBox label="Buyer Pool" value={`${a.buyerPool.total.toLocaleString()}`} sub={`${a.buyerPool.high.toLocaleString()} high-intent`} />
            <InfoBox label="Competition" value={`${a.competitionScore}/100`} sub={a.competitionScore < 45 ? "Low" : a.competitionScore < 70 ? "Moderate" : "High"} />
            <InfoBox label="TLDs Available" value={`${a.tldMatrix.filter(t => t.status === "available").length}/${a.tldMatrix.length}`} />
          </div>

          {/* TLD matrix mini */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-text-muted mb-2">TLD Status</div>
            <div className="flex flex-wrap gap-1.5">
              {a.tldMatrix.map(t => (
                <span key={t.tld} className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                  t.status === "available"
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-border bg-surface text-text-muted"
                }`}>
                  {t.tld} {t.status === "available" ? "✓" : "✗"}
                </span>
              ))}
            </div>
          </div>

          {/* Portfolio link */}
          <div className="flex justify-end">
            <button
              onClick={onAddToPortfolio}
              disabled={adding}
              className="h-8 px-3 rounded-lg border border-brand/30 bg-brand-soft text-xs text-brand hover:bg-brand/20 inline-flex items-center gap-1.5 transition-colors"
            >
              {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Add {domain} to Portfolio
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricPill({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-text-muted uppercase tracking-wide">{label}</div>
      <div className="text-sm font-black text-text">{value}</div>
      {sub && <div className="text-[10px] text-text-muted">{sub}</div>}
    </div>
  );
}

function InfoBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-black text-text">{value}</div>
      {sub && <div className="text-[11px] text-text-muted">{sub}</div>}
    </div>
  );
}

// ─── Archive history modal ────────────────────────────────────────────────────

interface ArchiveSnapshot {
  timestamp: string;
  status: string;
}

function ArchiveHistoryModal({ domain, onClose }: { domain: string; onClose: () => void }) {
  const [state, setState] = useState<"loading" | "done" | "empty" | "error">("loading");
  const [snapshots, setSnapshots] = useState<ArchiveSnapshot[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchOutbound<string[][]>(`/api/domains/archive-check?domain=${encodeURIComponent(domain)}`)
      .then(rows => {
        if (!Array.isArray(rows) || rows.length <= 1) { setState("empty"); return; }
        setSnapshots(rows.slice(1).map(r => ({ timestamp: r[0], status: r[1] })));
        setState("done");
      })
      .catch(() => {
        setError("Could not reach the archive service. Try again in a moment.");
        setState("error");
      });
  }, [domain]);

  const fmt = (ts: string) => {
    try {
      return new Date(`${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)}`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    } catch { return ts.slice(0, 8); }
  };

  const active = snapshots.filter(s => s.status === "200");
  const wasUsed = active.length > 0;
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg glass rounded-2xl border border-border shadow-[0_24px_64px_rgba(0,0,0,.5)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand" />
              <h3 className="text-base font-black text-text">Wayback Machine History</h3>
            </div>
            <div className="mt-0.5 text-xs font-mono text-text-muted">{domain}</div>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-md flex items-center justify-center text-text-muted hover:text-text transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {state === "loading" && (
            <div className="flex items-center justify-center gap-3 py-10 text-text-muted">
              <Loader2 className="h-5 w-5 animate-spin text-brand" />
              Checking archive…
            </div>
          )}

          {state === "error" && (
            <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>
          )}

          {state === "empty" && (
            <div className="text-center py-8">
              <div className="text-3xl mb-3">🆕</div>
              <div className="text-base font-black text-text">No archive records found</div>
              <p className="text-sm text-text-muted mt-2 max-w-sm mx-auto">
                This domain has no history in the Wayback Machine — it was likely never registered or was never crawled. This is a <strong className="text-success">clean slate</strong>.
              </p>
              <a href={`https://web.archive.org/web/*/${domain}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 text-xs text-brand hover:text-brand-hover">
                <ExternalLink className="h-3 w-3" /> Verify on Wayback Machine
              </a>
            </div>
          )}

          {state === "done" && (
            <div className="space-y-4">
              {/* Summary banner */}
              <div className={`rounded-lg border p-4 ${wasUsed ? "border-copper/30 bg-copper/5" : "border-border bg-surface-2"}`}>
                <div className={`text-sm font-bold ${wasUsed ? "text-copper" : "text-text-faint"}`}>
                  {wasUsed
                    ? `⚠️ This domain was previously used as an active website`
                    : `ℹ️ Domain has archive records but no active pages detected`}
                </div>
                <p className="text-xs text-text-muted mt-1">
                  {wasUsed
                    ? "Check the history below before purchasing — prior content may affect SEO reputation or brand perception."
                    : "The domain may have had parking pages or redirect-only setups."}
                </p>
                <div className="grid grid-cols-3 gap-3 mt-3 text-center">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-text-muted">First seen</div>
                    <div className="text-xs font-bold text-text mt-0.5">{first ? fmt(first.timestamp) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-text-muted">Last seen</div>
                    <div className="text-xs font-bold text-text mt-0.5">{last ? fmt(last.timestamp) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-text-muted">Active pages</div>
                    <div className={`text-xs font-bold mt-0.5 ${wasUsed ? "text-copper" : "text-text-muted"}`}>{active.length}</div>
                  </div>
                </div>
              </div>

              {/* Snapshot list */}
              <div>
                <div className="text-[10px] uppercase tracking-wide text-text-muted mb-2">Snapshot history ({snapshots.length} shown)</div>
                <div className="space-y-0.5 max-h-44 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                  {snapshots.map((s, i) => (
                    <a
                      key={i}
                      href={`https://web.archive.org/web/${s.timestamp}/${domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2 text-xs hover:bg-surface-2 group transition-colors"
                    >
                      <span className="text-text-muted">{fmt(s.timestamp)}</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold text-[11px] ${
                          s.status === "200" ? "text-success" :
                          s.status === "301" || s.status === "302" ? "text-copper" :
                          s.status === "404" ? "text-danger" : "text-text-muted"
                        }`}>{s.status}</span>
                        <ExternalLink className="h-3 w-3 text-text-faint group-hover:text-brand transition" />
                      </div>
                    </a>
                  ))}
                </div>
                <div className="text-[11px] text-text-faint mt-1">
                  200 = active site · 301/302 = redirect · 404 = not found
                </div>
              </div>

              <a
                href={`https://web.archive.org/web/*/${domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 h-9 w-full rounded-lg border border-brand/30 bg-brand-soft text-sm text-brand hover:bg-brand/20 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                View full timeline on Wayback Machine
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Investor chat modal ──────────────────────────────────────────────────────

function InvestorChatModal({ result, onClose }: { result: AcquisitionResult; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const QUICK_QUESTIONS = [
    "Should I buy this domain?",
    "What price should I pay?",
    "How many buyers exist?",
    "How long should I hold it?",
    "What businesses should I contact?",
    "What are the main risks?",
  ];

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setLoading(true);

    try {
      const response = await fetchOutbound<{ reply: string }>("/api/domains/acquisition-scan-chat", {
        method: "POST",
        body: JSON.stringify({
          domain: result.domain,
          analysis: result.analysis,
          recommendation: result.recommendation,
          message: text,
          history: messages.slice(-8),
        }),
      });
      setMessages([...newHistory, { role: "assistant", content: response.reply }]);
    } catch {
      setMessages([...newHistory, { role: "assistant", content: "Could not reach AI right now. Try again in a moment." }]);
    } finally {
      setLoading(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  const cfg = TIER_CONFIG[result.recommendation.tier];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-2xl glass rounded-2xl border border-border shadow-[0_24px_64px_rgba(0,0,0,.5)] flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-copper" />
              <span className="text-base font-black text-text">AI Investor Chat</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
            </div>
            <div className="mt-0.5 text-xs text-text-muted font-mono">{result.domain}</div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg border border-border text-text-muted flex items-center justify-center hover:text-text transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quick questions */}
        {messages.length === 0 && (
          <div className="px-5 py-4 border-b border-border shrink-0">
            <div className="text-[11px] uppercase tracking-wide text-text-muted mb-2">Quick questions</div>
            <div className="flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map(q => (
                <button key={q} onClick={() => void send(q)} className="h-7 px-3 rounded-full border border-border bg-surface text-xs text-text-muted hover:border-brand hover:text-brand transition">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-sm text-text-muted text-center py-8">
              Ask anything about <strong className="text-text font-mono">{result.domain}</strong> — pricing, buyers, hold strategy, risks, or outreach tactics.
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-brand text-bg"
                  : "bg-surface border border-border text-text"
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-surface border border-border rounded-xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-text-faint animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-text-faint animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-text-faint animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="px-5 py-4 border-t border-border shrink-0">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
              placeholder="Ask about this domain investment…"
              className="flex-1 h-10 rounded-lg border border-border bg-bg px-3 text-sm text-text outline-none focus:border-brand transition-colors"
            />
            <button
              onClick={() => void send(input)}
              disabled={!input.trim() || loading}
              className="h-10 w-10 rounded-lg bg-brand text-bg hover:bg-brand-hover flex items-center justify-center disabled:opacity-50 shadow-[0_0_12px_rgba(20,184,166,0.3)] transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
