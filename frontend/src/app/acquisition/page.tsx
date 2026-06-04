"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronUp,
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
import { OutboundShell } from "@/components/OutboundShell";
import { fetchOutbound, type AcquisitionResult, type AcquisitionTier, type BulkScanResult, type ChatMessage } from "@/lib/outbound";

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<AcquisitionTier, { label: string; color: string; bg: string; badge: string }> = {
  STRONG_BUY: { label: "Strong Buy", color: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-400/30", badge: "bg-emerald-500 text-white" },
  BUY: { label: "Buy", color: "text-indigo-300", bg: "bg-indigo-500/10 border-indigo-400/30", badge: "bg-indigo-500 text-white" },
  WATCHLIST: { label: "Watchlist", color: "text-amber-300", bg: "bg-amber-500/10 border-amber-400/30", badge: "bg-amber-500 text-white" },
  SPECULATIVE: { label: "Speculative", color: "text-orange-300", bg: "bg-orange-500/10 border-orange-400/30", badge: "bg-orange-500 text-white" },
  AVOID: { label: "Avoid", color: "text-rose-400", bg: "bg-rose-500/10 border-rose-400/30", badge: "bg-rose-600 text-white" },
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
      subtitle="AI-powered investment analysis — scan any list of domains, get ranked buy/avoid recommendations with full reasoning."
      actions={
        result ? (
          <>
            <button onClick={exportCsv} className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/70 text-sm text-slate-700 dark:text-slate-300 inline-flex items-center gap-2">
              <Download className="h-4 w-4" /> Export CSV
            </button>
            <button onClick={() => { setResult(null); setScanState("idle"); setInput(""); }} className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/70 text-sm text-slate-700 dark:text-slate-300 inline-flex items-center gap-2">
              <Search className="h-4 w-4" /> New scan
            </button>
          </>
        ) : null
      }
    >
      {/* Input section */}
      {scanState !== "done" && (
        <div className="max-w-3xl">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/35 p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-slate-800 dark:text-slate-200">Domain list</label>
              <button
                onClick={() => setInput(EXAMPLE_DOMAINS)}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline"
              >
                Load examples
              </button>
            </div>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={"Paste domains — one per line:\nTexasCarVendor.com\nMiamiRoofing.com\nChicagoDentist.com"}
              rows={10}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 font-mono placeholder-slate-400 outline-none focus:border-indigo-400 resize-y"
            />
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                {domainList.length > 0
                  ? `${domainList.length} domain${domainList.length !== 1 ? "s" : ""} ready · max 100`
                  : "Paste domain names above (with or without TLD)"}
              </div>
              <button
                onClick={() => void scan()}
                disabled={domainList.length === 0 || scanState === "scanning"}
                className="h-10 px-5 rounded-lg border border-indigo-400/30 bg-indigo-500/15 text-sm text-indigo-200 inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                Analyze {domainList.length > 0 ? `${domainList.length} domains` : ""}
              </button>
            </div>
          </div>

          {/* How it works */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: <BarChart3 className="h-5 w-5 text-indigo-400" />, title: "Market Intelligence", body: "DNS TLD checks, buyer pool estimation, brand scoring, geo market analysis" },
              { icon: <Bot className="h-5 w-5 text-violet-400" />, title: "AI Dossier Review", body: "NVIDIA AI evaluates each domain like a professional domain investor + broker" },
              { icon: <TrendingUp className="h-5 w-5 text-emerald-400" />, title: "Ranked Results", body: "Strong Buy → Avoid rankings with confidence scores, ROI estimates, and reasoning" },
            ].map(item => (
              <div key={item.title} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/35 p-4">
                <div className="flex items-center gap-2 mb-2">{item.icon}<span className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.title}</span></div>
                <p className="text-xs text-slate-500">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading state */}
      {scanState === "scanning" && (
        <div className="mt-8 flex flex-col items-center gap-4 py-16">
          <Loader2 className="h-10 w-10 text-indigo-400 animate-spin" />
          <div className="text-base font-bold text-slate-800 dark:text-slate-200">
            Analyzing {domainList.length} domains…
            <span className="ml-2 text-sm font-normal text-slate-500">{elapsed}s</span>
          </div>
          <div className="w-64 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
              style={{ width: `${Math.min(95, (elapsed / 90) * 100)}%` }}
            />
          </div>
          <p className="text-sm text-slate-500 max-w-md text-center">
            DNS checks · brand &amp; market scoring · AI investment analysis
            <br />
            <span className="text-xs">Typically 30–90 seconds depending on list size</span>
          </p>
          <div className="flex flex-wrap gap-2 mt-2 max-w-lg justify-center">
            {domainList.slice(0, 12).map(d => (
              <span key={d} className="text-xs text-slate-500 font-mono bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2 py-0.5">{d}</span>
            ))}
            {domainList.length > 12 && <span className="text-xs text-slate-500">+{domainList.length - 12} more</span>}
          </div>
        </div>
      )}

      {/* Error */}
      {scanState === "error" && (
        <div className="mt-6 rounded-lg border border-rose-400/30 bg-rose-500/10 px-5 py-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold text-rose-300">Scan failed</div>
            <p className="text-xs text-rose-400 mt-1">{errorMsg}</p>
            <button onClick={() => { setScanState("idle"); setErrorMsg(""); }} className="mt-3 text-xs text-rose-300 underline">Try again</button>
          </div>
        </div>
      )}

      {/* Results */}
      {scanState === "done" && result && (
        <div className="space-y-5">
          {/* Summary bar */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/35 p-5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{result.summary.total} domains analyzed</div>
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
                        tierFilter === tier ? cfg.bg + " " + cfg.color : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-500"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${cfg.badge}`} />
                      {cfg.label}: {count}
                    </button>
                  );
                })}
              </div>
              {tierFilter !== "all" && (
                <button onClick={() => setTierFilter("all")} className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1">
                  <X className="h-3 w-3" /> Clear filter
                </button>
              )}
            </div>
          </div>

          {/* Domain cards */}
          <div className="space-y-3">
            {filtered.length === 0 && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
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
    </OutboundShell>
  );
}

// ─── Domain card ──────────────────────────────────────────────────────────────

function DomainCard({
  result, expanded, onToggle, onChat, onAddToPortfolio, onAddToWatchlist, adding, watching,
}: {
  result: AcquisitionResult;
  expanded: boolean;
  onToggle: () => void;
  onChat: () => void;
  onAddToPortfolio: () => void;
  onAddToWatchlist: () => void;
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
        <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xs font-black text-slate-600 dark:text-slate-400 shrink-0">
          #{rank}
        </div>

        {/* Domain + tier */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-black text-slate-900 dark:text-slate-50 font-mono">{domain}</span>
            <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-black ${cfg.badge}`}>
              {cfg.label}
            </span>
            <span className="text-xs text-slate-500">{r.confidence}% confidence</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {a.parsed.niche || a.parsed.industry || "Unknown niche"} {a.parsed.geo ? `· ${a.parsed.geo}` : ""}
          </div>
        </div>

        {/* Key metrics */}
        <div className="flex items-center gap-4 text-center shrink-0">
          <MetricPill label="Brand" value={`${a.brandBreakdown.overall}`} />
          <MetricPill label="Buyers" value={a.buyerPool.high.toLocaleString()} sub="high-intent" />
          <MetricPill label="Market" value={`${a.geoScore}`} />
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Buy max</div>
            <div className="text-sm font-black text-slate-800 dark:text-slate-200">${r.suggestedBuyMax.toLocaleString()}</div>
            <div className="text-[10px] text-emerald-500">Target ${r.targetSalePrice.toLocaleString()}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={onChat} title="Ask AI investor" className="h-8 w-8 rounded-lg border border-violet-400/30 bg-violet-500/10 text-violet-300 hover:text-violet-200 flex items-center justify-center">
            <MessageSquare className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onAddToWatchlist}
            disabled={watching}
            title="Add to watchlist"
            className="h-8 w-8 rounded-lg border border-amber-400/30 bg-amber-500/10 text-amber-300 hover:text-amber-200 flex items-center justify-center"
          >
            {watching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onAddToPortfolio}
            disabled={adding}
            title="Add to portfolio"
            className="h-8 px-2 rounded-lg border border-indigo-400/30 bg-indigo-500/10 text-indigo-300 hover:text-indigo-200 flex items-center gap-1 text-xs"
          >
            {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Portfolio
          </button>
          <button onClick={onToggle} className="h-8 w-8 rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 text-slate-500 flex items-center justify-center">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-4">
          {/* Reasoning */}
          <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">AI Reasoning</div>
            <p className="text-sm text-slate-700 dark:text-slate-300">{r.reasoning}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Attractors */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Why it's attractive</div>
              <ul className="space-y-1">
                {r.attractors.map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />{a}
                  </li>
                ))}
                {r.attractors.length === 0 && <li className="text-xs text-slate-500">—</li>}
              </ul>
            </div>

            {/* Risks */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Risks</div>
              <ul className="space-y-1">
                {r.risks.map((risk, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-rose-500 dark:text-rose-400">
                    <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />{risk}
                  </li>
                ))}
                {r.risks.length === 0 && <li className="text-xs text-emerald-400">No major risks identified</li>}
              </ul>
            </div>

            {/* Target buyers */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Target buyers</div>
              <ul className="space-y-1">
                {r.targetBuyers.map((b, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-400">
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
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">TLD Status</div>
            <div className="flex flex-wrap gap-1.5">
              {a.tldMatrix.map(t => (
                <span key={t.tld} className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                  t.status === "available"
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-400"
                    : "border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-500"
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
              className="h-8 px-3 rounded-lg border border-indigo-400/30 bg-indigo-500/10 text-xs text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1.5"
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
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-black text-slate-800 dark:text-slate-200">{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

function InfoBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-black text-slate-800 dark:text-slate-200">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
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
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-violet-400" />
              <span className="text-base font-black text-slate-900 dark:text-slate-50">AI Investor Chat</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
            </div>
            <div className="mt-0.5 text-xs text-slate-500 font-mono">{result.domain}</div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 flex items-center justify-center hover:text-slate-700 dark:hover:text-slate-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quick questions */}
        {messages.length === 0 && (
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Quick questions</div>
            <div className="flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map(q => (
                <button key={q} onClick={() => void send(q)} className="h-7 px-3 rounded-full border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-400 transition">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-sm text-slate-500 text-center py-8">
              Ask anything about <strong className="text-slate-700 dark:text-slate-300 font-mono">{result.domain}</strong> — pricing, buyers, hold strategy, risks, or outreach tactics.
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-indigo-500 text-white"
                  : "bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
              placeholder="Ask about this domain investment…"
              className="flex-1 h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => void send(input)}
              disabled={!input.trim() || loading}
              className="h-10 w-10 rounded-lg border border-indigo-400/30 bg-indigo-500/15 text-indigo-300 hover:text-indigo-200 flex items-center justify-center disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
