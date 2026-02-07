@echo off
title Blooket Cookie Harvester

echo =====================================
echo   Blooket Cookie Harvester
echo   for Holy Unblocker
echo =====================================
echo.

:: Check if ws module is installed
call npm list ws >nul 2>&1
if errorlevel 1 (
    echo Installing required dependencies...
    call npm install ws --save-dev
    echo.
)

:: Run the harvester script
echo Starting cookie harvester...
echo.
node harvest-cookies.mjs

if errorlevel 1 (
    echo.
    echo Error running harvester. Check the output above.
    pause
    exit /b 1
)

echo.
pause
