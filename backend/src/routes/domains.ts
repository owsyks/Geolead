import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import axios from 'axios';
import {
  archiveDomain,
  bulkImportDomains,
  buyerDiscoveryParams,
  createBuyer,
  createDomain,
  deleteBuyer,
  deleteDomain,
  deleteOffer,
  getDomain,
  getKanban,
  getPortfolioDashboard,
  listBuyers,
  listDomains,
  markUnsold,
  reanalyzeDomain,
  recordOffer,
  recordSale,
  restoreDomain,
  updateBuyer,
  updateDomain,
  updateOffer,
  DOMAIN_STATUSES,
} from '../services/domains.js';
import { runBulkAcquisitionScan, investorChat, type BulkScanResult } from '../services/acquisitionAdvisor.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ─── In-memory job store (avoids Heroku's 30s router timeout) ────────────────
// Jobs run in the background; clients poll /acquisition-scan/status/:jobId.
type ScanJob = {
  userId: string;
  status: 'processing' | 'done' | 'error';
  result?: BulkScanResult;
  error?: string;
  domains: string[];
  startedAt: Date;
};
const scanJobs = new Map<string, ScanJob>();

function pruneOldJobs() {
  const cutoff = Date.now() - 30 * 60 * 1000; // keep 30 min
  for (const [id, job] of scanJobs) {
    if (job.startedAt.getTime() < cutoff) scanJobs.delete(id);
  }
}

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Every domain endpoint is scoped to the authenticated user.
router.use(requireAuth);

router.get('/statuses', (_req, res) => {
  res.json({ statuses: DOMAIN_STATUSES });
});

// Proxy for Wayback Machine CDX API — avoids browser CORS/rate-limit blocks.
router.get('/archive-check', wrap(async (req, res) => {
  const domain = asString(req.query.domain as string);
  if (!domain) return res.status(400).json({ error: 'domain is required.' });
  try {
    const url = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}&output=json&limit=20&fl=timestamp,statuscode&collapse=timestamp:6`;
    const response = await axios.get(url, { timeout: 12000 });
    res.json(Array.isArray(response.data) ? response.data : []);
  } catch {
    res.json([]); // empty = no records found, not an error
  }
}));

// Poll background scan job status — must be before /:id routes.
router.get('/acquisition-scan/status/:jobId', wrap(async (req, res) => {
  const job = scanJobs.get(req.params.jobId);
  if (!job || job.userId !== req.userId) return res.status(404).json({ error: 'Job not found or expired.' });
  res.json({
    jobId: req.params.jobId,
    status: job.status,
    domainCount: job.domains.length,
    result: job.result ?? null,
    error: job.error ?? null,
  });
}));

router.get('/dashboard', wrap(async (req, res) => {
  res.json(await getPortfolioDashboard(req.userId!));
}));

router.get('/kanban', wrap(async (req, res) => {
  res.json(await getKanban(req.userId!));
}));

router.get('/', wrap(async (req, res) => {
  const domains = await listDomains(req.userId!, {
    status: asString(req.query.status),
    search: asString(req.query.search),
    category: asString(req.query.category),
    tag: asString(req.query.tag),
    includeArchived: asString(req.query.includeArchived) === 'true',
  });
  res.json(domains);
}));

router.post('/', wrap(async (req, res) => {
  const name = asString(req.body.name);
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const domain = await createDomain({
    name,
    status: nonEmpty(req.body.status),
    purchaseDate: nonEmpty(req.body.purchaseDate) || null,
    purchasePrice: asNumber(req.body.purchasePrice),
    registrar: nonEmpty(req.body.registrar),
    expirationDate: nonEmpty(req.body.expirationDate) || null,
    category: nonEmpty(req.body.category),
    niche: nonEmpty(req.body.niche),
    industry: nonEmpty(req.body.industry),
    city: nonEmpty(req.body.city),
    state: nonEmpty(req.body.state),
    country: nonEmpty(req.body.country),
    tags: asStringArray(req.body.tags),
    targetIndustries: asStringArray(req.body.targetIndustries),
    targetLocations: asStringArray(req.body.targetLocations),
    notes: nonEmpty(req.body.notes),
  }, req.userId!);
  res.status(201).json(domain);
}));

router.post('/import', wrap(async (req, res) => {
  const rows = parseImportRows(req.body);
  const result = await bulkImportDomains({
    rows,
    defaultStatus: asString(req.body.defaultStatus) || undefined,
  }, req.userId!);
  res.json(result);
}));

router.get('/:id', wrap(async (req, res) => {
  const domain = await getDomain(req.params.id, req.userId!);
  if (!domain) return res.status(404).json({ error: 'Domain not found.' });
  res.json(domain);
}));

router.patch('/:id', wrap(async (req, res) => {
  const domain = await updateDomain(req.params.id, {
    name: asString(req.body.name) || undefined,
    status: asString(req.body.status) || undefined,
    purchaseDate: req.body.purchaseDate === undefined ? undefined : (req.body.purchaseDate || null),
    purchasePrice: req.body.purchasePrice === undefined ? undefined : (asNumber(req.body.purchasePrice) ?? null),
    registrar: req.body.registrar === undefined ? undefined : (asString(req.body.registrar) || null),
    expirationDate: req.body.expirationDate === undefined ? undefined : (req.body.expirationDate || null),
    category: req.body.category === undefined ? undefined : (asString(req.body.category) || null),
    niche: req.body.niche === undefined ? undefined : (asString(req.body.niche) || null),
    industry: req.body.industry === undefined ? undefined : (asString(req.body.industry) || null),
    city: req.body.city === undefined ? undefined : (asString(req.body.city) || null),
    state: req.body.state === undefined ? undefined : (asString(req.body.state) || null),
    country: req.body.country === undefined ? undefined : (asString(req.body.country) || null),
    tags: req.body.tags === undefined ? undefined : asStringArray(req.body.tags),
    targetIndustries: req.body.targetIndustries === undefined ? undefined : asStringArray(req.body.targetIndustries),
    targetLocations: req.body.targetLocations === undefined ? undefined : asStringArray(req.body.targetLocations),
    notes: req.body.notes === undefined ? undefined : (asString(req.body.notes) || null),
  }, req.userId!);
  res.json(domain);
}));

router.delete('/:id', wrap(async (req, res) => {
  res.json(await deleteDomain(req.params.id, req.userId!));
}));

router.post('/:id/archive', wrap(async (req, res) => {
  res.json(await archiveDomain(req.params.id, req.userId!));
}));

router.post('/:id/restore', wrap(async (req, res) => {
  res.json(await restoreDomain(req.params.id, req.userId!));
}));

router.post('/:id/analyze', wrap(async (req, res) => {
  res.json(await reanalyzeDomain(req.params.id, req.userId!));
}));

// Bulk AI acquisition scan — starts background job to avoid Heroku 30s timeout.
// Client polls GET /acquisition-scan/status/:jobId until status === 'done'.
router.post('/acquisition-scan', wrap(async (req, res) => {
  const domains = asStringArray(req.body.domains);
  if (!domains.length) return res.status(400).json({ error: 'domains array is required.' });
  if (domains.length > 100) return res.status(400).json({ error: 'Maximum 100 domains per scan.' });

  pruneOldJobs();
  const jobId = randomBytes(32).toString('base64url');
  const userId = req.userId!;
  scanJobs.set(jobId, { userId, status: 'processing', domains, startedAt: new Date() });

  // Fire-and-forget — response returns immediately.
  void runBulkAcquisitionScan(domains, userId)
    .then(result => {
      const job = scanJobs.get(jobId);
      if (job) { job.status = 'done'; job.result = result; }
    })
    .catch((err: unknown) => {
      const job = scanJobs.get(jobId);
      if (job) { job.status = 'error'; job.error = (err as any)?.message || 'Scan failed.'; }
    });

  res.json({ jobId, status: 'processing', domainCount: domains.length });
}));

// AI investor chat using inline analysis data (no domain ID required).
router.post('/acquisition-scan-chat', wrap(async (req, res) => {
  const { domain, analysis, recommendation, message, history } = req.body;
  if (!domain || !message?.trim()) return res.status(400).json({ error: 'domain and message are required.' });
  const reply = await investorChat(
    domain, analysis ?? null, recommendation ?? null,
    message.trim(),
    Array.isArray(history) ? history : [],
    req.userId!
  );
  res.json({ reply });
}));

// AI investor chat for a domain already in the portfolio (uses stored metadata).
router.post('/:id/investor-chat', wrap(async (req, res) => {
  const domain = await getDomain(req.params.id, req.userId!);
  if (!domain) return res.status(404).json({ error: 'Domain not found.' });
  const { message, history } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message is required.' });
  const analysis = (domain.metadata as any) ?? null;
  const reply = await investorChat(
    domain.name, analysis, null,
    message.trim(),
    Array.isArray(history) ? history : [],
    req.userId!
  );
  res.json({ reply });
}));

router.post('/:id/sale', wrap(async (req, res) => {
  const buyerName = asString(req.body.buyerName);
  const salePrice = asNumber(req.body.salePrice);
  if (!buyerName || !salePrice) return res.status(400).json({ error: 'buyerName and salePrice are required.' });
  res.json(await recordSale(req.params.id, {
    buyerName,
    salePrice,
    buyerEmail: asString(req.body.buyerEmail),
    currency: asString(req.body.currency) || undefined,
    saleDate: asString(req.body.saleDate) || undefined,
    marketplace: asString(req.body.marketplace),
    fees: asNumber(req.body.fees) ?? 0,
    notes: asString(req.body.notes),
  }, req.userId!));
}));

router.delete('/:id/sale', wrap(async (req, res) => {
  res.json(await markUnsold(req.params.id, req.userId!));
}));

router.get('/:id/buyers', wrap(async (req, res) => {
  res.json(await listBuyers(req.params.id, req.userId!));
}));

router.post('/:id/buyers', wrap(async (req, res) => {
  const businessName = asString(req.body.businessName);
  if (!businessName) return res.status(400).json({ error: 'businessName is required.' });
  res.status(201).json(await createBuyer(req.params.id, {
    businessName,
    contactName: asString(req.body.contactName),
    email: asString(req.body.email),
    phone: asString(req.body.phone),
    website: asString(req.body.website),
    location: asString(req.body.location),
    industry: asString(req.body.industry),
    buyerScore: asNumber(req.body.buyerScore) ?? 0,
    status: asString(req.body.status),
    notes: asString(req.body.notes),
    leadId: asString(req.body.leadId),
  }, req.userId!));
}));

router.patch('/:id/buyers/:buyerId', wrap(async (req, res) => {
  res.json(await updateBuyer(req.params.buyerId, {
    businessName: asString(req.body.businessName) || undefined,
    contactName: asString(req.body.contactName) || undefined,
    email: asString(req.body.email) || undefined,
    phone: asString(req.body.phone) || undefined,
    website: asString(req.body.website) || undefined,
    location: asString(req.body.location) || undefined,
    industry: asString(req.body.industry) || undefined,
    buyerScore: asNumber(req.body.buyerScore) ?? undefined,
    status: asString(req.body.status) || undefined,
    notes: asString(req.body.notes) || undefined,
  }, req.userId!));
}));

router.delete('/:id/buyers/:buyerId', wrap(async (req, res) => {
  res.json(await deleteBuyer(req.params.buyerId, req.userId!));
}));

router.post('/:id/offers', wrap(async (req, res) => {
  const amount = asNumber(req.body.amount);
  if (!amount) return res.status(400).json({ error: 'amount is required.' });
  res.status(201).json(await recordOffer(req.params.id, {
    amount,
    currency: asString(req.body.currency) || undefined,
    direction: asString(req.body.direction) || undefined,
    status: asString(req.body.status) || undefined,
    buyerId: asString(req.body.buyerId),
    notes: asString(req.body.notes),
    receivedAt: asString(req.body.receivedAt) || undefined,
  }, req.userId!));
}));

router.patch('/:id/offers/:offerId', wrap(async (req, res) => {
  res.json(await updateOffer(req.params.offerId, {
    amount: asNumber(req.body.amount) ?? undefined,
    currency: asString(req.body.currency) || undefined,
    direction: asString(req.body.direction) || undefined,
    status: asString(req.body.status) || undefined,
    buyerId: asString(req.body.buyerId) || undefined,
    notes: asString(req.body.notes) || undefined,
  }, req.userId!));
}));

router.delete('/:id/offers/:offerId', wrap(async (req, res) => {
  res.json(await deleteOffer(req.params.offerId, req.userId!));
}));

router.get('/:id/buyer-discovery', wrap(async (req, res) => {
  res.json(await buyerDiscoveryParams(req.params.id, req.userId!));
}));

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Domains API] Error:', err);
  res.status(500).json({ error: (err as any)?.message || 'Domain request failed.' });
});

export default router;

function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function nonEmpty(value: unknown): string | undefined {
  const s = asString(value);
  return s.length > 0 ? s : undefined;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v ?? '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/[,\n]+/).map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

// Accept three shapes from the UI: an array of strings (TXT paste, one per line),
// an array of DomainInput objects (CSV/Excel parsed client-side), or a single
// `text` field with newline-separated names.
function parseImportRows(body: any): Array<string | { name: string; [key: string]: unknown }> {
  if (Array.isArray(body?.rows)) return body.rows;
  if (Array.isArray(body?.domains)) return body.domains;
  if (typeof body?.text === 'string') {
    return body.text.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean);
  }
  return [];
}
