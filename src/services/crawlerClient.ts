import axios from 'axios';
import { getSetting } from './settings.js';

export interface CrawlerBusiness {
  domain: string;
  url: string;
  title: string | null;
  companyName: string | null;
  address: string | null;
  contactPage: string | null;
  source: string;
  relevance: number;
  rating: number | null;
  reviewsCount: number | null;
  category: string | null;
  emails: { value: string; sourceUrl: string }[];
  phones: { value: string; sourceUrl: string }[];
  socials: { value: string; platform: string; sourceUrl: string }[];
  contactForms: { value: string; sourceUrl: string }[];
}

export interface CrawlerSearchResult {
  url: string;
  title: string;
  snippet: string;
}

export interface SearchAndCrawlResult {
  results: CrawlerBusiness[];
  jobId: number;
}

interface CrawlerJobResponse {
  id: number;
  keyword: string;
  status: string;
  total_urls: number;
  processed_urls: number;
  contacts_found: number;
  error: string | null;
}

interface CrawlerResultsResponse {
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  items: Array<{
    id: number;
    domain: string;
    url: string;
    title: string | null;
    company_name: string | null;
    address: string | null;
    contact_page: string | null;
    source: string;
    relevance: number;
    rating: number | null;
    reviews_count: number | null;
    category: string | null;
    emails: { value: string; source_url: string }[];
    phones: { value: string; source_url: string }[];
    socials: { value: string; platform: string; source_url: string }[];
    contact_forms: { value: string; source_url: string }[];
  }>;
}

async function getConfig(userId?: string | null) {
  const baseUrl = await getSetting('crawlerBaseUrl', userId);
  const apiKey = await getSetting('crawlerApiKey', userId);
  return { baseUrl, apiKey };
}

function makeHeaders(apiKey?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;
  return headers;
}

export async function stopCrawlerJob(jobId: number, userId?: string | null): Promise<void> {
  try {
    const { baseUrl, apiKey } = await getConfig(userId);
    if (!baseUrl) return;
    const headers = makeHeaders(apiKey);
    await axios.post(`${baseUrl}/api/jobs/${jobId}/stop`, {}, { headers, timeout: 10000 });
    console.log(`[CrawlerClient] Stopped crawler job ${jobId}`);
  } catch (err: any) {
    console.error(`[CrawlerClient] Failed to stop crawler job ${jobId}: ${err.message}`);
  }
}

/**
 * Stop a specific, known set of crawler jobs by id. Scoped and safe for a SHARED
 * crawler: it never enumerates the crawler's global job list, so it can only ever
 * stop jobs this GeoLead deployment actually started (ids come from our own DB).
 */
export async function stopCrawlerJobs(jobIds: number[], userId?: string | null): Promise<void> {
  const unique = Array.from(new Set(jobIds.filter((id) => typeof id === 'number')));
  for (const id of unique) {
    await stopCrawlerJob(id, userId);
  }
}

/**
 * @deprecated DANGEROUS on a shared crawler — enumerates and stops EVERY running
 * job, including other users'/instances' jobs. Use `stopCrawlerJobs(jobIds)` with
 * ids from our own DB instead. Retained only for the legacy worker import.
 */
export async function stopAllCrawlerJobs(userId?: string | null): Promise<void> {
  try {
    const { baseUrl, apiKey } = await getConfig(userId);
    if (!baseUrl) return;
    const headers = makeHeaders(apiKey);
    const res = await axios.get(`${baseUrl}/api/jobs?limit=50`, { headers, timeout: 10000 });
    const jobs: CrawlerJobResponse[] = res.data;
    const running = jobs.filter(j => j.status === 'running' || j.status === 'pending' || j.status === 'paused');
    for (const job of running) {
      try {
        await axios.post(`${baseUrl}/api/jobs/${job.id}/stop`, {}, { headers, timeout: 10000 });
        console.log(`[CrawlerClient] Stopped crawler job ${job.id} (${job.keyword})`);
      } catch { /* ignore individual failures */ }
    }
    if (running.length > 0) {
      console.log(`[CrawlerClient] Stopped ${running.length} running crawler job(s).`);
    }
  } catch (err: any) {
    console.error(`[CrawlerClient] stopAllCrawlerJobs failed: ${err.message}`);
  }
}

async function pollJob(
  jobId: number,
  baseUrl: string,
  apiKey: string | undefined,
  onProgress?: (processed: number, total: number) => void,
  shouldCancel?: () => Promise<boolean>,
): Promise<'completed' | 'timeout' | 'stopped'> {
  const headers = makeHeaders(apiKey);
  // Combined Web+Maps searches at high max_results are slow on modest hardware.
  // Give them room; partial-result fetch on exit is the safety net so a long
  // search never silently yields zero leads.
  const maxWaitMs = 40 * 60 * 1000;
  const intervalMs = 3000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    if (shouldCancel) {
      const cancelled = await shouldCancel();
      if (cancelled) {
        console.log(`[CrawlerClient] Cancel requested — stopping crawler job ${jobId}`);
        try { await axios.post(`${baseUrl}/api/jobs/${jobId}/stop`, {}, { headers, timeout: 10000 }); } catch { /* ignore */ }
        throw new Error(`Crawler job ${jobId} cancelled by user`);
      }
    }

    await new Promise((r) => setTimeout(r, intervalMs));
    let res;
    try {
      res = await axios.get(`${baseUrl}/api/jobs/${jobId}`, { headers, timeout: 15000 });
    } catch (pollErr: any) {
      // Transient errors (502, 504, ECONNRESET) — retry instead of failing
      console.warn(`[CrawlerClient] Poll error for job ${jobId}: ${pollErr.message} — retrying...`);
      continue;
    }
    const job: CrawlerJobResponse = res.data;

    if (onProgress && job.total_urls > 0) {
      onProgress(job.processed_urls, job.total_urls);
    }

    if (job.status === 'completed') return 'completed';
    // A 'stopped' job has usually already crawled some sites — do NOT discard them;
    // return so the caller fetches whatever the crawler persisted.
    if (job.status === 'stopped') {
      console.warn(`[CrawlerClient] Job ${jobId} stopped — fetching partial results.`);
      return 'stopped';
    }
    if (job.status === 'failed') {
      throw new Error(`Crawler job ${jobId} failed: ${job.error || 'unknown error'}`);
    }
  }

  // Timed out: stop the crawler to free resources, but RETURN (don't throw) so the
  // caller still ingests the leads found so far. Throwing here was discarding a
  // full crawl's worth of results on every long search.
  const mins = Math.round(maxWaitMs / 60000);
  console.warn(`[CrawlerClient] Job ${jobId} exceeded ${mins} min — stopping and fetching partial results.`);
  try { await axios.post(`${baseUrl}/api/jobs/${jobId}/stop`, {}, { headers, timeout: 10000 }); } catch { /* ignore */ }
  return 'timeout';
}

async function fetchResults(jobId: number, baseUrl: string, apiKey: string | undefined): Promise<CrawlerBusiness[]> {
  const headers = makeHeaders(apiKey);
  const all: CrawlerBusiness[] = [];
  let page = 1;
  const pageSize = 100;
  let lastError: any = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      while (true) {
        const res = await axios.get<CrawlerResultsResponse>(
          `${baseUrl}/api/searches/${jobId}/results`,
          { headers, params: { page, page_size: pageSize }, timeout: 20000 }
        );
        const data = res.data;
        for (const item of data.items) {
          all.push({
            domain: item.domain,
            url: item.url,
            title: item.title,
            companyName: item.company_name,
            address: item.address,
            contactPage: item.contact_page,
            source: item.source || 'web',
            relevance: item.relevance || 0,
            rating: item.rating ?? null,
            reviewsCount: item.reviews_count ?? null,
            category: item.category ?? null,
            emails: (item.emails || []).map((e) => ({ value: e.value, sourceUrl: e.source_url })),
            phones: (item.phones || []).map((p) => ({ value: p.value, sourceUrl: p.source_url })),
            socials: (item.socials || []).map((s) => ({ value: s.value, platform: s.platform, sourceUrl: s.source_url })),
            contactForms: (item.contact_forms || []).map((f) => ({ value: f.value, sourceUrl: f.source_url })),
          });
        }
        if (page >= data.pages) break;
        page++;
      }
      return all;
    } catch (err: any) {
      lastError = err;
      console.warn(`[CrawlerClient] fetchResults attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt < 2) await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw lastError || new Error('fetchResults failed');
}

export async function searchAndCrawl(params: {
  keyword: string;
  region?: string;
  maxResults?: number;
  source?: 'web' | 'google_maps' | 'combined';
  proxyscrapeEnabled?: boolean;
  userId?: string | null;
  onProgress?: (processed: number, total: number) => void;
  shouldCancel?: () => Promise<boolean>;
}): Promise<SearchAndCrawlResult> {
  const { baseUrl, apiKey } = await getConfig(params.userId);
  if (!baseUrl) {
    console.warn('[CrawlerClient] No crawlerBaseUrl set — returning empty results.');
    return { results: [], jobId: 0 };
  }

  // Health check — fail fast if crawler is offline (tunnel down, PC off, etc.)
  const headers = makeHeaders(apiKey);
  try {
    await axios.get(`${baseUrl}/health`, { headers, timeout: 8000, validateStatus: (s) => s < 500 });
  } catch (healthErr: any) {
    console.error(`[CrawlerClient] Crawler offline at ${baseUrl}: ${healthErr.message}`);
    throw new Error(`Crawler is offline. Start the crawler on your PC/VPS. (${healthErr.message})`);
  }

  const region = params.region || 'us-en';
  const maxResults = params.maxResults || 350;
  const source = params.source || 'web';
  const proxyscrapeEnabled = params.proxyscrapeEnabled ?? true;

  console.log(`[CrawlerClient] Starting search+crawl: keyword="${params.keyword}" region=${region} max=${maxResults} source=${source} proxies=${proxyscrapeEnabled}`);
  const startRes = await axios.post(
    `${baseUrl}/api/search`,
    {
      keyword: params.keyword,
      max_results: maxResults,
      region,
      source,
      emails_only: false,
      proxyscrape_enabled: proxyscrapeEnabled,
    },
    { headers, timeout: 15000 }
  );
  const jobId: number = startRes.data.id;
  console.log(`[CrawlerClient] Crawler job ${jobId} started for "${params.keyword}"`);

  const outcome = await pollJob(jobId, baseUrl, apiKey, params.onProgress, params.shouldCancel);
  const results = await fetchResults(jobId, baseUrl, apiKey);
  console.log(`[CrawlerClient] Job ${jobId} ${outcome} — ${results.length} businesses with contacts${outcome !== 'completed' ? ' (partial)' : ''}`);

  return { results, jobId };
}

export async function searchWeb(
  query: string,
  userId?: string | null,
  maxResults?: number
): Promise<CrawlerSearchResult[]> {
  const { baseUrl, apiKey } = await getConfig(userId);
  if (!baseUrl) {
    console.warn('[CrawlerClient] No crawlerBaseUrl set — returning empty search results.');
    return [];
  }

  const headers = makeHeaders(apiKey);
  const num = maxResults || 10;

  try {
    const res = await axios.get(`${baseUrl}/api/search-web`, {
      headers,
      params: { q: query, max_results: num, region: 'us-en' },
      timeout: 60000,
    });
    return (res.data.results || []) as CrawlerSearchResult[];
  } catch (error: any) {
    console.error(`[CrawlerClient] searchWeb error: ${error.message}`);
    return [];
  }
}

export async function searchMaps(
  query: string,
  userId?: string | null,
  maxResults?: number
): Promise<CrawlerBusiness[]> {
  const { results } = await searchAndCrawl({
    keyword: query,
    source: 'google_maps',
    maxResults: maxResults || 350,
    userId,
  });
  return results;
}

const COUNTRY_KEYWORDS: Record<string, string[]> = {
  'united states': ['united states', 'usa', 'u.s.a.', 'united states of america'],
  'united kingdom': ['united kingdom', 'uk', 'u.k.', 'england', 'scotland', 'wales', 'northern ireland', 'great britain'],
  canada: ['canada'],
  australia: ['australia'],
  germany: ['germany', 'deutschland'],
  france: ['france'],
  spain: ['spain', 'españa'],
  italy: ['italy'],
  netherlands: ['netherlands', 'holland'],
  india: ['india'],
  ireland: ['ireland'],
  'new zealand': ['new zealand'],
  'south africa': ['south africa'],
};

export function isWrongCountry(address: string | null | undefined, requestedCountry: string): boolean {
  if (!address || !requestedCountry) return false;
  const addr = address.toLowerCase();
  const req = requestedCountry.toLowerCase().trim();

  // Normalize requested country to its canonical key
  let requestedKey: string | null = null;
  for (const [key, aliases] of Object.entries(COUNTRY_KEYWORDS)) {
    if (key === req || aliases.includes(req)) {
      requestedKey = key;
      break;
    }
  }
  if (!requestedKey) return false; // Unknown requested country, don't filter

  // Check if any OTHER country is mentioned in the address
  for (const [key, aliases] of Object.entries(COUNTRY_KEYWORDS)) {
    if (key === requestedKey) continue;
    if (aliases.some(a => addr.includes(a))) return true;
  }

  return false;
}
