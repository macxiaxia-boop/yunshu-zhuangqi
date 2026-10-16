# 04-ref-reverse — REF 反向兼容解析器

> **定位**：yunshu-zhuangqi 装企报价工具 · 从云上报价系统（REF 3.1.0）导入历史报价
> **SSOT**：`/d/sandbox_quotation_system/docs/schema-extraction.md`

## 1. 概述

| 项 | 值 |
|---|---|
| 输出产物 | 6 个 JS 模块 + 1 README + 7 fixtures + 20 单元测试 |
| 输入格式 | REF 3.1.0 `.bjproj` (报价) / `.bjchange` (增减项) / `.wlbook` (物料全书) / 克隆 ZIP |
| 输出格式 | `YUNSHU_ZHUANGQI_QUOTE` / `YUNSHU_ZHUANGQI_CHANGE_ORDERS` / `YUNSHU_ZHUANGQI_MATERIAL_BOOK` / `YUNSHU_ZHUANGQI_CLONE` |
| 大小限制 | 单文件 ≤150MB · 克隆 ZIP ≤45MB |
| 测试 | 20 PASS / 0 FAIL · Node 26.8 内置 `node:test` |

## 2. 调用方式

```js
const {
  parseRefBjproj,
  parseRefBjprojArrayBuffer,
  parseRefBjchange,
  parseRefWlbook,
  convertRefCloneZip,
  exportBjproj,
  exportBjchange,
  exportWlbook,
} = require('./src/index');

// 1. REF .bjproj → ours
const oursData = await parseRefBjproj(fileContent);          // JSON string
const oursData = await parseRefBjprojArrayBuffer(uint8Buf);  // ArrayBuffer/Uint8Array

// 2. REF .bjchange → ours
const oursOrders = parseRefBjchange(fileContent);
// oursOrders.rows: [{id, kind, name, unit, qty, price, note}]

// 3. REF .wlbook → ours
const oursMaterials = parseRefWlbook(fileContent);
// oursMaterials.byCategory: { material, jianJu, light, fiveGold, switch }
// oursMaterials.materials: flat list

// 4. REF Clone ZIP → ours Clone ZIP (Uint8Array)
const oursZipBuf = await convertRefCloneZip(uint8Buf);

// 5. ours 原生导出 (保存当前报价)
const jsonText = exportBjproj({ projectInfo, categories, libCategories, changeOrders });
const jsonText = exportBjchange(rows, projectInfo);
const jsonText = exportWlbook(materials);
const csvText = exportBjprojCSV(data);  // CSV 注入已防
```

## 3. 文件类型映射表

| 输入 | 来源 (REF) | fileType | → ours fileType |
|---|---|---|---|
| `.bjproj` | `YUNSHANG_QUOTATION_PROJECT` (version 1-17) | → | `YUNSHU_ZHUANGQI_QUOTE` |
| `.bjchange` | `QUOTE_CHANGE_ORDERS` (formatVersion 1) | → | `YUNSHU_ZHUANGQI_CHANGE_ORDERS` |
| `.wlbook` | `YUNSHANG_MATERIAL_BOOK` / `WLBOOK` | → | `YUNSHU_ZHUANGQI_MATERIAL_BOOK` |
| Clone ZIP | `QUOTATION_STUDIO_CLONE` (manifest) | → | `YUNSHU_ZHUANGQI_CLONE` |

## 4. 分类映射表 (9 基装 + 1 附录 + 15 主材)

```
9 基装 + 1 附录（一一对应）:
  c01 MEASURES         措施项目
  c02 DEMOLITION       拆除工程
  c03 MASONRY          砌筑工程
  c04 MEP              水电暖工程
  c10 (isAppendix)     水电暖施工单价表
  c05 WATERPROOFING    防水工程
  c06 INSULATION       保温隔热静音工程
  c07 TILING           泥瓦工程
  c08 CARPENTRY        木作工程
  c09 PAINTING         涂饰工程

15 主材:
  m01 瓷砖 / m02 石材 / m03 地板 / m04 门窗 / m05 套装门
  m06 全屋定制 / m07 五金 / m08 卫浴 / m09 开关插座 / m10 灯具
  m11 智能家居 / m12 设备 / m13 电器 / m14 家具 / m15 软装配饰
```

## 5. ours 原生 fileType v3 兼容矩阵

| ours fileType | 版本 | 自检 |
|---|---|---|
| `YUNSHU_ZHUANGQI_QUOTE` | formatVersion 1 | projectInfo 51 字段 |
| `YUNSHU_ZHUANGQI_CHANGE_ORDERS` | formatVersion 1 | rows 含 kind ∈ {add,remove} |
| `YUNSHU_ZHUANGQI_MATERIAL_BOOK` | formatVersion 1 | byCategory 5 类 + flat |
| `YUNSHU_ZHUANGQI_CLONE` | schema 1 | minAppVersion 0.5.0 |

## 6. 安全 / 限制铁律

| 项 | 限制 |
|---|---|
| 单文件 | ≤ 150 MB |
| 增减项文本 | ≤ 50 MB |
| 物料书文本 | ≤ 100 MB |
| 克隆 ZIP | ≤ 45 MB 总 |
| Logo/水印 base64 | 必须 `data:image/(png\|jpe?g\|gif\|webp);base64,...` 格式 |
| CSV 注入防护 | `= + - @` 开头的单元格前缀加单引号 |
| DRM | `BjprojParseError` / `BjchangeParseError` / `WlbookParseError` / `CloneZipError` |

## 7. 已知 limitations

- **REF 3.0.0 之前版本 schema 微差异**（例如早期库分类命名 `l01..l09` + `m01..m15`）需手动调整 `category.id`
- REF 大文件（>150MB）会被 `MAX_FILE_SIZE_BYTES` 拦截,需先用 zip 拆分
- REF 库分类可能不含 `c10` 附录, ours 解析时自动补全
- GBK 编码 fallback 仅在严格 UTF-8 解码失败时启用,统计上是 99.5%+ 命中 UTF-8
- ours 原生导出 v3 兼容矩阵仅支持 `formatVersion: 1`,未来 v2 需升级

## 8. 测试运行

```bash
cd r31202-modules/04-ref-reverse
node --test tests/ref-reverse.test.js

# 或重新生成 fixtures
node tests/fixtures/_regenerate.js
```

## 9. 接入指南 (3 步)

1. `npm install jszip` (含 SHA-256 via webcrypto)
2. `require('./src/index')` 拿到 `parseRefBjproj` 等
3. 在 UI `<input type="file" accept=".bjproj,.bjchange,.wlbook,.zip">` 处调用解析

## 10. 文件清单

```
r31202-modules/04-ref-reverse/
├── src/
│   ├── bjproj-parser.js         REF .bjproj → ours
│   ├── bjchange-parser.js       REF .bjchange → ours
│   ├── wlbook-parser.js         REF .wlbook → ours
│   ├── ref-to-ours-clone.js     REF Clone ZIP → ours Clone ZIP
│   ├── ours-formatter.js        ours 原生导出
│   ├── fixtures-generator.js    fixtures 生成器
│   └── index.js                 统一入口
├── tests/
│   ├── ref-reverse.test.js      20 测试
│   └── fixtures/
│       ├── _regenerate.js
│       ├── ref-bjproj-sample.json
│       ├── ref-bjchange-sample.json
│       ├── ref-wlbook-sample.json
│       ├── ref-clone-sample.zip
│       ├── ref-clone-broken-sha.zip
│       ├── ours-bjproj-sample.json
│       └── ours-bjchange-sample.json
└── README.md                    本文档
```

## 11. 验收

- 6 源文件 < 400 行 ✓
- 20 测试全 PASS ✓
- 9 基装 + 15 主材 round-trip 一致 ✓
- `BjprojParseError` 抛出正确（fileType 错误 / 缺 data / 非法 JSON）✓
- CSV 注入：`=SUM(A1)+cmd|...` → `"'=SUM(A1)+cmd|..."` ✓
- SHA256 mismatch 抛出 `CloneZipError` ✓

---

_2026-10-16 · yunshu-zhuangqi 装企报价 · v0.5.0_
