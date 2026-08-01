// Fixes Lead Explorer returning 0 results instantly.
//
// Cause: /opt/geolead is not a git checkout (files arrive via SFTP), and its
// backend/src/services/serper.ts predates DEFAULT_SERPER_KEYS (commit 0532081).
// The worker image was built 2026-07-27, so its key pool is empty and every
// discovery call throws SerperUnavailableError -> 0 businesses -> instant
// COMPLETED with 0 leads.
//
// This uploads the current serper.ts and rebuilds both services that use it.
//
// Usage: VPS_SSH_PASSWORD=... VPS_SSH_PORT=3415 node deploy/fix-serper-and-rebuild.js
const path = require('path');
const { Client } = require('../backend/node_modules/ssh2');

const PASSWORD = process.env.VPS_SSH_PASSWORD;
if (!PASSWORD) {
  console.error('Set VPS_SSH_PASSWORD before running this script.');
  process.exit(1);
}

const LOCAL = path.join(__dirname, '../backend/src/services/serper.ts');
const REMOTE = '/opt/geolead/backend/src/services/serper.ts';
const S = (c) => `echo "${PASSWORD}" | sudo -S ${c} 2>&1 | grep -v "^\\[sudo" || true`;
const COMPOSE = 'cd /opt/geolead && ' + `echo "${PASSWORD}" | sudo -S docker compose -f docker-compose.prod.yml`;

const cmd = [
  'echo "=== key pool present in uploaded source? ==="',
  `grep -c DEFAULT_SERPER_KEYS ${REMOTE}`,
  'echo "=== building backend + worker (this takes a minute) ==="',
  `${COMPOSE} build backend worker 2>&1 | tail -15`,
  'echo "=== recreating containers ==="',
  `${COMPOSE} up -d backend worker 2>&1 | tail -10`,
  'sleep 8',
  'echo "=== key pool present in NEW worker build? (count only) ==="',
  'docker exec geolead-worker-1 grep -c DEFAULT_SERPER_KEYS /app/dist/services/serper.js 2>/dev/null || echo "0 - still missing"',
  'echo "=== container states ==="',
  'docker ps --filter name=geolead --format "{{.Names}} {{.Status}}"',
  'echo "=== backend health ==="',
  'curl -s -o /dev/null -m 8 -w "backend HTTP %{http_code}\\n" http://127.0.0.1:5000/api/health',
  'echo "=== DONE ==="',
].join('; ');

const conn = new Client();
conn.on('ready', () => {
  console.log('[SSH] connected — uploading serper.ts');
  conn.sftp((err, sftp) => {
    if (err) { console.error('[SFTP Error]', err.message); conn.end(); return; }
    sftp.fastPut(LOCAL, REMOTE, (putErr) => {
      if (putErr) { console.error('[SFTP Upload Error]', putErr.message); conn.end(); return; }
      console.log('[SSH] upload complete — rebuilding\n');
      conn.exec(cmd, { pty: true }, (execErr, stream) => {
        if (execErr) { console.error('[EXEC ERROR]', execErr.message); conn.end(); return; }
        stream.on('close', () => conn.end());
        stream.on('data', (d) => process.stdout.write(d.toString()));
        stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
      });
    });
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
