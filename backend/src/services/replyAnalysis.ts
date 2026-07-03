// AI analysis of inbound replies. Uses NVIDIA (Kimi) when a key is configured,
// with a deterministic local heuristic fallback so the inbox keeps working
// offline. Produces the category taxonomy the CRM pipeline depends on.
import { extractJson, getNvidiaKey, nvidiaChat } from './aiProvider.js';

export const REPLY_CATEGORIES = [
  'Interested',
  'Maybe Interested',
  'Negotiating',
  'Not Interested',
  'Unsubscribe',
  'Out Of Office',
  'Spam',
] as const;
export type ReplyCategory = typeof REPLY_CATEGORIES[number];

export interface ReplyAnalysis {
  category: ReplyCategory;
  sentiment: 'positive' | 'neutral' | 'negative';
  intentScore: number; // 0-100
  buyingIntent: boolean;
  summary: string;
  suggestedResponse: string;
  tags: string[];
  source: 'ai' | 'local';
}

export interface ReplyAnalysisContext {
  domain?: string;
  niche?: string;
  businessName?: string;
  senderName?: string;
}

export async function analyzeReply(body: string, subject = '', context: ReplyAnalysisContext = {}): Promise<ReplyAnalysis> {
  // The pattern detector is authoritative for the compliance-critical, highly
  // pattern-based categories (auto-replies and opt-outs), which LLMs sometimes
  // misread. For everything else we prefer the AI's nuance.
  const local = analyzeLocally(body, context);
  if (local.category === 'Out Of Office' || local.category === 'Unsubscribe') {
    return local;
  }

  const key = await getNvidiaKey();
  if (key) {
    try {
      const ai = await analyzeWithNvidia(body, subject, context);
      // Safety net: if AI says OOO/Unsubscribe but local didn't, trust AI only
      // when local was ambiguous; otherwise keep AI.
      return ai;
    } catch (err: any) {
      console.warn('[ReplyAnalysis] NVIDIA failed, using local heuristic:', err?.message);
    }
  }
  return local;
}

async function analyzeWithNvidia(body: string, subject: string, context: ReplyAnalysisContext): Promise<ReplyAnalysis> {
  const prompt = [
    `You are the assistant for a domain broker. Classify this inbound email reply to a cold outreach that offered the domain "${context.domain || 'a domain'}" (${context.niche || 'local niche'}) for sale.`,
    ``,
    `## Reply`,
    `Subject: ${subject || '(none)'}`,
    `Body:`,
    body.slice(0, 4000),
    ``,
    `## Task`,
    `1. Pick exactly ONE category from: ${REPLY_CATEGORIES.join(', ')}.`,
    `2. sentiment: positive, neutral, or negative.`,
    `3. intentScore: integer 0-100 (buying likelihood).`,
    `4. buyingIntent: true/false.`,
    `5. summary: one short sentence.`,
    `6. suggestedResponse: a concise, professional reply draft. Sign with "{{senderName}}". If category is Unsubscribe, write a brief opt-out confirmation. If Not Interested, a polite close.`,
    ``,
    `Return STRICT JSON only:`,
    `{"category":"...","sentiment":"...","intentScore":0,"buyingIntent":false,"summary":"...","suggestedResponse":"..."}`,
  ].join('\n');

  const text = await nvidiaChat(
    [
      { role: 'system', content: 'You classify sales email replies precisely and only return strict JSON.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.2, maxTokens: 1500, timeoutMs: 25000 }
  );
  const parsed = extractJson<any>(text);

  const category = normalizeCategory(parsed.category);
  const sentiment = ['positive', 'neutral', 'negative'].includes(parsed.sentiment) ? parsed.sentiment : sentimentForCategory(category);
  let suggested = String(parsed.suggestedResponse || '').trim();
  if (context.senderName) suggested = suggested.replace(/\{\{\s*senderName\s*\}\}/gi, context.senderName);

  return {
    category,
    sentiment,
    intentScore: clampScore(Number(parsed.intentScore)),
    buyingIntent: Boolean(parsed.buyingIntent) || category === 'Interested' || category === 'Negotiating',
    summary: String(parsed.summary || '').trim() || `${category} reply.`,
    suggestedResponse: suggested,
    tags: tagsForCategory(category),
    source: 'ai',
  };
}

// Deterministic fallback used when no AI key is set or the call fails.
export function analyzeLocally(body: string, context: ReplyAnalysisContext = {}): ReplyAnalysis {
  const text = (body || '').toLowerCase();
  let category: ReplyCategory = 'Maybe Interested';

  if (/out of office|on vacation|away from|auto-?reply|automatic reply|will be back|annual leave/.test(text)) {
    category = 'Out Of Office';
  } else if (/unsubscribe|remove me|opt[- ]?out|do not (?:email|contact)|take me off|stop emailing/.test(text)) {
    category = 'Unsubscribe';
  } else if (/not interested|no thanks|no thank you|not at this time|we'?ll pass|already have|not looking/.test(text)) {
    category = 'Not Interested';
  } else if (/(how much|price|cost|asking|offer|\$|counter|negotiat|too (?:high|expensive)|budget|deal)/.test(text)) {
    category = /(interested|yes|let'?s|sounds good)/.test(text) ? 'Interested' : 'Negotiating';
  } else if (/(interested|yes|sure|let'?s talk|send (?:the )?details|call me|tell me more|more info|sounds good|available\?)/.test(text)) {
    category = 'Interested';
  } else if (/(viagra|crypto|loan|seo services|guaranteed|click here to claim)/.test(text)) {
    category = 'Spam';
  }

  const sentiment = sentimentForCategory(category);
  const intentScore = {
    Interested: 88,
    Negotiating: 80,
    'Maybe Interested': 50,
    'Out Of Office': 35,
    'Not Interested': 10,
    Unsubscribe: 5,
    Spam: 0,
  }[category];

  return {
    category,
    sentiment,
    intentScore,
    buyingIntent: category === 'Interested' || category === 'Negotiating',
    summary: `${category} reply detected.`,
    suggestedResponse: localSuggestion(category, context),
    tags: tagsForCategory(category),
    source: 'local',
  };
}

function localSuggestion(category: ReplyCategory, context: ReplyAnalysisContext): string {
  const sign = context.senderName ? context.senderName : '{{senderName}}';
  const domain = context.domain || 'the domain';
  if (category === 'Interested' || category === 'Negotiating') {
    return `Hi,\n\nThanks for the reply. I can send the price, transfer process, and a quick use-case for ${domain}. Would a short email summary or a 10-minute call work better?\n\nBest,\n${sign}`;
  }
  if (category === 'Unsubscribe' || category === 'Not Interested') {
    return `Understood — thanks for letting me know. I won't follow up again.\n\nBest,\n${sign}`;
  }
  if (category === 'Out Of Office') {
    return `(Auto-reply detected — no action needed. Follow up after they return.)`;
  }
  return `Hi,\n\nThanks for getting back to me. Happy to clarify any details about ${domain} or send the transfer steps if useful.\n\nBest,\n${sign}`;
}

function normalizeCategory(value: unknown): ReplyCategory {
  const v = String(value || '').trim().toLowerCase();
  const match = REPLY_CATEGORIES.find((c) => c.toLowerCase() === v);
  if (match) return match;
  if (v.includes('negotiat')) return 'Negotiating';
  if (v.includes('unsub')) return 'Unsubscribe';
  if (v.includes('office') || v.includes('vacation')) return 'Out Of Office';
  if (v.includes('spam')) return 'Spam';
  if (v.includes('not')) return 'Not Interested';
  if (v.includes('maybe')) return 'Maybe Interested';
  if (v.includes('interest')) return 'Interested';
  return 'Maybe Interested';
}

function sentimentForCategory(category: ReplyCategory): 'positive' | 'neutral' | 'negative' {
  if (category === 'Interested' || category === 'Negotiating') return 'positive';
  if (category === 'Not Interested' || category === 'Unsubscribe' || category === 'Spam') return 'negative';
  return 'neutral';
}

function tagsForCategory(category: ReplyCategory): string[] {
  switch (category) {
    case 'Interested': return ['intent:buyer', 'hot'];
    case 'Negotiating': return ['intent:buyer', 'negotiation'];
    case 'Unsubscribe': return ['opt-out'];
    case 'Not Interested': return ['cold'];
    case 'Out Of Office': return ['auto-reply'];
    case 'Spam': return ['spam'];
    default: return ['needs-review'];
  }
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}
