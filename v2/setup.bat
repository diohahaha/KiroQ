@echo off
echo === KiroQ 环境准备 ===

:: 下载 ffmpeg（精简版，约 10MB 压缩包）
if not exist "bin\ffmpeg.exe" (
    echo 下载 ffmpeg...
    mkdir bin 2>nul
    curl -L -o bin\ffmpeg.zip "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
    tar -xf bin\ffmpeg.zip -C bin --strip-components=2 */bin/ffmpeg.exe */bin/ffprobe.exe
    del bin\ffmpeg.zip
    echo ffmpeg 安装完成
) else (
    echo ffmpeg 已存在
)

echo === 完成 ===
pause
