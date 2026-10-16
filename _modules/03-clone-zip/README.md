# 📦 Module 03 — clone-zip (克隆配置 ZIP · yunshu-zhuangqi)

> **对位 REF 3.1.0 clone-settings.js** · SHA256 + minAppVersion DRM · 反原型链攻击
> **版本**: v0.5.0 (r31202) · 2026-10-16

## 🎯 用途

yunshu-zhuangqi 工作室配置可移植:
- 公司信息 + Logo + 抬头 + 主题
- 定额库 (25 分类) + 材料表 + 跨项目库
- 默认费率 (5 财务字段)
- 初始模板 (categories, 不含工程信息)
- 界面偏好 (5 preferences)
- 资料文件 (Logo/定额文件 base64 内嵌)

**导出**: `YSClone.exportBytes()` → ZIP Uint8Array
**导入**: `YSClone.inspect(bytes)` → `YSClone.apply(config)` → localStorage + IDB 备份

---

## 📦 文件清单

| 文件 | 行数 | 用途 |
|---|---|---|
| `clone-zip.js` | ~370 | 主库 (exportBytes/inspect/apply/restore/snapshot/panelHTML) |
| `validation.js` | ~290 | 字段白名单 + safeJSON + 反原型链 |
| `resources-handler.js` | ~110 | 资料文件 base64 pack/unpack |
| `index-backup.js` | ~140 | IndexedDB before-import + 失败回滚 |
| `manifest-template.json` | ~20 | manifest 模板 |
| `configuration-schema.json` | ~150 | 配置 JSON-Schema |
| `clone-zip.test.js` | ~370 | 20+ 自检测试 |

---

## 🚀 接入说明

### 1. 在 `app.html` 前置加载 JSZip CDN

```html
<!-- 必须先于 clone-zip.js -->
<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
```

### 2. 引入模块 (按顺序)

```html
<script src="./r31202-modules/03-clone-zip/validation.js"></script>
<script src="./r31202-modules/03-clone-zip/resources-handler.js"></script>
<script src="./r31202-modules/03-clone-zip/index-backup.js"></script>
<script src="./r31202-modules/03-clone-zip/clone-zip.js"></script>
```

### 3. 渲染 UI 面板

```js
// 在系统设置页面插入:
const html = YSClone.panelHTML();
document.getElementById('settings-clone').innerHTML = html;

// 绑定事件 (传入可选 hooks):
YSClone.panelBind(document.getElementById('settings-clone'), {
  onInspect: async (manifest, config) => {
    // 弹出确认框,返回 false 取消
    return confirm('导入 ' + manifest.company + ' 的克隆配置?');
  },
  onApplied: (parsed) => {
    console.log('已应用', parsed.manifest);
  },
  onError: (e) => {
    console.error('克隆失败', e);
  }
});
```

### 4. 调用 API

```js
// 导出
const bytes = await YSClone.exportBytes();
// bytes 是 Uint8Array,可以直接 Blob+下载

// 导入
const file = ...; // 用户选择的 .zip
const buf = await file.arrayBuffer();
const { manifest, config } = await YSClone.inspect(new Uint8Array(buf));
await YSClone.apply(config);

// 恢复 (从最近一次导入前回滚)
await YSClone.restore();

// 当前配置快照
const snap = YSClone.snapshot();
```

---

## 🔒 安全铁律

| 项 | 限制 |
|---|---|
| **白名单字段 (settings)** | 51 个 (company + 抬头 + Logo + 主题 + 水印 + 物料书 + 财务) |
| **财务数值** | ≥ 0 (managementFeeRate / materialServiceFeeRate / taxRate / designRate / discountRate) |
| **themeColor** | 6 主题 (red/navy/turquoise/ochre/purple/lilac) |
| **logoData / watermarkImage** | `data:image/(png\|jpe?g\|gif\|webp);base64,...` 格式 |
| **libraryType** | construction / material / equipment |
| **resourceFile kind** | quota / logo |
| **resourceFile name** | 拒绝 `\\/:*?"<>\|` 和 `..` |
| **resourceFile 重名** | 拒绝 |
| **配置深度** | ≤ 60 (防原型链 + 深度炸弹) |
| **反原型链** | `__proto__` / `constructor` / `prototype` 拒绝 |
| **单资源** | ≤ 25MB |
| **ZIP 包** | ≤ 45MB |
| **配置主体** | ≤ 40MB |
| **资源文件数** | ≤ 200 |
| **ZIP 完整性** | 仅允许 `manifest.json` + `configuration.json` + `使用说明.txt` |
| **DRM** | SHA256 + minAppVersion ∈ ['0.5.0','0.5.1','0.6.0'] |

---

## ⚠️ 限制

- **GitHub Pages 不支持 serviceworker fetch 跨域** → 配置只能含 base64,不能含 URL
- **Web Crypto API 必需** → 仅 HTTPS / localhost / file:// 可用
- **IndexedDB 必需** → Safari 隐私模式可能失败 (会捕获错误并抛错)
- **JSZip 通过 CDN 加载** → 离线场景需自行 inline JSZip 源码 (95KB)

---

## 🧪 测试

```bash
node clone-zip.test.js
```

**20+ 自检测试**:
1. 白名单字段拒绝未知字段
2. 财务数值 < 0 拒绝
3. 主题不在白名单拒绝
4. Logo/Watermark base64 格式错误拒绝
5. ResourceFile name 含非法字符拒绝
6. 资源文件名重名拒绝
7. 配置结构层级 > 60 拒绝
8. safeJSON 检测 __proto__ 字段拒绝
9. exportBytes → inspect round-trip SHA256 OK
10. inspect minAppVersion 老版本拒绝
11. inspect 文件 > 45MB 拒绝
12. configuration 含 constructor 拒绝
13. ZIP integrity 内容白名单 (仅 3 文件)
14. ZIP 含目录条目拒绝
15. ZIP 压缩配置 > 40MB 拒绝
16. library 缺 fileType 拒绝
17. library 缺 categories 拒绝
18. category 重复 id 拒绝
19. category libraryType 不在白名单拒绝
20. template 含工程信息拒绝
21. (BONUS) apply() 失败回滚
22. (BONUS) POC 反原型链攻击拦截

---

## 📜 改动历史

| R | 日期 | 改动 |
|---|---|---|
| **r31202** | 2026-10-16 | 初版 (对位 REF 3.1.0 clone-settings.js) · 51+5+5 字段白名单 · SHA256 DRM · IndexedDB 回滚 |
