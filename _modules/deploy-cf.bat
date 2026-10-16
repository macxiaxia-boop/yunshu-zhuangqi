@echo off
REM ============================================================
REM   yunshu-zhuangqi · 🅱️ Cloudflare Worker 一键部署
REM   R31202 · 2026-10-16 · v9 持续干模式
REM ============================================================

echo.
echo  ============================================================
echo    🅱️  yunshu-zhuangqi Share Link Worker 部署向导
echo  ============================================================
echo.

REM 1. 检查 wrangler
where wrangler >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] wrangler 未安装
    echo     npm install -g wrangler
    pause
    exit /b 1
)
echo [OK] wrangler:
wrangler --version

REM 2. 检查 Node
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] Node 未安装
    pause
    exit /b 1
)
echo [OK] node:
node --version

echo.
echo ------------------------------------------------------------
echo 步骤 1/3: 登录 Cloudflare (会打开浏览器)
echo ------------------------------------------------------------
wrangler login || goto :error

echo.
echo ------------------------------------------------------------
echo 步骤 2/3: 创建 KV namespace
echo ------------------------------------------------------------
echo 创建 SHARE_KV namespace ...
echo.
echo 你会看到类似输出:
echo   [object Object] { binding = "SHARE_KV", id = "abc123..." }
echo.
echo 复制 id 字段，替换 wrangler.toml 第 12 行的 REPLACE_WITH_REAL_KV_ID
echo.
pause

REM 3. 让用户编辑 wrangler.toml
echo.
echo ------------------------------------------------------------
echo 步骤 3/3: 部署 worker
echo ------------------------------------------------------------
echo 请先手动编辑 wrangler.toml:
echo   - id = "REPLACE_WITH_REAL_KV_ID" 改成步骤 2 拿到的真 ID
echo   - LIST_SECRET = "dev-secret" 改成强密码
echo.
pause
notepad wrangler.toml

echo.
echo 准备部署 ...
wrangler deploy

if %errorlevel% neq 0 goto :error

echo.
echo ============================================================
echo   [OK] 部署成功！
echo ============================================================
echo.
echo Worker URL 类似:
echo   https://yunshu-zhuangqi-share.USERNAME.workers.dev
echo.
echo 下一步:
echo   1. 把 URL 填到 _modules/10-share-link/share-api-mock.js 的 WORKER_URL
echo   2. 在 _integrated.html 测试 [🅱️ 分享业主] 按钮
echo.
pause
exit /b 0

:error
echo.
echo [X] 出错
pause
exit /b 1
