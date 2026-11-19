@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "node_modules\tsx\dist\cli.mjs" (
  echo 请先运行 npm ci 和 npm run build。
  exit /b 1
)
node --import tsx server\cli.ts start
