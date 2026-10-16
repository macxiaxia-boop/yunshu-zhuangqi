/* pwa.test.js — PWA 自检 · 直接命令行运行
 * node pwa.test.js          // 命令行模式(fs + fetch)
 * 浏览器模式 <script src="pwa.test.js"></script> → window.__PWA_TEST
 * 版本: v0.1.0 (r31202) · 2026-10-16
 */
(function (root) {
  'use strict';

  var fs = (typeof require !== 'undefined') ? require('fs') : null;
  var hasFs = !!fs;
  var DIR = __dirname || '.';
  var results = [];
  var passed = 0;
  var failed = 0;

  function readFile(name) {
    if (!hasFs) return null;
    try { return fs.readFileSync(DIR + '/' + name, 'utf8'); }
    catch (e) { return null; }
  }

  function test(name, fn) {
    return Promise.resolve()
      .then(fn)
      .then(function () {
        results.push({ name: name, ok: true });
        passed++;
        if (root.console) root.console.log('  ✓ ' + name);
      })
      .catch(function (e) {
        results.push({ name: name, ok: false, err: e && e.message || String(e) });
        failed++;
        if (root.console) root.console.log('  ✗ ' + name + '  [' + (e && e.message || e) + ']');
      });
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
  }

  function parseManifest(src) {
    if (!src) throw new Error('manifest.json not readable');
    return JSON.parse(src);
  }

  var T = [];

  T.push(test('T1 manifest 字段校验 (含 192/512)', function () {
    var m = parseManifest(readFile('manifest.json'));
    assert(m.name, 'manifest.name missing');
    assert(m.short_name, 'manifest.short_name missing');
    assert(m.start_url, 'manifest.start_url missing');
    assert(m.scope, 'manifest.scope missing');
    assert(m.display === 'standalone', 'display !== standalone');
    assert(m.theme_color === '#6366f1', 'theme_color != #6366f1');
    assert(m.background_color, 'background_color missing');
    assert(Array.isArray(m.icons) && m.icons.length >= 3, 'icons < 3');
    var has192 = m.icons.some(function (i) { return /192x192/.test(i.sizes || ''); });
    var has512 = m.icons.some(function (i) { return /512x512/.test(i.sizes || ''); });
    var hasMaskable = m.icons.some(function (i) { return /maskable/.test(i.purpose || ''); });
    assert(has192 && has512 && hasMaskable, 'icons 缺 192/512/maskable');
    assert(Array.isArray(m.shortcuts) && m.shortcuts.length >= 1, 'shortcuts empty');
  }));

  T.push(test('T2 service worker 含 fetch + install + activate handler', function () {
    var src = readFile('service-worker.js');
    assert(src, 'service-worker.js not readable');
    assert(/addEventListener\(['"]fetch['"]/.test(src), 'no fetch handler');
    assert(/addEventListener\(['"]install['"]/.test(src), 'no install handler');
    assert(/addEventListener\(['"]activate['"]/.test(src), 'no activate handler');
    assert(/skipWaiting/.test(src), 'no skipWaiting');
    assert(/clients\.claim/.test(src), 'no clients.claim');
    assert(/sync-project/.test(src), 'no sync-project tag (BackgroundSync)');
    assert(/offline\.html/.test(src), 'no offline.html fallback');
    assert(/SHELL_LIMIT|TOTAL_LIMIT/.test(src), 'no LRU quota config');
  }));

  T.push(test('T3 idb-store.js 表结构 + 7 个方法', function () {
    var src = readFile('idb-store.js');
    assert(src, 'idb-store.js not readable');
    assert(/createObjectStore/.test(src), 'no createObjectStore');
    assert(/projects/.test(src), 'no projects store name');
    assert(/createIndex/.test(src), 'no indexes');
    assert(/function (open|put|get|list|delete|exportAll|importAll)\b/.test(src.replace(/\s+/g, ' ')),
      'missing core methods (open/put/get/list/delete/exportAll/importAll)');
    assert(/ydb\s*=/.test(src) || /root\.ydb\s*=/.test(src), 'ydb export missing');
    assert(/QuotaExceededError|userMessage/.test(src), 'no quota handling');
    assert(/debounce|DEBOUNCE/.test(src), 'no debounce for mirror');
  }));

  T.push(test('T4 offline.html 必备元素 (retry / pending / lastSync)', function () {
    var html = readFile('offline.html');
    assert(html, 'offline.html not readable');
    assert(/id="retry"/.test(html), '无 retry 按钮 id');
    assert(/id="pending"/.test(html), '无 pending 元素');
    assert(/id="lastSync"/.test(html), '无 lastSync 元素');
    assert(/离线/.test(html) || /offline/i.test(html), '无离线文案');
    assert(/localStorage/.test(html), '未读取 lastSync 时间戳');
    assert(/meta name="theme-color"/.test(html) || /theme-color/.test(html), '未设置主题色');
  }));

  T.push(test('T5 register-sw.js 注册与 __pwa 暴露', function () {
    var src = readFile('register-sw.js');
    assert(src, 'register-sw.js not readable');
    assert(/window\.__pwa/.test(src) || /root\.__pwa/.test(src), '未暴露 window.__pwa');
    assert(/navigator\.serviceWorker/.test(src) && /register/.test(src), '无 serviceWorker.register');
    assert(/feature/.test(src) && /indexedDB/.test(src), '无 feature detection');
    assert(/catch/.test(src), '无失败容忍');
    assert(/loadYdb|idb-store\.js/.test(src), '未加载 ydb');
  }));

  T.push(test('T6 文件行数约束 (js < 300 行)', function () {
    var files = ['service-worker.js', 'idb-store.js', 'register-sw.js', 'pwa.test.js'];
    var over = [];
    files.forEach(function (f) {
      var s = readFile(f);
      if (!s) return;
      var n = s.split('\n').length;
      if (n > 300) over.push(f + '=' + n);
    });
    assert(over.length === 0, 'over 300 lines: ' + over.join(', '));
  }));

  T.push(test('T7 manifest start_url 与 scope 一致 (GitHub Pages PWA)', function () {
    var m = parseManifest(readFile('manifest.json'));
    assert(m.scope && m.start_url, 'scope/start_url empty');
    if (m.scope.indexOf('/') === 0 && m.start_url.indexOf('/') === 0) {
      assert(m.start_url.indexOf(m.scope) === 0, 'start_url not under scope');
    }
    assert(/app\.html/.test(m.start_url) || /\.html$/.test(m.shortcuts[0].url || ''),
      'start_url 应指向 app.html');
  }));

  function runAll() {
    return Promise.all(T).then(function () {
      var summary = 'PWA 自检 r31202 · ' + (passed + failed) + ' 项 · PASSED=' + passed + ' FAILED=' + failed;
      if (root.console) root.console.log('\n' + summary);
      return { passed: passed, failed: failed, results: results };
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runAll: runAll, results: results };
    if (hasFs && require.main === module) {
      runAll().then(function (r) { process.exit(r.failed > 0 ? 1 : 0); });
    }
  }

  if (root !== null && typeof root.addEventListener !== 'undefined') {
    root.__PWA_TEST__ = { runAll: runAll, results: results };
  }
})((typeof window !== 'undefined') ? window : (typeof global !== 'undefined') ? global : null);
