// Auth middleware: validates the Bearer access token and attaches the resolved
// user id to the request. `requireAuth` rejects unauthenticated requests;
// `optionalAuth` resolves a user if a valid token is present but never blocks.
import type { Request, Response, NextFunction } from 'express';
import prisma from '../config/db.js';
import { verifyAccessToken } from '../services/auth.js';

// Augment Express Request with the authenticated principal.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  const payload = verifyAccessToken(token);
  if (!payload?.sub) return res.status(401).json({ error: 'Invalid or expired session.' });

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, isActive: true } });
  if (!user || !user.isActive) return res.status(401).json({ error: 'Account not found or inactive.' });

  req.userId = user.id;
  req.userEmail = user.email;
  return next();
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = bearer(req);
  if (token) {
    const payload = verifyAccessToken(token);
    if (payload?.sub) {
      req.userId = payload.sub;
      req.userEmail = payload.email;
    }
  }
  return next();
}
