import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const isTls = redisUrl.startsWith('rediss://');

export const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 2000)),
  ...(isTls ? { tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' || process.env.REDIS_REJECT_UNAUTHORIZED !== 'false' } } : {}),
});

redisConnection.on('error', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'ECONNREFUSED') return;
  console.warn('[Queue] Redis error:', err.message);
});

export const scrapingQueue = new Queue('scraping-queue', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export const outboundQueue = new Queue('outbound-queue', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export const emailVerificationQueue = new Queue('email-verification-queue', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});
