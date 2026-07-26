# Deploy script targeting SSH bore tunnel: 0xvon@bore.pub -p 35802
Param(
    [string]$ServerUser = "0xvon",
    [string]$ServerHost = "bore.pub",
    [int]$Port = 35802,
    [string]$DeployPath = "/opt/geolead"
)

Write-Host "=== Deploying GeoLead AI to $ServerUser@$ServerHost:$Port ===" -ForegroundColor Cyan

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

# Execute SSH session with custom port
ssh -p $Port "$ServerUser@$ServerHost" $RemoteCommand
