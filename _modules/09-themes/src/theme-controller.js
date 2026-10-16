// theme-controller.js — YSTheme 主控制（4 维：color × mode × glass × density）
// SSOT：REF 持久化键 ys_studio_ui_v31_color_mode / ys_cloud_light_skin_v1 / ys_studio_ui_v31_density
// 36 组合：6 color × 2 mode × 3 density（glass 单独 on/off，不计入 36）
//
// 兼容性：双导出 — 浏览器 window.YSTheme + Node CommonJS module.exports

'use strict';

(function (global, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = data;
  }
  if (global) {
    global.YSTheme = data.YSTheme;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  // ---- 依赖与降级（无 DOM 环境也能跑） ----
  const _doc = (typeof document !== 'undefined') ? document : null;
  const _hasDoc = !!_doc;
  const _body = _hasDoc ? (_doc.body || _doc.documentElement) : null;
  const _root = _hasDoc ? (_doc.documentElement || _doc.body) : null;
  const _storage = (typeof localStorage !== 'undefined') ? localStorage : null;

  // 持久化键（与 REF 3.1.0 schema-extraction.md 第 8 节对齐）
  const KEY_COLOR_MODE = 'ys_studio_ui_v31_color_mode';     // 'light' | 'dark'
  const KEY_LIGHT_SKIN = 'ys_cloud_light_skin_v1';           // 'red' | 'navy' | ...
  const KEY_DENSITY    = 'ys_studio_ui_v31_density';         // 'compact' | 'standard' | 'loose'
  const KEY_GLASS      = 'ys_studio_ui_v31_glass';           // '1' | '0'（额外键，与 REF 同源）
  const ALL_KEYS = [KEY_COLOR_MODE, KEY_LIGHT_SKIN, KEY_DENSITY, KEY_GLASS];

  // 白名单（防御非法主题名）
  const WHITE_THEME = ['red', 'navy', 'turquoise', 'ochre', 'purple', 'lilac'];
  const WHITE_MODE  = ['light', 'dark'];
  const WHITE_DENS  = ['compact', 'standard', 'loose'];

  // 加载同源 palette 数据（运行时优先 window.YS_THEMES，否则内联最小集）
  function _loadThemes() {
    if (typeof window !== 'undefined' && window.YS_THEMES) return window.YS_THEMES;
    if (typeof window !== 'undefined' && window.YS_CHROME) return null;
    return null;
  }
  function _loadChrome() {
    if (typeof window !== 'undefined' && window.YS_CHROME) return window.YS_CHROME;
    return null;
  }

  // 默认值（与 REF 一致：red + light + standard）
  const DEFAULTS = { color: 'red', mode: 'light', glass: false, density: 'standard' };

  // 状态（私有）
  const _state = {
    color:   DEFAULTS.color,
    mode:    DEFAULTS.mode,
    glass:   DEFAULTS.glass,
    density: DEFAULTS.density
  };

  // ---- 工具函数 ----

  function _inWhiteList(value, list) {
    return list.indexOf(value) !== -1;
  }

  function _safeParse(json, fallback) {
    try { return JSON.parse(json); } catch (_) { return fallback; }
  }

  // 把当前主题写入 :root CSS vars（含 color + chrome）
  function _writeCssVars() {
    const themes = _loadThemes();
    const chrome = _loadChrome();
    if (!_hasDoc || !_root || !themes || !chrome) return;
    const t = themes[_state.color];
    const c = chrome[_state.mode];
    if (!t || !c) return;
    // 主题色
    _root.style.setProperty('--ys-primary',       t.primary);
    _root.style.setProperty('--ys-primary-light', t.primaryLight);
    _root.style.setProperty('--ys-accent',        t.accent);
    _root.style.setProperty('--ys-on-accent',     t.onAccent);
    _root.style.setProperty('--ys-rgb',           t.rgb);
    // chrome
    _root.style.setProperty('--ys-bg',        c.bg);
    _root.style.setProperty('--ys-chrome',    c.chrome);
    _root.style.setProperty('--ys-ink',       c.ink);
    _root.style.setProperty('--ys-muted',     c.muted);
    _root.style.setProperty('--ys-line',      c.line);
    _root.style.setProperty('--ys-scrollbar', c.scrollbar);
    // 反向兼容 module 02 打印模板
    _root.style.setProperty('--accent',     t.accent);
    _root.style.setProperty('--accent-soft', 'rgba(' + t.rgb + ', 0.1)');
  }

  // 把 mode/glass/density 写入 body[data-*]（CSS 选择器据此应用）
  function _writeBodyAttrs() {
    if (!_hasDoc || !_body) return;
    _body.setAttribute('data-mode',    _state.mode);
    _body.setAttribute('data-glass',   _state.glass ? 'true' : 'false');
    _body.setAttribute('data-density', _state.density);
    // 反向兼容 module 02 打印模板
    _body.setAttribute('data-theme-color', _state.color);
    _body.setAttribute('data-theme-mode',  _state.mode);
  }

  // ---- 公开 API ----

  // 应用单维度 — 单维度切换不丢失其他维度
  function setTheme(colorName) {
    if (!_inWhiteList(colorName, WHITE_THEME)) {
      // 拒绝非法值 — 抛错而非静默吞错
      throw new Error('[YSTheme] setTheme rejected: "' + colorName + '" not in white-list ' + JSON.stringify(WHITE_THEME));
    }
    _state.color = colorName;
    _writeCssVars();
    return _state.color;
  }

  function setMode(mode) {
    if (!_inWhiteList(mode, WHITE_MODE)) {
      throw new Error('[YSTheme] setMode rejected: "' + mode + '" not in [light,dark]');
    }
    _state.mode = mode;
    _writeCssVars();
    _writeBodyAttrs();
    return _state.mode;
  }

  function setGlass(on) {
    _state.glass = !!on;
    _writeBodyAttrs();
    return _state.glass;
  }

  function setDensity(level) {
    if (!_inWhiteList(level, WHITE_DENS)) {
      throw new Error('[YSTheme] setDensity rejected: "' + level + '" not in [compact,standard,loose]');
    }
    _state.density = level;
    _writeBodyAttrs();
    return _state.density;
  }

  // 4 维组合一次应用（保留 — 单维度 API 不丢另一维度，applyAll 才允许一次到位）
  function applyAll(color, mode, glass, density) {
    // 顺序：color -> mode -> density -> glass（写入 CSS vars 与 body attr）
    if (color != null) {
      if (!_inWhiteList(color, WHITE_THEME)) {
        throw new Error('[YSTheme] applyAll color rejected: "' + color + '"');
      }
      _state.color = color;
    }
    if (mode != null) {
      if (!_inWhiteList(mode, WHITE_MODE)) {
        throw new Error('[YSTheme] applyAll mode rejected: "' + mode + '"');
      }
      _state.mode = mode;
    }
    if (density != null) {
      if (!_inWhiteList(density, WHITE_DENS)) {
        throw new Error('[YSTheme] applyAll density rejected: "' + density + '"');
      }
      _state.density = density;
    }
    if (glass != null) {
      _state.glass = !!glass;
    }
    _writeCssVars();
    _writeBodyAttrs();
    return _getCurrent();
  }

  function _getCurrent() {
    return {
      color:   _state.color,
      mode:    _state.mode,
      glass:   _state.glass,
      density: _state.density
    };
  }
  function getCurrent() { return _getCurrent(); }

  // 36 组合（6 color × 2 mode × 3 density，glass 单独维度不计入矩阵）
  function getAllCombinations() {
    const out = [];
    for (let i = 0; i < WHITE_THEME.length; i++) {
      const color = WHITE_THEME[i];
      for (let j = 0; j < WHITE_MODE.length; j++) {
        const mode = WHITE_MODE[j];
        for (let k = 0; k < WHITE_DENS.length; k++) {
          const density = WHITE_DENS[k];
          out.push({ color, mode, glass: _state.glass, density });
        }
      }
    }
    return out;
  }

  // 持久化（4 键，与 REF 对齐）
  function persist() {
    if (!_storage) return false;
    try {
      _storage.setItem(KEY_COLOR_MODE, _state.mode);
      _storage.setItem(KEY_LIGHT_SKIN, _state.color);
      _storage.setItem(KEY_DENSITY,    _state.density);
      _storage.setItem(KEY_GLASS,      _state.glass ? '1' : '0');
      return true;
    } catch (_) { return false; }
  }

  // 从 localStorage 恢复（容错 — 任何字段非法即回退默认）
  function loadFromStorage() {
    if (!_storage) return _getCurrent();
    const raw = {
      mode:    _storage.getItem(KEY_COLOR_MODE),
      color:   _storage.getItem(KEY_LIGHT_SKIN),
      density: _storage.getItem(KEY_DENSITY),
      glass:   _storage.getItem(KEY_GLASS)
    };
    if (_inWhiteList(raw.mode,    WHITE_MODE))  _state.mode    = raw.mode;
    if (_inWhiteList(raw.color,   WHITE_THEME)) _state.color   = raw.color;
    if (_inWhiteList(raw.density, WHITE_DENS))  _state.density = raw.density;
    if (raw.glass === '1' || raw.glass === '0') _state.glass = (raw.glass === '1');
    _writeCssVars();
    _writeBodyAttrs();
    return _getCurrent();
  }

  // 渲染主题切换 UI（无依赖 — DOM only）
  function attachThemeSwitcher(containerEl) {
    if (!_hasDoc) return null;
    if (!containerEl) throw new Error('[YSTheme] attachThemeSwitcher: container is required');
    const el = (typeof containerEl === 'string') ? _doc.querySelector(containerEl) : containerEl;
    if (!el) throw new Error('[YSTheme] attachThemeSwitcher: container not found');

    const themes = _loadThemes() || {};
    const rows = [];
    rows.push('<div class="ys-theme-switcher" role="group" aria-label="主题切换">');
    rows.push('  <div class="ys-ts-title">主题色</div>');
    rows.push('  <div class="ys-ts-palette">');
    for (let i = 0; i < WHITE_THEME.length; i++) {
      const key = WHITE_THEME[i];
      const t = themes[key];
      const swatch = t ? t.primary : '#888';
      rows.push('    <button type="button" class="ys-ts-swatch" data-color="' + key + '" style="--c:' + swatch + '" aria-label="' + (t ? t.name : key) + '">');
      rows.push('      <span class="ys-ts-dot"></span>');
      rows.push('      <span class="ys-ts-name">' + (t ? t.name : key) + '</span>');
      rows.push('    </button>');
    }
    rows.push('  </div>');
    rows.push('  <div class="ys-ts-title">模式</div>');
    rows.push('  <div class="ys-ts-mode">');
    rows.push('    <button type="button" data-mode="light">浅色</button>');
    rows.push('    <button type="button" data-mode="dark">深色</button>');
    rows.push('  </div>');
    rows.push('  <div class="ys-ts-title">密度</div>');
    rows.push('  <div class="ys-ts-density">');
    rows.push('    <button type="button" data-density="compact">紧凑</button>');
    rows.push('    <button type="button" data-density="standard">标准</button>');
    rows.push('    <button type="button" data-density="loose">宽松</button>');
    rows.push('  </div>');
    rows.push('  <div class="ys-ts-title">玻璃</div>');
    rows.push('  <div class="ys-ts-glass">');
    rows.push('    <label><input type="checkbox" data-glass /> 玻璃效果</label>');
    rows.push('  </div>');
    rows.push('  <div class="ys-ts-actions">');
    rows.push('    <button type="button" class="ys-ts-save">保存设置</button>');
    rows.push('  </div>');
    rows.push('</div>');
    el.innerHTML = rows.join('\n');

    // 同步当前状态到 UI
    _syncSwitcherUI(el);

    // 事件代理
    el.addEventListener('click', function (ev) {
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const colorBtn = target.closest('.ys-ts-swatch');
      const modeBtn  = target.closest('.ys-ts-mode button');
      const densBtn  = target.closest('.ys-ts-density button');
      const saveBtn  = target.closest('.ys-ts-save');
      if (colorBtn) {
        setTheme(colorBtn.getAttribute('data-color'));
        _syncSwitcherUI(el);
      } else if (modeBtn) {
        setMode(modeBtn.getAttribute('data-mode'));
        _syncSwitcherUI(el);
      } else if (densBtn) {
        setDensity(densBtn.getAttribute('data-density'));
        _syncSwitcherUI(el);
      } else if (saveBtn) {
        persist();
        saveBtn.textContent = '已保存';
        setTimeout(function () { saveBtn.textContent = '保存设置'; }, 1200);
      }
    });
    el.addEventListener('change', function (ev) {
      const target = ev.target;
      if (target && target.matches('input[data-glass]')) {
        setGlass(target.checked);
      }
    });

    return el;
  }

  function _syncSwitcherUI(rootEl) {
    const cur = _getCurrent();
    const swatches = rootEl.querySelectorAll('.ys-ts-swatch');
    for (let i = 0; i < swatches.length; i++) {
      const k = swatches[i].getAttribute('data-color');
      if (k === cur.color) swatches[i].classList.add('ys-ts-active');
      else swatches[i].classList.remove('ys-ts-active');
    }
    const modeBtns = rootEl.querySelectorAll('.ys-ts-mode button');
    for (let i = 0; i < modeBtns.length; i++) {
      const m = modeBtns[i].getAttribute('data-mode');
      if (m === cur.mode) modeBtns[i].classList.add('ys-ts-active');
      else modeBtns[i].classList.remove('ys-ts-active');
    }
    const densBtns = rootEl.querySelectorAll('.ys-ts-density button');
    for (let i = 0; i < densBtns.length; i++) {
      const d = densBtns[i].getAttribute('data-density');
      if (d === cur.density) densBtns[i].classList.add('ys-ts-active');
      else densBtns[i].classList.remove('ys-ts-active');
    }
    const glassEl = rootEl.querySelector('input[data-glass]');
    if (glassEl) glassEl.checked = !!cur.glass;
  }

  // 模块 06 财务字段联动辅助 — 把 5 费率输入框的 border-color 切到当前 accent
  function bindAccentToInputs(selector) {
    if (!_hasDoc) return;
    const nodes = _doc.querySelectorAll(selector);
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].style.borderColor = 'var(--ys-accent)';
    }
  }

  // CSS 切换动画（在 documentElement 上注入 transition，200ms 一次）
  function enableTransition() {
    if (!_hasDoc || !_root) return;
    _root.style.setProperty('--ys-transition', 'all 200ms ease');
    // 触发 reflow 后清掉（避免持续 transition 影响性能）
  }

  // 公开 API 收集
  const YSTheme = {
    // 单维度
    setTheme: setTheme,
    setMode:  setMode,
    setGlass: setGlass,
    setDensity: setDensity,
    // 4 维组合
    applyAll: applyAll,
    getCurrent: getCurrent,
    getAllCombinations: getAllCombinations,
    // UI
    attachThemeSwitcher: attachThemeSwitcher,
    bindAccentToInputs: bindAccentToInputs,
    enableTransition: enableTransition,
    // 持久化
    persist: persist,
    loadFromStorage: loadFromStorage,
    // 常量（白名单 / 键名 / 默认值 — 测试与其他模块对齐）
    WHITE_THEME: WHITE_THEME.slice(),
    WHITE_MODE:  WHITE_MODE.slice(),
    WHITE_DENS:  WHITE_DENS.slice(),
    KEY_COLOR_MODE: KEY_COLOR_MODE,
    KEY_LIGHT_SKIN: KEY_LIGHT_SKIN,
    KEY_DENSITY:    KEY_DENSITY,
    KEY_GLASS:      KEY_GLASS,
    ALL_KEYS: ALL_KEYS.slice(),
    DEFAULTS: Object.assign({}, DEFAULTS),
    // 测试 / 内部
    _state: _state
  };

  // 浏览器环境：首次挂载时尝试从 localStorage 恢复（无 DOM 则跳过）
  if (_hasDoc) {
    try {
      loadFromStorage();
    } catch (_) { /* swallow - first load ok */ }
  }

  return { YSTheme: YSTheme, _state: _state };
});
