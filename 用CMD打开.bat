@echo off
chcp 65001 >nul
title CloudTech 整合服务

:menu
cls
echo ================================================
echo  CloudTech 整合服务 · 浏览器测试菜单
echo  服务状态:LISTENING 0.0.0.0:5089 (5 IP 全 200)
echo ================================================
echo.
echo  [1] 用 127.0.0.1 打开 (推荐)
echo  [2] 用 localhost 打开
echo  [3] 用 192.168.1.17 打开 (局域网 IP)
echo  [4] 用 172.20.224.1 打开
echo  [5] 隐身模式 (新 Edge)
echo  [6] 隐身模式 (新 Chrome)
echo  [7] 退出
echo.
set /p choice=选择 (1-7):

if "%choice%"=="1" start "" "http://127.0.0.1:5089/"
if "%choice%"=="2" start "" "http://localhost:5089/"
if "%choice%"=="3" start "" "http://192.168.1.17:5089/"
if "%choice%"=="4" start "" "http://172.20.224.1:5089/"
if "%choice%"=="5" (
  start msedge.exe --incognito "http://127.0.0.1:5089/"
)
if "%choice%"=="6" (
  start chrome.exe --incognito "http://127.0.0.1:5089/"
)
if "%choice%"=="7" exit

echo.
echo  浏览器已打开,请查看.
echo  提示:如果仍打不开,试 [5] 隐身模式(新 Edge)
echo.
pause
goto menu