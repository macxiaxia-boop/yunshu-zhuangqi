/*!
 * yunshu-zhuangqi · 报价引擎自检
 * 运行：node _engine/quote-engine.test.js
 */
const path = require('node:path');
const fs = require('node:fs');

global.localStorage = (function () {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    clear: () => m.clear(),
    get length() { return m.size; },
    key: i => Array.from(m.keys())[i] ?? null
  };
})();

const QE = require('./quote-engine.js');

let pass = 0, fail = 0;
const failures = [];
function t(name, fn) {
  try {
    const r = fn();
    if (r === true) { pass++; return; }
    fail++; failures.push(name + ' → ' + r);
  } catch (e) { fail++; failures.push(name + ' → THREW ' + e.message); }
}
function eq(a, b, label) {
  if (a === b) return true;
  return `${label || ''} expected=${JSON.stringify(b)} actual=${JSON.stringify(a)}`;
}
function near(a, b, tol, label) {
  if (Math.abs(a - b) <= (tol == null ? 0.011 : tol)) return true;
  return `${label || ''} expected≈${b} actual=${a}`;
}

// ── 数据模型 ────────────────────────────────────────────────
t('T01 CATEGORIES 数量 = 26（10 基装 + 1 附录 + 15 主材）',
  () => eq(QE.CATEGORIES.length, 26));
t('T02 CATEGORIES id 唯一',
  () => eq(new Set(QE.CATEGORIES.map(c => c.id)).size, QE.CATEGORIES.length));
t('T03 group 取值只有 construction/material',
  () => QE.CATEGORIES.every(c => c.group === 'construction' || c.group === 'material') || '有非法 group');
t('T04 newProject 生成 26 个分类容器',
  () => eq(QE.data.categories.length, 26));
t('T05 newProject 默认费率 = REF 对齐值',
  () => eq(QE.data.fees.managementRate, 5) &&
       eq(QE.data.fees.taxRate, 3) &&
       eq(QE.data.fees.materialServiceRate, 5) &&
       eq(QE.data.fees.designRate, 80) &&
       eq(QE.data.fees.discountRate, 100));

// ── 行操作 ─────────────────────────────────────────────────
t('T06 addRow 成功',
  () => !!QE.ops.addRow('c01', { name: '垃圾清运费', unit: '㎡', qty: 100, price: 12 }));
t('T07 addRow 未知分类抛错',
  () => { try { QE.ops.addRow('zzz', {}); return '未抛错'; } catch (e) { return true; } });
t('T08 行金额 = qty × price',
  () => near(QE.data.categories[0].items[0]._amount, 1200, 0.01, 'T08'));
t('T09 updateRow 改 qty 后金额重算',
  () => { QE.ops.updateRow('c01', QE.data.categories[0].items[0].id, { qty: 50 }); return near(QE.data.categories[0].items[0]._amount, 600); });
t('T10 removeRow 生效',
  () => { const id = QE.data.categories[0].items[0].id; QE.ops.removeRow('c01', id); return eq(QE.data.categories[0].items.length, 0); });
t('T11 addRow 字符串 qty/price 会转数字',
  () => { QE.ops.addRow('c01', { name: 'x', qty: '3', price: '4.5' }); const it = QE.data.categories[0].items[0]; return eq(it.qty, 3) && eq(it.price, 4.5); });
t('T12 toggleExclude 排除后不计价',
  () => { const it = QE.data.categories[0].items[0]; QE.ops.toggleExclude('c01', it.id); const c = QE.calc(); const ok = c.constructionSum === 0; QE.ops.toggleExclude('c01', it.id); return ok || '排除后仍计价'; });

// ── 计算引擎 ───────────────────────────────────────────────
function setupFixture() {
  QE.reset();
  QE.ops.addRow('c01', { name: '成品保护', unit: '㎡', qty: 100, price: 12 });   // 1200 基装
  QE.ops.addRow('c02', { name: '拆除地砖', unit: '㎡', qty: 50, price: 50 });    // 2500 基装
  QE.ops.addRow('m01', { name: '全房地砖', unit: '片', qty: 200, price: 80 });   // 16000 主材
  QE.ops.addRow('c04a', { name: '强电改造', unit: 'M', qty: 100, price: 36 });   // 附表
}
t('T13 setupFixture 后基装 = 3700', () => { setupFixture(); return near(QE.calc().constructionSum, 3700); });
t('T14 主材 = 16000', () => near(QE.calc().materialSum, 16000));
t('T15 管理费 = 3700 × 5% = 185', () => near(QE.calc().managementFee, 185));
t('T16 主材服务费 = 16000 × 5% = 800', () => near(QE.calc().materialFee, 800));
t('T17 小计 = 3700 + 185 + 16000 + 800 = 20685', () => near(QE.calc().subtotal, 20685));
t('T18 税金 = 20685 × 3% = 620.55', () => near(QE.calc().tax, 620.55));
t('T19 设计费 = designArea(0) × 80 = 0', () => near(QE.calc().designFee, 0));
t('T20 折扣 100% → 总计 = 21305.55', () => near(QE.calc().total, 21305.55));
t('T21 附表 c04a 不计入总额（仍显示分类小计）',
  () => { const c = QE.calc(); return near(c.byCategory.c04a.sum, 3600) && near(c.total, 21305.55); });
t('T22 设建筑面积 100 → 设计费 = 8000',
  () => { QE.ops.setInfo({ designArea: 100 }); return near(QE.calc().designFee, 8000); });
t('T23 设计费计入 total',
  () => near(QE.calc().total, 29305.55));
t('T24 折扣 90% → total = 26375.00',
  () => { QE.ops.setFee('discountRate', 90); return near(QE.calc().total, 26374.995, 0.02); });
t('T25 折扣 0 → total = 0',
  () => { QE.ops.setFee('discountRate', 0); return near(QE.calc().total, 0); });
t('T26 负费率被拒',
  () => { try { QE.ops.setFee('managementRate', -1); return '未抛错'; } catch (e) { return true; } });
t('T27 NaN 费率被拒',
  () => { try { QE.ops.setFee('taxRate', 'abc'); return '未抛错'; } catch (e) { return true; } });
t('T28 费率 0 合法（免税场景）',
  () => { QE.ops.setFee('taxRate', 0); return near(QE.calc().tax, 0); });
t('T29 空工程 total = 0',
  () => { QE.reset(); return near(QE.calc().total, 0); });

// ── 增减项 ─────────────────────────────────────────────────
t('T30 addChange 增项计入 changeAdd',
  () => { setupFixture(); QE.ops.addChange('add', { name: '加装门槛石', qty: 10, price: 200 }); return near(QE.calc().changeAdd, 2000); });
t('T31 减项计入 changeRemove',
  () => { QE.ops.addChange('remove', { name: '取消吊顶', qty: 5, price: 100 }); return near(QE.calc().changeRemove, 500); });
t('T32 changeNet = add - remove',
  () => near(QE.calc().changeNet, 1500));
t('T33 grandTotal = total + changeNet',
  () => { QE.ops.setFee('discountRate', 100); QE.ops.setInfo({ designArea: 0 }); const c = QE.calc(); return near(c.grandTotal, c.total + c.changeNet); });
t('T34 增减项不并入 total（独立汇总）',
  () => { const c = QE.calc(); return near(c.total, 21305.55); });
t('T35 removeChange 生效',
  () => { const ch = QE.data.changeOrders[0]; QE.ops.removeChange(ch.id); return near(QE.calc().changeAdd, 0); });

// ── 持久化 ─────────────────────────────────────────────────
t('T36 saveProject + listProjects 有记录',
  () => { setupFixture(); const id = QE.store.saveProject(); return QE.store.listProjects().some(p => p.id === id); });
t('T37 listProjects 返回计算出的 total',
  () => { const list = QE.store.listProjects(); return list.length > 0 && typeof list[0].total === 'number'; });
t('T38 loadProject 还原数据',
  () => { const list = QE.store.listProjects(); const before = list[0].total; QE.reset(); QE.store.loadProject(list[0].id); return near(QE.calc().total, before); });
t('T39 loadProject 不存在抛错',
  () => { try { QE.store.loadProject('nope'); return '未抛错'; } catch (e) { return true; } });
t('T40 deleteProject 生效',
  () => { const list = QE.store.listProjects(); QE.store.deleteProject(list[0].id); return eq(QE.store.listProjects().length, 0); });
t('T41 派生字段 _amount 不落盘',
  () => { setupFixture(); QE.store.saveProject(); const raw = localStorage.getItem('yunshu_projects_v1'); return raw.indexOf('_amount') < 0 || '_amount 被序列化'; });

// ── 导入导出 ───────────────────────────────────────────────
t('T42 toJSON 含 format 标记',
  () => JSON.parse(QE.toJSON()).format === 'YUNSHU_QUOTE_PROJECT' || '缺 format');
t('T43 toJSON 含 summary 计算结果',
  () => typeof JSON.parse(QE.toJSON()).summary.total === 'number' || '缺 summary');
t('T44 fromJSON 往返一致',
  () => { setupFixture(); const before = QE.calc().total; const json = QE.toJSON(); QE.reset(); QE.fromJSON(json); return near(QE.calc().total, before); });
t('T45 fromJSON 非法 JSON 抛错',
  () => { try { QE.fromJSON('{bad json'); return '未抛错'; } catch (e) { return true; } });
t('T46 fromJSON REF 格式（中文分类名）可识别',
  () => {
    QE.reset();
    QE.fromJSON(JSON.stringify({
      projectInfo: { name: 'REF导入测试', managementRate: 8, taxRate: 3 },
      categories: [{ cn: '拆除工程', items: [{ name: '拆除墙砖', unit: '㎡', qty: 10, price: 50 }] }]
    }));
    return QE.data.projectInfo.name === 'REF导入测试' && QE.calc().constructionSum === 500;
  });
t('T47 fromJSON REF 费率回填到 fees',
  () => { QE.reset(); QE.fromJSON(JSON.stringify({ projectInfo: { managementRate: 8, taxRate: 4 } })); return QE.data.fees.managementRate === 8 && QE.data.fees.taxRate === 4; });
t('T48 CSV 含 BOM + 防注入',
  () => {
    QE.reset();
    QE.ops.addRow('c01', { name: '=cmd|calc', qty: 1, price: 1 });
    const csv = QE.toCSV();
    return csv.charCodeAt(0) === 0xFEFF && csv.indexOf("'=cmd") >= 0 || 'BOM/防注入缺失';
  });
t('T49 CSV 含汇总行',
  () => { setupFixture(); const csv = QE.toCSV(); return csv.includes('基装合计') && csv.includes('折扣后总计'); });

// ── 订阅 ───────────────────────────────────────────────────
t('T50 on() 订阅收到事件',
  () => { let hits = 0; const off = QE.on(() => { hits++; }); QE.ops.addRow('c01', { name: 'z' }); off(); QE.ops.addRow('c01', { name: 'y' }); return hits === 1 || `期望 1 次,实际 ${hits}`; });

// ── 定额库（读 seed 文件） ──────────────────────────────────
t('T51 quota-seed.json 结构完整',
  () => {
    const p = path.join(__dirname, 'quota-seed.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return Array.isArray(j.categories) && j.categories.length > 0 &&
           j.categories.every(c => c.id && c.cn && Array.isArray(c.items)) || '结构异常';
  });
t('T52 quota-seed ≥ 250 条',
  () => {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'quota-seed.json'), 'utf-8'));
    const n = j.categories.reduce((s, c) => s + c.items.length, 0);
    return n >= 250 || `只有 ${n} 条`;
  });
t('T53 quota-seed 每条有 name+unit+price',
  () => {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'quota-seed.json'), 'utf-8'));
    const bad = j.categories.flatMap(c => c.items).filter(i => !i.name || i.unit === undefined || typeof i.price !== 'number');
    return bad.length === 0 || `${bad.length} 条缺字段`;
  });
t('T54 quota.addToQuote 真写入报价',
  () => {
    QE.reset();
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'quota-seed.json'), 'utf-8'));
    const cat = j.categories[0];
    const row = QE.quota.addToQuote(cat.id, cat.items[0], 3);
    return QE.data.categories.find(c => c.id === cat.id).items.length === 1 &&
           near(QE.calc().byCategory[cat.id].sum, (cat.items[0].price || 0) * 3);
  });
t('T55 quota.search 能命中',
  () => {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'quota-seed.json'), 'utf-8'));
    QE.state.quota = { categories: j.categories, feeTable: j.feeTable };
    const r = QE.quota.search('地砖');
    return Array.isArray(r) && r.length > 0 || '搜不到"地砖"';
  });
t('T56 quota.search 空 keyword 返回全部',
  () => {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'quota-seed.json'), 'utf-8'));
    QE.state.quota = { categories: j.categories, feeTable: j.feeTable };
    const r = QE.quota.search('');
    return r.length >= 250 || `只返回 ${r.length} 条`;
  });
t('T57 quota-seed 分类 id 与引擎 CATEGORIES 对齐',
  () => {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'quota-seed.json'), 'utf-8'));
    const known = new Set(QE.CATEGORIES.map(c => c.id));
    const orphan = j.categories.filter(c => !known.has(c.id));
    return orphan.length === 0 || '孤儿分类: ' + orphan.map(o => o.id).join(',');
  });

// ── 输出 ───────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════');
console.log('  yunshu-zhuangqi · 报价引擎自检');
console.log('═══════════════════════════════════════════');
if (failures.length) { console.log('\n失败明细：'); failures.forEach(f => console.log('  ✗ ' + f)); }
console.log(`\n  PASS: ${pass}   FAIL: ${fail}   总计: ${pass + fail}`);
console.log('═══════════════════════════════════════════\n');
process.exit(fail ? 1 : 0);