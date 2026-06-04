// AI Domain Acquisition Advisor
// Evaluates candidate domains like a professional domain investor.
// Runs bulk scans, provides ranked acquisition recommendations, and
// powers the per-domain investor chat feature.
import { runDomainAnalysis, type DomainAnalysis, type DomainIntelInput } from './domainAnalyzer.js';
import { deriveDomainIntelligence } from './domains.js';
import { getNvidiaKey, nvidiaChat, extractJson } from './nvidiaAi.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AcquisitionTier = 'STRONG_BUY' | 'BUY' | 'WATCHLIST' | 'SPECULATIVE' | 'AVOID';

export const TIER_LABELS: Record<AcquisitionTier, string> = {
  STRONG_BUY: 'Strong Buy',
  BUY: 'Buy',
  WATCHLIST: 'Watchlist',
  SPECULATIVE: 'Speculative',
  AVOID: 'Avoid',
};

export const TIER_ORDER: Record<AcquisitionTier, number> = {
  STRONG_BUY: 1,
  BUY: 2,
  WATCHLIST: 3,
  SPECULATIVE: 4,
  AVOID: 5,
};

export interface AcquisitionRecommendation {
  tier: AcquisitionTier;
  confidence: number;
  reasoning: string;
  attractors: string[];
  risks: string[];
  targetBuyers: string[];
  suggestedBuyMax: number;
  targetSalePrice: number;
  estimatedHold: string;
  roiPotential: string;
}

export interface AcquisitionResult {
  domain: string;
  analysis: DomainAnalysis;
  recommendation: AcquisitionRecommendation;
  rank: number;
}

export interface BulkScanSummary {
  total: number;
  strongBuy: number;
  buy: number;
  watchlist: number;
  speculative: number;
  avoid: number;
  topOpportunities: AcquisitionResult[];
}

export interface BulkScanResult {
  results: AcquisitionResult[];
  summary: BulkScanSummary;
  scannedAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Rule-based fallback recommendation ──────────────────────────────────────

function ruleBasedRecommendation(domain: string, analysis: DomainAnalysis): AcquisitionRecommendation {
  const { brandBreakdown, geoScore, competitionScore, buyerPool, domainValue, parsed } = analysis;
  const brand = brandBreakdown.overall;
  const highBuyers = buyerPool.high;

  // Composite score weights: brand 30%, geo 30%, low-competition 20%, high-buyers 20%
  const composite = Math.round(
    brand * 0.3 +
    geoScore * 0.3 +
    (100 - competitionScore) * 0.2 +
    Math.min(100, highBuyers / 5) * 0.2
  );

  let tier: AcquisitionTier;
  if (composite >= 72 && highBuyers >= 300) tier = 'STRONG_BUY';
  else if (composite >= 58 && highBuyers >= 100) tier = 'BUY';
  else if (composite >= 44) tier = 'WATCHLIST';
  else if (composite >= 30) tier = 'SPECULATIVE';
  else tier = 'AVOID';

  const confidence = tier === 'AVOID' ? Math.round(65 + (30 - composite)) : Math.min(95, composite);
  const geo = parsed.geo;
  const niche = parsed.niche || parsed.industry;

  return {
    tier,
    confidence,
    reasoning: `Composite score ${composite}/100 — Brand: ${brand}/100, Market: ${geoScore}/100, Competition: ${competitionScore}/100, High-intent buyers: ${highBuyers.toLocaleString()}.`,
    attractors: [
      brand >= 70 ? `Strong brand score: ${brand}/100` : `Brand score: ${brand}/100`,
      highBuyers >= 200 ? `Large high-intent buyer pool: ${highBuyers.toLocaleString()} prospects` : `Buyer pool: ${buyerPool.total.toLocaleString()} total`,
      geo ? `Geographic anchor: ${geo}` : null,
      competitionScore < 45 ? 'Low competition landscape' : null,
    ].filter(Boolean) as string[],
    risks: [
      competitionScore >= 65 ? 'High competition — many alternative domains registered' : null,
      brand < 50 ? `Below-average brand strength (${brand}/100)` : null,
      buyerPool.total < 300 ? 'Small addressable buyer market' : null,
      !geo ? 'No geographic anchor reduces targeting precision' : null,
    ].filter(Boolean) as string[],
    targetBuyers: niche
      ? [`${niche} businesses${geo ? ` in ${geo}` : ''}`, 'Local service providers', 'Regional brands']
      : ['Local SMBs', 'Service businesses', 'Professional firms'],
    suggestedBuyMax: Math.round(domainValue.conservative * 0.65),
    targetSalePrice: domainValue.expected,
    estimatedHold: tier === 'STRONG_BUY' ? '3-9 months' : tier === 'BUY' ? '6-18 months' : '12-36 months',
    roiPotential: tier === 'STRONG_BUY' ? '3-10x' : tier === 'BUY' ? '2-5x' : '1-3x',
  };
}

// ─── Batch AI recommendations ─────────────────────────────────────────────────

const BATCH_SIZE = 15;

async function batchAiRecommendations(
  items: Array<{ domain: string; analysis: DomainAnalysis }>,
  userId?: string | null
): Promise<Map<string, AcquisitionRecommendation>> {
  const map = new Map<string, AcquisitionRecommendation>();

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    const dossierLines = batch.map(({ domain, analysis: a }) => {
      const takenTlds = a.tldMatrix.filter(t => t.status === 'registered').map(t => t.tld).join(', ') || 'none';
      const registeredSimilar = a.similarDomains.filter(s => s.status === 'registered').length;
      return [
        `Domain: ${domain}`,
        `  Industry: ${a.parsed.industry || 'Unknown'} / ${a.parsed.niche || 'Unknown'}`,
        `  Geo: ${a.parsed.geo || 'National'}`,
        `  Brand: ${a.brandBreakdown.overall}/100 (Memorability:${a.brandBreakdown.memorability} Keywords:${a.brandBreakdown.keywordRelevance} Commercial:${a.brandBreakdown.commercialIntent} Geo:${a.brandBreakdown.geoRelevance})`,
        `  Buyer Pool: ${a.buyerPool.total.toLocaleString()} total | ${a.buyerPool.high.toLocaleString()} high-intent | ${a.buyerPool.medium.toLocaleString()} medium`,
        `  Market Score: ${a.geoScore}/100 | Competition: ${a.competitionScore}/100`,
        `  Value Range: $${a.domainValue.conservative.toLocaleString()} – $${a.domainValue.premium.toLocaleString()}`,
        `  TLDs registered: ${takenTlds} | Similar domains registered: ${registeredSimilar}`,
      ].join('\n');
    });

    const prompt = `You are a professional domain investor with 15 years of experience in geo-domain speculation, SMB buyer identification, and domain brokerage. Think like a combination of domain broker + branding consultant + geo-market analyst.

Evaluate these domains as acquisition investments. Consider ALL factors: branding quality, buyer demand depth, geographic market size, competition level, resale timeline, and realistic ROI.

${dossierLines.join('\n\n')}

Investment tiers:
- STRONG_BUY: Exceptional. Clear demand, large buyer pool, strong brand, favorable competition, 3-10x ROI realistic within 12 months
- BUY: Solid investment. Good metrics, likely sale within 18 months, 2-5x ROI
- WATCHLIST: Decent domain but wait for right price, uncertain timeline, 1-3x potential
- SPECULATIVE: Risky. Some upside but uncertain demand or heavy alternatives
- AVOID: Poor investment. Weak demand, saturated market, or fundamentally unmarketable

Return ONLY this exact JSON (no prose, no markdown, no code fences):
{
  "recommendations": [
    {
      "domain": "<exact domain from input>",
      "tier": "STRONG_BUY|BUY|WATCHLIST|SPECULATIVE|AVOID",
      "confidence": <50-97 integer>,
      "reasoning": "<2-3 specific sentences explaining this exact domain's prospects>",
      "attractors": ["<specific strength 1>", "<specific strength 2>"],
      "risks": ["<specific risk 1>"],
      "targetBuyers": ["<specific buyer type 1>", "<specific buyer type 2>"],
      "suggestedBuyMax": <max price to pay in USD>,
      "targetSalePrice": <expected sale price in USD>,
      "estimatedHold": "<e.g. '3-9 months'>",
      "roiPotential": "<e.g. '3-8x'>"
    }
  ]
}`;

    try {
      const raw = await nvidiaChat(
        [{ role: 'user', content: prompt }],
        { maxTokens: 3000, temperature: 0.2, timeoutMs: 45000, userId }
      );
      const parsed = extractJson<{ recommendations: Array<Record<string, unknown>> }>(raw);
      for (const rec of (parsed.recommendations || [])) {
        if (typeof rec.domain === 'string' && typeof rec.tier === 'string') {
          map.set(rec.domain as string, {
            tier: rec.tier as AcquisitionTier,
            confidence: Number(rec.confidence) || 60,
            reasoning: String(rec.reasoning || ''),
            attractors: Array.isArray(rec.attractors) ? rec.attractors.map(String) : [],
            risks: Array.isArray(rec.risks) ? rec.risks.map(String) : [],
            targetBuyers: Array.isArray(rec.targetBuyers) ? rec.targetBuyers.map(String) : [],
            suggestedBuyMax: Number(rec.suggestedBuyMax) || 500,
            targetSalePrice: Number(rec.targetSalePrice) || 2000,
            estimatedHold: String(rec.estimatedHold || '12-24 months'),
            roiPotential: String(rec.roiPotential || '2-4x'),
          });
        }
      }
    } catch {
      // Fall back to rule-based for this batch
      for (const { domain, analysis } of batch) {
        map.set(domain, ruleBasedRecommendation(domain, analysis));
      }
    }
  }

  return map;
}

// ─── Bulk acquisition scan ────────────────────────────────────────────────────

function normalizeDomain(d: string): string {
  return d.trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').trim();
}

export async function runBulkAcquisitionScan(
  rawDomains: string[],
  userId?: string | null
): Promise<BulkScanResult> {
  const unique = Array.from(new Set(rawDomains.map(normalizeDomain).filter(Boolean)));

  // Step 1: Fast rule-based analysis for all domains in parallel
  // Skip Serper (expensive) and individual AI reports (will be replaced by batch)
  const analysisResults = await Promise.allSettled(
    unique.map(async (domain) => {
      const intel = deriveDomainIntelligence(domain);
      const analysis = await runDomainAnalysis(
        domain,
        {
          niche: intel.niche,
          industry: intel.industry,
          city: intel.city,
          state: intel.state,
          country: intel.country,
          brandingScore: intel.brandingScore,
          buyerDemandScore: intel.buyerDemandScore,
          leadOpportunityScore: intel.leadOpportunityScore,
          estimatedValue: intel.estimatedValue,
        },
        userId,
        { skipBusinessDiscovery: true, skipAiReport: true }
      );
      return { domain, analysis };
    })
  );

  const successful = analysisResults
    .filter((r): r is PromiseFulfilledResult<{ domain: string; analysis: DomainAnalysis }> => r.status === 'fulfilled')
    .map(r => r.value);

  // Step 2: Batch AI recommendations (one NVIDIA call per 15 domains)
  const hasNvidia = Boolean(await getNvidiaKey(userId).catch(() => undefined));
  const recommendationMap = hasNvidia
    ? await batchAiRecommendations(successful, userId)
    : new Map<string, AcquisitionRecommendation>();

  // Step 3: Merge, fill fallbacks, rank
  const results: AcquisitionResult[] = successful.map(({ domain, analysis }) => {
    const recommendation = recommendationMap.get(domain) ?? ruleBasedRecommendation(domain, analysis);
    return { domain, analysis, recommendation, rank: 0 };
  });

  results.sort((a, b) => {
    const tierDiff = TIER_ORDER[a.recommendation.tier] - TIER_ORDER[b.recommendation.tier];
    if (tierDiff !== 0) return tierDiff;
    return b.recommendation.confidence - a.recommendation.confidence;
  });

  results.forEach((r, i) => { r.rank = i + 1; });

  const summary: BulkScanSummary = {
    total: results.length,
    strongBuy: results.filter(r => r.recommendation.tier === 'STRONG_BUY').length,
    buy: results.filter(r => r.recommendation.tier === 'BUY').length,
    watchlist: results.filter(r => r.recommendation.tier === 'WATCHLIST').length,
    speculative: results.filter(r => r.recommendation.tier === 'SPECULATIVE').length,
    avoid: results.filter(r => r.recommendation.tier === 'AVOID').length,
    topOpportunities: results.slice(0, 10),
  };

  return { results, summary, scannedAt: new Date().toISOString() };
}

// ─── Per-domain investor chat ─────────────────────────────────────────────────

export async function investorChat(
  domainName: string,
  analysis: DomainAnalysis | null,
  recommendation: AcquisitionRecommendation | null,
  message: string,
  history: ChatMessage[],
  userId?: string | null
): Promise<string> {
  const buildSystemPrompt = () => {
    const a = analysis;
    const r = recommendation;
    return [
      'You are an expert domain investor and broker specializing in geo-domains and SMB buyer markets.',
      'You provide direct, data-driven investment advice. Be specific with numbers, timeframes, and actionable guidance.',
      'Keep answers concise (3-5 sentences) unless detailed analysis is requested.',
      '',
      `Domain: ${domainName}`,
      a ? `Industry: ${a.parsed.industry || 'Unknown'} / ${a.parsed.niche || 'Unknown'}` : '',
      a ? `Location: ${a.parsed.geo || 'National/Unknown'}` : '',
      a ? `Brand Score: ${a.brandBreakdown.overall}/100 (Memorability:${a.brandBreakdown.memorability}, Keywords:${a.brandBreakdown.keywordRelevance}, Commercial:${a.brandBreakdown.commercialIntent}, Geo:${a.brandBreakdown.geoRelevance})` : '',
      a ? `Buyer Pool: ${a.buyerPool.total.toLocaleString()} total (${a.buyerPool.high.toLocaleString()} high-intent, ${a.buyerPool.medium.toLocaleString()} medium)` : '',
      a ? `Market Score: ${a.geoScore}/100 | Competition: ${a.competitionScore}/100` : '',
      a ? `Value Range: $${a.domainValue.conservative.toLocaleString()} – $${a.domainValue.premium.toLocaleString()}` : '',
      a ? `TLD Status: ${a.tldMatrix.filter(t => t.status === 'registered').length}/${a.tldMatrix.length} TLDs registered` : '',
      a ? `Similar Domains: ${a.similarDomains.filter(s => s.status === 'registered').length} registered alternatives found` : '',
      r ? `AI Recommendation: ${TIER_LABELS[r.tier]} (${r.confidence}% confidence)` : '',
      r ? `Reasoning: ${r.reasoning}` : '',
      r ? `Suggested Max Buy Price: $${r.suggestedBuyMax.toLocaleString()} | Target Sale: $${r.targetSalePrice.toLocaleString()} | Hold: ${r.estimatedHold}` : '',
    ].filter(Boolean).join('\n');
  };

  try {
    const apiKey = await getNvidiaKey(userId);
    if (!apiKey) {
      return "NVIDIA API key not configured. Go to Settings → AI to add your key.";
    }

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: buildSystemPrompt() },
      ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    return await nvidiaChat(messages, { maxTokens: 700, temperature: 0.4, timeoutMs: 20000, userId });
  } catch {
    return "Could not reach AI right now. Please try again in a moment.";
  }
}
