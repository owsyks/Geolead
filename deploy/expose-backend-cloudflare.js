// Re-creates and starts the Cloudflare quick tunnel that exposes the backend
// (127.0.0.1:5000) to the internet, then prints the resulting public URL.
//
// Usage: VPS_SSH_PASSWORD=... VPS_SSH_PORT=3415 node deploy/expose-backend-cloudflare.js
//
// The unit file is written via base64 to avoid shell-quoting problems, and the
// whole remote command stays on ONE line (multi-line strings do not execute over
// this pty). See deploy/cloudflared-login-start.js for the other pty gotchas.
const { Client } = require('../backend/node_modules/ssh2');

const PASSWORD = process.env.VPS_SSH_PASSWORD;
if (!PASSWORD) {
  console.error('Set VPS_SSH_PASSWORD before running this script.');
  process.exit(1);
}

const UNIT = `[Unit]
Description=GeoLead Cloudflare Tunnel
After=network.target

[Service]
Type=simple
User=oxvon
ExecStart=/usr/local/bin/cloudflared tunnel --protocol http2 --url http://127.0.0.1:5000
Restart=always
RestartSec=2s
StandardOutput=append:/var/log/cloudflared.log
StandardError=append:/var/log/cloudflared.log

[Install]
WantedBy=multi-user.target
`;

const b64 = Buffer.from(UNIT, 'utf8').toString('base64');
const S = (c) => `echo "${PASSWORD}" | sudo -S ${c} 2>&1 | grep -v "^\\[sudo" || true`;

const cmd = [
  'echo "=== backend precheck ==="',
  'curl -s -o /dev/null -m 5 -w "backend HTTP %{http_code}\\n" http://127.0.0.1:5000/api/health',
  'echo "=== unmask + rewrite unit ==="',
  S('systemctl unmask geolead-cloudflare.service'),
  `echo ${b64} | base64 -d > /tmp/geolead-cloudflare.service`,
  S('cp /tmp/geolead-cloudflare.service /etc/systemd/system/geolead-cloudflare.service'),
  'echo "=== unit written ==="',
  'wc -c /etc/systemd/system/geolead-cloudflare.service',
  S('truncate -s 0 /var/log/cloudflared.log'),
  S('systemctl daemon-reload'),
  S('systemctl enable geolead-cloudflare.service'),
  S('systemctl restart geolead-cloudflare.service'),
  'sleep 14',
  'echo "=== status ==="',
  'systemctl is-active geolead-cloudflare.service',
  'echo "=== PUBLIC URL ==="',
  'grep -o "https://[a-zA-Z0-9-]*\\.trycloudflare\\.com" /var/log/cloudflared.log 2>/dev/null | tail -1 || echo "NO URL YET"',
  'echo "=== END ==="',
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
