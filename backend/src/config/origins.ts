// First-party browser deployments. Environment values remain the primary
// configuration, while the production Vercel app is explicitly trusted so the
// API and CSRF/origin guard cannot drift apart.
const FIRST_PARTY_ORIGINS = ['https://geoai-ashen.vercel.app'];

export function browserOrigins(): string[] {
  return [...new Set([
    process.env.FRONTEND_URL,
    ...(process.env.CORS_ORIGIN || '').split(','),
    ...FIRST_PARTY_ORIGINS,
  ].filter(Boolean).map((value) => String(value).trim().replace(/\/+$/, '')))];
}
