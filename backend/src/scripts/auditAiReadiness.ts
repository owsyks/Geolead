import { getAiReadiness, nvidiaChat } from '../services/aiProvider.js';

async function main(): Promise<void> {
  const readiness = await getAiReadiness();
  console.log(JSON.stringify({
    configuredProviders: readiness.configuredProviders,
    safeFallbackAvailable: readiness.fallbackAvailable,
  }));

  if (readiness.configuredProviders.length === 0) {
    console.warn('[AI readiness] No platform AI provider is configured; deterministic, spam-scored safe fallback is active.');
    return;
  }

  try {
    await nvidiaChat([
      { role: 'system', content: 'Reply with exactly OK.' },
      { role: 'user', content: 'health check' },
    ], { maxTokens: 8, temperature: 0, timeoutMs: 15_000 });
    console.log('[AI readiness] At least one configured provider completed a health check.');
  } catch {
    // Safe fallback is intentionally a supported operating mode. Deployment
    // remains available, while structured logs make the degraded state clear.
    console.warn('[AI readiness] Configured providers are unavailable; deterministic, spam-scored safe fallback is active.');
  }
}

void main();
