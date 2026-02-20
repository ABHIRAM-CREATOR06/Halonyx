@echo off
SETLOCAL EnableDelayedExpansion

echo ==========================================
echo   Halonyx Server Auto-Starter
echo ==========================================

:: Function to kill process on a specific port
set PORTS=3000 8081 9000

for %%p in (%PORTS%) do (
    echo Checking port %%p...
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":%%p "') do (
        echo Found process %%a on port %%p. Terminating...
        taskkill /F /PID %%a 2>nul
    )
)

echo.
echo No conflicting processes found.
echo Starting Halonyx Server...
echo.

node backend/server.js

pause
