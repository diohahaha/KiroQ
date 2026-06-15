@echo off
echo === KiroQ Build ===
rmdir /s /q build dist 2>nul
del /q *.spec 2>nul

REM 下载 ffmpeg（如果还没有）
if not exist "anime_tracker\bin\ffmpeg.exe" (
    echo Downloading ffmpeg...
    curl -L -o ffmpeg_temp.zip "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
    mkdir anime_tracker\bin 2>nul
    powershell -Command "Expand-Archive ffmpeg_temp.zip ffmpeg_temp -Force; $d=Get-ChildItem ffmpeg_temp -Directory | Select-Object -First 1; Copy-Item \"$($d.FullName)\bin\ffmpeg.exe\" anime_tracker\bin\ffmpeg.exe; Copy-Item \"$($d.FullName)\bin\ffprobe.exe\" anime_tracker\bin\ffprobe.exe"
    rmdir /s /q ffmpeg_temp 2>nul
    del /q ffmpeg_temp.zip 2>nul
    echo Done.
)

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
