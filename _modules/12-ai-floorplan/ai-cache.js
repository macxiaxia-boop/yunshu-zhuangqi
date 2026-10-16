/* ai-cache.js — Cache floorplan recognition results
 * R31202 · Module 12 · 🅱️ yunshu-zhuangqi
 * Cache key = SHA-256(base64 image). Value = AI JSON result + meta.
 * 24h TTL in localStorage.
 */
(function (root) {
  'use strict';

  var LS_KEY = 'ysai.cache.v1';
  var TTL_MS = 24 * 60 * 60 * 1000;       // 24 hours
  var MAX_ENTRIES = 200;                  // LRU-ish cap

  // ---- SHA-256 (Web Crypto) with fallback ----
  function sha256Hex(str) {
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
      var enc = new TextEncoder().encode(str);
      return crypto.subtle.digest('SHA-256', enc).then(function (buf) {
        var bytes = new Uint8Array(buf);
        var hex = '';
        for (var i = 0; i < bytes.length; i++) {
          hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
        }
        return hex;
      });
    }
    // Fallback (slow, JS-only hash, not crypto-secure)
    return new Promise(function (resolve) {
      var h1 = 0xdeadbeef ^ 0;
      var h2 = 0x41c6ce57 ^ 0;
      for (var i = 0; i < str.length; i++) {
        var ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
      var hash = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
      resolve(hash);
    });
  }

  function _extractBase64(dataUrl) {
    if (!dataUrl) return '';
    var m = /^data:[^;]+;base64,(.+)$/.exec(dataUrl);
    return m ? m[1] : String(dataUrl);
  }

  function hashImage(dataUrl) {
    return sha256Hex(_extractBase64(dataUrl));
  }

  // ---- Storage helpers ----
  function _readAll() {
    try {
      var raw = root.localStorage ? root.localStorage.getItem(LS_KEY) : null;
      if (!raw) return {};
      var obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) { return {}; }
  }

  function _writeAll(obj) {
    try {
      if (root.localStorage) root.localStorage.setItem(LS_KEY, JSON.stringify(obj));
    } catch (e) { /* quota or disabled */ }
  }

  function _evictExpired(store) {
    var now = Date.now();
    var keys = Object.keys(store);
    for (var i = 0; i < keys.length; i++) {
      var entry = store[keys[i]];
      if (!entry || (entry.ts && (now - entry.ts) > TTL_MS)) {
        delete store[keys[i]];
      }
    }
    // Cap to MAX_ENTRIES: remove oldest
    keys = Object.keys(store);
    if (keys.length > MAX_ENTRIES) {
      keys.sort(function (a, b) { return (store[a].ts || 0) - (store[b].ts || 0); });
      var toRemove = keys.length - MAX_ENTRIES;
      for (var j = 0; j < toRemove; j++) delete store[keys[j]];
    }
  }

  // ---- Public API ----
  function get(hash) {
    var store = _readAll();
    var entry = store[hash];
    if (!entry) return null;
    var age = Date.now() - (entry.ts || 0);
    if (age > TTL_MS) {
      delete store[hash];
      _writeAll(store);
      return null;
    }
    return { hit: true, ageMs: age, entry: entry };
  }

  function put(hash, data, meta) {
    if (!hash) return { ok: false, reason: 'NO_HASH' };
    var store = _readAll();
    store[hash] = {
      ts: Date.now(),
      data: data,
      meta: meta || {}
    };
    _evictExpired(store);
    _writeAll(store);
    return { ok: true, hash: hash };
  }

  function lookupByImage(dataUrl) {
    return hashImage(dataUrl).then(function (h) {
      var r = get(h);
      if (!r) return { hit: false, hash: h };
      return { hit: true, hash: h, ageMs: r.ageMs, entry: r.entry };
    });
  }

  function storeByImage(dataUrl, data, meta) {
    return hashImage(dataUrl).then(function (h) {
      put(h, data, meta);
      return { ok: true, hash: h };
    });
  }

  function clear() {
    try {
      if (root.localStorage) root.localStorage.removeItem(LS_KEY);
    } catch (e) { /* noop */ }
    return { ok: true, cleared: true };
  }

  function stats() {
    var store = _readAll();
    var keys = Object.keys(store);
    var totalAge = 0;
    for (var i = 0; i < keys.length; i++) {
      totalAge += Date.now() - (store[keys[i]].ts || 0);
    }
    return {
      count: keys.length,
      maxEntries: MAX_ENTRIES,
      ttlMs: TTL_MS,
      avgAgeMs: keys.length ? Math.round(totalAge / keys.length) : 0
    };
  }

  root.YSAICache = {
    hashImage: hashImage,
    sha256Hex: sha256Hex,
    get: get,
    put: put,
    lookupByImage: lookupByImage,
    storeByImage: storeByImage,
    clear: clear,
    stats: stats,
    TTL_MS: TTL_MS,
    MAX_ENTRIES: MAX_ENTRIES
  };

})(typeof window !== 'undefined' ? window : this);