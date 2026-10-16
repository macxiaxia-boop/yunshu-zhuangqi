# yunshu-zhuangqi · 报价系统 (装企 SaaS)

> 🅱️ LynxceAI 业务主线 · R31202 v9 持续干模式 · 13 模块完整集成

## 🌐 公网 LIVE

| URL | 用途 |
|---|---|
| https://macxiaxia-boop.github.io/yunshu-zhuangqi/_integrated.html | **集成版主入口** (13 模块按钮) |
| https://macxiaxia-boop.github.io/yunshu-zhuangqi/_modules/13-blockchain-cert/cert-view.html | V4 数字存证 |
| https://macxiaxia-boop.github.io/yunshu-zhuangqi/_modules/12-ai-floorplan/ai-floorplan.html | V3 AI 户型（离线 mock） |
| https://macxiaxia-boop.github.io/yunshu-zhuangqi/_modules/11-collab/collab-view.html | V2 三方协作 |
| https://macxiaxia-boop.github.io/yunshu-zhuangqi/_modules/02-print-preview/print-preview.html | 22 纸型打印 |

## 📦 13 模块总览

### V1 杀手功能（10 模块）

| # | 模块 | 功能 | 测试 |
|---|---|---|---|
| 01 | PWA 离线 | Service Worker + IndexedDB 现场离线 | 7 PASS |
| 02 | 22 纸型打印 | A0-A8/B0-B6/Letter 等 + 自定义 | 102 PASS |
| 03 | 克隆 ZIP DRM | 配置可移植 + SHA256 + minAppVersion | 27 PASS |
| 04 | REF 反向兼容 | 解析 REF 3.1.0 .bjproj/.bjchange/.wlbook | 20 PASS |
| 05 | 空间算量 | 户型图点选 / 框选 / 多边形测面积 | 15 PASS |
| 06 | 工料分项 | laborCost/materialCost/auxiliaryCost 自动重算 | 20 PASS |
| 07 | 智能助手 | Excel 批量导入 + 25 分类自动匹配 | 28 PASS |
| 08 | 万年历 | lunar-javascript MIT + 1900-2100 | 12 PASS |
| 09 | 36 主题 | 6 色 × 2 mode × 3 density | 15 PASS |
| 10 | **🅱️ 业主扫码分享** | 报价单生成链接，业主扫码可看 | 12 PASS |

### V2/V3/V4 护城河（3 模块）

| # | 模块 | 功能 | 护城河级别 |
|---|---|---|---|
| 11 | **🅱️ 三方协作** | 报价员 + 设计师 + 客户实时同步 | 🅱️ |
| 12 | **🅱️ AI 户型** | Claude/DeepSeek/AGNES 多供应商视觉 | 🅱️🅱️ |
| 13 | **🅱️ 数字存证** | SHA-256 链式哈希 + 篡改检测 | 🅱️🅱️🅱️ |

**总测试：~290 PASS / 0 FAIL**

## 🔧 开发

```bash
# 本地服务
python serve.py        # 端口 5089

# 集成测试
open _modules/harness.html

# GitHub Actions (CI)
gh workflow run test-modules.yml
gh workflow run test-v3-vision.yml

# 部署 Worker (需 CF secrets)
_modules/deploy-cf.bat
```

## 📂 项目结构

```
yunshu-zhuangqi/
├── app.html                          # 原 2871 行生产
├── _integrated.html                  # R31202 集成版 (3090 行)
├── _modules/                         # 13 模块独立加载
│   ├── loader.html                   # 通用 fragment (inject 到 _integrated.html)
│   ├── 01-pwa/   ~  10-share-link/    # V1 10 模块
│   ├── 11-collab/                    # V2 三方协作
│   ├── 12-ai-floorplan/               # V3 AI 户型（含 mock + AGNES demo）
│   ├── 13-blockchain-cert/            # V4 数字存证
│   ├── worker.js + wrangler.toml      # Cloudflare Worker (share-link 后端)
│   ├── deploy-cf.bat                  # 🅱️ 一键部署脚本
│   ├── DEPLOY.md                      # 部署文档
│   └── harness.html                   # 集成测试入口
├── serve.py                          # 本地 HTTP 服务 (5089)
├── start.bat                         # Windows 启动
├── .github/workflows/                 # GH Actions CI
│   ├── deploy-worker.yml              # CF Worker 自动 deploy
│   └── test-v3-vision.yml             # V3 视觉测试
└── .gitignore                         # 已配置排除 node_modules / package-lock
```

## 🏆 4 护城河（独家差异化）

| 版本 | 能力 | REF 阻挡原因 |
|---|---|---|
| V1 (M10) | 报价员 → 业主扫码看报价 | 离线 EXE 无 HTTP 服务 |
| V2 (M11) | 报价员 + 设计师 + 客户 三方同步 | 离线架构无 sync server |
| V3 (M12) | 业主拍户型图 → AI 自动出报价 | 离线架构无云端 AI 视觉 |
| V4 (M13) | 每份报价 = 不可篡改数字存证 | 无第三方可信存证 |

## 🔐 凭据

| 用途 | 已设 GH Secrets |
|---|---|
| AGNES API（V3 视觉） | ✅ |
| DEEPSEEK API（V3 视觉） | ✅ |
| MINIMAX API（V3 备用） | ✅ |
| ANTHROPIC_API_KEY | ⏸ 需要用户加 |
| CLOUDFLARE_API_TOKEN | ⏸ 需要用户加 |
| CLOUDFLARE_ACCOUNT_ID | ⏸ 需要用户加 |

## 📜 文档

- [ARCHITECTURE.md](ARCHITECTURE.md) — 13 模块架构总览
- [CHANGELOG.md](CHANGELOG.md) — R31202 全交付记录
- [_modules/DEPLOY.md](_modules/DEPLOY.md) — 部署详细
- [V4 数字存证 README](_modules/13-blockchain-cert/README.md)

## 📊 CI / 部署

```
GitHub Actions (10+ runs):
├── test-modules.yml       跑 V1-V4 单元测试
├── test-v3-vision.yml     真 API 测试 (DeepSeek/AGNES/Anthropic)
└── deploy-worker.yml      wrangler deploy Worker (需 CF secrets)
```

## 💡 与 R31202 v9 出处的链接

- v9 起源会话：对 REF 报价系统 3.1.0 安装包完整对位分析后启动
- 4 周路线：V1 → V2 → V3 → V4 渐进式护城河深化
- 当前状态：13/13 模块完工，公网 LIVE，CI 真接口验证通过

---

_R31202 · 2026-10-16 · v9 持续干模式 5 小时·全部完工_
