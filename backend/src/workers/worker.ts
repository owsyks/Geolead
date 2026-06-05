import * as dotenv from 'dotenv';
dotenv.config();

import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import prisma from '../config/db.js';
import { generateQueryVariations } from '../services/queryGenerator.js';
import { searchGoogle, searchGooglePlaces } from '../services/serper.js';
import { crawlWebsite } from '../services/crawler.js';
import { validateAndCleanEmails } from '../services/extractor.js';
import axios from 'axios';
import { calculateMatchScore } from '../services/aiScoring.js';
import { getCompanyIntel, scoreBusinessQuality } from '../services/companyIntelligence.js';
import { discoverDecisionMaker } from '../services/decisionMaker.js';
import { analyzeBuyerIntent } from '../services/buyerIntent.js';
import { scoreDomainFit } from '../services/domainFit.js';
import { processOutboundQueueTick } from '../services/outboundPlatform.js';
import { verifyEmailsBulk } from '../services/emailVerification.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

console.log(`[Worker] Connecting to Redis at ${redisUrl}...`);
const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
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

      // 2. Generate Query Variations
      const queries = generateQueryVariations(
        task.keyword,
        task.country || undefined,
        task.cityState || undefined
      );
      console.log(`[Worker] Generated ${queries.length} query variations:`, queries);

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
        source: string;
      }
      
      const discoveredBusinesses = new Map<string, DiscoveredBiz>();

      // Scraping phase progress weight: 10% to 30%
      let queryIndex = 0;
      for (const query of queries) {
        queryIndex++;
        console.log(`[Worker] Scrape Query [${queryIndex}/${queries.length}]: "${query}"`);

        // Fetch Google Places (Maps)
        const places = await searchGooglePlaces(query);
        places.forEach(place => {
          if (!place.website) return;
          
          let domainKey = '';
          try {
            domainKey = new URL(place.website).hostname.replace(/^www\./i, '').toLowerCase();
          } catch {
            return;
          }

          if (!discoveredBusinesses.has(domainKey)) {
            discoveredBusinesses.set(domainKey, {
              name: place.title,
              website: place.website,
              location: place.address,
              googleMapsLink: place.cid ? `https://www.google.com/maps?cid=${place.cid}` : undefined,
              category: place.category,
              rating: place.rating,
              reviewsCount: place.ratingCount,
              source: 'Google Maps'
            });
          }
        });

        // Fetch Organic Search
        const searchResults = await searchGoogle(query);
        searchResults.forEach(result => {
          // Skip general directory domains in organic results to find direct business websites
          const skipDomains = ['yelp.com', 'yellowpages.com', 'facebook.com', 'linkedin.com', 'tripadvisor.com', 'instagram.com'];
          let domainKey = '';
          try {
            domainKey = new URL(result.link).hostname.replace(/^www\./i, '').toLowerCase();
          } catch {
            return;
          }

          if (skipDomains.some(skip => domainKey.includes(skip))) {
            return;
          }

          if (!discoveredBusinesses.has(domainKey)) {
            // Estimate a clean business name from the title
            const rawTitle = result.title.split(/[-|]/)[0]?.trim() || result.title;
            discoveredBusinesses.set(domainKey, {
              name: rawTitle,
              website: result.link,
              source: 'Google Search'
            });
          }
        });

        // Update progress during scraping phase (scale up to 30)
        const scrapingProgress = Math.floor(10 + (20 * (queryIndex / queries.length)));
        await prisma.searchTask.update({
          where: { id: taskId },
          data: { progress: scrapingProgress },
        });
      }

      const businessList = Array.from(discoveredBusinesses.values()).slice(0, task.searchDepth);
      console.log(`[Worker] Discovered ${discoveredBusinesses.size} unique businesses. Crawling top ${businessList.length} based on depth limit.`);

      if (businessList.length === 0) {
        console.log('[Worker] No businesses discovered.');
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

      for (const biz of businessList) {
        processedCount++;
        console.log(`[Worker] [${processedCount}/${businessList.length}] Crawling site: ${biz.website}`);

        try {
          // Crawl website
          const crawlData = biz.website 
            ? await crawlWebsite(biz.website)
            : { emails: [], phones: [], socials: [], companySize: 'Unknown', hasContactForm: false, notes: 'No website available' };

          // Email validation
          const validatedEmails = await validateAndCleanEmails(crawlData.emails);

          // Domain AI Relevance Scoring
          const scoreData = await calculateMatchScore(
            task.domainIdea,
            biz.name,
            biz.category || undefined,
            biz.location || undefined
          );

          // Build explanation and summary tags
          const finalPhones = [...(biz.location ? [] : []), ...crawlData.phones];
          
          // Save Lead to DB
          const createdLead = await prisma.lead.create({
            data: {
              taskId,
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
          try {
            // Company intelligence (staff names, website health, social presence)
            let staffNames: string[] = [];
            let pageText = '';
            if (biz.website) {
              try {
                const domain = new URL(biz.website.startsWith('http') ? biz.website : `https://${biz.website}`).hostname;
                const intel = await getCompanyIntel(domain);
                staffNames = intel.staffNames;

                // Fetch homepage text for analysis
                const resp = await axios.get(biz.website.startsWith('http') ? biz.website : `https://${biz.website}`, {
                  timeout: 5000,
                  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GeoLeadAI/1.0)' },
                  validateStatus: () => true,
                });
                const $ = (await import('cheerio')).load(resp.data);
                $('script, style, noscript, svg, iframe, template').remove();
                pageText = $('body').text().slice(0, 10000);

                // Decision maker discovery
                const dm = await discoverDecisionMaker(
                  biz.name,
                  biz.website,
                  [pageText, crawlData.notes || ''],
                  staffNames,
                  task.userId,
                );

                // Buyer intent analysis
                const intentScore = analyzeBuyerIntent({
                  businessName: biz.name,
                  currentDomain: biz.website ? new URL(biz.website.startsWith('http') ? biz.website : `https://${biz.website}`).hostname : null,
                  targetDomain: task.domainIdea,
                  category: biz.category || null,
                  location: biz.location || null,
                  websiteText: pageText,
                  domainMatchScore: scoreData.score,
                });

                // Domain upgrade fit
                const fitScore = scoreDomainFit({
                  businessName: biz.name,
                  currentDomain: biz.website ? new URL(biz.website.startsWith('http') ? biz.website : `https://${biz.website}`).hostname : null,
                  targetDomain: task.domainIdea,
                  location: biz.location || null,
                  category: biz.category || null,
                });

                // Business quality score
                const qualityScore = scoreBusinessQuality(
                  intel,
                  biz.rating || null,
                  biz.reviewsCount || null,
                  biz.category || null,
                  crawlData.companySize,
                );

                // Priority score — weighted combination
                const dmScore = dm.score || 40;
                const priorityScore = Math.round(
                  dmScore * 0.35 +
                  intentScore * 0.25 +
                  qualityScore * 0.20 +
                  fitScore * 0.20
                );

                // Determine contact strategy
                let contactStrategy = 'contact_form';
                if (dmScore >= 85 && validatedEmails.length > 0) {
                  contactStrategy = 'email_decision_maker';
                } else if (validatedEmails.length > 0) {
                  contactStrategy = 'email_general';
                } else if (crawlData.phones.length > 0) {
                  contactStrategy = 'call_business';
                }

                // Update lead with intelligence data
                await prisma.lead.update({
                  where: { id: createdLead.id },
                  data: {
                    decisionMakerName: dm.name,
                    decisionMakerRole: dm.role,
                    decisionMakerScore: dmScore,
                    decisionMakerEmail: dm.email,
                    buyerIntentScore: intentScore,
                    domainUpgradeScore: fitScore,
                    businessQualityScore: qualityScore,
                    priorityScore,
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
              } catch (innerErr: any) {
                console.warn(`[Worker] Intelligence pipeline error for ${biz.name}: ${innerErr.message}`);
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

      // 5. Finalize Task
      await prisma.searchTask.update({
        where: { id: taskId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          totalLeads: totalLeadsCount,
          validEmails: totalEmailsCount
        },
      });

      console.log(`[Worker] Successfully finished SearchTask ${taskId}. Found ${totalLeadsCount} leads, with ${totalEmailsCount} valid emails.`);

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
