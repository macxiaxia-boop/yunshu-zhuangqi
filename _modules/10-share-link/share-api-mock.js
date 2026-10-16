/* share-api-mock.js — IndexedDB mock backend for share-link
 * R31202 · Module 10 · 🅱️ yunshu-zhuangqi
 * In production: replace with Cloudflare Worker + KV (see share-deploy-cloudflare.md)
 *
 * DB layer is injectable via window.__shareDB = { openDB, getAll, getById, put, del, tx, reqP }.
 * Browser defaults to real IndexedDB; test env can override before loading.
 */
(function (root) {
  'use strict';

  var DB_NAME = 'yunshu_share_db';
  var DB_VERSION = 1;
  var STORE_SHARES = 'sharedProjects';
  var STORE_RATES = 'rateLimits';
  var STORE_VIEWS = 'viewCounts';

  // ---- Phone masking: 138****5678 ----
  function maskPhone(phone) {
    if (!phone || phone.length < 7) return '';
    return phone.slice(0, 3) + '****' + phone.slice(-4);
  }

  // ---- ID generation: 12-char base32 (Crockford, no I/L/O/U) ----
  var BASE32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function generateShareId() {
    var bytes = new Uint8Array(8);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    var out = '';
    var view = new DataView(bytes.buffer);
    var num = 0;
    for (var k = 0; k < 6; k++) num = num * 256 + bytes[k];
    for (var j = 11; j >= 0; j--) {
      out = BASE32_ALPHABET[num % 32] + out;
      num = Math.floor(num / 32);
    }
    return out;
  }

  // ---- DB layer (injectable) ----
  // Browser: use real IndexedDB. Tests: provide __shareDB on window before loading.
  function defaultBrowserDB() {
    function openDB() {
      return new Promise(function (resolve, reject) {
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_SHARES)) db.createObjectStore(STORE_SHARES, { keyPath: 'shareId' });
          if (!db.objectStoreNames.contains(STORE_RATES)) db.createObjectStore(STORE_RATES, { keyPath: 'phone' });
          if (!db.objectStoreNames.contains(STORE_VIEWS)) db.createObjectStore(STORE_VIEWS, { keyPath: 'shareId' });
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    function tx(db, stores, mode) { return db.transaction(stores, mode); }
    function reqP(req) {
      return new Promise(function (resolve, reject) {
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    function getAll(db, store) { return reqP(tx(db, [store], 'readonly').objectStore(store).getAll()); }
    function getById(db, store, key) { return reqP(tx(db, [store], 'readonly').objectStore(store).get(key)); }
    function put(db, store, value) { return reqP(tx(db, [store], 'readwrite').objectStore(store).put(value)); }
    function del(db, store, key) { return reqP(tx(db, [store], 'readwrite').objectStore(store).delete(key)); }
    return { openDB: openDB, getAll: getAll, getById: getById, put: put, del: del, tx: tx, reqP: reqP };
  }

  var __sharedDB = (root.__shareDB && root.__shareDB.openDB) ? root.__shareDB : defaultBrowserDB();

  // ---- Rate limit ----
  var RATE_MAX = 5;
  var RATE_WINDOW_MS = 60 * 60 * 1000;
  async function checkRateLimit(phone) {
    if (!phone) return false;
    var db = await __sharedDB.openDB();
    var rec = await __sharedDB.getById(db, STORE_RATES, phone);
    var now = Date.now();
    if (!rec) {
      await __sharedDB.put(db, STORE_RATES, { phone: phone, buckets: [{ count: 1, windowStart: now }] });
      return true;
    }
    var buckets = rec.buckets.filter(function (b) { return now - b.windowStart < RATE_WINDOW_MS; });
    var total = buckets.reduce(function (s, b) { return s + b.count; }, 0);
    if (total >= RATE_MAX) throw new Error('RATE_LIMIT_EXCEEDED');
    buckets.push({ count: 1, windowStart: now });
    await __sharedDB.put(db, STORE_RATES, { phone: phone, buckets: buckets });
    return true;
  }

  // ---- GC ----
  async function gc(db) {
    var now = Date.now();
    var all = await __sharedDB.getAll(db, STORE_SHARES);
    var removed = 0;
    for (var i = 0; i < all.length; i++) {
      if (all[i].expiresAt && all[i].expiresAt < now) {
        await __sharedDB.del(db, STORE_SHARES, all[i].expiresAt ? all[i].shareId : all[i].shareId);
        removed++;
      }
    }
    return removed;
  }

  // ---- Security helpers ----
  function hashPhone(phone) {
    if (!phone) return '';
    var h = 0;
    for (var i = 0; i < phone.length; i++) h = ((h << 5) - h + phone.charCodeAt(i)) | 0;
    return ('h' + (h >>> 0).toString(16)).slice(0, 10);
  }

  function sanitize(data) {
    if (!data) return {};
    return {
      projectInfo: {
        companyName: String(data.projectInfo?.companyName || ''),
        logoData: String(data.projectInfo?.logoData || ''),
        themeColor: String(data.projectInfo?.themeColor || '#C04851'),
        projectName: String(data.projectInfo?.projectName || ''),
        projectAddress: String(data.projectInfo?.projectAddress || ''),
        customerName: String(data.projectInfo?.customerName || ''),
        customerPhoneMasked: data.projectInfo?.customerPhone ? maskPhone(String(data.projectInfo.customerPhone)) : '',
        createDate: data.projectInfo?.createDate || new Date().toISOString().slice(0, 10)
      },
      categories: Array.isArray(data.categories) ? data.categories.map(function (c) {
        return {
          name: String(c.name || ''),
          items: Array.isArray(c.items) ? c.items.map(function (it) {
            return {
              name: String(it.name || ''),
              unit: String(it.unit || ''),
              qty: Number(it.qty || 0),
              price: Number(it.price || 0),
              note: String(it.note || '')
            };
          }) : []
        };
      }) : [],
      totals: data.totals ? {
        subTotal: Number(data.totals.subTotal || 0),
        grandTotal: Number(data.totals.grandTotal || 0)
      } : { subTotal: 0, grandTotal: 0 }
    };
  }

  // ============ Public API ============
  async function create(payload) {
    if (!payload) throw new Error('PAYLOAD_REQUIRED');
    if (!payload.projectData) throw new Error('PROJECT_DATA_REQUIRED');
    var expiresIn = payload.expiresIn || 7 * 24 * 60 * 60 * 1000;
    var shareId = generateShareId();
    var db = await __sharedDB.openDB();
    while (await __sharedDB.getById(db, STORE_SHARES, shareId)) {
      shareId = generateShareId();
    }

    var now = Date.now();
    var record = {
      shareId: shareId,
      data: sanitize(payload.projectData),
      estimateAmount: Number(payload.estimateAmount || 0),
      accessType: payload.accessType === 'password-read' ? 'password-read' : 'public-read',
      customerFields: {
        name: String(payload.customerFields?.name || ''),
        phone: payload.customerFields?.phone ? maskPhone(String(payload.customerFields.phone)) : '',
        note: String(payload.customerFields?.note || '')
      },
      customerPhoneHash: hashPhone(payload.customerFields?.phone),
      expiresAt: now + expiresIn,
      createdAt: now,
      actions: []
    };
    await __sharedDB.put(db, STORE_SHARES, record);

    var baseUrl = (typeof window !== 'undefined' && window.location) ? window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/') : 'https://yunshu-zhuangqi.com/share-view.html';
    var shareUrl = baseUrl + '?shareId=' + shareId;

    return {
      shareId: shareId,
      shareUrl: shareUrl,
      expiresAt: record.expiresAt,
      qrDataUrl: ''
    };
  }

  async function get(shareId) {
    if (!shareId) throw new Error('SHARE_ID_REQUIRED');
    var db = await __sharedDB.openDB();
    var rec = await __sharedDB.getById(db, STORE_SHARES, shareId);
    if (!rec) throw new Error('NOT_FOUND');
    if (rec.expiresAt && rec.expiresAt < Date.now()) {
      await __sharedDB.del(db, STORE_SHARES, shareId);
      throw new Error('EXPIRED');
    }
    var vc = await __sharedDB.getById(db, STORE_VIEWS, shareId);
    await __sharedDB.put(db, STORE_VIEWS, { shareId: shareId, count: (vc ? vc.count : 0) + 1, lastView: Date.now() });
    return {
      shareId: rec.shareId,
      data: rec.data,
      estimateAmount: rec.estimateAmount,
      accessType: rec.accessType,
      customerFields: rec.customerFields,
      expiresAt: rec.expiresAt,
      createdAt: rec.createdAt,
      actions: Array.isArray(rec.actions) ? rec.actions : []
    };
  }

  async function addAction(shareId, action) {
    if (!shareId) throw new Error('SHARE_ID_REQUIRED');
    if (!action || !action.type) throw new Error('ACTION_REQUIRED');
    var db = await __sharedDB.openDB();
    var rec = await __sharedDB.getById(db, STORE_SHARES, shareId);
    if (!rec) throw new Error('NOT_FOUND');
    if (rec.expiresAt && rec.expiresAt < Date.now()) throw new Error('EXPIRED');
    var t = action.type;
    if (t !== 'confirm' && t !== 'reject' && t !== 'comment') throw new Error('INVALID_ACTION_TYPE');
    var phone = action.phone ? String(action.phone) : '';
    if (phone && phone.length >= 7) {
      await checkRateLimit(phone);
    }
    if (rec.customerPhoneHash && phone && hashPhone(phone) !== rec.customerPhoneHash) {
      throw new Error('UNAUTHORIZED_CUSTOMER');
    }
    if (t === 'reject' && !action.reason) throw new Error('REASON_REQUIRED');
    var entry = {
      type: t,
      customerName: String(action.customerName || action.name || ''),
      customerPhoneMasked: phone ? maskPhone(phone) : '',
      text: action.text ? String(action.text).slice(0, 500) : '',
      reason: action.reason ? String(action.reason).slice(0, 500) : '',
      timestamp: Date.now()
    };
    rec.actions = rec.actions || [];
    rec.actions.push(entry);
    await __sharedDB.put(db, STORE_SHARES, rec);
    return { ok: true, action: entry, total: rec.actions.length };
  }

  async function list(secret) {
    if (!secret) throw new Error('SECRET_REQUIRED');
    var db = await __sharedDB.openDB();
    var all = await __sharedDB.getAll(db, STORE_SHARES);
    var views = {};
    var allViews = await __sharedDB.getAll(db, STORE_VIEWS);
    allViews.forEach(function (v) { views[v.shareId] = v.count; });
    return all
      .filter(function (s) { return s.createdAt; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; })
      .map(function (s) {
        return {
          shareId: s.shareId,
          customer: s.customerFields?.name || '',
          estimateAmount: s.estimateAmount,
          status: (s.expiresAt < Date.now()) ? 'expired' : 'active',
          views: views[s.shareId] || 0,
          actionsCount: (s.actions || []).length,
          createdAt: s.createdAt,
          expiresAt: s.expiresAt,
          actions: (s.actions || []).slice(-5)
        };
      });
  }

  async function remove(shareId, secret) {
    if (!secret) throw new Error('SECRET_REQUIRED');
    var db = await __sharedDB.openDB();
    await __sharedDB.del(db, STORE_SHARES, shareId);
    await __sharedDB.del(db, STORE_VIEWS, shareId);
    return { ok: true };
  }

  async function runGC() {
    var db = await __sharedDB.openDB();
    return gc(db);
  }

  async function listActionsByPhone(phone) {
    var h = hashPhone(phone);
    var db = await __sharedDB.openDB();
    var all = await __sharedDB.getAll(db, STORE_SHARES);
    return all
      .filter(function (s) { return s.customerPhoneHash === h; })
      .map(function (s) {
        return { shareId: s.shareId, actions: s.actions || [] };
      });
  }

  root.YSShareAPI = {
    create: create,
    get: get,
    addAction: addAction,
    list: list,
    remove: remove,
    runGC: runGC,
    maskPhone: maskPhone,
    hashPhone: hashPhone,
    generateShareId: generateShareId,
    listActionsByPhone: listActionsByPhone,
    _TEST_HOOKS: { __sharedDB: function () { return __sharedDB; } }
  };

})(typeof window !== 'undefined' ? window : this);
