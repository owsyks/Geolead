// Settings service. Backs the Settings page: a registry of every user-editable
// configuration value, persisted in the Setting table. Secret values are stored
// encrypted. The effective runtime value is `DB value ?? process.env[envKey]`,
// so existing .env deployments keep working until a user overrides a key.
import axios from 'axios';
import prisma from '../config/db.js';
import { decryptSecret, encryptSecret, isEncrypted } from '../config/secrets.js';
import { connectSmtp } from './smtpTransport.js';

export interface SettingDefinition {
  key: string;
  label: string;
  category: 'ai' | 'discovery' | 'email' | 'inbound' | 'smtp' | 'branding';
  secret?: boolean;
  envKey?: string; // process.env fallback name
  placeholder?: string;
  hint?: string;
  hidden?: boolean; // resolved via env fallback but NOT shown on the Settings page
}

// The single source of truth for what the Settings page can edit. Add a row
// here and it appears in the API and UI automatically.
export const SETTING_DEFINITIONS: SettingDefinition[] = [
  // AI — tried in this order (see services/aiProvider.ts), each OpenAI-chat-
  // completions-compatible. Falls back to local templates/heuristics if every
  // provider below is unconfigured or unavailable.
  { key: 'nvidiaApiKey', label: 'NVIDIA API key', category: 'ai', secret: true, envKey: 'NVIDIA_API_KEY', placeholder: 'nvapi-…', hint: 'Tried first if set. Powers AI email generation and lead scoring via integrate.api.nvidia.com.' },
  { key: 'nvidiaModel', label: 'NVIDIA model', category: 'ai', envKey: 'NVIDIA_MODEL', placeholder: 'moonshotai/kimi-k2.6', hint: 'Model id on NVIDIA NIM. Defaults to moonshotai/kimi-k2.6.' },
  { key: 'groqApiKey', label: 'Groq API key', category: 'ai', secret: true, envKey: 'GROQ_API_KEY', placeholder: 'gsk_…', hint: 'Free tier, fastest inference. Tried after NVIDIA.' },
  { key: 'groqModel', label: 'Groq model', category: 'ai', envKey: 'GROQ_MODEL', placeholder: 'llama-3.1-8b-instant', hint: 'Defaults to llama-3.1-8b-instant (highest free daily request cap).' },
  { key: 'geminiApiKey', label: 'Google Gemini API key', category: 'ai', secret: true, envKey: 'GEMINI_API_KEY', placeholder: 'AIza…', hint: 'Free tier via the Gemini OpenAI-compatible endpoint. Highest free daily request cap + largest context.' },
  { key: 'geminiModel', label: 'Gemini model', category: 'ai', envKey: 'GEMINI_MODEL', placeholder: 'gemini-2.0-flash' },
  { key: 'opencodeApiKey', label: 'OpenCode Zen API key', category: 'ai', secret: true, envKey: 'OPENCODE_API_KEY', hint: 'Free DeepSeek V4 Flash model via OpenCode Zen. Note: prompts may be used to improve the model while it is in its free period.' },
  { key: 'opencodeModel', label: 'OpenCode Zen model', category: 'ai', envKey: 'OPENCODE_MODEL', placeholder: 'deepseek-v4-flash-free' },
  { key: 'cerebrasApiKey', label: 'Cerebras API key', category: 'ai', secret: true, envKey: 'CEREBRAS_API_KEY', hint: 'Free tier, highest daily token volume. Good backstop on high-traffic days.' },
  { key: 'cerebrasModel', label: 'Cerebras model', category: 'ai', envKey: 'CEREBRAS_MODEL', placeholder: 'llama3.1-8b' },
  { key: 'mistralApiKey', label: 'Mistral API key', category: 'ai', secret: true, envKey: 'MISTRAL_API_KEY', hint: 'Free "Experiment" tier, ~1B tokens/month, no card required.' },
  { key: 'mistralModel', label: 'Mistral model', category: 'ai', envKey: 'MISTRAL_MODEL', placeholder: 'mistral-small-latest' },
  { key: 'openrouterApiKey', label: 'OpenRouter API key', category: 'ai', secret: true, envKey: 'OPENROUTER_API_KEY', placeholder: 'sk-or-…', hint: 'Tried last — smallest free cap (50 req/day), routes to free models across many providers.' },
  { key: 'openrouterModel', label: 'OpenRouter model', category: 'ai', envKey: 'OPENROUTER_MODEL', placeholder: 'google/gemma-4-31b-it:free' },

  // Email (Resend)
  { key: 'resendApiKey', label: 'Resend API key', category: 'email', secret: true, envKey: 'RESEND_API_KEY', placeholder: 're_…', hint: 'Used to send outbound email via Resend.' },
  { key: 'resendFromEmail', label: 'Resend from email', category: 'email', envKey: 'RESEND_FROM_EMAIL', placeholder: 'you@yourdomain.com', hint: 'Verified sending address.' },
  { key: 'resendFromName', label: 'Resend from name', category: 'email', envKey: 'RESEND_FROM_NAME', placeholder: 'Your Name', hint: 'Display name on outbound email.' },
  { key: 'resendReplyTo', label: 'Reply-to address', category: 'email', envKey: 'RESEND_REPLY_TO', placeholder: 'replies@gmail.com', hint: 'Where recipient replies land.' },

  // Inbound
  { key: 'inboundWebhookSecret', label: 'Inbound webhook secret', category: 'inbound', secret: true, envKey: 'INBOUND_WEBHOOK_SECRET', placeholder: 'shared secret', hint: 'Validates POSTs to /api/outbound/inbound/resend (?secret=… or X-Inbound-Secret header).' },

  // SMTP defaults (reusable when creating an SMTP sender)
  { key: 'smtpHost', label: 'SMTP host', category: 'smtp', envKey: 'SMTP_HOST', placeholder: 'smtp.gmail.com' },
  { key: 'smtpPort', label: 'SMTP port', category: 'smtp', envKey: 'SMTP_PORT', placeholder: '587', hint: '587 (STARTTLS) or 465 (SSL).' },
  { key: 'smtpSecure', label: 'SMTP SSL (465)', category: 'smtp', envKey: 'SMTP_SECURE', placeholder: 'false', hint: 'true for port 465, false for STARTTLS on 587.' },
  { key: 'smtpUser', label: 'SMTP username', category: 'smtp', envKey: 'SMTP_USER', placeholder: 'user@domain.com' },
  { key: 'smtpPassword', label: 'SMTP password', category: 'smtp', secret: true, envKey: 'SMTP_PASSWORD', placeholder: 'app password' },
  { key: 'smtpFromEmail', label: 'SMTP from email', category: 'smtp', envKey: 'SMTP_FROM_EMAIL', placeholder: 'you@domain.com' },
  { key: 'smtpFromName', label: 'SMTP from name', category: 'smtp', envKey: 'SMTP_FROM_NAME', placeholder: 'Your Name' },

  // Branding / compliance
  { key: 'physicalAddress', label: 'Physical mailing address', category: 'branding', envKey: 'OUTBOUND_PHYSICAL_ADDRESS', placeholder: 'Company, Street, City, ZIP', hint: 'Required in every cold email footer for CAN-SPAM compliance.' },
  { key: 'adminEmail', label: 'Admin / fallback email', category: 'branding', envKey: 'OUTBOUND_ADMIN_EMAIL', placeholder: 'admin@yourdomain.com' },

  // Discovery (self-hosted crawler) — hidden from the UI, but the env-var fallback
  // (CRAWLER_BASE_URL / CRAWLER_API_KEY) MUST stay registered here or getSetting()
  // can't resolve the crawler and every search returns nothing.
  { key: 'crawlerBaseUrl', label: 'Crawler URL', category: 'discovery', envKey: 'CRAWLER_BASE_URL', hidden: true },
  { key: 'crawlerApiKey', label: 'Crawler API key', category: 'discovery', secret: true, envKey: 'CRAWLER_API_KEY', hidden: true },
];

const DEF_BY_KEY = new Map(SETTING_DEFINITIONS.map((def) => [def.key, def]));

// Per-user, in-memory cache so hot paths (every email send / lead search) don't
// hit the DB. Keyed by `${userId}::${key}`. Invalidated on write.
let cache: Map<string, string | null> | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000;

const SYSTEM = '∅'; // cache-key sentinel for rows with userId = null (system-level)
const ck = (userId: string | null | undefined, key: string) => `${userId || SYSTEM}::${key}`;

async function loadCache(): Promise<Map<string, string | null>> {
  const now = Date.now();
  if (cache && now - cacheLoadedAt < CACHE_TTL_MS) return cache;
  const rows = await prisma.setting.findMany();
  const next = new Map<string, string | null>();
  for (const row of rows) next.set(ck(row.userId, row.key), row.value);
  cache = next;
  cacheLoadedAt = now;
  return next;
}

export function invalidateSettingsCache() {
  cache = null;
  cacheLoadedAt = 0;
}

// Resolve the effective value of a setting for a user: decrypted per-user DB
// value if present, otherwise the env fallback, otherwise undefined. When no
// userId is supplied (deep background contexts), only the env fallback applies.
export async function getSetting(key: string, userId?: string | null): Promise<string | undefined> {
  const def = DEF_BY_KEY.get(key);
  const store = await loadCache();
  const stored = userId ? store.get(ck(userId, key)) : undefined;
  if (stored != null && stored !== '') {
    return isEncrypted(stored) ? decryptSecret(stored) : stored;
  }
  if (def?.envKey && process.env[def.envKey]) return process.env[def.envKey];
  return undefined;
}

export async function getSettings(keys: string[], userId?: string | null): Promise<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = {};
  await Promise.all(keys.map(async (key) => { out[key] = await getSetting(key, userId); }));
  return out;
}

// Persist one setting for a user. Empty string clears the override (falls back to env).
export async function setSetting(key: string, value: string | null, userId: string) {
  const def = DEF_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown setting: ${key}`);
  const trimmed = (value ?? '').trim();
  const toStore = trimmed === '' ? null : def.secret ? encryptSecret(trimmed) : trimmed;
  await prisma.setting.upsert({
    where: { userId_key: { userId, key } },
    update: { value: toStore, category: def.category, isSecret: !!def.secret },
    create: { userId, key, value: toStore, category: def.category, isSecret: !!def.secret },
  });
  invalidateSettingsCache();
}

export async function setSettings(values: Record<string, string | null>, userId: string) {
  for (const [key, value] of Object.entries(values)) {
    if (DEF_BY_KEY.has(key)) await setSetting(key, value, userId);
  }
  invalidateSettingsCache();
}

// Build the redacted view for the Settings page. Secrets never travel back as
// plaintext — we send a boolean `hasValue` and a masked hint instead.
export async function getSettingsForDisplay(userId: string) {
  const store = await loadCache();
  return SETTING_DEFINITIONS.filter((def) => !def.hidden).map((def) => {
    const stored = store.get(ck(userId, def.key));
    const hasDbValue = stored != null && stored !== '';
    const fromEnv = !hasDbValue && !!(def.envKey && process.env[def.envKey]);
    let value = '';
    let masked = '';
    if (def.secret) {
      masked = hasDbValue || fromEnv ? '••••••••' : '';
    } else {
      // Non-secret values are safe to echo back so the user can edit them.
      if (hasDbValue) value = isEncrypted(stored as string) ? '' : (stored as string);
      else if (fromEnv) value = process.env[def.envKey!] || '';
    }
    return {
      key: def.key,
      label: def.label,
      category: def.category,
      secret: !!def.secret,
      placeholder: def.placeholder || '',
      hint: def.hint || '',
      value,
      masked,
      hasValue: hasDbValue || fromEnv,
      source: hasDbValue ? 'database' : fromEnv ? 'env' : 'unset',
    };
  });
}

// ---- Connection tests ---------------------------------------------------

export async function testProvider(provider: string, userId: string): Promise<{ ok: boolean; message: string }> {
  switch (provider) {
    case 'nvidia':
      return testNvidia(userId);
    case 'crawler':
      return testCrawler(userId);
    case 'resend':
      return testResend(userId);
    case 'smtp':
      return testSmtp(userId);
    default:
      return { ok: false, message: `Unknown provider: ${provider}` };
  }
}

async function testNvidia(userId: string): Promise<{ ok: boolean; message: string }> {
  const key = await getSetting('nvidiaApiKey', userId);
  if (!key) return { ok: false, message: 'No NVIDIA API key set.' };
  const model = (await getSetting('nvidiaModel', userId)) || 'moonshotai/kimi-k2.6';
  try {
    // Cheapest possible authenticated call: a 1-token completion.
    const res = await axios.post(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      { model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false },
      { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 15000, validateStatus: (s) => s < 500 }
    );
    if (res.status === 200) return { ok: true, message: `NVIDIA key is valid (model ${model}).` };
    if (res.status === 401 || res.status === 403) return { ok: false, message: `NVIDIA rejected the key (${res.status}).` };
    return { ok: false, message: `NVIDIA returned ${res.status}: ${res.data?.detail || res.data?.error?.message || 'error'}` };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'NVIDIA request failed.' };
  }
}

async function testCrawler(userId: string): Promise<{ ok: boolean; message: string }> {
  const baseUrl = await getSetting('crawlerBaseUrl', userId);
  if (!baseUrl) return { ok: false, message: 'No crawler URL set.' };
  const apiKey = await getSetting('crawlerApiKey', userId);
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await axios.get(`${baseUrl}/health`, { headers, timeout: 8000, validateStatus: (s) => s < 500 });
    if (res.status === 200) return { ok: true, message: 'Crawler is reachable and healthy.' };
    if (res.status === 401) return { ok: false, message: 'Crawler API key is invalid (401).' };
    return { ok: false, message: `Crawler returned ${res.status}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Crawler connection failed.' };
  }
}

async function testResend(userId: string): Promise<{ ok: boolean; message: string }> {
  const key = await getSetting('resendApiKey', userId);
  if (!key) return { ok: false, message: 'No Resend API key set.' };
  try {
    // GET /domains is a cheap authenticated read.
    const res = await axios.get('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` },
      timeout: 10000,
      validateStatus: (s) => s < 500,
    });
    if (res.status === 200) return { ok: true, message: 'Resend key is valid.' };
    if (res.status === 401) return { ok: false, message: 'Resend key is invalid (401).' };
    return { ok: false, message: `Resend returned ${res.status}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Resend request failed.' };
  }
}

async function testSmtp(userId: string): Promise<{ ok: boolean; message: string }> {
  const [host, portRaw, secureRaw, user, password] = await Promise.all([
    getSetting('smtpHost', userId),
    getSetting('smtpPort', userId),
    getSetting('smtpSecure', userId),
    getSetting('smtpUser', userId),
    getSetting('smtpPassword', userId),
  ]);
  if (!host) return { ok: false, message: 'No SMTP host set.' };
  const port = Number(portRaw) || (secureRaw === 'true' ? 465 : 587);
  const secure = secureRaw === 'true' || port === 465;
  let client;
  try {
    client = await connectSmtp(host, port, secure, 8000);
    await client.expect([220]);
    await client.command(`EHLO geolead.local`, [250]);
    if (!secure && client.capabilities.has('STARTTLS')) {
      await client.command('STARTTLS', [220]);
      await client.upgradeToTls();
      await client.command(`EHLO geolead.local`, [250]);
    }
    if (user && password) {
      await client.command('AUTH LOGIN', [334]);
      await client.command(Buffer.from(user).toString('base64'), [334]);
      await client.command(Buffer.from(password).toString('base64'), [235]);
      return { ok: true, message: `Connected and authenticated to ${host}:${port}.` };
    }
    return { ok: true, message: `Connected to ${host}:${port} (no auth tested — set username/password to verify login).` };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'SMTP connection failed.' };
  } finally {
    try { client?.close(); } catch { /* ignore */ }
  }
}
