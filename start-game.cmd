@echo off
title Disaster Playground - Babylon.js + Havok
cd /d "%~dp0"
if not exist "node_modules" (
  echo Installing dependencies. Please wait...
  call npm install
  if errorlevel 1 (echo Dependency installation failed & pause & exit /b 1)
)
echo Starting Disaster Playground at http://127.0.0.1:5173
start "" /min cmd /c "timeout /t 4 /nobreak >nul & start http://127.0.0.1:5173/"
call npm run dev
pause