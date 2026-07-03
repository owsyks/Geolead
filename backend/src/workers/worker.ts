import * as dotenv from 'dotenv';
dotenv.config();

import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import prisma from '../config/db.js';
import { isWrongCountry } from '../services/crawlerClient.js';
import { searchGoogle, searchGooglePlaces } from '../services/serper.js';
import { generateQueryVariations } from '../services/queryGenerator.js';
import { crawlWebsite } from '../services/crawler.js';
import { validateAndCleanEmails } from '../services/extractor.js';
import axios from 'axios';
import { calculateMatchScore } from '../services/aiScoring.js';
import { getCompanyIntel, scoreBusinessQuality, enrichWithAi } from '../services/companyIntelligence.js';
import { discoverDecisionMaker } from '../services/decisionMaker.js';
import { analyzeBuyerIntent, analyzeBuyerIntentWithAi } from '../services/buyerIntent.js';
import { scoreDomainFit, scoreDomainFitWithAi } from '../services/domainFit.js';
import { verifyDecisionMakerViaLinkedIn, wasLinkedInVerified } from '../services/linkedinVerification.js';
import { getNvidiaKey, nvidiaChat } from '../services/aiProvider.js';
import { processOutboundQueueTick } from '../services/outboundPlatform.js';
import { verifyEmailsBulk } from '../services/emailVerification.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const isRedisTls = redisUrl.startsWith('rediss://');

console.log(`[Worker] Connecting to Redis at ${redisUrl}...`);
const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  ...(isRedisTls ? { tls: { rejectUnauthorized: false } } : {}),
});

interface ScrapingJobData {
  taskId: string;
}

const worker = new Worker<ScrapingJobData>(
  'scraping-queue',
  async (job: Job<ScrapingJobData>) => {
    const { taskId } = job.data;
    console.log(`[Worker] Started processing job ${job.id} for SearchTask ${taskId}`);

    // 1. Fetch Search Task
    const task = await prisma.searchTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new Error(`SearchTask ${taskId} not found in database`);
    }

    try {
      // Update status to PROCESSING
      await prisma.searchTask.update({
        where: { id: taskId },
        data: { status: 'PROCESSING', progress: 5 },
      });

      // 2. Build single focused query: keyword + city/state
      const searchQuery = [task.keyword, task.cityState].filter(Boolean).join(' ').trim();
      console.log(`[Worker] Search query: "${searchQuery}"`);

      await prisma.searchTask.update({
        where: { id: taskId },
        data: { progress: 10 },
      });

      // 3. Gather Businesses (deduplicated by domain name)
      interface DiscoveredBiz {
        name: string;
        website?: string;
        location?: string;
        googleMapsLink?: string;
        category?: string;
        rating?: number;
        reviewsCount?: number;
        phoneNumbers: string[];
        snippetEmails: { email: string; sourcePage?: string }[];
        source: string;
      }
      
      const discoveredBusinesses = new Map<string, DiscoveredBiz>();
      const skipDomains = ['yelp.com', 'yellowpages.com', 'facebook.com', 'linkedin.com', 'tripadvisor.com', 'instagram.com'];

      const shouldCancel = async (): Promise<boolean> => {
        const current = await prisma.searchTask.findUnique({ where: { id: taskId }, select: { status: true } });
        return current?.status === 'CANCELLED' || current?.status === 'PAUSED';
      };

      const queries = generateQueryVariations(task.keyword, task.country || undefined, task.cityState || undefined, task.searchDepth);
      const pagesPerQuery = task.searchDepth <= 20 ? 1 : task.searchDepth <= 50 ? 2 : 3;
      const totalFetches = queries.length * pagesPerQuery;
      const searchCap = task.searchDepth * 2;
      console.log(`[Worker] Serper discovery: ${queries.length} queries x ${pagesPerQuery} page(s), cap ${searchCap} businesses.`);

      let fetchesDone = 0;
      let cancelled = false;

      outer: for (const query of queries) {
        if (await shouldCancel()) { cancelled = true; break; }

        for (let page = 1; page <= pagesPerQuery; page++) {
          if (await shouldCancel()) { cancelled = true; break outer; }

          try {
            const [places, organic] = await Promise.all([
              searchGooglePlaces(query, { page, num: 20, userId: task.userId }),
              searchGoogle(query, { page, num: 20, userId: task.userId }),
            ]);

            for (const place of places) {
              if (!place.website) continue;
              if (isWrongCountry(place.address, task.country || '')) continue;
              const domainKey = extractDomainKey(place.website);
              if (!domainKey || skipDomains.some(skip => domainKey.includes(skip))) continue;

              const existing = discoveredBusinesses.get(domainKey);
              if (!existing) {
                discoveredBusinesses.set(domainKey, {
                  name: place.title,
                  website: place.website,
                  location: place.address || undefined,
                  googleMapsLink: place.cid ? `https://www.google.com/maps?cid=${place.cid}` : undefined,
                  category: place.category || undefined,
                  rating: place.rating,
                  reviewsCount: place.ratingCount,
                  phoneNumbers: place.phoneNumber ? [place.phoneNumber] : [],
                  snippetEmails: [],
                  source: 'Google Maps',
                });
              } else {
                existing.location = existing.location || place.address || undefined;
                existing.googleMapsLink = existing.googleMapsLink || (place.cid ? `https://www.google.com/maps?cid=${place.cid}` : undefined);
                existing.category = existing.category || place.category || undefined;
                existing.rating = existing.rating ?? place.rating;
                existing.reviewsCount = existing.reviewsCount ?? place.ratingCount;
                if (place.phoneNumber && !existing.phoneNumbers.includes(place.phoneNumber)) {
                  existing.phoneNumbers.push(place.phoneNumber);
                }
              }
            }

            for (const result of organic) {
              const domainKey = extractDomainKey(result.link);
              if (!domainKey || skipDomains.some(skip => domainKey.includes(skip))) continue;
              if (discoveredBusinesses.has(domainKey)) continue;

              discoveredBusinesses.set(domainKey, {
                name: (result.title || domainKey).split(/[-|]/)[0].trim(),
                website: result.link,
                location: undefined,
                category: undefined,
                rating: undefined,
                reviewsCount: undefined,
                phoneNumbers: [],
                snippetEmails: [],
                source: 'Google Search',
              });
            }
          } catch (error: any) {
            console.error(`[Worker] Serper fetch failed for "${query}" page ${page}: ${error.message}`);
          }

          fetchesDone++;
          const pct = Math.floor(10 + (20 * (fetchesDone / Math.max(totalFetches, 1))));
          await prisma.searchTask.update({
            where: { id: taskId },
            data: { progress: Math.min(pct, 30) },
          }).catch(() => undefined);

          if (discoveredBusinesses.size >= searchCap) { break outer; }
        }
      }

      if (cancelled) {
        console.log(`[Worker] SearchTask ${taskId} cancelled during Serper search.`);
        await prisma.searchTask.update({
          where: { id: taskId },
          data: { status: 'CANCELLED', progress: 100 },
        });
        return;
      }

      await prisma.searchTask.update({
        where: { id: taskId },
        data: { progress: 30 },
      });

      const businessList = Array.from(discoveredBusinesses.values()).slice(0, task.searchDepth);
      console.log(`[Worker] Discovered ${discoveredBusinesses.size} unique businesses. Crawling top ${businessList.length}.`);

      if (businessList.length === 0) {
        console.log('[Worker] No businesses discovered — crawler returned empty results.');
        await prisma.searchTask.update({
          where: { id: taskId },
          data: { status: 'COMPLETED', progress: 100, totalLeads: 0, validEmails: 0 },
        });
        return;
      }

      // 4. Crawl & Score each business
      let processedCount = 0;
      let totalLeadsCount = 0;
      let totalEmailsCount = 0;

      const checkTaskStatus = async () => {
        const current = await prisma.searchTask.findUnique({ where: { id: taskId }, select: { status: true } });
        return current?.status;
      };

      for (const biz of businessList) {
        processedCount++;

        // Check if task was paused or cancelled
        const taskStatus = await checkTaskStatus();
        if (taskStatus === 'PAUSED') {
          console.log(`[Worker] SearchTask ${taskId} paused — stopping crawl loop.`);
          break;
        }
        if (taskStatus === 'CANCELLED') {
          console.log(`[Worker] SearchTask ${taskId} cancelled — stopping crawl loop.`);
          break;
        }
        console.log(`[Worker] [${processedCount}/${businessList.length}] Crawling site: ${biz.website}`);

        try {
          // Crawl website (for companySize, notes/pageText, and backup email extraction)
          const crawlData = biz.website 
            ? await crawlWebsite(biz.website)
            : { emails: [], phones: [], socials: [], companySize: 'Unknown', hasContactForm: false, notes: 'No website available' };

          // Combine crawler-extracted emails with crawlWebsite emails
          const allEmailCandidates = [...biz.snippetEmails, ...crawlData.emails];
          const seenEmails = new Set<string>();
          const uniqueEmailCandidates = allEmailCandidates.filter(e => {
            const key = e.email.toLowerCase();
            if (seenEmails.has(key)) return false;
            seenEmails.add(key);
            return true;
          });
          const allPhones = [...biz.phoneNumbers, ...crawlData.phones];
          const uniquePhones = [...new Set(allPhones)];

          // Email validation
          const validatedEmails = await validateAndCleanEmails(uniqueEmailCandidates);

          // Domain AI Relevance Scoring
          const scoreData = await calculateMatchScore(
            task.domainIdea,
            biz.name,
            biz.category || undefined,
            biz.location || undefined
          );

          const finalPhones = uniquePhones;
          
          // Save Lead to DB
          const createdLead = await prisma.lead.create({
            data: {
              taskId,
              ownerId: task.userId,
              businessName: biz.name,
              website: biz.website || null,
              location: biz.location || null,
              googleMapsLink: biz.googleMapsLink || null,
              category: biz.category || null,
              rating: biz.rating || null,
              reviewsCount: biz.reviewsCount || null,
              phoneNumbers: finalPhones,
              socialLinks: crawlData.socials,
              domainMatchScore: scoreData.score,
              scoreExplanation: scoreData.explanation,
              companySize: crawlData.companySize,
              summary: `${biz.name} is a local business categorized as a ${biz.category || 'general service provider'}. AI evaluation scored this business ${scoreData.score}% relevant to the domain "${task.domainIdea}".`,
              notes: crawlData.notes
            }
          });

          // Save Email Contacts to DB
          if (validatedEmails.length > 0) {
            await prisma.leadEmail.createMany({
              data: validatedEmails.map(ve => ({
                leadId: createdLead.id,
                email: ve.email,
                status: ve.status,
                confidenceScore: ve.confidenceScore,
                sourcePage: ve.sourcePage
              }))
            });

            const validCount = validatedEmails.filter(e => e.status !== 'INVALID').length;
            totalEmailsCount += validCount;
          }

          // === Decision Maker & Buyer Intelligence Pipeline ===
          const pipelineError = (msg: string) => console.warn(`[Worker] ${msg} for ${biz.name}`);
          try {
            let staffNames: string[] = [];
            let pageText = '';
            if (biz.website) {
              try {
                const domain = new URL(biz.website.startsWith('http') ? biz.website : `https://${biz.website}`).hostname;
                const intel = await getCompanyIntel(domain);
                staffNames = intel.staffNames;

                const resp = await axios.get(biz.website.startsWith('http') ? biz.website : `https://${biz.website}`, {
                  timeout: 5000,
                  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GeoLeadAI/1.0)' },
                  validateStatus: () => true,
                });
                const $ = (await import('cheerio')).load(resp.data);
                $('script, style, noscript, svg, iframe, template').remove();
                pageText = $('body').text().slice(0, 10000);

                // Decision maker discovery (heuristic + AI in parallel)
                const dm = await discoverDecisionMaker(
                  biz.name, biz.website, [pageText, crawlData.notes || ''],
                  staffNames, task.userId,
                );

                // Buyer intent (heuristic)
                const intentInput = {
                  businessName: biz.name,
                  currentDomain: biz.website ? new URL(biz.website.startsWith('http') ? biz.website : `https://${biz.website}`).hostname : null,
                  targetDomain: task.domainIdea, category: biz.category || null,
                  location: biz.location || null, websiteText: pageText,
                  domainMatchScore: scoreData.score,
                };
                const intentScore = analyzeBuyerIntent(intentInput);

                // Domain fit (heuristic)
                const fitInput = {
                  businessName: biz.name,
                  currentDomain: biz.website ? new URL(biz.website.startsWith('http') ? biz.website : `https://${biz.website}`).hostname : null,
                  targetDomain: task.domainIdea, location: biz.location || null,
                  category: biz.category || null,
                };
                const fitScore = scoreDomainFit(fitInput);

                // Business quality score
                const qualityScore = scoreBusinessQuality(intel, biz.rating || null, biz.reviewsCount || null, biz.category || null, crawlData.companySize);

                const dmScore = dm.score || 40;
                const priorityScore = Math.round(dmScore * 0.35 + intentScore * 0.25 + qualityScore * 0.20 + fitScore * 0.20);

                let contactStrategy = 'contact_form';
                if (dmScore >= 85 && validatedEmails.length > 0) contactStrategy = 'email_decision_maker';
                else if (validatedEmails.length > 0) contactStrategy = 'email_general';
                else if (crawlData.phones.length > 0) contactStrategy = 'call_business';

                // Save heuristic scores immediately
                await prisma.lead.update({
                  where: { id: createdLead.id },
                  data: {
                    decisionMakerName: dm.name, decisionMakerRole: dm.role,
                    decisionMakerScore: dmScore, decisionMakerEmail: dm.email,
                    buyerIntentScore: intentScore, domainUpgradeScore: fitScore,
                    businessQualityScore: qualityScore, priorityScore,
                    contactStrategy,
                    buyerInsights: {
                      decisionMakerSource: dm.source,
                      buyerIntentLabel: intentScore >= 65 ? 'high' : intentScore >= 45 ? 'moderate' : 'low',
                      domainFitLabel: fitScore >= 60 ? 'strong' : fitScore >= 40 ? 'moderate' : 'weak',
                      hasStaffOnPage: staffNames.length > 0,
                      qualityLabel: qualityScore >= 60 ? 'good' : qualityScore >= 40 ? 'average' : 'poor',
                    },
                  },
                });

                // === AI ENRICHMENT (fire-and-forget, updates lead with AI-enhanced scores + insights) ===
                (async () => {
                  try {
                    const [aiIntel, aiIntent, aiFit] = await Promise.all([
                      enrichWithAi(biz.name, pageText, task.userId),
                      analyzeBuyerIntentWithAi(intentInput, task.userId),
                      scoreDomainFitWithAi(fitInput, task.userId),
                    ]);

                    const blendedIntent = aiIntent !== null ? Math.round((intentScore + aiIntent) / 2) : intentScore;
                    const blendedFit = aiFit !== null ? Math.round((fitScore + aiFit) / 2) : fitScore;
                    const blendedPriority = Math.round(dmScore * 0.35 + blendedIntent * 0.25 + qualityScore * 0.20 + blendedFit * 0.20);

                    // Generate AI buyer insight narrative
                    let aiInsight: string | null = null;
                    if (aiIntel || aiIntent !== null || aiFit !== null) {
                      const nvidiaKey = await getNvidiaKey(task.userId);
                      if (nvidiaKey) {
                        try {
                          const insightPrompt = `Generate a 2-3 sentence buyer insight for ${biz.name}.
Priority Score: ${blendedPriority}/100
Decision Maker: ${dm.name || 'Unknown'} (${dm.role || 'Unknown role'})
Buyer Intent: ${blendedIntent}/100
Domain Fit: ${blendedFit}/100
Business Quality: ${qualityScore}/100
Target Domain: ${task.domainIdea}
${aiIntel ? `Industry: ${aiIntel.industry}` : ''}
${aiIntel ? `Description: ${aiIntel.description}` : ''}

Write a concise insight explaining why this lead matters and how to approach them. Focus on the domain opportunity.`;
                          const raw = await nvidiaChat(
                            [{ role: 'user', content: insightPrompt }],
                            { maxTokens: 200, temperature: 0.3, timeoutMs: 12000, userId: task.userId }
                          );
                          const cleaned = raw.replace(/^["']|["']$/g, '').trim();
                          if (cleaned.length > 20) aiInsight = cleaned;
                        } catch { /* insight non-critical */ }
                      }
                    }

                    await prisma.lead.update({
                      where: { id: createdLead.id },
                      data: {
                        buyerIntentScore: blendedIntent,
                        domainUpgradeScore: blendedFit,
                        priorityScore: blendedPriority,
                        companyDescription: aiIntel?.description || undefined,
                        painPoints: aiIntel?.painPoints || undefined,
                        buyerInsights: {
                          aiSummary: aiInsight,
                          aiIndustry: aiIntel?.industry || null,
                          aiEnriched: !!aiIntel,
                          buyerIntentLabel: blendedIntent >= 65 ? 'high' : blendedIntent >= 45 ? 'moderate' : 'low',
                          domainFitLabel: blendedFit >= 60 ? 'strong' : blendedFit >= 40 ? 'moderate' : 'weak',
                        },
                      },
                    });
                  } catch { /* AI enrichment non-critical */ }
                })();

                // LinkedIn verification — fire and forget after DM discovered
                if (dm.name && dm.role) {
                  (async () => {
                    try {
                      const li = await verifyDecisionMakerViaLinkedIn(biz.name, dm.name, dm.role, task.userId);
                      if (wasLinkedInVerified(li)) {
                        const dmConfidence = li.confidence === 'high' ? 'high' : 'medium';
                        await prisma.lead.update({
                          where: { id: createdLead.id },
                          data: {
                            decisionMakerScore: dm.score ? Math.min(100, dm.score + 5) : dm.score,
                            buyerInsights: {
                              linkedinUrl: li.profileUrl,
                              linkedinVerified: true,
                              linkedinConfidence: dmConfidence,
                              linkedinTitle: li.verifiedTitle,
                            },
                          },
                        }).catch(() => undefined);
                      }
                    } catch { /* LinkedIn non-critical */ }
                  })();
                }

              } catch (innerErr: any) {
                pipelineError(`Intelligence pipeline error: ${innerErr.message}`);
              }
            }
          } catch {
            // Intelligence pipeline is non-critical — don't fail the lead
          }

          totalLeadsCount++;
        } catch (bizError: any) {
          console.error(`[Worker] Error processing lead ${biz.name}: ${bizError.message}`);
        }

        // Update progress (scale from 30% to 95%)
        const crawlProgress = Math.floor(30 + (65 * (processedCount / businessList.length)));
        await prisma.searchTask.update({
          where: { id: taskId },
          data: { 
            progress: crawlProgress,
            totalLeads: totalLeadsCount,
            validEmails: totalEmailsCount
          },
        });
      }

      // 5. Finalize Task (don't overwrite PAUSED/CANCELLED)
      const finalStatus = await prisma.searchTask.findUnique({ where: { id: taskId }, select: { status: true } });
      if (finalStatus?.status !== 'PAUSED' && finalStatus?.status !== 'CANCELLED') {
        await prisma.searchTask.update({
          where: { id: taskId },
          data: {
            status: 'COMPLETED',
            progress: 100,
            totalLeads: totalLeadsCount,
            validEmails: totalEmailsCount,
          },
        });
        console.log(`[Worker] Successfully finished SearchTask ${taskId}. Found ${totalLeadsCount} leads, with ${totalEmailsCount} valid emails.`);
      } else {
        console.log(`[Worker] SearchTask ${taskId} is ${finalStatus.status} — saving ${totalLeadsCount} leads collected so far.`);
        // Still update progress/counts so the frontend shows what was collected
        await prisma.searchTask.update({
          where: { id: taskId },
          data: { totalLeads: totalLeadsCount, validEmails: totalEmailsCount },
        });
      }

    } catch (taskError: any) {
      console.error(`[Worker] Critical error processing SearchTask ${taskId}:`, taskError);
      
      await prisma.searchTask.update({
        where: { id: taskId },
        data: {
          status: 'FAILED',
          progress: 100,
        },
      });

      throw taskError;
    }
  },
  {
    connection: redisConnection,
    concurrency: 2, // process 2 searches concurrently
  }
);

const outboundWorker = new Worker(
  'outbound-queue',
  async (job: Job) => {
    console.log(`[Worker] Processing outbound queue job ${job.id}`);
    return processOutboundQueueTick();
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
);

interface EmailVerificationJobData {
  jobRecordId: string;
  emails: string[];
}

const emailVerificationWorker = new Worker<EmailVerificationJobData>(
  'email-verification-queue',
  async (job: Job<EmailVerificationJobData>) => {
    const { jobRecordId, emails } = job.data;
    console.log(`[Worker] Email verification job ${job.id} for record ${jobRecordId} (${emails.length} emails)`);

    await prisma.emailVerificationJob.update({
      where: { id: jobRecordId },
      data: { status: 'PROCESSING', totalEmails: emails.length, processedEmails: 0 },
    });

    let valid = 0, risky = 0, invalid = 0;
    let lastUpdate = Date.now();

    const results = await verifyEmailsBulk(emails, 10, async (done) => {
      if (Date.now() - lastUpdate > 1500) {
        lastUpdate = Date.now();
        await prisma.emailVerificationJob.update({
          where: { id: jobRecordId },
          data: { processedEmails: done },
        }).catch(() => undefined);
      }
    });

    for (const r of results) {
      if (r.status === 'VALID') valid++;
      else if (r.status === 'RISKY') risky++;
      else invalid++;
    }

    await prisma.emailVerificationJob.update({
      where: { id: jobRecordId },
      data: {
        status: 'COMPLETED',
        processedEmails: emails.length,
        validEmails: valid,
        riskyEmails: risky,
        invalidEmails: invalid,
        metadata: { results: results.slice(0, 1000) as any },
      },
    });

    return { processed: emails.length, valid, risky, invalid };
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed with error: ${err.message}`);
});

outboundWorker.on('completed', (job) => {
  console.log(`[Worker] Outbound job ${job.id} completed successfully`);
});

outboundWorker.on('failed', (job, err) => {
  console.error(`[Worker] Outbound job ${job?.id} failed with error: ${err.message}`);
});

emailVerificationWorker.on('completed', (job) => {
  console.log(`[Worker] Email verification job ${job.id} completed`);
});

emailVerificationWorker.on('failed', async (job, err) => {
  console.error(`[Worker] Email verification job ${job?.id} failed: ${err.message}`);
  if (job?.data?.jobRecordId) {
    await prisma.emailVerificationJob.update({
      where: { id: job.data.jobRecordId },
      data: { status: 'FAILED', errorMessage: err.message },
    }).catch(() => undefined);
  }
});

console.log('[Worker] Worker process initialized and waiting for jobs.');
export default worker;

function extractDomainKey(url: string): string | null {
  try {
    const withProtocol = url.startsWith('http') ? url : `https://${url}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}
