@echo off
setlocal
REM ==========================================================
REM  billeder.romer-bjorn.org - pull_compromise.bat
REM  Safe pull script that mirrors server-side compromise
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
echo Pulling allowed files from GitHub...
echo ===========================================
echo.

REM ---- Ensure clean working tree (reliable checks) ----
REM Unstaged changes?
%GIT% diff --quiet
if errorlevel 1 (
  echo ERROR: Working tree is not clean. ^(unstaged changes^)
  echo Commit/stash or discard your local changes first.
  %GIT% status --short
  pause
  exit /b 1
)

REM Staged-but-not-committed changes?
%GIT% diff --cached --quiet
if errorlevel 1 (
  echo ERROR: Working tree is not clean. ^(staged changes not committed^)
  echo Commit/stash or discard your local changes first.
  %GIT% status --short
  pause
  exit /b 1
)

REM Untracked files?
for /f %%A in ('%GIT% ls-files --others --exclude-standard ^| find /c /v ""') do set UNTRACKED=%%A
if not "%UNTRACKED%"=="0" (
  echo ERROR: Working tree is not clean. ^(untracked files present^)
  echo Commit/stash or remove the untracked files first.
  %GIT% status --short
  pause
  exit /b 1
)

REM ---- Pull metadata + scripts ----
%GIT% pull || (
  echo ERROR: git pull failed.
  pause
  exit /b 1
)

REM ---- Safety: verify
