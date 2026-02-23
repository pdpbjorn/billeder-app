@echo off
setlocal

set GIT=c:\portablegit\cmd\git.exe

echo === Git status ===
%GIT% status

echo.
echo === Staging all changes ===
%GIT% add -A

echo.
echo === Staged changes ===
%GIT% diff --cached --stat

REM Abort if nothing staged
%GIT% diff --cached --quiet
if not errorlevel 1 (
  echo.
  echo Nothing to commit.
  echo Done.
  exit /b 0
)

echo.
set /p MSG=Commit message:
if "%MSG%"=="" set MSG=PC update

echo.
echo === Commit ===
%GIT% commit -m "%MSG%"
if errorlevel 1 (
  echo ERROR: commit failed.
  pause
  exit /b 1
)

echo.
echo === Push ===
%GIT% push -u origin main
if errorlevel 1 (
  echo ERROR: push failed. You may need to pull/merge first.
  pause
  exit /b 1
)

echo.
echo Done.
endlocal
