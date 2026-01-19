@echo off
setlocal enabledelayedexpansion

REM ==========================================================
REM  billeder.romer-bjorn.org - pull.bat
REM ==========================================================

set REPO=C:\dev\billeder-app
set GIT=c:\portablegit\cmd\git.exe

cd /d "%REPO%" || (
  echo ERROR: Could not cd to %REPO%
  pause
  exit /b 1
)

echo.
echo ===========================================
echo Pulling from GitHub...
echo ===========================================
echo.

REM ---- Ensure clean working tree ----
%GIT% diff --quiet
if errorlevel 1 (
  echo ERROR: Unstaged changes present.
  %GIT% status --short
  pause
  exit /b 1
)

%GIT% diff --cached --quiet
if errorlevel 1 (
  echo ERROR: Staged but uncommitted changes present.
  %GIT% status --short
  pause
  exit /b 1
)

for /f %%A in ('%GIT% ls-files --others --exclude-standard ^| find /c /v ""') do set UNTRACKED=%%A
if not "%UNTRACKED%"=="0" (
  echo ERROR: Untracked files present.
  %GIT% status --short
  pause
  exit /b 1
)

echo -- git pull
%GIT% pull
if errorlevel 1 (
  echo ERROR: git pull failed.
  pause
  exit /b 1
)

echo.
echo Verifying key ignore rules...
%GIT% check-ignore -q data\source\images.json
if not errorlevel 1 (
  echo OK: data/source/images.json is ignored.
) else (
  echo WARNING: images.json ignore rule missing!
)

echo.
echo ===========================================
echo Pull complete.
echo ===========================================
pause
