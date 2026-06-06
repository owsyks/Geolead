import { searchGoogle } from './serper.js';

export interface LinkedInVerification {
  profileUrl: string | null;
  verifiedName: string | null;
  verifiedTitle: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  source: string;
}

const LINKEDIN_CACHE = new Map<string, LinkedInVerification>();

export async function verifyDecisionMakerViaLinkedIn(
  businessName: string,
  dmName: string | null,
  dmRole: string | null,
): Promise<LinkedInVerification> {
  if (!dmName) return { profileUrl: null, verifiedName: null, verifiedTitle: null, confidence: 'none', source: 'no-dm' };

  const cacheKey = `${businessName}|${dmName}`.toLowerCase();
  const cached = LINKEDIN_CACHE.get(cacheKey);
  if (cached) return cached;

  const result: LinkedInVerification = {
    profileUrl: null, verifiedName: null, verifiedTitle: null, confidence: 'low', source: 'search',
  };

  try {
    // Search: "John Smith CEO Texas Auto Vendor linkedin"
    const query = `${dmName} ${dmRole || ''} ${businessName} linkedin`.replace(/\s+/g, ' ').trim();
    const results = await searchGoogle(query);

    let bestMatch: { url: string; title: string; snippet: string } | null = null;

    for (const r of results) {
      const link = r.link.toLowerCase();
      const title = (r.title || '').toLowerCase();
      const snippet = (r.snippet || '').toLowerCase();

      // Must be a LinkedIn profile URL
      if (!link.includes('linkedin.com/in/')) continue;

      // Check if the person's name appears in the title or snippet
      const nameParts = dmName.toLowerCase().split(/\s+/);
      const nameMatch = nameParts.every(p => title.includes(p) || snippet.includes(p));

      if (nameMatch) {
        bestMatch = { url: r.link, title: r.title || '', snippet: r.snippet || '' };
        break;
      }

      // Weaker match: at least first name + last name initial
      if (!bestMatch && nameParts.length >= 2) {
        const firstName = nameParts[0];
        const lastNameFirst = nameParts[nameParts.length - 1][0];
        if (title.includes(firstName) && title.includes(lastNameFirst)) {
          bestMatch = { url: r.link, title: r.title || '', snippet: r.snippet || '' };
        }
      }
    }

    if (bestMatch) {
      result.profileUrl = bestMatch.url;
      result.confidence = 'high';

      // Extract title from snippet
      const titleMatch = bestMatch.snippet.match(/(?:at|@|\||,)\s*([^·\n|]{5,60})/i);
      if (titleMatch) {
        result.verifiedTitle = titleMatch[1].trim();
      }

      // Verify name from title
      const nameInTitle = bestMatch.title.toLowerCase().replace(/\|.*/, '').replace('linkedin', '').trim();
      if (nameInTitle.length > 3) {
        result.verifiedName = nameInTitle.replace(/\b\w/g, c => c.toUpperCase());
      }

      // Check if role matches
      if (result.verifiedTitle && dmRole) {
        const roleLower = dmRole.toLowerCase();
        const titleLower = result.verifiedTitle.toLowerCase();
        if (titleLower.includes(roleLower) || roleLower.split(/\s+/).some(w => titleLower.includes(w))) {
          result.confidence = 'high';
        } else {
          result.confidence = 'medium';
        }
      }
    }

    // Fallback: search just the name + linkedin
    if (!bestMatch) {
      const fallbackQuery = `${dmName} linkedin "CEO OR Founder OR Owner"`;
      const fallbackResults = await searchGoogle(fallbackQuery, { num: 3 });
      for (const r of fallbackResults) {
        if (r.link.toLowerCase().includes('linkedin.com/in/')) {
          result.profileUrl = r.link;
          result.confidence = 'medium';
          break;
        }
      }
    }
  } catch {
    // Google search non-critical
  }

  LINKEDIN_CACHE.set(cacheKey, result);
  return result;
}

export function wasLinkedInVerified(verification: LinkedInVerification): boolean {
  return verification.confidence === 'high' || verification.confidence === 'medium';
}
