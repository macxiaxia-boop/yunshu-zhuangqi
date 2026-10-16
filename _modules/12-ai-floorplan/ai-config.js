/* ai-config.js — API key + model config + cost tracking
 * R31202 · Module 12 · 🅱️ yunshu-zhuangqi
 * V3 module: AI floorplan recognition (Claude Vision).
 * Pure native JS. sessionStorage for key (closes when browser closes).
 * No upload of key, no upload of images to anywhere except direct Anthropic API.
 */
(function (root) {
  'use strict';

  // ---- Storage keys ----
  var SS_KEY = 'ysai.apiKey';              // sessionStorage (closes -> cleared)
  var SS_MODEL = 'ysai.model';             // sessionStorage
  var LS_USAGE = 'ysai.usage';             // localStorage (cumulative tokens)
  var LS_USAGE_DAILY = 'ysai.usage.daily'; // localStorage (per-day counters)

  // ---- Model catalog ----
  var MODELS = {
    'claude-3-5-sonnet-20241022': {
      label: 'Sonnet 3.5 (高质量)',
      inputPerMTokUSD: 3.00,
      outputPerMTokUSD: 15.00,
      avgCostPerImageCNY: 0.02,
      maxOutTokens: 8192,
      vision: true
    },
    'claude-3-5-haiku-20241022': {
      label: 'Haiku 3.5 (便宜模式)',
      inputPerMTokUSD: 0.80,
      outputPerMTokUSD: 4.00,
      avgCostPerImageCNY: 0.004,
      maxOutTokens: 8192,
      vision: true
    },
    'claude-3-opus-20240229': {
      label: 'Opus 3 (顶级)',
      inputPerMTokUSD: 15.00,
      outputPerMTokUSD: 75.00,
      avgCostPerImageCNY: 0.10,
      maxOutTokens: 4096,
      vision: true
    }
  };

  var DEFAULT_CONFIG = {
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 2048,
    temperature: 0.2
  };

  // ---- Helpers ----
  function _ssGet(k) {
    try { return root.sessionStorage ? root.sessionStorage.getItem(k) : null; }
    catch (e) { return null; }
  }
  function _ssSet(k, v) {
    try { if (root.sessionStorage) root.sessionStorage.setItem(k, v); }
    catch (e) { /* sessionStorage unavailable */ }
  }
  function _ssRemove(k) {
    try { if (root.sessionStorage) root.sessionStorage.removeItem(k); }
    catch (e) { /* noop */ }
  }
  function _lsGet(k, fallback) {
    try {
      var raw = root.localStorage ? root.localStorage.getItem(k) : null;
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function _lsSet(k, v) {
    try { if (root.localStorage) root.localStorage.setItem(k, JSON.stringify(v)); }
    catch (e) { /* noop */ }
  }
  function _today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ---- API Key ----
  function setApiKey(key) {
    if (!key || typeof key !== 'string') throw new Error('KEY_INVALID');
    var trimmed = String(key).trim();
    if (!trimmed) throw new Error('KEY_EMPTY');
    // Anthropic keys start with sk-ant-
    if (trimmed.length < 10) throw new Error('KEY_TOO_SHORT');
    _ssSet(SS_KEY, trimmed);
    return { ok: true, length: trimmed.length, preview: trimmed.slice(0, 7) + '...' };
  }

  function getApiKey() {
    return _ssGet(SS_KEY);
  }

  function hasKey() {
    var k = _ssGet(SS_KEY);
    return !!(k && k.length >= 10);
  }

  function clearKey() {
    _ssRemove(SS_KEY);
    return { ok: true, cleared: true };
  }

  // ---- Model config ----
  function getConfig() {
    var cfg = Object.assign({}, DEFAULT_CONFIG);
    var stored = _ssGet(SS_MODEL);
    if (stored) {
      try {
        var parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') Object.assign(cfg, parsed);
      } catch (e) { /* bad json, ignore */ }
    }
    return cfg;
  }

  function setModel(modelId) {
    if (!MODELS[modelId]) throw new Error('MODEL_NOT_SUPPORTED');
    var cfg = getConfig();
    cfg.model = modelId;
    cfg.maxTokens = Math.min(cfg.maxTokens || DEFAULT_CONFIG.maxTokens, MODELS[modelId].maxOutTokens);
    _ssSet(SS_MODEL, JSON.stringify(cfg));
    return { ok: true, model: modelId, maxTokens: cfg.maxTokens };
  }

  function listModels() {
    var list = [];
    Object.keys(MODELS).forEach(function (k) {
      list.push({ id: k, label: MODELS[k].label, avgCostCNY: MODELS[k].avgCostPerImageCNY, vision: MODELS[k].vision });
    });
    return list;
  }

  function getModelInfo(modelId) {
    return MODELS[modelId] || null;
  }

  // ---- Cost estimation ----
  function estimateCost(modelId, inputTokens, outputTokens) {
    var m = MODELS[modelId];
    if (!m) return { cny: 0, usd: 0 };
    // USD = (in/1e6 * inputRate) + (out/1e6 * outputRate)
    var usd = (inputTokens / 1000000) * m.inputPerMTokUSD + (outputTokens / 1000000) * m.outputPerMTokUSD;
    // Approximate USD->CNY = 7.2
    var cny = usd * 7.2;
    return { usd: usd, cny: cny };
  }

  function estimateImageCost(modelId) {
    // Rough estimate based on a typical floorplan (1 image + 2k tokens out)
    return estimateCost(modelId, 1500, 2000);
  }

  // ---- Usage tracking ----
  function _getUsage() {
    var u = _lsGet(LS_USAGE, null);
    if (!u || typeof u !== 'object') {
      u = { totalInputTokens: 0, totalOutputTokens: 0, totalImages: 0, totalCalls: 0, totalCNY: 0 };
    }
    return u;
  }

  function recordUsage(modelId, inputTokens, outputTokens) {
    var u = _getUsage();
    u.totalInputTokens += inputTokens || 0;
    u.totalOutputTokens += outputTokens || 0;
    u.totalImages += 1;
    u.totalCalls += 1;
    var c = estimateCost(modelId, inputTokens || 0, outputTokens || 0);
    u.totalCNY += c.cny;
    _lsSet(LS_USAGE, u);

    // Daily bucket
    var daily = _lsGet(LS_USAGE_DAILY, {});
    var t = _today();
    if (!daily[t]) daily[t] = { calls: 0, images: 0, cny: 0, inputTokens: 0, outputTokens: 0 };
    daily[t].calls += 1;
    daily[t].images += 1;
    daily[t].cny += c.cny;
    daily[t].inputTokens += inputTokens || 0;
    daily[t].outputTokens += outputTokens || 0;
    _lsSet(LS_USAGE_DAILY, daily);

    return { ok: true, totalCNY: u.totalCNY, calls: u.totalCalls };
  }

  function getUsage() {
    return _getUsage();
  }

  function getDailyUsage(date) {
    var daily = _lsGet(LS_USAGE_DAILY, {});
    var key = date || _today();
    return daily[key] || { calls: 0, images: 0, cny: 0, inputTokens: 0, outputTokens: 0 };
  }

  function resetUsage() {
    _lsSet(LS_USAGE, { totalInputTokens: 0, totalOutputTokens: 0, totalImages: 0, totalCalls: 0, totalCNY: 0 });
    _lsSet(LS_USAGE_DAILY, {});
    return { ok: true };
  }

  // ---- Public API ----
  root.YSAI = {
    setApiKey: setApiKey,
    getApiKey: getApiKey,
    hasKey: hasKey,
    clearKey: clearKey,
    setModel: setModel,
    getConfig: getConfig,
    listModels: listModels,
    getModelInfo: getModelInfo,
    estimateCost: estimateCost,
    estimateImageCost: estimateImageCost,
    recordUsage: recordUsage,
    getUsage: getUsage,
    getDailyUsage: getDailyUsage,
    resetUsage: resetUsage,
    MODELS: MODELS,
    DEFAULT_CONFIG: DEFAULT_CONFIG
  };

})(typeof window !== 'undefined' ? window : this);