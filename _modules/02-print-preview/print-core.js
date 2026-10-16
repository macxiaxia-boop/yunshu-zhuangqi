/* print-core.js — 22 paper sizes, orientation, range parsing, CSS @page application
 * Zero dependencies. Module-scope only. Exposes window.PrintCore.
 */
(function (global) {
  'use strict';

  // -------- 22 paper sizes (mm) --------
  // ISO 216 A-series: A_n+1 = A_n / 2 (rounded)
  // ISO 216 B-series: B_n+1 = B_n / sqrt(2)
  // US / other: ANSI/Letter/Legal etc.
  const PAPER_SIZES = Object.freeze({
    A0: [841, 1189],
    A1: [594, 841],
    A2: [420, 594],
    A3: [297, 420],
    A4: [210, 297],
    A5: [148, 210],
    A6: [105, 148],
    A7: [74, 105],
    A8: [52, 74],
    B0: [1000, 1414],
    B1: [707, 1000],
    B2: [500, 707],
    B3: [353, 500],
    B4: [250, 353],
    B5: [176, 250],
    B6: [125, 176],
    Letter: [215.9, 279.4],
    Legal: [215.9, 355.6],
    Tabloid: [279.4, 431.8],
    Executive: [184.15, 266.7],
    Folio: [215.9, 330.2],
    自定义: null // [w, h] user-set (50-2000mm)
  });

  // -------- default state --------
  const DEFAULT_STATE = Object.freeze({
    paper: 'A4',           // key in PAPER_SIZES
    orientation: 'portrait',
    rangeMode: 'all',      // all | current | odd | even | custom
    rangeExpr: '',         // custom expression e.g. "1-5,8,11-13"
    duplex: 'single',      // single | duplex | longEdge | shortEdge
    copies: 1,
    color: 'color',        // color | bw
    printer: '',           // system printer name; 'pdf' = save-as-PDF
    zoom: 100,            // 25-300
    margin: 12,            // mm
    template: 'quote'      // quote | changeOrder | materialBook | cover
  });

  // -------- orientation swap --------
  /** portrait: keep w,h; landscape: swap -> return [h, w] */
  function applyOrientation(w, h, orientation) {
    return orientation === 'landscape' ? [h, w] : [w, h];
  }

  // -------- get effective paper dims --------
  function getPaperDims(state) {
    const key = state.paper;
    if (key === '自定义') {
      const cw = Number(state.customW) || 210;
      const ch = Number(state.customH) || 297;
      return applyOrientation(cw, ch, state.orientation);
    }
    const base = PAPER_SIZES[key];
    if (!base) throw new Error('unknown paper: ' + key);
    return applyOrientation(base[0], base[1], state.orientation);
  }

  // -------- range parser --------
  /** Parse "1-5,8,11-13" -> Set<int> of 1-indexed page numbers.
   *  Out-of-range / malformed entries silently dropped.
   *  Empty string returns empty Set.
   */
  function parseRange(expr, totalPages) {
    const out = new Set();
    if (!expr || typeof expr !== 'string') return out;
    const tokens = expr.split(',').map(s => s.trim()).filter(Boolean);
    for (const tok of tokens) {
      const m = tok.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        const a = parseInt(m[1], 10);
        const b = parseInt(m[2], 10);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        for (let i = lo; i <= hi; i++) {
          if (i >= 1 && i <= totalPages) out.add(i);
        }
      } else if (/^\d+$/.test(tok)) {
        const n = parseInt(tok, 10);
        if (n >= 1 && n <= totalPages) out.add(n);
      }
      // else: malformed -> skip silently
    }
    return out;
  }

  /** Compute which pages are selected given state + totalPages. */
  function resolveRange(state, totalPages, currentPage) {
    switch (state.rangeMode) {
      case 'all':
        return new Set(Array.from({ length: totalPages }, (_, i) => i + 1));
      case 'current':
        return new Set([currentPage || 1]);
      case 'odd': {
        const s = new Set();
        for (let i = 1; i <= totalPages; i += 2) s.add(i);
        return s;
      }
      case 'even': {
        const s = new Set();
        for (let i = 2; i <= totalPages; i += 2) s.add(i);
        return s;
      }
      case 'custom':
        return parseRange(state.rangeExpr, totalPages);
      default:
        return new Set();
    }
  }

  // -------- apply CSS @page --------
  /** Mutate a <style> element to set paper, margin, zoom. */
  function applyCSS(styleEl, state) {
    const [w, h] = getPaperDims(state);
    const m = Number(state.margin) || 0;
    const zoom = clamp(Number(state.zoom) || 100, 25, 300);
    styleEl.textContent =
      '@page { size: ' + w + 'mm ' + h + 'mm; margin: ' + m + 'mm; }' +
      '@media print { html, body { margin: 0; padding: 0; } ' +
      '.toolbar, .nav, .thumb-list, .no-print { display: none !important; } ' +
      '.paper { box-shadow: none; margin: 0; padding: ' + m + 'mm; ' +
      'min-height: ' + h + 'mm; width: ' + w + 'mm; } ' +
      '.excluded { visibility: hidden !important; } ' +
      'body { background: #fff !important; } ' +
      '@media print and (color: ' + (state.color === 'bw' ? 'white' : 'black') + ') { ' +
      '/* hint monochrome */ } }' +
      ':root { --paper-zoom: ' + (zoom / 100) + '; }';
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  // -------- zoom wheel handler --------
  /** Attach Ctrl+wheel zoom to an element. Returns disposer. */
  function attachZoom(el, state, onChange) {
    const handler = function (ev) {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      const step = ev.deltaY > 0 ? -10 : 10;
      const next = clamp((Number(state.zoom) || 100) + step, 25, 300);
      state.zoom = next;
      if (typeof onChange === 'function') onChange(next);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return function detach() { el.removeEventListener('wheel', handler); };
  }

  // -------- sequence image decode (avoid OOM) --------
  /** Pre-decode <img> elements in order. */
  async function preloadImages(imgEls) {
    for (const img of imgEls) {
      if (!img || !img.src) continue;
      try { await img.decode(); } catch (e) { /* ignore */ }
    }
  }

  // -------- apply page exclusion --------
  /** Toggle visibility of paper elements not in selected. */
  function applyExclusion(papers, selected) {
    papers.forEach(function (el, idx) {
      const pageNum = idx + 1;
      if (!selected.has(pageNum)) {
        el.classList.add('excluded');
      } else {
        el.classList.remove('excluded');
      }
    });
  }

  // -------- list printers --------
  /** Returns system printer names; falls back to ['pdf'] if unsupported. */
  async function listPrinters() {
    // Note: navigator.plugins and window.print() can't enumerate printers in browsers.
    // We expose a manual entry. For Electron host, override window.__listPrinters().
    if (typeof global.__listPrinters === 'function') {
      try {
        const list = await global.__listPrinters();
        if (Array.isArray(list) && list.length) return list;
      } catch (e) { /* fall through */ }
    }
    return ['pdf']; // fallback virtual
  }

  // -------- export --------
  global.PrintCore = Object.freeze({
    PAPER_SIZES: PAPER_SIZES,
    DEFAULT_STATE: DEFAULT_STATE,
    getPaperDims: getPaperDims,
    applyOrientation: applyOrientation,
    parseRange: parseRange,
    resolveRange: resolveRange,
    applyCSS: applyCSS,
    attachZoom: attachZoom,
    preloadImages: preloadImages,
    applyExclusion: applyExclusion,
    listPrinters: listPrinters,
    clamp: clamp
  });
})(typeof window !== 'undefined' ? window : globalThis);