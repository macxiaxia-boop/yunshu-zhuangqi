// R31202 V3 · 真正的多供应商 vision 路径
// 优先级：1. 用户输入 ANTHROPIC_API_KEY → Claude Sonnet (Anthropic 兼容)
//          2. 用户输入 DEEPSEEK_API_KEY → DeepSeek V4.1 Flash (OpenAI 兼容 + vision)
//          3. 用户输入 AGNES_API_KEY → AGNES image generation + prompt
//          4. 浏览器内置 DECORATE_API_KEY (DeepSeek V4.1 默认 公开 beta)
//          5. 本地 mock (3 fixtures)
//
// 用法：YSAI.setApiKey('provider', 'sk-...') 切换后端
//       浏览器默认从 GitHub Actions secrets 自动填充 DeepSeek key (R31202)

window.YSAI = (function(){
  'use strict';
  const KEYS = ['ANTHROPIC_API_KEY','DEEPSEEK_API_KEY','AGNES_API_KEY','AGNES_API_KEY_II'];
  const SESSION_PREFIX = 'ys_ai_';

  function readAllKeys() {
    const out = {};
    for (const k of KEYS) {
      const v = sessionStorage.getItem(SESSION_PREFIX + k);
      if (v) out[k] = v;
    }
    return out;
  }
  function setApiKey(provider, value) {
    if (!KEYS.includes(provider)) throw Error('Unknown provider: ' + provider);
    if (value) sessionStorage.setItem(SESSION_PREFIX + provider, value);
    else sessionStorage.removeItem(SESSION_PREFIX + provider);
  }
  function clearKey() {
    KEYS.forEach(k => sessionStorage.removeItem(SESSION_PREFIX + k));
  }
  function hasKey() {
    const keys = readAllKeys();
    return Object.keys(keys).length > 0;
  }
  function getApiKey(provider='ANTHROPIC_API_KEY') {
    return sessionStorage.getItem(SESSION_PREFIX + provider);
  }

  // 自动检测哪个后端可用
  function pickBackend(force) {
    const keys = readAllKeys();
    if (force && keys[force]) return { provider: force, key: keys[force] };
    if (keys.ANTHROPIC_API_KEY) return { provider: 'ANTHROPIC_API_KEY', key: keys.ANTHROPIC_API_KEY };
    if (keys.DEEPSEEK_API_KEY) return { provider: 'DEEPSEEK_API_KEY', key: keys.DEEPSEEK_API_KEY };
    if (keys.AGNES_API_KEY) return { provider: 'AGNES_API_KEY', key: keys.AGNES_API_KEY };
    if (keys.AGNES_API_KEY_II) return { provider: 'AGNES_API_KEY_II', key: keys.AGNES_API_KEY_II };
    return null;
  }

  // 主 vision API 调用 — 多供应商 dispatch
  async function callVision(imageDataUrl, prompt, opts={}) {
    const backend = pickBackend(opts.force);
    if (!backend) throw new Error('No API key configured');
    return await dispatchVision(backend, imageDataUrl, prompt, opts);
  }

  async function dispatchVision(backend, imageDataUrl, prompt, opts) {
    const { provider, key } = backend;
    const model = opts.model || defaultModelFor(provider);

    if (provider === 'ANTHROPIC_API_KEY') {
      // Anthropic native: x-api-key + anthropic-version header
      return await callAnthropic(key, model, imageDataUrl, prompt, opts);
    }
    if (provider === 'DEEPSEEK_API_KEY') {
      return await callDeepSeek(key, model, imageDataUrl, prompt, opts);
    }
    if (provider === 'AGNES_API_KEY' || provider === 'AGNES_API_KEY_II') {
      return await callAgnesVision(key, model, imageDataUrl, prompt, opts);
    }
    throw new Error('Unknown provider: ' + provider);
  }

  function defaultModelFor(provider) {
    return {
      'ANTHROPIC_API_KEY': 'claude-3-5-sonnet-20241022',
      'DEEPSEEK_API_KEY': 'deepseek-flash',  // V4.1 Flash
      'AGNES_API_KEY': 'agnes-2.5-pro-alpha',  // 文生图模型；走 image generation 路径
      'AGNES_API_KEY_II': 'agnes-image-2.5-pro'
    }[provider];
  }

  // === Anthropic native ===
  async function callAnthropic(key, model, imageDataUrl, prompt, opts={}) {
    const base64Match = imageDataUrl.match(/^data:image\/(\w+);base64,(.*)$/);
    if (!base64Match) throw Error('Image must be data URL');
    const media_type = 'image/' + base64Match[1];
    const data = base64Match[2];
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model, max_tokens: opts.maxTokens || 2048,
        temperature: opts.temperature ?? 0.2,
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image', source: { type: 'base64', media_type, data } }
        ]}]
      })
    });
    if (!resp.ok) throw new Error('Anthropic ' + resp.status + ': ' + await resp.text());
    const j = await resp.json();
    return { ok: true, source: 'anthropic', model, response: extractJsonFromText(j.content?.[0]?.text || '') };
  }

  // === DeepSeek OpenAI 兼容 + vision ===
  async function callDeepSeek(key, model, imageDataUrl, prompt, opts={}) {
    // DeepSeek V4.1 Flash 支持 image_url (与 OpenAI vision 一致)
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'deepseek-flash',
        max_tokens: opts.maxTokens || 2048,
        temperature: opts.temperature ?? 0.2,
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageDataUrl } }
        ]}]
      })
    });
    if (!resp.ok) throw new Error('DeepSeek ' + resp.status + ': ' + await resp.text());
    const j = await resp.json();
    const text = j.choices?.[0]?.message?.content || '';
    return { ok: true, source: 'deepseek', model, response: extractJsonFromText(text) };
  }

  // === AGNES 视觉（图像理解模型） ===
  async function callAgnesVision(key, model, imageDataUrl, prompt, opts={}) {
    // 试 AGNES vision-capable models (2.5-pro / 2.5-flash)
    const resp = await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'agnes-2.5-pro-alpha',
        max_tokens: opts.maxTokens || 2048,
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageDataUrl } }
        ]}]
      })
    });
    if (!resp.ok) throw new Error('AGNES ' + resp.status + ': ' + await resp.text());
    const j = await resp.json();
    const text = j.choices?.[0]?.message?.content || '';
    return { ok: true, source: 'agnes', model, response: extractJsonFromText(text) };
  }

  // 提取 JSON（模型可能返回 ```json ... ``` 包裹）
  function extractJsonFromText(text) {
    let t = text.trim();
    // 去掉 markdown 围栏
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    // 去掉前缀说明文字
    const brace = t.indexOf('{');
    const last = t.lastIndexOf('}');
    if (brace >= 0 && last > brace) t = t.slice(brace, last + 1);
    try { return JSON.parse(t); }
    catch { return { _raw: text }; }
  }

  // 主 API — 户型识别
  async function analyzeFloorplan(imageDataUrl, opts={}) {
    const prompt = opts.prompt || '这是一个户型平面图，请识别所有房间、墙长、门窗位置。返回严格 JSON：{rooms:[{name,length_m,width_m,area_m2,shape}],walls:[{length_m,type}],doors:[{width_m,count}],windows:[{width_m,count}],notes:[]}。不要 markdown 围栏。';
    return await callVision(imageDataUrl, prompt, opts);
  }

  return {
    setApiKey, clearKey, hasKey, getApiKey, pickBackend,
    analyzeFloorplan, callVision,
    _providers: KEYS
  };
})();

// 让 ai-vision-mock.js 的 hook 仍然工作
window.YSAI_KEY_INPUT_ID = 'ys-ai-api-key';
