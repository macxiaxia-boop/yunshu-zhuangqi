/* share-create.js — Staff-side: create share link from quote data
 * R31202 · Module 10 · 🅱️ yunshu-zhuangqi
 *
 * Workflow:
 *   YSShare.create({ projectData, estimateAmount, accessType, expiresIn, customerFields })
 *     → { shareId, shareUrl, qrDataUrl, expiresAt }
 *
 * Side effects:
 *   - POST to YSShareAPI.create (IndexedDB mock in demo, Cloudflare Worker in prod)
 *   - Render QR code to <canvas>
 *   - Copy shareUrl to clipboard
 *   - Returns full bundle to caller
 */
(function (root) {
  'use strict';

  // ---- Default options ----
  var DEFAULTS = {
    scale: 6,
    margin: 4,
    darkColor: '#000000',
    lightColor: '#ffffff',
    copyToClipboard: true,
    baseUrl: ''  // auto-detect
  };

  // ---- Theme palette from Module 09 (default 胭脂) ----
  var THEMES = {
    default: { primary: '#C04851', accent: '#F5C0C0' },
    ocean: { primary: '#264653', accent: '#8AB0AB' },
    forest: { primary: '#2D5016', accent: '#A4B494' },
    royal: { primary: '#3D348B', accent: '#B5A8D5' },
    sunshine: { primary: '#E07A5F', accent: '#F2CC8F' }
  };

  // ---- Sanitize customerFields before API call ----
  function sanitizeCustomerFields(cf) {
    if (!cf) return { name: '', phone: '', note: '' };
    return {
      name: String(cf.name || '').slice(0, 50),
      phone: String(cf.phone || '').replace(/\D/g, '').slice(0, 11),
      note: String(cf.note || '').slice(0, 200)
    };
  }

  // ---- clipboard fallback ----
  async function copyToClipboard(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) { /* fall through */ }
    }
    // legacy fallback
    if (typeof document !== 'undefined') {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
    return false;
  }

  // ---- Local shareId generator (fallback if API not yet loaded) ----
  function localShareId() {
    var alpha = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    var out = '';
    for (var i = 0; i < 12; i++) out += alpha[Math.floor(Math.random() * 32)];
    return out;
  }

  // ---- Default baseUrl ----
  function defaultBaseUrl() {
    if (typeof window === 'undefined') return 'https://yunshu-zhuangqi.com/share-view.html';
    var loc = window.location;
    var path = loc.pathname.replace(/\/[^\/]*$/, '/');
    return loc.origin + path + 'share-view.html';
  }

  // ---- Parse estimate amount as integer (防呆) ----
  function parseAmount(v) {
    var n = Number(String(v).replace(/[^\d.]/g, ''));
    if (!isFinite(n) || n < 0) return 0;
    return Math.round(n);
  }

  // ---- Main create function ----
  async function create(opts) {
    if (!opts) throw new Error('OPTS_REQUIRED');
    if (!opts.projectData) throw new Error('PROJECT_DATA_REQUIRED');
    if (!root.YSShareAPI) throw new Error('YSShareAPI_NOT_LOADED');

    var cfg = Object.assign({}, DEFAULTS, opts);

    // 1. Sanitize payload
    var customerFields = sanitizeCustomerFields(opts.customerFields);
    var estimateAmount = parseAmount(opts.estimateAmount);

    // 2. POST to API
    var apiResult = await root.YSShareAPI.create({
      projectData: opts.projectData,
      estimateAmount: estimateAmount,
      accessType: opts.accessType || 'public-read',
      expiresIn: opts.expiresIn || 7 * 24 * 60 * 60 * 1000,
      customerFields: customerFields
    });

    // 3. Build full shareUrl
    var baseUrl = cfg.baseUrl || defaultBaseUrl();
    var themeParam = opts.theme ? ('&theme=' + encodeURIComponent(opts.theme)) : '';
    var shareUrl = baseUrl + '?shareId=' + apiResult.shareId + themeParam;

    // 4. Render QR
    var qr = null, qrDataUrl = '';
    if (root.YSQR) {
      var r = root.YSQR.render(shareUrl, {
        scale: cfg.scale,
        margin: cfg.margin,
        darkColor: cfg.darkColor,
        lightColor: cfg.lightColor
      });
      qr = r.canvas;
      qrDataUrl = r.dataURL;
    }

    // 5. Copy to clipboard
    var copied = false;
    if (cfg.copyToClipboard) copied = await copyToClipboard(shareUrl);

    return {
      shareId: apiResult.shareId,
      shareUrl: shareUrl,
      qrDataUrl: qrDataUrl,
      qrCanvas: qr,
      expiresAt: apiResult.expiresAt,
      estimateAmount: estimateAmount,
      copied: copied,
      theme: opts.theme || 'default'
    };
  }

  // ---- DOM helper: full create panel embedded in app.html ----
  function renderCreateButton(opts, container) {
    if (typeof document === 'undefined') return null;
    var btn = document.createElement('button');
    btn.className = 'ys-share-create-btn';
    btn.innerHTML = '🔗 生成分享链接';
    btn.style.cssText = 'background:' + (THEMES[opts.theme || 'default'] || THEMES.default).primary +
      ';color:#fff;padding:12px 24px;border:none;border-radius:8px;font-size:15px;cursor:pointer;';
    btn.onclick = async function () {
      btn.disabled = true;
      btn.innerHTML = '⏳ 生成中...';
      try {
        var result = await create(opts);
        // show modal
        showResultModal(result, container || document.body);
        btn.disabled = false;
        btn.innerHTML = '✅ 已生成链接（已复制到剪贴板）';
        setTimeout(function () {
          btn.innerHTML = '🔗 生成分享链接';
        }, 3000);
      } catch (e) {
        btn.disabled = false;
        btn.innerHTML = '❌ ' + (e.message || '生成失败');
        console.error('YSShare.create failed:', e);
      }
    };
    if (container) container.appendChild(btn);
    return btn;
  }

  function showResultModal(result, container) {
    var modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
    var theme = THEMES[result.theme || 'default'] || THEMES.default;
    var expires = new Date(result.expiresAt);
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var expiresStr = expires.getFullYear() + '-' + pad(expires.getMonth() + 1) + '-' + pad(expires.getDate());

    modal.innerHTML = '<div style="background:#fff;border-radius:12px;padding:24px;max-width:480px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
      '<h2 style="margin:0 0 12px;color:' + theme.primary + ';">✅ 分享链接已生成</h2>' +
      '<div id="ys-qr-box" style="display:flex;justify-content:center;margin:16px 0;"></div>' +
      '<div style="background:#f5f5f5;padding:12px;border-radius:6px;margin:12px 0;word-break:break-all;font-size:13px;text-align:left;">' + result.shareUrl + '</div>' +
      '<div style="color:#888;font-size:13px;margin:8px 0;">有效期至：' + expiresStr + '</div>' +
      '<div style="color:' + (result.copied ? '#28a745' : '#dc3545') + ';font-size:13px;">' + (result.copied ? '✅ 已自动复制到剪贴板' : '⚠️ 请手动复制上方链接') + '</div>' +
      '<button id="ys-close-btn" style="margin-top:16px;padding:8px 24px;background:' + theme.primary + ';color:#fff;border:none;border-radius:6px;cursor:pointer;">关闭</button>' +
      '</div>';
    document.body.appendChild(modal);
    if (result.qrCanvas) {
      modal.querySelector('#ys-qr-box').appendChild(result.qrCanvas);
    }
    modal.querySelector('#ys-close-btn').onclick = function () { document.body.removeChild(modal); };
  }

  // ========== Public API ==========
  root.YSShare = {
    create: create,
    renderCreateButton: renderCreateButton,
    showResultModal: showResultModal,
    copyToClipboard: copyToClipboard,
    THEMES: THEMES,
    _TEST_HOOKS: {
      sanitizeCustomerFields: sanitizeCustomerFields,
      localShareId: localShareId,
      defaultBaseUrl: defaultBaseUrl,
      DEFAULTS: DEFAULTS
    }
  };

})(typeof window !== 'undefined' ? window : this);
