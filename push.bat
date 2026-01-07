@echo off
setlocal

REM Change this to the path where GitPortable's git.exe is located if needed
REM If git is on PATH, this will just work.
set GIT=c:\portablegit\cmd\git.exe

echo === Git status ===
%GIT% status

echo.
echo === Staging all changes ===
%GIT% add -A

echo.
set /p MSG=Commit message: 
if "%MSG%"=="" (
  echo No message entered. Aborting.
  exit /b 1
)

echo.
echo === Commit ===
%GIT% commit -m "%MSG%"

echo.
echo === Push ===
%GIT% push

echo.
echo Done.
endlocal
