# 07-assistant — 智能助手（yunshu-zhuangqi 杀手差异化）

> **定位**：yunshu-zhuangqi 装企报价工具 · 多文件多 Sheet 批量导入 + 智能识别 9 基装 / 15 主材 + 人工核对 + 安全回滚
> **对位**：REF 3.1.0 智能助手（图纸导入 + 空间算量 + 自动报价分录）
> **MVP 路径**：用户上传 Excel/CSV → 自动识别 sheet 名 → 智能匹配分类 → 字段映射 → 人工核对 → 写入报价
> **约束**：纯原生 JS（File API + Web Crypto + IndexedDB），无 npm 依赖

## 1. 概述

| 项 | 值 |
|---|---|
| 输出产物 | 3 JS 模块 + 2 HTML 页面 + 1 README + 28 单元测试 |
| 输入格式 | `.csv` / `.tsv` / `.txt`（`.xlsx` 请先另存为 CSV UTF-8） |
| 输出格式 | 写入 ours 报价 `data.libCategories[categoryId].library[]` |
| 大小限制 | 单文件 ≤ 25 MB |
| 测试 | **28 PASS / 0 FAIL** · Node 18+ 内置 `node:test` |
| 阶段 | 4 阶段：import → map → review → commit |

## 2. 文件清单

```
r31202-modules/07-assistant/
├── src/
│   ├── assistant-sheets.js     25 分类 + normalize + scoreMatch (122 行)
│   ├── assistant-core.js       4 阶段主流程 AssistantCore (387 行)
│   └── import-conflict.js      重复/缺失/备份/回滚 (232 行)
├── tests/
│   └── assistant.test.js       28 测试全 PASS
├── assistant.html              主页面（3 tab：导入/核对/完成）
├── assistant-preview.html      字段映射预览（限 100 行/页）
└── README.md                   本文档
```

## 3. 调用方式

```html
<!-- assistant.html 已自动引入三个模块 -->
<script src="src/assistant-sheets.js"></script>
<script src="src/import-conflict.js"></script>
<script src="src/assistant-core.js"></script>

<script>
  // 创建主流程实例
  const core = new AssistantCore({
    onProgress: (p, msg) => console.log(p, msg),
  });

  // 阶段 1：导入文件（File 对象数组）
  await core.importFiles([file1, file2, file3]);

  // 阶段 2：自动映射（sheet→category, header→field）
  const { items, sheetMappings } = core.mapAll();

  // 阶段 3：核对（重复 + 缺失）
  const review = core.review();
  // → { total, merged, duplicateCount, warningCount, totalAmount, categories }

  // 阶段 4：提交（先备份到 IndexedDB）
  const result = await core.commit(data, { projectId: 'P001' });
  // → { backupId, totalAdded, results }

  // 取消：自动回滚到提交前
  await core.cancel();
</script>
```

### 3.1 单独使用模块

```js
// sheets 模块
const { matchSheetToCategory, normalizeName, listCategories } = window.AssistantSheets;
const m = matchSheetToCategory('02 拆除工程');
// → { id: 'c02', group: 'construction', confidence: 100, matchType: 'cn' }

// conflict 模块
const { detectDuplicates, detectMissing, backupCurrentProject,
        commitImport, rollback } = window.ImportConflict;
const dup = detectDuplicates(items);
const miss = detectMissing(dup.merged);
const backupId = await backupCurrentProject(data, projectId);
const result = commitImport(data, items, 'c02');
const restored = await rollback(backupId);
```

## 4. 25 分类智能匹配

### 4.1 9 基装 + 1 附录

| ID | EN | CN 主名 | 别名 |
|---|---|---|---|
| c01 | MEASURES | 措施项目 | 项目措施 |
| c02 | DEMOLITION | 拆除工程 | 拆除 |
| c03 | MASONRY | 砌筑工程 | 砌筑/砌墙/泥工 |
| c04 | MEP | 水电暖工程 | 水电工程/水暖 |
| c05 | WATERPROOFING | 防水工程 | 防水 |
| c06 | INSULATION | 保温工程 | 保温/隔音/静音 |
| c07 | TILING | 泥瓦工程 | 泥瓦/贴砖 |
| c08 | CARPENTRY | 木作工程 | 木作/木工 |
| c09 | PAINTING | 涂饰工程 | 涂饰/油漆/乳胶漆 |

### 4.2 15 主材

| ID | CN 主名 | 别名 |
|---|---|---|
| m01 | 瓷砖 | 地砖/墙砖 |
| m02 | 石材 | 大理石 |
| m03 | 地板 | 木地板/复合地板 |
| m04 | 门窗 | — |
| m05 | 套装门 | 木门 |
| m06 | 全屋定制 | 定制柜/衣柜 |
| m07 | 五金 | 锁具 |
| m08 | 卫浴 | 洁具/马桶 |
| m09 | 开关插座 | 开关/插座/面板 |
| m10 | 灯具 | 灯 |
| m11 | 智能家居 | 智能 |
| m12 | 设备 | 热水器/新风 |
| m13 | 电器 | 家电 |
| m14 | 家具 | — |
| m15 | 软装配饰 | 软装/配饰/窗帘 |

### 4.3 normalize 规则

```js
normalizeName('01 拆除工程')    // → '拆除工程'
normalizeName('1.防水工程')     // → '防水工程'
normalizeName('01_水电暖工程')  // → '水电暖工程'
normalizeName('  、05  泥瓦工程 ')  // → '泥瓦工程'
```

去除：BOM / 前缀编号(数字+零+、，,_ - — · •) / 中间空白。**保留**「工程」「项目」等后缀用于完全匹配加分。

### 4.4 评分规则

```
完全匹配  sheet === alias     → 100
包含匹配  sheet.includes(alias) → 60
包含匹配  alias.includes(sheet) → 40 (sheet.length ≥ 2)
无匹配                          → 0
```

## 5. 22 字段别名

| 标准字段 | 别名（部分） |
|---|---|
| name | 名称/项目名称/项目名称及备注/材料名称/分项名称/项目 |
| unit | 单位/计量单位 |
| qty | 工程量/数量/qty/quantity |
| price | 综合单价/单价/综合取费/price/unit price |
| total | 合价/金额/小计/total/amount |
| desc | 施工工艺说明/备注工艺/备注/项目特征描述 |
| brand | 品牌/brand/厂家 |
| model | 型号/model/规格型号 |
| spec | 规格/spec/尺寸 |
| laborCost | 人工费/人工/labor |
| materialCost | 材料费/材料/material |
| auxiliaryCost | 辅料费/辅料/auxiliary |
| compositePrice | 工料合计/工料分项/composite/分项合计 |
| lossRate | 损耗率/损耗/loss |
| category | 分类/category/类别 |
| subCategory | 子分类/subcategory/二级分类 |
| room | 房间/room/适用空间 |
| floor | 楼层/floor |
| area | 面积/area/施工面积 |
| code | 编号/编码/code/项目编号 |
| remark | 备注/remark/comment |
| sourceSheet | 来源sheet/source sheet/原表 |

## 6. 4 阶段流程

```
┌─────────────────────────────────────────────────────────┐
│ Tab 1: 导入                                              │
│   - 多文件选择（拖拽/点击）                                │
│   - 单文件 ≤ 25 MB                                       │
│   - 格式: .csv / .tsv / .txt (.xlsx 提示另存)              │
└─────────────────┬───────────────────────────────────────┘
                  │ importFiles()
                  ▼
┌─────────────────────────────────────────────────────────┐
│ Tab 2: 核对                                              │
│   - Sheet 名 → 自动归一化 → 智能匹配分类                  │
│   - Header → 22 列别名识别                                │
│   - 重复检测 (name+unit → qty 累加)                       │
│   - 缺失检测 (缺单位/缺价格/零价/缺名)                     │
│   - 概览: 总数 / 合并 / 重复 / 总金额 / 涉及分类          │
│   - 用户确认 → 提交                                       │
└─────────────────┬───────────────────────────────────────┘
                  │ commit(data)
                  ▼  (先 IndexedDB 备份)
┌─────────────────────────────────────────────────────────┐
│ Tab 3: 完成                                              │
│   - 显示已添加项数 + 备份 ID                              │
│   - 跳转报价页对应分类                                    │
└─────────────────────────────────────────────────────────┘
```

## 7. 安全 / 限制铁律

| 项 | 限制 |
|---|---|
| 单文件 | ≤ 25 MB |
| 字段映射 | 22 列别名（大小写不敏感） |
| 重复检测 | `name+unit` 一致视为重复，qty 累加 |
| 缺失检测 | 缺单位/缺价格/零价/缺名 全部标 warning |
| 价格保护 | 写入时强制 `userPriceOverride = true` |
| 备份时机 | 必须在 `commit()` 调用前自动创建 |
| 回滚能力 | 100%（基于 IndexedDB 快照） |
| 取消语义 | 未提交 → 直接清空；已提交 → 自动回滚 |
| 跨工程 | 检测 target 与 current 不一致 → 警告 |

## 8. IndexedDB 存储

```
DB: yunshu-assistant (v1)
├─ backups/  备份快照 { id: 'before-import-{projectId}-{ts}', data: ... }
└─ sessions/ 会话状态
```

每个 commit 生成一条 backup，可通过 `listBackups()` 查询、`rollback(backupId)` 恢复、`deleteBackup(backupId)` 删除。

## 9. 与其他模块集成

### 9.1 与 Module 04 (ref-reverse) 集成

`ref-reverse` 输出的 `YUNSHU_ZHUANGQI_QUOTE` 直接作为本模块的输入数据：

```js
const refData = await parseRefBjproj(refBjprojArrayBuffer);
const core = new AssistantCore({ onProgress: ... });
await core.importFiles(refFiles); // 可选：补充 Excel
const result = await core.commit(refData.data, { projectId: ... });
```

### 9.2 与 Module 06 (material-calc) 集成

智能助手解析时自动识别 `laborCost/materialCost/auxiliaryCost` 三列，自动求和到 `compositePrice`：

```js
// 行: 石膏板, m², 40, 30, 10, (空)
// 自动: compositePrice = 40 + 30 + 10 = 80
```

### 9.3 yunshu 主应用接入

左侧导航加 "智能助手" 按钮 → 跳转 `assistant.html?projectId={code}`：

```html
<a href="07-assistant/assistant.html?projectId=P001">
  <span class="icon">🤖</span>智能助手
</a>
```

智能助手 `core.commit()` 写入 `data.libCategories[categoryId].library[]` 后，跳转到 `quotation.html?category={firstChanged}`。

## 10. 已知 limitations

- **XLSX 暂不支持二进制解析**：纯原生无法解析 ZIP 容器。用户在 Excel 中"另存为 CSV UTF-8"即可。
- **大文件拒绝线 25MB**：超过的请先拆分。
- **单 sheet 单分类**：一个 sheet 的所有项默认归入同一个分类（按 sheet 名称匹配）。
- **跨工程检测是软警告**：不会阻止导入，仅提示用户确认。
- **备份永不自动清理**：需要手动 `deleteBackup()` 或用 `listBackups()` 列出后批量删除。

## 11. 测试运行

```bash
cd r31202-modules/07-assistant
node --test tests/assistant.test.js
```

输出：

```
ℹ tests 28
ℹ pass 28
ℹ fail 0
ℹ duration_ms ~107ms
```

## 12. 验收

| 项 | 要求 | 实际 |
|---|---|---|
| JS 文件 < 400 行 | ✓ | assistant-core.js 387, sheets 122, conflict 232 |
| 测试全 PASS | 20+ | **28 / 28 PASS** |
| 阶段数 | 4 | 4 (import/map/review/commit) |
| 分类别名 | 25 全活 | 25 (c01-c09 + m01-m15) |
| 字段别名 | 22 | 22 (name/unit/qty/price/...) |
| 重复处理 | 累加+警告 | qty 累加 + 警告 |
| 取消回滚 | 100% 安全 | IndexedDB 快照 + 自动回滚 |

---

_2026-10-16 · yunshu-zhuangqi 装企报价 · Module 07 assistant · v0.1.0_
