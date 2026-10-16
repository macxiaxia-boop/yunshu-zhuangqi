/* share.test.js — 12 self-tests for Module 10 share-link
 * R31202 · Module 10 · 🅱️ yunshu-zhuangqi
 *
 * Run:   node share.test.js
 * Exit:  0 = PASS ALL · 1 = FAIL
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var baseDir = __dirname;

// ========== In-memory DB backend ==========
// Provides a Promise-based getAll/getById/put/del/openDB API compatible with what
// share-api-mock.js expects. All data lives in __memDB in this process.
var __memDB = {
  sharedProjects: {},
  rateLimits: {},
  viewCounts: {}
};

var __shareDB = {
  openDB: function () { return Promise.resolve({ name: 'memdb', stores: __memDB }); },
  getAll: function (db, store) {
    var s = db.stores[store] || (db.stores[store] = {});
    return Promise.resolve(Object.keys(s).map(function (k) { return s[k]; }));
  },
  getById: function (db, store, key) {
    var s = db.stores[store] || (db.stores[store] = {});
    return Promise.resolve(Object.prototype.hasOwnProperty.call(s, String(key)) ? s[String(key)] : undefined);
  },
  put: function (db, store, value) {
    var s = db.stores[store] || (db.stores[store] = {});
    var key = value.shareId || value.phone;
    if (key == null) return Promise.reject(new Error('put: no key on record'));
    s[String(key)] = value;
    return Promise.resolve();
  },
  del: function (db, store, key) {
    var s = db.stores[store] || (db.stores[store] = {});
    delete s[String(key)];
    return Promise.resolve();
  },
  tx: function (db) { return db; },
  reqP: function (p) { return Promise.resolve(p); }
};

// Helper for tests to reset state between tests
function resetMemDB() {
  __memDB.sharedProjects = {};
  __memDB.rateLimits = {};
  __memDB.viewCounts = {};
}

// ========== Build sandbox ==========
var localStore = {};
var sandbox = {
  // Built-ins
  Promise: Promise,
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setImmediate: setImmediate,
  Date: Date,
  Math: Math,
  JSON: JSON,
  Object: Object,
  Array: Array,
  String: String,
  Number: Number,
  Boolean: Boolean,
  Error: Error,
  Uint8Array: Uint8Array,
  DataView: DataView,
  Buffer: Buffer,
  // Encode for share-qr.js
  TextEncoder: function TextEncoder() { this.encode = function (s) { return Buffer.from(String(s), 'utf8'); }; },
  // Crypto for shareId generation
  crypto: {
    getRandomValues: function (a) {
      for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256) & 0xff;
      return a;
    }
  },
  navigator: { clipboard: null },
  // localStorage mirror used by share-actions rate counter
  localStorage: {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(localStore, k) ? localStore[k] : null; },
    setItem: function (k, v) { localStore[k] = String(v); },
    removeItem: function (k) { delete localStore[k]; }
  },
  // Injectable share-api DB layer
  __shareDB: __shareDB,
  // Provide native Buffer encoder since TextEncoder above isn't perfect
  // (share-qr.js uses new TextEncoder().encode(text) — already covered)
};

vm.createContext(sandbox);

// Load all modules into SAME context
function loadModule(filename) {
  var code = fs.readFileSync(path.join(baseDir, filename), 'utf8');
  vm.runInContext(code, sandbox, { filename: filename });
}

loadModule('share-qr.js');
loadModule('share-api-mock.js');
loadModule('share-actions.js');
loadModule('share-create.js');

var api = sandbox.YSShareAPI;
var qr = sandbox.YSQR;
var actions = sandbox.YSActions;

if (!api || !qr || !actions) {
  console.error('Modules not loaded.', { api: !!api, qr: !!qr, actions: !!actions });
  process.exit(2);
}

// ========== Test harness ==========
var passed = 0, failed = 0, failures = [];
function test(name, fn) {
  resetMemDB();
  return Promise.resolve().then(fn).then(function () { console.log('  PASS  ' + name); passed++; }).catch(function (e) {
    var msg = '  FAIL  ' + name + ' — ' + (e && e.message || e); console.log(msg); failed++; failures.push({ name: name, err: e && (e.message || String(e)) });
  });
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error((msg || 'expected equal') + ' — got ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); }
function makeShare(opts) { return api.create(Object.assign({ projectData: { projectInfo: {}, categories: [], totals: {} }, estimateAmount: 100 }, opts)); }

// ========== Tests ==========
function test1_shareIdGeneration() {
  var seen = new Set();
  for (var i = 0; i < 10000; i++) {
    var id = api.generateShareId();
    if (id.length !== 12) throw new Error('length not 12: ' + id);
    if (!/^[0-9A-HJ-NP-TV-Z]{12}$/.test(id)) throw new Error('non-base32: ' + id);
    if (seen.has(id)) throw new Error('duplicate: ' + id + ' at ' + i);
    seen.add(id);
  }
  assert(seen.size === 10000, 'should be 10000 unique');
}

function test2_urlFormat() {
  return makeShare({ customerFields: { name: '业主A', phone: '13800138000' } }).then(function (r) {
    assert(/shareId=[0-9A-HJ-NP-TV-Z]{12}/.test(r.shareUrl), 'bad URL: ' + r.shareUrl);
  });
}

function test3_qrGeneration() {
  var urls = ['?shareId=ABCDEFGHJKLM', '?shareId=AAAAAAAAAAAA', '?shareId=BBBBBBBBBBBB', '?shareId=CCCCCCCCCCCC', '?shareId=DDDDDDDDDDDD', '?shareId=EEEEEEEEEEEE', '?shareId=FFFFFFFFFFFG', '?shareId=HHHHHHHHHHHH'].map(function (id) { return 'https://yunshu-zhuangqi.com/share-view.html' + id; });
  var matrices = urls.map(function (u) { return qr._matrix(u); });
  matrices.forEach(function (m) {
    assert(m && m.matrix, 'matrix null'); assert(m.size > 20, 'size too small');
    var dc = 0; for (var i = 0; i < m.matrix.length; i++) for (var j = 0; j < m.matrix[i].length; j++) if (m.matrix[i][j] === 1) dc++;
    assert(dc > 50, 'too few dark modules');
  });
  var a = JSON.stringify(matrices[0].matrix);
  for (var k = 1; k < matrices.length; k++) assert(a !== JSON.stringify(matrices[k].matrix), 'matrix ' + k + ' identical to 0');
}

function test4_indexedDBRoundTrip() {
  var sid;
  return api.create({ projectData: { projectInfo: { companyName: '云数科技测试' }, categories: [], totals: {} }, estimateAmount: 50000, customerFields: { name: '张三', phone: '13912345678' } })
    .then(function (r1) { sid = r1.shareId; return api.get(sid); })
    .then(function (r2) { assertEq(r2.shareId, sid); assertEq(r2.estimateAmount, 50000); assert(r2.data.projectInfo.companyName === '云数科技测试'); assert(r2.customerFields.phone.indexOf('****') >= 0); });
}

function test5_dataCompleteness() {
  var bigData = { projectInfo: { companyName: '云数装修', projectName: '三室两厅', customerName: '李四', customerPhone: '13987654321' }, categories: [], totals: { grandTotal: 888888 } };
  for (var i = 0; i < 25; i++) bigData.categories.push({ name: '分类' + i, items: [{ name: '项目A', unit: 'm²', qty: 10, price: 100, note: '备注' }] });
  return api.create({ projectData: bigData, estimateAmount: 888888, customerFields: { name: '李四', phone: '13987654321' } })
    .then(function (r1) { return api.get(r1.shareId); })
    .then(function (rec) { assertEq(rec.data.categories.length, 25); assertEq(rec.data.projectInfo.projectName, '三室两厅'); assertEq(rec.estimateAmount, 888888); assert(Array.isArray(rec.actions)); assertEq(rec.actions.length, 0); });
}

function test6_expired() {
  var sid;
  return makeShare({ expiresIn: 50, customerFields: { name: 'X', phone: '13900000000' } })
    .then(function (r1) { sid = r1.shareId; return new Promise(function (res) { setTimeout(res, 200); }); })
    .then(function () { return api.get(sid).then(function () { throw new Error('should have thrown'); }, function (e) { var m = String(e.message || e); assert(m.indexOf('EXPIRED') >= 0 || m.indexOf('NOT_FOUND') >= 0); }); });
}

function test7_notExpired() {
  return makeShare({ projectData: { projectInfo: { companyName: '云数' }, categories: [], totals: {} }, estimateAmount: 1000, expiresIn: 7 * 86400000, customerFields: { name: '王五', phone: '13911111111' } })
    .then(function (r1) { return api.get(r1.shareId); })
    .then(function (r2) { assert(r2.expiresAt > Date.now()); assert(r2.data.projectInfo.companyName === '云数'); });
}

function test8_confirmAction() {
  return makeShare({ customerFields: { name: '赵六', phone: '13922222222' } })
    .then(function (r1) {
      return api.addAction(r1.shareId, { type: 'confirm', customerName: '赵六', phone: '13922222222' })
        .then(function (r) { assert(r.ok); assertEq(r.action.type, 'confirm'); return api.get(r1.shareId); })
        .then(function (rec) { assertEq(rec.actions.length, 1); assertEq(rec.actions[0].type, 'confirm'); assertEq(rec.actions[0].customerPhoneMasked, '139****2222'); });
    });
}

function test9_rejectValidation() {
  return makeShare({ customerFields: { name: '孙七', phone: '13933333333' } })
    .then(function (r1) {
      return api.addAction(r1.shareId, { type: 'reject', customerName: '孙七', phone: '13933333333' })
        .then(function () { throw new Error('should have thrown'); }, function (e) { assert(String(e.message).indexOf('REASON') >= 0); })
        .then(function () { return api.addAction(r1.shareId, { type: 'reject', customerName: '孙七', phone: '13933333333', reason: '价格偏高' }); })
        .then(function (r) { assert(r.ok); });
    });
}

function test10_commentAction() {
  return makeShare({ customerFields: { name: '周八', phone: '13944444444' } })
    .then(function (r1) { return api.addAction(r1.shareId, { type: 'comment', customerName: '周八', phone: '13944444444', text: '请问可以分期吗？' }); })
    .then(function (r) { assertEq(r.action.type, 'comment'); assertEq(r.action.text, '请问可以分期吗？'); });
}

function test11_rateLimit() {
  sandbox.localStorage.removeItem('ys_share_rate_13988888888');
  var phone = '13988888888';
  var arr = []; var now = Date.now();
  for (var i = 0; i < 5; i++) arr.push(now - 1000 * (60 * i + 5));
  sandbox.localStorage.setItem('ys_share_rate_' + phone, JSON.stringify(arr));
  var r = actions.canAct(phone);
  assertEq(r.ok, false); assertEq(r.reason, 'RATE_LIMIT_EXCEEDED'); assertEq(r.count, 5);
  assertEq(actions.canAct('13999999999').ok, true);
  assertEq(actions.canAct('13977777777').ok, true);
  assertEq(actions.canAct('123').reason, 'INVALID_PHONE');
}

function test12_crossShareIsolation() {
  var phoneA = '13900000001', phoneB = '13900000002';
  return Promise.all([
    makeShare({ estimateAmount: 100, customerFields: { name: 'A业主', phone: phoneA } }),
    makeShare({ estimateAmount: 200, customerFields: { name: 'B业主', phone: phoneB } })
  ]).then(function (rs) {
    var shareA = rs[0], shareB = rs[1];
    return api.addAction(shareA.shareId, { type: 'confirm', customerName: 'A业主', phone: phoneA })
      .then(function () { return api.get(shareA.shareId); })
      .then(function (recA) { assertEq(recA.actions.length, 1); assertEq(recA.actions[0].customerName, 'A业主'); return api.get(shareB.shareId); })
      .then(function (recB) { assertEq(recB.actions.length, 0); return api.listActionsByPhone(phoneA); })
      .then(function (a) { assertEq(a.length, 1); assertEq(a[0].shareId, shareA.shareId); return api.listActionsByPhone(phoneB); })
      .then(function (b) { assertEq(b.length, 1); assertEq(b[0].shareId, shareB.shareId); });
  });
}

// ========== Run ==========
console.log('\n========================================');
console.log('Module 10 share-link · 12 自检');
console.log('========================================\n');

var tests = [
  ['T1  shareId 生成（12字符base32 · 10000唯一）', test1_shareIdGeneration],
  ['T2  URL 格式（含 shareId=xxxxx）', test2_urlFormat],
  ['T3  QR 生成（8 shareUrl → 8 不同 matrix）', test3_qrGeneration],
  ['T4  IndexedDB mock create/get 回环', test4_indexedDBRoundTrip],
  ['T5  data 完整（25 分类 + projectInfo + actions）', test5_dataCompleteness],
  ['T6  过期（expiresAt<now → get 抛错）', test6_expired],
  ['T7  未过期（expiresAt>now → get 成功）', test7_notExpired],
  ['T8  confirm action 写入', test8_confirmAction],
  ['T9  reject action + reason 校验', test9_rejectValidation],
  ['T10 comment action 写入', test10_commentAction],
  ['T11 速率限制（6th=拒绝）', test11_rateLimit],
  ['T12 跨 shareId 隔离（A 看不到 B actions）', test12_crossShareIsolation]
];

(async function () {
  for (var i = 0; i < tests.length; i++) {
    await test(tests[i][0], tests[i][1]);
  }
  console.log('\n========================================');
  console.log('结果：' + passed + ' PASS · ' + failed + ' FAIL');
  console.log('========================================');
  if (failed > 0) {
    console.log('\n失败汇总：');
    failures.forEach(function (f) { console.log('  - ' + f.name + ': ' + f.err); });
    process.exit(1);
  }
  process.exit(0);
})();
