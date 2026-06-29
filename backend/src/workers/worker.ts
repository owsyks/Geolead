import * as dotenv from 'dotenv';
dotenv.config();

import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { processSearchTask } from '../services/taskProcessor.js';
import { processOutboundQueueTick } from '../services/outboundPlatform.js';
import { verifyEmailsBulk } from '../services/emailVerification.js';
import prisma from '../config/db.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const isRedisTls = redisUrl.startsWith('rediss://');

const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  ...(isRedisTls ? { tls: { rejectUnauthorized: false } } : {}),
});

interface ScrapingJobData {
  taskId: string;
}

const searchWorker = new Worker<ScrapingJobData>(
  'scraping-queue',
  async (job: Job<ScrapingJobData>) => {
    const { taskId } = job.data;
    console.log(`[Worker] Job ${job.id} — processing SearchTask ${taskId}`);
    await processSearchTask(taskId);
  },
  {
    connection: redisConnection,
    concurrency: 2,
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

searchWorker.on('completed', (job) => {
  console.log(`[Worker] Search job ${job.id} completed`);
});

searchWorker.on('failed', (job, err) => {
  console.error(`[Worker] Search job ${job?.id} failed: ${err.message}`);
});

outboundWorker.on('completed', (job) => {
  console.log(`[Worker] Outbound job ${job.id} completed`);
});

outboundWorker.on('failed', (job, err) => {
  console.error(`[Worker] Outbound job ${job?.id} failed: ${err.message}`);
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

console.log('[Worker] Initialized. Waiting for jobs...');
