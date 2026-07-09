@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 淘宝店铺查询 - 安装

echo ========================================
echo   淘宝店铺查询工具 - 一键安装
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未检测到 Node.js
  echo.
  echo 请先安装 Node.js（选 LTS 版本），安装完成后重新双击本文件。
  echo 正在打开下载页面...
  start "" "https://nodejs.org/zh-cn"
  echo.
  pause
  exit /b 1
)

echo [1/4] Node.js 已就绪
node -v
npm -v
echo.

echo [2/4] 安装后端依赖（首次可能较慢）...
cd /d "%~dp0backend"
call npm install
if errorlevel 1 (
  echo [错误] 后端依赖安装失败
  pause
  exit /b 1
)
echo.

echo [3/4] 安装浏览器内核（Playwright Chromium）...
call npx playwright install chromium
if errorlevel 1 (
  echo [错误] 浏览器内核安装失败，请检查网络后重试
  pause
  exit /b 1
)
echo.

echo [4/4] 构建前端界面...
cd /d "%~dp0frontend"
call npm install
if errorlevel 1 (
  echo [错误] 前端依赖安装失败
  pause
  exit /b 1
)
call npm run build
if errorlevel 1 (
  echo [错误] 前端构建失败
  pause
  exit /b 1
)

if not exist "%~dp0backend\public" mkdir "%~dp0backend\public"
xcopy /E /Y /Q "%~dp0frontend\dist\*" "%~dp0backend\public\" >nul
if errorlevel 1 (
  echo [错误] 复制前端文件失败
  pause
  exit /b 1
)

echo.
echo ========================================
echo   安装完成！请双击「启动.bat」运行
echo ========================================
echo.
pause
