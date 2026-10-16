@echo off
chcp 65001 >nul
title 云上室内建筑装饰设计 · 报价系统 v1.0

REM 一键启动脚本 — 双击即可用
echo ================================================
echo   云上室内建筑装饰设计 · 报价系统 v1.0
echo   CLOUD INTERIOR ARCHITECTURAL DESIGN
echo ================================================
echo.

set "INDEX=%~dp0index.html"
if not exist "%INDEX%" (
    echo [错误] 找不到 index.html，请确认在 xhs-quote-app 目录运行。
    pause
    exit /b 1
)

echo [1/3] 检查本地浏览器...
set "BROWSER="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "BROWSER=C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "BROWSER=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" set "BROWSER=C:\Program Files\Microsoft\Edge\Application\msedge.exe"

if "%BROWSER%"=="" (
    echo [警告] 未找到 Chrome/Edge，使用系统默认浏览器
    start "" "%INDEX%"
) else (
    echo [OK] 浏览器: %BROWSER%
)

echo [2/3] 启动报价系统...
start "" "%BROWSER%" "%INDEX%"

echo [3/3] 完成！
echo.
echo ================================================
echo   快捷键:
echo     ? 键       显示快捷键面板
echo     Ctrl + P   打印预览
echo     1 - 8      快速跳转主模块
echo     T          切换主题色
echo     M          打开物料全书
echo     Esc        关闭弹窗
echo ================================================
echo.
timeout /t 3 >nul
exit /b 0