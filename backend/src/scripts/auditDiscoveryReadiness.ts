import axios from 'axios';

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
      console.error(JSON.stringify({
        variables: variableNames,
        serperProbeStatus: error?.response?.status || null,
        errorCode: error?.code || null,
        message: error?.response?.status ? 'Serper rejected the platform credential or request.' : 'Serper could not be reached.',
      }));
    }
  }

  if (healthyKeys === 0) {
    process.exitCode = 3;
  }
}

void main();
