#!/bin/bash
# Deploy script for 0xvon@bore.pub port 35802

SERVER_USER="0xvon"
SERVER_HOST="bore.pub"
PORT=35802
DEPLOY_PATH="/opt/geolead"

echo "=== Deploying GeoLead AI to ${SERVER_USER}@${SERVER_HOST}:${PORT} ==="

ssh -p ${PORT} "${SERVER_USER}@${SERVER_HOST}" << EOF
set -e
sudo mkdir -p ${DEPLOY_PATH}
sudo chown -R ${SERVER_USER}:${SERVER_USER} ${DEPLOY_PATH}
cd ${DEPLOY_PATH}

if [ ! -d .git ]; then
    git clone https://github.com/owsyks/Geolead.git .
else
    git fetch --all
    git reset --hard origin/feat/auth-multi-tenancy
fi

if [ -f docker-compose.prod.yml ]; then
    sudo docker compose -f docker-compose.prod.yml up -d --build
    echo "=== Deployment Status ==="
    sudo docker compose -f docker-compose.prod.yml ps
fi
EOF
