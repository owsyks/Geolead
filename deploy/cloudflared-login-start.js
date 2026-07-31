// Starts `cloudflared tunnel login` DETACHED on the box and prints the
// authorization URL. Open that URL in any browser and pick the zone; cloudflared
// then writes ~/.cloudflared/cert.pem on the box and exits on its own.
//
// Two traps this script exists to avoid:
//  1. Never call process.exit() in the stream 'close' handler — piped stdout is
//     async and exiting there truncates the buffered output (you get silence).
//  2. Never `pkill -f "tunnel login"` here: the pattern matches the very shell
//     running this command string, so it kills its own session before any output.
//  3. Keep the remote command on ONE line — multi-line strings did not execute
//     over this pty. Wrap the background job in ( ... &) so `&` can precede `;`.
const { Client } = require('../backend/node_modules/ssh2');

const PASSWORD = process.env.VPS_SSH_PASSWORD;
if (!PASSWORD) {
  console.error('Set VPS_SSH_PASSWORD before running this script.');
  process.exit(1);
}

const CF = '/usr/local/bin/cloudflared';
const cmd = [
  'rm -f /tmp/cf-login.log',
  `(setsid ${CF} tunnel login </dev/null >/tmp/cf-login.log 2>&1 &)`,
  'sleep 14',
  'echo "===== LOGIN URL ====="',
  'cat /tmp/cf-login.log 2>/dev/null || echo NOLOG',
  'echo "===== CERT ====="',
  'ls -la ~/.cloudflared/ 2>/dev/null || echo "no cert yet"',
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
  port: Number(process.env.VPS_SSH_PORT) || 27694,
  username: 'oxvon',
  password: PASSWORD,
  readyTimeout: 25000,
  keepaliveInterval: 10000,
});
