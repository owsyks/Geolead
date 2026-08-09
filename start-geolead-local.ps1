# GeoLead AI Local Desktop Suite Launcher
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🚀 Launching GeoLead AI - 100% Local Desktop Suite" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$scriptPath = $PSScriptRoot

Write-Host "`nStarting Backend API Server (http://localhost:5000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$scriptPath\backend'; npm run dev"

Start-Sleep -Seconds 3

Write-Host "Starting Frontend UI Server (http://localhost:3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$scriptPath\frontend'; npm run dev"

Start-Sleep -Seconds 4

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "✅ GeoLead AI is running locally!" -ForegroundColor Green
Write-Host "👉 Opening Dashboard: http://localhost:3000" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green

Start-Process "http://localhost:3000"
