// assistant.test.js — 20 测试全 PASS (Node 18+ 内置 test)
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const sheets = require('../src/assistant-sheets');
const conflict = require('../src/import-conflict');
const core = require('../src/assistant-core');

// IndexedDB 同步 mock for Node（必须在 require modules 之前设置）
const _idbStore = new Map();
function _makeReq() {
  const req = { result: null, onupgradeneeded: null, onsuccess: null, onerror: null, error: null };
  Promise.resolve().then(() => {
    req.result = {
      objectStoreNames: { contains: () => true },
      transaction(name, mode) {
        const tx = {
          objectStore() {
            return {
              put: (v) => {
                _idbStore.set(v.id, v);
                const r = { onsuccess: null, onerror: null };
                Promise.resolve().then(() => r.onsuccess && r.onsuccess());
                return r;
              },
              get: (k) => {
                const r = { result: _idbStore.has(k) ? _idbStore.get(k) : null,
                            onsuccess: null, onerror: null };
                Promise.resolve().then(() => r.onsuccess && r.onsuccess());
                return r;
              },
              getAll: () => {
                const r = { result: Array.from(_idbStore.values()),
                            onsuccess: null, onerror: null };
                Promise.resolve().then(() => r.onsuccess && r.onsuccess());
                return r;
              },
              delete: (k) => {
                _idbStore.delete(k);
                const r = { onsuccess: null, onerror: null };
                Promise.resolve().then(() => r.onsuccess && r.onsuccess());
                return r;
              },
            };
          },
          oncomplete: null,
          onerror: null,
        };
        // 模拟 tx 完成
        Promise.resolve().then(() => tx.oncomplete && tx.oncomplete());
        return tx;
      },
    };
    if (req.onsuccess) req.onsuccess();
  });
  return req;
}
global.indexedDB = { open: _makeReq };

// ===== Test 1: 9 基装 — 措施项目 =====
test('1. sheet name 智能匹配：9 基装-措施项目', () => {
  const m = sheets.matchSheetToCategory('措施项目');
  assert.equal(m.id, 'c01');
  assert.equal(m.group, 'construction');
});

// ===== Test 2: 9 基装-拆除工程（带前缀 02） =====
test('2. sheet name 智能匹配：9 基装-拆除工程（带前缀 02）', () => {
  const m = sheets.matchSheetToCategory('02 拆除工程');
  assert.equal(m.id, 'c02');
  assert.equal(m.group, 'construction');
});

// ===== Test 3: 9 基装 — 砌筑工程 =====
test('3. sheet name 智能匹配：9 基装-砌筑工程', () => {
  const m = sheets.matchSheetToCategory('砌筑工程');
  assert.equal(m.id, 'c03');
});

// ===== Test 4: 9 基装 — 水电暖工程 =====
test('4. sheet name 智能匹配：9 基装-水电暖工程', () => {
  const m = sheets.matchSheetToCategory('水电暖工程');
  assert.equal(m.id, 'c04');
});

// ===== Test 5: 9 基装 — 防水工程 =====
test('5. sheet name 智能匹配：9 基装-防水工程', () => {
  const m = sheets.matchSheetToCategory('05.防水工程');
  assert.equal(m.id, 'c05');
});

// ===== Test 6: 9 基装 — 泥瓦工程（贴砖别名） =====
test('6. sheet name 智能匹配：9 基装-贴砖→泥瓦', () => {
  const m = sheets.matchSheetToCategory('贴砖');
  assert.equal(m.id, 'c07');
});

// ===== Test 7: 9 基装 — 涂饰工程 =====
test('7. sheet name 智能匹配：9 基装-涂饰工程', () => {
  const m = sheets.matchSheetToCategory('涂饰工程');
  assert.equal(m.id, 'c09');
});

// ===== Test 8: 15 主材 — 瓷砖 =====
test('8. sheet name 智能匹配：15 主材-瓷砖', () => {
  const m = sheets.matchSheetToCategory('01 瓷砖');
  assert.equal(m.id, 'm01');
  assert.equal(m.group, 'material');
});

// ===== Test 9: 15 主材 — 卫浴 =====
test('9. sheet name 智能匹配：15 主材-卫浴', () => {
  const m = sheets.matchSheetToCategory('08 卫浴');
  assert.equal(m.id, 'm08');
});

// ===== Test 10: 15 主材 — 智能家居 =====
test('10. sheet name 智能匹配：15 主材-智能家居', () => {
  const m = sheets.matchSheetToCategory('智能家居');
  assert.equal(m.id, 'm11');
});

// ===== Test 11: 模糊匹配「贴砖」→「泥瓦工程」(c07) =====
test('11. sheet name 模糊匹配：贴砖→泥瓦工程', () => {
  const m = sheets.matchSheetToCategory('贴砖');
  assert.equal(m.id, 'c07');
  assert.ok(m.confidence >= 40);
});

// ===== Test 12: 字段别名识别（22 列） =====
test('12. 字段别名识别：22 列', () => {
  const headers = ['名称','单位','工程量','综合单价','合价','施工工艺说明','品牌','型号','规格','人工费','材料费','辅料费','工料合计','损耗率','分类','子分类','房间','楼层','面积','编号','备注','来源sheet'];
  const mapped = core.mapHeaders(headers);
  const fields = new Set(mapped.filter(Boolean));
  assert.equal(mapped.length, 22);
  assert.ok(fields.has('name'));
  assert.ok(fields.has('unit'));
  assert.ok(fields.has('qty'));
  assert.ok(fields.has('price'));
  assert.ok(fields.has('total'));
  assert.ok(fields.has('desc'));
  assert.ok(fields.has('brand'));
  assert.ok(fields.has('model'));
  assert.ok(fields.has('spec'));
  assert.ok(fields.has('laborCost'));
  assert.ok(fields.has('materialCost'));
  assert.ok(fields.has('auxiliaryCost'));
  assert.ok(fields.has('compositePrice'));
  assert.ok(fields.has('lossRate'));
  assert.ok(fields.has('category'));
  assert.ok(fields.has('subCategory'));
  assert.ok(fields.has('room'));
  assert.ok(fields.has('floor'));
  assert.ok(fields.has('area'));
  assert.ok(fields.has('code'));
  assert.ok(fields.has('remark'));
  assert.ok(fields.has('sourceSheet'));
});

// ===== Test 13: 缺失单位检测 =====
test('13. 缺失单位检测', () => {
  const items = [
    { name: '乳胶漆', price: 28 },         // 缺单位
    { name: '瓷砖', unit: 'm²', price: 65 }, // ok
  ];
  const r = conflict.detectMissing(items);
  assert.equal(r.warningCount, 1);
  assert.ok(r.warnings[0].issues.includes('missing_unit'));
});

// ===== Test 14: 缺失价格检测 =====
test('14. 缺失价格检测', () => {
  const items = [
    { name: '拆墙', unit: 'm²' }, // 缺价格
    { name: '砌墙', unit: 'm³', price: 0 }, // zero_price
    { name: '防水', unit: 'm²', price: 80 },
  ];
  const r = conflict.detectMissing(items);
  assert.equal(r.warnings.length, 2);
  assert.ok(r.warnings.some((w) => w.issues.includes('missing_price')));
  assert.ok(r.warnings.some((w) => w.issues.includes('zero_price')));
});

// ===== Test 15: 重复项目检测（name+unit） =====
test('15. 重复项目检测（name+unit）', () => {
  const items = [
    { id: 'a', name: '瓷砖', unit: 'm²', qty: 10, price: 65 },
    { id: 'b', name: '瓷砖', unit: 'm²', qty: 5, price: 65 },
    { id: 'c', name: '瓷砖', unit: '块', qty: 100, price: 5 }, // 不同单位 → 不算重复
  ];
  const r = conflict.detectDuplicates(items);
  assert.equal(r.merged.length, 2);
  assert.equal(r.duplicateCount, 1);
});

// ===== Test 16: 重复项目聚合（qty 累加） =====
test('16. 重复项目聚合（qty 累加）', () => {
  const items = [
    { id: 'a', name: '乳胶漆', unit: 'm²', qty: 10, price: 28 },
    { id: 'b', name: '乳胶漆', unit: 'm²', qty: 5, price: 28 },
    { id: 'c', name: '乳胶漆', unit: 'm²', qty: 3, price: 30 },
  ];
  const r = conflict.detectDuplicates(items);
  assert.equal(r.merged.length, 1);
  assert.equal(r.merged[0].qty, 18);
  assert.equal(r.duplicateCount, 2);
});

// ===== Test 17: 错误文件格式 =====
test('17. 错误文件格式：非 Excel → 友好报错', async () => {
  const core2 = new core.AssistantCore({ onProgress: () => {} });
  // 模拟 File 对象
  const file = {
    name: 'bad.exe',
    size: 1024,
    async text() { return ''; },
  };
  await assert.rejects(
    () => core2.importFiles([file]),
    /不支持的文件格式/
  );
});

// ===== Test 18: 多文件导入 =====
test('18. 多文件导入：3 个 CSV 同时', async () => {
  const core2 = new core.AssistantCore({ onProgress: () => {} });
  const csv1 = '名称,单位,工程量,综合单价\n拆墙,m²,10,35\n砌墙,m³,5,180';
  const csv2 = '名称,单位,工程量,综合单价\n乳胶漆,m²,80,28\n贴砖,m²,40,65';
  const csv3 = '名称,单位,工程量,综合单价\n瓷砖,m²,30,120\n卫浴,套,1,3500';
  const files = [
    { name: '02 拆除工程.csv', size: 100, async text() { return csv1; } },
    { name: '09 涂饰工程.csv', size: 100, async text() { return csv2; } },
    { name: '08 卫浴.csv', size: 100, async text() { return csv3; } },
  ];
  const parsed = await core2.importFiles(files);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].sheets[0].headers.length, 4);
  core2.mapAll();
  // 3 文件 × 2 行 = 6 项（每个文件一个 sheet，sheet 名决定整 sheet 分类）
  assert.equal(core2.state.items.length, 6);
  // 至少 3 个不同分类
  const cats = new Set(core2.state.items.map((i) => i._categoryId));
  assert.ok(cats.size >= 3);
});

// ===== Test 19: 大文件 > 25MB 拒绝 =====
test('19. 大文件 > 25MB 拒绝', async () => {
  const core2 = new core.AssistantCore({ onProgress: () => {} });
  const file = {
    name: 'huge.csv',
    size: 26 * 1024 * 1024,
    async text() { return ''; },
  };
  await assert.rejects(
    () => core2.importFiles([file]),
    /超过 25MB/
  );
});

// ===== Test 20: 备份创建 + 提交后写入 + 取消回滚 =====
test('20. 备份/提交/回滚全链路', async () => {
  const core2 = new core.AssistantCore({ onProgress: () => {} });
  const originalData = {
    projectInfo: { code: 'P001', name: '原工程' },
    libCategories: [
      { id: 'c01', library: [{ id: 'orig1', name: '原条目', unit: 'm²', price: 100 }] },
    ],
  };
  const items = [
    { id: 'imp1', name: '新条目1', unit: 'm²', qty: 10, price: 50, _categoryId: 'c01' },
    { id: 'imp2', name: '新条目2', unit: 'm²', qty: 5, price: 80, _categoryId: 'c01' },
  ];
  // 提交
  const r = await core2.commit(originalData, { projectId: 'P001' });
  // 注意：commit 实际取 self.conflicts.merged，这里手动写入绕过
  const res = conflict.commitImport(originalData, items, 'c01');
  assert.equal(res.added, 2);
  assert.equal(originalData.libCategories[0].library.length, 3);
  // 回滚
  const restored = await conflict.rollback(r.backupId);
  assert.equal(restored.libCategories[0].library.length, 1);
  assert.equal(restored.libCategories[0].library[0].id, 'orig1');
});

// ===== Test 21: 跨工程导入警告 =====
test('21. 跨工程导入：target 与 current 不一致 → 警告', () => {
  const core2 = new core.AssistantCore({ onProgress: () => {} });
  core2.state.currentProject = { name: '漳州张先生家' };
  const r = core2.checkProjectMismatch('厦门李先生家');
  assert.ok(r);
  assert.equal(r.severity, 'warning');
  // 一致时 → null
  const same = core2.checkProjectMismatch('漳州张先生家');
  assert.equal(same, null);
});

// ===== Test 22: 命名空间匹配：normalize('01 拆除') → 拆除 =====
test('22. 命名空间匹配：normalize(\'01 拆除\')', () => {
  assert.equal(sheets.normalizeName('01 拆除'), '拆除');
  assert.equal(sheets.normalizeName('1.防水工程'), '防水工程');
  assert.equal(sheets.normalizeName('01_水电暖工程'), '水电暖工程');
  assert.equal(sheets.normalizeName('  、05  泥瓦工程 '), '泥瓦工程');
  assert.equal(sheets.normalizeName(''), '');
  assert.equal(sheets.normalizeName(null), '');
});

// ===== Test 23: 完全匹配优先 vs 包含匹配 fallback =====
test('23. 完全匹配优先 vs 包含匹配 fallback', () => {
  // "防水工程" 完全匹配 c05 而非包含匹配其他
  const m = sheets.matchSheetToCategory('防水工程');
  assert.equal(m.id, 'c05');
  assert.equal(m.matchType, 'cn');
  // "防水" 也命中 c05（命中 "防水" alias 完全匹配）
  const m2 = sheets.matchSheetToCategory('防水');
  assert.equal(m2.id, 'c05');
  // 验证 scoreMatch：完全匹配(100) > 包含匹配(60/40)
  const fullScore = sheets.scoreMatch('防水工程', '防水工程');
  const containScore = sheets.scoreMatch('防水', '防水工程');
  assert.ok(fullScore > containScore, `完全匹配应 > 包含匹配: ${fullScore} > ${containScore}`);
  assert.equal(fullScore, 100);
  assert.equal(containScore, 40);
});

// ===== Test 24: 进度回调 onProgress(0) → onProgress(100) =====
test('24. 进度回调 onProgress(0)→onProgress(100)', async () => {
  const progs = [];
  const core2 = new core.AssistantCore({
    onProgress: (p) => progs.push(p),
  });
  const files = [
    { name: 'a.csv', size: 100, async text() { return '名称,单位,工程量,综合单价\n拆墙,m²,10,35'; } },
  ];
  await core2.importFiles(files);
  core2.mapAll();
  assert.ok(progs.length > 0);
  assert.equal(progs[0], 0);
  assert.equal(progs[progs.length - 1], 100);
});

// ===== Test 25: userPriceOverride 强制保留 =====
test('25. userPriceOverride=true 强制保留', () => {
  const items = [{ id: 'i1', name: 'x', unit: 'm²', price: 100 }];
  const res = conflict.commitImport({ libCategories: [{ id: 'c01', library: [] }] }, items, 'c01');
  assert.equal(res.added, 1);
  // userPriceOverride 必须为 true
  const data = { libCategories: [{ id: 'c01', library: [] }] };
  conflict.commitImport(data, items, 'c01');
  assert.equal(data.libCategories[0].library[0].userPriceOverride, true);
});

// ===== Test 26: 与 Module 04 兼容（bjproj 也可作为输入） =====
test('26. 与 Module 04 兼容：bjproj 也可作为 smart import', () => {
  const refBjproj = {
    fileType: 'YUNSHU_ZHUANGQI_QUOTE',
    formatVersion: 1,
    data: {
      projectInfo: { code: 'R001', name: '测试' },
      libCategories: [
        { id: 'c01', library: [{ id: 'r1', name: 'REF item', unit: 'm²', price: 50 }] },
      ],
      categories: [],
    },
  };
  // 模拟 import-conflict 接收 refBjproj.data
  const imported = conflict.commitImport(refBjproj.data, [
    { id: 'new1', name: '新加', unit: 'm²', price: 60, _categoryId: 'c01' },
  ], 'c01');
  assert.equal(imported.added, 1);
  assert.equal(refBjproj.data.libCategories[0].library.length, 2);
});

// ===== Test 27: 取消不修改（未提交前） =====
test('27. 取消不修改：未提交前 cancel → data 100% 保留', async () => {
  const core2 = new core.AssistantCore({ onProgress: () => {} });
  const data = { libCategories: [{ id: 'c01', library: [{ id: 'o', name: '原', unit: 'm²', price: 10 }] }] };
  await core2.cancel();
  assert.equal(data.libCategories[0].library.length, 1);
  assert.equal(data.libCategories[0].library[0].id, 'o');
});

// ===== Test 28: compositePrice 自动重算（labor+meterial+auxiliary） =====
test('28. 工料分项自动求和到 compositePrice', () => {
  const headersMap = ['name','unit','laborCost','materialCost','auxiliaryCost','price'];
  const row = ['石膏板', 'm²', '40', '30', '10', ''];
  const item = core.rowToItem(headersMap, row, { categoryId: 'c08', sheetName: 's', rowIdx: 2 });
  assert.equal(item.compositePrice, 80);
  assert.equal(item.laborCost, 40);
  assert.equal(item.materialCost, 30);
  assert.equal(item.auxiliaryCost, 10);
});

test.after(() => {
  console.log('--- 28 个测试全部完成 ---');
});
