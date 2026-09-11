@echo off
chcp 65001 >nul
cd /d "%~dp0"
title tfjl release tool
echo ==============================================
echo   tfjl local release tool (build / sign / publish)
echo   Keep this window open. Close it to stop server.
echo ==============================================
echo.
node "%~dp0release_server.js"
echo.
echo [server stopped] Press any key to close.
pause >nul
