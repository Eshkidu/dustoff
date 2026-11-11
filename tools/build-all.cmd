@echo off
rem Rebuilds both installers from the same app code:
rem   dist\DustoffSetup.exe         full version for friends (includes Switch)
rem   dist\DustoffSetup-Public.exe  public version (no Switch emulator)
cd /d "%~dp0.."
node tools\build-installer.js || exit /b 1
node tools\build-installer.js --public || exit /b 1
echo.
echo Both installers are in %cd%\dist
