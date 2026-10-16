/* register-sw.js — PWA 注册与降级
 * 检测: feature detect Service Worker / IndexedDB / Background Sync
 * 暴露: window.__pwa = { online, sw, ydb, ready }
 * 失败容忍: try/catch + console.warn + 不阻塞主流程
 * 版本: v0.1.0 (r31202) · 2026-10-16
 */
(function (root) {
  'use strict';

  var cfg = (root.__PWA_CONFIG__ || {});
  var SW_URL = cfg.swUrl || './service-worker.js';
  var IDB_SCRIPT = cfg.idbScript || './idb-store.js';

  var feature = {
    serviceWorker: 'serviceWorker' in navigator,
    indexedDB: 'indexedDB' in (root.indexedDB ? root : {}),
    backgroundSync: 'serviceWorker' in navigator && 'SyncManager' in root,
    storageManager: !!(navigator.storage && navigator.storage.estimate),
    promise: typeof Promise !== 'undefined'
  };

  function loadYdb() {
    return new Promise(function (resolve, reject) {
      if (root.ydb && root.ydb.open) return resolve(root.ydb);
      var s = document.createElement('script');
      s.src = IDB_SCRIPT;
      s.defer = true;
      s.onload = function () {
        if (root.ydb && root.ydb.open) resolve(root.ydb);
        else reject(new Error('idb-store.js loaded but window.ydb missing'));
      };
      s.onerror = function () { reject(new Error('idb-store.js failed to load')); };
      document.head.appendChild(s);
    });
  }

  function registerSW() {
    if (!feature.serviceWorker) {
      return Promise.resolve({ ok: false, reason: 'ServiceWorker not supported' });
    }
    try {
      return navigator.serviceWorker
        .register(SW_URL, { scope: './', updateViaCache: 'none' })
        .then(function (reg) {
          if (reg.waiting && root.__PWA_FORCE_ACTIVATE__) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          return { ok: true, reg: reg, scope: reg.scope };
        })
        .catch(function (err) {
          return { ok: false, reason: err && err.message ? err.message : String(err) };
        });
    } catch (e) {
      return Promise.resolve({ ok: false, reason: e && e.message ? e.message : String(e) });
    }
  }

  function bindOnline(ys) {
    var online = root.navigator.onLine !== false;
    ys.online = online;
    root.addEventListener('online', function () {
      ys.online = true;
      var c = root.__pwa && root.__pwa.sw && root.__pwa.sw.reg;
      if (c && navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(function (reg) {
          if (reg.sync && reg.sync.register) {
            reg.sync.register('sync-project').catch(function () {});
          }
        });
      }
    });
    root.addEventListener('offline', function () { ys.online = false; });
  }

  function bindLifecycle(swResult, ys) {
    if (!navigator.serviceWorker) return;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      ys.sw.controller = navigator.serviceWorker.controller || null;
    });
    navigator.serviceWorker.addEventListener('message', function (e) {
      var m = e.data || {};
      if (m.type === 'sync-project-start') ys.sw.pendingSync = true;
      if (m.type === 'sync-project-done') ys.sw.pendingSync = false;
    });
    ys.sw.controller = navigator.serviceWorker.controller || null;
  }

  var pwa = {
    feature: feature,
    online: false,
    sw: { registered: false, controller: null, reg: null, pendingSync: false },
    ydb: null,
    ready: null
  };
  root.__pwa = pwa;

  bindOnline(pwa);

  pwa.ready = Promise.resolve()
    .then(function () { return loadYdb(); })
    .then(function (ydb) { pwa.ydb = ydb; return ydb; })
    .catch(function (err) {
      pwa.ydb = null;
      try { root.console.warn('[pwa] ydb unavailable:', err && err.message); } catch (e) {}
      return null;
    })
    .then(function () { return registerSW(); })
    .then(function (res) {
      pwa.sw.registered = !!res.ok;
      pwa.sw.reg = res.reg || null;
      if (res.ok) {
        bindLifecycle(res, pwa);
        try { root.console.info('[pwa] service worker registered:', res.scope); } catch (e) {}
      } else {
        try { root.console.warn('[pwa] SW register skipped:', res.reason); } catch (e) {}
      }
      return pwa;
    })
    .catch(function (e) {
      try { root.console.warn('[pwa] init failed:', e); } catch (e2) {}
      return pwa;
    });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { registerSW: registerSW, loadYdb: loadYdb, feature: feature };
  }
})(typeof window !== 'undefined' ? window : this);
