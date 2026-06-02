// Domain Portfolio service. Owns CRUD, bulk import, AI categorization,
// recommendations, buyer/offer/sale tracking, and dashboard aggregations.
// All workflows in the app should source the active domain from here so the
// user never re-types a domain name.
import type { Prisma } from '@prisma/client';
import prisma from '../config/db.js';

export const DOMAIN_STATUSES = [
  'Available',
  'Prospecting',
  'Contacting Buyers',
  'Negotiating',
  'Sold',
  'Archived',
] as const;
export type DomainStatus = typeof DOMAIN_STATUSES[number];

export interface DomainInput {
  name: string;
  status?: string;
  purchaseDate?: string | Date | null;
  purchasePrice?: number | null;
  registrar?: string | null;
  expirationDate?: string | Date | null;
  category?: string | null;
  niche?: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  tags?: string[];
  targetIndustries?: string[];
  targetLocations?: string[];
  notes?: string | null;
}

export interface BulkImportInput {
  rows: Array<DomainInput | string>;
  defaultStatus?: string;
}

export interface BuyerInput {
  businessName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  location?: string;
  industry?: string;
  buyerScore?: number;
  status?: string;
  notes?: string;
  leadId?: string;
}

export interface OfferInput {
  amount: number;
  currency?: string;
  direction?: string;
  status?: string;
  buyerId?: string;
  notes?: string;
  receivedAt?: string | Date;
}

export interface SaleInput {
  buyerName: string;
  buyerEmail?: string;
  salePrice: number;
  currency?: string;
  saleDate?: string | Date;
  marketplace?: string;
  fees?: number;
  notes?: string;
}

// Heuristic domain intelligence. We could plug an LLM in here later, but the
// rule-based extractor handles the common GeoLead pattern (CityNicheSuffix.tld)
// well, runs fast, and works offline.
const CITY_DICTIONARY: Record<string, { city: string; state?: string; country?: string }> = {
  newyork: { city: 'New York', state: 'NY', country: 'US' },
  losangeles: { city: 'Los Angeles', state: 'CA', country: 'US' },
  chicago: { city: 'Chicago', state: 'IL', country: 'US' },
  houston: { city: 'Houston', state: 'TX', country: 'US' },
  phoenix: { city: 'Phoenix', state: 'AZ', country: 'US' },
  philadelphia: { city: 'Philadelphia', state: 'PA', country: 'US' },
  sanantonio: { city: 'San Antonio', state: 'TX', country: 'US' },
  sandiego: { city: 'San Diego', state: 'CA', country: 'US' },
  dallas: { city: 'Dallas', state: 'TX', country: 'US' },
  austin: { city: 'Austin', state: 'TX', country: 'US' },
  jacksonville: { city: 'Jacksonville', state: 'FL', country: 'US' },
  sanjose: { city: 'San Jose', state: 'CA', country: 'US' },
  fortworth: { city: 'Fort Worth', state: 'TX', country: 'US' },
  columbus: { city: 'Columbus', state: 'OH', country: 'US' },
  charlotte: { city: 'Charlotte', state: 'NC', country: 'US' },
  indianapolis: { city: 'Indianapolis', state: 'IN', country: 'US' },
  seattle: { city: 'Seattle', state: 'WA', country: 'US' },
  denver: { city: 'Denver', state: 'CO', country: 'US' },
  boston: { city: 'Boston', state: 'MA', country: 'US' },
  nashville: { city: 'Nashville', state: 'TN', country: 'US' },
  memphis: { city: 'Memphis', state: 'TN', country: 'US' },
  portland: { city: 'Portland', state: 'OR', country: 'US' },
  oklahomacity: { city: 'Oklahoma City', state: 'OK', country: 'US' },
  lasvegas: { city: 'Las Vegas', state: 'NV', country: 'US' },
  louisville: { city: 'Louisville', state: 'KY', country: 'US' },
  baltimore: { city: 'Baltimore', state: 'MD', country: 'US' },
  milwaukee: { city: 'Milwaukee', state: 'WI', country: 'US' },
  albuquerque: { city: 'Albuquerque', state: 'NM', country: 'US' },
  tucson: { city: 'Tucson', state: 'AZ', country: 'US' },
  fresno: { city: 'Fresno', state: 'CA', country: 'US' },
  sacramento: { city: 'Sacramento', state: 'CA', country: 'US' },
  atlanta: { city: 'Atlanta', state: 'GA', country: 'US' },
  miami: { city: 'Miami', state: 'FL', country: 'US' },
  tampa: { city: 'Tampa', state: 'FL', country: 'US' },
  orlando: { city: 'Orlando', state: 'FL', country: 'US' },
  cleveland: { city: 'Cleveland', state: 'OH', country: 'US' },
  detroit: { city: 'Detroit', state: 'MI', country: 'US' },
  minneapolis: { city: 'Minneapolis', state: 'MN', country: 'US' },
  newark: { city: 'Newark', state: 'NJ', country: 'US' },
  brooklyn: { city: 'Brooklyn', state: 'NY', country: 'US' },
  texas: { city: '', state: 'TX', country: 'US' },
  florida: { city: '', state: 'FL', country: 'US' },
  california: { city: '', state: 'CA', country: 'US' },
  london: { city: 'London', country: 'GB' },
  manchester: { city: 'Manchester', country: 'GB' },
  birmingham: { city: 'Birmingham', country: 'GB' },
  paris: { city: 'Paris', country: 'FR' },
  berlin: { city: 'Berlin', country: 'DE' },
  toronto: { city: 'Toronto', country: 'CA' },
  vancouver: { city: 'Vancouver', country: 'CA' },
  dubai: { city: 'Dubai', country: 'AE' },
  sydney: { city: 'Sydney', country: 'AU' },
  melbourne: { city: 'Melbourne', country: 'AU' },
};

const INDUSTRY_DICTIONARY: Array<{ tokens: string[]; industry: string; niche: string; category: string }> = [
  { tokens: ['car', 'auto', 'cars', 'autos', 'dealer', 'dealership', 'vehicle', 'motor', 'cardealer'], industry: 'Automotive', niche: 'auto dealers', category: 'Automotive' },
  { tokens: ['truck', 'trucks'], industry: 'Automotive', niche: 'truck dealers', category: 'Automotive' },
  { tokens: ['roof', 'roofing', 'roofer'], industry: 'Home Services', niche: 'roofing contractors', category: 'Home Services' },
  { tokens: ['plumb', 'plumber', 'plumbing'], industry: 'Home Services', niche: 'plumbing contractors', category: 'Home Services' },
  { tokens: ['hvac', 'aircon', 'airconditioning', 'heating', 'cooling'], industry: 'Home Services', niche: 'HVAC contractors', category: 'Home Services' },
  { tokens: ['electric', 'electrician', 'electrical'], industry: 'Home Services', niche: 'electrical contractors', category: 'Home Services' },
  { tokens: ['landscap', 'lawn', 'gardener', 'landscaping'], industry: 'Home Services', niche: 'landscaping companies', category: 'Home Services' },
  { tokens: ['paint', 'painter', 'painting'], industry: 'Home Services', niche: 'painting contractors', category: 'Home Services' },
  { tokens: ['clean', 'cleaning', 'cleaner', 'maid'], industry: 'Home Services', niche: 'cleaning services', category: 'Home Services' },
  { tokens: ['lock', 'locksmith'], industry: 'Home Services', niche: 'locksmiths', category: 'Home Services' },
  { tokens: ['dent', 'dental', 'dentist', 'orthodont'], industry: 'Healthcare', niche: 'dental practices', category: 'Healthcare' },
  { tokens: ['doctor', 'clinic', 'medical', 'physician'], industry: 'Healthcare', niche: 'medical clinics', category: 'Healthcare' },
  { tokens: ['vet', 'veterinarian', 'animal'], industry: 'Healthcare', niche: 'veterinary clinics', category: 'Healthcare' },
  { tokens: ['chiro', 'chiropractor'], industry: 'Healthcare', niche: 'chiropractors', category: 'Healthcare' },
  { tokens: ['lawyer', 'attorney', 'law', 'legal'], industry: 'Legal', niche: 'law firms', category: 'Legal' },
  { tokens: ['accountant', 'cpa', 'tax', 'bookkeep'], industry: 'Finance', niche: 'accounting firms', category: 'Finance' },
  { tokens: ['realestate', 'realtor', 'realty', 'broker', 'homes', 'properties'], industry: 'Real Estate', niche: 'real estate agencies', category: 'Real Estate' },
  { tokens: ['mortgage', 'lending', 'loans'], industry: 'Finance', niche: 'mortgage brokers', category: 'Finance' },
  { tokens: ['restaurant', 'cafe', 'pizza', 'food', 'eat', 'kitchen', 'grill'], industry: 'Food & Beverage', niche: 'restaurants', category: 'Food & Beverage' },
  { tokens: ['bar', 'pub', 'brew', 'wine'], industry: 'Food & Beverage', niche: 'bars and breweries', category: 'Food & Beverage' },
  { tokens: ['salon', 'hair', 'barber', 'spa', 'nail', 'beauty'], industry: 'Beauty & Wellness', niche: 'salons and spas', category: 'Beauty & Wellness' },
  { tokens: ['gym', 'fitness', 'crossfit', 'yoga', 'pilates'], industry: 'Fitness', niche: 'gyms and studios', category: 'Fitness' },
  { tokens: ['photo', 'photography', 'photographer'], industry: 'Creative', niche: 'photographers', category: 'Creative' },
  { tokens: ['marketing', 'agency', 'seo', 'ppc', 'digital'], industry: 'Marketing', niche: 'marketing agencies', category: 'Marketing' },
  { tokens: ['software', 'app', 'tech', 'developer', 'dev'], industry: 'Technology', niche: 'software companies', category: 'Technology' },
  { tokens: ['insurance', 'insur'], industry: 'Insurance', niche: 'insurance agencies', category: 'Insurance' },
  { tokens: ['contractor', 'construct', 'builder', 'remodel'], industry: 'Construction', niche: 'general contractors', category: 'Construction' },
  { tokens: ['solar'], industry: 'Energy', niche: 'solar installers', category: 'Energy' },
  { tokens: ['tow', 'towing'], industry: 'Automotive', niche: 'towing companies', category: 'Automotive' },
  { tokens: ['movers', 'moving'], industry: 'Logistics', niche: 'moving companies', category: 'Logistics' },
  { tokens: ['pest', 'extermin'], industry: 'Home Services', niche: 'pest control', category: 'Home Services' },
];

function stripDomain(domain: string): { sld: string; tld: string } {
  const cleaned = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  const parts = cleaned.split('.');
  if (parts.length < 2) return { sld: cleaned, tld: '' };
  const tld = parts.slice(-1)[0];
  const sld = parts.slice(0, -1).join('');
  return { sld, tld };
}

function tokenizeSld(sld: string): string[] {
  // Split CamelCase + non-letters. "TexasCarVendor" -> ["texas","car","vendor"].
  return sld
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function deriveDomainIntelligence(name: string) {
  const { sld, tld } = stripDomain(name);
  const tokens = tokenizeSld(sld);
  const compact = sld.toLowerCase().replace(/[^a-z]/g, '');

  // Location detection: try multi-word matches first, then single tokens.
  let location: { city?: string; state?: string; country?: string } = {};
  for (let i = 0; i < tokens.length; i++) {
    for (let j = tokens.length; j > i; j--) {
      const slice = tokens.slice(i, j).join('');
      if (CITY_DICTIONARY[slice]) {
        location = CITY_DICTIONARY[slice];
        break;
      }
    }
    if (location.city || location.state) break;
  }
  if (!location.city && !location.state) {
    for (const [key, value] of Object.entries(CITY_DICTIONARY)) {
      if (compact.includes(key)) { location = value; break; }
    }
  }

  // Industry/niche detection.
  let industryMatch = INDUSTRY_DICTIONARY.find((entry) => entry.tokens.some((token) => tokens.includes(token)));
  if (!industryMatch) {
    industryMatch = INDUSTRY_DICTIONARY.find((entry) => entry.tokens.some((token) => compact.includes(token)));
  }

  // Branding score: shorter SLD + premium TLD + dictionary city/industry hits.
  let branding = 50;
  if (sld.length <= 8) branding += 20;
  else if (sld.length <= 14) branding += 10;
  else if (sld.length >= 22) branding -= 15;
  if (tld === 'com') branding += 20;
  else if (['net', 'co', 'io'].includes(tld)) branding += 8;
  else branding -= 5;
  if (location.city || location.state) branding += 10;
  if (industryMatch) branding += 10;
  if (/[0-9]/.test(sld)) branding -= 10;
  if (/-/.test(name)) branding -= 10;
  branding = Math.max(5, Math.min(100, branding));

  // Buyer demand: industry × geo. Industries with many SMB buyers and clear
  // intent score higher.
  const highDemandIndustries = new Set(['Home Services', 'Automotive', 'Healthcare', 'Legal', 'Real Estate', 'Insurance', 'Construction']);
  let demand = 35;
  if (industryMatch && highDemandIndustries.has(industryMatch.industry)) demand += 35;
  else if (industryMatch) demand += 20;
  if (location.city) demand += 20;
  else if (location.state) demand += 10;
  if (tld === 'com') demand += 10;
  demand = Math.max(5, Math.min(100, demand));

  // Lead opportunity: how easy is it to find local SMBs matching this domain?
  let lead = 30;
  if (industryMatch) lead += 30;
  if (location.city) lead += 25;
  else if (location.state) lead += 15;
  if (industryMatch && highDemandIndustries.has(industryMatch.industry)) lead += 10;
  lead = Math.max(5, Math.min(100, lead));

  // Estimated value: rough heuristic, premium=> brand+demand. Real appraisal
  // would need GoDaddy/Estibot API; this is a defensible starting price.
  const baseValue = 250;
  const brandFactor = 1 + (branding - 50) / 50; // 0..2
  const demandFactor = 1 + (demand - 50) / 70;
  const estimatedValue = Math.round(baseValue * Math.max(0.4, brandFactor) * Math.max(0.5, demandFactor));

  const saleProbability = Math.round((demand * 0.5 + lead * 0.3 + branding * 0.2));

  // Recommendations.
  const bestIndustries = industryMatch ? [industryMatch.industry] : [];
  const bestCities = location.city ? [location.city] : location.state ? [location.state] : [];
  const outreachStrategy = industryMatch && (location.city || location.state)
    ? `Target ${industryMatch.niche} in ${location.city || location.state} with personalized outreach that highlights local SEO benefits and the memorability of an exact-match domain.`
    : industryMatch
    ? `Target ${industryMatch.niche} nationwide. Lead with brandability and category authority.`
    : location.city || location.state
    ? `Target high-intent local SMBs in ${location.city || location.state}. Position the domain as a geo-anchored landing page or paid-search redirect.`
    : 'Broad outreach: pitch as a brandable, premium short domain. Consider listing on Sedo/Dan/Afternic for inbound demand.';

  const aiSummary = [
    industryMatch ? `Niche: ${industryMatch.niche}.` : null,
    location.city ? `Geo: ${location.city}${location.state ? `, ${location.state}` : ''}.` : location.state ? `Region: ${location.state}.` : null,
    `Branding ${branding}/100`,
    `Demand ${demand}/100`,
    `Lead opportunity ${lead}/100`,
  ].filter(Boolean).join(' • ');

  return {
    niche: industryMatch?.niche || null,
    industry: industryMatch?.industry || null,
    category: industryMatch?.category || null,
    city: location.city || null,
    state: location.state || null,
    country: location.country || null,
    brandingScore: branding,
    buyerDemandScore: demand,
    leadOpportunityScore: lead,
    estimatedValue,
    recommendedPrice: Math.round(estimatedValue * 1.4),
    saleProbability,
    bestIndustries,
    bestCities,
    outreachStrategy,
    aiSummary,
  };
}

function normalizeDomainName(name: string): string {
  return name.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
}

function buildIntelligenceFields(name: string, override?: Partial<DomainInput>): Prisma.DomainUncheckedCreateInput {
  const intel = deriveDomainIntelligence(name);
  return {
    name: normalizeDomainName(name),
    niche: override?.niche ?? intel.niche,
    industry: override?.industry ?? intel.industry,
    category: override?.category ?? intel.category,
    city: override?.city ?? intel.city,
    state: override?.state ?? intel.state,
    country: override?.country ?? intel.country,
    brandingScore: intel.brandingScore,
    buyerDemandScore: intel.buyerDemandScore,
    leadOpportunityScore: intel.leadOpportunityScore,
    estimatedValue: intel.estimatedValue,
    recommendedPrice: intel.recommendedPrice,
    saleProbability: intel.saleProbability,
    bestIndustries: intel.bestIndustries,
    bestCities: intel.bestCities,
    outreachStrategy: intel.outreachStrategy,
    aiSummary: intel.aiSummary,
    intelligenceUpdatedAt: new Date(),
  };
}

// Guard helper: throws unless the domain belongs to the user. Used before any
// mutation that targets a domain (or its buyers/offers/sale) by id.
async function assertDomainOwner(domainId: string, userId: string): Promise<void> {
  const owned = await prisma.domain.findFirst({ where: { id: domainId, userId }, select: { id: true } });
  if (!owned) throw new Error('Domain not found.');
}

export async function listDomains(userId: string, filter?: {
  status?: string;
  search?: string;
  category?: string;
  tag?: string;
  includeArchived?: boolean;
}) {
  const where: Prisma.DomainWhereInput = { userId };
  if (filter?.status) where.status = filter.status;
  if (filter?.category) where.category = filter.category;
  if (filter?.tag) where.tags = { has: filter.tag };
  if (!filter?.includeArchived) where.archivedAt = null;
  if (filter?.search) {
    where.OR = [
      { name: { contains: filter.search, mode: 'insensitive' } },
      { niche: { contains: filter.search, mode: 'insensitive' } },
      { industry: { contains: filter.search, mode: 'insensitive' } },
      { city: { contains: filter.search, mode: 'insensitive' } },
      { state: { contains: filter.search, mode: 'insensitive' } },
      { notes: { contains: filter.search, mode: 'insensitive' } },
    ];
  }
  return prisma.domain.findMany({
    where,
    include: {
      _count: { select: { campaigns: true, buyers: true, offers: true } },
      sale: true,
    },
    orderBy: [{ archivedAt: 'asc' }, { updatedAt: 'desc' }],
  });
}

export async function getDomain(id: string, userId: string) {
  return prisma.domain.findFirst({
    where: { id, userId },
    include: {
      campaigns: {
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          _count: { select: { campaignLeads: true, emailLogs: true, replies: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      buyers: {
        orderBy: [{ buyerScore: 'desc' }, { updatedAt: 'desc' }],
        include: { offers: { orderBy: { receivedAt: 'desc' } } },
      },
      offers: { orderBy: { receivedAt: 'desc' }, include: { buyer: true } },
      sale: true,
    },
  });
}

export async function createDomain(input: DomainInput, userId?: string) {
  const name = normalizeDomainName(input.name);
  if (!name) throw new Error('Domain name is required.');
  const intel = buildIntelligenceFields(name, input);
  return prisma.domain.create({
    data: {
      ...intel,
      userId,
      status: input.status || 'Available',
      purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
      purchasePrice: input.purchasePrice ?? null,
      registrar: input.registrar ?? null,
      expirationDate: input.expirationDate ? new Date(input.expirationDate) : null,
      tags: input.tags || [],
      targetIndustries: input.targetIndustries || [],
      targetLocations: input.targetLocations || [],
      notes: input.notes ?? null,
    },
  });
}

export async function updateDomain(id: string, input: Partial<DomainInput> & { status?: string }, userId: string) {
  await assertDomainOwner(id, userId);
  const data: Prisma.DomainUpdateInput = {};
  if (input.name !== undefined) {
    const renamed = normalizeDomainName(input.name);
    if (renamed) {
      data.name = renamed;
      Object.assign(data, buildIntelligenceFields(renamed, input));
    }
  }
  if (input.status !== undefined) data.status = input.status;
  if (input.purchaseDate !== undefined) data.purchaseDate = input.purchaseDate ? new Date(input.purchaseDate) : null;
  if (input.purchasePrice !== undefined) data.purchasePrice = input.purchasePrice ?? null;
  if (input.registrar !== undefined) data.registrar = input.registrar ?? null;
  if (input.expirationDate !== undefined) data.expirationDate = input.expirationDate ? new Date(input.expirationDate) : null;
  if (input.category !== undefined) data.category = input.category ?? null;
  if (input.niche !== undefined) data.niche = input.niche ?? null;
  if (input.industry !== undefined) data.industry = input.industry ?? null;
  if (input.city !== undefined) data.city = input.city ?? null;
  if (input.state !== undefined) data.state = input.state ?? null;
  if (input.country !== undefined) data.country = input.country ?? null;
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.targetIndustries !== undefined) data.targetIndustries = input.targetIndustries;
  if (input.targetLocations !== undefined) data.targetLocations = input.targetLocations;
  if (input.notes !== undefined) data.notes = input.notes ?? null;
  return prisma.domain.update({ where: { id }, data });
}

export async function archiveDomain(id: string, userId: string) {
  await assertDomainOwner(id, userId);
  return prisma.domain.update({
    where: { id },
    data: { status: 'Archived', archivedAt: new Date() },
  });
}

export async function restoreDomain(id: string, userId: string) {
  await assertDomainOwner(id, userId);
  return prisma.domain.update({
    where: { id },
    data: { status: 'Available', archivedAt: null },
  });
}

export async function deleteDomain(id: string, userId: string) {
  await assertDomainOwner(id, userId);
  await prisma.domain.delete({ where: { id } });
  return { deleted: true };
}

export async function reanalyzeDomain(id: string, userId: string) {
  const domain = await prisma.domain.findFirst({ where: { id, userId } });
  if (!domain) throw new Error('Domain not found.');
  const intel = deriveDomainIntelligence(domain.name);
  return prisma.domain.update({
    where: { id },
    data: {
      niche: intel.niche,
      industry: intel.industry,
      category: intel.category,
      city: intel.city,
      state: intel.state,
      country: intel.country,
      brandingScore: intel.brandingScore,
      buyerDemandScore: intel.buyerDemandScore,
      leadOpportunityScore: intel.leadOpportunityScore,
      estimatedValue: intel.estimatedValue,
      recommendedPrice: intel.recommendedPrice,
      saleProbability: intel.saleProbability,
      bestIndustries: intel.bestIndustries,
      bestCities: intel.bestCities,
      outreachStrategy: intel.outreachStrategy,
      aiSummary: intel.aiSummary,
      intelligenceUpdatedAt: new Date(),
    },
  });
}

// Bulk import: accepts either DomainInput rows or plain strings (one per line
// from TXT). Skips dupes by name, returns counts so the UI can show what
// landed.
export async function bulkImportDomains(input: BulkImportInput, userId?: string) {
  const rows = (input.rows || []).filter((row) => {
    if (typeof row === 'string') return row.trim().length > 0;
    return row && typeof row.name === 'string' && row.name.trim().length > 0;
  });
  if (rows.length === 0) return { imported: 0, skipped: 0, errors: [] as string[] };

  const seen = new Set<string>();
  const created: string[] = [];
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const candidate: DomainInput = typeof row === 'string'
      ? { name: row, status: input.defaultStatus }
      : { status: input.defaultStatus, ...row };
    const name = normalizeDomainName(candidate.name);
    if (!name) { skipped += 1; continue; }
    if (seen.has(name)) { skipped += 1; continue; }
    seen.add(name);
    try {
      const existing = await prisma.domain.findFirst({ where: { name, userId: userId ?? null } });
      if (existing) { skipped += 1; continue; }
      await createDomain({ ...candidate, name }, userId);
      created.push(name);
    } catch (err: any) {
      errors.push(`${name}: ${err?.message || 'create failed'}`);
    }
  }

  return { imported: created.length, skipped, errors, names: created };
}

export async function recordSale(domainId: string, input: SaleInput, userId: string) {
  const domain = await prisma.domain.findFirst({ where: { id: domainId, userId } });
  if (!domain) throw new Error('Domain not found.');
  if (!Number.isFinite(input.salePrice) || input.salePrice <= 0) {
    throw new Error('Sale price must be greater than zero.');
  }
  const saleDate = input.saleDate ? new Date(input.saleDate) : new Date();
  const sale = await prisma.domainSale.upsert({
    where: { domainId },
    update: {
      buyerName: input.buyerName,
      buyerEmail: input.buyerEmail ?? null,
      salePrice: input.salePrice,
      currency: input.currency || 'USD',
      saleDate,
      marketplace: input.marketplace ?? null,
      fees: input.fees ?? 0,
      notes: input.notes ?? null,
    },
    create: {
      domainId,
      buyerName: input.buyerName,
      buyerEmail: input.buyerEmail ?? null,
      salePrice: input.salePrice,
      currency: input.currency || 'USD',
      saleDate,
      marketplace: input.marketplace ?? null,
      fees: input.fees ?? 0,
      notes: input.notes ?? null,
    },
  });
  await prisma.domain.update({
    where: { id: domainId },
    data: { status: 'Sold', soldAt: saleDate },
  });
  return sale;
}

export async function markUnsold(domainId: string, userId: string) {
  await assertDomainOwner(domainId, userId);
  await prisma.domainSale.deleteMany({ where: { domainId } });
  return prisma.domain.update({
    where: { id: domainId },
    data: { status: 'Available', soldAt: null },
  });
}

export async function listBuyers(domainId: string, userId: string) {
  await assertDomainOwner(domainId, userId);
  return prisma.domainBuyer.findMany({
    where: { domainId },
    include: { offers: { orderBy: { receivedAt: 'desc' } } },
    orderBy: [{ buyerScore: 'desc' }, { updatedAt: 'desc' }],
  });
}

export async function createBuyer(domainId: string, input: BuyerInput, userId: string) {
  await assertDomainOwner(domainId, userId);
  return prisma.domainBuyer.create({
    data: {
      domainId,
      businessName: input.businessName,
      contactName: input.contactName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      website: input.website ?? null,
      location: input.location ?? null,
      industry: input.industry ?? null,
      buyerScore: input.buyerScore ?? 0,
      status: input.status || 'Prospect',
      notes: input.notes ?? null,
      leadId: input.leadId ?? null,
    },
  });
}

export async function updateBuyer(buyerId: string, input: Partial<BuyerInput>, userId: string) {
  const owned = await prisma.domainBuyer.findFirst({ where: { id: buyerId, domain: { userId } }, select: { id: true } });
  if (!owned) throw new Error('Buyer not found.');
  return prisma.domainBuyer.update({
    where: { id: buyerId },
    data: {
      businessName: input.businessName,
      contactName: input.contactName,
      email: input.email,
      phone: input.phone,
      website: input.website,
      location: input.location,
      industry: input.industry,
      buyerScore: input.buyerScore,
      status: input.status,
      notes: input.notes,
    },
  });
}

export async function deleteBuyer(buyerId: string, userId: string) {
  const owned = await prisma.domainBuyer.findFirst({ where: { id: buyerId, domain: { userId } }, select: { id: true } });
  if (!owned) throw new Error('Buyer not found.');
  await prisma.domainBuyer.delete({ where: { id: buyerId } });
  return { deleted: true };
}

export async function recordOffer(domainId: string, input: OfferInput, userId: string) {
  await assertDomainOwner(domainId, userId);
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Offer amount must be greater than zero.');
  }
  return prisma.domainOffer.create({
    data: {
      domainId,
      buyerId: input.buyerId ?? null,
      amount: input.amount,
      currency: input.currency || 'USD',
      direction: input.direction || 'INBOUND',
      status: input.status || 'OPEN',
      notes: input.notes ?? null,
      receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
    },
  });
}

export async function updateOffer(offerId: string, input: Partial<OfferInput>, userId: string) {
  const owned = await prisma.domainOffer.findFirst({ where: { id: offerId, domain: { userId } }, select: { id: true } });
  if (!owned) throw new Error('Offer not found.');
  return prisma.domainOffer.update({
    where: { id: offerId },
    data: {
      amount: input.amount,
      currency: input.currency,
      direction: input.direction,
      status: input.status,
      notes: input.notes,
      buyerId: input.buyerId,
    },
  });
}

export async function deleteOffer(offerId: string, userId: string) {
  const owned = await prisma.domainOffer.findFirst({ where: { id: offerId, domain: { userId } }, select: { id: true } });
  if (!owned) throw new Error('Offer not found.');
  await prisma.domainOffer.delete({ where: { id: offerId } });
  return { deleted: true };
}

// Dashboard aggregates: stats cards + recent activity + Kanban columns.
export async function getPortfolioDashboard(userId: string) {
  const now = new Date();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 30);

  const [
    domains,
    totals,
    expiringSoon,
    activeCampaigns,
    leadsGenerated,
    replies,
    soldAgg,
    revenueAgg,
  ] = await Promise.all([
    prisma.domain.count({ where: { userId, archivedAt: null } }),
    prisma.domain.aggregate({
      where: { userId, archivedAt: null },
      _sum: { estimatedValue: true, purchasePrice: true },
    }),
    prisma.domain.count({
      where: {
        userId,
        archivedAt: null,
        expirationDate: { gte: now, lte: soon },
      },
    }),
    prisma.campaign.count({
      where: { userId, status: 'ACTIVE', domainId: { not: null } },
    }),
    prisma.campaignLead.count({
      where: { campaign: { userId, domainId: { not: null } } },
    }),
    prisma.reply.count({
      where: { campaign: { userId, domainId: { not: null } } },
    }),
    prisma.domain.count({ where: { userId, status: 'Sold' } }),
    prisma.domainSale.aggregate({ where: { domain: { userId } }, _sum: { salePrice: true, fees: true } }),
  ]);

  const byStatus = await prisma.domain.groupBy({
    by: ['status'],
    where: { userId, archivedAt: null },
    _count: { status: true },
  });
  const statusCounts: Record<string, number> = {};
  for (const status of DOMAIN_STATUSES) statusCounts[status] = 0;
  for (const row of byStatus) statusCounts[row.status] = row._count.status;

  const revenue = (revenueAgg._sum.salePrice || 0) - (revenueAgg._sum.fees || 0);
  const investment = totals._sum.purchasePrice || 0;
  const roi = investment > 0 ? Math.round(((revenue - investment) / investment) * 100) : 0;

  return {
    totals: {
      domains,
      portfolioValue: totals._sum.estimatedValue || 0,
      investment,
      revenue,
      profit: revenue - investment,
      roi,
      expiringSoon,
      activeCampaigns,
      leadsGenerated,
      replies,
      domainsSold: soldAgg,
    },
    statusCounts,
  };
}

export async function getKanban(userId: string) {
  const domains = await prisma.domain.findMany({
    where: { userId, archivedAt: null },
    include: {
      _count: { select: { campaigns: true, buyers: true, offers: true } },
      sale: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
  const columns: Record<DomainStatus, typeof domains> = {
    Available: [],
    Prospecting: [],
    'Contacting Buyers': [],
    Negotiating: [],
    Sold: [],
    Archived: [],
  };
  for (const domain of domains) {
    const key = (DOMAIN_STATUSES.includes(domain.status as DomainStatus) ? domain.status : 'Available') as DomainStatus;
    columns[key].push(domain);
  }
  return columns;
}

// Buyer discovery: surface lead-explorer rows that match the domain's
// derived industry + geo. The frontend uses this to launch a Lead Explorer
// search seeded entirely from the domain — no manual keyword entry.
export async function buyerDiscoveryParams(domainId: string, userId: string) {
  const domain = await prisma.domain.findFirst({ where: { id: domainId, userId } });
  if (!domain) throw new Error('Domain not found.');
  const keyword = [domain.industry, domain.niche].filter(Boolean).join(' ') || domain.category || 'local business';
  const cityState = [domain.city, domain.state].filter(Boolean).join(', ') || domain.state || '';
  return {
    domainName: domain.name,
    keyword: keyword.trim(),
    cityState: cityState.trim(),
    domainIdea: domain.name,
    targetIndustries: domain.targetIndustries.length ? domain.targetIndustries : (domain.industry ? [domain.industry] : []),
    targetLocations: domain.targetLocations.length ? domain.targetLocations : (cityState ? [cityState] : []),
  };
}
