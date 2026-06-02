import axios from 'axios';
import * as cheerio from 'cheerio';

const HTTP_TIMEOUT_MS = 6000;
const USER_AGENT = 'Mozilla/5.0 (compatible; GeoLeadAI-Verifier/1.0)';
const companyIntelCache = new Map<string, Promise<CompanyIntelResult>>();

export interface CompanyIntelResult {
  websiteReachable: boolean;
  statusCode: number | null;
  redirectedTo: string | null;
  hasTitle: boolean;
  title: string | null;
  hasFavicon: boolean;
  hasContactPage: boolean;
  hasAboutPage: boolean;
  socialLinkCount: number;
  socialPlatforms: string[];
  staffNames: string[]; // extracted from team/about pages
  pageWordCount: number;
  parkedDomain: boolean;
  underConstruction: boolean;
  ageActivitySignal: 'active' | 'stale' | 'dead' | 'unknown';
}

export async function getCompanyIntel(domain: string): Promise<CompanyIntelResult> {
  const key = domain.toLowerCase();
  const cached = companyIntelCache.get(key);
  if (cached) return cached;
  const promise = performCompanyIntel(key);
  companyIntelCache.set(key, promise);
  return promise;
}

async function performCompanyIntel(domain: string): Promise<CompanyIntelResult> {
  const empty: CompanyIntelResult = {
    websiteReachable: false,
    statusCode: null,
    redirectedTo: null,
    hasTitle: false,
    title: null,
    hasFavicon: false,
    hasContactPage: false,
    hasAboutPage: false,
    socialLinkCount: 0,
    socialPlatforms: [],
    staffNames: [],
    pageWordCount: 0,
    parkedDomain: false,
    underConstruction: false,
    ageActivitySignal: 'unknown',
  };

  const urls = [`https://${domain}`, `https://www.${domain}`, `http://${domain}`];
  let response: any = null;
  for (const url of urls) {
    try {
      response = await axios.get(url, {
        timeout: HTTP_TIMEOUT_MS,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
        maxRedirects: 5,
        validateStatus: (s) => s < 500,
      });
      if (response.status < 400) break;
    } catch {
      continue;
    }
  }

  if (!response) return empty;

  empty.websiteReachable = response.status < 400;
  empty.statusCode = response.status;
  empty.redirectedTo = response.request?.res?.responseUrl || null;

  if (!empty.websiteReachable || typeof response.data !== 'string') return empty;

  const html = response.data;
  const $ = cheerio.load(html);

  empty.title = ($('title').first().text() || '').trim().slice(0, 200) || null;
  empty.hasTitle = !!empty.title;
  empty.hasFavicon = $('link[rel*="icon"]').length > 0;

  // Detect contact and about pages by links
  const links = $('a[href]').map((_, el) => $(el).attr('href') || '').get();
  empty.hasContactPage = links.some((h) => /contact/i.test(h));
  empty.hasAboutPage = links.some((h) => /about|team|company/i.test(h));

  // Social platforms
  const socialPatterns: Array<[string, RegExp]> = [
    ['linkedin', /linkedin\.com/i],
    ['twitter', /(twitter\.com|x\.com)/i],
    ['facebook', /facebook\.com/i],
    ['instagram', /instagram\.com/i],
    ['youtube', /youtube\.com/i],
    ['tiktok', /tiktok\.com/i],
    ['github', /github\.com/i],
  ];
  const found = new Set<string>();
  for (const href of links) {
    for (const [name, pattern] of socialPatterns) {
      if (pattern.test(href)) found.add(name);
    }
  }
  empty.socialPlatforms = Array.from(found);
  empty.socialLinkCount = empty.socialPlatforms.length;

  // Body text + word count
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  empty.pageWordCount = bodyText.split(' ').filter(Boolean).length;

  // Parked / under construction heuristics
  const lowerBody = bodyText.toLowerCase();
  empty.parkedDomain =
    /this domain is for sale|buy this domain|domain parked|godaddy parking/i.test(lowerBody) ||
    /^(parked|domain for sale|coming soon)$/i.test(empty.title || '');
  empty.underConstruction =
    /under construction|site coming soon|website coming soon/i.test(lowerBody) ||
    empty.pageWordCount < 30;

  // Extract candidate staff names from common patterns (h-card, schema.org Person, team sections)
  empty.staffNames = extractStaffNames($, html);

  // Activity heuristic
  if (empty.parkedDomain || empty.underConstruction) {
    empty.ageActivitySignal = 'dead';
  } else if (empty.pageWordCount > 200 && (empty.hasContactPage || empty.socialLinkCount > 0)) {
    empty.ageActivitySignal = 'active';
  } else if (empty.pageWordCount < 100) {
    empty.ageActivitySignal = 'stale';
  } else {
    empty.ageActivitySignal = 'active';
  }

  return empty;
}

function extractStaffNames($: cheerio.CheerioAPI, html: string): string[] {
  const names = new Set<string>();

  // schema.org Person JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    if (!raw) return;
    try {
      const json = JSON.parse(raw);
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        collectPersonNames(item, names);
      }
    } catch { /* ignore */ }
  });

  // Common patterns: .team-member, [itemprop="name"]
  $('.team-member, .team .member, .staff-card, [itemprop="name"]').each((_, el) => {
    const text = $(el).text().trim();
    if (looksLikePersonName(text)) names.add(text);
  });

  // <meta name="author">
  $('meta[name="author"]').each((_, el) => {
    const c = $(el).attr('content');
    if (c && looksLikePersonName(c)) names.add(c);
  });

  return Array.from(names).slice(0, 50);
}

function collectPersonNames(node: any, names: Set<string>) {
  if (!node || typeof node !== 'object') return;
  const type = node['@type'] || node.type;
  if (type === 'Person' && typeof node.name === 'string' && looksLikePersonName(node.name)) {
    names.add(node.name);
  }
  for (const key of Object.keys(node)) {
    const val = node[key];
    if (Array.isArray(val)) val.forEach((v) => collectPersonNames(v, names));
    else if (typeof val === 'object') collectPersonNames(val, names);
  }
}

function looksLikePersonName(s: string): boolean {
  if (!s) return false;
  const trimmed = s.trim();
  if (trimmed.length < 4 || trimmed.length > 60) return false;
  // 2-4 words, each capitalised
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2 || parts.length > 4) return false;
  return parts.every((p) => /^[A-Z][a-zA-Z'-]+$/.test(p));
}
