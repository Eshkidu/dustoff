@echo off
rem Starts Dustoff treating your Xbox controller like a PlayStation / Switch Pro controller,
rem so the new non-Xbox controller path can be tested with an Xbox controller.
set DUSTOFF_PAD=sdl
start "" "%~dp0..\app\node_modules\electron\dist\electron.exe" "%~dp0..\app"
