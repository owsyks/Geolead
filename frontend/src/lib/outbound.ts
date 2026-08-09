export const OUTBOUND_API_BASE =
  process.env.NEXT_PUBLIC_OUTBOUND_API_BASE
    ? process.env.NEXT_PUBLIC_OUTBOUND_API_BASE.trim().replace(/\/+$/, "")
    : typeof window !== "undefined"
    ? (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? "http://localhost:5000" : "")
    : (process.env.BACKEND_SERVER_URL || "http://localhost:5000").trim().replace(/\/+$/, "");

// ---- Auth token management ---------------------------------------------
// The short-lived access token is held only in memory. The rotating refresh
// token is an HttpOnly cookie and is therefore unavailable to injected script.
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}
export function setTokens(token: string) {
  accessToken = token || null;
}
export function clearTokens() {
  accessToken = null;
}

// Exchange the refresh token for a fresh access token. Returns true on success.
let refreshInFlight: Promise<boolean> | null = null;
export function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${OUTBOUND_API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-GeoLead-Client": "web" },
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string };
      setTokens(data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

// Called when auth is irrecoverable (refresh failed). The AuthProvider registers
// a handler that clears state and routes to /login.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

// Thin wrapper around fetch that injects the Bearer token and returns the raw
// Response — for call sites that need custom handling (blobs, status checks).
// On 401 it transparently refreshes the access token once and replays, so an
// expired session doesn't hard-fail the dashboard (search/history/leads/tasks).
export async function authFetch(input: string, init?: RequestInit, _retried = false): Promise<Response> {
  const token = getAccessToken();
  const res = await fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401 && !_retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return authFetch(input, init, true);
    clearTokens();
    onUnauthorized?.();
  }
  return res;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;
  constructor(status: number, message: string, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Global handler fired when the API returns 402 (plan required / quota exceeded).
// The AuthProvider registers one to pop an upgrade modal, mirroring onUnauthorized.
export interface UpgradeSignal {
  message: string;
  code?: string;
  metric?: string;
  limit?: number;
  used?: number;
  tier?: string;
}
let onUpgradeRequired: ((signal: UpgradeSignal) => void) | null = null;
export function setUpgradeHandler(fn: ((signal: UpgradeSignal) => void) | null) {
  onUpgradeRequired = fn;
}

// Coalesce identical in-flight GETs so multiple components mounting / polling the
// same endpoint at once share ONE network request. No TTL caching — responses stay
// fresh (we keep `no-store`); we only de-duplicate requests that overlap in time.
const inFlightGets = new Map<string, Promise<unknown>>();

export function fetchOutbound<T>(path: string, init?: RequestInit, _retried = false): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" || _retried) {
    return doFetchOutbound<T>(path, init, _retried);
  }
  const existing = inFlightGets.get(path) as Promise<T> | undefined;
  if (existing) return existing;
  const pending = doFetchOutbound<T>(path, init, _retried).finally(() => {
    inFlightGets.delete(path);
  });
  inFlightGets.set(path, pending);
  return pending;
}

async function doFetchOutbound<T>(path: string, init?: RequestInit, _retried = false): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${OUTBOUND_API_BASE}${path}`, {
    cache: "no-store",
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });

  if (response.status === 401 && !_retried) {
    // Try a single silent refresh, then replay the request.
    const refreshed = await refreshAccessToken();
    if (refreshed) return fetchOutbound<T>(path, init, true);
    clearTokens();
    onUnauthorized?.();
    throw new ApiError(401, "Session expired. Please log in again.");
  }

  if (!response.ok) {
    let message = `Outbound API request failed: ${response.status}`;
    let body: {
      error?: string;
      code?: string;
      metric?: string;
      limit?: number;
      used?: number;
      tier?: string;
    } | null = null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        body = await response.json();
        if (body?.error) message = body.error;
      } catch {
        /* non-JSON error body */
      }
    } else {
      const text = await response.text();
      if (response.status === 429) {
        message = "Server rate limited request. Please wait a moment.";
      } else if (text.includes("Security Checkpoint")) {
        message = "Security checkpoint active. Please refresh page.";
      }
    }
    // 402 ⇒ plan/quota gate. Notify the global upgrade handler so the UI can
    // prompt an upgrade instead of surfacing a raw error at the call site.
    if (response.status === 402) {
      onUpgradeRequired?.({
        message,
        code: body?.code,
        metric: body?.metric,
        limit: body?.limit,
        used: body?.used,
        tier: body?.tier,
      });
    }
    throw new ApiError(response.status, message, body?.code, body || undefined);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    await response.text();
    throw new ApiError(response.status, "Server returned a non-JSON response.");
  }

  return response.json() as Promise<T>;
}

export type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED";

export interface OutboundMetrics {
  campaigns: number;
  activeCampaigns: number;
  queued: number;
  sent: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  unsubscribeRate: number;
}

export interface OutboundCampaignSummary {
  id: string;
  name: string;
  objective: string;
  geoDomain: string;
  niche: string;
  cityState?: string | null;
  tone: string;
  language: string;
  status: CampaignStatus | string;
  dailyLimit: number;
  createdAt: string;
  updatedAt: string;
  recipients: number;
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  replies: number;
  positiveReplies: number;
  negativeReplies: number;
  bounces: number;
  unsubscribes: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  engagementScore: number;
  nextFollowUpAt?: string | null;
}

export interface OutboundSenderSummary {
  id: string;
  label: string;
  provider: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  status: string;
  dailyLimit: number;
  hourlyLimit: number;
  warmupEnabled: boolean;
  warmupTarget: number;
  dkimStatus: string;
  spfStatus: string;
  dmarcStatus: string;
  deliverabilityScore: number;
  bounceRate: number;
  spamComplaintRate: number;
  hasEncryptedConfig: boolean;
  lastVerifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SenderVerificationResult {
  sender: OutboundSenderSummary;
  verification: {
    domain: string;
    spfStatus: string;
    dkimStatus: string;
    dmarcStatus: string;
    deliverabilityScore: number;
    records: {
      spf: string[];
      dkim: string[];
      dmarc: string[];
    };
  };
}

export interface OutboundReplySummary {
  id: string;
  campaignId: string;
  campaignName?: string;
  leadId: string;
  businessName?: string;
  fromEmail: string;
  subject: string;
  body: string;
  sentiment: string;
  intentScore: number;
  buyingIntent: boolean;
  status: string;
  suggestedResponse?: string | null;
  receivedAt: string;
}

export interface OutboundReplyThread {
  reply: OutboundReplySummary;
  campaign: {
    id: string;
    name: string;
    geoDomain: string;
    niche: string;
    status: string;
  };
  lead: {
    id: string;
    businessName: string;
    website?: string | null;
    leadStatus: string;
    pipelineStage: string;
    engagementScore: number;
    reminderAt?: string | null;
    nextFollowUpAt?: string | null;
    tags: string[];
    doNotContact: boolean;
  };
  messages: Array<{
    id: string;
    kind: string;
    subject: string;
    body: string;
    status: string;
    occurredAt: string;
    fromEmail: string;
    toEmail?: string | null;
    provider?: string | null;
    sequenceStepId?: string | null;
    sentiment?: string;
    intentScore?: number;
    buyingIntent?: boolean;
    events: OutboundEventSummary[];
  }>;
  events: OutboundEventSummary[];
}

export interface OutboundEventSummary {
  id: string;
  type: string;
  campaignName?: string;
  occurredAt: string;
  payload?: Record<string, unknown>;
  toEmail?: string | null;
  subject?: string | null;
  variant?: string | null;
  businessName?: string | null;
}

export interface OutboundLeadSummary {
  id: string;
  businessName: string;
  website?: string | null;
  pipelineStage: string;
  engagementScore: number;
  emails: Array<{ email: string; status: string }>;
  tags: string[];
}

export interface OutboundOverview {
  metrics: OutboundMetrics;
  campaigns: OutboundCampaignSummary[];
  senders: OutboundSenderSummary[];
  replies: OutboundReplySummary[];
  activity: OutboundEventSummary[];
  topLeads: OutboundLeadSummary[];
  deliverabilityAlerts: string[];
}

export interface GeneratedOutboundEmail {
  subjectLine: string;
  previewText: string;
  body: string;
  followUps: string[];
  variables: string[];
  spamScore: number;
  deliverabilityScore: number;
  abSubjects: string[];
  websiteIntel: {
    sourceStatus: string;
    summary: string;
    detectedNiche: string;
    services: string[];
    slogans: string[];
    painPointSignals: string[];
  };
  complianceNotes: string[];
  generationSource: "AI" | "SAFE_FALLBACK";
  degradedReason?: "NO_PROVIDER_CONFIGURED" | "PROVIDER_UNAVAILABLE";
  variants: Array<{
    key: "A" | "B" | "C";
    label: string;
    subjectLine: string;
    previewText: string;
    body: string;
    followUps: Array<{ step: number; subjectLine: string; body: string; spamScore: number; approved: boolean }>;
    spamScore: number;
    deliverabilityScore: number;
    approved: boolean;
  }>;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export interface OutboundTemplate {
  id: string;
  name: string;
  type: string;
  purpose: string;
  language: string;
  tone: string;
  subject: string;
  previewText?: string | null;
  body: string;
  followUpBody?: string | null;
  variables?: Record<string, unknown> | null;
  spamScore: number;
  deliverabilityScore: number;
  tags: string[];
  updatedAt: string;
}

export interface MailboxConfig {
  id: string;
  label: string;
  email: string;
  imapHost: string;
  imapPort: number;
  useSsl: boolean;
  username: string;
  enabled: boolean;
  syncIntervalSec: number;
  hasPassword: boolean;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  totalImported: number;
}

export interface InboxReply {
  id: string;
  fromEmail: string;
  subject: string;
  body: string;
  receivedAt: string;
  isRead: boolean;
  status: string;
  direction: string;
  source: string;
  aiCategory?: string | null;
  aiSummary?: string | null;
  sentiment: string;
  intentScore: number;
  buyingIntent: boolean;
  matchConfidence: number;
  matchMethod?: string | null;
  suggestedResponse?: string | null;
  tags: string[];
  lead?: { id: string; businessName: string; website?: string | null; pipelineStage: string } | null;
  campaign?: { id: string; name: string; geoDomain: string; niche: string; domainId?: string | null } | null;
}

export interface InboxResponse {
  replies: InboxReply[];
  unreadCount: number;
  categoryCounts: Record<string, number>;
}

export interface SyncResult {
  ok: boolean;
  imported: number;
  scanned: number;
  matched: number;
  skipped: number;
  error?: string;
}

export const REPLY_CATEGORIES = [
  "Interested",
  "Maybe Interested",
  "Negotiating",
  "Not Interested",
  "Unsubscribe",
  "Out Of Office",
  "Spam",
] as const;

export interface SettingItem {
  key: string;
  label: string;
  category: "ai" | "email" | "inbound" | "smtp" | "branding";
  secret: boolean;
  placeholder: string;
  hint: string;
  value: string;
  masked: string;
  hasValue: boolean;
  source: "database" | "env" | "unset";
}

export interface SettingsTestResult {
  ok: boolean;
  message: string;
}

export interface PortfolioDomain {
  id: string;
  userId?: string | null;
  name: string;
  status: string;
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  registrar?: string | null;
  expirationDate?: string | null;
  category?: string | null;
  niche?: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  tags: string[];
  targetIndustries: string[];
  targetLocations: string[];
  notes?: string | null;
  brandingScore: number;
  estimatedValue?: number | null;
  askingPrice?: number | null;
  buyerDemandScore: number;
  leadOpportunityScore: number;
  saleProbability: number;
  recommendedPrice?: number | null;
  bestIndustries: string[];
  bestCities: string[];
  outreachStrategy?: string | null;
  aiSummary?: string | null;
  archivedAt?: string | null;
  soldAt?: string | null;
  intelligenceUpdatedAt?: string | null;
  metadata?: DomainAnalysis | null;
  createdAt: string;
  updatedAt: string;
  _count?: { campaigns: number; buyers: number; offers: number };
  sale?: DomainSale | null;
}

// Rich intelligence analysis stored in domain.metadata after running /analyze
export interface DomainAnalysis {
  parsed: {
    sld: string; tld: string; tokens: string[];
    geo: string; city: string; state: string;
    industry: string; niche: string; keywords: string[];
  };
  buyerPool: { total: number; high: number; medium: number; low: number };
  tldMatrix: Array<{ tld: string; domain: string; status: 'registered' | 'available' }>;
  similarDomains: Array<{ domain: string; status: 'registered' | 'available'; similarity: number; reason: string }>;
  businesses: Array<{ name: string; website?: string; address?: string; rating?: number; type?: string; buyerScore: number; priority: 'high' | 'medium' | 'low' }>;
  brandBreakdown: { overall: number; memorability: number; keywordRelevance: number; commercialIntent: number; geoRelevance: number };
  geoScore: number;
  competitionScore: number;
  domainValue: { conservative: number; expected: number; premium: number };
  aiReport: {
    executiveSummary: string;
    recommendation: string;
    recommendationLabel: string;
    keyInsights: string[];
    outreachPriority: 'high' | 'medium' | 'low';
  };
  analyzedAt: string;
}

// Chat message type shared across investor chat features
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Acquisition advisor types
export type AcquisitionTier = 'STRONG_BUY' | 'BUY' | 'WATCHLIST' | 'SPECULATIVE' | 'AVOID';

export interface AcquisitionRecommendation {
  tier: AcquisitionTier;
  confidence: number;
  reasoning: string;
  attractors: string[];
  risks: string[];
  targetBuyers: string[];
  suggestedBuyMax: number;
  targetSalePrice: number;
  estimatedHold: string;
  roiPotential: string;
}

export interface AcquisitionResult {
  domain: string;
  analysis: DomainAnalysis;
  recommendation: AcquisitionRecommendation;
  rank: number;
}

// ─── Watchlist types ──────────────────────────────────────────────────────────
export type WatchPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type WatchStatus = 'WATCHING' | 'INTERESTED' | 'HIGH_PRIORITY' | 'AVAILABLE' | 'PURCHASED' | 'IN_PORTFOLIO';
export type DnsStatus = 'dns_registered' | 'dns_available' | 'dns_unknown' | 'dns_dropping';
export type AiReco = 'BUY_NOW' | 'WAIT' | 'MONITOR' | 'AVOID';

export interface WatchlistReminder {
  id: string;
  type: 'DAYS' | 'STATUS_CHANGE' | 'AVAILABLE';
  label?: string | null;
  triggerAt?: string | null;
  triggered: boolean;
  notifyVia: string;
  createdAt: string;
}

export interface WatchedDomainEvent {
  id: string;
  type: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
}

export interface WatchedDomain {
  id: string;
  userId: string;
  domainName: string;
  priority: WatchPriority;
  status: WatchStatus;
  notes?: string | null;
  brandScore: number;
  marketScore: number;
  acquisitionScore: number;
  estimatedValue?: number | null;
  aiRecommendation?: AiReco | null;
  aiReasoning?: string | null;
  registrationStatus?: DnsStatus | null;
  registrar?: string | null;
  expirationDate?: string | null;
  lastCheckedAt?: string | null;
  metadata?: { eppStatuses?: string[]; statusCheckedAt?: string } | null;
  addedFrom?: string | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  reminders: WatchlistReminder[];
  events: WatchedDomainEvent[];
}

export interface WatchlistNotification {
  id: string;
  userId: string;
  watchedDomainId?: string | null;
  domainName: string;
  type: 'AVAILABLE' | 'STATUS_CHANGE' | 'REMINDER' | 'EXPIRING';
  title: string;
  body: string;
  priority: 'URGENT' | 'HIGH' | 'NORMAL';
  read: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface BulkScanResult {
  results: AcquisitionResult[];
  summary: {
    total: number;
    strongBuy: number;
    buy: number;
    watchlist: number;
    speculative: number;
    avoid: number;
    topOpportunities: AcquisitionResult[];
  };
  scannedAt: string;
}

export interface DomainBuyer {
  id: string;
  domainId: string;
  leadId?: string | null;
  businessName: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  location?: string | null;
  industry?: string | null;
  buyerScore: number;
  status: string;
  notes?: string | null;
  lastContactedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  offers?: DomainOffer[];
}

export interface DomainOffer {
  id: string;
  domainId: string;
  buyerId?: string | null;
  buyer?: DomainBuyer | null;
  direction: string;
  amount: number;
  currency: string;
  status: string;
  notes?: string | null;
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DomainSale {
  id: string;
  domainId: string;
  buyerName: string;
  buyerEmail?: string | null;
  salePrice: number;
  currency: string;
  saleDate: string;
  marketplace?: string | null;
  fees: number;
  notes?: string | null;
}

export interface PortfolioDashboard {
  totals: {
    domains: number;
    portfolioValue: number;
    investment: number;
    revenue: number;
    profit: number;
    roi: number;
    expiringSoon: number;
    activeCampaigns: number;
    leadsGenerated: number;
    replies: number;
    domainsSold: number;
  };
  statusCounts: Record<string, number>;
}

export interface DomainDetail extends PortfolioDomain {
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: string;
    _count: { campaignLeads: number; emailLogs: number; replies: number };
  }>;
  buyers: DomainBuyer[];
  offers: DomainOffer[];
}

export interface BuyerDiscoveryParams {
  domainName: string;
  keyword: string;
  cityState: string;
  domainIdea: string;
  targetIndustries: string[];
  targetLocations: string[];
}

export const DOMAIN_STATUSES = [
  'Available',
  'Prospecting',
  'Contacting Buyers',
  'Negotiating',
  'Sold',
  'Archived',
] as const;
export type PortfolioStatus = typeof DOMAIN_STATUSES[number];

export interface OutboundAnalytics {
  overview: OutboundMetrics;
  campaigns: OutboundCampaignSummary[];
  snapshots: Array<{
    id: string;
    date: string;
    sent: number;
    delivered: number;
    opens: number;
    clicks: number;
    replies: number;
    positiveReplies: number;
    negativeReplies: number;
    bounces: number;
    unsubscribes: number;
    complaints: number;
    engagementScore: number;
    deliverabilityScore: number;
  }>;
  topTemplates: Array<{
    id: string;
    name: string;
    subject: string;
    spamScore: number;
    deliverabilityScore: number;
    tags: string[];
    type: string;
  }>;
  bestSubjectLines: Array<{ subject: string; sent: number }>;
  sendTimeSuggestions: Array<{ label: string; confidence: number }>;
  domainRecommendations: Array<{
    domain: string;
    niche: string;
    cityState: string;
    confidence: number;
    reason: string;
    leadCount: number;
    exampleLead: string;
  }>;
  insights: string[];
}
