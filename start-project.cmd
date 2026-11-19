@echo off
chcp 65001 >nul
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22.12 至 24.x。启动不会自动安装。
  exit /b 1
)
node "%~dp0scripts\start-project.mjs" --mode=auto
