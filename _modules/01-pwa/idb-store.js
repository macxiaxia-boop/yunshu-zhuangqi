/* idb-store.js — yunshu-zhuangqi IndexedDB 项目存储层
 * 风格: ydb = promise API (open/put/get/list/delete/exportAll/importAll)
 * 表: projects(id, name, data JSON, updatedAt)
 * 镜像: localStorage.setItem 时 debounce 200ms 后同步写 ydb
 * 版本: v0.1.0 (r31202) · 2026-10-16
 */
(function (root) {
  'use strict';

  var DB_NAME = 'yunshu-zhuangqi';
  var DB_VERSION = 1;
  var STORE = 'projects';
  var KEY = 'id';
  var LS_DEBOUNCE_MS = 200;
  var LS_NAMESPACE = 'ys.project.';

  var _db = null;
  var _mirrorTimer = null;
  var _mirrorQueue = {};
  var _lsWarned = false;

  function req2promise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () {
        var err = req.error || new Error('IDB error');
        if (err.name === 'QuotaExceededError' || err.code === 22) {
          err.userMessage = '本地存储配额已满,请清理后重试';
        }
        reject(err);
      };
req.onblocked = function () { reject(new Error('IDB blocked by other tab')); };
    });
  }

  function open() {
    if (_db && _db.objectStoreNames && _db.objectStoreNames.contains(STORE)) {
      return Promise.resolve(_db);
    }
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) return reject(new Error('IndexedDB not supported'));
      var req = root.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: KEY });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
          store.createIndex('name', 'name', { unique: false });
        }
      };
      req.onsuccess = function () { _db = req.result; resolve(_db); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(mode) {
    return open().then(function (db) {
      return db.transaction(STORE, mode).objectStore(STORE);
    });
  }

  function _now() { return Date.now(); }
  function _mkId(p) {
    if (p && p.id) return String(p.id);
    return 'p_' + _now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function put(project) {
    if (!project || typeof project !== 'object') {
      return Promise.reject(new Error('invalid project'));
    }
    var data = project.data !== undefined ? project.data : project;
    var rec = {
      id: _mkId(project),
      name: project.name || (data && data.name) || '未命名项目',
      data: data,
      updatedAt: project.updatedAt || _now()
    };
    return tx('readwrite').then(function (store) {
      return req2promise(store.put(rec)).then(function () { return rec; });
    });
  }

  function get(id) {
    return tx('readonly').then(function (store) {
      return req2promise(store.get(String(id)));
    });
  }

  function list() {
    return tx('readonly').then(function (store) {
      return req2promise(store.getAll()).then(function (all) {
        all.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
        return all;
      });
    });
  }

  function remove(id) {
    return tx('readwrite').then(function (store) {
      return req2promise(store.delete(String(id)));
    });
  }

  function clear() {
    return tx('readwrite').then(function (store) {
      return req2promise(store.clear());
    });
  }

  function count() {
    return tx('readonly').then(function (store) {
      return req2promise(store.count());
    });
  }

  function estimate() {
    if (navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().then(function (e) {
        return { quota: e.quota || 0, usage: e.usage || 0, ratio: (e.quota ? e.usage / e.quota : 0) };
      }).catch(function () { return { quota: 0, usage: 0, ratio: 0 }; });
    }
    return Promise.resolve({ quota: 0, usage: 0, ratio: 0, note: 'StorageManager not supported' });
  }

  function exportAll() {
    return list().then(function (all) {
      return JSON.stringify({
        version: DB_VERSION,
        exportedAt: _now(),
        projects: all
      });
    });
  }

  function importAll(json, opts) {
    var mode = (opts && opts.mode) || 'merge';
    var payload;
    try { payload = typeof json === 'string' ? JSON.parse(json) : json; }
    catch (e) { return Promise.reject(new Error('invalid JSON')); }
    var items = (payload && payload.projects) || [];
    return Promise.resolve()
      .then(function () {
        if (mode === 'replace') return clear();
      })
      .then(function () {
        return items.reduce(function (p, it) {
          return p.then(function () { return put(it); });
        }, Promise.resolve());
      })
      .then(function (n) { return { imported: n || items.length }; });
  }

  function _scheduleMirror(key, value) {
    _mirrorQueue[key] = value;
    if (_mirrorTimer) return;
    _mirrorTimer = setTimeout(function () {
      var snap = _mirrorQueue;
      _mirrorQueue = {};
      _mirrorTimer = null;
      var ids = Object.keys(snap);
      Promise.resolve().then(function () {
        return Promise.all(ids.map(function (k) {
          return put({ id: k, name: snap[k].name, data: snap[k].data }).catch(function (err) {
            if (!_lsWarned && err && /quota|localStorage/i.test(String(err.message))) {
              _lsWarned = true;
              if (root.console) root.console.warn('[ydb] quota warning:', err.message);
            }
          });
        }));
      });
    }, LS_DEBOUNCE_MS);
  }

  function mirror(key, value) {
    try {
      if (value === null || value === undefined) {
        root.localStorage.removeItem(LS_NAMESPACE + key);
        remove(key).catch(function () {});
        return;
      }
      root.localStorage.setItem(LS_NAMESPACE + key, JSON.stringify(value));
      _scheduleMirror(key, value);
    } catch (e) {
      if (e && e.name === 'QuotaExceededError') return false;
      return false;
    }
    return true;
  }

  var ydb = {
    open: open,
    put: put,
    get: get,
    list: list,
    remove: remove,
    delete: remove,
    clear: clear,
    count: count,
    estimate: estimate,
    exportAll: exportAll,
    importAll: importAll,
    mirror: mirror
  };

  root.ydb = ydb;
  root.ydbMirror = mirror;
  if (typeof module !== 'undefined' && module.exports) module.exports = ydb;
})(typeof window !== 'undefined' ? window : this);
