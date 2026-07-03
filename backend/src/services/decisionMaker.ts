import { getNvidiaKey, nvidiaChat } from './aiProvider.js';

export interface DecisionMakerResult {
  name: string | null;
  role: string | null;
  score: number | null;
  email: string | null;
  source: string;
}

const ROLE_SCORES: Record<string, number> = {
  'ceo': 100,
  'chief executive officer': 100,
  'founder': 100,
  'owner': 100,
  'president': 100,
  'co-founder': 95,
  'cofounder': 95,
  'managing director': 95,
  'cmo': 85,
  'chief marketing officer': 85,
  'marketing director': 85,
  'head of sales': 85,
  'sales director': 85,
  'business development director': 85,
  'vp sales': 85,
  'manager': 70,
  'general manager': 70,
  'employee': 40,
};

const ROLE_KEYWORDS: Record<string, RegExp> = {
  'ceo': /\bceo\b|chief\s*executive/i,
  'founder': /\bfounder\b|\bfounded\b/i,
  'owner': /\bowner\b/i,
  'president': /\bpresident\b/i,
  'co-founder': /\bco-?founder\b/i,
  'managing director': /\bmanaging\s*director\b/i,
  'cmo': /\bcmo\b|chief\s*marketing\s*officer/i,
  'marketing director': /\bmarketing\s*(director|head|lead)\b/i,
  'head of sales': /\b(head\s*of\s*sales|sales\s*(director|head|lead|vp))\b/i,
  'manager': /\b(manager|director|head\s*of)\b/i,
};

export function scoreRole(role: string | null): number {
  if (!role) return 0;
  const lower = role.toLowerCase();
  for (const [normalized, score] of Object.entries(ROLE_SCORES)) {
    const pattern = ROLE_KEYWORDS[normalized];
    if (pattern && pattern.test(lower)) return score;
  }
  return 40;
}

export function normalizeRole(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (/\bceo\b/.test(lower) || /chief\s*executive/i.test(lower)) return 'CEO';
  if (/\bfounder\b/.test(lower)) return 'Founder';
  if (/\bowner\b/.test(lower)) return 'Owner';
  if (/\bpresident\b/i.test(lower)) return 'President';
  if (/\bco-?founder\b/.test(lower)) return 'Co-Founder';
  if (/\bmanaging\s*director\b/.test(lower)) return 'Managing Director';
  if (/\bcmo\b/.test(lower) || /chief\s*marketing\s*officer/i.test(lower)) return 'CMO';
  if (/\bmarketing\s*(director|head|lead)\b/.test(lower)) return 'Marketing Director';
  if (/\bsales\s*(director|head|lead|vp)\b/.test(lower) || /head\s*of\s*sales\b/.test(lower)) return 'Head of Sales';
  if (/\b(manager|director)\b/.test(lower)) return 'Manager';
  const words = lower.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return words;
}

export function discoverFromPageText(text: string): { name: string | null; role: string | null; email: string | null } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Pattern 1: "CEO & Founder" or "President / CEO"
  const titleRolePattern = /(Founder|CEO|President|Owner|Director)\s*[&/,]?\s*(CEO|Founder|President|Owner|Co-Founder)/i;
  for (const line of lines) {
    if (line.length > 5 && line.length < 100 && titleRolePattern.test(line)) {
      const name = line.split(/[&\n/,]/)[0]?.trim();
      if (name && name.length < 50 && !name.includes('@') && !name.includes('http')) {
        const role = line.replace(name, '').replace(/^[&\s,/-]+/, '').trim();
        return { name: name.replace(/\s+/g, ' ').trim(), role: normalizeRole(role), email: null };
      }
    }
  }

  // Pattern 2: Name - Title (e.g. "John Smith - CEO" or "John Smith | CEO")
  for (const line of lines) {
    const match = line.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3})\s*[-–—|]\s*(.+)$/);
    if (match) {
      const name = match[1].trim();
      const role = match[2].trim();
      if (name.length < 50 && role.length < 80 && name.split(/\s+/).length >= 2) {
        return { name, role: normalizeRole(role), email: null };
      }
    }
  }

  // Pattern 3: Title: Name (e.g. "CEO: John Smith")
  for (const line of lines) {
    const match = line.match(/^(CEO|Founder|President|Owner|Director|Co-Founder)\s*[:]\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3})$/i);
    if (match) {
      return { name: match[2].trim(), role: normalizeRole(match[1]), email: null };
    }
  }

  // Pattern 4: Look for <title> tag content which often has "CEO" in it
  for (const line of lines) {
    const match = line.match(/<title>([^<]*)<\/title>/i);
    if (match) {
      const title = match[1];
      const ceoTitle = title.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3})\s*[-–—|]\s*(CEO|Founder|President|Owner)/i);
      if (ceoTitle) {
        return { name: ceoTitle[1].trim(), role: normalizeRole(ceoTitle[2]), email: null };
      }
    }
  }

  // Pattern 5: Find email with role prefix
  const emailMatch = text.match(/(ceo|founder|owner|president|info|contact)\s*[@\[\(]\s*([a-z0-9.-]+\.[a-z]{2,})/i);
  if (emailMatch) {
    const email = `${emailMatch[1].toLowerCase()}@${emailMatch[2].toLowerCase()}`;
    const role = normalizeRole(emailMatch[1]);
    return { name: null, role, email };
  }

  return { name: null, role: null, email: null };
}

async function discoverWithAi(
  businessName: string,
  pageTexts: string[],
  userId?: string | null,
): Promise<{ name: string | null; role: string | null; email: string | null }> {
  const key = await getNvidiaKey(userId);
  if (!key) return { name: null, role: null, email: null };

  const pages = pageTexts.map((t, i) => `--- Page ${i + 1} ---\n${t.slice(0, 2000)}`).join('\n\n');

  const prompt = `Business: ${businessName}
Website pages:
${pages}

Find the most senior decision maker (CEO, Founder, President, Owner, etc.).
Return ONLY valid JSON with these fields (all nullable):
{
  "name": "Full Name or null",
  "role": "Job Title or null",
  "email": "Email if found or null"
}`;

  try {
    const raw = await nvidiaChat(
      [{ role: 'user', content: prompt }],
      { maxTokens: 200, temperature: 0.1, timeoutMs: 15000, userId }
    );
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { name: null, role: null, email: null };
    const parsed = JSON.parse(match[0]);
    return {
      name: parsed.name || null,
      role: parsed.role ? normalizeRole(parsed.role) : null,
      email: parsed.email || null,
    };
  } catch {
    return { name: null, role: null, email: null };
  }
}

export async function discoverDecisionMaker(
  businessName: string,
  website: string | null,
  crawlTexts: string[],
  staffNames: string[],
  userId?: string | null,
): Promise<DecisionMakerResult> {
  const fullText = crawlTexts.join('\n');

  // Run heuristic + AI in parallel, pick best result
  const [heuristicResult, aiResult] = await Promise.all([
    (async (): Promise<DecisionMakerResult> => {
      // From team/staff names already extracted
      if (staffNames.length > 0) {
        for (const staffName of staffNames) {
          const nameLines = fullText.split('\n').filter(l => l.toLowerCase().includes(staffName.toLowerCase()));
          for (const line of nameLines) {
            const roleMatch = line.match(new RegExp(`${staffName}\\s*[-–—|,]+\\s*(.+)`, 'i'));
            if (roleMatch) {
              const role = roleMatch[1].trim();
              return { name: staffName, role: normalizeRole(role), score: scoreRole(role), email: null, source: 'team-page' };
            }
          }
        }
        return { name: staffNames[0], role: null, score: null, email: null, source: 'team-page' };
      }

      // Pattern matching
      const found = discoverFromPageText(fullText);
      if (found.name || found.role) {
        return { name: found.name, role: found.role, score: scoreRole(found.role), email: found.email, source: 'page-pattern' };
      }
      return { name: null, role: null, score: null, email: null, source: 'none' };
    })(),
    (async (): Promise<DecisionMakerResult> => {
      if (crawlTexts.length === 0) return { name: null, role: null, score: null, email: null, source: 'none' };
      const ai = await discoverWithAi(businessName, crawlTexts, userId);
      if (ai.name || ai.role) {
        return { name: ai.name, role: ai.role, score: scoreRole(ai.role), email: ai.email, source: 'ai' };
      }
      return { name: null, role: null, score: null, email: null, source: 'none' };
    })(),
  ]);

  // Pick best: heuristic has a name AND a role → use it. Otherwise prefer AI if it found something.
  if (heuristicResult.name && heuristicResult.role) return heuristicResult;
  if (aiResult.name) return aiResult;
  if (heuristicResult.name) return heuristicResult;
  return { name: null, role: null, score: null, email: null, source: 'none' };
}
