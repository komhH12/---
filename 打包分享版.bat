@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 打包分享版

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$proj=(Get-Location).Path; $out=Join-Path $proj 'release\淘宝店铺查询工具'; if(Test-Path (Join-Path $proj 'release')){Remove-Item -Recurse -Force (Join-Path $proj 'release') -ErrorAction SilentlyContinue}; New-Item -ItemType Directory -Force -Path (Join-Path $out 'backend\src'),(Join-Path $out 'frontend\src')|Out-Null; Copy-Item (Join-Path $proj 'backend\package.json') (Join-Path $out 'backend\'); Copy-Item (Join-Path $proj 'backend\package-lock.json') (Join-Path $out 'backend\'); Copy-Item (Join-Path $proj 'backend\src\*') (Join-Path $out 'backend\src\') -Recurse; Copy-Item (Join-Path $proj 'frontend\package.json') (Join-Path $out 'frontend\'); Copy-Item (Join-Path $proj 'frontend\package-lock.json') (Join-Path $out 'frontend\'); Copy-Item (Join-Path $proj 'frontend\index.html') (Join-Path $out 'frontend\'); Copy-Item (Join-Path $proj 'frontend\vite.config.js') (Join-Path $out 'frontend\'); Copy-Item (Join-Path $proj 'frontend\src\*') (Join-Path $out 'frontend\src\') -Recurse; if(Test-Path (Join-Path $proj 'frontend\public')){Copy-Item (Join-Path $proj 'frontend\public') (Join-Path $out 'frontend\public') -Recurse}; Copy-Item (Join-Path $proj '安装.bat'),(Join-Path $proj '启动.bat'),(Join-Path $proj '停止.bat'),(Join-Path $proj '使用说明.txt') $out; $zip=Join-Path $proj 'release\淘宝店铺查询工具.zip'; Compress-Archive -Path $out -DestinationPath $zip -Force; Write-Host ('打包完成: ' + $zip); Write-Host ('大小: ' + [math]::Round((Get-Item $zip).Length/1MB,2) + ' MB')"

echo.
echo(Package ready: release\淘宝店铺查询工具.zip
echo(Send the zip. User runs install.bat, then start.bat.
echo.
pause
