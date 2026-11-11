@echo off
title Release Dustoff
cd /d "%~dp0.."
node tools\release.js
echo.
pause
