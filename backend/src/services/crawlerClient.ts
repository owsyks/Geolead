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

interface CrawlerJobResponse {
  id: number;
  keyword: string;
  status: string;
  totalUrls: number;
  processedUrls: number;
  contactsFound: number;
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

async function pollJob(
  jobId: number,
  baseUrl: string,
  apiKey: string | undefined,
  onProgress?: (processed: number, total: number) => void
): Promise<void> {
  const headers = makeHeaders(apiKey);
  const maxWaitMs = 5 * 60 * 1000;
  const intervalMs = 3000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await axios.get(`${baseUrl}/api/jobs/${jobId}`, { headers, timeout: 10000 });
    const job: CrawlerJobResponse = res.data;

    if (onProgress && job.totalUrls > 0) {
      onProgress(job.processedUrls, job.totalUrls);
    }

    if (job.status === 'completed') return;
    if (job.status === 'failed' || job.status === 'stopped') {
      throw new Error(`Crawler job ${jobId} ${job.status}: ${job.error || 'unknown error'}`);
    }
  }
  throw new Error(`Crawler job ${jobId} timed out after 5 minutes`);
}

async function fetchResults(jobId: number, baseUrl: string, apiKey: string | undefined): Promise<CrawlerBusiness[]> {
  const headers = makeHeaders(apiKey);
  const all: CrawlerBusiness[] = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const res = await axios.get<CrawlerResultsResponse>(
      `${baseUrl}/api/searches/${jobId}/results`,
      { headers, params: { page, page_size: pageSize }, timeout: 15000 }
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
}

export async function searchAndCrawl(params: {
  keyword: string;
  region?: string;
  maxResults?: number;
  source?: 'web' | 'google_maps' | 'combined';
  proxyscrapeEnabled?: boolean;
  userId?: string | null;
  onProgress?: (processed: number, total: number) => void;
}): Promise<CrawlerBusiness[]> {
  const { baseUrl, apiKey } = await getConfig(params.userId);
  if (!baseUrl) {
    console.warn('[CrawlerClient] No crawlerBaseUrl set — returning empty results.');
    return [];
  }

  const region = params.region || 'us-en';
  const maxResults = params.maxResults || 20;
  const source = params.source || 'combined';
  const proxyscrapeEnabled = params.proxyscrapeEnabled ?? true;

  console.log(`[CrawlerClient] Starting search+crawl: keyword="${params.keyword}" region=${region} max=${maxResults} source=${source} proxies=${proxyscrapeEnabled}`);

  const headers = makeHeaders(apiKey);
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

  await pollJob(jobId, baseUrl, apiKey, params.onProgress);
  const results = await fetchResults(jobId, baseUrl, apiKey);
  console.log(`[CrawlerClient] Job ${jobId} complete — ${results.length} businesses with contacts`);

  return results;
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
  return searchAndCrawl({
    keyword: query,
    source: 'google_maps',
    maxResults: maxResults || 10,
    userId,
  });
}
