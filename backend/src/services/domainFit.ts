export interface DomainFitInput {
  businessName: string;
  currentDomain: string | null;
  targetDomain: string;
  location: string | null;
  category: string | null;
}

export function scoreDomainFit(input: DomainFitInput): number {
  let score = 0;

  const bizLower = input.businessName.toLowerCase();
  const targetLower = input.targetDomain.toLowerCase().replace(/^www\./, '');
  const targetName = targetLower.replace(/\.[a-z]+$/, '').replace(/[^a-z0-9]/g, '');
  const currentDomain = (input.currentDomain || '').toLowerCase().replace(/^www\./, '');
  const currentName = currentDomain.replace(/\.[a-z]+$/, '').replace(/[^a-z0-9]/g, '');

  // 1. Exact match — domain equals or contains business name keywords
  const bizTokens = bizLower
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 2 && !['the', 'llc', 'inc', 'co', 'ltd', 'and', 'for', 'of'].includes(t));

  const matchCount = bizTokens.filter(token => targetName.includes(token)).length;
  if (matchCount >= 3) {
    score += 40;
  } else if (matchCount === 2) {
    score += 30;
  } else if (matchCount === 1) {
    score += 15;
  }

  // 2. Target domain has matching category/niche keywords
  if (input.category) {
    const catTokens = input.category.toLowerCase().split(/[\s,]+/).filter(t => t.length > 2);
    const nicheMatch = catTokens.filter(token => targetName.includes(token)).length;
    if (nicheMatch >= 1) {
      score += 25;
    }
  }

  // 3. Geo match — location appears in target domain
  if (input.location && targetLower) {
    const locationParts = input.location.toLowerCase().split(/[\s,]+/);
    const locationYears = ['texas', 'tx', 'florida', 'fl', 'california', 'ca', 'miami',
      'dallas', 'houston', 'austin', 'london', 'newyork', 'nyc', 'chicago', 'la'];
    for (const part of locationParts) {
      const clean = part.replace(/[^a-z]/g, '');
      if (clean.length > 2 && (targetLower.includes(clean) || locationYears.includes(clean))) {
        score += 20;
        break;
      }
    }
  }

  // 4. Target is .com
  if (targetLower.endsWith('.com')) {
    score += 15;
  }

  // 5. Target is shorter than current domain (upgrade)
  if (currentName && targetName && targetName.length < currentName.length) {
    score += 10;
    if (currentName.length - targetName.length >= 5) score += 10;
  }

  // 6. Short and brandable (< 15 chars)
  if (targetName.length <= 12) {
    score += 10;
  } else if (targetName.length <= 18) {
    score += 5;
  }

  // 7. Penalty if target is longer or worse than current
  if (currentDomain && currentDomain.endsWith('.com') && !targetLower.endsWith('.com')) {
    score = Math.max(0, score - 15);
  }

  return Math.min(100, Math.max(0, score));
}

export function getDomainFitLabel(score: number): string {
  if (score >= 80) return 'Excellent Fit';
  if (score >= 60) return 'Strong Fit';
  if (score >= 40) return 'Moderate Fit';
  if (score >= 20) return 'Weak Fit';
  return 'Poor Fit';
}
