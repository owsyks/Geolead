import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  decodeCloudflareEmail,
  extractEmailCandidates,
  extractPhoneCandidates,
  normalizeEmail,
  normalizePhone,
  normalizePhoneList,
} from './contactUtils.js';

export interface CrawlResult {
  emails: { email: string; sourcePage: string }[];
  phones: string[];
  socials: string[];
  pageTitle?: string;
  companySize: 'Small' | 'Medium' | 'Large' | 'Unknown';
  hasContactForm: boolean;
  notes: string;
}

// User agent to mimic a polite crawler
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 GeoLeadAI/1.0';

/**
 * Crawls a website to extract email, phone, social links, contact forms, and company size signal.
 */
export async function crawlWebsite(url: string, maxInnerPages = 4): Promise<CrawlResult> {
  const result: CrawlResult = {
    emails: [],
    phones: [],
    socials: [],
    companySize: 'Unknown',
    hasContactForm: false,
    notes: ''
  };

  if (!url) return result;

  // Clean and prepare the URL
  let targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'http://' + targetUrl;
  }

  try {
    const domain = normalizeHost(new URL(targetUrl).hostname);

    console.log(`[Crawler] Starting crawl for: ${targetUrl}`);
    const homepageFetch = await fetchFirstHtml(buildFetchCandidates(targetUrl));
    const homepageHtml = homepageFetch?.html;
    if (!homepageHtml) {
      console.log(`[Crawler] Homepage fetch failed for ${targetUrl}. No contacts extracted.`);
      return {
        ...result,
        notes: 'Homepage fetch failed or timed out. No generated fallback contacts were added.'
      };
    }
    targetUrl = homepageFetch.url;

    const $ = cheerio.load(homepageHtml);
    result.pageTitle = extractPageTitle($);

    // Scan raw HTML before removing scripts/templates so JSON-LD and encoded attributes can contribute.
    extractContactsFromText(homepageHtml, targetUrl, result);
    extractContactsFromHtml($, targetUrl, result);

    $('script, style, noscript, svg, iframe, template').remove();
    const textContent = $('body').text();

    // 1. Extract from homepage
    extractContactsFromText(textContent, targetUrl, result);
    extractSocialsFromHtml($, targetUrl, result);
    detectContactForm($, result);
    detectCompanySize(textContent, result);

    // 2. Find Contact/About links to scrape
    const innerLinks: InnerLink[] = [];
    $('a[href]').each((index, el) => {
      const href = $(el).attr('href')?.trim();
      if (!href) return;

      try {
        const absoluteUrl = new URL(href, targetUrl).toString();
        const absoluteUrlObj = new URL(absoluteUrl);
        
        // Ensure same domain
        if (normalizeHost(absoluteUrlObj.hostname) === domain) {
          const path = absoluteUrlObj.pathname.toLowerCase();
          const anchorText = $(el).text().trim().toLowerCase();
          const rank = rankContactLink(path, anchorText);
          if (rank > 0) {
            innerLinks.push({ url: stripHash(absoluteUrl), rank, index });
          }
        }
      } catch (err) {
        // Ignore invalid URL formatting
      }
    });

    addLikelyContactFallbacks(targetUrl, innerLinks);

    const uniqueInnerLinks = Array.from(
      innerLinks
        .sort((a, b) => b.rank - a.rank || a.index - b.index)
        .reduce<Map<string, InnerLink>>((acc, link) => {
          const existing = acc.get(link.url);
          if (!existing || existing.rank < link.rank) {
            acc.set(link.url, link);
          }
          return acc;
        }, new Map())
        .values()
    ).slice(0, maxInnerPages);

    for (const innerLink of uniqueInnerLinks) {
      console.log(`[Crawler] Crawling inner page: ${innerLink.url}`);
      const innerHtml = await fetchHtml(innerLink.url);
      if (innerHtml) {
        const $inner = cheerio.load(innerHtml);
        extractContactsFromText(innerHtml, innerLink.url, result);
        extractContactsFromHtml($inner, innerLink.url, result);
        $inner('script, style, noscript, svg, iframe, template').remove();
        const innerText = $inner('body').text();
        extractContactsFromText(innerText, innerLink.url, result);
        extractSocialsFromHtml($inner, innerLink.url, result);
        detectContactForm($inner, result);
        detectCompanySize(innerText, result);
      }
    }

    // Clean up lists (unique values)
    const seenEmails = new Set<string>();
    result.emails = result.emails.filter(item => {
      const emailLower = item.email.toLowerCase();
      if (seenEmails.has(emailLower)) return false;
      seenEmails.add(emailLower);
      return true;
    });

    result.phones = Array.from(new Set(result.phones));
    result.socials = Array.from(new Set(result.socials));

    if (result.emails.length === 0 && result.phones.length === 0) {
      result.notes = 'Crawled homepage and contact pages successfully. No public contact emails or phones found on site text.';
    } else {
      result.notes = `Successfully crawled. Extracted ${result.emails.length} email(s) and ${result.phones.length} phone number(s).`;
    }

  } catch (error: any) {
    console.error(`[Crawler] Failed crawling ${url}: ${error.message}. No generated fallback contacts were added.`);
    return {
      ...result,
      notes: `Crawl failed: ${error.message}. No generated fallback contacts were added.`
    };
  }

  return result;
}

/**
 * Helper to fetch HTML from a URL with timeout and User-Agent headers.
 */
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 8000,
      maxRedirects: 3,
    });
    return response.data;
  } catch (error: any) {
    return null;
  }
}

async function fetchFirstHtml(urls: string[]): Promise<{ url: string; html: string } | null> {
  for (const url of urls) {
    const html = await fetchHtml(url);
    if (html) {
      return { url, html };
    }
  }

  return null;
}

/**
 * Extracts emails and phone numbers from raw string content.
 */
function extractContactsFromText(text: string, sourcePage: string, result: CrawlResult) {
  result.emails.push(
    ...extractEmailCandidates(text, sourcePage).map((item) => ({
      email: item.email,
      sourcePage,
    }))
  );

  const phonesFound = extractPhoneCandidates(text);
  result.phones.push(...normalizePhoneList(phonesFound, 2));
}

function extractContactsFromHtml($: cheerio.CheerioAPI, sourcePage: string, result: CrawlResult) {
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href) return;

    if (href.toLowerCase().startsWith('mailto:')) {
      result.emails.push(...extractEmailCandidates(href.replace(/^mailto:/i, ''), sourcePage).map((item) => ({
        email: item.email,
        sourcePage,
      })));
    }

    if (href.toLowerCase().startsWith('tel:')) {
      const phone = normalizePhone(href.replace(/^tel:/i, '').trim());
      if (phone) {
        result.phones.push(phone);
      }
    }
  });

  $('[data-cfemail]').each((_, el) => {
    const encoded = $(el).attr('data-cfemail');
    const email = encoded ? decodeCloudflareEmail(encoded) : null;
    if (email) {
      result.emails.push({ email, sourcePage });
    }
  });

  $('a[href*="/cdn-cgi/l/email-protection#"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const encoded = href.split('#')[1];
    const email = encoded ? decodeCloudflareEmail(encoded) : null;
    if (email) {
      result.emails.push({ email, sourcePage });
    }
  });

  $('[href], [content], [value], [data-email], [data-mail], [aria-label], [title]').each((_, el) => {
    const attribs = (el as any).attribs as Record<string, string> | undefined;
    if (!attribs) return;

    Object.values(attribs).forEach((value) => {
      result.emails.push(...extractEmailCandidates(value, sourcePage).map((item) => ({
        email: normalizeEmail(item.email),
        sourcePage,
      })));
    });
  });
}

interface InnerLink {
  url: string;
  rank: number;
  index: number;
}

function buildFetchCandidates(url: string): string[] {
  const candidates = [url];

  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
      candidates.push(parsed.toString());
    }
  } catch {
    return candidates;
  }

  return Array.from(new Set(candidates));
}

function addLikelyContactFallbacks(baseUrl: string, innerLinks: InnerLink[]) {
  const fallbackPaths = [
    '/contact',
    '/contact-us',
    '/about',
    '/about-us',
    '/team',
    '/locations',
    '/request-a-quote',
    '/free-estimate',
  ];

  fallbackPaths.forEach((path, index) => {
    try {
      const url = new URL(path, baseUrl).toString();
      innerLinks.push({ url: stripHash(url), rank: 40 - index, index: 10000 + index });
    } catch {
      // Ignore malformed base URLs.
    }
  });
}

function rankContactLink(path: string, anchorText: string): number {
  const target = `${path} ${anchorText}`;

  if (/\b(contact|contact-us|contactus|get-in-touch|reach-us|email-us|send-message)\b/i.test(target)) return 100;
  if (/\b(quote|estimate|request|consultation|appointment|book)\b/i.test(target)) return 85;
  if (/\b(location|locations|service-area|areas-served)\b/i.test(target)) return 70;
  if (/\b(team|staff|people|directory)\b/i.test(target)) return 60;
  if (/\b(about|company|who-we-are)\b/i.test(target)) return 50;
  if (/\b(support|help|customer-service|info)\b/i.test(target)) return 45;
  if (/\b(service|services)\b/i.test(target)) return 25;

  return 0;
}

function stripHash(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./i, '');
}

function extractPageTitle($: cheerio.CheerioAPI): string | undefined {
  const siteName = $('meta[property="og:site_name"]').attr('content')?.trim();
  const title = $('title').first().text().trim();
  const value = siteName || title;

  if (!value) {
    return undefined;
  }

  return value
    .replace(/\s+/g, ' ')
    .split(/\s(?:\||-|\u2013|\u2014)\s/)[0]
    ?.trim();
}

/**
 * Extracts social media links from anchors.
 */
function extractSocialsFromHtml($: cheerio.CheerioAPI, sourcePage: string, result: CrawlResult) {
  const socialDomains = ['linkedin.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'youtube.com'];
  
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href) return;

    socialDomains.forEach(domain => {
      if (href.includes(domain)) {
        result.socials.push(href);
      }
    });
  });
}

/**
 * Detects if a page has a form that looks like a contact form.
 */
function detectContactForm($: cheerio.CheerioAPI, result: CrawlResult) {
  if (result.hasContactForm) return;

  $('form').each((_, el) => {
    const formHtml = $(el).html() || '';
    const formText = $(el).text().toLowerCase();
    
    // Check if form contains input elements or contact keywords
    if (
      formHtml.includes('type="email"') ||
      formText.includes('message') ||
      formText.includes('contact') ||
      formText.includes('submit')
    ) {
      result.hasContactForm = true;
    }
  });
}

/**
 * Detects company size signal based on text content heuristics.
 */
function detectCompanySize(text: string, result: CrawlResult) {
  const textLower = text.toLowerCase();
  
  // Heuristic keywords
  const smallKeywords = ['small team', 'family owned', 'local shop', 'boutique agency', 'independent contractor'];
  const largeKeywords = ['fortune 500', 'global offices', 'over 500 employees', 'multinational', 'worldwide headquarters', 'enterprise solutions'];
  const mediumKeywords = ['over 50 employees', 'growing team', 'established in', 'multiple locations', 'regional office'];

  let smallScore = 0;
  let mediumScore = 0;
  let largeScore = 0;

  smallKeywords.forEach(kw => { if (textLower.includes(kw)) smallScore += 2; });
  mediumKeywords.forEach(kw => { if (textLower.includes(kw)) mediumScore += 2; });
  largeKeywords.forEach(kw => { if (textLower.includes(kw)) largeScore += 2; });

  if (smallScore > mediumScore && smallScore > largeScore) {
    result.companySize = 'Small';
  } else if (largeScore > smallScore && largeScore > mediumScore) {
    result.companySize = 'Large';
  } else if (mediumScore > 0) {
    result.companySize = 'Medium';
  } else {
    // Default to Small if it seems like a typical local business
    result.companySize = result.companySize === 'Unknown' ? 'Small' : result.companySize;
  }
}
