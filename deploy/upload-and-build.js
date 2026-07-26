const { Client } = require('../backend/node_modules/ssh2');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. Create a clean zip or tar archive locally of the project
const rootDir = path.resolve(__dirname, '..');
const archivePath = path.join(rootDir, 'deploy-pack.tar.gz');

console.log('[Deploy Pack] Archiving local source code...');
try {
  // Use tar or git archive if available, or custom node archive
  execSync(`tar -czf "${archivePath}" --exclude="node_modules" --exclude=".git" --exclude="dist" --exclude=".next" -C "${rootDir}" backend frontend docker-compose.prod.yml deploy`, { stdio: 'inherit' });
  console.log('[Deploy Pack] Archive created successfully at deploy-pack.tar.gz');
} catch (e) {
  console.error('[Deploy Pack Failed]:', e.message);
  process.exit(1);
}

// 2. Connect via SSH & SFTP to 0xvon@bore.pub:35802
const config = {
  host: 'bore.pub',
  port: 35802,
  username: 'oxvon',
  password: 'vonseeus@100',
  readyTimeout: 45000,
  keepaliveInterval: 10000,
};

const conn = new Client();

console.log(`[SFTP Upload] Connecting to ${config.username}@${config.host}:${config.port}...`);

conn.on('ready', () => {
  console.log('[SFTP Upload] Connected! Preparing remote directory /opt/geolead...');

  conn.sftp((err, sftp) => {
    if (err) {
      console.error('[SFTP Error]:', err.message);
      conn.end();
      return;
    }

    const remoteArchive = '/tmp/deploy-pack.tar.gz';
    console.log(`[SFTP Upload] Uploading ${archivePath} to ${remoteArchive}...`);

    sftp.fastPut(archivePath, remoteArchive, (err) => {
      if (err) {
        console.error('[SFTP Upload Error]:', err.message);
        conn.end();
        return;
      }
      console.log('[SFTP Upload Complete] Package transferred! Extracting and starting Docker stack...');

      const commands = [
        'echo "vonseeus@100" | sudo -S mkdir -p /opt/geolead || true',
        'echo "vonseeus@100" | sudo -S chown -R oxvon:oxvon /opt/geolead || true',
        'cd /opt/geolead',
        'tar -xzf /tmp/deploy-pack.tar.gz -C /opt/geolead',
        'rm -f /tmp/deploy-pack.tar.gz',
        'if [ ! -f .env ]; then cp deploy/env.production.example .env && sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 16)/" .env ; fi',
        'echo "=== Production .env verified ==="',
        'ls -la /opt/geolead',
        'if [ -f docker-compose.prod.yml ]; then echo "vonseeus@100" | sudo -S docker compose -f docker-compose.prod.yml up -d --build ; echo "=== Docker Container Status ===" ; sudo docker compose -f docker-compose.prod.yml ps ; fi',
      ].join(' && ');

      conn.exec(commands, { pty: true }, (err, stream) => {
        if (err) {
          console.error('[Remote Exec Error]:', err.message);
          conn.end();
          return;
        }

        stream.on('close', (code) => {
          console.log(`[Remote Deployment Complete] Exit code ${code}`);
          // Clean up local archive
          try { fs.unlinkSync(archivePath); } catch (e) {}
          conn.end();
        });

        stream.on('data', (data) => process.stdout.write(data.toString()));
        stream.stderr.on('data', (data) => process.stderr.write(data.toString()));
      });
    });
  });
}).on('error', (err) => {
  console.error('[SSH Connection Error]:', err.message);
}).connect(config);
