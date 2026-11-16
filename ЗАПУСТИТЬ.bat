@echo off
chcp 65001 >nul

rem AnonLink: file for a double-click.
rem
rem Runs the same checks and the same `pnpm dev` as `node scripts/start.mjs`, but keeps
rem the window open when something fails, so the reason stays readable instead of
rem flashing past. Closing the window or pressing Ctrl+C stops the app.
rem
rem Comments are ASCII on purpose: cmd.exe reads a batch file in the console code page,
rem and non-ASCII text in a comment has broken the parser before.

setlocal
cd /d "%~dp0"

title AnonLink
set PAUSE_ON_ERROR=1

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: Node.js was not found in PATH.
  echo Install it from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

node "%~dp0scripts\start.mjs"
set CODE=%ERRORLEVEL%

if not "%CODE%"=="0" (
  echo.
  echo Startup finished with code %CODE%.
  pause
)

endlocal
exit /b %CODE%
