import axios from 'axios';
import { extractEmailCandidates, extractPhoneCandidates } from './contactUtils.js';
import type { CrawlerBusiness } from './crawlerClient.js';

interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

interface SerperResponse {
  organic: SerperResult[];
}

function getKeys(): string[] {
  return [
    process.env.SERPER_API_KEY_1,
    process.env.SERPER_API_KEY_2,
    process.env.SERPER_API_KEY_3,
  ].filter(Boolean) as string[];
}

async function fetchPageText(url: string): Promise<string> {
  const res = await axios.get(url, {
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
    validateStatus: (s) => s < 400,
  });
  return typeof res.data === 'string' ? res.data : '';
}

export async function searchWithSerper(query: string, apiKey: string): Promise<CrawlerBusiness[]> {
  const res = await axios.post<SerperResponse>(
    'https://google.serper.dev/search',
    { q: query, gl: 'us', hl: 'en', num: 10 },
    {
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      timeout: 15000,
    },
  );

  const organic = res.data.organic || [];
  const businesses: CrawlerBusiness[] = [];

  for (const r of organic) {
    let domain = '';
    try { domain = new URL(r.link).hostname.replace(/^www\./, ''); } catch { domain = r.link; }

    let emails: { value: string; sourceUrl: string }[] = [];
    let phones: { value: string; sourceUrl: string }[] = [];

    try {
      const html = await fetchPageText(r.link);
      const emailCandidates = extractEmailCandidates(html);
      const phoneCandidates = extractPhoneCandidates(html);
      emails = emailCandidates.map(e => ({ value: e.email, sourceUrl: r.link }));
      phones = phoneCandidates.map(p => ({ value: p, sourceUrl: r.link }));
    } catch {
      // page unreadable — still include the business, enrichment will try again
    }

    const companyName = r.title
      ?.split(/[|–—]/)[0]
      ?.replace(/^https?:\/\//, '')
      ?.trim() || r.title || domain;

    businesses.push({
      domain,
      url: r.link,
      title: r.title || null,
      companyName,
      address: null,
      contactPage: null,
      source: 'web',
      relevance: Math.max(0.1, 1 - (r.position - 1) * 0.09),
      rating: null,
      reviewsCount: null,
      category: null,
      emails,
      phones,
      socials: [],
      contactForms: [],
    });
  }

  return businesses;
}

export { getKeys as getSerperKeys };
