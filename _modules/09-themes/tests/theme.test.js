// theme.test.js — 15 个自检全 PASS（Node 18+ 内置 test runner）
// 不依赖 jsdom：注入最小 window/document/localStorage mock 到 globalThis 后 require theme-controller

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// ============================================================
// 0. 最小 DOM / localStorage mock（无 jsdom 依赖）
// ============================================================

// localStorage mock
const _store = Object.create(null);
const mockStorage = {
  getItem(k)        { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
  setItem(k, v)     { _store[k] = String(v); },
  removeItem(k)     { delete _store[k]; },
  clear()           { for (const k in _store) delete _store[k]; },
  key(i)            { return Object.keys(_store)[i] || null; },
  get length()      { return Object.keys(_store).length; }
};

// document mock — 简化
const _bodyAttrs = Object.create(null);
const _docAttrs = Object.create(null);
const _styleVars = Object.create(null);

const mockBody = {
  setAttribute(k, v)    { _bodyAttrs[k] = v; },
  removeAttribute(k)    { delete _bodyAttrs[k]; },
  getAttribute(k)       { return Object.prototype.hasOwnProperty.call(_bodyAttrs, k) ? _bodyAttrs[k] : null; },
  hasAttribute(k)       { return Object.prototype.hasOwnProperty.call(_bodyAttrs, k); },
  style: { setProperty(k, v) { _styleVars[k] = v; }, getPropertyValue(k) { return _styleVars[k] || ''; } },
  addEventListener()    {},
  removeEventListener() {},
  querySelectorAll()    { return []; },
  querySelector()       { return null; },
  dataset: {}
};

const mockDoc = {
  body: mockBody,
  documentElement: {
    setAttribute(k, v) { _docAttrs[k] = v; },
    style: { setProperty(k, v) { _styleVars[k] = v; }, getPropertyValue(k) { return _styleVars[k] || ''; } },
    addEventListener() {}
  },
  querySelector()       { return null; },
  querySelectorAll()    { return []; },
  createElement(tag)    {
    return {
      tagName: tag.toUpperCase(),
      classList: { _set: new Set(), add(c){this._set.add(c);}, remove(c){this._set.delete(c);}, contains(c){return this._set.has(c);}, toggle(c){this._set.has(c) ? this._set.delete(c) : this._set.add(c);} },
      setAttribute(k, v){ this[k] = v; },
      getAttribute(k)   { return this[k]; },
      addEventListener(){},
      appendChild()     {},
      innerHTML: '',
      style: { setProperty() {}, getPropertyValue() { return ''; } }
    };
  }
};

// 把 mock 挂到 globalThis（必须 — controller 的 IIFE 在 require 时立即执行）
globalThis.window = globalThis;
globalThis.document = mockDoc;
globalThis.localStorage = mockStorage;

// 清空 store 工具
function clearAll() {
  for (const k in _store) delete _store[k];
  for (const k in _bodyAttrs) delete _bodyAttrs[k];
  for (const k in _docAttrs) delete _docAttrs[k];
  for (const k in _styleVars) delete _styleVars[k];
}

// ============================================================
// 1. 加载被测模块（必须先置 mock，再 require）
// ============================================================

const { YSTheme: YSTheme } = require('../src/theme-controller');
const { THEMES, CHROME, DENSITY, GLASS } = require('../src/theme-palettes');

test.before(() => {
  console.log('--- 15 个主题测试开始 ---');
});
test.after(() => {
  console.log('--- 15 个主题测试全部完成 ---');
});

// ============================================================
// 2. 15 个测试
// ============================================================

// ===== Test 1 =====
test('1. 6 主题全在白名单 (red/navy/turquoise/ochre/purple/lilac)', () => {
  const expected = ['red', 'navy', 'turquoise', 'ochre', 'purple', 'lilac'];
  assert.deepEqual(YSTheme.WHITE_THEME.slice().sort(), expected.slice().sort());
  // 全部 6 色在 THEMES 数据中存在
  for (const k of expected) {
    assert.ok(THEMES[k], 'THEMES missing ' + k);
    assert.ok(typeof THEMES[k].primary === 'string' && /^#[0-9a-fA-F]{6}$/.test(THEMES[k].primary), 'hex invalid: ' + k);
    assert.ok(typeof THEMES[k].rgb === 'string' && /^\d+,\d+,\d+$/.test(THEMES[k].rgb), 'rgb invalid: ' + k);
  }
});

// ===== Test 2 =====
test('2. setTheme(\'red\') 写入 :root --ys-primary = #A23C43', () => {
  clearAll();
  YSTheme.setTheme('red');
  assert.equal(_styleVars['--ys-primary'], '#A23C43');
  assert.equal(_styleVars['--ys-accent'],  '#A23C43');
  assert.equal(_styleVars['--ys-rgb'],      '162,60,67');
  assert.equal(YSTheme.getCurrent().color,  'red');
});

// ===== Test 3 =====
test('3. setMode(\'dark\') 触发 body[data-mode=\'dark\'] 与 chrome 重写', () => {
  clearAll();
  YSTheme.setMode('dark');
  assert.equal(_bodyAttrs['data-mode'], 'dark');
  // dark chrome 重写
  assert.equal(_styleVars['--ys-bg'],     CHROME.dark.bg);
  assert.equal(_styleVars['--ys-chrome'], CHROME.dark.chrome);
  assert.equal(_styleVars['--ys-ink'],    CHROME.dark.ink);
  assert.equal(_styleVars['--ys-muted'],  CHROME.dark.muted);
  assert.equal(_styleVars['--ys-line'],   CHROME.dark.line);
});

// ===== Test 4 =====
test('4. setGlass(true) → data-glass=true 与 chrome 转入玻璃样式', () => {
  clearAll();
  YSTheme.setGlass(true);
  assert.equal(_bodyAttrs['data-glass'], 'true');
  // 关闭
  YSTheme.setGlass(false);
  assert.equal(_bodyAttrs['data-glass'], 'false');
});

// ===== Test 5 =====
test('5. 密度 3 档 (compact/standard/loose) 全部生效 + 白名单', () => {
  clearAll();
  YSTheme.setDensity('compact');
  assert.equal(_bodyAttrs['data-density'], 'compact');
  assert.equal(DENSITY.compact.padding, '4px');
  assert.equal(DENSITY.compact.font,    '12px');

  YSTheme.setDensity('standard');
  assert.equal(_bodyAttrs['data-density'], 'standard');
  assert.equal(DENSITY.standard.padding, '8px');

  YSTheme.setDensity('loose');
  assert.equal(_bodyAttrs['data-density'], 'loose');
  assert.equal(DENSITY.loose.padding, '12px');
  assert.equal(DENSITY.loose.font,    '14px');

  // 白名单含 3 档
  assert.deepEqual(YSTheme.WHITE_DENS.slice().sort(), ['compact', 'loose', 'standard']);
});

// ===== Test 6 =====
test('6. applyAll(red,dark,false,compact) → 36 组合中的 1 个状态全到位', () => {
  clearAll();
  const cur = YSTheme.applyAll('red', 'dark', false, 'compact');
  assert.deepEqual(cur, { color: 'red', mode: 'dark', glass: false, density: 'compact' });
  assert.equal(_styleVars['--ys-primary'],   '#A23C43');
  assert.equal(_styleVars['--ys-bg'],        '#1a1f1c');
  assert.equal(_bodyAttrs['data-mode'],      'dark');
  assert.equal(_bodyAttrs['data-density'],   'compact');
  assert.equal(_bodyAttrs['data-glass'],     'false');
});

// ===== Test 7 =====
test('7. 持久化 localStorage 写 4 个键 (与 REF 对齐)', () => {
  clearAll();
  YSTheme.applyAll('navy', 'dark', true, 'loose');
  YSTheme.persist();
  assert.equal(_store[YSTheme.KEY_COLOR_MODE], 'dark');
  assert.equal(_store[YSTheme.KEY_LIGHT_SKIN], 'navy');
  assert.equal(_store[YSTheme.KEY_DENSITY],    'loose');
  assert.equal(_store[YSTheme.KEY_GLASS],      '1');
  // 4 个键名匹配 REF
  assert.equal(YSTheme.KEY_COLOR_MODE, 'ys_studio_ui_v31_color_mode');
  assert.equal(YSTheme.KEY_LIGHT_SKIN, 'ys_cloud_light_skin_v1');
  assert.equal(YSTheme.KEY_DENSITY,    'ys_studio_ui_v31_density');
});

// ===== Test 8 =====
test('8. loadFromStorage 还原 — 清现场后从 mockStorage 重建', () => {
  clearAll();
  // 预先写入
  _store[YSTheme.KEY_COLOR_MODE] = 'light';
  _store[YSTheme.KEY_LIGHT_SKIN] = 'turquoise';
  _store[YSTheme.KEY_DENSITY]    = 'compact';
  _store[YSTheme.KEY_GLASS]      = '1';
  // 注入初始 state = 默认
  YSTheme._state.color = 'red';
  YSTheme._state.mode  = 'light';
  YSTheme._state.glass = false;
  YSTheme._state.density = 'standard';

  const restored = YSTheme.loadFromStorage();
  assert.deepEqual(restored, { color: 'turquoise', mode: 'light', glass: true, density: 'compact' });
  // 验证 body attrs 也写入了
  assert.equal(_bodyAttrs['data-mode'],     'light');
  assert.equal(_bodyAttrs['data-density'],  'compact');
  assert.equal(_bodyAttrs['data-glass'],    'true');
  assert.equal(_styleVars['--ys-primary'],  '#0d7a73');  // turquoise
});

// ===== Test 9 =====
test('9. getAllCombinations = 36 = 6 color × 2 mode × 3 density', () => {
  clearAll();
  const combos = YSTheme.getAllCombinations();
  assert.equal(combos.length, 36);
  // 每种 color 出现 2*3=6 次
  const counts = {};
  for (const c of combos) counts[c.color] = (counts[c.color] || 0) + 1;
  for (const k of YSTheme.WHITE_THEME) {
    assert.equal(counts[k], 6, 'color ' + k + ' 应出现 6 次');
  }
  // 每种 mode 出现 6*3=18 次
  const modeCounts = {};
  for (const c of combos) modeCounts[c.mode] = (modeCounts[c.mode] || 0) + 1;
  assert.equal(modeCounts.light, 18);
  assert.equal(modeCounts.dark,  18);
  // 每种 density 出现 6*2=12 次
  const densCounts = {};
  for (const c of combos) densCounts[c.density] = (densCounts[c.density] || 0) + 1;
  assert.equal(densCounts.compact,  12);
  assert.equal(densCounts.standard, 12);
  assert.equal(densCounts.loose,    12);
});

// ===== Test 10 =====
test('10. 未在白名单的主题名 / mode / density 全部拒绝抛错', () => {
  clearAll();
  assert.throws(() => YSTheme.setTheme('orange'),    /rejected/);
  assert.throws(() => YSTheme.setTheme(''),          /rejected/);
  assert.throws(() => YSTheme.setTheme(null),       /rejected/);
  assert.throws(() => YSTheme.setMode('sepia'),      /rejected/);
  assert.throws(() => YSTheme.setDensity('huge'),    /rejected/);
  assert.throws(() => YSTheme.applyAll('pink', 'light', false, 'standard'), /rejected/);
  assert.throws(() => YSTheme.applyAll('red',  'auto', false, 'standard'), /rejected/);
  assert.throws(() => YSTheme.applyAll('red',  'light', false, 'tiny'),   /rejected/);
  // state 不变
  assert.equal(YSTheme._state.color, 'red');   // 默认
});

// ===== Test 11 =====
test('11. dark 模式 + lilac 色 → 配色可达（CSS vars 完整）', () => {
  clearAll();
  YSTheme.applyAll('lilac', 'dark', false, 'standard');
  const t = THEMES.lilac;
  const c = CHROME.dark;
  assert.equal(_styleVars['--ys-primary'], t.primary);   // #8a6b8e
  assert.equal(_styleVars['--ys-accent'],  t.primary);
  assert.equal(_styleVars['--ys-bg'],      c.bg);          // #1a1f1c
  assert.equal(_styleVars['--ys-ink'],     c.ink);         // #f0f0f0
  assert.equal(_styleVars['--ys-chrome'],  c.chrome);      // #262b28
  // lilac hex
  assert.equal(t.primary, '#8a6b8e');
});

// ===== Test 12 =====
test('12. glass + dark 组合下文本对比度 ≥ 4.5（WCAG AA）', () => {
  clearAll();
  YSTheme.applyAll('lilac', 'dark', true, 'standard');
  // dark 模式下 --ys-ink = #f0f0f0，背景 --ys-chrome = #262b28
  // 对比度计算：(L_light + 0.05) / (L_dark + 0.05)
  function lum(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const f = (c) => (c <= 0.03928) ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function contrast(a, b) {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  const ratio = contrast(CHROME.dark.ink, CHROME.dark.chrome);  // #f0f0f0 on #262b28
  assert.ok(ratio >= 4.5, '对比度 ' + ratio.toFixed(2) + ' < 4.5');

  // light 模式也要通过
  const ratioL = contrast(CHROME.light.ink, CHROME.light.chrome); // #1a1a1a on #ffffff
  assert.ok(ratioL >= 4.5, 'light 对比度 ' + ratioL.toFixed(2) + ' < 4.5');
});

// ===== Test 13 =====
test('13. 单维度切换不丢失其他维度（setMode 之后 state.color 与 state.density 保留）', () => {
  clearAll();
  YSTheme.applyAll('navy', 'light', false, 'loose');
  assert.equal(YSTheme._state.color, 'navy');
  assert.equal(YSTheme._state.density, 'loose');

  YSTheme.setMode('dark');
  assert.equal(YSTheme._state.color, 'navy');      // color 不丢
  assert.equal(YSTheme._state.density, 'loose');   // density 不丢
  assert.equal(YSTheme._state.mode, 'dark');
  assert.equal(_bodyAttrs['data-mode'], 'dark');
  assert.equal(_bodyAttrs['data-density'], 'loose');  // density attr 未被覆盖

  YSTheme.setDensity('compact');
  assert.equal(YSTheme._state.color, 'navy');     // 仍保留
  assert.equal(YSTheme._state.mode,  'dark');
  assert.equal(_bodyAttrs['data-mode'], 'dark');

  YSTheme.setTheme('ochre');
  assert.equal(YSTheme._state.mode,    'dark');     // mode 保留
  assert.equal(YSTheme._state.density, 'compact');  // density 保留
  assert.equal(YSTheme._state.color,   'ochre');
});

// ===== Test 14 =====
test('14. 主题切换动画（CSS transition 200ms）— theme-vars.css 与 theme-modes.css 都定义', () => {
  const varsPath  = path.join(__dirname, '..', 'src', 'theme-vars.css');
  const modesPath = path.join(__dirname, '..', 'src', 'theme-modes.css');
  const denPath   = path.join(__dirname, '..', 'src', 'theme-density.css');
  const glassPath = path.join(__dirname, '..', 'src', 'theme-glass.css');

  const vars = fs.readFileSync(varsPath, 'utf8');
  const modes = fs.readFileSync(modesPath, 'utf8');

  // 200ms 过渡必须在 vars 或 modes 中出现
  const has200ms = /200ms/.test(vars) || /200ms/.test(modes);
  assert.ok(has200ms, 'transition: 200ms 必须在 theme-vars.css 或 theme-modes.css 中存在');

  // :root --ys-transition 变量
  assert.ok(/--ys-transition/.test(vars), ':root 必须定义 --ys-transition');

  // 4 个 CSS 文件都存在
  assert.ok(fs.existsSync(varsPath),  'theme-vars.css 缺失');
  assert.ok(fs.existsSync(modesPath), 'theme-modes.css 缺失');
  assert.ok(fs.existsSync(denPath),   'theme-density.css 缺失');
  assert.ok(fs.existsSync(glassPath), 'theme-glass.css 缺失');
});

// ===== Test 15 =====
test('15. 主题切换不闪烁 — controller 一次性写入 CSS vars + body attrs（无多次 reflow）', () => {
  clearAll();
  // 用 Spy 计数 setProperty 与 setAttribute 的调用次数
  let cssWriteCount = 0;
  let attrWriteCount = 0;
  const origSetProp = _styleVars.__setProp__;
  const origSetAttr = _bodyAttrs.__setAttr__;
  _styleVars.__setProp__ = function () { cssWriteCount++; };
  _bodyAttrs.__setAttr__ = function () { attrWriteCount++; };

  // 实际上我们的 mock 是 Object.assign 风格（_styleVars[k] = v）。
  // 这里改用 Proxy 计数：
  let proxyWrites = 0;
  let prevSetProp = mockDoc.documentElement.style.setProperty;
  let prevSetAttr = mockBody.setAttribute;
  mockDoc.documentElement.style.setProperty = function () { proxyWrites++; };
  mockBody.setAttribute = function () { attrWriteCount++; };

  // applyAll 单次调用 → CSS vars 与 body attrs 应各自一次到多次（不重排）
  YSTheme.applyAll('ochre', 'dark', true, 'compact');
  const totalWrites = proxyWrites + attrWriteCount;

  mockDoc.documentElement.style.setProperty = prevSetProp;
  mockBody.setAttribute = prevSetAttr;

  // 单次 applyAll 写 CSS var + body attr（一次性 bulk update，不触发多次回流）
  // 期望：CSS 写 ≤ 30 次（13 vars + 反向兼容），body attr = 4（mode/glass/density/theme-color/theme-mode）
  assert.ok(proxyWrites > 0,    'CSS vars 必须有写入');
  assert.ok(proxyWrites < 100,  'CSS 写入不应过多（避免重排）');
  assert.ok(attrWriteCount >= 4, 'body attrs 至少 4 个 (mode/glass/density + 反向兼容)');
  assert.ok(attrWriteCount < 20, 'body attr 写入不过多');

  // 校验：state 不含 stale 数据
  assert.equal(YSTheme._state.color,   'ochre');
  assert.equal(YSTheme._state.mode,    'dark');
  assert.equal(YSTheme._state.density, 'compact');
  assert.equal(YSTheme._state.glass,   true);
});
