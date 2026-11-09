@echo off
setlocal EnableDelayedExpansion
title CLASS TRACKER - GITHUB SYNC

:: ============================================================
:: 1. DETECT PROJECT DIRECTORY AUTOMATICALLY
:: ============================================================
cd /d "%~dp0"

echo ============================================================
echo           CLASS TRACKER -- GITHUB SYNC
echo ============================================================
echo.
echo Project Directory: %~dp0
echo.

:: ============================================================
:: 2. LOCATE GIT EXECUTABLE (PATH OR GITHUB DESKTOP)
:: ============================================================
echo [1/5] Checking project repository...
set "GIT_FOUND="

:: 1. Check if git is already available in PATH
where git >nul 2>&1
if !errorlevel! equ 0 (
    set "GIT_FOUND=1"
)

:: 2. Check GitHub Desktop bundled Git
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

:: 3. Check standard 64-bit Git for Windows
if not defined GIT_FOUND (
    if exist "%ProgramFiles%\Git\cmd\git.exe" (
        set "PATH=%ProgramFiles%\Git\cmd;%ProgramFiles%\Git\bin;!PATH!"
        set "GIT_FOUND=1"
    )
)

:: 4. Check standard 32-bit Git on 64-bit Windows
if not defined GIT_FOUND (
    if exist "%ProgramFiles(x86)%\Git\cmd\git.exe" (
        set "PATH=%ProgramFiles(x86)%\Git\cmd;%ProgramFiles(x86)%\Git\bin;!PATH!"
        set "GIT_FOUND=1"
    )
)

:: 5. Check User-level Git installs
if not defined GIT_FOUND (
    if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%LOCALAPPDATA%\Programs\Git\bin;!PATH!"
        set "GIT_FOUND=1"
    )
)

if not defined GIT_FOUND (
    echo.
    echo ============================================================
    echo ERROR: Synchronization failed. Please review the error message.
    echo ============================================================
    echo Git could not be found on your computer.
    echo Please make sure Git for Windows or GitHub Desktop is installed.
    echo.
    pause
    exit /b 1
)

:: ============================================================
:: 3. VERIFY GIT REPOSITORY & ACTIVE BRANCH
:: ============================================================
git rev-parse --is-inside-work-tree >nul 2>&1
if !errorlevel! neq 0 (
    echo.
    echo ------------------------------------------------------------
    echo Notice: This project folder has not been initialized with Git yet.
    echo ------------------------------------------------------------
    echo Folder: %~dp0
    echo.
    set "INIT_NOW="
    set /p "INIT_NOW=Would you like to initialize this folder as a Git repository now? (Y/N) [Default: Y]: "
    if not defined INIT_NOW set "INIT_NOW=Y"
    if /i not "!INIT_NOW!"=="Y" (
        echo.
        echo Initialization cancelled. You can also open GitHub Desktop,
        echo click File -^> Add Local Repository, and choose this folder.
        echo.
        pause
        exit /b 1
    )

    echo Initializing Git repository...
    git init >nul 2>&1
    if !errorlevel! neq 0 (
        set "ERROR_STEP=Initializing Git repository (git init)"
        goto :ERROR_HANDLER
    )
    git branch -M main >nul 2>&1

    echo.
    echo If you already created a repository on GitHub, enter its URL below.
    echo (Example: https://github.com/your-username/Class_Participation_Tracker.git)
    echo Press Enter to skip and connect via GitHub Desktop instead.
    set "NEW_REMOTE_URL="
    set /p "NEW_REMOTE_URL=GitHub Repository URL: "
    if defined NEW_REMOTE_URL (
        git remote add origin !NEW_REMOTE_URL! >nul 2>&1
        echo Remote "origin" set to: !NEW_REMOTE_URL!
    )
    echo.
)

set "CURRENT_BRANCH="
for /f "tokens=*" %%B in ('git rev-parse --abbrev-ref HEAD 2^>nul') do (
    set "CURRENT_BRANCH=%%B"
)
if not defined CURRENT_BRANCH set "CURRENT_BRANCH=main"

set "HAS_REMOTE="
set "REMOTE_NAME=origin"
for /f "tokens=1" %%R in ('git remote 2^>nul') do (
    set "REMOTE_NAME=%%R"
    set "HAS_REMOTE=1"
    goto :FOUND_REMOTE
)
:FOUND_REMOTE

echo Git is ready.
if defined HAS_REMOTE (
    echo Repository: Branch "!CURRENT_BRANCH!" ^| Remote "!REMOTE_NAME!"
) else (
    echo Repository: Branch "!CURRENT_BRANCH!" ^| Remote: None configured yet
)
echo.

:: ============================================================
:: 4. CHECK LOCAL CHANGES
:: ============================================================
echo [2/5] Checking local changes...

set /a MOD_COUNT=0
set /a ADD_COUNT=0
set /a DEL_COUNT=0
set /a TOTAL_CHANGES=0

for /f "tokens=1,2*" %%A in ('git status --porcelain 2^>nul') do (
    set /a TOTAL_CHANGES+=1
    set "STATUS_CODE=%%A"
    if "!STATUS_CODE!"=="??" (
        set /a ADD_COUNT+=1
    ) else if "!STATUS_CODE!"=="D" (
        set /a DEL_COUNT+=1
    ) else (
        set /a MOD_COUNT+=1
    )
)

:: Check if local branch has unpushed commits ahead of remote
set /a UNPUSHED_COUNT=0
for /f "tokens=*" %%C in ('git rev-list --count !REMOTE_NAME!/!CURRENT_BRANCH!..HEAD 2^>nul') do (
    set /a UNPUSHED_COUNT=%%C
)

if !TOTAL_CHANGES! equ 0 (
    if !UNPUSHED_COUNT! equ 0 (
        echo.
        echo ============================================================
        echo Your Class Tracker is already up to date.
        echo ============================================================
        echo No modified, new, or deleted files found.
        echo All commits are already pushed to GitHub.
        echo.
        echo Would you like to launch Class Tracker locally now?
        set "START_APP_LOCAL="
        set /p "START_APP_LOCAL=(Y/N) [Default: Y]: "
        if not defined START_APP_LOCAL set "START_APP_LOCAL=Y"
        if /i "!START_APP_LOCAL!"=="Y" (
            echo Starting local development server...
            start http://localhost:5173
            call npm run dev
        )
        exit /b 0
    ) else (
        echo Working directory is clean, but you have !UNPUSHED_COUNT! unpushed commit(s).
    )
) else (
    echo.
    echo ------------------------------------------------------------
    echo Changes detected:
    echo   - Modified files:     !MOD_COUNT!
    echo   - New/Untracked:      !ADD_COUNT!
    echo   - Deleted files:      !DEL_COUNT!
    echo   - Total file changes: !TOTAL_CHANGES!
    echo ------------------------------------------------------------
    echo.
    echo Detailed file list:
    git status -s
    echo.
)

:: ============================================================
:: 5. ASK FOR CONFIRMATION BEFORE SYNCHRONIZING
:: ============================================================
echo.
set /p USER_CONFIRM="Do you want to synchronize these changes with GitHub now? (Y/N) [Default: Y]: "
if not defined USER_CONFIRM set "USER_CONFIRM=Y"
if /i not "!USER_CONFIRM!"=="Y" (
    echo.
    echo Synchronization cancelled by user. Local files were not modified.
    echo.
    pause
    exit /b 0
)

:: ============================================================
:: 6. PREPARE COMMIT MESSAGE WITH CURRENT DATE & TIME
:: ============================================================
echo.
echo [3/5] Preparing GitHub synchronization...

set "TIMESTAMP="
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value 2^>nul') do (
    set "DT=%%I"
    if defined DT (
        set "TIMESTAMP=!DT:~0,4!-!DT:~4,2!-!DT:~6,2! !DT:~8,2!:!DT:~10,2!:!DT:~12,2!"
    )
)
if not defined TIMESTAMP (
    for /f "tokens=*" %%T in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'" 2^>nul') do (
        set "TIMESTAMP=%%T"
    )
)
if not defined TIMESTAMP set "TIMESTAMP=%date% %time%"

set "DEFAULT_COMMIT_MSG=Update Class Tracker - !TIMESTAMP!"
echo.
echo Default commit message: "!DEFAULT_COMMIT_MSG!"
set "CUSTOM_MSG="
set /p CUSTOM_MSG="Enter custom commit message (or press ENTER to use default): "

if defined CUSTOM_MSG (
    if "!CUSTOM_MSG!"=="" (
        set "FINAL_COMMIT_MSG=!DEFAULT_COMMIT_MSG!"
    ) else (
        set "FINAL_COMMIT_MSG=!CUSTOM_MSG! (!TIMESTAMP!)"
    )
) else (
    set "FINAL_COMMIT_MSG=!DEFAULT_COMMIT_MSG!"
)

:: ============================================================
:: 7. STAGE & COMMIT CHANGES
:: ============================================================
if !TOTAL_CHANGES! gtr 0 (
    echo.
    echo [4/5] Committing changes...
    echo Staging all project changes...
    git add -A
    if !errorlevel! neq 0 (
        set "ERROR_STEP=Staging files (git add -A)"
        goto :ERROR_HANDLER
    )

    git commit -m "!FINAL_COMMIT_MSG!"
    if !errorlevel! neq 0 (
        set "ERROR_STEP=Committing changes (git commit)"
        goto :ERROR_HANDLER
    )
    echo Changes successfully committed.
) else (
    echo.
    echo [4/5] No local edits to commit. Preparing to push !UNPUSHED_COUNT! unpushed commit(s)...
)

:: ============================================================
:: 8. CHECK FOR REMOTE CHANGES & PUSH TO GITHUB
:: ============================================================
echo.
echo [5/5] Pushing changes to GitHub...

if not defined HAS_REMOTE (
    echo.
    echo ------------------------------------------------------------
    echo Notice: No remote GitHub repository has been configured yet.
    echo ------------------------------------------------------------
    echo All your changes have been successfully committed locally to branch "!CURRENT_BRANCH!".
    echo.
    echo To push to your GitHub repository now, enter its URL:
    echo (Example: https://github.com/your-username/Class_Participation_Tracker.git)
    echo Or press Enter to publish using GitHub Desktop instead.
    set "ENTERED_REMOTE="
    set /p "ENTERED_REMOTE=GitHub Repository URL: "
    if defined ENTERED_REMOTE (
        git remote add origin !ENTERED_REMOTE! >nul 2>&1
        set "REMOTE_NAME=origin"
        set "HAS_REMOTE=1"
        echo Remote "origin" set. Pushing to GitHub...
        git push -u origin !CURRENT_BRANCH!
        if !errorlevel! neq 0 (
            set "ERROR_STEP=Pushing changes to GitHub (git push -u origin !CURRENT_BRANCH!)"
            goto :ERROR_HANDLER
        )
    ) else (
        echo.
        echo To link to your GitHub account:
        echo 1. Open GitHub Desktop.
        echo 2. Click: File -^> Add local repository (or Ctrl+O).
        echo 3. Select this folder: %~dp0
        echo 4. Click the "Publish repository" button in GitHub Desktop!
        echo.
        goto :SKIP_PUSH_SUCCESS
    )
) else (
    echo Checking for remote updates from GitHub (!REMOTE_NAME!/!CURRENT_BRANCH!)...
    git fetch !REMOTE_NAME! 2>nul

    set /a BEHIND_COUNT=0
    for /f "tokens=*" %%C in ('git rev-list --count HEAD..!REMOTE_NAME!/!CURRENT_BRANCH! 2^>nul') do (
        set /a BEHIND_COUNT=%%C
    )

    if !BEHIND_COUNT! gtr 0 (
        echo Remote has !BEHIND_COUNT! newer commit(s). Pulling updates safely...
        git pull --no-rebase !REMOTE_NAME! !CURRENT_BRANCH! --allow-unrelated-histories
        if !errorlevel! neq 0 (
            echo.
            echo Merge conflict or pull error detected.
            echo To protect your files, no automatic merge was forced.
            echo Please resolve conflicts in GitHub Desktop.
            set "ERROR_STEP=Merging remote updates (git pull)"
            goto :ERROR_HANDLER
        )
    )

    echo Uploading commits to GitHub (!REMOTE_NAME!/!CURRENT_BRANCH!)...
    git push -u !REMOTE_NAME! !CURRENT_BRANCH!
    if !errorlevel! neq 0 (
        set "ERROR_STEP=Pushing changes to GitHub (git push)"
        goto :ERROR_HANDLER
    )
)
:SKIP_PUSH_SUCCESS

:: ============================================================
:: 9. SUCCESS NOTIFICATION
:: ============================================================
echo.
echo ============================================================
echo SUCCESS: Your Class Tracker has been successfully synchronized with GitHub!
echo ============================================================
echo.
echo Summary:
echo   - Target Branch: !CURRENT_BRANCH!
echo   - Remote:        !REMOTE_NAME!
echo   - Commit Message: !FINAL_COMMIT_MSG!
echo   - Status:        Synced with GitHub Desktop ^& GitHub Web
echo.
echo Would you like to launch Class Tracker locally in your browser now?
set "START_APP_NOW="
set /p "START_APP_NOW=(Y/N) [Default: Y]: "
if not defined START_APP_NOW set "START_APP_NOW=Y"
if /i "!START_APP_NOW!"=="Y" (
    echo.
    echo Starting local development server (http://localhost:5173)...
    start http://localhost:5173
    call npm run dev
)
exit /b 0

:: ============================================================
:: 10. ERROR HANDLER
:: ============================================================
:ERROR_HANDLER
echo.
echo ============================================================
echo ERROR: Synchronization failed. Please review the error message.
echo ============================================================
if defined ERROR_STEP echo Failed during step: !ERROR_STEP!
echo.
echo Your local project files remain safe and were NOT overwritten or deleted.
echo.
echo Suggestions:
echo 1. Check your internet connection.
echo 2. Open GitHub Desktop to inspect uncommitted changes or resolve merge conflicts.
echo 3. Ensure you have write permission for this GitHub repository.
echo.
pause
exit /b 1
