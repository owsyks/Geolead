// Provider-agnostic AI chat waterfall. All 13 AI call sites in the codebase
// used to hit NVIDIA NIM directly (nvidiaAi.ts); this module generalizes that
// into an ordered list of OpenAI-chat-completions-compatible providers, tried
// in turn until one succeeds. NVIDIA is kept as the first tier (still
// configured today) so nothing changes until its key is actually removed —
// at that point the chain just falls through to the free tiers automatically.
//
// On a 429/503 (rate-limited) response, that provider is put in a short
// cooldown so a saturated provider isn't retried on every single call — the
// next call skips straight to the next tier until the cooldown expires.
//
// Every existing call site's local heuristic/template fallback (used when
// this whole chain throws) is untouched — this module only replaces the
// "call an LLM" step, not what happens when no LLM is reachable at all.
import axios from 'axios';
import { getSetting } from './settings.js';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiChatOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  timeoutMs?: number;
  userId?: string | null;
}

interface ProviderConfig {
  name: string;
  keySettingKey: string;
  modelSettingKey: string;
  endpoint: string;
  defaultModel: string;
  extraHeaders?: Record<string, string>;
  // Floor applied to the requested max_tokens for this provider. Needed for
  // reasoning models (e.g. OpenCode's DeepSeek) that spend tokens on a
  // reasoning_content field before writing the final `content` — a tight
  // budget (many call sites request only ~200) can be entirely consumed by
  // reasoning, leaving `content` empty and the call looking like a failure.
  minMaxTokens?: number;
}

// Order matters: NVIDIA first (already configured), then free tiers ordered
// fastest/tightest-quota -> deepest/largest-quota (see the plan doc for why).
const PROVIDERS: ProviderConfig[] = [
  {
    name: 'nvidia',
    keySettingKey: 'nvidiaApiKey',
    modelSettingKey: 'nvidiaModel',
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    defaultModel: 'moonshotai/kimi-k2.6',
  },
  {
    name: 'groq',
    keySettingKey: 'groqApiKey',
    modelSettingKey: 'groqModel',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.1-8b-instant', // highest free RPD (14,400/day) on Groq
  },
  {
    name: 'gemini',
    keySettingKey: 'geminiApiKey',
    modelSettingKey: 'geminiModel',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    defaultModel: 'gemini-2.0-flash',
  },
  {
    name: 'opencode',
    keySettingKey: 'opencodeApiKey',
    modelSettingKey: 'opencodeModel',
    endpoint: 'https://opencode.ai/zen/v1/chat/completions',
    defaultModel: 'deepseek-v4-flash-free',
    minMaxTokens: 600, // verified live: 20 tokens -> empty content (all spent reasoning); 200 -> real answer
  },
  {
    name: 'cerebras',
    keySettingKey: 'cerebrasApiKey',
    modelSettingKey: 'cerebrasModel',
    endpoint: 'https://api.cerebras.ai/v1/chat/completions',
    defaultModel: 'gemma-4-31b', // verified live: llama3.1-8b was retired from Cerebras's catalog
  },
  {
    name: 'mistral',
    keySettingKey: 'mistralApiKey',
    modelSettingKey: 'mistralModel',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    defaultModel: 'mistral-small-latest',
  },
  {
    name: 'openrouter',
    keySettingKey: 'openrouterApiKey',
    modelSettingKey: 'openrouterModel',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'google/gemma-4-31b-it:free', // verified live; OpenRouter had discontinued the free deepseek:free slugs
    extraHeaders: { 'HTTP-Referer': 'https://geoai-ashen.vercel.app', 'X-Title': 'GeoLead AI' },
  },
];

// Per-provider cooldown after a rate-limit response, so a saturated provider
// isn't hammered on every subsequent call within the same window.
const COOLDOWN_MS = 3 * 60 * 1000;
const cooldownUntil = new Map<string, number>();

function isRateLimited(err: any): boolean {
  const status = err?.response?.status;
  return status === 429 || status === 503;
}

// Returns the first configured provider's key, or undefined if none are set.
// Kept under the old name so every existing call site's "do we have an AI key
// at all" check (`getNvidiaKey(userId)`) works unchanged — it now means "is
// any provider in the waterfall usable" rather than NVIDIA specifically.
export async function getNvidiaKey(userId?: string | null): Promise<string | undefined> {
  for (const cfg of PROVIDERS) {
    const key = await getSetting(cfg.keySettingKey, userId);
    if (key) return key;
  }
  return undefined;
}

async function callProvider(cfg: ProviderConfig, messages: AiMessage[], options: AiChatOptions): Promise<string> {
  const apiKey = await getSetting(cfg.keySettingKey, options.userId);
  if (!apiKey) throw Object.assign(new Error(`${cfg.name}: no API key set`), { code: 'NO_KEY' });
  const model = (await getSetting(cfg.modelSettingKey, options.userId)) || cfg.defaultModel;

  const response = await axios.post(
    cfg.endpoint,
    {
      model,
      messages,
      max_tokens: Math.max(options.maxTokens ?? 2048, cfg.minMaxTokens ?? 0),
      temperature: options.temperature ?? 0.6,
      top_p: options.topP ?? 1.0,
      stream: false,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(cfg.extraHeaders || {}),
      },
      timeout: options.timeoutMs ?? 30000,
    }
  );

  const content = response.data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error(`${cfg.name}: empty response`);
  }
  return content;
}

// Low-level call: tries each configured provider in order (skipping any
// currently in cooldown), returns the first successful response text, or
// throws once every provider has been tried and failed/is unconfigured.
export async function nvidiaChat(messages: AiMessage[], options: AiChatOptions = {}): Promise<string> {
  const now = Date.now();
  let lastError: unknown = new Error('No AI provider is configured.');
  for (const cfg of PROVIDERS) {
    const until = cooldownUntil.get(cfg.name);
    if (until && until > now) continue;
    try {
      return await callProvider(cfg, messages, options);
    } catch (err: any) {
      if (err?.code === 'NO_KEY') continue; // not configured, try next silently
      lastError = err;
      if (isRateLimited(err)) {
        cooldownUntil.set(cfg.name, now + COOLDOWN_MS);
        console.warn(`[AI] ${cfg.name} rate-limited, skipping for ${COOLDOWN_MS / 1000}s`);
      } else {
        console.warn(`[AI] ${cfg.name} failed:`, err?.response?.data?.error?.message || err?.message);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All AI providers failed or are unconfigured.');
}

// Robustly extract a JSON object from a model response. Models may wrap JSON
// in ```json fences, emit a reasoning preface, or trail prose after the
// object. We strip fences, try a direct parse, then scan for the first
// balanced {...} block (string-aware), and finally fall back to the first
// "{" .. last "}" slice.
export function extractJson<T = any>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch { /* keep trying */ }

  const balanced = firstBalancedObject(cleaned);
  if (balanced) {
    try { return JSON.parse(balanced) as T; } catch { /* keep trying */ }
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)) as T; } catch { /* fall through */ }
  }
  throw new Error('Could not parse JSON from model response.');
}

// Find the first complete, brace-balanced JSON object, ignoring braces that
// appear inside string literals.
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
