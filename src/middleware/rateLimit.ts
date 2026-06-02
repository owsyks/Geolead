// Reusable in-memory rate limiter (extracted from server.ts so auth routes can
// share it). Single-process friendly; for multi-dyno scale this would move to
// Redis, but the fixed-window bucket is adequate for the current footprint.
import type { Request, Response, NextFunction } from 'express';

const buckets = new Map<string, { count: number; resetAt: number }>();

// Periodically drop expired buckets so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}, 10 * 60 * 1000).unref();

export function clientId(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientKey = `${key}:${clientId(req)}`;
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
