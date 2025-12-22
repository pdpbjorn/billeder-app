rem opdater droppede filers data via brugerbidrag
@echo off
set /P dateTime="hvornaar?"
for %%a in (%*) do c:/exiftool/exiftool.exe  -overwrite_original "-alldates=%dateTime%" %%a
rem echo [%%a] was dropped on me 
rem echo til tiden %dateTime%
pause