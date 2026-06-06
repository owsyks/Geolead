import * as dotenv from 'dotenv';
dotenv.config();

import http from 'node:http';
import express from 'express';
import cors from 'cors';
import prisma from './config/db.js';
import * as xlsx from 'xlsx';
import { resumePendingSearchTasks, startSearchTaskProcessing } from './services/taskProcessor.js';
import { isPlaceholderEmail, normalizeEmail, normalizePhoneList } from './services/contactUtils.js';
import outboundRouter from './routes/outbound.js';
import emailRouter from './routes/email.js';
import domainsRouter from './routes/domains.js';
import settingsRouter from './routes/settings.js';
import inboxRouter from './routes/inbox.js';
import authRouter from './routes/auth.js';
import watchlistRouter from './routes/watchlist.js';
import { requireAuth } from './middleware/auth.js';
import { seedAdminAndClaim } from './services/auth.js';
import { startInboxSyncWorker } from './services/inboxSync.js';
import { attachOutboundWebSocket } from './services/outboundRealtime.js';
import { ensureOutboundSeedData, startOutboundScheduler } from './services/outboundPlatform.js';
import { startWatchlistScheduler } from './services/watchlistService.js';

const app = express();
const PORT = process.env.PORT || 5000;
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

// Bucket cleanup — expired entries piled up forever before
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of requestBuckets) {
    if (b.resetAt <= now) requestBuckets.delete(k);
  }
}, 10 * 60 * 1000).unref();

app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
}));
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/outbound', outboundRouter);
app.use('/api/email', emailRouter);
app.use('/api/domains', domainsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/inbox', inboxRouter);
app.use('/api/watchlist', watchlistRouter);

function rateLimit(key: string, limit: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const clientKey = `${key}:${getClientId(req)}`;
    const now = Date.now();
    const bucket = requestBuckets.get(clientKey);

    if (!bucket || bucket.resetAt <= now) {
      requestBuckets.set(clientKey, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= limit) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Rate limit exceeded.' });
    }

    bucket.count += 1;
    return next();
  };
}

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

/**
 * POST /api/search
 * Initiates a lead search task.
 */
app.post('/api/search', requireAuth, rateLimit('search', 10, 10 * 60 * 1000), async (req, res) => {
  const { keyword, domainIdea, country, cityState, searchDepth } = req.body;

  if (!keyword || !domainIdea) {
    return res.status(400).json({ error: 'Keyword and domainIdea are required fields.' });
  }

  try {
    const requestedDepth = searchDepth ? parseInt(searchDepth as string, 10) : 10;
    const depth = Math.min(Math.max(Number.isNaN(requestedDepth) ? 10 : requestedDepth, 1), 200);

    // Create database entry for the task, owned by the requesting user.
    const task = await prisma.searchTask.create({
      data: {
        userId: req.userId!,
        keyword,
        domainIdea,
        country: country || null,
        cityState: cityState || null,
        searchDepth: depth,
        status: 'PENDING',
        progress: 0,
      },
    });

    // Process in the API process. This keeps local dev usable even when Redis/BullMQ is unavailable.
    startSearchTaskProcessing(task.id);

    console.log(`[Server] Created SearchTask ${task.id} and started background processing.`);
    return res.status(201).json(task);
  } catch (error: any) {
    console.error('[Server] Search creation error:', error);
    return res.status(500).json({ error: 'Failed to start lead generation task.' });
  }
});

/**
 * GET /api/tasks/:id
 * Fetches status and progress of an active task.
 */
app.get('/api/tasks/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const task = await prisma.searchTask.findFirst({
      where: { id, userId: req.userId! },
      include: {
        leads: {
          orderBy: { domainMatchScore: 'desc' },
          include: {
            emails: {
              where: { status: { in: ['VALID', 'RISKY'] } },
              orderBy: { confidenceScore: 'desc' },
            },
          },
        },
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Search task not found.' });
    }

    return res.json(sanitizeTask(task));
  } catch (error) {
    console.error('[Server] Get task error:', error);
    return res.status(500).json({ error: 'Failed to retrieve task.' });
  }
});

/**
 * PATCH /api/tasks/:id/status
 * Pause, stop, or resume a search task.
 */
app.patch('/api/tasks/:id/status', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['PAUSED', 'CANCELLED', 'PENDING'].includes(status)) {
    return res.status(400).json({ error: 'Status must be PAUSED, CANCELLED, or PENDING.' });
  }

  try {
    const task = await prisma.searchTask.findFirst({
      where: { id, userId: req.userId! },
    });
    if (!task) return res.status(404).json({ error: 'Search task not found.' });

    // Resume from PAUSED → back to PENDING
    if (status === 'PENDING') {
      if (task.status !== 'PAUSED') {
        return res.status(400).json({ error: 'Only PAUSED tasks can be resumed.' });
      }
      const updated = await prisma.searchTask.update({
        where: { id },
        data: { status: 'PENDING' },
      });
      startSearchTaskProcessing(id);
      console.log(`[Server] SearchTask ${id} resumed by user ${req.userId}`);
      return res.json(updated);
    }

    // Pause or cancel
    if (!['PENDING', 'PROCESSING'].includes(task.status)) {
      return res.status(400).json({ error: `Cannot ${status} a ${task.status} task.` });
    }

    const updated = await prisma.searchTask.update({
      where: { id },
      data: { status, progress: status === 'CANCELLED' ? 100 : task.progress },
    });
    console.log(`[Server] SearchTask ${id} ${status} by user ${req.userId}`);
    res.json(updated);
  } catch (error) {
    console.error('[Server] Update task status error:', error);
    return res.status(500).json({ error: 'Failed to update task status.' });
  }
});

/**
 * GET /api/history
 * Fetches previous searches history.
 */
app.get('/api/history', requireAuth, rateLimit('history', 30, 10 * 60 * 1000), async (req, res) => {
  try {
    const tasks = await prisma.searchTask.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return res.json(tasks);
  } catch (error) {
    console.error('[Server] Fetch history error:', error);
    return res.status(500).json({ error: 'Failed to fetch search history.' });
  }
});

/**
 * GET /api/leads
 * Get leads with advanced filters, search queries, sorting, and pagination.
 */
app.get('/api/leads', requireAuth, rateLimit('leads', 120, 10 * 60 * 1000), async (req, res) => {
  const {
    taskId,
    search,
    minScore,
    hasEmails,
    domain,
    role,
    minBuyerIntent,
    minPriority,
    minDecisionMaker,
    sortField = 'priorityScore',
    sortOrder = 'desc',
    page = '1',
    limit = '10',
  } = req.query;

  try {
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    // Build Prisma query filters — always scoped to the requesting user.
    const whereClause: any = { ownerId: req.userId! };

    if (taskId) {
      whereClause.taskId = taskId as string;
    }

    if (domain) {
      const raw = (domain as string).trim();
      const sld = raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('.')[0];
      whereClause.task = {
        is: {
          OR: [
            { domainIdea: { contains: raw, mode: 'insensitive' } },
            ...(sld && sld !== raw ? [{ domainIdea: { contains: sld, mode: 'insensitive' } }] : []),
          ],
        },
      };
    }

    if (search) {
      whereClause.OR = [
        { businessName: { contains: search as string, mode: 'insensitive' } },
        { location: { contains: search as string, mode: 'insensitive' } },
        { category: { contains: search as string, mode: 'insensitive' } },
        { website: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (minScore) {
      whereClause.domainMatchScore = { gte: parseInt(minScore as string, 10) };
    }

    if (hasEmails === 'true') {
      whereClause.emails = { some: { status: { in: ['VALID', 'RISKY'] } } };
    }

    if (req.query.notContacted === 'true') {
      whereClause.lastContactedAt = null;
    }

    // Decision maker role filter
    if (role) {
      const roleStr = (role as string).toLowerCase();
      if (roleStr === 'ceo') {
        whereClause.decisionMakerRole = { in: ['CEO', 'Founder', 'Owner', 'President', 'Co-Founder'] };
      } else if (roleStr === 'founder') {
        whereClause.decisionMakerRole = { in: ['Founder', 'Co-Founder'] };
      } else if (roleStr === 'director') {
        whereClause.decisionMakerRole = { in: ['CMO', 'Marketing Director', 'Head of Sales', 'Managing Director', 'Director'] };
      } else if (roleStr === 'manager') {
        whereClause.decisionMakerRole = { not: null };
      }
    }

    if (minBuyerIntent) {
      whereClause.buyerIntentScore = { gte: parseInt(minBuyerIntent as string, 10) };
    }

    if (minPriority) {
      whereClause.priorityScore = { gte: parseInt(minPriority as string, 10) };
    }

    if (minDecisionMaker) {
      whereClause.decisionMakerScore = { gte: parseInt(minDecisionMaker as string, 10) };
    }

    // Validate sortField to prevent injection
    const allowedSortFields = [
      'domainMatchScore', 'priorityScore', 'buyerIntentScore',
      'domainUpgradeScore', 'businessQualityScore', 'decisionMakerScore',
      'businessName', 'location', 'createdAt',
    ];
    const safeSortField = allowedSortFields.includes(sortField as string) ? sortField as string : 'priorityScore';

    // Get matching leads
    const [leads, totalCount] = await prisma.$transaction([
      prisma.lead.findMany({
        where: whereClause,
        include: {
          emails: {
            where: { status: { in: ['VALID', 'RISKY'] } },
            orderBy: { confidenceScore: 'desc' },
          },
        },
        orderBy: {
          [safeSortField]: sortOrder as 'asc' | 'desc',
        },
        skip: offset,
        take: limitNum,
      }),
      prisma.lead.count({ where: whereClause }),
    ]);

    const sanitizedLeads = sanitizeLeads(leads);

    return res.json({
      leads: sanitizedLeads,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error) {
    console.error('[Server] Fetch leads error:', error);
    return res.status(500).json({ error: 'Failed to retrieve leads.' });
  }
});

/**
 * PATCH /api/leads/bulk
 * Bulk update leads: change pipeline stage, add tags, mark contacted.
 */
app.patch('/api/leads/bulk', requireAuth, async (req, res) => {
  const { leadIds, pipelineStage, addTags, markContacted } = req.body;
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'leadIds array is required' });
  }

  try {
    const data: Record<string, any> = {};
    if (pipelineStage) data.pipelineStage = pipelineStage;
    if (addTags && Array.isArray(addTags)) {
      // Prisma doesn't support push for arrays in updateMany
      const leads = await prisma.lead.findMany({
        where: { id: { in: leadIds }, ownerId: req.userId! },
        select: { id: true, tags: true },
      });
      for (const lead of leads) {
        const merged = Array.from(new Set([...(lead.tags || []), ...addTags]));
        await prisma.lead.update({ where: { id: lead.id }, data: { tags: merged } });
      }
    }
    if (markContacted) {
      data.lastContactedAt = new Date();
      data.leadStatus = 'Contacted';
      if (!data.pipelineStage) data.pipelineStage = 'Contacted';
    }
    if (Object.keys(data).length > 0) {
      await prisma.lead.updateMany({ where: { id: { in: leadIds }, ownerId: req.userId! }, data });
    }
    res.json({ updated: leadIds.length });
  } catch (error) {
    console.error('[Server] Bulk lead update error:', error);
    return res.status(500).json({ error: 'Failed to update leads.' });
  }
});

/**
 * GET /api/leads/emails
 * Returns every non-invalid email address for a task (no pagination).
 * Used by the frontend verify-all flow so it doesn't miss pages.
 */
app.get('/api/leads/emails', requireAuth, async (req, res) => {
  const { taskId } = req.query;
  try {
    const where: any = { lead: { ownerId: req.userId! }, status: { in: ['VALID', 'RISKY'] } };
    if (taskId) where.lead = { ...where.lead, taskId: taskId as string };
    const rows = await prisma.leadEmail.findMany({
      where,
      select: { email: true },
    });
    return res.json({ emails: rows.map(r => r.email) });
  } catch (err: any) {
    console.error('[Server] leads/emails error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/leads/:id/notes
 * Adds CRM-style notes/comments to a lead.
 */
app.post('/api/leads/:id/notes', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  try {
    const owned = await prisma.lead.findFirst({ where: { id, ownerId: req.userId! }, select: { id: true } });
    if (!owned) return res.status(404).json({ error: 'Lead not found.' });
    const updatedLead = await prisma.lead.update({
      where: { id },
      data: { notes },
    });
    return res.json(updatedLead);
  } catch (error) {
    console.error('[Server] Update notes error:', error);
    return res.status(500).json({ error: 'Failed to save lead notes.' });
  }
});

/**
 * GET /api/export
 * Exports leads to CSV, Excel, or JSON based on filters.
 */
app.get('/api/export', requireAuth, rateLimit('export', 20, 10 * 60 * 1000), async (req, res) => {
  const { taskId, format = 'csv', emailsOnly = 'false', includeRisky = 'true' } = req.query;

  try {
    const whereClause: any = { ownerId: req.userId! };
    if (taskId) {
      whereClause.taskId = taskId as string;
    }

    const emailStatusFilter = includeRisky === 'true' ? ['VALID', 'RISKY'] : ['VALID'];

    const leads = await prisma.lead.findMany({
      where: {
        ...whereClause,
        OR: [
          { emails: { some: { status: { in: emailStatusFilter } } } },
          { phoneNumbers: { isEmpty: false } },
        ],
      },
      include: {
        emails: {
          where: { status: { in: emailStatusFilter } },
          orderBy: { confidenceScore: 'desc' },
        },
      },
      orderBy: { domainMatchScore: 'desc' },
    });

    const sanitizedLeads = sanitizeLeads(leads).filter((lead) => lead.emails.length > 0 || lead.phoneNumbers.length > 0);

    // Flatten lead schema for spreadsheet rows
    const exportData = emailsOnly === 'true'
      ? sanitizedLeads.flatMap(lead =>
          lead.emails.map(e => ({
            'Business Name': lead.businessName,
            'Email': e.email,
            'Status': e.status,
            'Website': lead.website || '',
            'Phone': lead.phoneNumbers[0] || '',
            'Location': lead.location || ''
          }))
        )
      : sanitizedLeads.map(lead => {
          const validEmails = lead.emails.map(e => e.email);
          const allEmails = validEmails.join(', ');
          const primaryEmail = validEmails[0] || '';
          return {
            'Business Name': lead.businessName,
            'Website': lead.website || '',
            'Primary Email': primaryEmail,
            'Validated Emails': allEmails,
            'Phone Numbers': lead.phoneNumbers.join(', '),
            'Location': lead.location || '',
            'Google Maps URL': lead.googleMapsLink || '',
            'Category': lead.category || '',
            'Rating': lead.rating || '',
            'Reviews Count': lead.reviewsCount || 0,
            'Company Size': lead.companySize || 'Unknown',
            'Domain Relevance Score': lead.domainMatchScore,
            'Relevance Explanation': lead.scoreExplanation || '',
            'CRM Notes': lead.notes || '',
            'Discovered On': lead.createdAt.toISOString()
          };
        });

    if (exportData.length === 0) {
      return res.status(400).json({ error: 'No data to export. Try adjusting filters.' });
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="geolead_export.json"');
      return res.send(JSON.stringify(exportData, null, 2));
    }

    if (format === 'xlsx') {
      const worksheet = xlsx.utils.json_to_sheet(exportData);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'GeoLeads');
      
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="geolead_export.xlsx"');
      return res.send(buffer);
    }

    // Default: CSV
    const headers = Object.keys(exportData[0] || {});
    if (headers.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="geolead_export.csv"');
      return res.send('');
    }

    const csvRows = [
      headers.join(','), // Header row
      ...exportData.map(row => 
        headers.map(fieldName => {
          const val = (row as any)[fieldName];
          // Escape quotes and wrap in quotes to prevent column splitting
          const escaped = ('' + val).replace(/"/g, '""');
          return `"${escaped}"`;
        }).join(',')
      )
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="geolead_export.csv"');
    return res.send(csvRows.join('\n'));
  } catch (error) {
    console.error('[Server] Export error:', error);
    return res.status(500).json({ error: 'Failed to generate export file.' });
  }
});

const server = http.createServer(app);
attachOutboundWebSocket(server);

// Bind to all interfaces (0.0.0.0) so platform routers (Heroku, Docker, etc.)
// can reach the dyno. A localhost-only bind makes the app unreachable in prod.
server.listen(Number(PORT), process.env.HOST || '0.0.0.0', async () => {
  console.log(`[Server] GeoLead AI Backend API listening on port ${PORT}`);
  startOutboundScheduler();
  startInboxSyncWorker();
  startWatchlistScheduler();
  // Defer heavy startup tasks so the server is ready to accept requests first
  setTimeout(() => {
    void seedAdminAndClaim();
    void cleanupStoredContacts();
    void resumePendingSearchTasks();
    void ensureOutboundSeedData();
  }, 3000);
});

function sanitizeTask<T extends { leads?: any[]; validEmails?: number }>(task: T): T {
  const sanitizedLeads = sanitizeLeads(task.leads || []);
  return {
    ...task,
    leads: sanitizedLeads,
    validEmails: sanitizedLeads.reduce((sum, lead) => sum + lead.emails.length, 0),
  };
}

function getClientId(req: express.Request) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  return req.ip || req.socket.remoteAddress || 'unknown';
}

function sanitizeLeads<T extends { emails?: any[]; phoneNumbers?: string[] }>(leads: T[]): T[] {
  return leads.map((lead) => {
    const validEmails = (lead.emails || [])
      .map((email) => ({ ...email, email: normalizeEmail(email.email) }))
      .filter((email) => email.status !== 'INVALID' && !isPlaceholderEmail(email.email));

    const phoneNumbers = normalizePhoneList(lead.phoneNumbers || [], 2);

    return {
      ...lead,
      emails: validEmails,
      phoneNumbers,
    };
  });
}

async function cleanupStoredContacts() {
  try {
    const [invalidEmails, leads] = await Promise.all([
      prisma.leadEmail.findMany({
        where: { status: { in: ['VALID', 'RISKY'] } },
        select: { id: true, email: true },
      }),
      prisma.lead.findMany({
        select: { id: true, phoneNumbers: true },
      }),
    ]);

    const invalidEmailIds = invalidEmails
      .filter((item) => isPlaceholderEmail(item.email))
      .map((item) => item.id);

    if (invalidEmailIds.length > 0) {
      await prisma.leadEmail.deleteMany({
        where: { id: { in: invalidEmailIds } },
      });
      console.log(`[Server] Removed ${invalidEmailIds.length} placeholder email(s) from stored leads.`);
    }

    let updatedPhones = 0;
    for (const lead of leads) {
      const phoneNumbers = normalizePhoneList(lead.phoneNumbers, 2);

      if (phoneNumbers.join('|') !== lead.phoneNumbers.join('|')) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { phoneNumbers },
        });
        updatedPhones++;
      }
    }

    if (updatedPhones > 0) {
      console.log(`[Server] Cleaned phone numbers for ${updatedPhones} stored lead(s).`);
    }

    const tasks = await prisma.searchTask.findMany({ select: { id: true, validEmails: true } });
    let updatedTaskCounts = 0;
    for (const task of tasks) {
      const validEmails = await prisma.leadEmail.count({
        where: {
          status: { in: ['VALID', 'RISKY'] },
          lead: { taskId: task.id },
        },
      });

      if (validEmails !== task.validEmails) {
        await prisma.searchTask.update({
          where: { id: task.id },
          data: { validEmails },
        });
        updatedTaskCounts++;
      }
    }

    if (updatedTaskCounts > 0) {
      console.log(`[Server] Recalculated validated email counts for ${updatedTaskCounts} task(s).`);
    }
  } catch (error) {
    console.error('[Server] Stored contact cleanup failed:', error);
  }
}
