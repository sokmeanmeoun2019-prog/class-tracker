@echo off
setlocal EnableDelayedExpansion
title CLASS TRACKER - GITHUB SYNC
cd /d "%~dp0"

echo ============================================================
echo           CLASS TRACKER -- GITHUB SYNC
echo ============================================================
echo.
echo Project Directory: %~dp0
echo.

:: 1. LOCATE GIT (PATH OR GITHUB DESKTOP)
set "GIT_FOUND="
where git >nul 2>&1
if !errorlevel! equ 0 set "GIT_FOUND=1"

if not defined GIT_FOUND (
    if exist "%LOCALAPPDATA%\GitHubDesktop" (
        for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do (
            if exist "%%D\resources\app\git\cmd\git.exe" (
                set "PATH=%%D\resources\app\git\cmd;%%D\resources\app\git\bin;!PATH!"
                set "GIT_FOUND=1"
            )
        )
    )
)

if not defined GIT_FOUND (
    if exist "%ProgramFiles%\Git\cmd\git.exe" (
        set "PATH=%ProgramFiles%\Git\cmd;%ProgramFiles%\Git\bin;!PATH!"
        set "GIT_FOUND=1"
    )
)

if not defined GIT_FOUND (
    if exist "%ProgramFiles(x86)%\Git\cmd\git.exe" (
        set "PATH=%ProgramFiles(x86)%\Git\cmd;%ProgramFiles(x86)%\Git\bin;!PATH!"
        set "GIT_FOUND=1"
    )
)

if not defined GIT_FOUND (
    echo ERROR: Git could not be found. Please ensure GitHub Desktop is installed.
    pause
    exit /b 1
)

:: 2. STAGE & COMMIT LOCAL CHANGES
echo [1/3] Staging project files...
git branch -M main >nul 2>&1
git add -A >nul 2>&1
git commit -m "Update Class Tracker - %date% %time%" >nul 2>&1

:: 3. CONFIGURE REMOTE & RECONCILE UNRELATED REMOTE COMMITS
echo [2/3] Connecting to GitHub repository (class-tracker)...
git remote set-url origin https://github.com/sokmeanmeoun2019-prog/class-tracker.git >nul 2>&1
if !errorlevel! neq 0 (
    git remote add origin https://github.com/sokmeanmeoun2019-prog/class-tracker.git >nul 2>&1
)

echo Fetching remote updates...
git fetch origin main >nul 2>&1

echo Reconciling remote commits safely (preserving all local code)...
git pull --no-rebase origin main --allow-unrelated-histories -X ours -m "Sync Class Tracker with GitHub" >nul 2>&1

:: 4. PUSH TO GITHUB
echo [3/3] Uploading all updates to GitHub...
git push -u origin main
if !errorlevel! neq 0 (
    echo Finalizing push with force-with-lease...
    git push -u origin main --force-with-lease
)

if !errorlevel! neq 0 (
    echo.
    echo ============================================================
    echo ERROR: Push failed.
    echo Please check your internet connection or sign-in in GitHub Desktop.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo SUCCESS: Your Class Tracker has been successfully synchronized with GitHub!
echo ============================================================
echo.
echo Live website: https://sokmeanmeoun2019-prog.github.io/class-tracker/
echo (GitHub Actions is now compiling and deploying your site automatically)
echo.
echo Would you like to launch Class Tracker locally now?
set "START_APP="
set /p "START_APP=(Y/N) [Default: Y]: "
if not defined START_APP set "START_APP=Y"
if /i not "!START_APP!"=="Y" exit /b 0

:: 5. LOCATE NODE.JS / NPM
set "NPM_FOUND="
where npm >nul 2>&1
if !errorlevel! equ 0 set "NPM_FOUND=1"

if not defined NPM_FOUND if exist "!ProgramFiles!\nodejs\npm.cmd" (
    set "PATH=!ProgramFiles!\nodejs;!PATH!"
    set "NPM_FOUND=1"
)
if not defined NPM_FOUND if exist "!ProgramFiles(x86)!\nodejs\npm.cmd" (
    set "PATH=!ProgramFiles(x86)!\nodejs;!PATH!"
    set "NPM_FOUND=1"
)
if not defined NPM_FOUND if exist "!LOCALAPPDATA!\Programs\nodejs\npm.cmd" (
    set "PATH=!LOCALAPPDATA!\Programs\nodejs;!PATH!"
    set "NPM_FOUND=1"
)

if not defined NPM_FOUND (
    echo.
    echo ============================================================
    echo ERROR: Node.js / npm was not found on this computer.
    echo Please install Node.js LTS from https://nodejs.org/ and try again.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\vite" (
    echo.
    echo Installing app dependencies for first launch...
    call npm install
    if !errorlevel! neq 0 (
        echo.
        echo ERROR: Dependency installation failed.
        pause
        exit /b 1
    )
)

echo.
echo ============================================================
echo Starting local development server at http://localhost:5173...
echo Your browser will open automatically once the server is ready.
echo Keep this window open while using Class Tracker.
echo ============================================================
echo.
call npm run dev -- --open
if !errorlevel! neq 0 (
    echo.
    echo ============================================================
    echo ERROR: Local server failed to start or stopped unexpectedly.
    echo ============================================================
    echo.
    pause
    exit /b 1
)
exit /b 0
