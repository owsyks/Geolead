import axios from 'axios';

async function main(): Promise<void> {
  const keyNames = [
    'SERPER_API_KEY',
    ...Array.from({ length: 10 }, (_, index) => `SERPER_API_KEY_${index + 1}`),
  ];

  const configuredKeyNames = keyNames.filter((name) => Boolean(process.env[name]?.trim()));
  const uniqueKeys = Array.from(new Set(
    configuredKeyNames.map((name) => process.env[name]!.trim()),
  ));

  console.log(JSON.stringify({
    platformSerperKeyCount: uniqueKeys.length,
    configuredVariables: configuredKeyNames,
    crawlerFallbackConfigured: Boolean(process.env.CRAWLER_BASE_URL?.trim()),
  }));

  if (uniqueKeys.length === 0) {
    console.error('[Discovery readiness] No platform Serper key is available to the worker.');
    process.exitCode = 2;
    return;
  }

  try {
    const response = await axios.post(
      'https://google.serper.dev/search',
      { q: 'openai', num: 1 },
      {
        headers: {
          'X-API-KEY': uniqueKeys[0],
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      },
    );
    console.log(JSON.stringify({
      serperProbeStatus: response.status,
      organicResults: Array.isArray(response.data?.organic) ? response.data.organic.length : 0,
    }));
  } catch (error: any) {
    console.error(JSON.stringify({
      serperProbeStatus: error?.response?.status || null,
      errorCode: error?.code || null,
      message: error?.response?.status ? 'Serper rejected the platform credential or request.' : 'Serper could not be reached.',
    }));
    process.exitCode = 3;
  }
}

void main();
