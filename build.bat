@echo off
echo === KiroQ Build ===
rmdir /s /q build dist 2>nul
del /q *.spec 2>nul

REM 获取 PIL 路径
for /f "delims=" %%i in ('python -c "import PIL; print(PIL.__path__[0])"') do set PIL_PATH=%%i

python -m PyInstaller --onefile --windowed ^
  --icon=anime_tracker/kiroq.ico ^
  --name KiroQ ^
  --add-data "anime_tracker;anime_tracker" ^
  --add-data "%PIL_PATH%;PIL" ^
  --collect-all customtkinter ^
  --collect-all requests ^
  --collect-all urllib3 ^
  --collect-all charset_normalizer ^
  --collect-all certifi ^
  --collect-all idna ^
  anime_tracker/main.py

echo.
echo === Done: dist\KiroQ.exe ===
pause
