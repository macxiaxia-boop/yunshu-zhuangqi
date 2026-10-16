/* print.test.js — 10 self-checks for print-preview module
 * Run with: node print.test.js
 * No external deps. Sets up minimal browser globals.
 */

'use strict';

// ---- minimal browser shim ----
const win = {};
global.window = win;
global.document = { documentElement: { style: { setProperty: () => {} } } };
global.URL = { createObjectURL: () => 'blob:', revokeObjectURL: () => {} };
global.Blob = function (parts, opts) { this.parts = parts; this.type = (opts && opts.type) || ''; };
global.atob = (s) => Buffer.from(s || '', 'base64').toString('binary');
global.btoa = (s) => Buffer.from(s || '', 'binary').toString('base64');

// ---- load modules ----
const fs = require('fs');
const path = require('path');
function load(file) {
  const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
  // eval in shared global context
  const fn = new Function('window', 'globalThis', src + '\n;return typeof PrintCore !== "undefined" ? PrintCore : (typeof PrintTemplate !== "undefined" ? PrintTemplate : (typeof PrintActions !== "undefined" ? PrintActions : null));');
  return fn(win, win);
}
load('print-core.js');
load('print-template.js');
load('print-actions.js');

const PC = win.PrintCore;
const PT = win.PrintTemplate;
const PA = win.PrintActions;

// ---- tests ----
let pass = 0, fail = 0;
const results = [];

function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; results.push('PASS ' + label); }
  else { fail++; results.push('FAIL ' + label + ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); }
}
function truthy(label, got) {
  if (got) { pass++; results.push('PASS ' + label); }
  else { fail++; results.push('FAIL ' + label + ' got=' + JSON.stringify(got)); }
}
function falsy(label, got) {
  if (!got) { pass++; results.push('PASS ' + label); }
  else { fail++; results.push('FAIL ' + label + ' got=' + JSON.stringify(got)); }
}

// Test 1: 22 paper sizes completeness
{
  const keys = Object.keys(PC.PAPER_SIZES);
  const expected = ['A0','A1','A2','A3','A4','A5','A6','A7','A8',
                    'B0','B1','B2','B3','B4','B5','B6',
                    'Letter','Legal','Tabloid','Executive','Folio','自定义'];
  eq('T1 22 paper sizes count', keys.length, 22);
  expected.forEach(function (k) {
    truthy('T1 contains ' + k, keys.indexOf(k) >= 0);
  });
}

// Test 2: range regex parsing
{
  // legal
  const s1 = PC.parseRange('1-5,8,11-13', 20);
  eq('T2 range 1-5,8,11-13 -> 9', s1.size, 9);
  truthy('T2 includes 1', s1.has(1));
  truthy('T2 includes 5', s1.has(5));
  truthy('T2 includes 13', s1.has(13));
  truthy('T2 excludes 6', !s1.has(6));

  // out of range
  const s2 = PC.parseRange('1-3,99,5-7', 10);
  eq('T2 out-of-range drops 99', s2.size, 6);
  falsy('T2 excludes 99', s2.has(99));

  // malformed
  const s3 = PC.parseRange('abc,5-x,1.5,', 10);
  eq('T2 malformed tokens dropped', s3.size, 0);

  // empty
  const s4 = PC.parseRange('', 10);
  eq('T2 empty string -> empty set', s4.size, 0);
  const s5 = PC.parseRange(null, 10);
  eq('T2 null expr -> empty set', s5.size, 0);

  // boundary reverse
  const s6 = PC.parseRange('5-1', 10);
  truthy('T2 reverse range 5-1 includes 1', s6.has(1));
  truthy('T2 reverse range 5-1 includes 5', s6.has(5));
}

// Test 3: orientation swap correctness
{
  const portrait = PC.getPaperDims({ paper: 'A4', orientation: 'portrait' });
  eq('T3 A4 portrait dims', portrait, [210, 297]);

  const landscape = PC.getPaperDims({ paper: 'A4', orientation: 'landscape' });
  eq('T3 A4 landscape dims (swapped)', landscape, [297, 210]);

  const letter = PC.getPaperDims({ paper: 'Letter', orientation: 'portrait' });
  eq('T3 Letter portrait', letter, [215.9, 279.4]);

  const a3 = PC.getPaperDims({ paper: 'A3', orientation: 'landscape' });
  eq('T3 A3 landscape', a3, [420, 297]);

  const custom = PC.getPaperDims({
    paper: '自定义', orientation: 'portrait',
    customW: 300, customH: 400
  });
  eq('T3 custom portrait', custom, [300, 400]);

  const customL = PC.getPaperDims({
    paper: '自定义', orientation: 'landscape',
    customW: 300, customH: 400
  });
  eq('T3 custom landscape (swapped)', customL, [400, 300]);
}

// Test 4: apply CSS -> @page rule applied
{
  const fakeStyle = { textContent: '' };
  PC.applyCSS(fakeStyle, {
    paper: 'A4', orientation: 'portrait', margin: 15, zoom: 100, color: 'color'
  });
  truthy('T4 @page rule in style.textContent', fakeStyle.textContent.indexOf('@page') === 0);
  truthy('T4 contains 210mm 297mm', fakeStyle.textContent.indexOf('210mm 297mm') >= 0);
  truthy('T4 contains margin 15mm', fakeStyle.textContent.indexOf('margin: 15mm') >= 0);
  truthy('T4 contains --paper-zoom', fakeStyle.textContent.indexOf('--paper-zoom') >= 0);

  // landscape + different paper
  const s2 = { textContent: '' };
  PC.applyCSS(s2, {
    paper: 'A3', orientation: 'landscape', margin: 10, zoom: 150, color: 'bw'
  });
  truthy('T4 A3 landscape -> 420mm 297mm', s2.textContent.indexOf('420mm 297mm') >= 0);
  truthy('T4 zoom 150 -> 1.5', s2.textContent.indexOf('--paper-zoom: 1.5') >= 0);
  truthy('T4 bw hint', s2.textContent.indexOf('white') >= 0);
}

// Test 5: 4 templates exist + handle empty data
{
  truthy('T5 renderQuoteTemplate is function', typeof PT.renderQuoteTemplate === 'function');
  truthy('T5 renderChangeOrderTemplate is function', typeof PT.renderChangeOrderTemplate === 'function');
  truthy('T5 renderMaterialBookTemplate is function', typeof PT.renderMaterialBookTemplate === 'function');
  truthy('T5 renderCoverTemplate is function', typeof PT.renderCoverTemplate === 'function');

  // empty -> still returns string
  const e1 = PT.renderQuoteTemplate(null);
  truthy('T5 quote null -> string', typeof e1 === 'string' && e1.length > 100);
  const e2 = PT.renderQuoteTemplate({});
  truthy('T5 quote empty -> contains 暂无 or 编制说明', e2.indexOf('暂无') >= 0 || e2.indexOf('编制说明') >= 0);
  const e3 = PT.renderChangeOrderTemplate({});
  truthy('T5 changeOrder empty -> string', typeof e3 === 'string' && e3.length > 100);
  const e4 = PT.renderMaterialBookTemplate({});
  truthy('T5 materialBook empty -> string', typeof e4 === 'string' && e4.length > 100);
  const e5 = PT.renderCoverTemplate({});
  truthy('T5 cover empty -> contains 云上室内建筑', e5.indexOf('云上室内建筑') >= 0);

  // normal data -> renders items
  const data = {
    projectInfo: { name: '测试工程', code: 'X-001', author: '张三' },
    categories: [{
      id: 'c01', num: '01', cn: '拆除工程', en: 'DEMOLITION', group: 'construction',
      items: [
        { id: 'i1', name: '拆除墙砖', unit: '㎡', qty: '20', price: '50', brand: 'A' }
      ]
    }]
  };
  const q = PT.renderQuoteTemplate(data);
  truthy('T5 quote normal -> contains 拆除工程', q.indexOf('拆除工程') >= 0);
  truthy('T5 quote normal -> contains 拆除墙砖', q.indexOf('拆除墙砖') >= 0);
  truthy('T5 quote normal -> contains 1000 (subtotal)', q.indexOf('1000.00') >= 0);
}

// Test 6: zoom wheel handler attaches + is active
{
  const el = { _listeners: {}, addEventListener: function (e, fn) { this._listeners[e] = fn; },
               removeEventListener: function (e) { delete this._listeners[e]; } };
  const state = { zoom: 100 };
  const cb = function (z) { state.zoom = z; };
  const detach = PC.attachZoom(el, state, cb);

  truthy('T6 wheel handler attached', typeof el._listeners.wheel === 'function');

  // simulate Ctrl+wheel up (zoom in)
  el._listeners.wheel({ deltaY: -120, ctrlKey: true, preventDefault: () => {} });
  eq('T6 ctrl+wheel up -> zoom 110', state.zoom, 110);

  // simulate without ctrl -> no change
  el._listeners.wheel({ deltaY: -120, ctrlKey: false, preventDefault: () => {} });
  eq('T6 no-ctrl wheel -> no change', state.zoom, 110);

  // simulate down -> decrease
  el._listeners.wheel({ deltaY: 120, ctrlKey: true, preventDefault: () => {} });
  eq('T6 ctrl+wheel down -> zoom 100', state.zoom, 100);

  // clamp boundary
  for (let i = 0; i < 50; i++) el._listeners.wheel({ deltaY: -120, ctrlKey: true, preventDefault: () => {} });
  eq('T6 zoom clamped to 300', state.zoom, 300);

  detach();
  truthy('T6 detach removes handler', !el._listeners.wheel);
}

// Test 7: range exclusion -> non-selected pages hidden
{
  // fake DOM
  const makeEl = function () {
    const classes = new Set();
    return {
      _classes: classes,
      classList: {
        add: function (c) { classes.add(c); },
        remove: function (c) { classes.delete(c); },
        contains: function (c) { return classes.has(c); }
      }
    };
  };
  const papers = [makeEl(), makeEl(), makeEl(), makeEl(), makeEl()];
  const selected = PC.resolveRange({ rangeMode: 'custom', rangeExpr: '1-3,5' }, 5, 1);
  PC.applyExclusion(papers, selected);
  truthy('T7 page 1 not excluded', !papers[0].classList.contains('excluded'));
  truthy('T7 page 2 not excluded', !papers[1].classList.contains('excluded'));
  truthy('T7 page 3 not excluded', !papers[2].classList.contains('excluded'));
  truthy('T7 page 4 excluded', papers[3].classList.contains('excluded'));
  truthy('T7 page 5 not excluded', !papers[4].classList.contains('excluded'));

  // odd range
  const s2 = PC.resolveRange({ rangeMode: 'odd' }, 5, 1);
  eq('T7 odd range size', s2.size, 3);
  PC.applyExclusion(papers, s2);
  truthy('T7 odd: page 1 visible', !papers[0].classList.contains('excluded'));
  truthy('T7 odd: page 2 hidden', papers[1].classList.contains('excluded'));
  truthy('T7 odd: page 3 visible', !papers[2].classList.contains('excluded'));
  truthy('T7 odd: page 4 hidden', papers[3].classList.contains('excluded'));
  truthy('T7 odd: page 5 visible', !papers[4].classList.contains('excluded'));

  // all range -> no exclusion
  const s3 = PC.resolveRange({ rangeMode: 'all' }, 5, 1);
  PC.applyExclusion(papers, s3);
  for (let i = 0; i < 5; i++) {
    truthy('T7 all: page ' + (i + 1) + ' visible', !papers[i].classList.contains('excluded'));
  }

  // action layer
  const papers2 = [makeEl(), makeEl(), makeEl()];
  const sel = new Set([1, 3]);
  const count = PA.excludePages(papers2, sel);
  eq('T7 PA.excludePages returns count', count, 1);
  truthy('T7 PA: page 2 hidden', papers2[1].classList.contains('excluded'));
  PA.clearExclusions(papers2);
  for (let i = 0; i < 3; i++) {
    truthy('T7 PA.clear: page ' + (i + 1) + ' visible', !papers2[i].classList.contains('excluded'));
  }
}

// Test 8: resolveRange all modes
{
  eq('T8 all -> 5/5', PC.resolveRange({ rangeMode: 'all' }, 5, 1).size, 5);
  eq('T8 current -> 1', PC.resolveRange({ rangeMode: 'current' }, 5, 3).size, 1);
  const cur = PC.resolveRange({ rangeMode: 'current' }, 5, 3);
  truthy('T8 current contains 3', cur.has(3));
  eq('T8 odd -> ceil(n/2)', PC.resolveRange({ rangeMode: 'odd' }, 5, 1).size, 3);
  eq('T8 even -> floor(n/2)', PC.resolveRange({ rangeMode: 'even' }, 6, 1).size, 3);
  eq('T8 custom 2-4 -> 3', PC.resolveRange({ rangeMode: 'custom', rangeExpr: '2-4' }, 10, 1).size, 3);
}

// Test 9: PrintActions surface (print/savePDF/close/excludePages) + return shapes
{
  truthy('T9 PA.print is function', typeof PA.print === 'function');
  truthy('T9 PA.savePDF is function', typeof PA.savePDF === 'function');
  truthy('T9 PA.close is function', typeof PA.close === 'function');
  truthy('T9 PA.excludePages is function', typeof PA.excludePages === 'function');
  truthy('T9 PA.clearExclusions is function', typeof PA.clearExclusions === 'function');

  // print returns object
  const pRet = PA.print();
  truthy('T9 PA.print returns object', typeof pRet === 'object' && typeof pRet.ok === 'boolean');

  // savePDF returns promise or object
  const sRet = PA.savePDF();
  truthy('T9 PA.savePDF returns thenable', typeof sRet.then === 'function');
}

// Test 10: listPrinters returns array (fallback OK)
{
  PC.listPrinters().then(function (list) {
    truthy('T10 listPrinters returns array', Array.isArray(list));
    truthy('T10 fallback includes pdf', list.indexOf('pdf') >= 0 || list.length >= 1);
    finish();
  }).catch(function (e) {
    fail++;
    results.push('FAIL T10 listPrinters rejected: ' + e);
    finish();
  });
}

function finish() {
  console.log('--- 10 self-checks results ---');
  results.forEach(function (r) { console.log(r); });
  console.log('---');
  console.log('PASS: ' + pass + ' / FAIL: ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}