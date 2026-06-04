// Domain Intelligence Analysis Engine
// Orchestrates DNS TLD checks, Serper business discovery,
// similar-domain generation, brand/geo/competition scoring, and
// an NVIDIA-powered executive report. Called from reanalyzeDomain().
import { promises as dnsPromises } from 'dns';
import axios from 'axios';
import { getSetting } from './settings.js';
import { getNvidiaKey, nvidiaChat, extractJson } from './nvidiaAi.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DomainIntelInput {
  niche: string | null;
  industry: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  brandingScore: number;
  buyerDemandScore: number;
  leadOpportunityScore: number;
  estimatedValue: number;
}

export interface BuyerPool {
  total: number;
  high: number;
  medium: number;
  low: number;
}

export interface TldResult {
  tld: string;
  domain: string;
  status: 'registered' | 'available';
}

export interface SimilarDomain {
  domain: string;
  status: 'registered' | 'available';
  similarity: number;
  reason: string;
}

export interface DiscoveredBusiness {
  name: string;
  website?: string;
  address?: string;
  rating?: number;
  type?: string;
  buyerScore: number;
  priority: 'high' | 'medium' | 'low';
}

export interface BrandBreakdown {
  overall: number;
  memorability: number;
  keywordRelevance: number;
  commercialIntent: number;
  geoRelevance: number;
}

export interface DomainValueRange {
  conservative: number;
  expected: number;
  premium: number;
}

export interface AiReport {
  executiveSummary: string;
  recommendation: 'hold' | 'contact_buyers' | 'increase_price' | 'reduce_price' | 'high_priority' | 'low_priority';
  recommendationLabel: string;
  keyInsights: string[];
  outreachPriority: 'high' | 'medium' | 'low';
}

export interface DomainAnalysis {
  parsed: {
    sld: string;
    tld: string;
    tokens: string[];
    geo: string;
    city: string;
    state: string;
    industry: string;
    niche: string;
    keywords: string[];
  };
  buyerPool: BuyerPool;
  tldMatrix: TldResult[];
  similarDomains: SimilarDomain[];
  businesses: DiscoveredBusiness[];
  brandBreakdown: BrandBreakdown;
  geoScore: number;
  competitionScore: number;
  domainValue: DomainValueRange;
  aiReport: AiReport;
  analyzedAt: string;
}

// ─── Synonym dictionaries ────────────────────────────────────────────────────

const NICHE_SYNONYMS: Record<string, string[]> = {
  car: ['auto', 'vehicle', 'cars', 'motors'],
  auto: ['car', 'autos', 'vehicle', 'motors'],
  dealer: ['vendor', 'sales', 'shop', 'store'],
  vendor: ['dealer', 'sales', 'market'],
  sales: ['dealer', 'vendor', 'shop'],
  roof: ['roofing'],
  roofing: ['roof', 'roofer'],
  plumb: ['plumbing'],
  plumbing: ['plumb', 'plumber'],
  clean: ['cleaning', 'cleaner'],
  cleaning: ['clean', 'cleaner', 'maid'],
  dental: ['dentist'],
  dentist: ['dental'],
  lawyer: ['attorney', 'legal'],
  attorney: ['lawyer', 'legal'],
  law: ['legal', 'attorney'],
  legal: ['law', 'attorney'],
  realestate: ['realty', 'properties', 'homes'],
  realtor: ['realestate', 'realty'],
  salon: ['hair', 'beauty'],
  beauty: ['salon', 'spa'],
  gym: ['fitness'],
  fitness: ['gym', 'sport'],
  restaurant: ['food', 'dining'],
  food: ['restaurant', 'dining'],
  repair: ['fix', 'service'],
  service: ['services', 'solutions'],
  pro: ['expert', 'master', 'elite'],
  expert: ['pro', 'master', 'specialist'],
  truck: ['trucks', 'auto', 'vehicle'],
  trucks: ['truck', 'auto'],
  hvac: ['heating', 'cooling', 'airconditioning'],
  pest: ['pests', 'exterminator'],
  solar: ['energy', 'panels'],
  move: ['moving', 'movers'],
  moving: ['movers', 'move'],
};

const STATE_ABBR: Record<string, string> = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar',
  california: 'ca', colorado: 'co', connecticut: 'ct', delaware: 'de',
  florida: 'fl', georgia: 'ga', hawaii: 'hi', idaho: 'id',
  illinois: 'il', indiana: 'in', iowa: 'ia', kansas: 'ks',
  kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md',
  massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms',
  missouri: 'mo', montana: 'mt', nebraska: 'ne', nevada: 'nv',
  newhampshire: 'nh', newjersey: 'nj', newmexico: 'nm', newyork: 'ny',
  northcarolina: 'nc', northdakota: 'nd', ohio: 'oh', oklahoma: 'ok',
  oregon: 'or', pennsylvania: 'pa', rhodeisland: 'ri', southcarolina: 'sc',
  southdakota: 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut',
  vermont: 'vt', virginia: 'va', washington: 'wa', westvirginia: 'wv',
  wisconsin: 'wi', wyoming: 'wy',
};

const MAJOR_METROS = new Set([
  'newyork', 'losangeles', 'chicago', 'houston', 'phoenix', 'philadelphia',
  'sanantonio', 'sandiego', 'dallas', 'austin', 'jacksonville', 'sanjose',
  'fortworth', 'columbus', 'charlotte', 'indianapolis', 'seattle', 'denver',
  'boston', 'nashville', 'atlanta', 'miami', 'tampa', 'orlando', 'lasvegas',
  'portland', 'memphis', 'detroit', 'cleveland', 'minneapolis', 'sacramento',
]);

const INDUSTRY_BASE_COUNTS: Record<string, number> = {
  'Home Services': 8000,
  'Automotive': 3000,
  'Healthcare': 5000,
  'Legal': 2000,
  'Real Estate': 6000,
  'Food & Beverage': 10000,
  'Beauty & Wellness': 7000,
  'Fitness': 2000,
  'Construction': 4000,
  'Insurance': 1500,
  'Marketing': 1200,
  'Technology': 900,
  'Energy': 800,
  'Logistics': 1000,
  'Finance': 1800,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripDomainName(domain: string): { baseSld: string; tld: string } {
  const cleaned = domain.toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  const parts = cleaned.split('.');
  if (parts.length < 2) return { baseSld: cleaned, tld: 'com' };
  return { baseSld: parts[0], tld: parts.slice(1).join('.') };
}

function tokenizeStr(s: string): string[] {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z]+/g, ' ')
    .toLowerCase().split(/\s+/).filter(Boolean);
}

async function isDomainRegistered(hostname: string): Promise<boolean> {
  try {
    await dnsPromises.lookup(hostname);
    return true;
  } catch {
    return false;
  }
}

// ─── Step 1 – TLD matrix ──────────────────────────────────────────────────────

const TLDS_TO_CHECK = ['com', 'net', 'org', 'co', 'io', 'ai', 'us', 'biz', 'info'];

async function buildTldMatrix(baseSld: string, ownTld: string): Promise<TldResult[]> {
  const checks = TLDS_TO_CHECK.map(async (tld): Promise<TldResult> => {
    const domain = `${baseSld}.${tld}`;
    const registered = await isDomainRegistered(domain).catch(() => false);
    return { tld: `.${tld}`, domain, status: registered ? 'registered' : 'available' };
  });
  return Promise.all(checks);
}

// ─── Step 2 – Similar domain generation + DNS check ──────────────────────────

function generateSimilarDomainNames(
  baseSld: string,
  tokens: string[],
  city: string | null,
  state: string | null
): Array<{ domain: string; reason: string; similarity: number }> {
  const candidates: Array<{ domain: string; reason: string; similarity: number }> = [];

  // Synonym substitutions
  for (const token of tokens) {
    const syns = NICHE_SYNONYMS[token];
    if (!syns) continue;
    for (const syn of syns.slice(0, 2)) {
      const newSld = baseSld.replace(token, syn);
      if (newSld !== baseSld) {
        candidates.push({
          domain: `${newSld}.com`,
          reason: `${token} → ${syn}`,
          similarity: 85,
        });
      }
    }
  }

  // State abbreviation variation
  if (state) {
    const stateKey = state.toLowerCase().replace(/\s/g, '');
    const abbr = STATE_ABBR[stateKey];
    if (abbr && baseSld.includes(stateKey)) {
      candidates.push({
        domain: `${baseSld.replace(stateKey, abbr)}.com`,
        reason: `state → abbreviation (${abbr})`,
        similarity: 90,
      });
    }
  }

  // Plural / singular variations
  for (const token of tokens) {
    if (token.endsWith('s') && token.length > 3) {
      const singular = token.slice(0, -1);
      const newSld = baseSld.replace(token, singular);
      if (newSld !== baseSld) {
        candidates.push({ domain: `${newSld}.com`, reason: 'plural variation', similarity: 92 });
      }
    } else if (!token.endsWith('s')) {
      const plural = `${token}s`;
      const newSld = baseSld.replace(token, plural);
      if (newSld !== baseSld) {
        candidates.push({ domain: `${newSld}.com`, reason: 'singular variation', similarity: 92 });
      }
    }
  }

  // City prefix/suffix
  if (city) {
    const cityKey = city.toLowerCase().replace(/\s/g, '');
    if (!baseSld.includes(cityKey)) {
      const nicheTokens = tokens.filter(t => !STATE_ABBR[t] && t.length > 2);
      if (nicheTokens.length > 0) {
        candidates.push({
          domain: `${cityKey}${nicheTokens.join('')}.com`,
          reason: `city-specific variant`,
          similarity: 70,
        });
      }
    }
  }

  // Deduplicate and return top 8
  const seen = new Set<string>();
  return candidates
    .filter(c => {
      if (seen.has(c.domain)) return false;
      if (c.domain === `${baseSld}.com`) return false;
      seen.add(c.domain);
      return true;
    })
    .slice(0, 8);
}

async function checkSimilarDomains(
  baseSld: string,
  tokens: string[],
  city: string | null,
  state: string | null
): Promise<SimilarDomain[]> {
  const candidates = generateSimilarDomainNames(baseSld, tokens, city, state);
  const results = await Promise.all(
    candidates.map(async (c): Promise<SimilarDomain> => {
      const registered = await isDomainRegistered(c.domain).catch(() => false);
      return { ...c, status: registered ? 'registered' : 'available' };
    })
  );
  return results;
}

// ─── Step 3 – Serper business discovery ──────────────────────────────────────

interface SerperPlace {
  title?: string;
  address?: string;
  website?: string;
  rating?: number;
  type?: string;
}

async function discoverBusinesses(
  niche: string | null,
  city: string | null,
  state: string | null,
  userId?: string | null
): Promise<DiscoveredBusiness[]> {
  if (!niche && !city && !state) return [];

  const serperKey = await getSetting('serperApiKey', userId).catch(() => undefined);
  if (!serperKey) return [];

  const geoStr = city ? `${city}, ${state || ''}` : state || '';
  const query = `${niche || 'business'} in ${geoStr || 'USA'}`.trim();

  try {
    const response = await axios.post(
      'https://google.serper.dev/maps',
      { q: query, num: 10 },
      {
        headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    );

    const places: SerperPlace[] = response.data?.places || [];
    return places.map((p): DiscoveredBusiness => {
      const hasWebsite = Boolean(p.website);
      const rating = p.rating || 0;
      let buyerScore = 50;
      if (!hasWebsite) buyerScore += 20;  // weak online presence = needs domain
      if (rating < 3.5 && rating > 0) buyerScore += 10;  // low-rated = may want rebrand
      if (rating >= 4.5) buyerScore += 5;  // thriving = may want premium domain
      buyerScore = Math.min(100, buyerScore);
      return {
        name: p.title || 'Unknown',
        website: p.website,
        address: p.address,
        rating: p.rating,
        type: p.type,
        buyerScore,
        priority: buyerScore >= 70 ? 'high' : buyerScore >= 50 ? 'medium' : 'low',
      };
    });
  } catch {
    return [];
  }
}

// ─── Step 4 – Scores ──────────────────────────────────────────────────────────

function buildBrandBreakdown(
  baseSld: string,
  tokens: string[],
  hasIndustry: boolean,
  hasCity: boolean,
  hasState: boolean,
  tld: string,
  baseScore: number
): BrandBreakdown {
  const len = baseSld.length;
  const hasNumbers = /[0-9]/.test(baseSld);
  const hasHyphens = /-/.test(baseSld);

  let memorability = 25 - Math.max(0, (len - 10) * 1.2);
  if (hasNumbers) memorability -= 5;
  if (hasHyphens) memorability -= 5;
  memorability = Math.max(2, Math.min(25, memorability));

  let keywordRelevance = 5;
  if (hasIndustry) keywordRelevance += 15;
  if (hasCity || hasState) keywordRelevance += 8;
  keywordRelevance = Math.min(25, keywordRelevance);

  let commercialIntent = 5;
  if (hasIndustry) commercialIntent += 12;
  if (tld === 'com') commercialIntent += 5;
  else if (['net', 'co'].includes(tld)) commercialIntent += 2;
  commercialIntent = Math.min(25, commercialIntent);

  let geoRelevance = 8;
  if (hasCity) geoRelevance = 25;
  else if (hasState) geoRelevance = 18;
  geoRelevance = Math.min(25, geoRelevance);

  return {
    overall: baseScore,
    memorability: Math.round(memorability),
    keywordRelevance: Math.round(keywordRelevance),
    commercialIntent: Math.round(commercialIntent),
    geoRelevance: Math.round(geoRelevance),
  };
}

function calcGeoScore(
  city: string | null,
  state: string | null,
  industry: string | null
): number {
  let score = 10;
  const cityKey = (city || '').toLowerCase().replace(/\s/g, '');

  if (MAJOR_METROS.has(cityKey)) score += 40;
  else if (city) score += 25;
  else if (state) score += 20;

  if (industry && INDUSTRY_BASE_COUNTS[industry]) {
    const base = INDUSTRY_BASE_COUNTS[industry];
    if (base >= 6000) score += 30;
    else if (base >= 3000) score += 20;
    else score += 10;
  }

  return Math.max(5, Math.min(100, score));
}

function calcCompetitionScore(tldMatrix: TldResult[], similarDomains: SimilarDomain[]): number {
  const registeredTlds = tldMatrix.filter(t => t.status === 'registered').length;
  const registeredSimilar = similarDomains.filter(s => s.status === 'registered').length;
  const dotComTaken = tldMatrix.find(t => t.tld === '.com')?.status === 'registered';

  let score = 20;
  if (dotComTaken) score += 30;
  score += Math.min(25, registeredTlds * 4);
  score += Math.min(20, registeredSimilar * 4);
  return Math.min(100, score);
}

function estimateBuyerPool(
  industry: string | null,
  city: string | null,
  state: string | null,
  buyerDemandScore: number
): BuyerPool {
  const base = (industry && INDUSTRY_BASE_COUNTS[industry]) || 800;
  const cityKey = (city || '').toLowerCase().replace(/\s/g, '');

  let geoMultiplier = 1.0;
  if (MAJOR_METROS.has(cityKey)) geoMultiplier = 3.0;
  else if (city) geoMultiplier = 1.8;
  else if (state) geoMultiplier = 2.5;

  const demandMultiplier = 0.5 + (buyerDemandScore / 100);
  const total = Math.round(base * geoMultiplier * demandMultiplier);

  const highPct = 0.12 + (buyerDemandScore / 1000);
  const medPct = 0.35;
  const high = Math.round(total * highPct);
  const medium = Math.round(total * medPct);
  const low = total - high - medium;

  return { total, high: Math.max(0, high), medium: Math.max(0, medium), low: Math.max(0, low) };
}

function calcValueRange(
  estimatedValue: number,
  tldMatrix: TldResult[],
  buyerPool: BuyerPool,
  brandScore: number
): DomainValueRange {
  let multiplier = 1.0;
  const dotComOwn = tldMatrix.find(t => t.tld === '.com')?.status === 'registered';
  if (dotComOwn) multiplier *= 0.85;  // .com taken = less urgency to buy
  if (buyerPool.high > 300) multiplier *= 1.2;
  if (brandScore >= 75) multiplier *= 1.15;

  const expected = Math.round(estimatedValue * multiplier);
  return {
    conservative: Math.round(expected * 0.6),
    expected,
    premium: Math.round(expected * 2.8),
  };
}

// ─── Step 5 – AI report via NVIDIA ────────────────────────────────────────────

const RECO_LABELS: Record<string, string> = {
  hold: 'Hold',
  contact_buyers: 'Contact Buyers',
  increase_price: 'Increase Price',
  reduce_price: 'Reduce Price',
  high_priority: 'High Priority',
  low_priority: 'Low Priority',
};

async function generateAiReport(
  domainName: string,
  parsed: DomainAnalysis['parsed'],
  buyerPool: BuyerPool,
  brandBreakdown: BrandBreakdown,
  geoScore: number,
  competitionScore: number,
  domainValue: DomainValueRange,
  businessCount: number,
  userId?: string | null
): Promise<AiReport> {
  const fallback: AiReport = {
    executiveSummary: `${domainName} is a ${parsed.niche || parsed.industry || 'general'} domain${parsed.geo ? ` targeting ${parsed.geo}` : ''}. With an estimated buyer pool of ${buyerPool.total.toLocaleString()} businesses and ${buyerPool.high.toLocaleString()} high-intent prospects, outreach potential is ${buyerPool.high > 200 ? 'strong' : 'moderate'}.`,
    recommendation: buyerPool.high > 300 ? 'high_priority' : buyerPool.total < 500 ? 'hold' : 'contact_buyers',
    recommendationLabel: '',
    keyInsights: [
      `Brand strength: ${brandBreakdown.overall}/100 — ${brandBreakdown.overall >= 70 ? 'strong and memorable' : brandBreakdown.overall >= 50 ? 'average' : 'could be stronger'}`,
      `Estimated ${buyerPool.total.toLocaleString()} potential buyers, ${buyerPool.high.toLocaleString()} high-intent`,
      `Market opportunity score: ${geoScore}/100`,
      `Competition level: ${competitionScore < 40 ? 'low' : competitionScore < 70 ? 'moderate' : 'high'}`,
    ],
    outreachPriority: buyerPool.high > 300 ? 'high' : buyerPool.high > 100 ? 'medium' : 'low',
  };
  fallback.recommendationLabel = RECO_LABELS[fallback.recommendation];

  try {
    const apiKey = await getNvidiaKey(userId);
    if (!apiKey) return fallback;

    const prompt = `You are a domain investment analyst. Analyze this domain and return a JSON report.

Domain: ${domainName}
Industry: ${parsed.industry || 'Unknown'}
Niche: ${parsed.niche || 'Unknown'}
Geo: ${parsed.geo || 'National'}
Brand Score: ${brandBreakdown.overall}/100
Buyer Pool: ${buyerPool.total.toLocaleString()} total (${buyerPool.high.toLocaleString()} high-intent)
Market Score: ${geoScore}/100
Competition Score: ${competitionScore}/100 (higher = more competitive)
Businesses Found: ${businessCount}
Value Range: $${domainValue.conservative.toLocaleString()}–$${domainValue.premium.toLocaleString()}

Return ONLY valid JSON (no prose, no code fences):
{
  "executiveSummary": "<2-3 sentence summary of commercial potential>",
  "recommendation": "<one of: hold|contact_buyers|increase_price|reduce_price|high_priority|low_priority>",
  "keyInsights": ["<insight 1>", "<insight 2>", "<insight 3>"],
  "outreachPriority": "<high|medium|low>"
}`;

    const raw = await nvidiaChat(
      [{ role: 'user', content: prompt }],
      { maxTokens: 500, temperature: 0.3, timeoutMs: 15000, userId }
    );

    const parsed2 = extractJson<Partial<AiReport>>(raw);
    const reco = (parsed2.recommendation as AiReport['recommendation']) || fallback.recommendation;
    return {
      executiveSummary: parsed2.executiveSummary || fallback.executiveSummary,
      recommendation: reco,
      recommendationLabel: RECO_LABELS[reco] || 'Review',
      keyInsights: Array.isArray(parsed2.keyInsights) ? parsed2.keyInsights : fallback.keyInsights,
      outreachPriority: (parsed2.outreachPriority as AiReport['outreachPriority']) || fallback.outreachPriority,
    };
  } catch {
    return fallback;
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function runDomainAnalysis(
  domainName: string,
  intel: DomainIntelInput,
  userId?: string | null
): Promise<DomainAnalysis> {
  const { baseSld, tld } = stripDomainName(domainName);
  const tokens = tokenizeStr(baseSld);
  const geo = intel.city
    ? `${intel.city}${intel.state ? `, ${intel.state}` : ''}`
    : intel.state || '';

  const parsed: DomainAnalysis['parsed'] = {
    sld: baseSld,
    tld,
    tokens,
    geo,
    city: intel.city || '',
    state: intel.state || '',
    industry: intel.industry || '',
    niche: intel.niche || '',
    keywords: tokens,
  };

  // Run TLD check, similar domains, and business discovery in parallel
  const [tldMatrix, similarDomains, businesses] = await Promise.all([
    buildTldMatrix(baseSld, tld),
    checkSimilarDomains(baseSld, tokens, intel.city, intel.state),
    discoverBusinesses(intel.niche, intel.city, intel.state, userId),
  ]);

  const brandBreakdown = buildBrandBreakdown(
    baseSld, tokens,
    Boolean(intel.industry), Boolean(intel.city), Boolean(intel.state),
    tld, intel.brandingScore
  );
  const geoScore = calcGeoScore(intel.city, intel.state, intel.industry);
  const competitionScore = calcCompetitionScore(tldMatrix, similarDomains);
  const buyerPool = estimateBuyerPool(
    intel.industry, intel.city, intel.state, intel.buyerDemandScore
  );
  const domainValue = calcValueRange(
    intel.estimatedValue, tldMatrix, buyerPool, intel.brandingScore
  );

  const aiReport = await generateAiReport(
    domainName, parsed, buyerPool, brandBreakdown, geoScore,
    competitionScore, domainValue, businesses.length, userId
  );

  return {
    parsed,
    buyerPool,
    tldMatrix,
    similarDomains,
    businesses,
    brandBreakdown,
    geoScore,
    competitionScore,
    domainValue,
    aiReport,
    analyzedAt: new Date().toISOString(),
  };
}
