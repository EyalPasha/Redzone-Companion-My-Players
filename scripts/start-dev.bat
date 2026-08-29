@echo off
cd /d "%~dp0.."
echo Starting RedZone Companion dev server...
start "RedZone Companion Server" cmd /c "npm run dev"

:wait
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient).Connect('localhost',3000); exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 goto wait

start "" "http://localhost:3000"