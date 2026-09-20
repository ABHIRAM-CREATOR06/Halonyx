@echo off
SETLOCAL EnableDelayedExpansion

:: Resolve to repo root regardless of where this script is invoked from,
:: since it lives in scripts\ rather than the repo root.
cd /d "%~dp0.."

echo ===================================================
echo               Halonyx Setup & Deployment
echo ===================================================
echo.

:: Step 1: Initialize Environment File
if not exist ".env" (
    if exist ".env.example" (
        echo [*] Copying default environment configuration (.env.example -^> .env)...
        copy .env.example .env >nul
        echo [+] Created .env file successfully.
    ) else (
        echo [!] Warning: .env.example not found. Skipping .env creation.
    )
) else (
    echo [*] Found existing .env configuration.
)
echo.

:: Step 2: Ensure database directory exists
if not exist "backend\db" (
    echo [*] Creating database directory (backend\db)...
    mkdir backend\db
)

:: Step 3: Selection Menu
echo Select setup option:
echo   [1] Local Node.js Setup (npm install ^& prepare dependencies)
echo   [2] Docker Compose Deployment (docker compose up -d --build)
echo   [3] Docker Container Build ^& Run (docker build ^& docker run)
echo   [4] Exit
echo.

set /p CHOICE="Enter choice [1-4]: "

if "%CHOICE%"=="1" goto LOCAL_SETUP
if "%CHOICE%"=="2" goto DOCKER_COMPOSE
if "%CHOICE%"=="3" goto DOCKER_CLI
if "%CHOICE%"=="4" goto END

echo [!] Invalid choice. Exiting.
goto END

:LOCAL_SETUP
echo.
echo [*] Checking Node.js installation...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [X] Node.js is not installed or not in PATH. Please install Node.js 20+.
    pause
    exit /b 1
)
echo [+] Node.js detected.
echo [*] Running npm install...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [X] npm install failed.
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo ===================================================
echo [+] Local setup completed successfully!
echo [*] You can start the server using: npm start (or scripts\start_server.bat)
echo ===================================================
pause
goto END

:DOCKER_COMPOSE
echo.
echo [*] Checking Docker...
where docker >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [X] Docker is not installed or not in PATH. Please install Docker Desktop.
    pause
    exit /b 1
)
echo [+] Docker detected.
echo [*] Starting services via Docker Compose...
docker compose up -d --build
if %ERRORLEVEL% neq 0 (
    echo [X] Docker compose failed.
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo ===================================================
echo [+] Docker Compose services started!
echo [*] Application available at http://localhost:3000
echo ===================================================
pause
goto END

:DOCKER_CLI
echo.
echo [*] Checking Docker...
where docker >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [X] Docker is not installed or not in PATH. Please install Docker Desktop.
    pause
    exit /b 1
)
echo [+] Docker detected.
echo [*] Building Docker image 'halonyx'...
docker build -t halonyx .
if %ERRORLEVEL% neq 0 (
    echo [X] Docker build failed.
    pause
    exit /b %ERRORLEVEL%
)
echo [*] Running Docker container 'halonyx-app'...
docker run -d -p 3000:3000 -v halonyx-data:/app/backend/db --name halonyx-app halonyx
if %ERRORLEVEL% neq 0 (
    echo [X] Docker run failed.
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo ===================================================
echo [+] Docker container 'halonyx-app' is running!
echo [*] Application available at http://localhost:3000
echo ===================================================
pause
goto END

:END
ENDLOCAL
