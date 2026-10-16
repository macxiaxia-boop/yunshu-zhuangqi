// calendar-store.js — 偏好持久化
// localStorage key: ys-almanac-display-v1 (与 REF 3.1.0 schema-extraction §8 对齐)
// 字段: { showLunar, showHoliday, showYiJi, showJieqi }
// 默认: showLunar=true, showHoliday=true, showYiJi=false, showJieqi=true

'use strict';

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.YSCalendarStore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  var LS_KEY = 'ys-almanac-display-v1';

  var DEFAULT_PREF = {
    showLunar: true,
    showHoliday: true,
    showYiJi: false,
    showJieqi: true,
  };

  var ALLOWED_KEYS = ['showLunar', 'showHoliday', 'showYiJi', 'showJieqi'];

  // 严格 boolean 校验，禁 any 灌入
  function toBool(v) {
    if (v === true || v === false) return v;
    if (v === 1 || v === '1' || v === 'true') return true;
    if (v === 0 || v === '0' || v === 'false') return false;
    return null;
  }

  function safeRead() {
    try {
      if (typeof localStorage === 'undefined') return null;
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      // 类型守卫 — 防御原型链污染
      if (obj.__proto__ !== Object.prototype && Object.getPrototypeOf(obj) !== null) {
        return null;
      }
      return obj;
    } catch (e) {
      return null;
    }
  }

  function safeWrite(obj) {
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * getPref() — 返回当前偏好，失败/缺失回落默认
   * @returns {{showLunar:bool,showHoliday:bool,showYiJi:bool,showJieqi:bool}}
   */
  function getPref() {
    var stored = safeRead();
    var merged = {};
    for (var i = 0; i < ALLOWED_KEYS.length; i++) {
      var k = ALLOWED_KEYS[i];
      merged[k] = DEFAULT_PREF[k];
      if (stored && Object.prototype.hasOwnProperty.call(stored, k)) {
        var v = toBool(stored[k]);
        if (v !== null) merged[k] = v;
      }
    }
    return merged;
  }

  /**
   * setPref(key, value) — 单 key 更新
   * @param {string} key
   * @param {boolean} value
   * @returns {object} 更新后的完整 pref
   */
  function setPref(key, value) {
    if (ALLOWED_KEYS.indexOf(key) < 0) {
      throw new Error('[YSCalendarStore] 不允许的 key: ' + key);
    }
    var v = toBool(value);
    if (v === null) {
      throw new Error('[YSCalendarStore] value 必须可转 boolean: ' + value);
    }
    var cur = getPref();
    cur[key] = v;
    safeWrite(cur);
    return cur;
  }

  /**
   * reset() — 恢复默认 + 持久化覆盖
   */
  function reset() {
    var def = {};
    for (var i = 0; i < ALLOWED_KEYS.length; i++) {
      def[ALLOWED_KEYS[i]] = DEFAULT_PREF[ALLOWED_KEYS[i]];
    }
    safeWrite(def);
    return def;
  }

  /**
   * setAll(patch) — 批量更新 (白名单内 key 生效)
   */
  function setAll(patch) {
    if (!patch || typeof patch !== 'object') return getPref();
    var cur = getPref();
    var keys = Object.keys(patch);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (ALLOWED_KEYS.indexOf(k) < 0) continue;
      var v = toBool(patch[k]);
      if (v !== null) cur[k] = v;
    }
    safeWrite(cur);
    return cur;
  }

  return {
    getPref: getPref,
    setPref: setPref,
    setAll: setAll,
    reset: reset,
    DEFAULT_PREF: DEFAULT_PREF,
    LS_KEY: LS_KEY,
    ALLOWED_KEYS: ALLOWED_KEYS,
    // 测试 / SSR 用注入点
    _setStorage: function (fakeStorage) {
      // 仅测试用:支持 fake localStorage
      if (fakeStorage && typeof fakeStorage.getItem === 'function') {
        // eslint-disable-next-line no-global-assign
        localStorage = fakeStorage;
      }
    },
  };
});
