import axios from 'axios';
import * as cheerio from 'cheerio';

export interface WebsiteIntel {
  website?: string;
  pageTitle?: string;
  metaDescription?: string;
  detectedNiche?: string;
  slogans: string[];
  services: string[];
  summary: string;
  painPointSignals: string[];
  sourceStatus: 'SCRAPED' | 'SKIPPED' | 'FAILED';
}

const USER_AGENT = 'GeoLeadAI-OutboundIntel/1.0 (+https://geoleadai.com)';
const SERVICE_KEYWORDS = [
  'service',
  'services',
  'repair',
  'installation',
  'maintenance',
  'sales',
  'dealership',
  'contractor',
  'roofing',
  'dental',
  'plumbing',
  'law',
  'clinic',
  'real estate',
  'insurance',
  'cleaning',
  'consulting',
  'marketing',
  'auto',
  'truck',
  'hvac',
  'landscaping',
];

const PAIN_POINT_SIGNALS = [
  'family owned',
  'locally owned',
  'same day',
  'emergency',
  'free estimate',
  'financing',
  'used',
  'certified',
  'licensed',
  'insured',
  'trusted',
  'serving',
  'appointments',
  'quote',
];

export async function analyzeWebsiteForOutbound(website?: string): Promise<WebsiteIntel> {
  if (!website) {
    return {
      slogans: [],
      services: [],
      summary: 'No website was provided, so personalization used lead metadata only.',
      painPointSignals: [],
      sourceStatus: 'SKIPPED',
    };
  }

  const targetUrl = normalizeWebsiteUrl(website);

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 7000,
      maxRedirects: 3,
    });

    const $ = cheerio.load(String(response.data || ''));
    const pageTitle = cleanText($('meta[property="og:site_name"]').attr('content') || $('title').first().text());
    const metaDescription = cleanText(
      $('meta[name="description"]').attr('content') ||
        $('meta[property="og:description"]').attr('content') ||
        ''
    );

    $('script, style, noscript, svg, iframe, template').remove();
    const headings = $('h1, h2, h3')
      .map((_, el) => cleanText($(el).text()))
      .get()
      .filter((value) => value.length >= 8 && value.length <= 120);

    const paragraphs = $('p, li')
      .map((_, el) => cleanText($(el).text()))
      .get()
      .filter((value) => value.length >= 24 && value.length <= 240)
      .slice(0, 12);

    const allText = cleanText(`${pageTitle} ${metaDescription} ${headings.join(' ')} ${paragraphs.join(' ')}`);
    const services = extractServices(allText, headings, paragraphs);
    const slogans = headings.slice(0, 4);
    const painPointSignals = PAIN_POINT_SIGNALS.filter((signal) => allText.toLowerCase().includes(signal));
    const detectedNiche = detectNiche(allText, services);
    const summary = buildSummary({
      pageTitle,
      metaDescription,
      slogans,
      services,
      detectedNiche,
      fallbackText: paragraphs[0],
    });

    return {
      website: targetUrl,
      pageTitle,
      metaDescription,
      detectedNiche,
      slogans,
      services,
      summary,
      painPointSignals,
      sourceStatus: 'SCRAPED',
    };
  } catch (error: any) {
    return {
      website: targetUrl,
      slogans: [],
      services: [],
      summary: `Website analysis failed: ${error.message}. Personalization used lead metadata only.`,
      painPointSignals: [],
      sourceStatus: 'FAILED',
    };
  }
}

function normalizeWebsiteUrl(website: string) {
  const trimmed = website.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function cleanText(value: string | undefined) {
  return (value || '')
    .replace(/\s+/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim();
}

function detectNiche(text: string, services: string[]) {
  const lowerText = text.toLowerCase();
  const serviceHit = services[0];
  if (serviceHit) {
    return serviceHit;
  }

  return SERVICE_KEYWORDS.find((keyword) => lowerText.includes(keyword)) || 'local business';
}

function extractServices(text: string, headings: string[], paragraphs: string[]) {
  const lowerText = text.toLowerCase();
  const keywordHits = SERVICE_KEYWORDS.filter((keyword) => lowerText.includes(keyword));
  const phraseHits = [...headings, ...paragraphs]
    .filter((item) => /service|repair|sales|contractor|clinic|dealer|installation|maintenance|estimate/i.test(item))
    .slice(0, 5);

  return Array.from(new Set([...keywordHits, ...phraseHits])).slice(0, 6);
}

function buildSummary(input: {
  pageTitle?: string;
  metaDescription?: string;
  slogans: string[];
  services: string[];
  detectedNiche?: string;
  fallbackText?: string;
}) {
  const leadIn = input.pageTitle ? `${input.pageTitle}` : 'This business';
  const descriptor =
    input.metaDescription ||
    input.fallbackText ||
    (input.services.length > 0 ? `Highlights ${input.services.slice(0, 3).join(', ')}.` : '');
  const niche = input.detectedNiche ? `Likely niche: ${input.detectedNiche}.` : '';
  const slogan = input.slogans[0] ? `Homepage signal: "${input.slogans[0]}".` : '';

  return [leadIn, descriptor, niche, slogan].filter(Boolean).join(' ');
}
