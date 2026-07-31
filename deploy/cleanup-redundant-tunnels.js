// Stop + disable the unused tunnel services left over from earlier attempts.
// KEEPS: bore-ssh.service (SSH access) and geolead-cloudflare.service (in use).
// Password comes from env only — do not hardcode it in this file.
const { Client } = require('../backend/node_modules/ssh2');

const PASSWORD = process.env.VPS_SSH_PASSWORD;
if (!PASSWORD) {
  console.error('Set VPS_SSH_PASSWORD before running this script.');
  process.exit(1);
}

const REDUNDANT = ['geolead-localtunnel', 'geolead-serveo', 'geolead-tunnel'];
const KEEP = ['bore-ssh', 'geolead-cloudflare'];

const S = (cmd) => `echo "${PASSWORD}" | sudo -S ${cmd}`;

const commands = [
  'echo "===== BEFORE ====="',
  'systemctl list-units --type=service --all --no-pager | grep -iE "geolead|cloudflare|bore" || true',
  ...REDUNDANT.flatMap((svc) => [
    `echo "===== STOPPING ${svc} ====="`,
    S(`systemctl stop ${svc}.service`) + ' 2>&1 | grep -v "^\\[sudo" || true',
    S(`systemctl disable ${svc}.service`) + ' 2>&1 | grep -v "^\\[sudo" || true',
  ]),
  'echo "===== AFTER ====="',
  'systemctl list-units --type=service --all --no-pager | grep -iE "geolead|cloudflare|bore" || true',
  'echo "===== SANITY: KEPT SERVICES ====="',
  ...KEEP.map((svc) => `systemctl is-active ${svc}.service | sed "s/^/${svc}: /"`),
  'echo "===== SANITY: BACKEND + TUNNEL ====="',
  'curl -s -o /dev/null -w "local backend HTTP %{http_code}\\n" http://127.0.0.1:5000/api/health',
  'grep -o "https://[a-zA-Z0-9-]*\\.trycloudflare\\.com" /var/log/cloudflared.log 2>/dev/null | tail -n 1',
  'echo "===== DONE ====="',
].join('; ');

const conn = new Client();
conn.on('ready', () => {
  console.log('[SSH] Connected\n');
  conn.exec(commands, { pty: true }, (err, stream) => {
    if (err) { console.error('[EXEC ERROR]', err.message); conn.end(); return; }
    stream.on('close', () => { conn.end(); process.exit(0); });
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
  });
}).on('error', (err) => {
  console.error('[SSH Error]:', err.message);
  process.exit(1);
}).connect({
  host: 'bore.pub',
  port: Number(process.env.VPS_SSH_PORT) || 27694,
  username: 'oxvon',
  password: PASSWORD,
  readyTimeout: 25000,
});
