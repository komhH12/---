@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 淘宝店铺查询

if not exist "%~dp0backend\public\index.html" (
  echo 尚未安装，正在自动执行安装...
  echo.
  call "%~dp0安装.bat"
  if not exist "%~dp0backend\public\index.html" (
    echo [错误] 安装未完成，无法启动
    pause
    exit /b 1
  )
)

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先运行「安装.bat」
  pause
  exit /b 1
)

echo ========================================
echo   淘宝店铺查询工具 正在启动...
echo ========================================
echo.
echo 启动后会自动打开浏览器。
echo 请勿关闭本黑窗口（关掉即停止服务）。
echo 用完后可双击「停止.bat」，或直接关闭本窗口。
echo.

cd /d "%~dp0backend"
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3001"
node src\index.js
pause
