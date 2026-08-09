@echo off
echo ============================================================
echo 🚀 Launching GeoLead AI - 100%% Local Desktop Suite
echo ============================================================
echo.
echo Starting Backend API Server (http://localhost:5000)...
start "GeoLead Backend API" cmd /k "cd /d %~dp0backend && npm run dev"

timeout /t 3 /nobreak >nul

echo Starting Frontend UI Server (http://localhost:3000)...
start "GeoLead Frontend UI" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 5 /nobreak >nul

echo.
echo ============================================================
echo ✅ GeoLead AI is running locally!
echo 👉 Opening Dashboard in your browser: http://localhost:3000
echo ============================================================
start http://localhost:3000
