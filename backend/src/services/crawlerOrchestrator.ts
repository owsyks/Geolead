import axios from 'axios';
import { redisConnection } from '../queues/queues.js';
import { searchAndCrawl, type SearchAndCrawlResult } from './crawlerClient.js';
import { searchWithSerper, getSerperKeys } from './serperClient.js';
import { getSetting } from './settings.js';

const MAX_PER_KEY_PER_DAY = 2500;
const MAX_SERPER_PER_TASK = 50;

const serperUsageByTask = new Map<string, number>();

const SERPER_KEYS = getSerperKeys();
if (SERPER_KEYS.length > 0) {
  console.log(`[Orchestrator] Serper enabled with ${SERPER_KEYS.length} key(s) (max ${MAX_SERPER_PER_TASK}/task, ${MAX_PER_KEY_PER_DAY}/key/day)`);
} else {
  console.log('[Orchestrator] No Serper keys configured — using VM crawler only.');
}

function keyPrefix(key: string): string {
  return key.substring(0, 8);
}

function usageRedisKey(prefix: string): string {
  return `serper:usage:${prefix}`;
}

function dateRedisKey(prefix: string): string {
  return `serper:date:${prefix}`;
}

async function getUsage(key: string): Promise<number> {
  const prefix = keyPrefix(key);
  const today = new Date().toISOString().split('T')[0];
  const storedDate = await redisConnection.get(dateRedisKey(prefix));

  if (storedDate !== today) {
    await redisConnection.set(dateRedisKey(prefix), today);
    await redisConnection.set(usageRedisKey(prefix), '0');
    return 0;
  }

  const usage = await redisConnection.get(usageRedisKey(prefix));
  return parseInt(usage || '0', 10);
}

async function incrementUsage(key: string): Promise<void> {
  const prefix = keyPrefix(key);
  await redisConnection.incr(usageRedisKey(prefix));
}

async function pickBestKey(): Promise<string | null> {
  let bestKey: string | null = null;
  let bestRemaining = -1;

  for (const key of SERPER_KEYS) {
    const usage = await getUsage(key);
    const remaining = MAX_PER_KEY_PER_DAY - usage;
    if (remaining > bestRemaining) {
      bestRemaining = remaining;
      bestKey = key;
    }
  }

  return bestKey;
}

async function isVmHealthy(userId?: string | null): Promise<boolean> {
  try {
    const baseUrl = await getSetting('crawlerBaseUrl', userId);
    if (!baseUrl) return false;
    const apiKey = await getSetting('crawlerApiKey', userId);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    await axios.get(`${baseUrl}/health`, { headers, timeout: 5000, validateStatus: (s) => s < 500 });
    return true;
  } catch {
    return false;
  }
}

async function pickSource(
  taskId: string,
  userId?: string | null,
): Promise<'vm' | 'serper'> {
  const taskUsage = serperUsageByTask.get(taskId) || 0;

  if (taskUsage >= MAX_SERPER_PER_TASK) {
    return 'vm';
  }

  const vmUp = await isVmHealthy(userId);

  if (!vmUp) {
    if (SERPER_KEYS.length > 0) {
      return 'serper';
    }
    return 'vm';
  }

  const bestKey = await pickBestKey();
  if (!bestKey) {
    return 'vm';
  }

  const usage = await getUsage(bestKey);
  const remaining = MAX_PER_KEY_PER_DAY - usage;
  const remainingPct = remaining / MAX_PER_KEY_PER_DAY;

  if (remainingPct < 0.05) {
    return 'vm';
  }

  const serperBias = Math.min(remainingPct, 0.5);
  return Math.random() < serperBias ? 'serper' : 'vm';
}

async function serperSearchWrapper(
  query: string,
  taskId: string,
  apiKey: string,
): Promise<SearchAndCrawlResult> {
  const businesses = await searchWithSerper(query, apiKey);
  serperUsageByTask.set(taskId, (serperUsageByTask.get(taskId) || 0) + 1);
  await incrementUsage(apiKey);
  console.log(`[Orchestrator] Serper search "${query}" — ${businesses.length} results (key ${keyPrefix(apiKey)}...)`);
  return { results: businesses, jobId: 0 };
}

export async function orchestrateSearch(params: {
  keyword: string;
  region?: string;
  maxResults?: number;
  source?: 'web' | 'google_maps' | 'combined';
  proxyscrapeEnabled?: boolean;
  userId?: string | null;
  onProgress?: (processed: number, total: number) => void;
  shouldCancel?: () => Promise<boolean>;
  taskId: string;
}): Promise<SearchAndCrawlResult> {
  const { taskId, userId, ...searchParams } = params;

  const source = await pickSource(taskId, userId);

  if (source === 'serper') {
    const key = await pickBestKey();
    if (!key) {
      console.warn('[Orchestrator] No Serper key available — falling back to VM.');
      return searchAndCrawl({ ...searchParams, userId });
    }
    return serperSearchWrapper(params.keyword, taskId, key);
  }

  return searchAndCrawl({ ...searchParams, userId });
}

export function resetTaskUsage(taskId: string) {
  serperUsageByTask.delete(taskId);
}

export function getTaskSerperUsage(taskId: string): number {
  return serperUsageByTask.get(taskId) || 0;
}
