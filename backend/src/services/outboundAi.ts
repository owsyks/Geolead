import { analyzeWebsiteForOutbound, type WebsiteIntel } from './websiteIntel.js';
import { extractJson, getNvidiaKey, nvidiaChat } from './aiProvider.js';

export interface EmailGenerationInput {
  businessName?: string;
  senderName?: string;
  geoDomain: string;
  niche?: string;
  category?: string;
  cityState?: string;
  website?: string;
  businessDescription?: string;
  painPoints?: string;
  tone?: string;
  language?: string;
  variant?: 'cold' | 'follow_up' | 'short' | 'long' | 'persuasive' | 'friendly';
  userId?: string | null;
  decisionMakerName?: string | null;
  decisionMakerRole?: string | null;
}

// Post-process generated copy:
//  - {{businessName}} → resolved to the real business name when known, otherwise
//    rewritten to a natural greeting. Users disliked seeing the raw token, so it
//    is never left in the output.
//  - {{senderName}} → replaced with provided sender name when supplied
//  - {{unsubscribeLine}} → stripped
//  - any other stray {{...}} merge token → stripped so nothing raw leaks through
function finalizeTokens(text: string, opts: { senderName?: string; businessName?: string } = {}): string {
  const biz = opts.businessName?.trim();
  let out = text
    .replace(/\{\{\s*businessName\s*\}\}\s+team\b/gi, biz ? `${biz} team` : 'there')
    .replace(/\{\{\s*businessName\s*\}\}'s/gi, biz ? `${biz}'s` : 'your')
    .replace(/\{\{\s*businessName\s*\}\}/gi, biz || 'there')
    .replace(/\n*\s*\{\{\s*unsubscribeLine\s*\}\}\s*/gi, '\n')
    .replace(/^.*\b(opt[\s-]?out|unsubscribe)\b.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n');
  if (opts.senderName && opts.senderName.trim()) {
    out = out.replace(/\{\{\s*senderName\s*\}\}/gi, opts.senderName.trim());
  }
  // Tidy artifacts left by removed tokens ("Hi there team," → "Hi there,").
  out = out
    .replace(/\bthere team\b/gi, 'there')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ,/g, ',');
  return out.trimEnd();
}

// Resolve merge tokens to human-readable text for copy that will NOT be
// re-personalized later (campaign variants already carry the campaign's real
// domain/niche/geo). Fills known values, rewrites the recipient business-name
// token to a natural greeting, and strips any leftover {{...}} so users never
// see raw tokens like "{{businessName}}".
export function humanizeMergeTokens(text: string, ctx: {
  businessName?: string | null; senderName?: string | null; geoDomain?: string | null;
  cityState?: string | null; niche?: string | null; website?: string | null;
  decisionMakerName?: string | null; decisionMakerRole?: string | null;
}): string {
  const biz = ctx.businessName?.trim();
  const dm = ctx.decisionMakerName?.trim();
  return text
    .replace(/\{\{\s*businessName\s*\}\}\s+team\b/gi, biz ? `${biz} team` : 'there')
    .replace(/\{\{\s*businessName\s*\}\}'s/gi, biz ? `${biz}'s` : 'your')
    .replace(/\{\{\s*businessName\s*\}\}/gi, biz || 'there')
    .replace(/\{\{\s*decisionMakerName\s*\}\}/gi, dm || 'there')
    .replace(/\{\{\s*decisionMakerRole\s*\}\}/gi, ctx.decisionMakerRole?.trim() || '')
    .replace(/\{\{\s*geoDomain\s*\}\}/gi, ctx.geoDomain?.trim() || 'this domain')
    .replace(/\{\{\s*cityState\s*\}\}/gi, ctx.cityState?.trim() || 'your area')
    .replace(/\{\{\s*niche\s*\}\}/gi, ctx.niche?.trim() || 'your market')
    .replace(/\{\{\s*website\s*\}\}/gi, ctx.website?.trim() || '')
    .replace(/\{\{\s*senderName\s*\}\}/gi, ctx.senderName?.trim() || 'the team')
    .replace(/\n*\s*\{\{\s*unsubscribeLine\s*\}\}\s*/gi, '\n')
    .replace(/\{\{[^}]*\}\}/g, '') // strip any remaining unknown tokens
    .replace(/\bthere team\b/gi, 'there')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ,/g, ',')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

export interface GeneratedEmail {
  subjectLine: string;
  previewText: string;
  body: string;
  followUps: string[];
  variables: string[];
  spamScore: number;
  deliverabilityScore: number;
  abSubjects: string[];
  websiteIntel: WebsiteIntel;
  complianceNotes: string[];
}

export async function generateOutboundEmail(input: EmailGenerationInput): Promise<GeneratedEmail> {
  const websiteIntel = await analyzeWebsiteForOutbound(input.website);
  const normalizedInput: Required<Pick<EmailGenerationInput, 'tone' | 'language' | 'variant'>> & EmailGenerationInput = {
    tone: input.tone || 'professional',
    language: input.language || 'en',
    variant: input.variant || 'cold',
    ...input,
  };

  // Resolve the NVIDIA key at call time so changes saved in Settings take
  // effect without a restart. Empty key => local template fallback.
  const nvidiaKey = await getNvidiaKey();
  const generated = nvidiaKey
    ? await generateWithNvidia(normalizedInput, websiteIntel).catch(() => localGenerate(normalizedInput, websiteIntel))
    : localGenerate(normalizedInput, websiteIntel);

  // Resolve recipient/sender tokens into readable text before scoring/return so
  // the output never shows raw "{{businessName}}" / "{{senderName}}".
  const sender = input.senderName;
  const tokenOpts = { senderName: sender, businessName: input.businessName };
  const finalized = {
    subjectLine: finalizeTokens(generated.subjectLine, tokenOpts),
    previewText: finalizeTokens(generated.previewText, tokenOpts),
    body: finalizeTokens(generated.body, tokenOpts),
    followUps: generated.followUps.map((f: string) => finalizeTokens(f, tokenOpts)),
    abSubjects: generated.abSubjects.map((s: string) => finalizeTokens(s, tokenOpts)),
  };

  const spamScore = scoreSpamRisk(`${finalized.subjectLine}\n${finalized.body}`);
  const deliverabilityScore = Math.max(0, Math.min(100, 100 - spamScore * 7));

  return {
    ...finalized,
    spamScore,
    deliverabilityScore,
    websiteIntel,
    variables: [
      '{{geoDomain}}',
      '{{cityState}}',
      '{{niche}}',
      '{{website}}',
      '{{decisionMakerName}}',
      '{{decisionMakerRole}}',
      ...(sender && sender.trim() ? [] : ['{{senderName}}']),
    ],
    complianceNotes: [
      'Use truthful sender identity and subject lines.',
      'Include a physical mailing address and unsubscribe link in every sent message.',
      'Stop follow-ups when a reply, bounce, complaint, or unsubscribe is received.',
      'Keep daily volume and sender rotation conservative until the domain is warmed up.',
    ],
  };
}

export interface FollowUpInput {
  businessName?: string;
  senderName?: string;
  geoDomain: string;
  niche?: string;
  cityState?: string;
  website?: string;
  stepOrder: number;
  stepType?: string; // 'FOLLOW_UP' | 'BREAKUP'
  userId?: string | null;
  decisionMakerName?: string | null;
  decisionMakerRole?: string | null;
}

// Plain-template follow-up/breakup, used when every AI provider is
// unavailable. Mirrors the AI prompt's own constraints (short, no invented
// facts, no unsubscribe/footer) rather than trying to sound AI-generated.
function localFollowUpBody(
  isBreakup: boolean,
  geo: string,
  niche: string,
  city: string,
  sender: string,
  greeting: string
): { subject: string; body: string } {
  const nicheClause = niche !== 'your niche' ? ` for ${niche}` : '';
  const cityClause = city !== 'your market' ? ` in ${city}` : '';
  if (isBreakup) {
    return {
      subject: `Closing the loop on ${geo}`,
      body: `${greeting}\n\nHaven't heard back, so I'll stop reaching out about ${geo} — no worries either way. If it's ever useful down the line, feel free to reach out.\n\n${sender}`,
    };
  }
  return {
    subject: `Following up: ${geo}`,
    body: `${greeting}\n\nJust following up on my note about ${geo}${nicheClause}${cityClause}. If you're not the right person, happy to point this at whoever handles it — otherwise let me know if there's any interest.\n\n${sender}`,
  };
}

export async function generateFollowUpBody(
  input: FollowUpInput
): Promise<{ subject: string; body: string } | null> {
  const isBreakup = input.stepType === 'BREAKUP' || input.stepOrder >= 3;
  const geo = input.geoDomain;
  const niche = input.niche || 'your niche';
  const city = input.cityState || 'your market';
  const sender = input.senderName?.trim() || '{{senderName}}';
  const dmName = input.decisionMakerName?.trim();
  const greeting = dmName
    ? `Hi ${dmName},`
    : input.businessName?.trim()
    ? `Hi {{businessName}} team,`
    : 'Hi there,';

  const key = await getNvidiaKey(input.userId);
  if (!key) return localFollowUpBody(isBreakup, geo, niche, city, sender, greeting);

  const prompt = isBreakup
    ? [
        `Write a short breakup/closing email (30-55 words, plain text) for a domain sales outreach sequence.`,
        `Domain for sale: ${geo}`,
        `Recipient niche: ${niche}, location: ${city}`,
        `This is the FINAL email in the sequence. Acknowledge they haven't replied. Say you'll stop following up. Leave the door open politely. No pressure.`,
        `Sign as: ${sender}`,
        `Greeting: "${greeting}"`,
        `Do NOT include an unsubscribe link or footer.`,
        `Return strict JSON only: {"subject":"string","body":"string"}`,
      ].join('\n')
    : [
        `Write a short follow-up email (45-80 words, plain text) for a domain sales outreach sequence.`,
        `Domain for sale: ${geo}`,
        `Recipient niche: ${niche}, location: ${city}`,
        `This is a gentle follow-up to an unanswered first email. Briefly re-mention the domain, ask if they're the right contact or if there's interest. No pressure.`,
        `Sign as: ${sender}`,
        `Greeting: "${greeting}"`,
        `Do NOT include an unsubscribe link or footer.`,
        `Return strict JSON only: {"subject":"string","body":"string"}`,
      ].join('\n');

  try {
    const content = await nvidiaChat(
      [
        {
          role: 'system',
          content:
            'You are a B2B copywriter. Write short, natural follow-up emails. Never invent facts. Always respond with strict JSON and nothing else.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.6, maxTokens: 512, timeoutMs: 20000, userId: input.userId }
    );
    const parsed = extractJson<{ subject: string; body: string }>(content);
    if (!parsed?.subject || !parsed?.body) return localFollowUpBody(isBreakup, geo, niche, city, sender, greeting);
    return {
      subject: String(parsed.subject).slice(0, 70),
      body: String(parsed.body),
    };
  } catch {
    return localFollowUpBody(isBreakup, geo, niche, city, sender, greeting);
  }
}

export function rewriteEmail(
  body: string,
  action: 'shorter' | 'professional' | 'persuasive' | 'friendly'
): string {
  const cleaned = body.trim();

  if (action === 'shorter') {
    return cleaned
      .split(/\n+/)
      .filter((line) => !/quick note|just wanted/i.test(line))
      .slice(0, 4)
      .join('\n\n');
  }

  if (action === 'friendly') {
    return cleaned
      .replace(/\bHello\b/g, 'Hi')
      .replace(/\bI would like to\b/gi, "I wanted to")
      .replace(/\bPlease let me know\b/gi, 'Would it be worth a quick look?');
  }

  if (action === 'persuasive') {
    return `${cleaned}\n\nA strong geo domain can make paid search, referrals, and direct navigation easier to remember. If this is not relevant, you can opt out and I will not follow up.`;
  }

  return cleaned
    .replace(/\bHey\b/g, 'Hello')
    .replace(/\bworth a quick look\?/gi, 'worth reviewing this week?')
    .replace(/\bThanks\b/g, 'Regards');
}

export function scoreSpamRisk(content: string): number {
  const text = content.toLowerCase();
  const riskyPhrases = [
    'guaranteed',
    'act now',
    'limited time',
    'risk-free',
    'make money',
    'free!!!',
    'winner',
    'urgent',
    'click here',
    'buy now',
    'no obligation',
  ];

  let score = 0;
  riskyPhrases.forEach((phrase) => {
    if (text.includes(phrase)) score += 2;
  });
  if ((content.match(/!/g) || []).length > 2) score += 2;
  if ((content.match(/\$/g) || []).length > 2) score += 2;
  if (content.length > 1800) score += 1;
  if (!/unsubscribe|opt out/i.test(content)) score += 1;

  return Math.min(10, score);
}

function localGenerate(input: EmailGenerationInput, intel: WebsiteIntel) {
  // Greeting — use decision maker name if available, else business name token.
  const dmName = input.decisionMakerName?.trim();
  const greeting = dmName
    ? dmName
    : input.businessName && input.businessName.trim()
    ? '{{businessName}} team'
    : 'there';
  const geoDomain = input.geoDomain || '{{geoDomain}}';
  const cityState = input.cityState || '{{cityState}}';
  const niche = input.niche || input.category || intel.detectedNiche || 'your local market';
  const contextLine = buildContextLine(intel, niche, cityState);
  const toneLine = toneToLine(input.tone || 'professional');

  const opener = input.variant === 'friendly' ? `Hi ${greeting},` : `Hello ${greeting},`;

  const body =
    input.variant === 'short'
      ? `${opener}\n\n${contextLine}. I own ${geoDomain}, and it looks like a clean fit for ${niche} visibility in ${cityState || 'your market'}.\n\nWould you be open to seeing a simple price and transfer outline?\n\nBest,\n{{senderName}}\n\n{{unsubscribeLine}}`
      : `${opener}\n\n${contextLine}. That stood out because I own ${geoDomain}, a geo-domain that maps directly to ${niche} demand in ${cityState || 'your area'}.\n\n${toneLine} The domain could be useful for a focused landing page, paid search campaign, or memorable redirect to an existing site without changing the current brand.\n\nWould it be worth sending over the price and transfer details?\n\nBest,\n{{senderName}}\n\n{{unsubscribeLine}}`;

  return {
    subjectLine: `${geoDomain} — available for acquisition`,
    previewText: `A relevant geo-domain idea for ${niche}.`,
    body,
    followUps: [
      `Hi ${greeting},\n\nFollowing up on ${geoDomain}. Since it matches ${cityState || 'your market'} and ${niche}, it may be useful for a dedicated campaign or redirect.\n\nShould I send the details?\n\n{{unsubscribeLine}}`,
      `Quick bump on ${geoDomain}. If domain acquisitions are handled by someone else, could you point me in the right direction?\n\n{{unsubscribeLine}}`,
      `Last note from me on ${geoDomain}. I do not want to crowd your inbox, so I will close the loop unless it is relevant.\n\n{{unsubscribeLine}}`,
    ],
    abSubjects: [
      `${geoDomain} — available for acquisition`,
      `Question about ${geoDomain}`,
      `${cityState || 'Local'} domain for ${niche}`,
    ],
  };
}

async function generateWithNvidia(input: EmailGenerationInput, intel: WebsiteIntel) {
  const websiteSummary = intel.sourceStatus === 'SCRAPED'
    ? intel.summary
    : 'No website data available — do NOT invent facts about the business.';

  const hasBusiness = !!(input.businessName && input.businessName.trim());
  const senderName = input.senderName && input.senderName.trim() ? input.senderName.trim() : '';
  const niche = input.niche || input.category || intel.detectedNiche || 'local businesses';

  const prompt = [
    `You are writing one cold email proposing the sale of a geo-domain to a relevant local business.`,
    ``,
    `## Domain (the focus of the email)`,
    `Geo domain for sale: ${input.geoDomain}`,
    `Category: ${input.category || niche}`,
    `Niche: ${niche}`,
    `City/region: ${input.cityState || 'unknown'}`,
    ``,
    `## Recipient`,
    hasBusiness
      ? `Business name: ${input.businessName}`
      : `Business name: UNKNOWN. Open with a generic greeting such as "Hi there," — do NOT use any placeholder/merge token and do NOT invent a business name.`,
    input.decisionMakerName
      ? `Key decision maker: ${input.decisionMakerName}${input.decisionMakerRole ? `, ${input.decisionMakerRole}` : ''}. Address them by name in the greeting.`
      : hasBusiness
        ? `Decision maker: Unknown. Greet the business by its real name (e.g. "Hi ${input.businessName} team,").`
        : `Decision maker: Unknown. Use "Hi there," as the greeting — do NOT use any placeholder/merge token.`,
    `Website intel: ${websiteSummary}`,
    input.painPoints ? `Pain points: ${input.painPoints}` : '',
    ``,
    `## Constraints`,
    `- This is a DOMAIN-FOR-SALE pitch. Lead with the domain "${input.geoDomain}" and why it fits ${niche}${input.cityState ? ` in ${input.cityState}` : ''}.`,
    `- Tone: ${input.tone}. Variant: ${input.variant}. Language: ${input.language}.`,
    `- Subject line: <= 60 characters, no emoji, no ALL CAPS, no clickbait.`,
    `- Preview text: <= 90 characters.`,
    `- Body: 80-140 words. Plain text, no HTML.`,
    `- Do NOT invent specifics about the recipient. Do NOT use curly-brace placeholders anywhere except the two sign-off tokens named below.`,
    `- Avoid spammy phrases: "guaranteed", "act now", "limited time", "risk-free", excessive "!".`,
    `- Include exactly one clear single-step CTA (e.g., "Would it be worth a quick look at the details?").`,
    senderName
      ? `- Sign the email as "${senderName}".`
      : `- Sign with literal token "{{senderName}}" (do NOT invent a sender name).`,
    `- Do NOT include an unsubscribe line or footer; end after the signature.`,
    `- Follow-ups: produce 3 short follow-ups (40-80 words each), no unsubscribe line.`,
    `- abSubjects: produce 3 alternative subject lines that vary the angle but stay <=60 chars.`,
    ``,
    `## Output`,
    `Return STRICT JSON only, matching this schema exactly:`,
    `{"subjectLine":"string","previewText":"string","body":"string","followUps":["string","string","string"],"abSubjects":["string","string","string"]}`,
  ].filter(Boolean).join('\n');

  const content = await nvidiaChat(
    [
      {
        role: 'system',
        content:
          'You are a careful B2B copywriter. You only state facts present in the input. You never invent details. You keep emails short, specific, and compliant with anti-spam laws. You always respond with strict JSON and nothing else.',
      },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.5, maxTokens: 4096, timeoutMs: 30000, userId: input.userId }
  );
  const parsed = extractJson<any>(content);

  const fallback = localGenerate(input, intel);
  const capChars = (s: string, n: number) => s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;

  return {
    subjectLine: capChars(String(parsed.subjectLine || `${input.geoDomain} for ${input.businessName}`), 70),
    previewText: capChars(String(parsed.previewText || 'A relevant domain idea for your local market.'), 100),
    body: String(parsed.body || fallback.body),
    followUps: Array.isArray(parsed.followUps) ? parsed.followUps.map(String).slice(0, 3) : fallback.followUps,
    abSubjects: (Array.isArray(parsed.abSubjects) ? parsed.abSubjects.map(String).slice(0, 4) : fallback.abSubjects).map((s: string) => capChars(s, 70)),
  };
}

function buildContextLine(intel: WebsiteIntel, niche: string, cityState?: string) {
  if (intel.sourceStatus === 'SCRAPED') {
    const service = intel.services[0] ? ` and highlights ${intel.services[0]}` : '';
    const slogan = intel.slogans[0] ? ` with the message "${intel.slogans[0]}"` : '';
    return `your website positions you around ${niche}${service}${slogan}`;
  }

  return `your business appears focused on ${niche}${cityState ? ` in ${cityState}` : ''}`;
}

function toneToLine(tone: string) {
  if (tone === 'friendly') return 'No pressure at all.';
  if (tone === 'persuasive') return 'The reason I am reaching out is practical.';
  if (tone === 'concise') return 'Keeping this brief.';
  return 'I am reaching out with a practical idea.';
}
