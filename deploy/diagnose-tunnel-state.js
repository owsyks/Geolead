// Read-only diagnostic: inspect backend + tunnel state on the VPS.
const { Client } = require('../backend/node_modules/ssh2');

const PASSWORD = process.env.VPS_SSH_PASSWORD;
if (!PASSWORD) {
  console.error('Set VPS_SSH_PASSWORD before running this script.');
  process.exit(1);
}

const PORTS = [27694, 25192];

const commands = [
  'echo "===== WHOAMI / HOST ====="',
  'whoami; hostname; uptime',
  'echo "===== BACKEND ON :5000 ====="',
  'curl -s -o /dev/null -w "local backend HTTP %{http_code}\\n" http://127.0.0.1:5000/api/health || echo "backend NOT responding"',
  'echo "===== SYSTEMD SERVICES ====="',
  'systemctl list-units --type=service --all --no-pager | grep -iE "geolead|cloudflare|bore|serveo|localtunnel" || echo "none matched"',
  'echo "===== CLOUDFLARED ====="',
  'which cloudflared; cloudflared --version 2>/dev/null || echo "cloudflared missing"',
  'echo "--- named tunnels (needs cert.pem) ---"',
  'ls -la ~/.cloudflared/ 2>/dev/null || echo "no ~/.cloudflared"',
  'sudo ls -la /root/.cloudflared/ 2>/dev/null || echo "no /root/.cloudflared"',
  'cloudflared tunnel list 2>&1 | head -20',
  'echo "===== CURRENT QUICK TUNNEL URL ====="',
  'grep -o "https://[a-zA-Z0-9-]*\\.trycloudflare\\.com" /var/log/cloudflared.log 2>/dev/null | tail -n 3 || echo "no log"',
  'echo "===== CLOUDFLARED LOG TAIL ====="',
  'tail -n 25 /var/log/cloudflared.log 2>/dev/null || echo "no log"',
  'echo "===== LISTENING PORTS ====="',
  'ss -tlnp 2>/dev/null | head -20',
  'echo "===== DONE ====="',
].join('; ');

function tryPort(idx) {
  if (idx >= PORTS.length) {
    console.error('\n[FATAL] Could not connect on any known SSH port:', PORTS.join(', '));
    console.error('The bore tunnel exposing SSH has rotated. A new port is needed.');
    process.exit(1);
  }
  const port = PORTS[idx];
  console.log(`\n[SSH] Trying bore.pub:${port} ...`);
  const conn = new Client();
  let connected = false;

  conn.on('ready', () => {
    connected = true;
    console.log(`[SSH] Connected on port ${port}\n`);
    conn.exec(commands, { pty: true }, (err, stream) => {
      if (err) { console.error('[EXEC ERROR]', err.message); conn.end(); return; }
      stream.on('close', () => { conn.end(); process.exit(0); });
      stream.on('data', (d) => process.stdout.write(d.toString()));
      stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
    });
  }).on('error', (err) => {
    console.log(`[SSH] Port ${port} failed: ${err.message}`);
    if (!connected) tryPort(idx + 1);
  }).connect({
    host: 'bore.pub',
    port,
    username: 'oxvon',
    password: PASSWORD,
    readyTimeout: 25000,
  });
}

tryPort(0);
