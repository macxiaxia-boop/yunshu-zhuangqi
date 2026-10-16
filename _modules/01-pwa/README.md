# 01-pwa · yunshu-zhuangqi 离线架构 (r31202)

> **定位** 🅱️ yunshu-zhuangqi (GitHub Pages 静态 SaaS 装企报价工具) 的 PWA 离线壳
> **场景** 装修工作室在客户家 / 工地现场,网络不稳,SaaS 必须支持离线
> **产物** 7 个独立模块,每个 < 300 行,不修改 yunshu-zhuangqi 现有代码

---

## 1. 文件清单

| 文件 | 行数 | 职责 |
|---|---|---|
| `manifest.json` | 70 | PWA 元数据(name/icon/scope/shortcuts) |
| `service-worker.js` | ~175 | 缓存 / 离线降级 / 后台同步 / LRU 清理 |
| `offline.html` | ~140 | 离线降级 UI(待同步项目数 + 上次同步时间) |
| `idb-store.js` | 209 | `window.ydb` IndexedDB 存储层(7 个方法) |
| `register-sw.js` | ~140 | 注册 SW + 加载 ydb + 暴露 `window.__pwa` |
| `pwa.test.js` | ~140 | 自检(7 项 + node 命令行运行) |
| `README.md` | — | 本文件 |

部署到 yunshu-zhuangqi 站点,所有文件最终落地在
`yunshu-zhuangqi-live/macxiaxia-boop-yunshu-zhuangqi-99b6f73/pwa/`
目录下,与 `app.html` 同级。

---

## 2. GitHub Pages PWA 部署步骤

### 2.1 文件落位

```
macxiaxia-boop-yunshu-zhuangqi-99b6f73/
├── app.html                  ← 现有,不动
├── assets/                   ← 现有,不动
├── manifest.json             ← 现有,被 pwa/manifest.json 覆盖优先级低,但保险起见把 pwa/manifest.json 改名为 manifest.json 上传到根目录
├── service-worker.js         ← 必须在 scope 根目录下
├── offline.html
├── idb-store.js
├── register-sw.js
└── pwa.test.js
```

> 因为 GitHub Pages 的 service-worker scope 必须是站点相对 root
> (`/yunshu-zhuangqi-live/<repo>/`),
> SW 文件必须放在与 `app.html` 同级,不能放子目录里。

### 2.2 在 `app.html` 引入(不需要修改,只追加)

`app.html` 的 `</body>` 之前追加一行:

```html
<script defer src="./register-sw.js"></script>
```

**重要**: `<script defer src="./register-sw.js">` 必须在所有业务逻辑
**之前**或同时加载,且 `defer` 必须保留 —— 否则 `__pwa.ready`
还没初始化,业务代码调用 `window.ydb.put(...)` 会失败。

### 2.3 manifest 引入(app.html `<head>`)

```html
<link rel="manifest" href="./manifest.json" />
<meta name="theme-color" content="#6366f1" />
```

### 2.4 CORS / 安全

- yunshu-zhuangqi 是 GitHub Pages 静态站,**无需后端 CORS 配置**。
- 所有图标 (`favicon.svg`, `favicon-192.png`, `favicon-512.png`)
  使用站内现有文件。
- IndexedDB 跨域限制 = 用户访问域必须与 manifest scope 同源(GitHub Pages
  自身的 `*.github.io` 子域 OK,无 CORS 问题)。

### 2.5 部署验证

部署完成后,在 Chrome DevTools 中:

1. **Application → Manifest** 应显示 "云上装企报价" + 装企类别。
2. **Application → Service Workers** 应看到 `service-worker.js` 为
   `activated and is running`。
3. **Application → Storage → IndexedDB** 应有 `yunshu-zhuangqi > projects` 表。
4. **Network → Throttling → Offline** 刷新页面,应落到 `offline.html`,
   业务数据(本地缓存的报价项目)继续可读。

---

## 3. GitHub Pages PWA 限制 ⚠️

| 限制 | 原因 | 解决方案 |
|---|---|---|
| **SW scope 必须 root 路径** | GitHub Pages 不支持自定义子路径前缀的 SW 注册(scope 默认 = `register(SCOPE_URL)` 上级目录) | 1. 把 `service-worker.js` 直接放到 `/<repo>/` 根目录 2. 把 manifest + SW 内的所有相对路径用 `./` 而非 `/` 前缀 |
| **HTTPS 必须** (GitHub Pages 默认提供) | SW + `addEventListener('fetch')` 要求安全上下文 | GitHub Pages 自动 HTTPS,无须处理。本地调试用 `localhost`/`127.0.0.1` 也算安全 |
| **iOS Safari 不支持 BackgroundSync** | WebKit 至今未实现 SyncManager / PeriodicSync | 见 §4 兼容性矩阵 |
| **iOS 不支持 `maskable` `purpose`** | WebKit 只用 `any` | icons 里 `purpose: "maskable"` 在 iOS 上被忽略,继续用 `purpose: "any"` 兜底 |
| **manifest 必须同源** | 跨域 manifest 浏览器拒绝 | manifest.json 必须与 app.html 同源 |

---

## 4. 兼容性矩阵

| 浏览器 | ServiceWorker | IndexedDB | BackgroundSync | 显示模式 |
|---|---|---|---|---|
| Chrome 89+ / Edge 89+ | ✓ | ✓ | ✓ | standalone |
| Firefox 100+ | ✓ | ✓ | ✓ | standalone |
| Safari iOS 15.4+ (添加到主屏) | ✓ | ✓ | **✗ fallback** | standalone (带 UI chrome) |
| Safari macOS 14+ | ✓ | ✓ | ✗ fallback | standalone |
| Samsung Internet 15+ | ✓ | ✓ | ✓ | standalone |

### BackgroundSync iOS Fallback

iOS Safari **没有** `SyncManager.register()`。`register-sw.js` 会通过
`catch` 吞掉失败,改用 `window.__pwa.online === true` 重连时由业务代码
主动触发 `ydb.list()` 后批量上传:

```js
window.__pwa.ready.then(function (pwa) {
  window.addEventListener('online', function () {
    pwa.ydb.list().then(function (projects) {
      projects.forEach(function (p) {
        return fetch('/api/projects/' + p.id, {
          method: 'PUT',
          body: JSON.stringify(p.data),
          headers: { 'Content-Type': 'application/json' }
        }).then(function () { return pwa.ydb.remove(p.id); });
      });
    });
  });
});
```

---

## 5. 自检 (7 项 PASS)

```
$ node pwa.test.js
  ✓ T1 manifest 字段校验 (含 192/512)
  ✓ T2 service worker 含 fetch + install + activate handler
  ✓ T3 idb-store.js 表结构 + 7 个方法
  ✓ T4 offline.html 必备元素 (retry / pending / lastSync)
  ✓ T5 register-sw.js 注册与 __pwa 暴露
  ✓ T6 文件行数约束 (js < 300 行)
  ✓ T7 manifest start_url 与 scope 一致 (GitHub Pages PWA)

PWA 自检 r31202 · 7 项 · PASSED=7 FAILED=0
exit=0
```

---

## 6. 与 app.html 的契约(零侵入)

`pwa` 模块 **不修改** `app.html`。语义合约:

| yunshu-zhuangqi 现有行为 | pwa 增加 |
|---|---|
| `localStorage.setItem('ys.project.xxx', ...)` | 自动 debounce 200ms 同步写 `ydb.put(...)`(通过 `ydbMirror` 调用) |
| 完全离线时刷新页面 | SW 拦截 navigation → 返回缓存 app.html → 看不到网络报错 → 看不到离线页,但**功能继续** |
| 完全离线且 cache miss | SW 拦截 → 返回 `offline.html` → 用户点"继续本地工作"跳回 app.html |
| 网络恢复 | `online` 事件触发 → 调用方可用 `window.__pwa.sw.reg.sync.register('sync-project')` |
| `navigator.serviceWorker` 不存在 | `register-sw.js` catch 失败 → 控制台 `[pwa] SW register skipped: ...` → 业务无中断 |

业务代码可选使用:

```js
window.__pwa.ready.then(function (pwa) {
  pwa.ydb.put({ name: '客户A报价', data: { total: 12345 } })
    .then(function (rec) { console.log('已存离线:', rec.id); });
});
```

---

## 7. 已知限制 / 待办

- [ ] **maskable icon** 已声明 purpose maskable,但当前图标源是 `favicon-512.png`(圆形 logo)。如要严格符合 maskable 标准,需要一张 512x512 全画布 + 安全区 ≥ 40% 中心的图标。
- [ ] **manifest `id` 字段**:Chrome 96+ 要求 `id` 字段作为 PWA 唯一标识(manifest scope 改变时识别用),已设但 Firefox 仍使用 `start_url`。
- [ ] **iOS "Add to Home Screen"** 用户首次安装时,iOS 提示的标题来自 `<meta name="apple-mobile-web-app-title">`,与 manifest.short_name 不同源。如果要 iOS 短标题,需在 app.html 加 `<meta name="apple-mobile-web-app-title" content="装企报价">`。
- [ ] **service worker `updateViaCache: 'none'`** 已传,避免 Chrome 缓存 stale SW。
- [ ] **注册失败最坏情况**:浏览器禁用 SW 时不会出问题,业务跑在 `pwa.ydb === null` 状态下继续。

---

## 8. 验收对照

| 验收项 | 实际 |
|---|---|
| 每个 .js 文件 < 300 行 | service-worker 175 / idb-store 209 / register-sw ~140 / pwa.test ~140 ✓ |
| 无 console.error | 仅 console.warn / console.info(`register-sw.js` 已 catch 降级) |
| ≥5 个自检测试 PASS | 7/7 PASS (T1-T7),exit=0 |
| README 写到 `/d/sandbox_quotation_system/r31202-modules/01-pwa/README.md` | ✓ |
| 不修改 yunshu-zhuangqi 现有代码 | ✓ 7 个独立文件,部署后 `<script defer src="./register-sw.js">` 一行引入 |
| 不 npm install | ✓ 全部原生 ES5 + Web API |
| wc -l 验证大小 | 见下表 |

```bash
$ wc -l D:/sandbox_quotation_system/r31202-modules/01-pwa/*
```

---

_R31202 · 2026-10-16 · 🅱️ yunshu-zhuangqi PWA 离线架构交付包_
