// NVIDIA NIM chat-completions client (OpenAI-compatible endpoint).
// Replaces the direct OpenAI calls for email generation and lead scoring.
// Model + key are resolved from the Settings store at call time so users can
// change them in the UI without a restart.
import axios from 'axios';
import { getSetting } from './settings.js';

const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
export const DEFAULT_NVIDIA_MODEL = 'moonshotai/kimi-k2.6';

export interface NvidiaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface NvidiaChatOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export async function getNvidiaKey(): Promise<string | undefined> {
  return getSetting('nvidiaApiKey');
}

// Low-level call: returns the assistant message text, or throws.
export async function nvidiaChat(messages: NvidiaMessage[], options: NvidiaChatOptions = {}): Promise<string> {
  const apiKey = await getNvidiaKey();
  if (!apiKey) throw new Error('No NVIDIA API key set.');
  const model = (await getSetting('nvidiaModel')) || DEFAULT_NVIDIA_MODEL;

  const response = await axios.post(
    NVIDIA_ENDPOINT,
    {
      model,
      messages,
      max_tokens: options.maxTokens ?? 16384,
      temperature: options.temperature ?? 0.6,
      top_p: options.topP ?? 1.0,
      stream: false,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: options.timeoutMs ?? 30000,
    }
  );

  const content = response.data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('NVIDIA returned an empty response.');
  }
  return content;
}

// Robustly extract a JSON object from a model response. Kimi and other models
// may wrap JSON in ```json fences, emit a reasoning preface, or trail prose
// after the object. We strip fences, try a direct parse, then scan for the
// first balanced {...} block (string-aware), and finally fall back to the
// first "{" .. last "}" slice.
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
