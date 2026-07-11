// Reusable in-memory rate limiter (extracted from server.ts so auth routes can
// share it). Single-process friendly; for multi-dyno scale this would move to
// Redis, but the fixed-window bucket is adequate for the current footprint.
import type { Request, Response, NextFunction } from 'express';
import { redisConnection } from '../queues/queues.js';

const buckets = new Map<string, { count: number; resetAt: number }>();

// Periodically drop expired buckets so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}, 10 * 60 * 1000).unref();

export function clientId(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identity = req.userId ? `user:${req.userId}` : `ip:${clientId(req)}`;
    const clientKey = `ratelimit:${key}:${identity}`;
    try {
      if (redisConnection.status === 'wait') await redisConnection.connect();
      if (redisConnection.status === 'ready') {
        const count = await redisConnection.incr(clientKey);
        if (count === 1) await redisConnection.pexpire(clientKey, windowMs);
        const ttl = await redisConnection.pttl(clientKey);
        res.setHeader('RateLimit-Limit', String(limit));
        res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - count)));
        if (count > limit) {
          res.setHeader('Retry-After', String(Math.max(1, Math.ceil(ttl / 1000))));
          return res.status(429).json({ error: 'Rate limit exceeded. Please slow down and try again shortly.' });
        }
        return next();
      }
      if (process.env.NODE_ENV === 'production') return res.status(503).json({ error: 'Request protection is temporarily unavailable.' });
    } catch (error) {
      if (process.env.NODE_ENV === 'production') {
        console.error('[RateLimit] Redis unavailable:', error instanceof Error ? error.message : 'unknown');
        return res.status(503).json({ error: 'Request protection is temporarily unavailable.' });
      }
    }
    // Local development remains usable without Redis; production never falls
    // back to per-process counters because that is bypassable across dynos.
    const now = Date.now();
    const bucket = buckets.get(clientKey);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(clientKey, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= limit) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Rate limit exceeded. Please slow down and try again shortly.' });
    }
    bucket.count += 1;
    return next();
  };
}
