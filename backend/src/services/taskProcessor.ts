import prisma from '../config/db.js';
import { scrapingQueue } from '../queues/queues.js';
import { searchAndCrawl, stopCrawlerJob, stopCrawlerJobs, isWrongCountry } from './crawlerClient.js';
import { orchestrateSearch, resetTaskUsage } from './crawlerOrchestrator.js';
import { crawlWebsite } from './crawler.js';
import { validateAndCleanEmails, aiFilterEmails, validateEmail } from './extractor.js';
import { verifyEmailsBulk } from './emailVerification.js';
import { calculateMatchScore } from './aiScoring.js';
import { getCompanyIntel, scoreBusinessQuality } from './companyIntelligence.js';
import { discoverDecisionMaker } from './decisionMaker.js';
import { analyzeBuyerIntent } from './buyerIntent.js';
import { type EmailCandidate, extractEmailCandidates, extractPhoneCandidates, normalizePhoneList } from './contactUtils.js';
import { scoreContactIntelligence } from './contactIntelligence.js';
import { scoreDomainFit } from './domainFit.js';
import { lookupDomainOwner } from './reverseWhois.js';

interface DiscoveredBiz {
  name: string;
  website?: string;
  location?: string;
  googleMapsLink?: string;
  category?: string;
  rating?: number;
  reviewsCount?: number;
  phoneNumbers: string[];
  snippetEmails: EmailCandidate[];
  snippetPhones: string[];
  snippet?: string;
  source: string;
  relevance?: number; // crawler-supplied 0..1 relevance (Google Maps = 1.0); undefined = unknown
}

interface SearchContext {
  city?: string;
  stateAbbrev?: string;
  stateName?: string;
  primaryKeyword: string;
  regionNeedles: string[];
  wrongRegionNeedles: string[];
  keywordTerms: string[];
}

const DIRECTORY_DOMAINS = [
  'angi.com',
  'bbb.org',
  'chamberofcommerce.com',
  'facebook.com',
  'homeadvisor.com',
  'houzz.com',
  'instagram.com',
  'linkedin.com',
  'mapquest.com',
  'nextdoor.com',
  'superpages.com',
  'thumbtack.com',
  'tripadvisor.com',
  'yellowpages.com',
  'yelp.com',
  'bestpickreports.com',
  'craigslist.org',
  'handy.com',
  'hirerush.com',
  'homeyou.com',
  'meetahandyman.com',
  'porch.com',
  'google.com',
  'housecallpro.com',
  'homedepot.com',
  'local.yahoo.com',
];

const HOME_SERVICE_RELATED_PATTERN = /\b(handyman|handywoman|handyperson|home repair|home repairs|home improvement|home improvements|property maintenance|general contractor|contractor|construction|remodel|remodeler|remodeling|renovation|drywall|dry wall|painting|flooring|roofing|carpentry|carpenter|plumbing|plumber|electrical|electrician|hvac|appliance repair|lawn care|landscaping|home services?|fix it|fixit|odd jobs?|maintenance)\b/i;

// Auto-expand a keyword into related searches so the crawler discovers
// businesses that use different terminology (e.g. "handyman" → "contractor").
// Each sub-search runs in parallel and results are deduplicated by domain.
const KEYWORD_EXPANSIONS: Record<string, string[]> = {
  handyman: ['contractor', 'home repair', 'home improvement', 'property maintenance', 'remodeling', 'handy person'],
  'home repair': ['handyman', 'contractor', 'home improvement', 'property maintenance'],
  plumber: ['plumbing', 'drain cleaning', 'water heater repair', 'sewer repair', 'pipe repair'],
  plumbing: ['plumber', 'drain cleaning', 'water heater repair', 'sewer repair'],
  electrician: ['electrical', 'electrical contractor', 'electrical repair', 'wiring'],
  electrical: ['electrician', 'electrical contractor'],
  painter: ['painting', 'painter contractor', 'house painter', 'interior painting', 'exterior painting'],
  painting: ['painter', 'house painter', 'interior painting', 'exterior painting'],
  roofer: ['roofing', 'roof repair', 'roof replacement', 'roofing contractor'],
  roofing: ['roofer', 'roof repair', 'roof replacement'],
  carpenter: ['carpentry', 'woodwork', 'cabinet maker', 'cabinetry'],
  'landscaping': ['landscape', 'lawn care', 'lawn service', 'yard maintenance', 'gardener'],
  'lawn care': ['landscaping', 'lawn service', 'yard maintenance', 'gardener'],
  hvac: ['heating and cooling', 'ac repair', 'furnace repair', 'hvac contractor', 'air conditioning'],
  'general contractor': ['contractor', 'home remodeling', 'home renovation', 'construction'],
  cleaner: ['cleaning', 'cleaning service', 'house cleaning', 'commercial cleaning', 'janitorial'],
  cleaning: ['cleaner', 'cleaning service', 'house cleaning'],
  'real estate agent': ['realtor', 'real estate broker'],
  dentist: ['dental', 'family dentist', 'cosmetic dentistry'],
  'massage therapy': ['massage therapist', 'massage'],
  photographer: ['photography', 'event photographer', 'wedding photographer'],
  'personal trainer': ['fitness trainer', 'gym', 'fitness coach'],
  'auto repair': ['mechanic', 'auto mechanic', 'car repair', 'automotive repair'],
  mechanic: ['auto repair', 'car repair', 'automotive repair'],
  'web developer': ['web designer', 'web development', 'freelance developer'],
  'digital marketing': ['marketing agency', 'seo', 'social media marketing'],
  'real estate': ['realtor', 'property management', 'real estate agent'],
  'property management': ['property manager', 'real estate management'],
  'home inspector': ['home inspection', 'property inspection'],
};

// Proximity cities for major US metros — when a search targets city X,
// automatically expand to nearby cities in the same metro.
const PROXIMITY_CITIES: Record<string, Record<string, string[]>> = {
  seattle: { wa: ['bellevue', 'redmond', 'kirkland', 'renton', 'everett', 'shoreline', 'lynnwood', 'edmonds', 'kent', 'federal way', 'auburn', 'issaquah', 'sammamish'] },
  portland: { or: ['beaverton', 'hillsboro', 'gresham', 'vancouver', 'tigard', 'lake oswego', 'clackamas'] },
  'new york': { ny: ['brooklyn', 'queens', 'bronx', 'staten island', 'manhattan', 'jersey city', 'newark', 'yonkers'] },
  'los angeles': { ca: ['beverly hills', 'santa monica', 'glendale', 'pasadena', 'long beach', 'burbank', 'culver city', 'inglewood', 'torrance'] },
  chicago: { il: ['evanston', 'oak park', 'skokie', 'arlington heights', 'naperville', 'aurora', 'joliet', 'cicero'] },
  'san francisco': { ca: ['oakland', 'berkeley', 'san mateo', 'palo alto', 'mountain view', 'sunnyvale', 'south san francisco', 'daly city'] },
  'san jose': { ca: ['sunnyvale', 'santa clara', 'mountain view', 'milpitas', 'campbell', 'cupertino', 'los gatos'] },
  boston: { ma: ['cambridge', 'somerville', 'brookline', 'quincy', 'newton', 'waltham', 'medford', 'malden'] },
  denver: { co: ['aurora', 'lakewood', 'arvada', 'westminster', 'thornton', 'centennial', 'englewood'] },
  dallas: { tx: ['fort worth', 'arlington', 'plano', 'garland', 'irving', 'carrollton', 'frisco', 'mckinney', 'richardson'] },
  houston: { tx: ['sugar land', 'katy', 'the woodlands', 'pearland', 'pasadena', 'spring', 'conroe'] },
  atlanta: { ga: ['marietta', 'sandy springs', 'roswell', 'alpharetta', 'decatur', 'smyrna', 'brookhaven', 'dunwoody'] },
  miami: { fl: ['fort lauderdale', 'hollywood', 'hialeah', 'coral gables', 'miami beach', 'kendall', 'west palm beach'] },
  phoenix: { az: ['mesa', 'chandler', 'glendale', 'scottsdale', 'tempe', 'peoria', 'surprise', 'gilbert'] },
  philadelphia: { pa: ['camden', 'cherry hill', 'upper darby', 'bensalem', 'levittown', 'chester'] },
  'san diego': { ca: ['chula vista', 'oceanside', 'escondido', 'carlsbad', 'el cajon', 'vista', 'san marcos'] },
  minneapolis: { mn: ['st paul', 'bloomington', 'plymouth', 'eden prairie', 'maple grove', 'burnsville'] },
  detroit: { mi: ['warren', 'dearborn', 'livonia', 'sterling heights', 'troy', 'southfield', 'farmington hills'] },
  orlando: { fl: ['kissimmee', 'sanford', 'winter park', 'altamonte springs', 'lakeland'] },
  tampa: { fl: ['st petersburg', 'clearwater', 'brandon', 'largo', 'sarasota', 'bradenton'] },
  nashville: { tn: ['franklin', 'brentwood', 'murfreesboro', 'hendersonville', 'smyrna', 'gallatin'] },
  austin: { tx: ['round rock', 'cedar park', 'kyle', 'pflugerville', 'san marcos', 'georgetown'] },
  charlotte: { nc: ['concord', 'gastonia', 'huntersville', 'rock hill', 'matthews', 'pineville'] },
  'las vegas': { nv: ['henderson', 'north las vegas', 'spring valley', 'enterprise', 'paradise'] },
  'kansas city': { mo: ['overland park', 'independence', 'olathe', 'lenexa', 'kansas city ks', 'liberty'] },
  memphis: { tn: ['germantown', 'collierville', 'bartlett', 'cordova', 'olive branch'] },
  'salt lake city': { ut: ['west valley city', 'provo', 'orem', 'sandy', 'draper', 'murray', 'layton'] },
  raleigh: { nc: ['durham', 'cary', 'chapel hill', 'apex', 'wake forest', 'garner'] },
  indianapolis: { in: ['carmel', 'fishers', 'noblesville', 'greenwood', 'plainfield', 'avon'] },
  louisville: { ky: ['jeffersontown', 'st matthews', 'shepherdsville', 'new albany'] },
  milwaukee: { wi: ['wauwatosa', 'brookfield', 'greenfield', 'west allis', 'menomonee falls'] },
  columbus: { oh: ['dublin', 'upper arlington', 'westerville', 'gahanna', 'hilliard', 'grove city'] },
};

const COMMON_EMAIL_PREFIXES = ['info', 'contact', 'hello', 'office', 'admin', 'sales', 'support', 'inquiries', 'team', 'care', 'hello', 'hiring'];

/**
 * Generates plausible email addresses for a domain and optionally SMTP-verifies them.
 * Returns only the ones that pass SMTP validation.
 */
async function guessEmailsForDomain(
  domain: string,
  businessName: string,
  maxGuesses: number = 8,
): Promise<{ email: string; sourcePage: string }[]> {
  const normalizedDomain = domain.toLowerCase().replace(/^www\./i, '');
  const candidates = new Set<string>();

  // 1. Common role-based prefixes
  for (const prefix of COMMON_EMAIL_PREFIXES) {
    candidates.add(`${prefix}@${normalizedDomain}`);
  }

  // 2. Try to extract a name from the business name
  const nameWords = businessName
    .replace(/[^a-zA-Z\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1 && !['llc', 'inc', 'co', 'corp', 'and', 'the', 'for', 'of', '&'].includes(w.toLowerCase()));

  if (nameWords.length >= 1) {
    const first = nameWords[0].toLowerCase();
    candidates.add(`${first}@${normalizedDomain}`);
    if (nameWords.length >= 2) {
      const last = nameWords[nameWords.length - 1].toLowerCase();
      candidates.add(`${first}.${last}@${normalizedDomain}`);
      candidates.add(`${first}${last}@${normalizedDomain}`);
      candidates.add(`${last}@${normalizedDomain}`);
    }
  }

  // 3. Service-specific prefixes common in the trades
  candidates.add(`estimates@${normalizedDomain}`);
  candidates.add(`service@${normalizedDomain}`);

  const guessed = Array.from(candidates).slice(0, maxGuesses);

  // SMTP-verify each guess, keep only valid/risky ones
  const verified = await verifyEmailsBulk(guessed, 5);
  const valid = verified
    .filter(v => v.status === 'VALID' || v.status === 'RISKY')
    .map(v => ({ email: v.email.toLowerCase(), sourcePage: `guessed:${normalizedDomain}` }));

  if (valid.length > 0) {
    console.log(`[EmailGuess] Generated ${guessed.length} candidates for ${normalizedDomain}, ${valid.length} verified valid`);
  }

  return valid;
}

const STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: 'al',
  alaska: 'ak',
  arizona: 'az',
  arkansas: 'ar',
  california: 'ca',
  colorado: 'co',
  connecticut: 'ct',
  delaware: 'de',
  florida: 'fl',
  georgia: 'ga',
  hawaii: 'hi',
  idaho: 'id',
  illinois: 'il',
  indiana: 'in',
  iowa: 'ia',
  kansas: 'ks',
  kentucky: 'ky',
  louisiana: 'la',
  maine: 'me',
  maryland: 'md',
  massachusetts: 'ma',
  michigan: 'mi',
  minnesota: 'mn',
  mississippi: 'ms',
  missouri: 'mo',
  montana: 'mt',
  nebraska: 'ne',
  nevada: 'nv',
  'new hampshire': 'nh',
  'new jersey': 'nj',
  'new mexico': 'nm',
  'new york': 'ny',
  'north carolina': 'nc',
  'north dakota': 'nd',
  ohio: 'oh',
  oklahoma: 'ok',
  oregon: 'or',
  pennsylvania: 'pa',
  'rhode island': 'ri',
  'south carolina': 'sc',
  'south dakota': 'sd',
  tennessee: 'tn',
  texas: 'tx',
  utah: 'ut',
  vermont: 'vt',
  virginia: 'va',
  washington: 'wa',
  'west virginia': 'wv',
  wisconsin: 'wi',
  wyoming: 'wy',
};

const STATE_NAMES_BY_ABBREV = Object.entries(STATE_ABBREVIATIONS).reduce<Record<string, string>>(
  (acc, [name, abbrev]) => {
    acc[abbrev] = name;
    return acc;
  },
  {}
);

// Hard cap on per-business enrichment (email verify + intelligence). Inner calls
// have their own timeouts; this guarantees the crawl loop keeps advancing even if
// something downstream stalls.
const PER_BUSINESS_ENRICH_TIMEOUT_MS = Number(process.env.PER_BUSINESS_ENRICH_TIMEOUT_MS || 45000);

// Resolve (never reject) when `promise` settles or the timeout elapses, so the
// caller can move on. Any in-flight inner work simply finishes in the background.
function runWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | void> {
  return Promise.race([
    promise,
    new Promise<void>((resolve) =>
      setTimeout(() => {
        console.warn(`[Processor] Enrichment timed out after ${ms}ms for "${label}" — moving on.`);
        resolve();
      }, ms),
    ),
  ]);
}

const enqueuedTasks = new Set<string>();

export async function startSearchTaskProcessing(taskId: string) {
  if (enqueuedTasks.has(taskId)) {
    console.log(`[Processor] SearchTask ${taskId} is already enqueued.`);
    return;
  }
  enqueuedTasks.add(taskId);
  try {
    await scrapingQueue.add('search-task', { taskId }, {
      jobId: `search-${taskId}`,
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
    console.log(`[Processor] SearchTask ${taskId} enqueued to scraping-queue.`);
  } catch (err) {
    enqueuedTasks.delete(taskId);
    console.error(`[Processor] Failed to enqueue SearchTask ${taskId}:`, err);
  }
}

export async function resumePendingSearchTasks() {
  try {
    // Stop owned crawler jobs from interrupted tasks
    const interrupted = await prisma.searchTask.findMany({
      where: { status: 'PROCESSING' },
      select: { userId: true, metadata: true },
    });
    const jobsByUser = new Map<string | null, number[]>();
    for (const t of interrupted) {
      const jobId = (t.metadata as any)?.crawlerJobId;
      if (typeof jobId === 'number') {
        const key = t.userId ?? null;
        jobsByUser.set(key, [...(jobsByUser.get(key) ?? []), jobId]);
      }
    }
    let stoppedJobs = 0;
    for (const [uid, jobIds] of jobsByUser) {
      await stopCrawlerJobs(jobIds, uid);
      stoppedJobs += jobIds.length;
    }

    // Fail interrupted PROCESSING tasks (their queue jobs are lost on crash)
    // BullMQ will retry failed jobs up to 3 attempts, so mark them as FAILED
    // to prevent duplicate processing.
    const failedProcessing = await prisma.searchTask.updateMany({
      where: { status: 'PROCESSING' },
      data: { status: 'FAILED' },
    });

    // Re-enqueue PENDING tasks via BullMQ
    const pending = await prisma.searchTask.findMany({
      where: { status: 'PENDING' },
      select: { id: true },
    });
    for (const t of pending) {
      await startSearchTaskProcessing(t.id);
    }

    if (failedProcessing.count > 0 || pending.length > 0 || stoppedJobs > 0) {
      console.log(`[Processor] Startup reconcile: ${failedProcessing.count} interrupted→FAILED, ${pending.length} pending re-enqueued, ${stoppedJobs} owned crawler job(s) stopped.`);
    }
  } catch (error) {
    console.error('[Processor] Failed to reconcile tasks on startup:', error);
  }
}

export async function processSearchTask(taskId: string) {
  console.log(`[Processor] Started processing SearchTask ${taskId}`);

  const task = await prisma.searchTask.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    throw new Error(`SearchTask ${taskId} not found in database`);
  }

  try {
    await prisma.searchTask.update({
      where: { id: taskId },
      data: { status: 'PROCESSING', progress: 5 },
    });

    // Generate search queries: primary + keyword expansions + proximity cities
    const searchQueries = buildSearchQueries(task.keyword, task.cityState || undefined);
    const queryCount = searchQueries.length;
    console.log(`[Processor] Generated ${queryCount} search queries: ${searchQueries.join(' | ')}`);

    await prisma.searchTask.update({
      where: { id: taskId },
      data: { progress: 10 },
    });

    const discoveredBusinesses = new Map<string, DiscoveredBiz>();
    const searchContext = buildSearchContext(task.keyword, task.cityState || undefined);

    // Funnel diagnostics — so a future "0 leads" run tells us whether the crawler
    // returned nothing vs. whether our own filtering dropped everything.
    let rawResultCount = 0;
    let droppedNoDomain = 0;
    let droppedBlockedHost = 0;
    let droppedNoContact = 0;
    let droppedWrongCountry = 0;
    let droppedFiltered = 0;

    const taskMetadata = (task.metadata as any) || {};
    const searchSource = (taskMetadata.searchSource as string) || 'web';
    const proxyscrapeEnabled = taskMetadata.proxyscrapeEnabled !== false;

    // shouldCancel callback — checks DB task status on every poll iteration
    const shouldCancel = async (): Promise<boolean> => {
      const current = await prisma.searchTask.findUnique({ where: { id: taskId }, select: { status: true } });
      return current?.status === 'CANCELLED' || current?.status === 'PAUSED';
    };

    // onProgress callback — update task progress during crawler search phase
    const onCrawlerProgress = async (processed: number, total: number, queryIndex: number = 0) => {
      // Spread progress across queries: first 10% for each query's search phase
      const totalQueries = Math.max(searchQueries.length, 1);
      const queryBasePct = (queryIndex / totalQueries) * 20;
      const pct = Math.floor(queryBasePct + (20 / totalQueries) * (processed / Math.max(total, 1)));
      await prisma.searchTask.update({
        where: { id: taskId },
        data: { progress: Math.min(pct + 10, 29) },
      }).catch(() => undefined);
    };

    // Process each query sequentially to keep the crawler API fair, but accept partial results
    const allCrawlerJobIds: number[] = [];
    let queryIndex = 0;

    for (const query of searchQueries) {
      queryIndex++;
      const isPrimary = queryIndex === 1;
      // Primary query gets full depth; expansions get proportionally less.
      // Scale multiplier with depth so deep searches (200+) hunt aggressively.
      const depthMultiplier = task.searchDepth >= 150 ? 4 : task.searchDepth >= 100 ? 3.5 : 3;
      const expansionMultiplier = task.searchDepth >= 150 ? 2.5 : task.searchDepth >= 100 ? 2 : 1.5;
      const queryMaxResults = isPrimary
        ? Math.max(Math.round(task.searchDepth * depthMultiplier), 350)
        : Math.max(Math.round(task.searchDepth * expansionMultiplier), 100);
      const pctLabel = Math.floor((queryIndex / queryCount) * 100);

      console.log(`[Processor] [${pctLabel}%] Crawler query ${queryIndex}/${queryCount}: "${query}"`);

      // Check cancel/pause between queries
      if (await shouldCancel()) {
        console.log(`[Processor] SearchTask ${taskId} cancelled/paused — stopping multi-query expansion.`);
        break;
      }

      try {
        const crawlResult = await orchestrateSearch({
          keyword: query,
          region: mapCountryToRegion(task.country || undefined),
          maxResults: queryMaxResults,
          source: searchSource as 'web' | 'google_maps' | 'combined',
          proxyscrapeEnabled,
          userId: task.userId,
          onProgress: (p, t) => onCrawlerProgress(p, t, queryIndex - 1),
          shouldCancel,
          taskId,
        });

        if (crawlResult.jobId) {
          allCrawlerJobIds.push(crawlResult.jobId);
          // Store the latest jobId so Stop button always has something to kill
          await prisma.searchTask.update({
            where: { id: taskId },
            data: { metadata: { ...taskMetadata, crawlerJobId: crawlResult.jobId, allCrawlerJobIds } as any },
          }).catch(() => undefined);
        }

        rawResultCount += crawlResult.results.length;
        for (const result of crawlResult.results) {
          const domainKey = result.domain.toLowerCase().replace(/^www\./, '');

          // Check contact info FIRST — Maps results with a phone but no own
          // website (domain=google.com) are still valid leads. Only drop if
          // there's literally no way to reach the business.
          if (result.emails.length === 0 && result.phones.length === 0) { droppedNoContact++; continue; }

          if (!domainKey) { droppedNoDomain++; continue; }

                    // Blocked host check REMOVED — any result that survived the no-contact filter
          // (above) has at least a phone or email, so it's a genuine business listing
          // regardless of host domain. The old check was dropping Maps results with
          // phones but no emails — destroying the main lead source.

          if (isWrongCountry(result.address, task.country || '')) { droppedWrongCountry++; continue; }

          const discovered: DiscoveredBiz = {
            name: result.companyName || result.title || result.domain,
            website: result.url,
            location: result.address || undefined,
            category: result.category ?? undefined,
            rating: typeof result.rating === 'number' ? result.rating : undefined,
            reviewsCount: typeof result.reviewsCount === 'number' ? result.reviewsCount : undefined,
            phoneNumbers: result.phones.map(p => p.value),
            snippetEmails: result.emails.map(e => ({ email: e.value, sourcePage: e.sourceUrl })),
            snippetPhones: result.phones.map(p => p.value),
            snippet: '',
            source: result.source === 'google_maps' ? 'Google Maps' : 'Crawler',
            relevance: typeof result.relevance === 'number' ? result.relevance : undefined,
          };

          if (shouldSkipDiscoveredBusiness(discovered, searchContext)) { droppedFiltered++; continue; }

          if (!discoveredBusinesses.has(domainKey)) {
            discoveredBusinesses.set(domainKey, discovered);
          } else {
            const existing = discoveredBusinesses.get(domainKey)!;
            existing.snippetEmails.push(...discovered.snippetEmails);
            existing.phoneNumbers.push(...discovered.phoneNumbers.filter(p => !existing.phoneNumbers.includes(p)));
            // Backfill richer fields if the duplicate (e.g. the Maps copy) has them.
            if (existing.rating == null && discovered.rating != null) existing.rating = discovered.rating;
            if (existing.reviewsCount == null && discovered.reviewsCount != null) existing.reviewsCount = discovered.reviewsCount;
            if (!existing.category && discovered.category) existing.category = discovered.category;
            if (!existing.location && discovered.location) existing.location = discovered.location;
          }
        }
      } catch (error: any) {
        if (error.message?.includes('cancelled by user')) {
          console.log(`[Processor] SearchTask ${taskId} cancelled during crawler search (query: "${query}").`);
          // Don't return — still process results from completed queries
          break;
        }
        if (error.message?.includes('Crawler is offline')) {
          console.error(`[Processor] SearchTask ${taskId} FAILED — crawler offline: ${error.message}`);
          await prisma.searchTask.update({
            where: { id: taskId },
            data: { status: 'FAILED', progress: 100, metadata: { ...taskMetadata, error: error.message } as any },
          });
          return;
        }
        console.error(`[Processor] Crawler search failed for query "${query}": ${error.message}`);
        // Continue with other queries
      }
    }

    await prisma.searchTask.update({
      where: { id: taskId },
      data: { progress: 30 },
    });

    const businessList = Array.from(discoveredBusinesses.values())
      .sort((a, b) => scoreDiscoveredBusiness(b, searchContext) - scoreDiscoveredBusiness(a, searchContext))
      .slice(0, task.searchDepth);   // keep at most "Depth" leads
    console.log(
      `[Processor] Funnel: raw=${rawResultCount} -> unique=${discoveredBusinesses.size} -> processing=${businessList.length} ` +
      `(dropped noDomain:${droppedNoDomain} blockedHost:${droppedBlockedHost} noEmail:${droppedNoContact} wrongCountry:${droppedWrongCountry} filtered:${droppedFiltered})`,
    );

    if (businessList.length === 0) {
      const zeroLeadsReason = rawResultCount === 0 ? 'crawler_returned_zero' : 'all_results_filtered';
      console.warn(
        `[Processor] SearchTask ${taskId} produced 0 leads. raw=${rawResultCount} ` +
        `dropped{noDomain:${droppedNoDomain}, blockedHost:${droppedBlockedHost}, noEmail:${droppedNoContact}, wrongCountry:${droppedWrongCountry}, filtered:${droppedFiltered}} ` +
        `unique=${discoveredBusinesses.size} reason=${zeroLeadsReason}`,
      );
      resetTaskUsage(taskId);
      await prisma.searchTask.update({
        where: { id: taskId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          totalLeads: 0,
          validEmails: 0,
          metadata: {
            ...taskMetadata,
            zeroLeadsReason,
            rawResultCount,
            droppedCounts: { droppedNoDomain, droppedBlockedHost, droppedNoContact, droppedWrongCountry, droppedFiltered },
          } as any,
        },
      });
      return;
    }

    let processedCount = 0;
    let totalLeadsCount = 0;
    let totalEmailsCount = 0;
    let failedBusinesses = 0;
    const failureReasons: string[] = [];

    const checkTaskStatus = async () => {
      const current = await prisma.searchTask.findUnique({ where: { id: taskId }, select: { status: true } });
      return current?.status;
    };

    const ENRICH_CONCURRENCY = Number(process.env.ENRICH_CONCURRENCY || 3);

    for (let i = 0; i < businessList.length; i += ENRICH_CONCURRENCY) {
      const chunk = businessList.slice(i, i + ENRICH_CONCURRENCY);

      const taskStatus = await checkTaskStatus();
      if (taskStatus === 'PAUSED') {
        console.log(`[Processor] SearchTask ${taskId} paused — stopping crawl loop.`);
        break;
      }
      if (taskStatus === 'CANCELLED') {
        console.log(`[Processor] SearchTask ${taskId} cancelled — stopping crawl loop.`);
        break;
      }

      await Promise.all(chunk.map(async (biz) => {
        processedCount++;
        console.log(`[Processor] [${processedCount}/${businessList.length}] Crawling site: ${biz.website}`);

        try {
          const maxInnerPages = task.searchDepth >= 100 ? 8 : task.searchDepth >= 50 ? 6 : 4;
          const crawlData = biz.website
            ? await crawlWebsite(biz.website, maxInnerPages)
            : { emails: [], phones: [], socials: [], companySize: 'Unknown' as const, hasContactForm: false, notes: 'No website available' };

          let validatedEmails = rankAndCapEmails(
            await aiFilterEmails(
              await validateAndCleanEmails([...biz.snippetEmails, ...crawlData.emails]),
              { businessName: biz.name, website: biz.website, userId: task.userId }
            ),
            biz.website,
          );

          // === Email Guessing: if no emails found but website exists, guess & verify ===
          if (validatedEmails.length === 0 && biz.website) {
            const domain = new URL(biz.website.startsWith('http') ? biz.website : `https://${biz.website}`).hostname;
            const guessed = await guessEmailsForDomain(domain, biz.name);
            if (guessed.length > 0) {
              const validated = rankAndCapEmails(
                await aiFilterEmails(
                  await validateAndCleanEmails(guessed),
                  { businessName: biz.name, website: biz.website, userId: task.userId }
                ),
                biz.website,
              );
              if (validated.length > 0) {
                console.log(`[Processor] Email guessing found ${validated.length} verified emails for ${biz.name} via ${domain}`);
                validatedEmails = validated;
              }
            }
          }

          // === Reverse Whois: if still no emails, try domain registrant lookup ===
          if (validatedEmails.length === 0 && biz.website) {
            const domain = new URL(biz.website.startsWith('http') ? biz.website : `https://${biz.website}`).hostname;
            const whoisContacts = await lookupDomainOwner(domain);
            if (whoisContacts.length > 0) {
              const whoisEmailItems = whoisContacts.map(c => ({ email: c.email, sourcePage: `whois:${domain}` }));
              const validated = rankAndCapEmails(
                await aiFilterEmails(
                  await validateAndCleanEmails(whoisEmailItems),
                  { businessName: biz.name, website: biz.website, userId: task.userId }
                ),
                biz.website,
              );
              if (validated.length > 0) {
                console.log(`[Processor] Reverse whois found ${validated.length} emails for ${biz.name} via ${domain}`);
                validatedEmails = validated;
              }
            }
          }

          const phoneNumbers = normalizePhoneList(
            [...biz.phoneNumbers, ...biz.snippetPhones, ...crawlData.phones],
            2
          );

          // Skip leads that have neither a website nor any contact info — they're noise
          if (!biz.website && validatedEmails.length === 0 && phoneNumbers.length === 0) {
            console.log(`[Processor] Skipping lead "${biz.name}" — no website, emails, or phones.`);
            return;
          }

          const businessName = refineBusinessName(biz.name, crawlData.pageTitle, biz.website, task.keyword);
          const scoreData = await calculateMatchScore(
            task.domainIdea,
            businessName,
            biz.category || undefined,
            biz.location || undefined
          );

          const contactIntel = scoreContactIntelligence({
            businessName,
            website: biz.website,
            location: biz.location,
            googleMapsLink: biz.googleMapsLink,
            category: biz.category,
            phoneNumbers,
            socialLinks: crawlData.socials,
            hasValidEmail: validatedEmails.some(e => e.status === 'VALID'),
            hasAnyEmail: validatedEmails.length > 0,
          });

          const createdLead = await prisma.lead.create({
            data: {
              taskId,
              ownerId: task.userId,
              businessName,
              website: biz.website || null,
              location: biz.location || null,
              googleMapsLink: biz.googleMapsLink || null,
              category: biz.category || null,
              rating: biz.rating || null,
              reviewsCount: biz.reviewsCount || null,
              phoneNumbers,
              socialLinks: crawlData.socials,
              domainMatchScore: scoreData.score,
              scoreExplanation: scoreData.explanation,
              companySize: crawlData.companySize,
              summary: `${businessName} is a local business categorized as a ${biz.category || 'general service provider'}. AI evaluation scored this business ${scoreData.score}% relevant to the domain "${task.domainIdea}".`,
              notes: crawlData.notes,
              whatsappScore: contactIntel.whatsappScore,
              whatsappConfidence: contactIntel.whatsappConfidence,
              bestContactChannel: contactIntel.bestContactChannel,
              contactChannelScores: contactIntel.channelScores as any,
            },
          });

          // Email verification and the decision-maker/intelligence pipeline are
          // independent (both only need createdLead.id), so run them concurrently
          // instead of back-to-back. The whole enrichment is bounded by an overall
          // timeout so one slow site or rate-limited AI call can't stall the loop
          // (the inner work has its own timeouts; this is a final safety net).
          const verifyEmailsTask = async () => {
            if (validatedEmails.length === 0) return;
            const verifications = await verifyEmailsBulk(
              validatedEmails.map((ve) => ve.email),
              5
            );
            const byEmail = new Map(verifications.map((v) => [v.email.toLowerCase(), v]));

            await prisma.leadEmail.createMany({
              data: validatedEmails.map((ve) => {
                const v = byEmail.get(ve.email.toLowerCase());
                return {
                  leadId: createdLead.id,
                  email: ve.email,
                  status: v?.status ?? ve.status,
                  confidenceScore: v ? v.confidenceScore / 100 : ve.confidenceScore,
                  sourcePage: ve.sourcePage,
                  provider: v?.provider ?? null,
                  mxHost: v?.mxHost ?? null,
                  mxValid: v?.mxValid ?? false,
                  disposable: v?.disposable ?? false,
                  roleAccount: v?.roleAccount ?? false,
                  freeProvider: v?.freeProvider ?? false,
                  catchAllRisk: v?.catchAllRisk ?? null,
                  riskLevel: v?.riskLevel ?? null,
                  reputationScore: v?.reputationScore ?? null,
                  verifiedAt: v ? new Date() : null,
                  verificationMetadata: v ? (v.verificationMetadata as any) : undefined,
                };
              }),
            });

            totalEmailsCount += validatedEmails.length;
          };

          // === Decision Maker & Buyer Intelligence Pipeline ===
          const intelligenceTask = async () => {
            if (!biz.website) return;
            const domain = new URL(biz.website.startsWith('http') ? biz.website : `https://${biz.website}`).hostname;
            const intel = await getCompanyIntel(domain);
            const staffNames = intel.staffNames;
            const pageText = crawlData.notes || '';

            const dm = await discoverDecisionMaker(
              businessName, biz.website, [pageText, crawlData.notes || ''],
              staffNames, task.userId,
            );

            const intentScore = analyzeBuyerIntent({
              businessName, currentDomain: domain, targetDomain: task.domainIdea,
              category: biz.category || null, location: biz.location || null,
              websiteText: pageText, domainMatchScore: scoreData.score,
            });

            const fitScore = scoreDomainFit({
              businessName, currentDomain: domain, targetDomain: task.domainIdea,
              location: biz.location || null, category: biz.category || null,
            });

            const qualityScore = scoreBusinessQuality(
              intel, biz.rating || null, biz.reviewsCount || null,
              biz.category || null, crawlData.companySize,
            );

            const dmScore = dm.score || 40;
            const priorityScore = Math.round(dmScore * 0.35 + intentScore * 0.25 + qualityScore * 0.20 + fitScore * 0.20);

            let contactStrategy = 'contact_form';
            if (dmScore >= 85 && validatedEmails.length > 0) contactStrategy = 'email_decision_maker';
            else if (validatedEmails.length > 0) contactStrategy = 'email_general';
            else if (phoneNumbers.length > 0) contactStrategy = 'call_business';

            await prisma.lead.update({
              where: { id: createdLead.id },
              data: {
                decisionMakerName: dm.name, decisionMakerRole: dm.role,
                decisionMakerScore: dmScore, decisionMakerEmail: dm.email,
                buyerIntentScore: intentScore, domainUpgradeScore: fitScore,
                businessQualityScore: qualityScore, priorityScore, contactStrategy,
              },
            });
          };

          await runWithTimeout(
            Promise.allSettled([verifyEmailsTask(), intelligenceTask()]),
            PER_BUSINESS_ENRICH_TIMEOUT_MS,
            biz.name,
          );

          totalLeadsCount++;
        } catch (bizError: any) {
          failedBusinesses++;
          if (failureReasons.length < 20) {
            failureReasons.push(`${biz.name}: ${bizError.message || 'unknown error'}`);
          }
          console.error(`[Processor] Error processing lead ${biz.name}: ${bizError.message}`);
        }

        const crawlProgress = Math.floor(30 + (65 * (processedCount / businessList.length)));
        await prisma.searchTask.update({
          where: { id: taskId },
          data: {
            progress: crawlProgress,
            totalLeads: totalLeadsCount,
            validEmails: totalEmailsCount,
          },
        });
      }));
    }

    const finalStatus = await prisma.searchTask.findUnique({ where: { id: taskId }, select: { status: true } });
    if (finalStatus?.status !== 'PAUSED' && finalStatus?.status !== 'CANCELLED') {
      await prisma.searchTask.update({
        where: { id: taskId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          totalLeads: totalLeadsCount,
          validEmails: totalEmailsCount,
          failedBusinesses,
          metadata: failedBusinesses > 0 ? { failureReasons } as any : undefined,
        },
      });
      resetTaskUsage(taskId);
      if (failedBusinesses > 0) {
        console.warn(`[Processor] SearchTask ${taskId}: ${totalLeadsCount} leads saved, ${failedBusinesses} failed.`);
      }
      console.log(`[Processor] Finished SearchTask ${taskId}. Found ${totalLeadsCount} leads, ${totalEmailsCount} emails.`);
    } else {
      if (finalStatus?.status === 'CANCELLED') resetTaskUsage(taskId);
      console.log(`[Processor] SearchTask ${taskId} is ${finalStatus.status} — ${totalLeadsCount} leads collected so far.`);
      await prisma.searchTask.update({
        where: { id: taskId },
        data: { totalLeads: totalLeadsCount, validEmails: totalEmailsCount },
      });
    }
  } catch (taskError) {
    console.error(`[Processor] Critical error processing SearchTask ${taskId}:`, taskError);

    resetTaskUsage(taskId);
    await prisma.searchTask.update({
      where: { id: taskId },
      data: {
        status: 'FAILED',
        progress: 100,
      },
    });

    throw taskError;
  }
}

function extractEmails(text: string, sourcePage: string) {
  return extractEmailCandidates(text, sourcePage);
}

function extractPhones(text: string) {
  return extractPhoneCandidates(text)
    .flatMap((phone) => normalizePhoneList([phone]));
}

/**
 * Generates all search queries for a task: the primary keyword+city, plus
 * related keyword expansions and proximity-city variants. Results are ordered
 * so the primary (most relevant) query runs first.
 */
function buildSearchQueries(keyword: string, cityState?: string): string[] {
  const queries = new Set<string>();

  // 1. Primary: keyword + city (e.g. "handyman Seattle, WA")
  const primary = [keyword, cityState].filter(Boolean).join(' ').trim();
  queries.add(primary);

  // 2. Keyword expansions — fuzzy match against expansion map.
  //    Check if any expansion KEY is contained in the search keyword OR
  //    the keyword is a key itself. This way "roofing contractors" matches
  //    the "roofing" key, and "handyman" matches directly.
  const keywordLower = keyword.toLowerCase().trim();
  const keywordWords = new Set(keywordLower.split(/\s+/).filter(Boolean));
  const matchedKeys = new Set<string>();

  // Direct key match
  if (KEYWORD_EXPANSIONS[keywordLower]) matchedKeys.add(keywordLower);

  // Fuzzy: keyword contains a key, or key contains a word from keyword
  for (const key of Object.keys(KEYWORD_EXPANSIONS)) {
    const keyWords = new Set(key.split(/\s+/).filter(Boolean));
    // Key is a word inside the keyword (e.g. "roofing" in "roofing contractors")
    if (keywordLower.includes(key)) matchedKeys.add(key);
    // A word from the keyword matches a key (e.g. "roofing" in "roofing contractors")
    for (const kw of keywordWords) {
      if (kw.length > 2 && (key.includes(kw) || kw.includes(key))) matchedKeys.add(key);
    }
  }

  for (const matchedKey of matchedKeys) {
    const expansions = KEYWORD_EXPANSIONS[matchedKey];
    if (expansions) {
      for (const expanded of expansions) {
        const q = [expanded, cityState].filter(Boolean).join(' ').trim();
        if (q !== primary) queries.add(q);
      }
    }
  }

  // 3. Proximity cities — if cityState has a known metro, search nearby cities
  if (cityState) {
    const cityLower = normalizeText(cityState.split(',')[0]?.trim() || '');
    const stateAbbrev = normalizeText(cityState.split(',')[1]?.trim() || '').toLowerCase();
    const metro = PROXIMITY_CITIES[cityLower];
    if (metro) {
      // Verify the state matches (e.g. "Seattle, WA" matches the "seattle" entry under "wa")
      for (const [metroState, nearbyCities] of Object.entries(metro)) {
        if (metroState === stateAbbrev || stateAbbrev.includes(metroState)) {
          for (const nearby of nearbyCities) {
            const q = [keyword, `${nearby}, ${metroState.toUpperCase()}`].filter(Boolean).join(' ').trim();
            if (q !== primary && !queries.has(q)) queries.add(q);
          }
        }
      }
    }
  }

  // Ensure primary is first, then deduplicate while preserving order
  const result = Array.from(queries);
  // Move primary to front if it isn't already
  const primaryIdx = result.indexOf(primary);
  if (primaryIdx > 0) {
    result.splice(primaryIdx, 1);
    result.unshift(primary);
  }

  // Cap total queries to avoid overwhelming the crawler
  const MAX_QUERIES = 10;
  return result.slice(0, MAX_QUERIES);
}

function buildSearchContext(keyword: string, cityState?: string): SearchContext {
  const cityStateLower = normalizeText(cityState || '');
  const city = cityStateLower.split(',')[0]?.trim() || '';
  const state = cityStateLower.split(',')[1]?.trim() || '';
  const stateAbbrev = state.length === 2 ? state : stateToAbbrev(state);
  const stateName = state.length === 2 ? abbrevToStateName(state) : state;
  const regionNeedles = new Set<string>();
  const wrongRegionNeedles = new Set<string>();

  if (city && stateAbbrev) {
    regionNeedles.add(normalizeText(`${city} ${stateAbbrev}`));
    regionNeedles.add(normalizeText(`${city}, ${stateAbbrev}`));
  }

  if (city && stateName) {
    regionNeedles.add(normalizeText(`${city} ${stateName}`));
    regionNeedles.add(normalizeText(`${city}, ${stateName}`));
  }

  if (city && stateAbbrev) {
    Object.entries(STATE_ABBREVIATIONS).forEach(([otherStateName, otherStateAbbrev]) => {
      if (otherStateAbbrev === stateAbbrev || otherStateName === stateName) {
        return;
      }

      wrongRegionNeedles.add(normalizeText(`${city} ${otherStateAbbrev}`));
      wrongRegionNeedles.add(normalizeText(`${city}, ${otherStateAbbrev}`));
      wrongRegionNeedles.add(normalizeText(`${city} ${otherStateName}`));
      wrongRegionNeedles.add(normalizeText(`${city}, ${otherStateName}`));
    });
  }

  return {
    city,
    stateAbbrev,
    stateName,
    primaryKeyword: normalizeText(keyword),
    regionNeedles: Array.from(regionNeedles).filter(Boolean),
    wrongRegionNeedles: Array.from(wrongRegionNeedles).filter(Boolean),
    keywordTerms: normalizeText(keyword).split(' ').filter((term) => term.length > 2),
  };
}

// The crawler already filters 50+ directory domains and scores relevance
// (accuracy.py), so this is a light, high-precision safety net — NOT a relevance
// re-derivation. It must default to KEEP: requiring the search keyword or the city
// to appear in a brand name/domain wrongly drops legitimate businesses (real brands
// rarely contain the keyword, and web results carry no address). We only drop on
// strong evidence: a known directory host, an explicit wrong-region match, or a
// near-zero crawler relevance.
function shouldSkipDiscoveredBusiness(biz: DiscoveredBiz, context: SearchContext) {
  const haystack = normalizeText(`${biz.name} ${biz.category || ''} ${biz.location || ''} ${biz.website || ''} ${biz.snippet || ''}`);

  // 1. Explicit WRONG-region: a *different* US state literally named in the text
  //    (e.g. searching "Indianapolis, IN" but the text says "Indianapolis, OH").
  //    Positive-match only, so address-less web results are never affected.
  if (context.wrongRegionNeedles.some((needle) => needle && haystack.includes(needle))) {
    return true;
  }

  // 2. Zero relevance floor. The crawler already scored & filtered earlier rows;
  //    only drop results with literally zero relevance (complete junk).
  if (typeof biz.relevance === 'number' && biz.relevance <= 0) {
    return true;
  }

  // 3. Default: trust the crawler. Keep the result.
  return false;
}

// Used only to sort then slice to task.searchDepth. Additive-only: off-topic /
// wrong-region / directory rows are already removed by shouldSkipDiscoveredBusiness,
// so negative penalties here would only risk pushing a valid lead past the slice
// boundary. The crawler's relevance drives the primary ordering.
function scoreDiscoveredBusiness(biz: DiscoveredBiz, context: SearchContext) {
  let score = 0;
  const haystack = normalizeText(`${biz.name} ${biz.category || ''} ${biz.location || ''} ${biz.website || ''} ${biz.snippet || ''}`);

  if (typeof biz.relevance === 'number') score += Math.round(biz.relevance * 40);
  if (biz.source === 'Google Maps') score += 35;
  else if (biz.source === 'Crawler') score += 25;
  if (biz.website) score += 20;
  if (biz.location) score += 12;
  if (biz.category) score += 8;
  if (biz.phoneNumbers.length > 0 || biz.snippetPhones.length > 0) score += 10;
  if (biz.snippetEmails.length > 0) score += 15;
  if (HOME_SERVICE_RELATED_PATTERN.test(haystack)) score += 15;
  if (context.regionNeedles.some((needle) => haystack.includes(needle))) score += 18;
  if (containsPhrase(haystack, context.city)) score += 10;

  return score;
}

function refineBusinessName(currentName: string, pageTitle: string | undefined, website: string | undefined, keyword: string) {
  if (!isGenericBusinessName(currentName, keyword)) {
    return currentName;
  }

  const titleName = cleanBusinessName(pageTitle);
  if (titleName && !isGenericBusinessName(titleName, keyword)) {
    return titleName;
  }

  return domainToBusinessName(website) || currentName;
}

function isGenericBusinessName(name: string | undefined, keyword: string) {
  const normalizedName = normalizeText(name || '').replace(/[,.]/g, '');
  const normalizedKeyword = normalizeText(keyword).replace(/[,.]/g, '');

  if (!normalizedName) {
    return true;
  }

  if (/^(home|contact|contact us|about|about us|services|service area|locations?|request quote|request a quote|free estimate)$/.test(normalizedName)) {
    return true;
  }

  if (
    normalizedName === normalizedKeyword ||
    normalizedName === `${normalizedKeyword} service` ||
    normalizedName === `${normalizedKeyword} services` ||
    normalizedName.startsWith(`${normalizedKeyword} service `) ||
    normalizedName.startsWith(`${normalizedKeyword} services `)
  ) {
    return true;
  }

  return /^\d+\s+(best|top)\s+/.test(normalizedName);
}

function cleanBusinessName(value: string | undefined) {
  return value
    ?.replace(/\s+/g, ' ')
    .split(/\s(?:\||-|\u2013|\u2014)\s/)[0]
    ?.trim();
}

function domainToBusinessName(website: string | undefined) {
  const host = getWebsiteHost(website);
  const baseDomain = host.split('.')[0];

  if (!baseDomain) {
    return '';
  }

  const spaced = baseDomain
    .replace(/[-_]+/g, ' ')
    .replace(/(clarksville|handyman|repair|services|service|home|property|maintenance|contractor|fix|quick|tn)/gi, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();

  return spaced
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (['tn', 'llc', 'inc'].includes(lower)) {
        return lower.toUpperCase();
      }

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s,.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWebsiteHost(website?: string) {
  if (!website) {
    return '';
  }

  try {
    return new URL(website).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return website.toLowerCase();
  }
}

function isBlockedWebsiteHost(websiteHost: string) {
  return (
    DIRECTORY_DOMAINS.some((domain) => websiteHost.includes(domain)) ||
    websiteHost.endsWith('.gov') ||
    websiteHost.endsWith('.edu')
  );
}

// Keep only the best N emails per lead. Prevents directory pages (e.g. a tourism
// board's 50-person staff list) from bloating a lead AND from blowing the 45s
// verification budget — fewer emails => SMTP verification completes => they show
// as validated instead of "unverified". Prefers the business's own-domain inbox
// and real people/role mailboxes; demotes noreply/artifacts and free providers.
function rankAndCapEmails<T extends { email: string }>(emails: T[], website?: string, cap = 8): T[] {
  const bizDomain = getWebsiteHost(website);
  const score = (raw: string): number => {
    const e = (raw || '').toLowerCase();
    const at = e.indexOf('@');
    const prefix = at >= 0 ? e.slice(0, at) : e;
    const domain = at >= 0 ? e.slice(at + 1) : '';
    let s = 0;
    if (bizDomain && (domain === bizDomain || domain.endsWith('.' + bizDomain))) s += 100;
    if (/^[a-z]+[._-][a-z]+$/.test(prefix)) s += 30;                                   // first.last
    if (/^(info|contact|sales|hello|office|admin|team|support|inquiries|enquiries)$/.test(prefix)) s += 20;
    if (/(noreply|no-?reply|donotreply|do-not-reply|mailer|postmaster|abuse|sentry|wixpress|example|test)/.test(e)) s -= 60;
    if (/@(gmail|yahoo|outlook|hotmail|aol|icloud|proton)\./.test(e)) s -= 15;         // not the business inbox
    return s;
  };
  return [...emails].sort((a, b) => score(b.email) - score(a.email)).slice(0, cap);
}

function stateToAbbrev(state: string) {
  return STATE_ABBREVIATIONS[state] || '';
}

function abbrevToStateName(abbrev: string) {
  return STATE_NAMES_BY_ABBREV[abbrev.toLowerCase()] || '';
}

function containsPhrase(haystack: string, phrase?: string) {
  if (!phrase) {
    return false;
  }

  const escapedPhrase = phrase
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');

  return new RegExp(`(^|[\\s,./-])${escapedPhrase}($|[\\s,./-])`, 'i').test(haystack);
}

function mapCountryToRegion(country?: string): string {
  if (!country) return 'us-en';
  const lower = country.toLowerCase().trim();
  const map: Record<string, string> = {
    'united states': 'us-en',
    'usa': 'us-en',
    'us': 'us-en',
    'united kingdom': 'uk-en',
    'uk': 'uk-en',
    'england': 'uk-en',
    'canada': 'ca-en',
    'australia': 'au-en',
    'germany': 'de-de',
    'france': 'fr-fr',
    'spain': 'es-es',
    'italy': 'it-it',
    'netherlands': 'nl-nl',
    'india': 'in-en',
    'ireland': 'ie-en',
    'new zealand': 'nz-en',
    'south africa': 'za-en',
  };
  return map[lower] || 'us-en';
}
