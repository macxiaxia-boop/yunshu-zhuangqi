# 06-material-calc — 工料分项计算模块

> **定位**：yunshu-zhuangqi 装企报价工具 · 基装项目 `laborCost + materialCost + auxiliaryCost = compositePrice` 自动重算 + 5 费率汇总
> **SSOT**：REF 3.1.0 schema（基装 item 三字段 + feeTable 综合取费表）

## 1. 概述

| 项 | 值 |
|---|---|
| 输出产物 | 3 个 JS 模块 + 2 个 HTML UI + 1 README + 1 fixture + 20 单元测试 |
| 核心 API | `calcComposite` / `calcModeAuto` / `calcModeManual` / `calcModeLock` / `processItem` / `calcTotal` |
| Excel 解析 | `importExcel` (CSV/TSV, 浏览器原生 `FileReader`, 无 SheetJS 依赖) |
| 浏览器全局 | `window.MaterialCalc` / `window.ExcelImportExtended` |
| 测试 | 20 PASS / 0 FAIL · Node 内置 `node:test` |
| 大小限制 | 单文件 < 400 行 |

## 2. 调用方式

```js
// Node (CommonJS)
const {
  calcComposite, calcModeAuto, calcModeManual, calcModeLock, processItem,
  calcTotal, validateItem, checkUnitConflict, mergeFeeTable,
  DEFAULT_FEE_TABLE, MODES, MaterialCalcError,
  importExcel, parseDelimited, detectFormula, rowToItem, ALIASES,
} = require('./src/index');

// 浏览器
<script src="./material-calc.js"></script>
<script src="./excel-import-extended.js"></script>
window.MaterialCalc.processItem(item, { laborCost: 40 }, 'auto');
window.ExcelImportExtended.importExcel(csvText);
```

## 3. 三种模式（auto / manual / lock）

```js
// item: { name, unit, qty, price, laborCost, materialCost, auxiliaryCost, compositePrice }
const item = { laborCost: 30, materialCost: 15, auxiliaryCost: 5, compositePrice: 50 };

// 1) auto（默认）— 改任意 1/2/3 字段 → 重算 compositePrice
calcModeAuto(item, { laborCost: 40 });
// → { laborCost: 40, materialCost: 15, auxiliaryCost: 5, compositePrice: 60, compositeAuto: true }

// 2) manual — 改 compositePrice → 按比例反推 3 字段
calcModeManual(item, { compositePrice: 100 });
// → { laborCost: 60, materialCost: 30, auxiliaryCost: 10, compositePrice: 100, compositeAuto: false }

// 3) lock — 锁定 3 字段, 仅 compositePrice 编辑
calcModeLock(item, { compositePrice: 999, laborCost: 9999 });
// → { laborCost: 30, materialCost: 15, auxiliaryCost: 5, compositePrice: 999, compositeAuto: false }

// 统一入口 processItem(item, patch, mode)
processItem(item, { laborCost: 40 }, 'auto');
processItem(item, { compositePrice: 100 }, 'manual');
processItem(item, { compositePrice: 999 }, 'lock');
```

## 4. 5 费率 feeTable（与 REF clone-settings financial Set 对齐）

```js
const DEFAULT_FEE_TABLE = {
  management:     { rate: 5,   base: 'sum_construction',         apply: 'total' },          // 5% 管理费
  taxRate:        { rate: 3,   base: 'subtotal_with_management', apply: 'total' },          // 3% 税率 (含管理费后)
  materialService:{ rate: 5,   base: 'sum_material',             apply: 'material_subtotal' }, // 5% 主材服务费
  design:         { rate: 80,  base: 'designArea',               apply: 'fixed' },          // 80 元/㎡ 设计费
  discount:       { rate: 100, base: 'total',                    apply: 'multiplier' },     // 100% 折扣 (0% = 零)
};

// 用户可调每个费率
const fee = mergeFeeTable({ management: { rate: 8 }, discount: { rate: 90 } });
calcTotal(categories, fee, { designArea: 230 });
// → { constructionSum, materialSum, mgmtFee, taxFee, matlService, designFee, discount, total }
```

## 5. 校验规则

| 项 | 行为 |
|---|---|
| `unit` 缺失 | → status='pending' |
| `price` 缺失或 ≤ 0 | → status='pending' |
| `laborCost`/`materialCost`/`auxiliaryCost` 负数 | → 抛 `MaterialCalcError(NEGATIVE_VALUE)` |
| 同名多单位冲突 | → `warning` (不抛错, 调用方决定) |
| `auxiliaryCost = null / NaN` | → 转 0 (不抛错) |

## 6. Excel aliases（22 列全识别）

| 字段 | 别名 |
|---|---|
| `name` | 名称 / 项目名称 / 项目名称及备注 / 材料名称 |
| `unit` | 单位 |
| `price` | 综合单价 / 单价 / 综合取费 |
| `desc` | 施工工艺说明 / 备注工艺 / 备注 / 项目特征描述 |
| `brand` / `model` / `spec` | 品牌 / 型号 / 规格 |
| `qty` | 数量 / 工程量 |
| `laborCost` | 人工费 |
| `materialCost` | 材料费 |
| `auxiliaryCost` | 辅料费 |
| `compositePrice` | 综合单价 / 合计 / Total |

公式识别：`=SUM(A1:D1)` / `A1+B1+C1+D1` / `SUM(A:D)` → 标记 `_formulaDetected`，并用 `labor + material + auxiliary` 重算 `compositePrice`。

## 7. UI 接入指南

### 7.1 cost-composition.html（item 编辑面板）

```js
// 父窗 (报价单) 启动子窗:
const item = { name: '拆除墙砖', unit: 'm2', qty: 30, price: 50,
              laborCost: 30, materialCost: 15, auxiliaryCost: 5, compositePrice: 50 };
const w = window.open('./cost-composition.html', '_blank',
  'width=520,height=620');
w.name = encodeURIComponent(JSON.stringify(item));

// 父窗注册 ydata:
window.ydata = {
  updateItem: (updated) => { /* 替换 item.laborCost / materialCost / auxiliaryCost / compositePrice */ }
};
```

### 7.2 fee-summary.html（费率汇总）

```js
// 父窗打开费率汇总:
const data = {
  categories: [...],           // 9 基装 + 15 主材
  feeTable: { management: { rate: 5 }, ... },
  designArea: 230,
};
const w = window.open('./fee-summary.html', '_blank', 'width=680,height=720');
w.name = encodeURIComponent(JSON.stringify(data));

window.ydata.updateFeeTable = ({ feeTable, designArea, result }) => {
  // 持久化 feeTable + result.total
};
```

## 8. 与 Module 03 (克隆 ZIP) 财务白名单联动

`feeTable` 的 5 个字段已纳入 Module 03 的财务字段白名单 (`financial Set`)，克隆 ZIP 时自动同步到对端，避免报价财务不一致。

## 9. 限制 / 边界

- **仅基装工程支持工料分项**：主材 (`group: 'material'`) 不分主辅人工,直接用 `price` 作为 `compositePrice`
- **CSV/TSV 优先**：XLSX 二进制解析待后续扩展（当前用 `FileReader.readAsText` 读 UTF-8 文本）
- **公式解析不执行真实 Excel 引擎**：`SUM(A1:D1)` 等仅做检测标记 + 用 3 字段求和兜底（避免引入 SheetJS）
- **manual 模式比例分配**：浮点可能 ±0.01, 通过 `Math.round(x*100)/100` 收敛

## 10. 测试运行

```bash
cd r31202-modules/06-material-calc
node --test tests/material-calc.test.js
# 20 PASS / 0 FAIL / ~100ms
```

## 11. 文件清单

```
r31202-modules/06-material-calc/
├── src/
│   ├── material-calc.js           核心计算 (3 字段 + 5 费率)  [251 行]
│   ├── excel-import-extended.js   Excel/CSV 扩充解析          [226 行]
│   ├── index.js                   统一入口                     [41 行]
│   ├── cost-composition.html      item 工料分项 UI             [196 行]
│   └── fee-summary.html           费率汇总 UI                  [163 行]
├── tests/
│   ├── material-calc.test.js      20 测试                      [256 行]
│   └── fixtures/
│       └── excel-sample.csv       CSV fixture (含公式标记)
```

## 12. 验收清单

- 3 个 JS 模块 + 2 个 HTML UI + 1 fixture + 1 README + 1 测试 ✓
- 20 测试全 PASS ✓
- 单文件 < 400 行 ✓ (max=251)
- 5 费率计算正确 (5/3/5/80/100) ✓
- 3 字段 auto / manual / lock 模式完整 ✓
- 校验: 负数抛错 / null 转 0 / NaN 转 0 / 单位冲突 warning ✓
- Excel aliases 22 列全识别 + 公式标记 ✓
- UI 双向绑定 + window.opener 推送 ✓

---

_2026-10-16 · yunshu-zhuangqi 装企报价 · v0.1.0 · 命名空间 `yunshu//cloudtech//装企报价//工料分项`_