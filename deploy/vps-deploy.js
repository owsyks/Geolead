const { Client } = require('../backend/node_modules/ssh2');
const fs = require('fs');
const path = require('path');

const userProfile = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\VVV';
const keyPath = path.join(userProfile, '.ssh', 'id_ed25519');

let privateKey;
try {
  privateKey = fs.readFileSync(keyPath);
} catch (e) {}

const usernames = ['oxvon', '0xvon'];

function tryConnectWithUser(userIndex = 0) {
  if (userIndex >= usernames.length) {
    console.error('[SSH Error] All username attempts failed.');
    return;
  }

  const username = usernames[userIndex];
  const conn = new Client();

  const config = {
    host: 'bore.pub',
    port: 35802,
    username: username,
    password: 'vonseeus@100',
    privateKey: privateKey,
    readyTimeout: 30000,
    keepaliveInterval: 10000,
    tryKeyboard: true,
  };

  console.log(`[SSH Attempt] Trying username '${username}' at ${config.host}:${config.port}...`);

  conn.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
    console.log(`[SSH] Prompt received for user '${username}':`, prompts.map(p => p.prompt));
    finish([config.password]);
  });

  conn.on('ready', () => {
    console.log(`[SSH SUCCESS] Logged in successfully as '${username}'! Executing setup...`);

    const commands = [
      'echo "=== SSH Authenticated Successfully ==="',
      'whoami && hostname -I || true',
      'echo "=== Setting up deployment directory /opt/geolead ==="',
      `echo "${config.password}" | sudo -S mkdir -p /opt/geolead || true`,
      `echo "${config.password}" | sudo -S chown -R ${username}:${username} /opt/geolead || true`,
      'cd /opt/geolead',
      'if [ ! -d .git ]; then git clone -b feat/auth-multi-tenancy https://github.com/owsyks/Geolead.git . ; else git fetch --all && git reset --hard origin/feat/auth-multi-tenancy ; fi',
      'echo "=== Repository Status ==="',
      'git status -s',
      `if [ -f docker-compose.prod.yml ]; then echo "${config.password}" | sudo -S docker compose -f docker-compose.prod.yml up -d --build ; echo "=== Docker Status ===" ; sudo docker compose -f docker-compose.prod.yml ps ; fi`,
      'echo "=== Opening Port 5000 in UFW Firewall ==="',
      `echo "${config.password}" | sudo -S ufw allow 5000/tcp || true`,
      'echo "=== Backend API Health Check ==="',
      'curl -i http://127.0.0.1:5000/api/health || true',
    ].join(' && ');

    conn.exec(commands, { pty: true }, (err, stream) => {
      if (err) {
        console.error('[SSH Exec Error]:', err.message);
        conn.end();
        return;
      }

      stream.on('close', (code) => {
        console.log(`[SSH Finish] Exit code ${code}`);
        conn.end();
      });

      stream.on('data', (data) => process.stdout.write(data.toString()));
      stream.stderr.on('data', (data) => process.stderr.write(data.toString()));
    });
  });

  conn.on('error', (err) => {
    console.error(`[SSH Failed for user '${username}']: ${err.message}`);
    conn.end();
    // Try next username
    setTimeout(() => tryConnectWithUser(userIndex + 1), 2000);
  });

  conn.connect(config);
}

tryConnectWithUser(0);
