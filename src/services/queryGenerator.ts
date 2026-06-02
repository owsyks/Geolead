/**
 * Generates search query variations based on keyword, country, and city/state.
 */
export function generateQueryVariations(
  keyword: string,
  country?: string,
  cityState?: string,
  targetLeadCount = 10
): string[] {
  const variations: Set<string> = new Set();
  const phraseSeeds: Set<string> = new Set();

  const baseKeyword = normalizePhrase(keyword);
  const locationVariants = getLocationVariants(country, cityState);
  const desiredQueryCount = Math.min(64, Math.max(8, Math.ceil(targetLeadCount / 2)));

  phraseSeeds.add(baseKeyword);
  
  // Helper to expand synonyms
  const synonymMap: { [key: string]: string[] } = {
    vendor: ['dealer', 'dealership', 'sales', 'shop', 'store', 'marketplace', 'distributor'],
    clinic: ['office', 'center', 'care', 'practice', 'services', 'doctor'],
    handyman: [
      'handyman services',
      'home repair',
      'home improvement',
      'property maintenance',
      'general contractor',
      'home repair service',
      'fix it service',
      'home services',
      'maintenance company',
      'repairman',
      'odd jobs',
    ],
    roofing: ['roofer', 'roof contractor', 'roof repair', 'roofing company', 'roof services'],
    realestate: ['real estate', 'realtor', 'property agency', 'homes for sale', 'housing market'],
    dentist: ['dental clinic', 'dental office', 'dentistry', 'orthodontist'],
    lawyer: ['law firm', 'attorney', 'legal services', 'counsel'],
    plumber: ['plumbing services', 'plumber repair', 'drain cleaning', 'emergency plumber'],
    electrician: ['electrical contractor', 'electrical repair', 'electric service', 'licensed electrician'],
    contractor: ['contracting company', 'general contractor', 'construction services', 'home services'],
    repair: ['repairs', 'maintenance', 'fixing service', 'service company'],
    restaurant: ['diner', 'cafe', 'bistro', 'eatery', 'food delivery'],
    hotel: ['motel', 'inn', 'resort', 'lodging', 'accommodation']
  };

  // Find if any key in synonymMap is part of the keyword
  let expanded = false;
  for (const [key, synonyms] of Object.entries(synonymMap)) {
    if (baseKeyword.includes(key)) {
      expanded = true;
      synonyms.forEach(syn => {
        const variation = baseKeyword.replace(new RegExp(key, 'g'), syn);
        phraseSeeds.add(normalizePhrase(variation));
      });
    }
  }

  // Generic expansions if no specific synonym matched
  if (!expanded) {
    phraseSeeds.add(`${baseKeyword} company`);
    phraseSeeds.add(`${baseKeyword} services`);
    phraseSeeds.add(`${baseKeyword} local business`);
    phraseSeeds.add(`${baseKeyword} contractors`);
  }

  const intentModifiers = [
    '',
    'company',
    'services',
    'business',
    'local business',
    'near me',
    'best',
    'top rated',
    'licensed',
    'insured',
    'professional',
    'contractors',
    'nearby',
    'available',
    'free estimate',
  ];

  const phrases = Array.from(phraseSeeds);
  for (const modifier of intentModifiers) {
    for (const phrase of phrases) {
      const seed = normalizePhrase(modifier ? `${phrase} ${modifier}` : phrase);
      addLocalizedQueryVariations(variations, seed, locationVariants);

      if (variations.size >= desiredQueryCount) {
        return Array.from(variations).slice(0, desiredQueryCount);
      }
    }
  }

  return Array.from(variations).slice(0, desiredQueryCount);
}

function addLocalizedQueryVariations(variations: Set<string>, query: string, locationVariants: string[]): void {
  if (locationVariants.length === 0 || locationVariants.some((loc) => query.includes(loc))) {
    variations.add(query);
    return;
  }

  const statefulLocation = locationVariants.find((loc) => /\b[a-z]{2}\b$/.test(loc) || loc.includes(',')) || locationVariants[0];
  const cityOnly = locationVariants.find((loc) => !loc.includes(',') && loc.split(/\s+/).length === 1);
  const secondaryLocation = cityOnly && cityOnly !== statefulLocation ? cityOnly : undefined;
  const selectedLocations = [statefulLocation, secondaryLocation].filter(Boolean) as string[];

  selectedLocations.forEach((loc) => {
    variations.add(`${query} ${loc}`);
    variations.add(`${query} in ${loc}`);
    variations.add(`${loc} ${query}`);
  });

  variations.add(`${query} near ${statefulLocation}`);
}

function normalizePhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getLocationVariants(country?: string, cityState?: string): string[] {
  const variants = new Set<string>();
  const cityStateValue = normalizePhrase(cityState || '');
  const countryValue = normalizePhrase(country || '');

  if (cityStateValue) {
    variants.add(cityStateValue);

    const noComma = cityStateValue.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if (noComma) variants.add(noComma);

    const cityOnly = cityStateValue.split(',')[0]?.trim();
    if (cityOnly) variants.add(cityOnly);
  }

  if (countryValue && variants.size === 0) {
    variants.add(countryValue);
  }

  return Array.from(variants).filter(Boolean);
}
