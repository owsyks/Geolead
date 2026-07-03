import axios from 'axios';
import { getSetting } from './settings.js';
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
  userId?: string | null; // resolve the calling user's Serper key
}

// Multiple Serper keys can be configured as a shared rotation pool
// (SERPER_API_KEY_1, _2, _3, ...) so one account's daily quota doesn't cap
// every search. A per-user DB key (Settings page) is used exclusively
// instead — it's that user's own quota, not part of the shared pool.
const MAX_PER_KEY_PER_DAY = 2500;

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

function keyPrefix(key: string): string {
  return key.slice(0, 8);
}

async function getKeyUsage(key: string): Promise<number> {
  const prefix = keyPrefix(key);
  const today = new Date().toISOString().split('T')[0];
  const dateRedisKey = `serper:date:${prefix}`;
  const usageRedisKey = `serper:usage:${prefix}`;

  const storedDate = await redisConnection.get(dateRedisKey);
  if (storedDate !== today) {
    await redisConnection.set(dateRedisKey, today);
    await redisConnection.set(usageRedisKey, '0');
    return 0;
  }
  return parseInt((await redisConnection.get(usageRedisKey)) || '0', 10);
}

async function incrementKeyUsage(key: string): Promise<void> {
  await redisConnection.incr(`serper:usage:${keyPrefix(key)}`).catch(() => undefined);
}

async function getKeyPool(userId?: string | null): Promise<string[]> {
  const userKey = await getSetting('serperApiKey', userId);
  const platformKeys = getPlatformKeys();
  if (userKey) return [userKey]; // dedicated key — don't share its quota with the pool
  return platformKeys;
}

// Orders keys by ascending usage today, favoring keys with quota remaining.
// If every key looks exhausted by our own tracking, return the pool as-is —
// Redis-side usage is an optimization, not a hard cap; the real API 429/403
// response is the source of truth for "actually exhausted."
async function orderByUsage(keys: string[]): Promise<string[]> {
  const withUsage = await Promise.all(keys.map(async (key) => ({ key, usage: await getKeyUsage(key) })));
  const underQuota = withUsage.filter((k) => k.usage < MAX_PER_KEY_PER_DAY);
  const ordered = (underQuota.length > 0 ? underQuota : withUsage).sort((a, b) => a.usage - b.usage);
  return ordered.map((k) => k.key);
}

// POSTs to a Serper endpoint, rotating through the key pool on rate-limit/
// auth/quota errors. Returns null (triggering the mock-data fallback) only
// once every key in the pool has failed.
async function serperRequest(path: string, query: string, options: SerperSearchOptions): Promise<any[] | null> {
  const pool = await getKeyPool(options.userId);
  if (pool.length === 0) return null;

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
      incrementKeyUsage(key);
      return path === '/places' ? response.data.places || [] : response.data.organic || [];
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 429 || status === 403 || status === 401) {
        console.warn(`[Serper.dev] Key ${keyPrefix(key)}... rejected (${status}) on ${path} — rotating to next key.`);
        continue;
      }
      console.error(`[Serper.dev] ${path} error: ${error.message}`);
      continue;
    }
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
