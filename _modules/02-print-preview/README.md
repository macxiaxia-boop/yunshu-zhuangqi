# Module 02 · print-preview 报价打印预览

> 🅱️ yunshu-zhuangqi 装企报价工具 · 22 纸型打印预览模块（独立 standalone 窗口）
> 无 npm 依赖 · 浏览器原生 CSS `@page` + `window.print()` · 路径 `D:\sandbox_quotation_system\r31202-modules\02-print-preview\`

## 文件清单

| 文件 | 行数 | 用途 |
|---|---|---|
| `print-preview.html` | 272 | 主入口（standalone window） |
| `print-core.js` | 210 | 22 纸型常量 + 方向/范围/CSS/缩放/图像顺序解码 |
| `print-template.js` | 202 | 4 模板（报价明细 / 增减项 / 物料全书 / 封面） |
| `print-actions.js` | 88 | print / savePDF / excludePages / close |
| `styles.css` | 342 | 工具栏 + 缩略图导航 + paper 样式 + @media print |
| `print.test.js` | 306 | 10 自检（无依赖，Node 直接跑） |
| `README.md` | 本文件 | 接入说明 |

## 接入方式（从 yunshu-zhuangqi app.html 调用）

```js
// 收集当前报价数据
const data = {
  projectInfo: window.currentData.projectInfo,
  categories: window.currentData.categories,
  changeOrders: window.currentData.changeOrders || []
};

// base64 编码（处理 Unicode 字符）
const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data))));

// 打开独立预览窗口
const w = window.open('./print-preview.html?data=' + encodeURIComponent(b64) +
                      '&title=' + encodeURIComponent(data.projectInfo.name || ''));
```

## URL 参数

| 参数 | 必填 | 说明 |
|---|---|---|
| `data` | 是 | base64(JSON.stringify(data)) — 推荐 ≤ 100KB（GitHub Pages 限制） |
| `title` | 否 | 显示在工具栏标题 |

## 工具栏字段

| 字段 | 类型 | 取值 |
|---|---|---|
| 纸型 | select | A0-A8 / B0-B6 / Letter / Legal / Tabloid / Executive / Folio / 自定义 |
| 方向 | select | 纵向 / 横向 |
| 自定义 mm | 2× number | 50-2000mm（仅自定义纸型生效） |
| 范围 | select | all / current / odd / even / custom |
| 范围表达式 | text | `1-5,8,11-13`（仅 custom 生效） |
| 双面 | select | 单面 / 长边 / 短边 |
| 份数 | number | 1-999 |
| 颜色 | select | 彩色 / 黑白 |
| 打印机 | select | 系统打印机列表（fallback `pdf`） |
| 缩放 | +/- 按钮 | 25%-300%（仅屏幕） |
| Ctrl+滚轮 | — | 缩放快捷键 |

## 模板清单

| state.template | 模板 | 用途 |
|---|---|---|
| `quote` | `renderQuoteTemplate` | 封面 + 25 类分类表 + 编制说明 + 签字页 |
| `changeOrder` | `renderChangeOrderTemplate` | 增减项明细 |
| `materialBook` | `renderMaterialBookTemplate` | 物料全书（含图片） |
| `cover` | `renderCoverTemplate` | 封面（公司 + Logo + 工程信息） |

> 模板切换通过 `state.template = 'xxx'` + 调用 `renderPapers()`。

## 4 模板对应 data schema

直接复用 yunshu-zhuangqi app.html 的 `currentData` 结构：

```js
{
  projectInfo: {
    name, code, ownerName, projectAddress, date, author, checker,
    logoData, // data:image/png;base64,...
    companyName, englishName, companyPhone, companyAddress, companyWebsite,
    uiTitleCn, uiTitleEn, designArea, notes,
    materialBookTitle, ...
  },
  categories: [
    { id, num, en, cn, group: 'construction'|'material', items: [
        { name, unit, price, qty, brand, model, spec, image, ... }
    ]}
  ],
  changeOrders: [
    { id, kind: 'add'|'remove', name, unit, qty, price, note }
  ]
}
```

## 自检（10 项 PASS）

```bash
node print.test.js
```

输出：`PASS: 102 / FAIL: 0`（覆盖 10 测试组 + 子断言）。

| # | 测试组 | 覆盖 |
|---|---|---|
| T1 | 22 纸型常量完整性 | A0-A8, B0-B6, Letter, Legal, Tabloid, Executive, Folio, 自定义 |
| T2 | 范围正则解析 | 合法 / 越界 / 格式错误 / 反向 / null |
| T3 | 方向切换正确性 | portrait ↔ landscape 交换 + 自定义 |
| T4 | @page CSS 生效 | style.textContent 含 `@page { size: W mm H mm }` + `--paper-zoom` |
| T5 | 4 模板函数存在 + 空数据容错 | quote/changeOrder/materialBook/cover 都接受 `null`/`{}` |
| T6 | Ctrl+滚轮缩放 | handler 激活 + clamp 25-300 + detach |
| T7 | 范围排除非选中页可见性 | custom/odd/even/all + clearExclusions |
| T8 | resolveRange 5 模式 | all / current / odd / even / custom |
| T9 | PrintActions surface | print/savePDF/close/excludePages/clearExclusions |
| T10 | listPrinters fallback | 返回数组 + 包含 `pdf` |

## 浏览器兼容

| 浏览器 | silent print | save-as-PDF | 备注 |
|---|---|---|---|
| Chrome 86+ | ❌（需用户手动确认） | ✅ 系统对话框 | 推荐 |
| Edge 86+ | ❌ | ✅ | 同 Chrome 内核 |
| Firefox 86+ | ❌ | ✅ | 需用户确认 |
| Safari | ❌ | ✅ | macOS only |

> GitHub Pages 上 `window.print()` 必须用户点击；无静默打印方案。
> 推荐方案：用户点击「打印」按钮 → 系统对话框 → 选 Save as PDF / 真实打印机。

## GitHub Pages 限制

- URL param 长度上限因浏览器而异（Chrome ~2MB，Firefox ~65KB）。
- **推荐 data ≤ 100KB**（含 base64 膨胀），大文件建议改为 POST 到后端或拆包。
- 完整 yunshu 报价数据通常 50-200KB（视图片大小而定）。

## 与 yunshu-zhuangqi 集成（最小修改）

```html
<!-- 在 app.html 添加打印按钮 -->
<button onclick="openPrintPreview()">打印预览</button>

<script>
function openPrintPreview() {
  const data = window.currentData || {};
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  window.open('./print-preview.html?data=' + encodeURIComponent(b64) +
              '&title=' + encodeURIComponent(data.projectInfo?.name || ''));
}
</script>
```

> 不修改 app.html 现有打印逻辑。新模块以独立窗口运行，互不干扰。

## 严禁（已遵守）

- ✅ 无 canvas-based PDF（用浏览器原生 print-to-PDF）
- ✅ 无 npm 依赖（纯 vanilla JS）
- ✅ 不修改 yunshu-zhuangqi 现有代码

## 验证（headless Chrome）

```bash
cd D:/sandbox_quotation_system/r31202-modules/02-print-preview
"/c/Users/xinzh/AppData/Local/Google/Chrome/Application/chrome.exe" \
  --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --virtual-time-budget=2000 \
  --screenshot=print-preview.png \
  "file:///D:/sandbox_quotation_system/r31202-modules/02-print-preview/print-preview.html"
```

期望：无 `console.error`，截图显示工具栏 + 缩略图导航 + 至少 4 页 paper。

---

_built 2026-10-16 · R31202 Module 02 · 装企报价 22 纸型打印预览_