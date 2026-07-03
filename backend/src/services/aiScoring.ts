import { extractJson, getNvidiaKey, nvidiaChat } from './aiProvider.js';

export interface ScoreResult {
  score: number; // 0 to 100
  explanation: string;
}

/**
 * Calculates a match score (0-100) between a target domain name and a discovered business.
 * Supports NVIDIA (Kimi) LLM scoring if an API key is configured.
 */
let nvidiaKeyWarned = false;

export async function calculateMatchScore(
  domainIdea: string,
  businessName: string,
  category?: string,
  address?: string
): Promise<ScoreResult> {
  const nvidiaKey = await getNvidiaKey();

  if (nvidiaKey) {
    try {
      console.log(`[AI Scoring] Requesting NVIDIA evaluation for: ${domainIdea} vs ${businessName}`);
      return await getNvidiaScoring(domainIdea, businessName, category, address);
    } catch (err: any) {
      console.error(`[AI Scoring] NVIDIA API failed: ${err.message}. Falling back to local NLP.`);
    }
  } else if (!nvidiaKeyWarned) {
    nvidiaKeyWarned = true;
    console.warn('[AI Scoring] NVIDIA API key not set — using local NLP heuristic scores. Scores will be degraded compared to LLM evaluation.');
  }

  // Local NLP Fallback
  return calculateLocalNLPScore(domainIdea, businessName, category, address);
}

/**
 * NVIDIA (Kimi) LLM scorer.
 */
async function getNvidiaScoring(
  domainIdea: string,
  businessName: string,
  category?: string,
  address?: string
): Promise<ScoreResult> {
  const prompt = `Score how likely this specific business would buy this specific geo-domain.

## Inputs
Domain: "${domainIdea}"
Business: "${businessName}"
Category: "${category || 'unknown'}"
Address: "${address || 'unknown'}"

## Rubric (score 0-100)
- 90-100: Strong geo + niche + name match. Business obviously benefits from owning the domain (e.g., domain "AustinPlumbers.com", business "Austin Plumbing Co" in Austin TX).
- 70-89: Either strong geo match or strong niche match, plus the other being partial. Buying is plausible.
- 50-69: Some keyword overlap but weak geo or niche fit. Marginal interest.
- 30-49: Same broad industry but no geo match, OR same geo but wrong industry.
- 0-29: Almost no relevance. Don't waste outreach.

## Anti-hallucination rules
- ONLY use facts present in the inputs above. Do not assume the business sells X unless the category or name says so.
- If category is "unknown" and the name is generic, default to the lower half of the rubric.
- One concise factual sentence per claim. No fluff.

## Output
Return STRICT JSON only:
{"score": <int 0-100>, "explanation": "<2 short sentences citing the rubric criteria you used>"}`;

  const resText = await nvidiaChat(
    [{ role: 'user', content: prompt }],
    { temperature: 0.1, maxTokens: 512, timeoutMs: 20000 }
  );
  const result = extractJson<{ score?: number; explanation?: string }>(resText);
  return {
    score: Math.max(0, Math.min(100, Number(result.score) || 0)),
    explanation: result.explanation || 'Evaluated via NVIDIA (Kimi) semantic analysis.'
  };
}

/**
 * Local NLP fallback scoring logic based on tokenization, synonyms, and geography.
 */
function calculateLocalNLPScore(
  domainIdea: string,
  businessName: string,
  category?: string,
  address?: string
): ScoreResult {
  // Tokenize. Critical: split CamelCase ("TexasCarVendor" → ["Texas","Car","Vendor"])
  // BEFORE lowercasing, otherwise the whole domain stays as one token.
  const tokenize = (s: string): string[] => {
    const withSpaces = s
      .replace(/\.(com|net|org|co|io|biz|info|us|ca|uk|me)$/i, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')  // CamelCase split
      .replace(/([0-9]+)/g, ' $1 ')          // numbers as separators
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ');
    return withSpaces.split(/\s+/).filter(Boolean);
  };

  const domainTokens = tokenize(domainIdea);
  const businessTokens = tokenize(businessName);

  // Light stemmer: drop trailing 's' so car≈cars, dog≈dogs (avoids losing "business"/"loss" by guarding length)
  const stem = (w: string): string => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

  let score = 30; // Baseline starting score for a business in the search query
  const matches: string[] = [];

  // Synonym mapping. Stems are computed in areSynonyms() so we don't need both car/cars.
  const synonymGroups = [
    ['car', 'auto', 'vehicle', 'automotive', 'motor', 'dealership', 'dealer'],
    ['vendor', 'seller', 'shop', 'store', 'market', 'mart'],
    ['dentist', 'dental', 'dentistry', 'teeth', 'smile', 'orthodontist'],
    ['roof', 'roofing', 'roofer', 'shingle'],
    ['contractor', 'builder', 'construction', 'building'],
    ['realestate', 'property', 'home', 'house', 'realtor', 'estate', 'broker'],
    ['plumber', 'plumbing', 'drain', 'leak', 'pipe'],
    ['lawyer', 'attorney', 'legal', 'law', 'firm', 'advocate'],
    ['clinic', 'practice', 'office', 'health', 'medical', 'care'],
    ['restaurant', 'cafe', 'diner', 'bistro', 'kitchen', 'food'],
    ['hotel', 'inn', 'motel', 'resort', 'stay', 'lodging'],
    ['salon', 'spa', 'beauty', 'hair', 'nails', 'cosmetics'],
    ['gym', 'fitness', 'workout', 'crossfit', 'yoga', 'training'],
    ['pet', 'vet', 'veterinary', 'animal', 'dog', 'cat'],
    ['tech', 'software', 'digital', 'web', 'app', 'it'],
    ['photo', 'photography', 'photographer', 'photos', 'studio'],
  ];

  // Helper to check if two words are synonyms (compared on stems so plurals match)
  const areSynonyms = (w1: string, w2: string): boolean => {
    const s1 = stem(w1), s2 = stem(w2);
    if (s1 === s2) return true;
    for (const group of synonymGroups) {
      const stemmed = group.map(stem);
      if (stemmed.includes(s1) && stemmed.includes(s2)) return true;
    }
    return false;
  };

  // Geographic dictionary (common cities/states)
  const geoTerms = new Set([
    'texas', 'tx', 'miami', 'fl', 'florida', 'london', 'uk', 'dubai', 'uae', 'california', 'ca', 'austin', 'dallas', 'houston'
  ]);

  // Check token match and score modifiers
  let geoMatched = false;
  let nicheMatched = false;

  domainTokens.forEach(dToken => {
    // Check if domain token is a geo term
    const isGeo = geoTerms.has(dToken);

    businessTokens.forEach(bToken => {
      // Direct match or Synonym match
      if (dToken === bToken || areSynonyms(dToken, bToken)) {
        if (isGeo) {
          geoMatched = true;
          score += 25; // High boost for geo matches
          matches.push(`Geo-location Match (${dToken})`);
        } else {
          nicheMatched = true;
          score += 20; // Boost for niche keyword overlap
          matches.push(`Keyword Match (${dToken} ~ ${bToken})`);
        }
      }
    });

    // Fallback search in full address and category strings
    if (address && address.toLowerCase().includes(dToken)) {
      if (isGeo && !geoMatched) {
        geoMatched = true;
        score += 20;
        matches.push(`Location Match in Address (${dToken})`);
      }
    }
    if (category && category.toLowerCase().includes(dToken)) {
      if (!isGeo && !nicheMatched) {
        nicheMatched = true;
        score += 15;
        matches.push(`Niche Match in Category (${dToken})`);
      }
    }
  });

  // Penalize missing geographical match if domain has geographic intent
  const domainHasGeo = domainTokens.some(t => geoTerms.has(t));
  if (domainHasGeo && !geoMatched) {
    score -= 15;
  }

  // Penalize missing niche match
  if (!nicheMatched) {
    score -= 10;
  }

  // Exact name starts with domain prefix boost
  const joinedDomain = domainTokens.join('');
  const joinedBusiness = businessTokens.join('');
  if (joinedBusiness.includes(joinedDomain) || joinedDomain.includes(joinedBusiness)) {
    score += 15;
    matches.push('Name overlap boost');
  }

  // Clamp score
  const finalScore = Math.max(10, Math.min(99, score));

  // Construct Explanation
  let explanation = '';
  if (matches.length > 0) {
    explanation = `Matching indicators: ${matches.join(', ')}. Strong alignment with ${domainHasGeo && geoMatched ? 'both local and sector keyword features' : 'sector keyword features'}.`;
  } else {
    explanation = 'Calculated score based on weak token similarities. Lacks direct geographical or semantic matches.';
  }

  return {
    score: finalScore,
    explanation
  };
}
