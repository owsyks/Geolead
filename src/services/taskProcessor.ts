import prisma from '../config/db.js';
import { generateQueryVariations } from './queryGenerator.js';
import { searchAndCrawl } from './crawlerClient.js';
import { crawlWebsite } from './crawler.js';
import { validateAndCleanEmails, aiFilterEmails } from './extractor.js';
import { verifyEmailsBulk } from './emailVerification.js';
import { calculateMatchScore } from './aiScoring.js';
import { getCompanyIntel, scoreBusinessQuality } from './companyIntelligence.js';
import { discoverDecisionMaker } from './decisionMaker.js';
import { analyzeBuyerIntent } from './buyerIntent.js';
import { scoreDomainFit } from './domainFit.js';
import { type EmailCandidate, extractEmailCandidates, extractPhoneCandidates, normalizePhoneList } from './contactUtils.js';
import { scoreContactIntelligence } from './contactIntelligence.js';

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
const NON_HOME_REPAIR_PATTERN = /\b(auto|automotive|vehicle|car repair|diesel|transmission|brake|brakes|tire|tires|collision|phone repair|smartphone|mobile phone|iphone|computer repair|screen repair|engine repair|small engine|glass repair)\b/i;

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

const runningTasks = new Set<string>();
const queuedTaskIds: string[] = [];
// Each search runs a heavy per-business pipeline (crawl + multiple AI calls)
// inline on the web dyno. Running many at once saturates the single-threaded
// event loop and trips NVIDIA/Serper rate limits, which makes every search
// appear frozen. Cap how many run concurrently; the rest wait their turn.
const MAX_CONCURRENT_SEARCHES = Number(process.env.MAX_CONCURRENT_SEARCHES || 2);

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

export function startSearchTaskProcessing(taskId: string) {
  if (runningTasks.has(taskId) || queuedTaskIds.includes(taskId)) {
    console.log(`[Processor] SearchTask ${taskId} is already running or queued.`);
    return;
  }

  if (runningTasks.size >= MAX_CONCURRENT_SEARCHES) {
    queuedTaskIds.push(taskId);
    console.log(`[Processor] SearchTask ${taskId} queued (${runningTasks.size} running, ${queuedTaskIds.length} waiting).`);
    return;
  }

  launchSearchTask(taskId);
}

function launchSearchTask(taskId: string) {
  runningTasks.add(taskId);
  void processSearchTask(taskId)
    .catch((err) => console.error(`[Processor] SearchTask ${taskId} failed:`, err?.message || err))
    .finally(() => {
      runningTasks.delete(taskId);
      drainSearchQueue();
    });
}

function drainSearchQueue() {
  while (runningTasks.size < MAX_CONCURRENT_SEARCHES && queuedTaskIds.length > 0) {
    const next = queuedTaskIds.shift()!;
    launchSearchTask(next);
  }
}

export async function resumePendingSearchTasks() {
  try {
    // Tasks left in PROCESSING were interrupted by a dyno restart. We cannot
    // safely resume them: processSearchTask restarts from scratch and would
    // re-create every lead (duplicates), and a too-slow task would stay
    // PROCESSING and get relaunched on every restart — a load spiral that locks
    // the dyno. Mark them FAILED so they're visible and the user can retry.
    const stale = await prisma.searchTask.updateMany({
      where: { status: 'PROCESSING' },
      data: { status: 'FAILED' },
    });
    if (stale.count > 0) {
      console.log(`[Processor] Marked ${stale.count} interrupted PROCESSING task(s) as FAILED.`);
    }

    const tasks = await prisma.searchTask.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    tasks.forEach((task) => startSearchTaskProcessing(task.id));

    if (tasks.length > 0) {
      console.log(`[Processor] Resumed ${tasks.length} pending search task(s) (max ${MAX_CONCURRENT_SEARCHES} concurrent).`);
    }
  } catch (error) {
    console.error('[Processor] Failed to resume pending tasks:', error);
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

    const queries = generateQueryVariations(
      task.keyword,
      task.country || undefined,
      task.cityState || undefined,
      task.searchDepth
    );
    console.log(`[Processor] Generated ${queries.length} query variations:`, queries);

    await prisma.searchTask.update({
      where: { id: taskId },
      data: { progress: 10 },
    });

    const discoveredBusinesses = new Map<string, DiscoveredBiz>();
    const searchContext = buildSearchContext(task.keyword, task.cityState || undefined);

    const crawlerQueries = queries.slice(0, 3);
    console.log(`[Processor] Using ${crawlerQueries.length} of ${queries.length} queries for crawler (each triggers a full search+crawl job).`);

    let queryIndex = 0;
    for (const query of crawlerQueries) {
      queryIndex++;
      console.log(`[Processor] Crawler Query [${queryIndex}/${crawlerQueries.length}]: "${query}"`);

      try {
        const crawlerResults = await searchAndCrawl({
          keyword: query,
          region: mapCountryToRegion(task.country || undefined),
          maxResults: 20,
          source: 'combined',
          userId: task.userId,
        });

        for (const result of crawlerResults) {
          const domainKey = result.domain.toLowerCase().replace(/^www\./, '');
          if (!domainKey) continue;

          if (isBlockedWebsiteHost(domainKey)) continue;

          const discovered: DiscoveredBiz = {
            name: result.companyName || result.title || result.domain,
            website: result.url,
            location: result.address || undefined,
            category: undefined,
            rating: undefined,
            reviewsCount: undefined,
            phoneNumbers: result.phones.map(p => p.value),
            snippetEmails: result.emails.map(e => ({ email: e.value, sourcePage: e.sourceUrl })),
            snippetPhones: result.phones.map(p => p.value),
            snippet: '',
            source: result.source === 'google_maps' ? 'Google Maps' : 'Crawler',
          };

          if (shouldSkipDiscoveredBusiness(discovered, searchContext)) continue;

          if (!discoveredBusinesses.has(domainKey)) {
            discoveredBusinesses.set(domainKey, discovered);
          } else {
            const existing = discoveredBusinesses.get(domainKey)!;
            existing.snippetEmails.push(...discovered.snippetEmails);
            existing.phoneNumbers.push(...discovered.phoneNumbers.filter(p => !existing.phoneNumbers.includes(p)));
          }
        }
      } catch (error: any) {
        console.error(`[Processor] Crawler query "${query}" failed: ${error.message}`);
      }

      const scrapingProgress = Math.floor(10 + (20 * (queryIndex / crawlerQueries.length)));
      await prisma.searchTask.update({
        where: { id: taskId },
        data: { progress: scrapingProgress },
      });
    }

    const businessList = Array.from(discoveredBusinesses.values())
      .sort((a, b) => scoreDiscoveredBusiness(b, searchContext) - scoreDiscoveredBusiness(a, searchContext))
      .slice(0, task.searchDepth);
    console.log(`[Processor] Discovered ${discoveredBusinesses.size} unique businesses. Crawling top ${businessList.length}.`);

    if (businessList.length === 0) {
      console.warn(`[Processor] SearchTask ${taskId} completed with no businesses discovered — crawler returned empty results.`);
      await prisma.searchTask.update({
        where: { id: taskId },
        data: { status: 'COMPLETED', progress: 100, totalLeads: 0, validEmails: 0 },
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

    for (const biz of businessList) {
      processedCount++;

      const taskStatus = await checkTaskStatus();
      if (taskStatus === 'PAUSED') {
        console.log(`[Processor] SearchTask ${taskId} paused — stopping crawl loop.`);
        break;
      }
      if (taskStatus === 'CANCELLED') {
        console.log(`[Processor] SearchTask ${taskId} cancelled — stopping crawl loop.`);
        break;
      }

      console.log(`[Processor] [${processedCount}/${businessList.length}] Crawling site: ${biz.website}`);

      try {
        const maxInnerPages = task.searchDepth >= 100 ? 8 : task.searchDepth >= 50 ? 6 : 4;
        const crawlData = biz.website
          ? await crawlWebsite(biz.website, maxInnerPages)
          : { emails: [], phones: [], socials: [], companySize: 'Unknown' as const, hasContactForm: false, notes: 'No website available' };

        const validatedEmails = await aiFilterEmails(
          await validateAndCleanEmails([...biz.snippetEmails, ...crawlData.emails]),
          { businessName: biz.name, website: biz.website, userId: task.userId }
        );
        const phoneNumbers = normalizePhoneList(
          [...biz.phoneNumbers, ...biz.snippetPhones, ...crawlData.phones],
          2
        );

        // Skip leads that have neither a website nor any contact info — they're noise
        if (!biz.website && validatedEmails.length === 0 && phoneNumbers.length === 0) {
          console.log(`[Processor] Skipping lead "${biz.name}" — no website, emails, or phones.`);
          continue;
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
      if (failedBusinesses > 0) {
        console.warn(`[Processor] SearchTask ${taskId}: ${totalLeadsCount} leads saved, ${failedBusinesses} failed.`);
      }
      console.log(`[Processor] Finished SearchTask ${taskId}. Found ${totalLeadsCount} leads, ${totalEmailsCount} emails.`);
    } else {
      console.log(`[Processor] SearchTask ${taskId} is ${finalStatus.status} — ${totalLeadsCount} leads collected so far.`);
      await prisma.searchTask.update({
        where: { id: taskId },
        data: { totalLeads: totalLeadsCount, validEmails: totalEmailsCount },
      });
    }
  } catch (taskError) {
    console.error(`[Processor] Critical error processing SearchTask ${taskId}:`, taskError);

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

function shouldSkipDiscoveredBusiness(biz: DiscoveredBiz, context: SearchContext) {
  const websiteHost = getWebsiteHost(biz.website);
  if (websiteHost && isBlockedWebsiteHost(websiteHost)) {
    return true;
  }

  const haystack = normalizeText(`${biz.name} ${biz.category || ''} ${biz.location || ''} ${biz.website || ''} ${biz.snippet || ''}`);
  const hasKeyword = context.keywordTerms.length === 0 || context.keywordTerms.some((term) => haystack.includes(term));
  const hasRelatedKeyword = /(handyman|repair|maintenance|contractor|construction|home service|home improvement|fix|remodel|renovation|property)/i.test(haystack);
  const hasWrongRegion = context.wrongRegionNeedles.some((needle) => needle && haystack.includes(needle));
  const hasExactRegion = context.regionNeedles.some((needle) => needle && haystack.includes(needle));
  const hasCityRegion = containsPhrase(haystack, context.city);
  const hasRegion = context.regionNeedles.length === 0 || hasExactRegion || hasCityRegion;

  if (context.primaryKeyword.includes('handyman')) {
    const isHomeServiceRelated = HOME_SERVICE_RELATED_PATTERN.test(haystack);
    const isNonHomeRepair = NON_HOME_REPAIR_PATTERN.test(haystack) && !/(home|property|contractor|construction|remodel|handyman)/i.test(haystack);

    return hasWrongRegion || isNonHomeRepair || !(isHomeServiceRelated && hasRegion);
  }

  return hasWrongRegion || !((hasKeyword || hasRelatedKeyword) && hasRegion);
}

function scoreDiscoveredBusiness(biz: DiscoveredBiz, context: SearchContext) {
  let score = 0;
  const haystack = normalizeText(`${biz.name} ${biz.category || ''} ${biz.location || ''} ${biz.website || ''} ${biz.snippet || ''}`);
  const websiteHost = getWebsiteHost(biz.website);

  if (biz.source === 'Google Maps' || biz.source === 'Crawler') score += 30;
  if (biz.website) score += 20;
  if (biz.location) score += 12;
  if (biz.category) score += 8;
  if (biz.phoneNumbers.length > 0 || biz.snippetPhones.length > 0) score += 10;
  if (biz.snippetEmails.length > 0) score += 15;
  if (HOME_SERVICE_RELATED_PATTERN.test(haystack)) score += 15;
  if (context.regionNeedles.some((needle) => haystack.includes(needle))) score += 18;
  if (containsPhrase(haystack, context.city)) score += 10;
  if (context.wrongRegionNeedles.some((needle) => haystack.includes(needle))) score -= 100;
  if (context.primaryKeyword.includes('handyman') && NON_HOME_REPAIR_PATTERN.test(haystack)) score -= 50;
  if (isBlockedWebsiteHost(websiteHost)) score -= 60;

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
