/* ai-error-recovery.js — Error handling + retry + offline queue
 * R31202 · Module 12 · 🅱️ yunshu-zhuangqi
 * 401 → invalid key UI · 429 → 3x retry (5s) · network → queue + retry on reconnect.
 */
(function (root) {
  'use strict';

  var LS_QUEUE = 'ysai.offlineQueue.v1';

  var RECOVERY_RULES = {
    AUTH_INVALID:    { action: 'prompt-rekey', message: 'API key 无效或已过期,请重新粘贴新 key。', retriable: false },
    AUTH_FORBIDDEN:  { action: 'prompt-rekey', message: 'API key 无权限访问 Claude Vision。', retriable: false },
    RATE_LIMITED:    { action: 'retry',        message: '请求频率超限,5 秒后自动重试...',        retriable: true, maxRetries: 3, retryDelayMs: 5000 },
    BAD_REQUEST:     { action: 'stop',         message: '请求参数错误,请检查图片格式。',         retriable: false },
    PAYLOAD_TOO_LARGE: { action: 'shrink',     message: '图片过大,请压缩到 5MB 以内。',           retriable: false },
    SERVER_ERROR:    { action: 'retry',        message: 'Anthropic 服务异常,3 秒后重试...',     retriable: true, maxRetries: 3, retryDelayMs: 3000 },
    TIMEOUT:         { action: 'retry',        message: '请求超时,3 秒后重试...',                retriable: true, maxRetries: 2, retryDelayMs: 3000 },
    NETWORK_ERROR:   { action: 'queue',        message: '网络错误,已加入离线队列,网络恢复后自动重试。', retriable: true, queueable: true },
    JSON_PARSE_FAIL: { action: 'manual',       message: 'AI 返回无法解析,请重试或更换提示词模板。', retriable: true, maxRetries: 1 },
    NO_KEY:          { action: 'prompt-rekey', message: '未配置 API key,请先在顶栏粘贴。',     retriable: false },
    UNKNOWN:         { action: 'retry',        message: '未知错误,5 秒后重试...',              retriable: true, maxRetries: 2, retryDelayMs: 5000 }
  };

  function classifyError(err) {
    if (!err) return 'UNKNOWN';
    if (err.code && RECOVERY_RULES[err.code]) return err.code;
    if (err.status === 401) return 'AUTH_INVALID';
    if (err.status === 403) return 'AUTH_FORBIDDEN';
    if (err.status === 429) return 'RATE_LIMITED';
    if (err.status === 400) return 'BAD_REQUEST';
    if (err.status === 413) return 'PAYLOAD_TOO_LARGE';
    if (err.status >= 500) return 'SERVER_ERROR';
    return 'UNKNOWN';
  }

  function getRecovery(code) {
    var c = code || 'UNKNOWN';
    return RECOVERY_RULES[c] || RECOVERY_RULES.UNKNOWN;
  }

  function _delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // ---- Retry runner ----
  function withRetry(fn, opts) {
    var maxRetries = (opts && opts.maxRetries) || 3;
    var retryDelayMs = (opts && opts.retryDelayMs) || 5000;
    var onAttempt = (opts && opts.onAttempt) || function () {};
    var attempt = 0;

    function run() {
      attempt++;
      onAttempt(attempt);
      return fn().catch(function (err) {
        var code = classifyError(err);
        var rec = getRecovery(code);
        if (!rec.retriable || attempt >= maxRetries) {
          throw err;
        }
        return _delay(retryDelayMs).then(run);
      });
    }
    return run();
  }

  // ---- Offline queue ----
  function _readQueue() {
    try {
      var raw = root.localStorage ? root.localStorage.getItem(LS_QUEUE) : null;
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function _writeQueue(arr) {
    try {
      if (root.localStorage) root.localStorage.setItem(LS_QUEUE, JSON.stringify(arr));
    } catch (e) { /* noop */ }
  }

  function enqueue(payload) {
    var q = _readQueue();
    var item = {
      id: 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      ts: Date.now(),
      imageDataUrl: payload.imageDataUrl,
      templateId: payload.templateId || '2d-floorplan',
      customNote: payload.customNote || '',
      model: payload.model || null,
      maxTokens: payload.maxTokens || 2048
    };
    q.push(item);
    // cap queue at 50
    if (q.length > 50) q = q.slice(-50);
    _writeQueue(q);
    return { ok: true, id: item.id, queueSize: q.length };
  }

  function dequeue(id) {
    var q = _readQueue();
    var idx = q.findIndex(function (x) { return x.id === id; });
    if (idx < 0) return { ok: false, reason: 'NOT_FOUND' };
    var item = q.splice(idx, 1)[0];
    _writeQueue(q);
    return { ok: true, item: item, queueSize: q.length };
  }

  function listQueue() {
    return _readQueue();
  }

  function clearQueue() {
    _writeQueue([]);
    return { ok: true };
  }

  // ---- Auto-retry queue when online ----
  function flushQueue(runner, opts) {
    var onItem = (opts && opts.onItem) || function () {};
    var onError = (opts && opts.onError) || function () {};
    var q = _readQueue();
    if (!q.length) return Promise.resolve({ ok: true, flushed: 0 });
    var remaining = q.slice();
    var flushed = 0;
    var failed = [];

    function processNext() {
      if (!remaining.length) {
        return { ok: true, flushed: flushed, failed: failed };
      }
      var item = remaining.shift();
      onItem(item);
      return runner(item).then(function (resp) {
        flushed++;
        dequeue(item.id);
        return processNext();
      }).catch(function (err) {
        failed.push({ id: item.id, error: (err && err.message) || String(err) });
        return processNext();
      });
    }
    return processNext();
  }

  // ---- User-facing error UI helper ----
  function describeError(err) {
    var code = classifyError(err);
    var rec = getRecovery(code);
    return {
      code: code,
      action: rec.action,
      message: rec.message,
      retriable: !!rec.retriable,
      queueable: !!rec.queueable,
      originalError: err && err.message ? err.message : String(err)
    };
  }

  root.YSAIError = {
    classifyError: classifyError,
    getRecovery: getRecovery,
    withRetry: withRetry,
    enqueue: enqueue,
    dequeue: dequeue,
    listQueue: listQueue,
    clearQueue: clearQueue,
    flushQueue: flushQueue,
    describeError: describeError,
    RECOVERY_RULES: RECOVERY_RULES
  };

})(typeof window !== 'undefined' ? window : this);