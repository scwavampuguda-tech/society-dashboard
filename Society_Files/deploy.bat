@echo off
title Society Dashboard - Auto Deploy to GitHub
color 0A

set GIT="C:\Program Files\Git\bin\git.exe"
set SOURCE=C:\Users\parkundu\Desktop\Society_Files\HTML_Portals
set REPO=C:\Users\parkundu\Desktop\Society_Repo

set GITHUB_TOKEN=YOUR_TOKEN_HERE
set GITHUB_USER=scwavampuguda-tech
set GITHUB_REPO=society-dashboard

echo.
echo ============================================
echo   SOCIETY DASHBOARD - DEPLOY TO GITHUB
echo ============================================
echo.

echo [1/5] Copying latest HTML files...
copy "%SOURCE%\Society_Dashboard.html"         "%REPO%\Society_Dashboard.html"         /Y >nul
copy "%SOURCE%\Society_Portal.html"            "%REPO%\Society_Portal.html"            /Y >nul
copy "%SOURCE%\Society_Anomaly_Dashboard.html" "%REPO%\Society_Anomaly_Dashboard.html" /Y >nul
copy "%SOURCE%\Society_KYC.html"               "%REPO%\Society_KYC.html"               /Y >nul
copy "%SOURCE%\manifest.json"                  "%REPO%\manifest.json"                  /Y >nul
copy "%SOURCE%\service-worker.js"              "%REPO%\service-worker.js"              /Y >nul
echo     Done!
echo.

echo [2/5] Syncing icons folder...
if not exist "%REPO%\icons" mkdir "%REPO%\icons"
xcopy "%SOURCE%\icons\*.*" "%REPO%\icons\" /Y /Q >nul
echo     Done! Icons synced.
echo.

echo [3/5] Staging all changes...
cd /d "%REPO%"
%GIT% add -A
echo     Done!
echo.

echo [4/5] Committing with timestamp...
for /f "delims=" %%T in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-dd HH:mm\""') do set TIMESTAMP=%%T
%GIT% commit -m "Auto-deploy: %TIMESTAMP%"
echo     Done!
echo.

echo [5/5] Pushing to GitHub...
%GIT% remote set-url origin https://%GITHUB_USER%:%GITHUB_TOKEN%@github.com/%GITHUB_USER%/%GITHUB_REPO%.git
%GIT% push origin main 2>&1

echo.
echo ============================================
echo   SUCCESS! Live in ~60 seconds at:
echo.
echo   Dashboard : https://scwavampuguda-tech.github.io/society-dashboard/Society_Dashboard.html
echo   Portal    : https://scwavampuguda-tech.github.io/society-dashboard/Society_Portal.html
echo   Anomaly   : https://scwavampuguda-tech.github.io/society-dashboard/Society_Anomaly_Dashboard.html
echo ============================================
echo.
pause
