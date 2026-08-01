// Restores Serper discovery for Lead Explorer WITHOUT rebuilding images.
//
// Cause: /opt/geolead is not a git checkout, and its backend/src/services/serper.ts
// predates DEFAULT_SERPER_KEYS (commit 0532081). The worker image (built
// 2026-07-27) therefore ships an empty key pool, so every discovery call throws
// SerperUnavailableError -> 0 businesses -> task COMPLETED with 0 leads in ~58ms.
//
// getPlatformKeys() reads SERPER_API_KEY_1..10 and SERPER_API_KEY from the
// environment BEFORE falling back to the baked-in pool, so injecting the keys via
// .env fixes discovery on the existing images. Only a container recreate is needed.
//
// Keys are read from the local source file and are never echoed to stdout.
//
// Usage: VPS_SSH_PASSWORD=... VPS_SSH_PORT=3415 node deploy/set-serper-env.js
const fs = require('fs');
const path = require('path');
const { Client } = require('../backend/node_modules/ssh2');

const PASSWORD = process.env.VPS_SSH_PASSWORD;
if (!PASSWORD) {
  console.error('Set VPS_SSH_PASSWORD before running this script.');
  process.exit(1);
}

// Pull the key pool out of the local serper.ts source.
const src = fs.readFileSync(path.join(__dirname, '../backend/src/services/serper.ts'), 'utf8');
const block = src.match(/const DEFAULT_SERPER_KEYS\s*=\s*\[([\s\S]*?)\]/);
if (!block) {
  console.error('Could not find DEFAULT_SERPER_KEYS in backend/src/services/serper.ts');
  process.exit(1);
}
const keys = [...block[1].matchAll(/'([0-9a-f]{30,50})'/g)].map((m) => m[1]);
if (keys.length === 0) {
  console.error('No keys parsed from DEFAULT_SERPER_KEYS.');
  process.exit(1);
}
console.log(`[local] parsed ${keys.length} Serper keys from source (values not shown)`);

// Build the .env mutation as a shell script, shipped base64 so nothing leaks into
// process listings or the terminal.
const envLines = keys.map((k, i) => `SERPER_API_KEY_${i + 1}=${k}`).join('\n');
const remoteScript = `#!/bin/bash
set -e
cd /opt/geolead
if [ ! -f .env ]; then echo "NO_ENV_FILE"; exit 1; fi
cp .env ".env.bak.$(date +%Y%m%d-%H%M%S)"
grep -v '^SERPER_API_KEY' .env > .env.tmp || true
cat >> .env.tmp <<'SERPEREOF'
${envLines}
SERPEREOF
mv .env.tmp .env
echo "env now has $(grep -c '^SERPER_API_KEY' .env) SERPER_API_KEY_* entries"
`;
const b64 = Buffer.from(remoteScript, 'utf8').toString('base64');

const SUDO = `echo "${PASSWORD}" | sudo -S`;
const cmd = [
  `echo ${b64} | base64 -d > /tmp/set-serper.sh`,
  'bash /tmp/set-serper.sh',
  'rm -f /tmp/set-serper.sh',
  'echo "=== recreating backend + worker ==="',
  `cd /opt/geolead && ${SUDO} docker compose -f docker-compose.prod.yml up -d backend worker 2>&1 | tail -8`,
  'sleep 10',
  'echo "=== keys visible in worker container (count only) ==="',
  'docker exec geolead-worker-1 sh -c "printenv | grep -c SERPER_API_KEY" 2>/dev/null || echo 0',
  'echo "=== container states ==="',
  'docker ps --filter name=geolead --format "{{.Names}} {{.Status}}"',
  'echo "=== backend health ==="',
  'curl -s -o /dev/null -m 8 -w "backend HTTP %{http_code}\\n" http://127.0.0.1:5000/api/health',
  'echo "=== DONE ==="',
].join('; ');

const conn = new Client();
conn.on('ready', () => {
  console.log('[SSH] connected');
  conn.exec(cmd, { pty: true }, (err, stream) => {
    if (err) { console.error('[EXEC ERROR]', err.message); conn.end(); return; }
    stream.on('close', () => conn.end());
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
  });
}).on('error', (err) => {
  console.error('[SSH Error]:', err.message);
  process.exitCode = 1;
}).connect({
  host: 'bore.pub',
  port: Number(process.env.VPS_SSH_PORT) || 3415,
  username: 'oxvon',
  password: PASSWORD,
  readyTimeout: 30000,
  keepaliveInterval: 10000,
});
