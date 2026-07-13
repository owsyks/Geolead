// Contact Intelligence Module
// Scores every lead across four outreach channels (Email, WhatsApp, Phone,
// Website Form) using heuristic signals derived from the lead's existing
// data — no external API calls, runs synchronously during lead creation.
//
// WhatsApp score components (sum = 0–100):
//   Phone Validity      0–20
//   Mobile Confidence   0–20
//   Business Activity   0–20
//   Country WA Usage    0–15
//   Industry WA Usage   0–15
//   Digital Presence    0–10

export type WaConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type ContactChannel = 'EMAIL' | 'WHATSAPP' | 'PHONE' | 'WEBSITE_FORM';

export interface ChannelScores {
  email: number;
  whatsapp: number;
  phone: number;
  websiteForm: number;
}

export interface ContactIntelligenceResult {
  whatsappScore: number;
  whatsappConfidence: WaConfidence;
  bestContactChannel: ContactChannel;
  channelScores: ChannelScores;
  recommendation: string;
}

export interface CIInput {
  businessName: string;
  website?: string | null;
  location?: string | null;
  googleMapsLink?: string | null;
  category?: string | null;
  phoneNumbers: string[];
  socialLinks: string[];
  hasValidEmail: boolean;
  hasAnyEmail: boolean;
}

export interface PhoneSignalValidation {
  original: string;
  normalized: string | null;
  structurallyValid: boolean;
  reason: string;
}

/**
 * Self-hosted, deterministic phone analysis. It intentionally does not probe
 * WhatsApp accounts or imply account existence; it validates only safe signals
 * the platform already owns.
 */
export function validatePhoneSignals(phone: string): PhoneSignalValidation {
  const original = String(phone || '').trim();
  const hadPlus = original.startsWith('+');
  const digits = original.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    return { original, normalized: null, structurallyValid: false, reason: 'Phone length is outside E.164 limits.' };
  }
  if (/^(\d)\1+$/.test(digits) || /^0+$/.test(digits)) {
    return { original, normalized: null, structurallyValid: false, reason: 'Phone contains a repeated placeholder pattern.' };
  }
  const normalizedDigits = !hadPlus && digits.length === 10 ? `1${digits}` : digits;
  if (normalizedDigits.length > 15 || normalizedDigits.startsWith('0')) {
    return { original, normalized: null, structurallyValid: false, reason: 'Phone cannot be normalized to E.164.' };
  }
  return { original, normalized: `+${normalizedDigits}`, structurallyValid: true, reason: 'Structurally valid phone signal.' };
}

// ─── Country WhatsApp adoption map ───────────────────────────────────────────

const HIGH_WA_KEYWORDS = [
  'brazil', 'brasil', 'india', 'mexico', 'mexico', 'nigeria', 'south africa',
  'indonesia', 'uae', 'dubai', 'saudi', 'pakistan', 'argentina', 'colombia',
  'venezuela', 'kenya', 'ghana', 'egypt', 'turkey', 'italy', 'spain', 'portugal',
  'netherlands', 'germany', 'france', 'uk', 'london', 'manchester',
];
const MED_WA_KEYWORDS = ['canada', 'australia', 'singapore', 'philippines', 'malaysia'];

function countryWaScore(location: string | null | undefined): number {
  if (!location) return 7;
  const loc = location.toLowerCase();
  if (HIGH_WA_KEYWORDS.some(k => loc.includes(k))) return 13;
  if (MED_WA_KEYWORDS.some(k => loc.includes(k))) return 10;
  return 7; // US / unknown
}

// ─── Industry WhatsApp likelihood ────────────────────────────────────────────

const INDUSTRY_WA: Array<[string[], number]> = [
  [['real estate', 'realtor', 'realty', 'property', 'homes'], 13],
  [['car', 'auto', 'vehicle', 'dealer', 'motor'], 12],
  [['restaurant', 'food', 'pizza', 'cafe', 'dining', 'kitchen', 'grill', 'bar'], 12],
  [['salon', 'hair', 'beauty', 'spa', 'barber', 'nail'], 12],
  [['repair', 'plumb', 'roofing', 'hvac', 'electric', 'handyman', 'contractor'], 11],
  [['fitness', 'gym', 'yoga', 'pilates', 'crossfit'], 11],
  [['retail', 'shop', 'store', 'market', 'boutique'], 11],
  [['construction', 'builder', 'remodel'], 10],
  [['clean', 'maid', 'janitorial', 'pest'], 10],
  [['healthcare', 'dental', 'doctor', 'clinic', 'chiro', 'medical', 'vet'], 9],
  [['moving', 'mover', 'storage', 'logistics'], 9],
  [['legal', 'attorney', 'lawyer', 'law firm'], 6],
  [['accounting', 'cpa', 'tax', 'bookkeep', 'finance', 'insurance'], 6],
  [['tech', 'software', 'it service', 'developer'], 7],
];

function industryWaScore(category: string | null | undefined): number {
  if (!category) return 8;
  const cat = category.toLowerCase();
  for (const [keywords, score] of INDUSTRY_WA) {
    if (keywords.some(k => cat.includes(k))) return score;
  }
  return 8;
}

// Same industry list but for mobile-phone likelihood (component 2)
function industryMobileScore(category: string | null | undefined): number {
  if (!category) return 10;
  const cat = category.toLowerCase();
  const highMobile = ['repair', 'plumb', 'roofing', 'hvac', 'electric', 'handyman',
    'car', 'auto', 'salon', 'beauty', 'clean', 'mover', 'moving', 'food', 'restaurant',
    'contractor', 'construction', 'pest', 'lawn', 'landscap'];
  const lowMobile = ['law', 'legal', 'attorney', 'accounting', 'finance', 'insurance',
    'software', 'tech', 'it service'];
  if (highMobile.some(k => cat.includes(k))) return 15;
  if (lowMobile.some(k => cat.includes(k))) return 6;
  return 10;
}

// ─── Phone validity scoring ───────────────────────────────────────────────────

function phoneValidityScore(phones: string[]): number {
  if (phones.length === 0) return 0;
  const validation = validatePhoneSignals(phones[0]);
  if (!validation.structurallyValid) return 0;
  return phones[0].trim().startsWith('+') ? 20 : 17;
}

// ─── Main scorer ──────────────────────────────────────────────────────────────

export function scoreContactIntelligence(input: CIInput): ContactIntelligenceResult {
  const { phoneNumbers, socialLinks, website, location, category, googleMapsLink, hasValidEmail, hasAnyEmail } = input;

  // 1. Phone validity (0-20)
  const phoneValidity = phoneValidityScore(phoneNumbers);

  // 2. Mobile confidence (0-20)
  let mobileConf = 0;
  if (phoneNumbers.length > 0) {
    mobileConf = Math.min(20, industryMobileScore(category) + (googleMapsLink ? 3 : 0) + (!website ? 2 : 0));
  }

  // 3. Business activity (0-20)
  let bizActivity = 0;
  if (website) bizActivity += 8;
  if (googleMapsLink) bizActivity += 7;
  if (hasAnyEmail) bizActivity += 5;
  if (socialLinks.length > 0) bizActivity += 4;
  bizActivity = Math.min(20, bizActivity);

  // 4. Country WhatsApp usage (0-15)
  const countryWa = countryWaScore(location);

  // 5. Industry WhatsApp usage (0-15)
  const industryWa = industryWaScore(category);

  // 6. Digital presence (0-10)
  let digitalPresence = 0;
  if (website) digitalPresence += 4;
  if (socialLinks.length > 0) digitalPresence += 3;
  if (hasAnyEmail) digitalPresence += 3;
  digitalPresence = Math.min(10, digitalPresence);

  const whatsappScore = Math.min(100, phoneValidity + mobileConf + bizActivity + countryWa + industryWa + digitalPresence);

  const whatsappConfidence: WaConfidence =
    whatsappScore >= 70 ? 'HIGH' :
    whatsappScore >= 45 ? 'MEDIUM' : 'LOW';

  // ─── Other channel scores ──────────────────────────────────────────────────

  const emailScore = hasValidEmail ? 90
    : hasAnyEmail ? 75
    : website ? 40
    : 10;

  const phoneScore = phoneNumbers.length === 0 ? 10
    : phoneNumbers.length >= 2 ? Math.min(85, phoneValidity + mobileConf + 10)
    : Math.min(80, phoneValidity + mobileConf);

  const websiteFormScore = !website ? 5
    : socialLinks.length > 0 ? 60
    : 45;

  const channelScores: ChannelScores = {
    email: emailScore,
    whatsapp: whatsappScore,
    phone: phoneScore,
    websiteForm: websiteFormScore,
  };

  // Best channel: highest score; tiebreak EMAIL > WHATSAPP > PHONE > WEBSITE_FORM
  const ranked: [ContactChannel, number][] = [
    ['EMAIL', emailScore],
    ['WHATSAPP', whatsappScore],
    ['PHONE', phoneScore],
    ['WEBSITE_FORM', websiteFormScore],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  const bestContactChannel = ranked[0][0];

  const recommendation =
    bestContactChannel === 'WHATSAPP' && whatsappScore >= 70 ? 'USE_WHATSAPP_FIRST' :
    bestContactChannel === 'WHATSAPP' ? 'TRY_WHATSAPP' :
    bestContactChannel === 'EMAIL' ? 'USE_EMAIL_FIRST' :
    bestContactChannel === 'PHONE' ? 'CALL_FIRST' :
    'USE_WEBSITE_FORM';

  return { whatsappScore, whatsappConfidence, bestContactChannel, channelScores, recommendation };
}
