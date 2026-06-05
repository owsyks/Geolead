const AD_KEYWORDS = /\b(sponsored|ad|advertisement|promoted|google\s*ads)\b/i;
const WEAK_BRANDING = /\b(services?|solutions?|llc|inc|co\b|ltd|corporation|group|consulting|consultants?|pros?)\b/i;

export interface BuyerIntentInput {
  businessName: string;
  currentDomain: string | null;
  targetDomain: string;
  category: string | null;
  location: string | null;
  websiteText: string;
  domainMatchScore: number;
}

export function analyzeBuyerIntent(input: BuyerIntentInput): number {
  let score = 0;

  // 1. Weak branding — current domain doesn't match business name well
  const bizName = input.businessName.toLowerCase();
  const currentDomain = (input.currentDomain || '').toLowerCase().replace(/^www\./, '');
  const domainName = currentDomain.replace(/\.[a-z]+$/, '').replace(/[^a-z0-9]/g, '');
  const bizSlug = bizName.replace(/[^a-z0-9]/g, '');

  // Check if domain is a poor match for the business name
  if (domainName && !bizSlug.includes(domainName.slice(0, 6))) {
    score += 25;
  }

  // Check for weak branding signals in business name
  if (WEAK_BRANDING.test(input.businessName)) {
    score += 10;
  }

  // 2. Long current domain (>15 chars for the SLD)
  if (domainName.length > 15) {
    score += 15;
  } else if (domainName.length > 20) {
    score += 20;
  }

  // 3. Non-.com TLD
  if (currentDomain && !currentDomain.endsWith('.com')) {
    score += 15;
  }

  // 4. Geo relevance — business location appears in target domain
  if (input.location && input.targetDomain) {
    const locationParts = input.location.toLowerCase().split(/[\s,]+/);
    const targetLower = input.targetDomain.toLowerCase();
    const geoMatch = locationParts.some(part =>
      part.length > 2 && targetLower.includes(part)
    );
    if (geoMatch) score += 20;
  }

  // 5. Industry competitiveness
  if (input.category) {
    const competitive = ['real estate', 'roofing', 'plumbing', 'dental', 'lawyer',
      'attorney', 'car', 'auto', 'restaurant', 'contractor', 'construction',
      'insurance', 'mortgage', 'finance', 'medical', 'healthcare'];
    const cat = input.category.toLowerCase();
    if (competitive.some(c => cat.includes(c))) {
      score += 10;
    }
  }

  // 6. Low domainMatchScore means AI thinks this business needs a better domain
  if (input.domainMatchScore >= 70) {
    score += 15;
  } else if (input.domainMatchScore >= 50) {
    score += 10;
  }

  // 7. Has contact page / active website signal
  if (input.websiteText.length > 200) {
    if (AD_KEYWORDS.test(input.websiteText)) {
      score += 5;
    }
  }

  // 8. Short domain name means available / weak current presence
  if (domainName && domainName.length <= 8) {
    score += 5;
  }

  return Math.min(100, Math.max(0, score));
}

export function getBuyerIntentLabel(score: number): string {
  if (score >= 80) return 'Very High';
  if (score >= 65) return 'High';
  if (score >= 45) return 'Moderate';
  if (score >= 25) return 'Low';
  return 'Very Low';
}
