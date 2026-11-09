@echo off
title Class Participation Tracker
cd /d "d:\Building App\Class Participation_Tracker"
echo ========================================================
echo   Starting Teacher Sokmean - Class Participation Tracker
echo ========================================================
echo.
if not exist "node_modules\firebase" (
    echo Installing missing Firebase package... Please wait 30-60 seconds...
    call npm install
    echo.
)
echo Opening browser to http://localhost:5173 ...
start http://localhost:5173
echo Running local server...
call npm run dev
pause
