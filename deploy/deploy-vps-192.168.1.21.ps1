# Deploy script targeting VPS oxvon@192.168.1.21
Param(
    [string]$ServerUser = "oxvon",
    [string]$ServerIP = "192.168.1.21",
    [string]$DeployPath = "/opt/geolead"
)

Write-Host "=== Deploying GeoLead AI Backend Stack to $ServerUser@$ServerIP ===" -ForegroundColor Cyan

# Command to execute on remote server
$RemoteCommand = @"
set -e
sudo mkdir -p $DeployPath
sudo chown -R $ServerUser:$ServerUser $DeployPath
cd $DeployPath
if [ ! -d .git ]; then
    git clone https://github.com/owsyks/Geolead.git .
else
    git fetch --all
    git reset --hard origin/feat/auth-multi-tenancy
fi
if [ -f docker-compose.prod.yml ]; then
    sudo docker compose -f docker-compose.prod.yml up -d --build
    echo '=== Stack Deployment Complete ==='
    sudo docker compose -f docker-compose.prod.yml ps
fi
"@

# Execute SSH session
ssh "$ServerUser@$ServerIP" $RemoteCommand
