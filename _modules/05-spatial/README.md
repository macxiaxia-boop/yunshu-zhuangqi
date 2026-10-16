# Module 05 · spatial 空间算量（云上户型图测量）

> 🅱️ yunshu-zhuangqi 装企报价工具 · **杀手差异化功能** · 现场上传户型图 → 自动算面积/墙长 → 一键推报价
> 无 npm 依赖 · 纯 Canvas 2D · 路径 `D:\sandbox_quotation_system\r31202-modules\05-spatial\`

## 文件清单

| 文件 | 行数 | 用途 |
|---|---|---|
| `spatial.html` | 601 | 主入口（standalone 窗口）· 工具栏 + canvas + 操作面板 + 房间列表 |
| `spatial-core.js` | 383 | 比例尺标定 · 3 测量模式 · Shoelace · 房间工厂 · 持久化 |
| `spatial-canvas.js` | 399 | canvas 渲染 · requestAnimationFrame · 缩放/平移 · 网格 |
| `rooms-export.js` | 193 | `window.RoomsData` + `pushToQuote` + 推报价自动映射 |
| `spatial.test.js` | 334 | 15 自检（Node 直接跑，0 依赖） |
| `README.md` | 本文件 | 接入说明 |

## 测量能力

| 模式 | 操作 | 适用场景 |
|---|---|---|
| **点选（对角）** | 点击 p1 → 点击 p2 → 自动算长/宽/面积 | 矩形房间 |
| **框选（拖拽）** | mousedown → drag → mouseup | 大块矩形空间 |
| **多边形描点** | 多次点击 → 双击/Enter 闭合 → Shoelace | 异形空间(L型/三角) |
| **比例尺标定** | 在已知长度两端点击 → 输入实际 mm | 任意户型图校准 |
| **识别墙体** *(PoC)* | 按钮触发 → 统计矩形周长作为墙长 | 简单演示 |

> 数字标签自动显示在测量对象中心；房间名可编辑（≤30 字）；自动从 [客厅, 主卧, 次卧, 厨房, 卫生间, 书房, 餐厅, 阳台] 池命名。

## 接入方式（yunshu-zhuangqi app.html）

```js
// 在 app.html 添加按钮
function openSpatialCalculator() {
  // 新窗口打开（推荐 800×600 起）
  window.open('./r31202-modules/05-spatial/spatial.html',
    'ys-spatial', 'width=1100,height=720,resizable=yes');
}

// 接收测量结果（在 app.html）
window.addEventListener('message', function (e) {
  if (!e.data || e.data.type !== 'rooms-added') return;
  // 1) 写回房间数据到 ydata
  if (typeof ydata !== 'undefined' && ydata.addRooms) {
    ydata.addRooms(e.data.rooms);
  }
  // 2) 自动映射条目到分类（已包含在 e.data.autoMapped）
  if (Array.isArray(e.data.autoMapped) && e.data.autoMapped.length) {
    e.data.autoMapped.forEach(function (m) {
      // m = { categoryId, categoryCn, item: {...} }
      addItemToCategory(m.categoryId, m.item);
    });
  }
});
```

> 空间算量页面内同时尝试 `window.opener.ydata.addRooms`（同源时直连，更快）。跨源时通过 postMessage 回传。

## 房间数据结构（`window.RoomsData`）

```js
{
  rooms: [
    {
      id: 'r1abc-def',
      name: '客厅',
      shape: 'rectangle',         // 'rectangle' | 'polygon'
      length: 5.2,                // 米
      width: 3.8,                 // 米
      area: 19.76,                // 平方米
      perimeter: 18,              // 米
      perimeterMm: 18000,
      lengthMm: 5200,
      widthMm: 3800,
      scale: 0.01,                // m/px
      source: {
        type: 'point',            // 'point' | 'box' | 'polygon'
        coords: [[x1, y1], [x2, y2]]  // 图像坐标系 (px)
      }
    }
  ],
  totalArea: 87.5,                 // 所有房间面积之和 ㎡
  totalWallLength: 36000,          // 所有墙长之和 mm
  createdAt: '2026-10-16T...',
  version: 1
}
```

## 自动映射到报价分类

| 来源 | 目标分类 | 类别名 | 单位 | 默认单价 |
|---|---|---|---|---|
| `area > 0` | `c07` (泥瓦工程) | 墙面粉刷 | ㎡ | ¥28 |
| `area > 0` | `c07` (泥瓦工程) | 地砖铺贴 | ㎡ | ¥120 |
| `perimeter > 0` | `c08` (木作工程) | 吊顶 | 米 | ¥180 |

> 映射条目标记 `spatialAuto: true` + `sourceSheet: 'spatial-auto'`，方便后续审计/排除。
> 用户可在右侧面板「推报价时自动映射」开关关闭。

## 比例尺持久化

```js
localStorage.ys.spatialScale = JSON.stringify({
  version: 1,
  realPerPixel: 0.01,           // m/px
  refPx: 100,
  refMm: 1000,
  createdAt: '2026-10-16T...'
});
```

页面加载时自动读取，下次直接用。`clearScale()` 清除。

## 工具栏字段

| 字段 | 类型 | 说明 |
|---|---|---|
| 上传户型图 | button | FileReader → dataURL → Image |
| 模式 | select | point / box / polygon / scale |
| 网格 | select | off / 10mm / 50mm / 100mm |
| 识别墙体 | button | 矩形房间的 4 边汇总 → PoC |
| 清空 | button | confirm 后清空所有测量 |
| 缩放 | — | 滚轮 + 空格+拖拽平移 |
| 房间 / 总面积 | stat | 实时刷新 |

## 快捷键

| 键 | 行为 |
|---|---|
| 滚轮 | 缩放（以鼠标位置为锚点）|
| 空格 + 拖拽 | 平移视图 |
| 双击 / Enter | 闭合多边形 |
| Delete / Backspace | 删除选中房间 |

## 自检（15 项 PASS）

```bash
node spatial.test.js
```

输出：`PASS: 69 / FAIL: 0`（覆盖 15 测试组 + 子断言）。

| # | 测试组 | 覆盖 |
|---|---|---|
| T1 | 比例尺换算 | 100 px=1000 mm → 0.01 m/px |
| T2 | 矩形面积 | 5.2×3.8 = 19.76 ㎡ |
| T3 | 矩形周长 | 2×(5.2+3.8) = 18 m |
| T4 | Shoelace 多边形 | 4 顶点正方形 = 1 ㎡ / 4 m |
| T5 | 周长求和 | 3-4-5 三角 = 12 m |
| T6 | 单位换算 | mm ↔ m ↔ px 6 路径 |
| T7 | 标定边界 | 0/负数/NaN/Infinity 拒绝 |
| T8 | 推报价联动 | 1 房间 → 3 条目(墙+地+顶) |
| T9 | 重绘一致 | 3 frame 后 invalidate/dirty 正确 |
| T10 | zoom clamp | 25-400 + NaN/0/undefined → 25 |
| T11 | pan 边界 | overflow >0 与 image fits 两种 |
| T12 | ID 唯一性 | 重复 ID 自动加 `-2`/`-3` 后缀 |
| T13 | 名称长度 | 截断到 30 字 + null/空 trim |
| T14 | 求和精度 | ±0.01 ㎡ + ±1 mm |
| T15 | 持久化 | `localStorage.ys.spatialScale` round-trip |

## 浏览器兼容

| 浏览器 | 支持 |
|---|---|
| Chrome / Edge 86+ | ✅ 全部功能 |
| Firefox 86+ | ✅ 全部功能 |
| Safari 13+ (macOS / iOS) | ✅ 全部功能 |
| 旧浏览器 | Canvas 2D 100% 支持，无 WebGL |

## 严禁（已遵守）

- ✅ 无 npm 依赖（纯 vanilla JS）
- ✅ 无 canvas-based PDF（只生成房间 JSON 数据）
- ✅ 无 WebGL（纯 Canvas 2D）
- ✅ 不修改 yunshu-zhuangqi 现有代码（独立窗口 + postMessage）

## 验证（headless Chrome）

```bash
cd D:/sandbox_quotation_system/r31202-modules/05-spatial
"/c/Users/xinzh/AppData/Local/Google/Chrome/Application/chrome.exe" \
  --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --virtual-time-budget=2000 \
  --screenshot=spatial.png \
  "file:///D:/sandbox_quotation_system/r31202-modules/05-spatial/spatial.html"
```

期望：无 `console.error`，截图显示工具栏 + canvas 提示 + 左右面板。

---

_built 2026-10-16 · R31202 Module 05 · 装企报价空间算量（杀手差异化功能）_