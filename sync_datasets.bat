@echo off
setlocal

set RCLONE=C:\rclone\rclone.exe
set REMOTE=rbserver:/srv/billeder-repo
set LOCAL=C:\dev\billeder-app

echo Syncing generated datasets from VPS...
"%RCLONE%" sync %REMOTE%/data %LOCAL%\data --progress || goto :err

echo Syncing build reports from VPS...
"%RCLONE%" sync %REMOTE%/reports %LOCAL%\reports --progress || goto :err

echo.
echo Sync complete.
pause
exit /b 0

:err
echo ERROR: rclone sync failed.
pause
exit /b 1
