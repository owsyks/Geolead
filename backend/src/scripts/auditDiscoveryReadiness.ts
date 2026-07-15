import axios from 'axios';
import { quarantineSerperKey } from '../services/serper.js';

async function main(): Promise<void> {
  const keyNames = [
    'SERPER_API_KEY',
    ...Array.from({ length: 10 }, (_, index) => `SERPER_API_KEY_${index + 1}`),
  ];

  const configuredKeyNames = keyNames.filter((name) => Boolean(process.env[name]?.trim()));
  const keysByValue = new Map<string, string[]>();
  for (const name of configuredKeyNames) {
    const value = process.env[name]!.trim();
    keysByValue.set(value, [...(keysByValue.get(value) || []), name]);
  }

  console.log(JSON.stringify({
    platformSerperKeyCount: keysByValue.size,
    configuredVariables: configuredKeyNames,
    crawlerFallbackConfigured: Boolean(process.env.CRAWLER_BASE_URL?.trim()),
  }));

  if (keysByValue.size === 0) {
    console.error('[Discovery readiness] No platform Serper key is available to the worker.');
    process.exitCode = 2;
    return;
  }

  let healthyKeys = 0;
  for (const [key, variableNames] of keysByValue) {
    try {
      const response = await axios.post(
        'https://google.serper.dev/search',
        { q: 'openai', num: 1 },
        {
          headers: {
            'X-API-KEY': key,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        },
      );
      healthyKeys++;
      console.log(JSON.stringify({
        variables: variableNames,
        serperProbeStatus: response.status,
        organicResults: Array.isArray(response.data?.organic) ? response.data.organic.length : 0,
      }));
    } catch (error: any) {
      const status = Number(error?.response?.status || 0);
      // Persist auth failures to the same Redis quarantine used at runtime.
      // This keeps known-bad platform credentials out of the first real user
      // search after a deploy, without printing or altering secret values.
      if (status === 401 || status === 403) {
        await quarantineSerperKey(key, 7 * 24 * 60 * 60);
      }
      console.error(JSON.stringify({
        variables: variableNames,
        serperProbeStatus: status || null,
        errorCode: error?.code || null,
        message: status ? 'Serper rejected the platform credential or request.' : 'Serper could not be reached.',
        quarantined: status === 401 || status === 403,
      }));
    }
  }

  if (healthyKeys === 0) {
    process.exitCode = 3;
  }
}

// The imported Serper service owns a Redis connection. This is a one-shot
// deployment audit, not a long-running worker, so terminate explicitly once
// all probes have completed instead of leaving the connection to hold the
// process (and deployment) open.
void main()
  .then(() => process.exit(process.exitCode || 0))
  .catch((error) => {
    console.error('[Discovery readiness] Unexpected audit failure.', error instanceof Error ? error.message : 'unknown error');
    process.exit(1);
  });
