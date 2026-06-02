import { verifyEmail, type EmailVerificationResult } from './emailVerification.js';
import {
  smtpProbe,
  detectCatchAll,
  getDomainAge,
  inspectSsl,
  type SmtpProbeResult,
  type DomainAgeResult,
  type SslCheckResult,
} from './deliverabilityIntelligence.js';
import { getCompanyIntel, type CompanyIntelResult } from './companyIntelligence.js';
import { getDomainReputation } from './campaignFeedback.js';
import prisma from '../config/db.js';

export type BounceRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Recommendation =
  | 'SAFE_TO_CONTACT'
  | 'CONTACT_WITH_CAUTION'
  | 'REVIEW_MANUALLY'
  | 'DO_NOT_SEND';

export interface DeliverabilityResult extends EmailVerificationResult {
  deliverabilityScore: number; // 0-100, the headline number
  bounceRisk: BounceRisk;
  businessConfidence: number; // 0-100, how confident the business is real & active
  patternConfidence: number; // 0-100, how plausible the email pattern is
  companyActive: boolean | null;
  recommendation: Recommendation;
  replyProbability: number; // 0-100, estimated probability of a reply
  conversionProbability: number; // 0-100, estimated probability of a positive outcome
  roleType: 'named' | 'sales' | 'executive' | 'support' | 'info' | 'admin' | 'noreply' | 'unknown';
  emailPattern: 'first.last' | 'firstlast' | 'first' | 'flast' | 'role' | 'numeric' | 'mixed' | 'unknown';
  signals: {
    smtp: SmtpProbeResult | null;
    catchAll: boolean | null;
    domainAge: DomainAgeResult | null;
    ssl: SslCheckResult | null;
    company: CompanyIntelResult | null;
    historicalBounceRate: number | null; // 0-1, from past campaigns for same domain
    historicalDeliveryRate: number | null;
    historicalReputationDelta: number | null; // -30 to +20, from feedback loop
  };
  layerScores: {
    syntax: number;
    dns: number;
    provider: number;
    company: number;
    pattern: number;
    role: number;
    reputation: number;
    final: number;
  };
}

interface AssessOptions {
  deep?: boolean; // run SMTP probe + RDAP + SSL
  websiteUrl?: string; // for company intel (Phase 2)
  staffNames?: string[]; // for pattern matching (Phase 3)
}

export async function assessDeliverability(
  rawEmail: string,
  opts: AssessOptions = {}
): Promise<DeliverabilityResult> {
  // Phase 0: base verification
  const base = await verifyEmail(rawEmail);
  const domain = base.email.split('@')[1] || '';
  const localPart = base.email.split('@')[0] || '';

  const result: DeliverabilityResult = {
    ...base,
    deliverabilityScore: 0,
    bounceRisk: 'HIGH',
    businessConfidence: 50,
    patternConfidence: 50,
    companyActive: null,
    recommendation: 'DO_NOT_SEND',
    replyProbability: 0,
    conversionProbability: 0,
    roleType: 'unknown',
    emailPattern: 'unknown',
    signals: {
      smtp: null,
      catchAll: null,
      domainAge: null,
      ssl: null,
      company: null,
      historicalBounceRate: null,
      historicalDeliveryRate: null,
      historicalReputationDelta: null,
    },
    layerScores: {
      syntax: 0,
      dns: 0,
      provider: 0,
      company: 50,
      pattern: 50,
      role: 50,
      reputation: 0,
      final: 0,
    },
  };

  // Short-circuit: if the base couldn't even pass syntax/domain, no point probing further
  if (!base.verificationMetadata.syntaxValid) {
    result.deliverabilityScore = 0;
    result.bounceRisk = 'CRITICAL';
    result.recommendation = 'DO_NOT_SEND';
    return result;
  }

  // Layer 1 — syntax
  result.layerScores.syntax = 100;

  // Layer 2 — DNS
  result.layerScores.dns = base.verificationMetadata.domainValid
    ? (base.mxValid ? 100 : 40)
    : 0;

  // Layer 3 — Provider
  result.layerScores.provider = providerScoreFor(base.provider);

  // Layer 6 — Role
  result.layerScores.role = roleConversionScore(localPart, base.roleAccount);

  // Layer 7 — Reputation (carry through from base)
  result.layerScores.reputation = base.reputationScore;

  // Deep probes — run in parallel
  if (opts.deep && base.mxValid && !base.disposable) {
    const [smtp, catchAll, age, ssl, company, historical] = await Promise.all([
      smtpProbe(base.email).catch(() => null),
      detectCatchAll(domain).catch(() => null),
      getDomainAge(domain).catch(() => null),
      inspectSsl(domain).catch(() => null),
      getCompanyIntel(domain).catch(() => null),
      getHistoricalDomainStats(domain).catch(() => null),
    ]);

    result.signals.smtp = smtp;
    result.signals.catchAll = catchAll;
    result.signals.domainAge = age;
    result.signals.ssl = ssl;
    result.signals.company = company;
    if (historical) {
      result.signals.historicalBounceRate = historical.bounceRate;
      result.signals.historicalDeliveryRate = historical.deliveryRate;
      result.signals.historicalReputationDelta = historical.reputationDelta;
    }
  }

  // Layer 4 + 5 + 7 enrichment — adjust scores based on deep signals
  result.layerScores.company = computeCompanyScore(result.signals);
  // Merge crawled staff names with caller-supplied ones for pattern matching
  const staffNames = [
    ...(opts.staffNames || []),
    ...(result.signals.company?.staffNames || []),
  ];
  result.layerScores.pattern = computePatternScore(localPart, staffNames);

  // Final weighted combination
  const finalScore = computeFinalScore(result.layerScores, result.signals, base);
  result.deliverabilityScore = finalScore;
  result.layerScores.final = finalScore;

  result.businessConfidence = result.layerScores.company;
  result.patternConfidence = result.layerScores.pattern;
  result.companyActive = inferCompanyActive(result.signals);
  result.bounceRisk = riskFromScore(finalScore, result.signals);
  result.recommendation = recommendationFromScore(finalScore, result.bounceRisk);

  // Phase 3 classification + probability estimates
  result.roleType = classifyRoleType(localPart, base.roleAccount);
  result.emailPattern = classifyEmailPattern(localPart);
  result.replyProbability = estimateReplyProbability(result);
  result.conversionProbability = estimateConversionProbability(result);

  return result;
}

// ---------- LAYER SCORING ----------

function providerScoreFor(provider: string | null): number {
  if (!provider) return 40;
  const p = provider.toLowerCase();
  if (p.includes('google') || p.includes('microsoft') || p.includes('office365')) return 95;
  if (p.includes('zoho') || p.includes('proton') || p.includes('fastmail')) return 88;
  if (p.includes('yahoo') || p.includes('aol')) return 70;
  if (p === 'custom') return 55;
  return 60;
}

function roleConversionScore(localPart: string, isRole: boolean): number {
  if (!isRole) return 75; // a named address — better reply odds
  const lc = localPart.toLowerCase();
  // High-conversion roles
  if (/^(sales|partnerships|bd|business)/.test(lc)) return 60;
  if (/^(owner|founder|ceo|cto|cmo|coo)/.test(lc)) return 80;
  // Low-conversion roles
  if (/^(noreply|no-reply|donotreply)/.test(lc)) return 5;
  if (/^(info|hello|contact|hi)/.test(lc)) return 40;
  if (/^(support|help)/.test(lc)) return 30;
  if (/^(admin|webmaster|postmaster|abuse)/.test(lc)) return 15;
  return 45;
}

function classifyRoleType(localPart: string, isRole: boolean): DeliverabilityResult['roleType'] {
  if (!isRole) return 'named';
  const lc = localPart.toLowerCase();
  if (/^(noreply|no-reply|donotreply|do-not-reply|bounces?)/.test(lc)) return 'noreply';
  if (/^(owner|founder|ceo|cto|cmo|coo|cfo|president|vp|director)/.test(lc)) return 'executive';
  if (/^(sales|partnerships|bd|business|biz)/.test(lc)) return 'sales';
  if (/^(support|help|helpdesk)/.test(lc)) return 'support';
  if (/^(info|hello|hi|contact|inquiries|enquiries)/.test(lc)) return 'info';
  if (/^(admin|webmaster|postmaster|abuse|hostmaster|root)/.test(lc)) return 'admin';
  return 'unknown';
}

function classifyEmailPattern(localPart: string): DeliverabilityResult['emailPattern'] {
  const lc = localPart.toLowerCase();
  if (/^[a-z]+\.[a-z]+$/.test(lc)) return 'first.last';
  if (/^[a-z]\.?[a-z]+$/.test(lc) && lc.length <= 12) return 'flast';
  if (/^[a-z]+$/.test(lc) && lc.length <= 12) return 'first';
  if (/^[a-z]+[a-z]+$/.test(lc) && lc.length > 4) return 'firstlast';
  if (/^\d/.test(lc) || /\d{3,}/.test(lc)) return 'numeric';
  // Catch role accounts via standard prefixes
  const norm = lc.replace(/[._-]/g, '');
  const roleHints = ['info', 'sales', 'support', 'hello', 'contact', 'admin', 'noreply', 'help'];
  if (roleHints.some((r) => norm.startsWith(r))) return 'role';
  return 'mixed';
}

function estimateReplyProbability(r: DeliverabilityResult): number {
  // Base prior from deliverability
  let p = r.deliverabilityScore * 0.4;
  // Role-type modifiers
  switch (r.roleType) {
    case 'named': p += 25; break;
    case 'executive': p += 18; break;
    case 'sales': p += 12; break;
    case 'info': p += 4; break;
    case 'support': p += 2; break;
    case 'admin': p -= 8; break;
    case 'noreply': return 0;
    case 'unknown': p += 5; break;
  }
  // Pattern signals
  if (r.emailPattern === 'first.last' || r.emailPattern === 'first') p += 6;
  if (r.emailPattern === 'numeric') p -= 10;
  // Catch-all and low business confidence suppress replies
  if (r.signals.catchAll === true) p -= 8;
  if (r.businessConfidence < 50) p -= 10;
  if (r.companyActive === false) p -= 15;
  // Historical signal
  if (r.signals.historicalDeliveryRate != null && r.signals.historicalDeliveryRate > 0.9) p += 5;
  return Math.max(0, Math.min(100, Math.round(p)));
}

function estimateConversionProbability(r: DeliverabilityResult): number {
  // Conversion is roughly 10-25% of reply probability for cold outreach
  const reply = r.replyProbability;
  let c = reply * 0.18;
  if (r.roleType === 'executive') c *= 1.5;
  if (r.roleType === 'sales') c *= 1.3;
  if (r.roleType === 'support' || r.roleType === 'admin') c *= 0.4;
  if (r.businessConfidence > 80) c *= 1.2;
  if (r.companyActive === false) c = Math.min(c, 1);
  return Math.max(0, Math.min(100, Math.round(c)));
}

function computeCompanyScore(signals: DeliverabilityResult['signals']): number {
  let score = 50;

  // Domain age (Layer 7)
  if (signals.domainAge?.ageDays != null) {
    if (signals.domainAge.ageDays > 365 * 2) score += 20;
    else if (signals.domainAge.ageDays > 365) score += 12;
    else if (signals.domainAge.ageDays > 90) score += 4;
    else score -= 12; // brand new domain — suspicious
  }

  // SSL (Layer 7)
  if (signals.ssl?.valid) score += 8;
  if (signals.ssl?.selfSigned) score -= 15;
  if (signals.ssl?.daysToExpiry != null && signals.ssl.daysToExpiry < 0) score -= 20;

  // Company intel (Layer 4)
  const c = signals.company;
  if (c) {
    if (!c.websiteReachable) score -= 25;
    else {
      if (c.parkedDomain) score -= 35;
      if (c.underConstruction) score -= 20;
      if (c.ageActivitySignal === 'active') score += 12;
      if (c.ageActivitySignal === 'dead') score -= 20;
      if (c.ageActivitySignal === 'stale') score -= 8;
      if (c.hasContactPage) score += 5;
      if (c.hasAboutPage) score += 4;
      if (c.socialLinkCount >= 2) score += 6;
      else if (c.socialLinkCount === 0) score -= 4;
      if (c.staffNames.length > 0) score += 4;
      if (c.pageWordCount > 500) score += 4;
    }
  }

  return Math.max(0, Math.min(100, score));
}

function computePatternScore(localPart: string, staffNames?: string[]): number {
  let score = 60;
  // Pattern shape signals
  if (/^[a-z]+\.[a-z]+$/.test(localPart)) score += 15; // first.last
  if (/^[a-z]+_[a-z]+$/.test(localPart)) score += 10;
  if (/^[a-z]\.?[a-z]+$/.test(localPart) && localPart.length > 3) score += 10; // f.last or flast
  if (/\d{3,}/.test(localPart)) score -= 15; // many digits → bulk/spam-y

  // Staff name match (Phase 3 — when supplied)
  if (staffNames && staffNames.length > 0) {
    const lc = localPart.toLowerCase().replace(/[._-]/g, '');
    for (const name of staffNames) {
      const norm = name.toLowerCase().replace(/[^a-z]/g, '');
      if (norm && lc.includes(norm)) {
        score += 25;
        break;
      }
    }
  }
  return Math.max(0, Math.min(100, score));
}

function computeFinalScore(
  layers: DeliverabilityResult['layerScores'],
  signals: DeliverabilityResult['signals'],
  base: EmailVerificationResult
): number {
  // Weighted blend. Reputation does heavy lifting since it already aggregates DNS/SPF/DMARC/provider.
  let score =
    layers.syntax * 0.05 +
    layers.dns * 0.10 +
    layers.provider * 0.10 +
    layers.reputation * 0.30 +
    layers.company * 0.15 +
    layers.pattern * 0.10 +
    layers.role * 0.20;

  // SMTP probe overrides — very high signal when available
  if (signals.smtp) {
    if (signals.smtp.rcptAccepted) score = Math.max(score, 70); // mailbox replied 250
    else if (signals.smtp.rejectionCode === 550 || signals.smtp.rejectionCode === 551) {
      score = Math.min(score, 15); // hard reject — almost certainly bounces
    }
    if (signals.smtp.greylisted) score = Math.max(score - 5, 40);
  }

  if (signals.catchAll === true) score = Math.min(score, 65); // catch-all: unverifiable

  // Historical campaign signal — pulled from DomainReputation
  if (signals.historicalBounceRate != null) {
    if (signals.historicalBounceRate > 0.2) score -= 25;
    else if (signals.historicalBounceRate > 0.05) score -= 10;
    else if (signals.historicalBounceRate < 0.01 && signals.historicalDeliveryRate! > 0.9) score += 8;
  }
  // Aggregated reputation delta (-30 to +20) from feedback loop
  if (signals.historicalReputationDelta != null) {
    score += signals.historicalReputationDelta;
  }

  if (base.disposable) score = Math.min(score, 5);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function riskFromScore(score: number, signals: DeliverabilityResult['signals']): BounceRisk {
  if (signals.smtp?.rejectionCode && signals.smtp.rejectionCode >= 550) return 'CRITICAL';
  if (score >= 85) return 'LOW';
  if (score >= 70) return 'MEDIUM';
  if (score >= 50) return 'HIGH';
  return 'CRITICAL';
}

function recommendationFromScore(score: number, risk: BounceRisk): Recommendation {
  if (risk === 'CRITICAL') return 'DO_NOT_SEND';
  if (score >= 85) return 'SAFE_TO_CONTACT';
  if (score >= 70) return 'CONTACT_WITH_CAUTION';
  if (score >= 50) return 'REVIEW_MANUALLY';
  return 'DO_NOT_SEND';
}

function inferCompanyActive(signals: DeliverabilityResult['signals']): boolean | null {
  const c = signals.company;
  if (c) {
    if (c.parkedDomain || c.ageActivitySignal === 'dead') return false;
    if (c.ageActivitySignal === 'active' && (signals.ssl?.valid || signals.domainAge?.ageDays != null)) return true;
    if (c.ageActivitySignal === 'stale') return false;
  }
  if (signals.ssl?.valid && signals.domainAge?.ageDays != null && signals.domainAge.ageDays > 90) {
    return true;
  }
  return null;
}

// ---------- HISTORICAL CAMPAIGN FEEDBACK ----------

async function getHistoricalDomainStats(domain: string): Promise<{ bounceRate: number; deliveryRate: number; reputationDelta: number } | null> {
  const rep = await getDomainReputation(domain);
  if (!rep || rep.totalSent < 1) return null;
  return {
    bounceRate: rep.bounceRate,
    deliveryRate: rep.deliveryRate,
    reputationDelta: rep.reputationDelta,
  };
}

// ---------- BULK ----------

export async function assessDeliverabilityBulk(
  emails: string[],
  opts: AssessOptions & { concurrency?: number; onProgress?: (done: number, total: number) => void } = {}
): Promise<DeliverabilityResult[]> {
  const { concurrency = 5, onProgress, ...assessOpts } = opts;
  const results: DeliverabilityResult[] = new Array(emails.length);
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < emails.length) {
      const i = cursor++;
      try {
        results[i] = await assessDeliverability(emails[i], assessOpts);
      } catch (err: any) {
        // Fail soft: return a minimal failed result
        results[i] = {
          email: emails[i],
          status: 'INVALID',
          confidenceScore: 0,
          provider: null,
          mxHost: null,
          mxValid: false,
          disposable: false,
          roleAccount: false,
          freeProvider: false,
          catchAllRisk: 'unknown',
          riskLevel: 'high',
          reputationScore: 0,
          recommendation: 'DO_NOT_SEND',
          deliverabilityScore: 0,
          bounceRisk: 'CRITICAL',
          businessConfidence: 0,
          patternConfidence: 0,
          companyActive: null,
          replyProbability: 0,
          conversionProbability: 0,
          roleType: 'unknown',
          emailPattern: 'unknown',
          verificationMetadata: {
            syntaxValid: false, domainValid: false, mxRecords: [],
            hasSPF: false, hasDMARC: false, hasWebsite: false,
            durationMs: 0, verifiedAt: new Date().toISOString(),
          },
          signals: {
            smtp: null, catchAll: null, domainAge: null, ssl: null, company: null,
            historicalBounceRate: null, historicalDeliveryRate: null, historicalReputationDelta: null,
          },
          layerScores: {
            syntax: 0, dns: 0, provider: 0, company: 0,
            pattern: 0, role: 0, reputation: 0, final: 0,
          },
        };
      }
      done++;
      onProgress?.(done, emails.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, emails.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
