@echo

c:\exiftool\exiftool.exe -r --printConv -ext jpg -fast -ignore .thumb -printFormat geojson.fmt C:\Apache24\htdocs\Foto\kamera > images.geo.json

echo done.
pause
