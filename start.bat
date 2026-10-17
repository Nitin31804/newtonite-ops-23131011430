@echo off
echo ===================================================
echo Starting Newtonite Operations Platform
echo ===================================================
start "Newtonite Backend API (Port 4000)" cmd /k "cd /d %~dp0backend && npm run dev"
start "Newtonite Frontend Web (Port 3000)" cmd /k "cd /d %~dp0frontend && npm run dev"
echo Backend and Frontend windows launched!
echo Access the application at: http://localhost:3000
