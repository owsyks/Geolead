// AI Campaign Variant Engine
// Generates 5 distinct, professional outreach variants (A-E) for a domain-sale
// campaign. The CORE OFFER stays identical across variants — only the wording,
// structure, greeting, CTA, and signature change. Each variant is spam-scored
// and only approved if it falls below the acceptable risk threshold.
//
// Variant styles:
//   A — Direct:        gets to the point, plain pitch
//   B — Consultative:  asks-first, problem/fit framing
//   C — Branding:      emphasizes brand memorability / identity
//   D — SEO:           emphasizes search visibility / exact-match value
//   E — Opportunity:   frames the domain as a timely opening, low-pressure
import { nvidiaChat, getNvidiaKey, extractJson } from './nvidiaAi.js';
import { scoreSpamRisk, humanizeMergeTokens } from './outboundAi.js';

export type VariantKey = 'A' | 'B' | 'C' | 'D' | 'E';

export const VARIANT_STYLES: Record<VariantKey, { name: string; brief: string }> = {
  A: { name: 'Direct', brief: 'Straight to the point. State the domain, why it fits, one clear ask. Confident but not pushy.' },
  B: { name: 'Consultative', brief: 'Lead with a question about their business/market fit. Frame the domain as a solution. Curious, advisory tone.' },
  C: { name: 'Branding', brief: 'Emphasize brand memorability, identity, and how an exact-match name strengthens recognition.' },
  D: { name: 'SEO', brief: 'Emphasize search visibility, exact-match keyword value, and organic/paid traffic benefits.' },
  E: { name: 'Opportunity', brief: 'Frame the domain as a timely, low-pressure opening before someone else takes it. Soft, no urgency language.' },
};

export const VARIANT_ORDER: VariantKey[] = ['A', 'B', 'C', 'D', 'E'];

// Spam threshold: scoreSpamRisk returns 0-10. Anything <= this is "approved".
export const SPAM_THRESHOLD = 4;

// Banned phrases — hard reject regardless of numeric score (the user explicitly
// called these out).
const BANNED_PHRASES = [
  'act now', 'limited time', 'guaranteed', '100% profit', 'buy now',
  'risk-free', 'click here', 'urgent', 'winner', 'congratulations',
];

export interface VariantInput {
  geoDomain: string;
  niche?: string;
  cityState?: string;
  senderName?: string;
  objective?: string;
  userId?: string | null;
  decisionMakerName?: string | null;
  decisionMakerRole?: string | null;
}

export interface GeneratedVariant {
  key: VariantKey;
  style: string;
  subject: string;
  greeting: string;
  body: string;       // includes greeting + body + CTA + signature, uses merge tokens
  cta: string;
  signature: string;
  spamScore: number;
  approved: boolean;
  flags: string[];    // why it was rejected, if any
}

export interface VariantBundle {
  generatedAt: string;
  variants: GeneratedVariant[];
}

// ─── Greeting / CTA / signature rotation pools (local fallback + enrichment) ──

const GREETINGS = [
  'Hi there,',
  'Hello,',
  'Good afternoon,',
  'Hi team,',
  'Hope you are doing well —',
];

const CTAS: Record<VariantKey, string> = {
  A: 'Would it be worth a quick look at the price and transfer details?',
  B: 'Is owning a domain like this something your team has considered?',
  C: 'Open to seeing how the name could anchor your branding?',
  D: 'Want me to send over the search and traffic angle?',
  E: 'Should I hold it for you while you take a look?',
};

const SIGNATURES = [
  'Best,\n{{senderName}}',
  'Thanks,\n{{senderName}}',
  'Kind regards,\n{{senderName}}',
  '— {{senderName}}',
  'Talk soon,\n{{senderName}}',
];

// ─── Spam gating ──────────────────────────────────────────────────────────────

function evaluateVariant(subject: string, body: string): { spamScore: number; approved: boolean; flags: string[] } {
  const combined = `${subject}\n${body}`;
  const lower = combined.toLowerCase();
  const flags: string[] = [];

  let spamScore = scoreSpamRisk(combined);

  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) {
      flags.push(`Contains banned phrase: "${phrase}"`);
      spamScore = Math.max(spamScore, 8);
    }
  }
  // Excessive caps in subject (clickbait signal)
  const capsWords = subject.split(/\s+/).filter(w => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (capsWords.length >= 2) {
    flags.push('Excessive capitalization in subject');
    spamScore = Math.max(spamScore, 6);
  }
  if ((subject.match(/!/g) || []).length > 0) {
    flags.push('Exclamation mark in subject');
    spamScore += 1;
  }
  if (subject.length > 65) flags.push('Subject over 65 chars');

  spamScore = Math.min(10, spamScore);
  return { spamScore, approved: spamScore <= SPAM_THRESHOLD && flags.filter(f => f.startsWith('Contains banned')).length === 0, flags };
}

// ─── Local (no-AI) variant generation ────────────────────────────────────────

export function localVariants(input: VariantInput): GeneratedVariant[] {
  const domain = input.geoDomain;
  const niche = input.niche || 'your market';
  const geo = input.cityState || 'your area';

  const bodies: Record<VariantKey, { subject: string; lead: string }> = {
    A: {
      subject: `${domain} — quick question`,
      lead: `I own ${domain} and it lines up closely with ${niche} in ${geo}. It could work well as a focused landing page or a memorable redirect to your current site.`,
    },
    B: {
      subject: `A thought on your ${niche} presence`,
      lead: `I was looking at ${niche} businesses in ${geo} and wondered how you currently capture local search interest. I own ${domain}, which maps directly to that audience.`,
    },
    C: {
      subject: `Branding idea for your business`,
      lead: `A clean, exact-match name like ${domain} tends to stick in people's minds and reinforces a local identity in ${geo}. I own it and thought of your business right away.`,
    },
    D: {
      subject: `${domain} and local search`,
      lead: `Exact-match geo domains like ${domain} can help with search visibility and paid campaigns for ${niche} in ${geo}, without touching your existing brand.`,
    },
    E: {
      subject: `Thought you may want ${domain}`,
      lead: `${domain} recently became available and it fits ${niche} in ${geo} unusually well. No pressure at all — I just wanted you to have first look before I list it more widely.`,
    },
  };

  return VARIANT_ORDER.map((key, i) => {
    const greeting = GREETINGS[i % GREETINGS.length];
    const cta = CTAS[key];
    const signature = SIGNATURES[i % SIGNATURES.length];
    const { subject, lead } = bodies[key];
    const body = `${greeting}\n\n${lead}\n\n${cta}\n\n${signature}`;
    const evals = evaluateVariant(subject, body);
    return {
      key,
      style: VARIANT_STYLES[key].name,
      subject,
      greeting,
      body,
      cta,
      signature,
      ...evals,
    };
  });
}

// ─── NVIDIA-powered generation (preferred) ───────────────────────────────────

async function aiVariants(input: VariantInput): Promise<GeneratedVariant[]> {
  const domain = input.geoDomain;
  const niche = input.niche || 'local businesses';
  const geo = input.cityState || 'their area';
  const senderLine = input.senderName?.trim()
    ? `Sign every variant as "${input.senderName.trim()}".`
    : `Sign every variant with the literal token {{senderName}} (do not invent a name).`;

  const styleLines = VARIANT_ORDER.map(k => `- Variant ${k} (${VARIANT_STYLES[k].name}): ${VARIANT_STYLES[k].brief}`).join('\n');

  const prompt = [
    `You are an expert cold-email copywriter. Write 5 DISTINCT variants of a single cold email that proposes selling the domain "${domain}" to a relevant ${niche} business in ${geo}.`,
    ``,
    `The CORE OFFER and INTENT are identical in every variant: offer to sell this geo-domain. Only the wording, structure, greeting, CTA, and signature differ. Each must read like a genuine one-to-one email a human wrote — never a mass blast.`,
    ``,
    `## Variant styles (use exactly these angles)`,
    styleLines,
    ``,
    `## Hard rules`,
    `- Subject: <= 60 chars, no emoji, no ALL-CAPS words, no exclamation marks, no clickbait.`,
    `- Each variant uses a DIFFERENT greeting style and a DIFFERENT signature sign-off.`,
    `- Body: 60-110 words, plain text. One single clear CTA per email.`,
    `- Write the real domain "${domain}", niche "${niche}", and location "${geo}" inline. Do NOT use a business-name placeholder or any curly-brace token — greet generically (e.g. "Hi there,").`,
    senderLine,
    `- Do NOT include any unsubscribe line, footer, or physical address — that is appended automatically.`,
    `- NEVER use: "act now", "limited time", "guaranteed", "100% profit", "buy now", "risk-free", "click here", "urgent". No urgency or pressure language.`,
    `- No misleading claims. Truthful, professional, warm.`,
    ``,
    `## Output`,
    `Return STRICT JSON only:`,
    `{"variants":[{"key":"A","subject":"...","greeting":"...","body":"<full email incl greeting, body, CTA, signature>","cta":"<the one CTA sentence>"}, ... 5 total A-E]}`,
  ].join('\n');

  const raw = await nvidiaChat(
    [{ role: 'user', content: prompt }],
    { maxTokens: 2200, temperature: 0.7, timeoutMs: 40000, userId: input.userId }
  );

  const parsed = extractJson<{ variants: Array<Record<string, string>> }>(raw);
  const byKey = new Map<string, Record<string, string>>();
  for (const v of parsed.variants || []) {
    if (v.key && VARIANT_ORDER.includes(v.key as VariantKey)) byKey.set(v.key, v);
  }

  // Build the full set; fall back to local for any missing/blank variant.
  const local = localVariants(input);
  return VARIANT_ORDER.map((key, i) => {
    const v = byKey.get(key);
    if (!v || !v.body || !v.subject) return local[i];
    const greeting = v.greeting || (v.body.split('\n')[0] ?? GREETINGS[i % GREETINGS.length]);
    const cta = v.cta || CTAS[key];
    const signature = SIGNATURES[i % SIGNATURES.length];
    const subject = v.subject.slice(0, 70);
    const evals = evaluateVariant(subject, v.body);
    return {
      key,
      style: VARIANT_STYLES[key].name,
      subject,
      greeting,
      body: v.body,
      cta,
      signature,
      ...evals,
    };
  });
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function generateCampaignVariants(input: VariantInput): Promise<VariantBundle> {
  const hasKey = Boolean(await getNvidiaKey(input.userId).catch(() => undefined));
  let variants: GeneratedVariant[];
  try {
    variants = hasKey ? await aiVariants(input) : localVariants(input);
  } catch {
    variants = localVariants(input);
  }

  // Resolve every merge token to readable text. Variants carry the campaign's
  // real domain/niche/geo, so there is nothing to personalize per-recipient
  // later — and users should never see a raw "{{businessName}}" token. The
  // business-name token becomes a natural greeting, the rest are filled in.
  const ctx = {
    businessName: null,
    senderName: input.senderName,
    geoDomain: input.geoDomain,
    cityState: input.cityState,
    niche: input.niche,
    decisionMakerName: input.decisionMakerName,
    decisionMakerRole: input.decisionMakerRole,
  };
  variants = variants.map((v) => {
    const subject = humanizeMergeTokens(v.subject, ctx);
    const body = humanizeMergeTokens(v.body, ctx);
    const evals = evaluateVariant(subject, body);
    return {
      ...v,
      subject,
      body,
      greeting: humanizeMergeTokens(v.greeting, ctx),
      cta: humanizeMergeTokens(v.cta, ctx),
      signature: humanizeMergeTokens(v.signature, ctx),
      ...evals,
    };
  });

  return { generatedAt: new Date().toISOString(), variants };
}
