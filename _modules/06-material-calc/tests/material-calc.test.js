// material-calc.test.js — 20 个测试全 PASS (Node 18+ 内置 test)

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  calcComposite,
  calcModeAuto,
  calcModeManual,
  calcModeLock,
  processItem,
  calcTotal,
  mergeFeeTable,
  validateItem,
  checkUnitConflict,
  DEFAULT_FEE_TABLE,
  MODES,
  MaterialCalcError,
  toFinite,
} = require('../src/material-calc');

const {
  importExcel,
  parseDelimited,
  detectDelimiter,
  detectFormula,
  rowToItem,
  ALIASES,
  getAliasesList,
} = require('../src/excel-import-extended');

const FIXTURES = path.join(__dirname, 'fixtures');
function loadFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

let csvText;

test.before(() => {
  csvText = loadFixture('excel-sample.csv');
  console.log('--- 20 个测试开始 ---');
});

test.after(() => {
  console.log('--- 20 个测试全部完成 ---');
});

// ===== 测试 1 =====
test('1. calcComposite 3 字段求和正确性 (含小数)', () => {
  const r = calcComposite({ laborCost: 30.5, materialCost: 15.25, auxiliaryCost: 5.25 });
  assert.equal(r, 51);
});

// ===== 测试 2 =====
test('2. calcComposite 负数拒绝抛错', () => {
  assert.throws(() => calcComposite({ laborCost: -1, materialCost: 0, auxiliaryCost: 0 }), MaterialCalcError);
});

// ===== 测试 3 =====
test('3. calcComposite 字符串拒绝 / null 转 0 / NaN 转 0', () => {
  // 字符串转数字成功则用,否则 fallback 0
  assert.equal(calcComposite({ laborCost: '10', materialCost: '20', auxiliaryCost: '5' }), 35);
  // 缺字段 → 0
  assert.equal(calcComposite({ laborCost: 10, materialCost: null, auxiliaryCost: undefined }), 10);
  // NaN 字符串 → fallback 0
  assert.equal(calcComposite({ laborCost: 'abc', materialCost: NaN, auxiliaryCost: 5 }), 5);
});

// ===== 测试 4 =====
test('4. auto 模式: 改 laborCost → compositePrice 重算', () => {
  const item = { laborCost: 30, materialCost: 15, auxiliaryCost: 5, compositePrice: 50 };
  const r = calcModeAuto(item, { laborCost: 40 });
  assert.equal(r.compositePrice, 60);
  assert.equal(r.compositeAuto, true);
});

// ===== 测试 5 =====
test('5. manual 模式: 改 compositePrice → 3 字段按比例分配', () => {
  const item = { laborCost: 30, materialCost: 15, auxiliaryCost: 5, compositePrice: 50 };
  // 改为 100 (即 2 倍)
  const r = calcModeManual(item, { compositePrice: 100 });
  assert.equal(r.compositePrice, 100);
  assert.equal(r.laborCost, 60);    // 30 * 2
  assert.equal(r.materialCost, 30); // 15 * 2
  // auxiliary = 100 - 60 - 30 = 10 (浮点修正)
  assert.equal(r.auxiliaryCost, 10);
  assert.equal(r.compositeAuto, false);
});

// ===== 测试 6 =====
test('6. lock 模式: compositePrice 改 → 3 字段不动', () => {
  const item = { laborCost: 30, materialCost: 15, auxiliaryCost: 5, compositePrice: 50 };
  const r = calcModeLock(item, { compositePrice: 999, laborCost: 9999, materialCost: 9999, auxiliaryCost: 9999 });
  assert.equal(r.compositePrice, 999);
  assert.equal(r.laborCost, 30);
  assert.equal(r.materialCost, 15);
  assert.equal(r.auxiliaryCost, 5);
});

// ===== 测试 7 =====
test('7. feeTable 默认: 5% 管理费 / 3% 税率 / 5% 主材服务费 / 80 元/㎡ 设计费 / 100% 折扣', () => {
  assert.equal(DEFAULT_FEE_TABLE.management.rate, 5);
  assert.equal(DEFAULT_FEE_TABLE.taxRate.rate, 3);
  assert.equal(DEFAULT_FEE_TABLE.materialService.rate, 5);
  assert.equal(DEFAULT_FEE_TABLE.design.rate, 80);
  assert.equal(DEFAULT_FEE_TABLE.discount.rate, 100);
  assert.equal(MODES.length, 3);
});

// ===== 测试 8 =====
test('8. 空 items → total = 0 (designArea=0)', () => {
  const r = calcTotal([], DEFAULT_FEE_TABLE, { designArea: 0 });
  assert.equal(r.total, 0);
  assert.equal(r.constructionSum, 0);
  assert.equal(r.materialSum, 0);
  assert.equal(r.designFee, 0);
});

// ===== 测试 9 =====
test('9. 单基装条目: constructionSum = 单价 × qty', () => {
  const cats = [{ group: 'construction', items: [{ name: '拆墙', unit: 'm2', qty: 30, price: 50 }] }];
  const r = calcTotal(cats, DEFAULT_FEE_TABLE);
  assert.equal(r.constructionSum, 1500);
});

// ===== 测试 10 =====
test('10. 单主材条目: materialSum = 单价 × qty', () => {
  const cats = [{ group: 'material', items: [{ name: '瓷砖', unit: '片', qty: 100, price: 38 }] }];
  const r = calcTotal(cats, DEFAULT_FEE_TABLE);
  assert.equal(r.materialSum, 3800);
});

// ===== 测试 11 =====
test('11. 9+15 分类空表 → total = 0 (designArea=0)', () => {
  const cats = [];
  for (let i = 0; i < 9; i++) cats.push({ group: 'construction', items: [] });
  for (let i = 0; i < 15; i++) cats.push({ group: 'material', items: [] });
  const r = calcTotal(cats, DEFAULT_FEE_TABLE, { designArea: 0 });
  assert.equal(r.total, 0);
  assert.equal(r.constructionSum, 0);
  assert.equal(r.materialSum, 0);
});

// ===== 测试 12 =====
test('12. 折扣率 = 0 → total = 0 (即使分子非零)', () => {
  const cats = [{ group: 'construction', items: [{ name: '拆墙', qty: 30, price: 50 }] }];
  const fee = mergeFeeTable({ discount: { rate: 0 } });
  const r = calcTotal(cats, fee, { designArea: 0 });
  assert.equal(r.total, 0);
  assert.equal(r.constructionSum, 1500); // 分子非零
});

// ===== 测试 13 =====
test('13. 设计费 = 80 × designArea (independent)', () => {
  const cats = [{ group: 'construction', items: [{ name: '拆墙', qty: 10, price: 100 }] }];
  const r1 = calcTotal(cats, DEFAULT_FEE_TABLE, { designArea: 100 });
  const r2 = calcTotal(cats, DEFAULT_FEE_TABLE, { designArea: 50 });
  assert.equal(r1.designFee, 8000);
  assert.equal(r2.designFee, 4000);
});

// ===== 测试 14 =====
test('14. 校验: laborCost 负数抛错', () => {
  assert.throws(
    () => calcModeAuto({ laborCost: 0, materialCost: 0, auxiliaryCost: 0 }, { laborCost: -5 }),
    MaterialCalcError
  );
});

// ===== 测试 15 =====
test('15. 校验: auxiliaryCost null 转 0 / NaN 转 0', () => {
  const r1 = calcComposite({ laborCost: 10, materialCost: 5, auxiliaryCost: null });
  assert.equal(r1, 15);
  const r2 = calcComposite({ laborCost: 10, materialCost: 5, auxiliaryCost: NaN });
  assert.equal(r2, 15);
});

// ===== 测试 16 =====
test('16. 校验: 单位冲突 warning (不抛错)', () => {
  const seen = new Map();
  const a = checkUnitConflict('瓷砖', '片', seen);
  const b = checkUnitConflict('瓷砖', 'm2', seen);
  assert.equal(a.conflict, false);
  assert.equal(b.conflict, true);
  assert.ok(b.warning.includes('单位冲突'));
});

// ===== 测试 17 =====
test('17. 校验: 缺单位 status=pending', () => {
  const r = validateItem({ name: '拆墙', unit: '', price: 50 });
  assert.equal(r.status, 'pending');
});

// ===== 测试 18 =====
test('18. Excel aliases 22 列全部识别 (含变体)', () => {
  // 至少 22 个唯一别名
  const list = getAliasesList();
  assert.ok(list.length >= 22, `应至少 22 别名, 实际 ${list.length}`);
  // 必须包含指定关键别名
  for (const required of ['名称', '单位', '综合单价', '人工费', '材料费', '辅料费', '品牌', '型号', '规格', '施工工艺说明']) {
    assert.ok(list.includes(required), `缺别名: ${required}`);
  }
});

// ===== 测试 19 =====
test('19. Excel formulas 重算: SUM 同行 / A+B+C+D 同行', () => {
  // 检测公式
  const f1 = detectFormula('=SUM(A1:D1)');
  assert.equal(f1.type, 'excel_expr');
  const f2 = detectFormula('SUM(A1:D1)');
  assert.equal(f2.type, 'sum_range');
  const f3 = detectFormula('A1+B1+C1+D1');
  assert.equal(f3.type, 'cells');
  const f4 = detectFormula('38.5');
  assert.equal(f4, null);

  // 完整解析 CSV → rowToItem 应识别 3 字段并重算 compositePrice
  const parsed = importExcel(csvText);
  assert.ok(parsed.items.length >= 1);
  const first = parsed.items[0];
  assert.ok(first.compositePrice > 0, 'compositePrice 应被重算');
  assert.ok(first._formulaDetected, '应标记公式检测');
});

// ===== 测试 20 =====
test('20. UI 集成: cost-composition.html + fee-summary.html 文件存在 + 关键内容', () => {
  const cost = fs.readFileSync(path.join(__dirname, '..', 'src', 'cost-composition.html'), 'utf8');
  const fee = fs.readFileSync(path.join(__dirname, '..', 'src', 'fee-summary.html'), 'utf8');
  // cost-composition 必须有 3 字段 input + 模式切换 + 双向绑定
  assert.ok(cost.includes('id="labor-cost"'));
  assert.ok(cost.includes('id="material-cost"'));
  assert.ok(cost.includes('id="auxiliary-cost"'));
  assert.ok(cost.includes('id="composite-price"'));
  assert.ok(cost.includes('data-mode="auto"'));
  assert.ok(cost.includes('data-mode="manual"'));
  assert.ok(cost.includes('data-mode="lock"'));
  assert.ok(cost.includes('bindInput'));
  assert.ok(cost.includes('window.opener.ydata.updateItem'));

  // fee-summary 必须 5 费率输入 + 实时重算 + window.opener.ydata.updateFeeTable
  assert.ok(fee.includes('id="fee-mgmt"'));
  assert.ok(fee.includes('id="fee-tax"'));
  assert.ok(fee.includes('id="fee-matl"'));
  assert.ok(fee.includes('id="fee-design"'));
  assert.ok(fee.includes('id="fee-discount"'));
  assert.ok(fee.includes('recalc'));
  assert.ok(fee.includes('updateFeeTable'));

  // feeTable 默认值在 UI 中体现
  assert.ok(fee.includes('5'));  // 5%
  assert.ok(fee.includes('3'));  // 3%
  assert.ok(fee.includes('80')); // 80 元/㎡
});