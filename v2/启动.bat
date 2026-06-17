@echo off
chcp 65001 >nul
cd /d "%~dp0"

:: 首次运行自动安装依赖
if not exist "node_modules" (
    echo 首次运行，正在安装依赖...
    npm install
)

:: 启动开发模式
echo 启动 KiroQ v2.0...
npx electron-vite dev
