/* ai-vision.js — Claude Vision API caller
 * R31202 · Module 12 · 🅱️ yunshu-zhuangqi
 * Calls Anthropic Messages API directly via fetch.
 * No key upload, no image upload outside Anthropic.
 */
(function (root) {
  'use strict';

  var API_BASE = 'https://api.anthropic.com/v1/messages';
  var API_VERSION = '2023-06-01';
  var DEFAULT_TIMEOUT_MS = 60000;

  function _getKey() {
    if (!root.YSAI) throw new Error('YSAI_NOT_LOADED');
    return root.YSAI.getApiKey();
  }

  function _buildBody(modelId, imageDataUrl, prompt, maxTokens, temperature) {
    // imageDataUrl: data:image/png;base64,XXXXX
    var match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(imageDataUrl || '');
    if (!match) throw new Error('IMAGE_DATAURL_INVALID');
    var mediaType = match[1];
    var base64data = match[2];

    return {
      model: modelId,
      max_tokens: maxTokens,
      temperature: temperature,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64data
            }
          },
          { type: 'text', text: prompt }
        ]
      }]
    };
  }

  function _parseError(status, responseText) {
    var msg;
    try {
      var obj = JSON.parse(responseText);
      msg = (obj && obj.error && obj.error.message) || ('HTTP_' + status);
    } catch (e) {
      msg = responseText || ('HTTP_' + status);
    }
    if (status === 401) return { code: 'AUTH_INVALID', message: 'API key 无效或已过期: ' + msg, status: status };
    if (status === 403) return { code: 'AUTH_FORBIDDEN', message: 'API key 无权限: ' + msg, status: status };
    if (status === 429) return { code: 'RATE_LIMITED', message: '请求频率超限: ' + msg, status: status };
    if (status === 400) return { code: 'BAD_REQUEST', message: '请求参数错: ' + msg, status: status };
    if (status === 413) return { code: 'PAYLOAD_TOO_LARGE', message: '图片过大: ' + msg, status: status };
    if (status >= 500) return { code: 'SERVER_ERROR', message: 'Anthropic 服务异常: ' + msg, status: status };
    return { code: 'HTTP_' + status, message: msg, status: status };
  }

  function analyzeFloorplan(opts) {
    if (!opts || typeof opts !== 'object') {
      return Promise.reject({ code: 'ARGS_INVALID', message: 'opts 必须为对象' });
    }
    var imageDataUrl = opts.imageDataUrl;
    var templateId = opts.templateId || '2d-floorplan';
    var customNote = opts.customNote || '';
    var modelId = (opts.model) || (root.YSAI && root.YSAI.getConfig().model) || 'claude-3-5-sonnet-20241022';
    var maxTokens = opts.maxTokens || 2048;
    var temperature = opts.temperature || 0.2;
    var timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    var signal = opts.signal || null;

    var key = _getKey();
    if (!key) return Promise.reject({ code: 'NO_KEY', message: '未配置 API key,请先调用 YSAI.setApiKey()' });

    var prompt = root.YSAIPrompts
      ? root.YSAIPrompts.buildUserPrompt(templateId, customNote)
      : '识别户型图,返回 JSON。';

    var body = _buildBody(modelId, imageDataUrl, prompt, maxTokens, temperature);

    var ctrl;
    var timeoutId;
    if (typeof AbortController !== 'undefined' && !signal) {
      ctrl = new AbortController();
      timeoutId = setTimeout(function () { ctrl.abort('TIMEOUT'); }, timeoutMs);
    }

    return fetch(API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body),
      signal: signal || (ctrl && ctrl.signal)
    }).then(function (resp) {
      if (timeoutId) clearTimeout(timeoutId);
      var status = resp.status;
      return resp.text().then(function (text) {
        if (!resp.ok) {
          var err = _parseError(status, text);
          var e = new Error(err.message);
          e.code = err.code;
          e.status = err.status;
          throw e;
        }
        var data;
        try { data = JSON.parse(text); }
        catch (e) {
          var e2 = new Error('响应解析失败');
          e2.code = 'RESPONSE_PARSE_FAIL';
          throw e2;
        }
        // Extract content text
        var content = data.content || [];
        var textOut = '';
        for (var i = 0; i < content.length; i++) {
          if (content[i].type === 'text') { textOut += content[i].text || ''; }
        }
        var usage = data.usage || {};
        return {
          ok: true,
          model: data.model || modelId,
          rawText: textOut,
          usage: {
            inputTokens: usage.input_tokens || 0,
            outputTokens: usage.output_tokens || 0
          },
          stopReason: data.stop_reason || null,
          responseId: data.id || null
        };
      });
    }).catch(function (err) {
      if (timeoutId) clearTimeout(timeoutId);
      if (err && err.name === 'AbortError') {
        var e3 = new Error('请求超时');
        e3.code = 'TIMEOUT';
        throw e3;
      }
      if (err && /Failed to fetch|NetworkError|TypeError/.test(String(err.message || err))) {
        var e4 = new Error('网络错误,请检查网络连接');
        e4.code = 'NETWORK_ERROR';
        e4.cause = err;
        throw e4;
      }
      throw err;
    });
  }

  // ---- Parse raw text into structured AI result ----
  function parseAiResult(rawText) {
    if (!rawText) throw new Error('EMPTY_TEXT');
    var parsed = root.YSAIPrompts ? root.YSAIPrompts.extractJson(rawText) : null;
    if (!parsed) {
      var e = new Error('AI 响应解析失败');
      e.code = 'JSON_PARSE_FAIL';
      e.rawText = rawText;
      throw e;
    }
    // Normalize structure
    var result = {
      rooms: Array.isArray(parsed.rooms) ? parsed.rooms.map(_normRoom) : [],
      walls: Array.isArray(parsed.walls) ? parsed.walls.map(_normWall) : [],
      doors: Array.isArray(parsed.doors) ? parsed.doors.map(_normDoor) : [],
      windows: Array.isArray(parsed.windows) ? parsed.windows.map(_normWindow) : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : [],
      rawText: rawText
    };
    return result;
  }

  function _normRoom(r) {
    if (!r || typeof r !== 'object') return null;
    var length = Number(r.length_m) || 0;
    var width = Number(r.width_m) || 0;
    var area = Number(r.area_m2) || 0;
    if (!area && length && width) area = +(length * width).toFixed(2);
    return {
      name: String(r.name || '未命名房间'),
      length_m: +length.toFixed(2),
      width_m: +width.toFixed(2),
      area_m2: +area.toFixed(2),
      shape: r.shape || (length && width ? 'rect' : 'irregular')
    };
  }
  function _normWall(w) {
    if (!w || typeof w !== 'object') return null;
    return {
      length_m: +(Number(w.length_m) || 0).toFixed(2),
      type: (w.type === 'inner' || w.type === 'partition') ? 'inner' : 'outer'
    };
  }
  function _normDoor(d) {
    if (!d || typeof d !== 'object') return null;
    return {
      width_m: +(Number(d.width_m) || 0.9).toFixed(2),
      count: Math.max(1, parseInt(d.count, 10) || 1)
    };
  }
  function _normWindow(w) {
    if (!w || typeof w !== 'object') return null;
    return {
      width_m: +(Number(w.width_m) || 1.5).toFixed(2),
      count: Math.max(1, parseInt(w.count, 10) || 1)
    };
  }

  // ---- High-level helper: analyze + parse ----
  function analyzeAndParse(opts) {
    return analyzeFloorplan(opts).then(function (resp) {
      var parsed = parseAiResult(resp.rawText);
      // Track usage
      if (root.YSAI && root.YSAI.recordUsage) {
        root.YSAI.recordUsage(resp.model, resp.usage.inputTokens, resp.usage.outputTokens);
      }
      parsed.usage = resp.usage;
      parsed.model = resp.model;
      parsed.responseId = resp.responseId;
      parsed.cost = root.YSAI ? root.YSAI.estimateCost(resp.model, resp.usage.inputTokens, resp.usage.outputTokens) : null;
      return parsed;
    });
  }

  // ---- Convert File/Blob to data URL ----
  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('FILE_REQUIRED')); return; }
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('FILE_READ_FAIL')); };
      reader.readAsDataURL(file);
    });
  }

  function imageToDataUrl(img) {
    return new Promise(function (resolve, reject) {
      try {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        var ctx = c.getContext('2d');
        if (!ctx) { reject(new Error('CANVAS_UNAVAILABLE')); return; }
        ctx.drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    });
  }

  root.YSAIVision = {
    analyzeFloorplan: analyzeFloorplan,
    analyzeAndParse: analyzeAndParse,
    parseAiResult: parseAiResult,
    fileToDataUrl: fileToDataUrl,
    imageToDataUrl: imageToDataUrl,
    API_BASE: API_BASE,
    API_VERSION: API_VERSION
  };

})(typeof window !== 'undefined' ? window : this);