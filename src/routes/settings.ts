import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Router } from 'express';
import {
  getSettingsForDisplay,
  setSettings,
  testProvider,
} from '../services/settings.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// All settings are per-user.
router.use(requireAuth);

// Full redacted view for the Settings page (secrets masked, never plaintext).
router.get('/', wrap(async (req, res) => {
  res.json({ settings: await getSettingsForDisplay(req.userId!) });
}));

// Bulk update. Body: { values: { key: value, ... } }. Empty string clears an
// override and reverts to the env fallback. Secret keys left blank/unchanged by
// the UI should simply be omitted from `values` so we don't overwrite them.
router.patch('/', wrap(async (req, res) => {
  const values = (req.body?.values && typeof req.body.values === 'object') ? req.body.values : req.body;
  const clean: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(values || {})) {
    if (value === null) clean[key] = null;
    else if (typeof value === 'string') clean[key] = value;
    else if (typeof value === 'number' || typeof value === 'boolean') clean[key] = String(value);
  }
  await setSettings(clean, req.userId!);
  res.json({ settings: await getSettingsForDisplay(req.userId!) });
}));

// Live connection test for a provider: nvidia | serper | resend | smtp.
router.post('/test/:provider', wrap(async (req, res) => {
  const result = await testProvider(req.params.provider, req.userId!);
  res.status(result.ok ? 200 : 400).json(result);
}));

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Settings API] Error:', err);
  res.status(500).json({ error: (err as any)?.message || 'Settings request failed.' });
});

export default router;

function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
