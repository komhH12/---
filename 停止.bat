@echo off
chcp 65001 >nul
title 停止淘宝店铺查询

echo 正在停止服务...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)
echo 已停止。
timeout /t 2 >nul
