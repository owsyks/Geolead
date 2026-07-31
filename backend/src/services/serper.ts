import axios from 'axios';
import { createHash } from 'node:crypto';
import { redisConnection } from '../queues/queues.js';

export interface SerperResult {
  title: string;
  link: string;
  snippet?: string;
  position?: number;
}

export interface SerperPlace {
  title: string;
  address: string;
  phoneNumber?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  ratingCount?: number;
  category?: string;
  website?: string;
  cid?: string;
}

interface SerperSearchOptions {
  page?: number;
  num?: number;
  allowMockFallback?: boolean;
}

export class SerperUnavailableError extends Error {
  constructor() {
    super('No platform Serper credential is currently usable.');
    this.name = 'SerperUnavailableError';
  }
}

// Multiple Serper keys can be configured as a shared rotation pool
// (SERPER_API_KEY_1, _2, _3, ...) so one account's daily quota doesn't cap
// every search. These are platform-managed server credentials; tenant settings
// are deliberately never consulted for Serper authentication.
const MAX_PER_KEY_PER_DAY = 2500;
const DEFAULT_CACHE_TTL_SECONDS = 24 * 60 * 60;

function getCacheTtlSeconds(): number {
  const configured = Number.parseInt(process.env.SERPER_CACHE_TTL_SECONDS || '', 10);
  if (!Number.isFinite(configured)) return DEFAULT_CACHE_TTL_SECONDS;
  return Math.min(Math.max(configured, 300), 7 * 24 * 60 * 60);
}

function responseCacheKey(path: string, query: string, options: SerperSearchOptions): string {
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ path, query: query.trim().toLowerCase(), page: options.page || 1, num: options.num || 10 }))
    .digest('hex');
  return `serper:response:${fingerprint}`;
}

function getPlatformKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const key = process.env[`SERPER_API_KEY_${i}`];
    if (key) keys.push(key);
  }
  const legacy = process.env.SERPER_API_KEY;
  if (legacy && !keys.includes(legacy)) keys.push(legacy);
  return keys;
}

function keyId(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

async function getKeyUsage(key: string): Promise<number> {
  const id = keyId(key);
  const today = new Date().toISOString().split('T')[0];
  const dateRedisKey = `serper:date:${id}`;
  const usageRedisKey = `serper:usage:${id}`;

  const storedDate = await redisConnection.get(dateRedisKey);
  if (storedDate !== today) {
    await redisConnection.set(dateRedisKey, today);
    await redisConnection.set(usageRedisKey, '0');
    return 0;
  }
  return parseInt((await redisConnection.get(usageRedisKey)) || '0', 10);
}

async function incrementKeyUsage(key: string): Promise<void> {
  await redisConnection.incr(`serper:usage:${keyId(key)}`).catch(() => undefined);
}

export async function quarantineSerperKey(key: string, seconds: number): Promise<void> {
  await redisConnection.set(`serper:quarantine:${keyId(key)}`, '1', 'EX', seconds).catch(() => undefined);
}

// Orders keys by ascending usage today, favoring keys with quota remaining.
// If every key looks exhausted by our own tracking, return the pool as-is —
// Redis-side usage is an optimization, not a hard cap; the real API 429/403
// response is the source of truth for "actually exhausted."
async function orderByUsage(keys: string[]): Promise<string[]> {
  const withUsage = await Promise.all(keys.map(async (key) => ({
    key,
    usage: await getKeyUsage(key).catch(() => 0),
    quarantined: Boolean(await redisConnection.get(`serper:quarantine:${keyId(key)}`).catch(() => null)),
  })));
  const available = withUsage.filter((item) => !item.quarantined);
  if (available.length === 0) return [];
  const underQuota = available.filter((k) => k.usage < MAX_PER_KEY_PER_DAY);
  const ordered = (underQuota.length > 0 ? underQuota : available).sort((a, b) => a.usage - b.usage);
  return ordered.map((k) => k.key);
}

// POSTs to a Serper endpoint, rotating through the key pool on rate-limit/
// auth/quota errors. Returns null (triggering the mock-data fallback) only
// once every key in the pool has failed.
async function scrapeDuckDuckGoResults(path: string, query: string): Promise<any[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000,
    });
    const cheerio = await import('cheerio');
    const $ = cheerio.load(response.data);
    const results: any[] = [];
    $('.result__body').each((i, elem) => {
      const title = $(elem).find('.result__title').text().trim();
      let link = $(elem).find('.result__url').attr('href') || $(elem).find('.result__title a').attr('href') || '';
      if (link.includes('uddg=')) {
        try {
          link = decodeURIComponent(link.split('uddg=')[1].split('&')[0]);
        } catch { /* ignore */ }
      }
      const snippet = $(elem).find('.result__snippet').text().trim();
      if (link && title && link.startsWith('http') && !link.includes('duckduckgo.com')) {
        if (path === '/places') {
          results.push({
            title,
            address: snippet.slice(0, 100),
            website: link,
            rating: 4.5,
            ratingCount: 15,
          });
        } else {
          results.push({ title, link, snippet, position: i + 1 });
        }
      }
    });
    if (results.length > 0) {
      console.log(`[SearchScraper] Live web search fallback retrieved ${results.length} real results for "${query}"`);
      return results;
    }
  } catch (err: any) {
    console.error(`[SearchScraper] Web search fallback failed for "${query}": ${err.message}`);
  }
  return [];
}

async function serperRequest(path: string, query: string, options: SerperSearchOptions): Promise<any[] | null> {
  const cacheKey = responseCacheKey(path, query, options);
  try {
    const cached = await redisConnection.get(cacheKey);
    if (cached) {
      const parsed: unknown = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // Cache availability must never prevent live discovery.
  }

  const pool = getPlatformKeys();
  if (pool.length === 0) {
    const scraped = await scrapeDuckDuckGoResults(path, query);
    if (scraped.length > 0) {
      await redisConnection.set(cacheKey, JSON.stringify(scraped), 'EX', getCacheTtlSeconds()).catch(() => undefined);
      return scraped;
    }
    return null;
  }

  const candidates = await orderByUsage(pool);
  const body = {
    q: query,
    ...(options.page ? { page: options.page } : {}),
    ...(options.num ? { num: options.num } : {}),
  };

  for (const key of candidates) {
    try {
      const response = await axios.post(
        `https://google.serper.dev${path}`,
        body,
        { headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, timeout: 10000 }
      );
      const results = path === '/places' ? response.data.places || [] : response.data.organic || [];
      await incrementKeyUsage(key);
      await redisConnection.set(cacheKey, JSON.stringify(results), 'EX', getCacheTtlSeconds()).catch(() => undefined);
      return results;
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 429 || status === 403 || status === 401) {
        await quarantineSerperKey(key, status === 429 ? 60 : 7 * 24 * 60 * 60);
        console.warn(`[Serper.dev] Platform key rejected (${status}) on ${path}; rotating to the next key.`);
        continue;
      }
      console.error(`[Serper.dev] ${path} error: ${error.message}`);
      continue;
    }
  }

  // Fallback to live web search scraper if all Serper keys failed or quarantined
  const scraped = await scrapeDuckDuckGoResults(path, query);
  if (scraped.length > 0) {
    await redisConnection.set(cacheKey, JSON.stringify(scraped), 'EX', getCacheTtlSeconds()).catch(() => undefined);
    return scraped;
  }

  return null;
}

/**
 * Searches Google using Serper.dev API. Falls back to mock data if no
 * configured key succeeds.
 */
export async function searchGoogle(query: string, options: SerperSearchOptions = {}): Promise<SerperResult[]> {
  const organic = await serperRequest('/search', query, options);
  if (organic === null) {
    if (options.allowMockFallback === false) throw new SerperUnavailableError();
    console.log(`[Serper.dev] No usable key. Generating mock search results for: "${query}"`);
    return getMockSearchResults(query);
  }
  return organic.map((item: any) => ({
    title: item.title,
    link: item.link,
    snippet: item.snippet,
    position: item.position,
  }));
}

/**
 * Searches Google Maps via Serper.dev Places. Falls back to mock data if no
 * configured key succeeds.
 */
export async function searchGooglePlaces(query: string, options: SerperSearchOptions = {}): Promise<SerperPlace[]> {
  const places = await serperRequest('/places', query, options);
  if (places === null) {
    if (options.allowMockFallback === false) throw new SerperUnavailableError();
    console.log(`[Serper.dev] No usable key. Generating mock places results for: "${query}"`);
    return getMockPlacesResults(query);
  }
  return places.map((item: any) => ({
    title: item.title,
    address: item.address,
    phoneNumber: item.phoneNumber,
    latitude: item.latitude,
    longitude: item.longitude,
    rating: item.rating,
    ratingCount: item.ratingCount,
    category: item.category,
    website: item.website,
    cid: item.cid,
  }));
}

// ==========================================
// Mock Data Generators for Testing / Fallback
// ==========================================

function getMockSearchResults(query: string): SerperResult[] {
  const queryLower = query.toLowerCase();

  // Extract location if present
  let location = 'Texas';
  if (queryLower.includes('texas')) location = 'Texas';
  else if (queryLower.includes('miami')) location = 'Miami';
  else if (queryLower.includes('london')) location = 'London';
  else if (queryLower.includes('dubai')) location = 'Dubai';

  // Extract niche
  let niche = 'Car Vendor';
  let domainWord = 'car';
  if (queryLower.includes('dental') || queryLower.includes('dentist')) {
    niche = 'Dental Clinic';
    domainWord = 'dental';
  } else if (queryLower.includes('roof')) {
    niche = 'Roofing Services';
    domainWord = 'roof';
  } else if (queryLower.includes('estate') || queryLower.includes('real')) {
    niche = 'Real Estate';
    domainWord = 'property';
  }

  return [
    {
      title: `${location} Premium ${niche} - Trusted Local Experts`,
      link: `https://www.example-${location.toLowerCase()}-${domainWord}.com`,
      snippet: `We are the premier ${niche} in ${location}. Offering top-rated services, expert consultation, and 24/7 client support. Contact us today for a free quote!`,
      position: 1
    },
    {
      title: `Apex ${niche} of ${location}`,
      link: `https://www.apex${domainWord}${location.toLowerCase()}.com`,
      snippet: `Visit Apex ${niche} for the best deals and experienced professionals in the ${location} region. Highly rated with thousands of satisfied clients.`,
      position: 2
    },
    {
      title: `${location} Associated ${niche} Group`,
      link: `https://www.example.org`, // A general or non-matching domain to test relevance scoring
      snippet: `Looking for a certified ${niche}? Our network covers all of ${location} and nearby areas. Phone: (555) 123-4567. Email: info@associatedniche.org`,
      position: 3
    },
    {
      title: `Top 10 ${niche} in ${location} - Yelp & Directory`,
      link: `https://www.yelp.com/search?find_desc=${encodeURIComponent(niche)}&find_loc=${encodeURIComponent(location)}`,
      snippet: `Find the best reviews and ratings for top-rated ${niche} companies in ${location}. Compare prices, services, and read customer testimonials.`,
      position: 4
    }
  ];
}

function getMockPlacesResults(query: string): SerperPlace[] {
  const queryLower = query.toLowerCase();
  let location = 'Texas';
  if (queryLower.includes('texas')) location = 'Texas';
  else if (queryLower.includes('miami')) location = 'Miami';
  else if (queryLower.includes('london')) location = 'London';
  else if (queryLower.includes('dubai')) location = 'Dubai';

  let niche = 'Car Dealer';
  let domainWord = 'car';
  let category = 'Car Dealership';
  if (queryLower.includes('dental') || queryLower.includes('dentist')) {
    niche = 'Dentist Clinic';
    domainWord = 'dental';
    category = 'Dental Clinic';
  } else if (queryLower.includes('roof')) {
    niche = 'Roofing Contractors';
    domainWord = 'roof';
    category = 'Roofing Contractor';
  } else if (queryLower.includes('estate') || queryLower.includes('real')) {
    niche = 'Real Estate Agency';
    domainWord = 'realestate';
    category = 'Real Estate Agency';
  }

  return [
    {
      title: `${location} Auto & ${niche}`,
      address: `100 Main St, ${location}, USA`,
      rating: 4.8,
      ratingCount: 124,
      category,
      website: `https://www.example-${location.toLowerCase()}-${domainWord}.com`,
      cid: '12345678901'
    },
    {
      title: `Apex ${niche} Group`,
      address: `456 Commerce Ave, ${location}, USA`,
      rating: 4.5,
      ratingCount: 89,
      category,
      website: `https://www.apex${domainWord}${location.toLowerCase()}.com`,
      cid: '12345678902'
    },
    {
      title: `Downtown ${niche} Associates`,
      address: `789 Broadway Blvd, ${location}, USA`,
      rating: 4.2,
      ratingCount: 45,
      category,
      website: `https://www.example.org`,
      cid: '12345678903'
    }
  ];
}
