@echo off
REM ==========================================================
REM  billeder.romer-bjorn.org - pull_compromise.bat
REM  Safe pull script that mirrors server-side compromise
REM ==========================================================

set REPO=C:\dev\billeder-app

cd /d %REPO% || (
  echo ERROR: Could not cd to %REPO%
  pause
  exit /b 1
)

echo.
echo ===========================================
echo Pulling allowed files from GitHub...
echo ===========================================
echo.

REM ---- Ensure clean working tree ----
c:\portablegit\cmd\git.exe status --porcelain > _git_dirty.tmp
for %%A in (_git_dirty.tmp) do set size=%%~zA
del _git_dirty.tmp

if not "%size%"=="0" (
    echo ERROR: Working tree is not clean.
    echo Commit or stash your local changes first.
    c:\portablegit\cmd\git.exe status --short
    pause
    exit /b 1
)

REM ---- Pull metadata + scripts ----
c:\portablegit\cmd\git.exe pull || (
  echo ERROR: git pull failed.
  pause
  exit /b 1
)

REM ---- Safety: verify ignored patterns still active ----
echo.
echo Verifying .gitignore rules...

c:\portablegit\cmd\git.exe check-ignore -q data\tid\2020-01.geo.json
if not errorlevel 1 (
  echo OK: Large geojson files are ignored.
) else (
  echo WARNING: geojson ignore rules may be broken!
)

c:\portablegit\cmd\git.exe check-ignore -q data\source\images.json
if not errorlevel 1 (
  echo OK: images.json is ignored.
) else (
  echo WARNING: images.json ignore rule missing!
)

echo.
echo ===========================================
echo Pull complete.
echo ===========================================
pause
