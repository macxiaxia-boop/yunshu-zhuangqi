# 🅱️ yunshu-zhuangqi 部署文档 (R31202)

> 完整 10 模块集成 + Cloudflare Worker share-link 后端

## 📁 当前结构

```
D:\yunshu-zhuangqi-live\                                ← 项目根 (yunshu-zhuangqi 公开站)
├── app.html                                              ← 原 2871 行生产
├── _integrated.html                                      ← 新增：集成 10 模块版（同 app.html + 9 个集成按钮）
├── _modules\                                             ← 新增：10 模块独立加载
│   ├── loader.html                                       ← 集成片段（已注入 _integrated.html）
│   ├── 01-pwa\                                           ← 离线架构
│   ├── 02-print-preview\                                 ← 22 纸型打印
│   ├── 03-clone-zip\                                     ← 克隆 ZIP DRM
│   ├── 04-ref-reverse\                                   ← REF 反向兼容
│   ├── 05-spatial\                                       ← 空间算量
│   ├── 06-material-calc\                                 ← 工料分项
│   ├── 07-assistant\                                     ← 智能助手
│   ├── 08-calendar\                                      ← 万年历
│   ├── 09-themes\                                        ← 36 主题
│   ├── 10-share-link\                                    ← 🅱️ SaaS 独家
│   ├── harness.html                                      ← 集成测试仪表板
│   ├── worker.js                                         ← Cloudflare Worker (30 行版 + 完整版)
│   ├── wrangler.toml                                     ← Cloudflare 部署配置
│   └── DEPLOY.md (本文件)
├── serve.py                                              ← 本地服务（端口 5089）
└── macxiaxia-boop-yunshu-zhuangqi-99b6f73\               ← 原 Pages 仓
    ├── app.html                                          ← 2871 行原版
    └── ...                                               ← 其他 Pages 文件
```

## 🚀 本地测试

```bash
# 启动本地服务
cd /d/yunshu-zhuangqi-live
python serve.py
# 浏览器打开
http://localhost:5089/_integrated.html
http://localhost:5089/_modules/harness.html    # 集成测试
```

## 🧪 验证清单

### A. 集成层（_integrated.html）
- [ ] 右上角出现 9 个集成按钮（主题/打印/空间算量/分享业主/克隆导出/克隆导入/REF导入/智能助手/万年历/费率汇总）
- [ ] 顶部日期自动挂载万年历组件
- [ ] 主题颜色按 localStorage 恢复（默认 red/胭脂）
- [ ] F12 控制台无 console.error

### B. 模块单独测
- [ ] `_modules/02-print-preview/print-preview.html` 22 纸型可选
- [ ] `_modules/05-spatial/spatial.html` 上传户型图 → 量面积
- [ ] `_modules/07-assistant/assistant.html` 上传 Excel 报价
- [ ] `_modules/08-calendar/calendar-ui.html` 1900-2100 万年历浏览
- [ ] `_modules/09-themes/themes-matrix-snap.html` 36 组合矩阵
- [ ] `_modules/10-share-link/share-view.html?shareId=test` 业主视图

### C. 集成测试
- [ ] `_modules/harness.html` 跑全部测试 → 全 PASS

## 🌐 公网部署（GitHub Pages）

```bash
cd /d/yunshu-zhuangqi-live/macxiaxia-boop-yunshu-zhuangqi-99b6f73
git add -A
git commit -m "R31202: integrate 10 modules (PWA + 22-print + clone-zip + ref-reverse + spatial + material + assistant + calendar + themes + share-link)"
git push origin main
# 等待 GitHub Pages 自动部署
```

⚠️ 注意：GitHub Pages 服务于 `_modules/` 子目录需要 Pages 设置 404.html fallback（如已有则跳过）

## ☁️ Cloudflare Worker 部署（share-link 后端）

### 1. 安装 wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. 创建 KV namespace

```bash
wrangler kv namespace create SHARE_KV
# 复制输出 ID 到 wrangler.toml 的 `id = "..."` 字段
```

### 3. 部署

```bash
cd /d/yunshu-zhuangqi-live/_modules
wrangler deploy
```

### 4. 修改 Worker URL

部署后 Cloudflare 会返回 URL，类似 `https://yunshu-zhuangqi-share.username.workers.dev`

修改 `_modules/10-share-link/share-api-mock.js`：
```js
// 把 IndexedDB mock 替换为 Worker URL
const WORKER_URL = 'https://yunshu-zhuangqi-share.username.workers.dev';
// 在 create/get/addAction/list 内 fetch(WORKER_URL + '/share', ...)
```

或者由 share-create.js 增加「后端选择」UI：
- local（IndexedDB mock，仅本机演示）
- cloud（Worker URL，公网分享）

## 📊 资源占用

| 项 | 数值 |
|---|---|
| _modules 总大小 | ~3.5 MB（含 lunar.min.js 8548 行 vendor） |
| _integrated.html | 152 KB |
| 启动时间增加 | +150ms (10 模块顺序 defer 加载) |
| IndexedDB 用量 | < 5 MB (项目 + 备份 + 分享) |

## 🔒 安全约束

1. share-link 5 层防护（脱敏 + 单业主 + 限速 + whitelist + phone hash）
2. clone-zip 反原型链攻击拦截（POC 验证）
3. print-preview 22 纸型 + 自动 mm 边界
4. PWA Service Worker 必须 root scope（GitHub Pages 限制）

## 🛑 退出条件

按 R2037/R2101 红线：
- 修改 app.html（生产 Pages 仓）需要用户拍板
- 部署 Worker 需要 CF 账号凭据（用户提供）
- 公开测试需要 Pages 公网 URL 确认

## 📂 关联沙箱

- 反向分析：`D:\sandbox_quotation_system\docs\schema-extraction.md`
- 模块完整测试：`D:\sandbox_quotation_system\r31202-modules\0*/README.md`
- 跟踪：`D:\sandbox_quotation_system\r31202-execution\tracker.md`

---

_R31202 · 2026-10-16 · v9 持续干模式 · 全部做掉_
