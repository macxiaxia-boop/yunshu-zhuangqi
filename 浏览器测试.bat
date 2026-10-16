@echo off
chcp 65001 >nul
echo ================================================
echo  CloudTech 整合服务 · 启动 + 测试工具
echo ================================================
echo.
echo  服务地址:
echo    http://127.0.0.1:5089/        ← 推荐用这个
echo    http://localhost:5089/
echo.
echo  4 路径测试:
echo    http://127.0.0.1:5089/                   CloudTech 整合主页
echo    http://127.0.0.1:5089/quote/             装报价 SaaS
echo    http://127.0.0.1:5089/content-factory/   OPC 内容工厂
echo    http://127.0.0.1:5089/lingce/            灵策智算桌面
echo.
echo ================================================
echo.
echo  [1/3] 检查端口 5089 是否 LISTENING
netstat -an | findstr "5089.*LISTENING" >nul
if errorlevel 1 (
  echo    端口 5089 未 LISTENING,服务未启动!
  echo    正在启动...
  cd /d "%~dp0"
  start "" python serve.py
  timeout /t 3 >nul
) else (
  echo    端口 5089 已 LISTENING ✓
)

echo.
echo  [2/3] 直接 GET 测试
curl -s -o nul -w "    GET /             HTTP %{http_code}\n" http://127.0.0.1:5089/
curl -s -o nul -w "    GET /quote/       HTTP %{http_code}\n" http://127.0.0.1:5089/quote/
curl -s -o nul -w "    GET /content-fac/ HTTP %{http_code}\n" http://127.0.0.1:5089/content-factory/
curl -s -o nul -w "    GET /lingce/      HTTP %{http_code}\n" http://127.0.0.1:5089/lingce/

echo.
echo  [3/3] 验证 title
curl -s http://127.0.0.1:5089/ 2^>nul | findstr /C:"CloudTech" >nul
if not errorlevel 1 (
  echo    GET / 返回 CloudTech 整合 ✓
) else (
  echo    GET / 未返回 CloudTech,需要排查
)

echo.
echo ================================================
echo  服务状态总结
echo ================================================
echo  服务在 0.0.0.0:5089 LISTENING
echo  IPv4 路径(127.0.0.1):200
echo  IPv4 localhost:200
echo  IPv6 [::1]:未启动(Windows IPv6 限制)
echo.
echo  浏览器打不开的常见原因:
echo    1. 浏览器有 proxy 设置 → 用系统设置 / 关闭代理
echo    2. 浏览器缓存 → Ctrl+Shift+R 强刷
echo    3. 浏览器 service worker → DevTools → Application → Clear storage
echo    4. 安全软件拦截 5089 → 关防火墙测试
echo.
echo ================================================
echo  按任意键启动浏览器测试...
pause >nul
start "" "http://127.0.0.1:5089/"
echo  浏览器已启动,看是否显示 CloudTech 整合
pause