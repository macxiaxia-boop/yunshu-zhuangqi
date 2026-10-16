# 开发者文档 · DEV.md

> 如何扩展、维护、定制这个产品。

## 目录

1. [文件结构](#文件结构)
2. [HTML 结构](#html-结构)
3. [CSS 主题系统](#css-主题系统)
4. [JS 核心模块](#js-核心模块)
5. [如何添加新模块](#如何添加新模块)
6. [如何添加新主题色](#如何添加新主题色)
7. [如何添加新命令](#如何添加新命令)
8. [数据持久化](#数据持久化)
9. [导出报价书](#导出报价书)
10. [调试与排查](#调试与排查)

---

## 文件结构

```
xhs-quote-app/
├── index.html              # 🌟 主产品(单文件,129KB,~2500 行)
├── README.md               # 用户文档
├── DEV.md                  # 本文件 — 开发者文档
├── start.bat               # Windows 一键启动
├── assets/
│   ├── demo.gif            # xhs 原视频前 8 秒(README hero)
│   └── themes.png          # 6 主题色预览
└── xhs-source.mp4          # xhs 原视频备份(6.19MB)
```

**单文件设计**:所有 CSS/JS/HTML 都在 `index.html` 一个文件里。无构建步骤,无依赖。

---

## HTML 结构

```
<!DOCTYPE html>
<html>
  <head>
    <meta>
    <title>
    <style>  ← 所有 CSS(~600 行)
      :root {
            /* CSS 变量 — 主题色 + dark/light 模式 */
            --primary: #B50029;
            --bg: #1a1d2e;
            --text: #e8eaf0;
            /* ... 更多 */
          }
          [data-theme="dae"] { --primary: #2a4858; }
          /* ... 其他主题 */
          [data-mode="light"] { --bg: #f5f5f7; }
          /* ... */
    </style>
  </head>
  <body data-mode="dark">  ← 默认 dark 模式

    <!-- 顶部菜单栏 -->
    <div class="top-menu">...</div>

    <!-- Header:logo + breadcrumb + actions -->
    <header class="app-header">...</header>

    <!-- 主布局 -->
    <div class="app">
      <aside class="sidebar">  ← 左导航(11 个 nav-item)
        <div class="nav-item" data-view="X" onclick="switchView(...)">
        </div>
      </aside>

      <main class="content">
        <div class="view active" data-view="X">  ← 每个 view 一个 div
          <div class="view-header">...</div>
          <div class="view-body">...</div>
        </div>
        <!-- ...更多 view -->
      </main>
    </div>

    <!-- 底部 footer -->
    <footer class="brand-footer">...</footer>

    <!-- 弹窗(模态层) -->
    <div class="modal-bg" id="XxxModal">...</div>

    <!-- 浮动 Help 按钮 + Cmd+K 面板 -->
    <div class="cmd-palette" id="cmdPalette">...</div>

    <script>  ← 所有 JS(~900 行)
      // 主题切换 / 模块切换 / 项目切换 / 命令面板 / 导出 / 持久化
    </script>
  </body>
</html>
```

---

## CSS 主题系统

### 主题色变量

```css
:root, [data-theme="8B0029"] {
  --primary: #B50029;
  --primary-2: #8B0029;
  --primary-soft: rgba(181, 0, 41, 0.12);
  --primary-glow: rgba(181, 0, 41, 0.3);
}

[data-theme="dae"] { --primary: #2a4858; /* ... */ }
[data-theme="songshi"] { --primary: #2d6e54; /* ... */ }
/* ... 共 6 主题 */
```

切换主题时,JS 设置 `document.body.setAttribute('data-theme', color)`。

### 暗/亮模式

```css
[data-mode="dark"], :root {
  --bg: #1a1d2e;
  --text: #e8eaf0;
  /* ... 暗色变量 */
}

[data-mode="light"] {
  --bg: #f5f5f7;
  --text: #1a1a1f;
  /* ... 亮色变量 */
}
```

切换时 `document.body.setAttribute('data-mode', 'dark' | 'light')`。

### 颜色使用规则

| 场景 | 使用变量 |
|------|----------|
| 主品牌色 / active 状态 / 强调 | `--primary` |
| 主背景 | `--bg` |
| 卡片背景 | `--panel` |
| 边框 | `--border` / `--border-2` |
| 主文字 | `--text` |
| 弱文字 | `--text-dim` |
| 最弱文字 | `--text-faint` |

---

## JS 核心模块

### 1. View 切换(view 名 ↔ 中文名 ↔ 导航激活)

```javascript
const VIEW_NAMES = {
  summary: '总价表',
  base_price: '基础装修 · 价目表',
  p1: '01 措施项目',
  // ...
};

function switchView(name, el) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.view === name));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.ni-child').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('bcCurrent').textContent = VIEW_NAMES[name] || name;
}
```

### 2. 主题切换(setTheme / setMode)

```javascript
function setTheme(color, el) {
  if (color === '8B0029') document.body.removeAttribute('data-theme');
  else document.body.setAttribute('data-theme', color);
  document.querySelectorAll('.color-pill').forEach(p => p.classList.toggle('active', p === el));
}

function setMode(mode, el) {
  document.body.setAttribute('data-mode', mode);
}
```

### 3. 项目切换(PROJECTS / switchProject)

```javascript
const PROJECTS = {
  empty: { name, projectNo, prices: { 'p1-price': '¥0.00', /* ... */ } },
  inprogress: { /* ... */ },
  completed: { /* ... */ },
};

function switchProject(key) {
  // 更新 sidebar 金额 + 显示 toast + localStorage 持久化
}
```

### 4. 命令面板(COMMANDS / openCmdPalette)

```javascript
const COMMANDS = [
  { name: '切换到 总价表', icon: '📊', action: () => switchView('summary'), shortcut: '1' },
  { name: '打开 打印预览', icon: '🖨', action: () => openPrint(), shortcut: 'Ctrl+P' },
  // ... 24 个命令
];
```

### 5. 导出(exportQuote)

生成独立 HTML 字符串(基于当前项目数据),用 Blob + URL.createObjectURL 触发浏览器下载。

### 6. 持久化(localStorage)

```javascript
const STORAGE_KEY = 'xhs-quote-current-project';
function persistProject() {
  try { localStorage.setItem(STORAGE_KEY, currentProject); } catch (e) {}
}
// 页面加载时:
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && PROJECTS[saved]) currentProject = saved;
} catch (e) {}
```

---

## 如何添加新模块

1. **左导航加 nav-item**:
```html
<div class="nav-item" data-view="newmodule" onclick="switchView('newmodule', this)">
  <svg class="ni-ico" viewBox="...">...</svg>
  <span class="ni-label">新模块</span>
  <span class="ni-price">¥0.00</span>
</div>
```

2. **主区域加 view**:
```html
<div class="view" data-view="newmodule">
  <div class="view-header">
    <div class="crumb-en">MODULE / NEW</div>
    <h2>新模块</h2>
  </div>
  <div class="view-body">
    <!-- 内容 -->
  </div>
</div>
```

3. **VIEW_NAMES 加映射**:
```javascript
const VIEW_NAMES = { /* ... */ newmodule: '新模块' };
```

4. **Cmd+K 命令面板加命令**:
```javascript
const COMMANDS = [
  /* ... */ { name: '切换到 新模块', icon: '📦', action: () => switchView('newmodule'), shortcut: '9' },
];
```

5. **导出报价书加表格**(可选)。

---

## 如何添加新主题色

1. **CSS 加主题变量**:
```css
[data-theme="mynew"] {
  --primary: #YOUR_COLOR;
  --primary-2: #YOUR_COLOR_DARK;
  --primary-soft: rgba(YOUR_COLOR_RGB, 0.12);
  --primary-glow: rgba(YOUR_COLOR_RGB, 0.3);
}
```

2. **HTML 加色板**:
```html
<div class="color-pill" data-color="mynew" onclick="setTheme('mynew', this)">
  <div class="color-circle" style="background:#YOUR_COLOR;"></div>
  <div class="name">主题名</div>
</div>
```

3. **PROJECTS 数据无变化**(主题色不影响数据)。

---

## 如何添加新命令

在 `COMMANDS` 数组里加一个对象:

```javascript
{ name: '描述', icon: '🎯', action: () => { /* 你的逻辑 */ }, shortcut: '⌘X' }
```

如果需要快捷键,在 keydown listener 里加:

```javascript
document.addEventListener('keydown', e => {
  if (e.key === 'X' && (e.ctrlKey || e.metaKey) && /* not typing */) {
    e.preventDefault();
    yourFunction();
  }
});
```

---

## 数据持久化

**当前实现**:仅持久化"当前选中项目"。其他数据(增减项明细、定额库条目等)暂未持久化。

**扩展模式**:
```javascript
// 存
localStorage.setItem('xhs-quote-data', JSON.stringify({ coRows: [...], library: [...] }));

// 取
try {
  const data = JSON.parse(localStorage.getItem('xhs-quote-data') || '{}');
  // 应用到 view
} catch (e) {}
```

**生产建议**:用 IndexedDB(超过 5MB 数据)或后端 API(多端同步)。

---

## 导出报价书

```javascript
function exportQuote() {
  const p = PROJECTS[currentProject];
  const html = `<!DOCTYPE html>...带水印的完整报价单...</html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `报价单_${p.projectNo}_...html`;
  a.click();
  URL.revokeObjectURL(url);
}
```

**可扩展**:导出 PDF(用 `window.print()` + 用户选"另存为 PDF")、导出 Excel(用 SheetJS)。

---

## 调试与排查

### 关键错误

| 症状 | 排查 |
|------|------|
| 主题色不切换 | 检查 `<body data-theme="...">` 是否设置 |
| 模块点击不响应 | 检查 `data-view="X"` 与 JS `VIEW_NAMES[X]` 一致 |
| 命令面板不显示 | 检查 `Cmd+K` 没在 input/textarea 聚焦时被吞 |
| 打印预览空白 | 检查 `data-view="print"` 的元素存在(打印预览是 modal 不是 view) |
| localStorage 不工作 | 检查浏览器隐私模式 / 域限制 |

### HTML 完整性

每次 Edit 后立即验证:
```bash
python -c "c=open('index.html').read(); print(c.count('<body'), c.count('</body>'))"
# 必须输出相同

# 标签平衡 <body>=2,</body>=2, <html>=2,</html>=2
```

### 性能监控

`top-menu` 里有 FPS/GPU/CPU 装饰性监控。可替换为真实数据(Web Vitals API)。

---

## 部署建议

**纯静态部署** — 直接上传 `index.html` 到任何静态托管:
- GitHub Pages
- Cloudflare Pages
- Vercel / Netlify
- 公司内网静态服务器

无后端,无数据库,无需环境变量。

---

## 版本演进史

| 版本 | 时间 | 主要改进 |
|------|------|----------|
| v1 | 2026-10-15 | 抓 xhs 视频 + 抽帧分析(28 张关键帧) |
| v2 | 同上 | 单文件 HTML 还原(11 模块 + 7 settings + 6 主题色) |
| v3 | 同上 | 11 引导式 empty state + 键盘快捷键 + Help 浮动按钮 |
| v4 | 同上 | 3 示例项目切换 + 导出报价书 HTML |
| v5 | 同上 | Changelog 弹窗(点击 footer 版本号) |
| v6 | 同上 | Cmd+K 命令面板(24 真实命令) |
| v7 | 同上 | localStorage 项目持久化 |
| v8 | 同上 | 响应式 CSS(1100px / 768px 断点) |
| v9 | 同上 | 本开发者文档(DEV.md) |

---

## 已知限制

- 没有真实后端(纯前端 demo)
- 数据不持久化(除项目选择)
- 打印预览是 HTML 模拟(非真实 PDF 生成)
- 物料/定额库是静态数据(非可编辑)
- 没有用户认证/多用户

## 路线建议(给后续开发者)

1. **后端化**:Node.js + SQLite,加用户系统/项目持久化
2. **PDF 真实生成**:`window.print()` + print CSS,或 jsPDF
3. **真实报价计算**:后端按定额库自动计算金额,前端只展示
4. **协作功能**:多人编辑同一项目(WebSocket)
5. **移动端 PWA**:加 manifest.json + service worker

---

Made by 云数装企 · 基于小红书「溜小溜」视频还原 · 2026-10-15