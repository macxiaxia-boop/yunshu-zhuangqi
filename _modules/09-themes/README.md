# 09-themes — 6 主题 × 36 组合主题模块

> **定位**：yunshu-zhuangqi 装企报价工具 · 主题色系统（4 维：color × mode × glass × density）
> **SSOT**：`REF 3.1.0 schema-extraction.md` Section 10（6 主题）+ Section 8（持久化键）

| 项 | 值 |
|---|---|
| 主题色数 | **6**（胭脂 / 藏青 / 松石绿 / 赭石 / 烟紫 / 藕荷） |
| 组合数 | **36 = 6 color × 2 mode × 3 density**（玻璃 on/off 单独维度） |
| 文件数 | 8（src/）+ 1（tests/）+ 1（README） |
| 单文件 | 全部 < 400 行 · 总 1653 行 |
| 测试 | **15 PASS / 0 FAIL** · `node --test` |
| 浏览器全局 | `window.YSTheme` + `window.YS_THEMES` |
| Node 模块 | `require('./src/theme-controller')` |

## 1. 调用方式

### Node (CommonJS)
```js
const { YSTheme } = require('./src/theme-controller');
const { THEMES, CHROME, DENSITY, GLASS } = require('./src/theme-palettes');

YSTheme.applyAll('lilac', 'dark', false, 'loose');  // 4 维一次到位
YSTheme.persist();                                  // 写 localStorage
console.log(YSTheme.getAllCombinations().length);   // 36
```

### 浏览器
```html
<link rel="stylesheet" href="theme-vars.css">
<link rel="stylesheet" href="theme-modes.css">
<link rel="stylesheet" href="theme-density.css">
<link rel="stylesheet" href="theme-glass.css">

<script src="theme-palettes.js"></script>
<script src="theme-controller.js"></script>
<script>
  // 1. 挂主题切换器
  YSTheme.attachThemeSwitcher(document.getElementById('theme-area'));

  // 2. 财务字段联动（module 06 风格的费率输入）
  YSTheme.bindAccentToInputs('[data-ys-fee]');

  // 3. 单维度切换
  YSTheme.setTheme('navy');       // 6 色之一
  YSTheme.setMode('dark');        // light | dark
  YSTheme.setDensity('compact');  // compact | standard | loose
  YSTheme.setGlass(true);         // 玻璃 on/off

  // 4. 持久化
  YSTheme.persist();
  // 下次自动从 localStorage 恢复（controller 在加载时自动调用 loadFromStorage）
</script>
```

## 2. 持久化键（与 REF 100% 对齐）

| 键名 | 取值 | 默认 | REF 来源 |
|---|---|---|---|
| `ys_studio_ui_v31_color_mode` | `light` \| `dark` | `light` | REF §8 + §13 |
| `ys_cloud_light_skin_v1` | `red` \| `navy` \| `turquoise` \| `ochre` \| `purple` \| `lilac` | `red` | REF §8 + §10 |
| `ys_studio_ui_v31_density` | `compact` \| `standard` \| `loose` | `standard` | REF §8 |
| `ys_studio_ui_v31_glass` | `1` \| `0` | `0` | 同源新增 |

## 3. 6 主题色（REF 默认 `red`=胭脂）

| key | 中文 | primary | rgb | 主要联想 |
|---|---|---|---|---|
| `red` | 胭脂 | `#A23C43` | `162,60,67` | 中国传统 · 大气 · 报表主色（REF 默认） |
| `navy` | 藏青 | `#1f3a5f` | `31,58,95` | 商务 · 沉稳 · 商务合同 |
| `turquoise` | 松石绿 | `#0d7a73` | `13,122,115` | 雅致 · 自然 · 设计客户 |
| `ochre` | 赭石 | `#9c5c2a` | `156,92,42` | 暖色 · 木作 · 中式项目 |
| `purple` | 烟紫 | `#5b3a6a` | `91,58,106` | 高端 · 软装 · 豪宅 |
| `lilac` | 藕荷 | `#8a6b8e` | `138,107,142` | 柔和 · 女性业主 · 保留 |

## 4. 4 维度 API 详解

### 单维度（不丢其他维度）
```js
YSTheme.setTheme('turquoise');   // → _state.color='turquoise', 其他不变
YSTheme.setMode('dark');          // → _state.mode='dark', color/density/glass 保留
YSTheme.setGlass(true);           // → _state.glass=true, 其他保留
YSTheme.setDensity('compact');    // → _state.density='compact', 其他保留
```

### 4 维一次到位
```js
YSTheme.applyAll('ochre', 'light', true, 'loose');
// → { color:'ochre', mode:'light', glass:true, density:'loose' }
```

### 查询
```js
YSTheme.getCurrent();           // { color, mode, glass, density }
YSTheme.getAllCombinations();   // 36 个 [{color,mode,glass,density}, ...]
```

### 持久化
```js
YSTheme.persist();              // 4 键写 localStorage（仅在浏览器环境有效）
YSTheme.loadFromStorage();      // 从 localStorage 还原 + 应用
                                // controller 加载时自动调用一次
```

### 非法值拒绝（白名单 + 抛错）
```js
YSTheme.setTheme('orange');     // throw: not in white-list
YSTheme.setMode('sepia');       // throw: not in [light,dark]
YSTheme.setDensity('huge');     // throw: not in [compact,standard,loose]
```

## 5. CSS 架构（4 文件分工）

| 文件 | 职责 | 行数 |
|---|---|---|
| `theme-vars.css` | `:root` 默认 CSS 变量（胭脂/浅色/标准） | 93 |
| `theme-modes.css` | `body[data-mode=light/dark]` 切换 chrome | 78 |
| `theme-density.css` | `body[data-density=compact/standard/loose]` 3 档 | 94 |
| `theme-glass.css` | `body[data-glass=true/false]` 玻璃 + Webkit 前缀 | 76 |

```html
<!-- 推荐加载顺序 -->
<link rel="stylesheet" href="theme-vars.css">      <!-- 基线 -->
<link rel="stylesheet" href="theme-modes.css">     <!-- 浅深 -->
<link rel="stylesheet" href="theme-density.css">   <!-- 密度 -->
<link rel="stylesheet" href="theme-glass.css">     <!-- 玻璃 -->
```

## 6. UI 组件

### 主题切换器（独立组件）
`src/theme-switcher-ui.html` — 完整独立页面，演示：
- 6 色 palette 选择器（每个 = 色块 + 中文名）
- 模式 toggle（浅/深）
- 密度 toggle（紧凑/标准/宽松）
- 玻璃 checkbox
- 实时预览面板
- 「保存设置」按钮（调用 `persist()`）

### 36 组合矩阵
`src/themes-matrix-snap.html` — 6×3 表格：
- 每 cell 内分上/下两段（浅/深模式）
- 点 cell → 全屏应用该组合 + 还原按钮
- 顶部 bar：玻璃 on/off + 切换器入口

```js
YSTheme.applyAll('lilac', 'light', false, 'standard');
// → body data-mode=light, density=standard, glass=false, --ys-primary=#8a6b8e
```

## 7. 与其他模块的协调

### module 02 打印预览
- 本模块写入 :root `--accent` / `--accent-soft` ← 覆盖 `02-print-preview/styles.css` 默认 `--accent: #A23C43`
- 切换主题后再开打印预览，PDF 自动跟随主题色（无需重写 styles.css）

```js
// 在 02-print-preview 加载后联动
if (window.YSTheme) {
  const t = window.YSTheme.getCurrent();
  document.documentElement.style.setProperty('--accent', `var(--ys-accent)`);
}
```

### module 06 工料计算（财务字段联动）
- 5 费率输入框（管理费/税率/主材服务费/设计费/折扣率）的 border-color 跟随 accent
- `YSTheme.bindAccentToInputs('[data-ys-fee]')` 一次绑定，主题切换时自动跟随

```html
<!-- module 06 的费率输入 -->
<input class="ys-fee-input" data-ys-fee type="number" name="managementFeeRate" />
<!-- → border-color 跟随 --ys-accent 自动变 -->
```

### 反向兼容（持久化键 + 字段命名）
- 字段名直接对齐 REF：`ys_studio_ui_v31_color_mode` / `ys_cloud_light_skin_v1` / `ys_studio_ui_v31_density`
- 从 REF 升级到本模块无需迁移，直接复用 localStorage 现有值

## 8. 15 测试覆盖（`node --test`）

| # | 测试 | 验证 |
|---|---|---|
| 1 | 6 主题白名单 | THEMES 数据完整 + hex 合法 + rgb 三元组 |
| 2 | setTheme 写 CSS vars | `--ys-primary/--ys-accent/--ys-rgb` 全部写入 |
| 3 | setMode('dark') 触发 chrome 重写 | `--ys-bg/--ys-chrome/--ys-ink` 切到 dark |
| 4 | setGlass on/off | `data-glass` 切换 boolean |
| 5 | 3 密度档 | compact/standard/loose + body data-attr + 白名单 |
| 6 | applyAll 4 维组合 | 一次到位 + state 一致 |
| 7 | 持久化 4 键 | localStorage 写入 + 键名匹配 REF |
| 8 | loadFromStorage 还原 | mock storage → state 完整恢复 |
| 9 | getAllCombinations = 36 | 6×2×3 = 36，颜色/模式/密度频次正确 |
| 10 | 非法值拒绝 | 7 种非法输入全部抛错 |
| 11 | dark + lilac 可达 | lilac #8a6b8e + dark chrome 完整写入 |
| 12 | glass + dark 对比度 | WCAG AA ≥ 4.5（light + dark） |
| 13 | 单维度不丢其他维度 | setMode / setTheme / setDensity 互不干扰 |
| 14 | 主题切换动画 | 200ms transition + 4 CSS 文件存在 |
| 15 | 主题切换不闪烁 | 单次 applyAll → ≤ 30 CSS 写入 + 4-20 body attrs（无重排） |

## 9. 边界与错误处理

- **白名单校验**：所有 set*/apply 入口均白名单校验（拒绝后抛错，state 不变）
- **typeof guard**：`module` 检测 → 浏览器走 `window.YSTheme`，Node 走 `module.exports`
- **容错恢复**：`loadFromStorage` 任何字段非法即回退默认（partial apply）
- **防御 C 端**：拒绝 `null/undefined/''/数字` 等非白名单输入（避免脏数据污染 state）
- **持久化失败**：catch + 返回 false（不抛错 → 不阻塞 UI）
- **不依赖 jQuery/JS framework**：纯原生 `<script>` 加载，100% vanilla JS

## 10. 升级路线

| 阶段 | 状态 | 备注 |
|---|---|---|
| v0.1 (本模块) | ✅ 完工 | 6 色 + 4 维 + 36 组合 + 15 测试 |
| v0.2 | 计划 | 主题预设导出/导入（JSON 备份） |
| v0.3 | 计划 | 主题色与 Logo 联动（自定义 logo 主色时自动派生 5 个辅助色） |
| v1.0 | 计划 | Web Component 化 `<ys-theme-switcher>` + Shadow DOM 隔离 |

---

_09-themes v0.1.0 · 2026-10-16 · 单文件 < 400 行 · 15/15 测试 PASS · 与 REF 持久化键 100% 对齐_
