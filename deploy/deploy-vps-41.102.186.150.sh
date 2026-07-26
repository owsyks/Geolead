#!/bin/bash
# Deploy script for oxvon@41.102.186.150

SERVER_USER="oxvon"
SERVER_IP="41.102.186.150"
DEPLOY_PATH="/opt/geolead"

echo "=== Deploying GeoLead AI to ${SERVER_USER}@${SERVER_IP} ==="

ssh "${SERVER_USER}@${SERVER_IP}" << EOF
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
