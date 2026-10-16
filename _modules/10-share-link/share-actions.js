/* share-actions.js — Customer actions: confirm / reject / comment
 * R31202 · Module 10 · 🅱️ yunshu-zhuangqi
 *
 * Wraps YSShareAPI.addAction with UI feedback + rate limit handling.
 * No external deps. Works in browser + test env.
 */
(function (root) {
  'use strict';

  // ========== Phone validation ==========
  function isValidPhone(p) {
    if (!p) return false;
    var s = String(p).replace(/\D/g, '');
    return s.length === 11 && /^1\d{10}$/.test(s);
  }

  function isValidName(n) {
    return n && String(n).trim().length >= 1 && String(n).trim().length <= 50;
  }

  // ========== localStorage-based rate limit mirror (independent of IndexedDB) ==========
  var RATE_KEY_PREFIX = 'ys_share_rate_';
  var RATE_MAX = 5;
  var RATE_WINDOW_MS = 60 * 60 * 1000;

  function getLocalRateCount(phone) {
    if (typeof localStorage === 'undefined') return 0;
    var raw = localStorage.getItem(RATE_KEY_PREFIX + phone);
    if (!raw) return 0;
    try {
      var arr = JSON.parse(raw);
      var now = Date.now();
      return arr.filter(function (t) { return now - t < RATE_WINDOW_MS; }).length;
    } catch (e) { return 0; }
  }

  function recordLocalRate(phone) {
    if (typeof localStorage === 'undefined') return;
    var key = RATE_KEY_PREFIX + phone;
    var raw = localStorage.getItem(key);
    var arr = raw ? JSON.parse(raw) : [];
    arr.push(Date.now());
    var now = Date.now();
    arr = arr.filter(function (t) { return now - t < RATE_WINDOW_MS; });
    localStorage.setItem(key, JSON.stringify(arr));
  }

  function canAct(phone) {
    if (!phone) return { ok: false, reason: 'PHONE_REQUIRED' };
    if (!isValidPhone(phone)) return { ok: false, reason: 'INVALID_PHONE' };
    var count = getLocalRateCount(phone);
    if (count >= RATE_MAX) return { ok: false, reason: 'RATE_LIMIT_EXCEEDED', count: count };
    return { ok: true };
  }

  // ========== Validation helpers ==========
  function validateConfirm(args) {
    var errs = [];
    if (!args.shareId) errs.push('SHARE_ID_REQUIRED');
    if (!isValidName(args.customerName)) errs.push('NAME_REQUIRED');
    if (!isValidPhone(args.phone)) errs.push('PHONE_REQUIRED');
    if (errs.length) return { ok: false, errors: errs };
    var can = canAct(args.phone);
    if (!can.ok) return { ok: false, errors: [can.reason] };
    return { ok: true };
  }

  function validateReject(args) {
    var errs = [];
    if (!args.shareId) errs.push('SHARE_ID_REQUIRED');
    if (!isValidName(args.customerName)) errs.push('NAME_REQUIRED');
    if (!isValidPhone(args.phone)) errs.push('PHONE_REQUIRED');
    if (!args.reason || String(args.reason).trim().length < 1) errs.push('REASON_REQUIRED');
    if (String(args.reason || '').length > 500) errs.push('REASON_TOO_LONG');
    if (errs.length) return { ok: false, errors: errs };
    var can = canAct(args.phone);
    if (!can.ok) return { ok: false, errors: [can.reason] };
    return { ok: true };
  }

  function validateComment(args) {
    var errs = [];
    if (!args.shareId) errs.push('SHARE_ID_REQUIRED');
    if (!isValidName(args.customerName)) errs.push('NAME_REQUIRED');
    if (!args.text || String(args.text).trim().length < 1) errs.push('TEXT_REQUIRED');
    if (String(args.text || '').length > 500) errs.push('TEXT_TOO_LONG');
    if (errs.length) return { ok: false, errors: errs };
    if (args.phone) {
      var can = canAct(args.phone);
      if (!can.ok) return { ok: false, errors: [can.reason] };
    }
    return { ok: true };
  }

  // ========== Action dispatchers ==========
  async function _dispatch(args, actionType, validator) {
    if (!root.YSShareAPI) throw new Error('YSShareAPI_NOT_LOADED');
    var v = validator(args);
    if (!v.ok) {
      var err = new Error('VALIDATION_FAILED:' + v.errors.join(','));
      err.code = v.errors[0];
      err.errors = v.errors;
      throw err;
    }
    // Sanitize: mask phone in stored payload; api will also mask
    var payload = {
      type: actionType,
      customerName: String(args.customerName).slice(0, 50),
      phone: String(args.phone || ''),
      text: args.text || '',
      reason: args.reason || ''
    };
    try {
      var result = await root.YSShareAPI.addAction(args.shareId, payload);
      recordLocalRate(payload.phone);
      return { ok: true, action: result.action, total: result.total };
    } catch (e) {
      var msg = String(e.message || e);
      if (msg.indexOf('RATE_LIMIT') >= 0) {
        var err2 = new Error('RATE_LIMIT_EXCEEDED');
        err2.code = 'RATE_LIMIT_EXCEEDED';
        throw err2;
      }
      if (msg.indexOf('UNAUTHORIZED') >= 0) {
        var err3 = new Error('UNAUTHORIZED_CUSTOMER');
        err3.code = 'UNAUTHORIZED_CUSTOMER';
        throw err3;
      }
      throw e;
    }
  }

  function confirm(args) { return _dispatch(args, 'confirm', validateConfirm); }
  function reject(args) { return _dispatch(args, 'reject', validateReject); }
  function comment(args) { return _dispatch(args, 'comment', validateComment); }

  // ========== UI render helpers (DOM helpers for share-view.html) ==========
  function statusLabel(action) {
    if (action.type === 'confirm') return { text: '已确认', cls: 'ok' };
    if (action.type === 'reject') return { text: '已拒绝', cls: 'no' };
    if (action.type === 'comment') return { text: '业主留言', cls: 'msg' };
    return { text: action.type, cls: '' };
  }

  function formatTime(ts) {
    var d = new Date(ts);
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // ========== Public API ==========
  root.YSActions = {
    confirm: confirm,
    reject: reject,
    comment: comment,
    isValidPhone: isValidPhone,
    isValidName: isValidName,
    canAct: canAct,
    getLocalRateCount: getLocalRateCount,
    statusLabel: statusLabel,
    formatTime: formatTime,
    RATE_MAX: RATE_MAX,
    RATE_WINDOW_MS: RATE_WINDOW_MS,
    _TEST_HOOKS: { resetLocalRate: function (phone) {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(RATE_KEY_PREFIX + phone);
    } }
  };

})(typeof window !== 'undefined' ? window : this);
