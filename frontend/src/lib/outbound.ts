export const OUTBOUND_API_BASE =
  process.env.NEXT_PUBLIC_OUTBOUND_API_BASE || "http://localhost:5000";

// ---- Auth token management ---------------------------------------------
// Tokens live in localStorage so they survive reloads. The access token is a
// short-lived JWT sent as a Bearer header; the refresh token mints new access
// tokens. Both this module and the AuthProvider read/write through here.
const ACCESS_KEY = "geolead.accessToken";
const REFRESH_KEY = "geolead.refreshToken";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_KEY);
}
export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}
export function setTokens(accessToken: string, refreshToken?: string) {
  if (typeof window === "undefined") return;
  if (accessToken) window.localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) window.localStorage.setItem(REFRESH_KEY, refreshToken);
}
export function clearTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

// Exchange the refresh token for a fresh access token. Returns true on success.
let refreshInFlight: Promise<boolean> | null = null;
export function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${OUTBOUND_API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      setTokens(data.accessToken, data.refreshToken);
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
// Does NOT auto-refresh; use fetchOutbound for JSON endpoints that should.
export function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = getAccessToken();
  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function fetchOutbound<T>(path: string, init?: RequestInit, _retried = false): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${OUTBOUND_API_BASE}${path}`, {
    cache: "no-store",
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
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(response.status, message);
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
  category: "ai" | "discovery" | "email" | "inbound" | "smtp" | "branding";
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
  createdAt: string;
  updatedAt: string;
  _count?: { campaigns: number; buyers: number; offers: number };
  sale?: DomainSale | null;
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
