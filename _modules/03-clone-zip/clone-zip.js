/* clone-zip.js — yunshu-zhuangqi 克隆配置 ZIP 主库
 * 对位 REF 3.1.0 clone-settings.js (杀手功能之一: 工作室配置可移植)
 * 依赖:
 *   - JSZip 3.10.1 (CDN script 加载: https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js)
 *   - YSCloneValidate (validation.js)
 *   - YSCloneResources (resources-handler.js)
 *   - YSCloneBackup (index-backup.js)
 * 暴露: window.YSClone = { exportBytes, inspect, apply, restore, snapshot, panelHTML }
 *
 * 数据流:
 *   snapshot()   → {settings, library, template, preferences, resourceFiles}
 *   exportBytes() → ZIP(uint8array) 含 manifest.json + configuration.json + 使用说明.txt
 *   inspect(zip)  → {manifest, config}  (含 SHA256 + DRM + 字段白名单校验)
 *   apply(config) → localStorage + IDB 备份 + 回滚
 *   restore()     → 从 IDB 'before-import' 恢复
 */
(function (global) {
  'use strict';

  // ---- 依赖 ----
  const V = global.YSCloneValidate;
  if (!V) throw new Error('clone-zip.js 必须在 validation.js 之后加载');
  const R = global.YSCloneResources;
  if (!R) throw new Error('clone-zip.js 必须在 resources-handler.js 之后加载');
  const B = global.YSCloneBackup;
  if (!B) throw new Error('clone-zip.js 必须在 index-backup.js 之后加载');

  if (typeof global.JSZip === 'undefined') {
    throw new Error('JSZip 未加载。请先在 app.html 前置 <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>');
  }
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto API 不可用,无法 SHA256 校验');
  }

  // ---- 常量 ----
  const FORMAT = 'YUNSHU_ZHUANGQI_CLONE';
  const SCHEMA = 1;
  const APP = '0.5.0';
  const ALLOWED_MIN_VERSIONS = ['0.5.0', '0.5.1', '0.6.0'];

  // 托管的 localStorage keys
  const MANAGED_KEYS = [
    'rm_persistent_settings_v23',
    'ys_system_quota_library_v1',
    'rm_template_data',
    'ys_clone_defaults_v1',
    ...V.PREFERENCES
  ];

  const ZIP_ALLOWED_ENTRIES = ['manifest.json', 'configuration.json', '使用说明.txt'];
  const ZIP_MAX_ENTRIES = 10;

  // ---- 工具 ----
  function copy(x) { return JSON.parse(JSON.stringify(x)); }

  function pick(obj, keys) {
    const out = {};
    if (!obj) return out;
    for (const k of keys) {
      if (obj[k] !== undefined) out[k] = copy(obj[k]);
    }
    return out;
  }

  function readLS(k) {
    try {
      const s = localStorage.getItem(k);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  // SHA-256 (Web Crypto API) — Uint8Array → hex
  async function sha256(bytes) {
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buf), function (n) {
      return n.toString(16).padStart(2, '0');
    }).join('');
  }

  // 当前 data (yunshu-zhuangqi 全局 data 对象 — 由 app.html 暴露)
  function getData() {
    return global.data || global.window && global.window.data || {};
  }

  // ---- snapshot: 读取当前配置 + localStorage → snapshot 对象 ----
  function snapshot() {
    const data = getData();
    const projectInfo = (data.projectInfo) || {};
    const settings = {};
    // 51 字段白名单 (除 financial)
    for (const k of V.FIELDS) {
      if (V.FINANCIAL.has(k)) continue;
      if (projectInfo[k] !== undefined) settings[k] = copy(projectInfo[k]);
    }
    // financial 来自 ys_clone_defaults_v1 (新项目默认费率)
    const defaults = readLS('ys_clone_defaults_v1') || {};
    for (const k of V.FINANCIAL) {
      if (defaults[k] !== undefined) settings[k] = copy(defaults[k]);
    }
    // library
    const lib = {
      fileType: 'YUNSHANG_QUOTA_LIBRARY',
      version: 1,
      categories: copy(data.libCategories || []),
      libraries: copy((data.ysPlus && data.ysPlus.libraries) || []),
      materialTables: copy(data.materialTables || [])
    };
    // template — 清理工程信息
    const tpl = readLS('rm_template_data');
    let template = null;
    if (tpl) {
      template = {
        projectInfo: copy(tpl.projectInfo || {}),
        categories: copy(tpl.categories || []),
        libCategories: [], // 不打包 in-quote libCategories (防止历史数据污染)
        materialTables: [], // 不打包 (已在 library 内)
        ysPlus: { libraries: [] }
      };
      // 清空工程信息
      const forbidden = ['name', 'code', 'ownerName', 'projectAddress', 'date', 'author', 'checker', 'email', 'designArea'];
      for (const f of forbidden) {
        if (template.projectInfo) {
          template.projectInfo[f] = (f === 'designArea') ? 0 : '';
        }
      }
    }
    // preferences
    const prefs = {};
    for (const k of V.PREFERENCES) {
      const v = localStorage.getItem(k);
      if (v != null) prefs[k] = v;
    }
    return {
      settings: settings,
      library: lib,
      template: template,
      preferences: prefs
    };
  }

  // ---- exportBytes: snapshot → ZIP(uint8array) ----
  async function exportBytes(opts) {
    opts = opts || {};
    const config = snapshot();
    // 可选: 包含资源文件
    if (opts.resourceFiles && Array.isArray(opts.resourceFiles)) {
      config.resourceFiles = copy(opts.resourceFiles);
    }
    // 1. 校验 (throw early)
    V.validateAll(config);
    // 2. 序列化
    const text = JSON.stringify(config);
    const bytes = new TextEncoder().encode(text);
    // 3. 配置主体 ≤ 40MB
    if (bytes.length > V.MAX_CONFIG_BYTES) {
      throw new Error('配置超过 40MB,请先精简图片或模板');
    }
    // 4. SHA256
    const sha = await sha256(bytes);
    // 5. manifest
    const manifest = {
      format: FORMAT,
      schema: SCHEMA,
      appVersion: APP,
      minAppVersion: '0.5.0',
      createdAt: new Date().toISOString(),
      company: (config.settings && config.settings.companyName) || '工作室',
      sha256: sha,
      contents: {
        categories: (config.library && config.library.categories) ? config.library.categories.length : 0,
        quotas: (config.library && config.library.categories) ?
          config.library.categories.reduce(function (n, c) { return n + ((c.library || []).length); }, 0) : 0,
        template: !!config.template,
        resourceFiles: Array.isArray(config.resourceFiles) ? config.resourceFiles.length : 0
      }
    };
    // 6. ZIP
    const zip = new global.JSZip();
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    zip.file('configuration.json', text);
    zip.file('使用说明.txt',
      'yunshu-zhuangqi 克隆配置包\n' +
      '\n' +
      '导出时间: ' + manifest.createdAt + '\n' +
      '公司: ' + manifest.company + '\n' +
      '软件版本: ' + manifest.appVersion + '\n' +
      'minAppVersion: ' + manifest.minAppVersion + '\n' +
      '\n' +
      '在 yunshu-zhuangqi 的 "系统设置 → 克隆设置" 中直接选择本 ZIP。\n' +
      '包含: 系统设置 (公司/Logo/界面/水印/打印) + 定额库 + 默认费率 + 初始模板。\n' +
      '图片内嵌在包中,无需复制电脑路径。\n' +
      '导入会覆盖对应配置,自动保留备份。不含项目历史。'
    );
    const out = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    return out;
  }

  // ---- inspect: ZIP(uint8array) → {manifest, config} (校验 DRM) ----
  async function inspect(bytes) {
    if (!(bytes instanceof Uint8Array) && !(bytes instanceof ArrayBuffer)) {
      throw new Error('inspect 入参必须是 Uint8Array/ArrayBuffer');
    }
    const u8 = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
    if (u8.byteLength > V.MAX_ZIP_BYTES) {
      throw new Error('ZIP 配置包超过 45MB');
    }
    let zip;
    try {
      zip = await global.JSZip.loadAsync(u8);
    } catch (e) {
      throw new Error('无法读取 ZIP,请选择本软件导出的克隆配置包');
    }
    // ZIP 内容白名单
    const entries = Object.values(zip.files);
    if (entries.length > ZIP_MAX_ENTRIES) {
      throw new Error('ZIP 包条目数超过 ' + ZIP_MAX_ENTRIES);
    }
    for (const e of entries) {
      if (e.dir) throw new Error('ZIP 包含目录条目: ' + e.name);
      if (!ZIP_ALLOWED_ENTRIES.includes(e.name)) {
        throw new Error('ZIP 包内容不符合克隆格式: ' + e.name);
      }
      if (e.unsafeOriginalName && e.unsafeOriginalName !== e.name) {
        throw new Error('ZIP 包含 unsafe 文件名: ' + e.name);
      }
      // 单文件解压大小 ≤ 40MB
      const usz = (e._data && e._data.uncompressedSize) || 0;
      if (usz > V.MAX_CONFIG_BYTES) {
        throw new Error('ZIP 解压内容过大: ' + e.name);
      }
    }
    if (!zip.file('manifest.json')) throw new Error('不是 yunshu-zhuangqi 克隆配置包 (缺 manifest.json)');
    if (!zip.file('configuration.json')) throw new Error('不是 yunshu-zhuangqi 克隆配置包 (缺 configuration.json)');
    if (zip.file('manifest.json')._data.uncompressedSize > 32 * 1024) {
      throw new Error('配置清单无效 (manifest 过大)');
    }
    // 解析 manifest
    const m = JSON.parse(await zip.file('manifest.json').async('string'));
    V.safeJSON(m);
    if (m.format !== FORMAT) throw new Error('配置包格式不兼容: ' + m.format);
    if (m.schema !== SCHEMA) throw new Error('配置包 schema 不兼容: ' + m.schema);
    if (ALLOWED_MIN_VERSIONS.indexOf(m.minAppVersion) < 0) {
      throw new Error('配置包 minAppVersion 不兼容,请升级 yunshu-zhuangqi 到 0.5.0+ (got: ' + m.minAppVersion + ')');
    }
    // 验证 SHA256
    const content = await zip.file('configuration.json').async('uint8array');
    if (content.length > V.MAX_CONFIG_BYTES) {
      throw new Error('configuration.json 超过 40MB');
    }
    const actualSha = await sha256(content);
    if (actualSha !== m.sha256) {
      throw new Error('配置包校验失败,文件可能损坏');
    }
    // 解析 configuration + 校验
    const config = JSON.parse(new TextDecoder().decode(content));
    V.validateAll(config);
    return { manifest: m, config: config };
  }

  // ---- apply: config → localStorage (含 IDB 备份 + 失败回滚) ----
  async function apply(config, opts) {
    opts = opts || {};
    const mode = opts.mode || 'replace'; // 'replace' | 'merge'
    V.validateAll(config);

    const data = getData();

    // 用 safeApply 包装 (IDB 备份)
    return await B.safeApply(MANAGED_KEYS, data, config, async function (cfg) {
      // 1. resourceFiles (如果存在) — 还原到 localStorage
      if (Array.isArray(cfg.resourceFiles)) {
        await R.unpackResources(cfg.resourceFiles);
      }
      // 2. settings → rm_persistent_settings_v23 + ys_clone_defaults_v1
      const persistent = readLS('rm_persistent_settings_v23') || {};
      const newPersistent = (mode === 'merge') ? copy(persistent) : {};
      for (const k of V.FIELDS) {
        if (cfg.settings[k] !== undefined) {
          newPersistent[k] = copy(cfg.settings[k]);
        } else if (mode === 'replace') {
          delete newPersistent[k];
        }
      }
      localStorage.setItem('rm_persistent_settings_v23', JSON.stringify(newPersistent));
      // financial → ys_clone_defaults_v1 (新项目默认费率)
      const cloneDefaults = {};
      for (const k of V.FINANCIAL) {
        if (cfg.settings[k] !== undefined) cloneDefaults[k] = copy(cfg.settings[k]);
      }
      localStorage.setItem('ys_clone_defaults_v1', JSON.stringify(cloneDefaults));
      // 3. library → ys_system_quota_library_v1 + data.libCategories
      localStorage.setItem('ys_system_quota_library_v1', JSON.stringify(cfg.library));
      data.libCategories = copy(cfg.library.categories || []);
      if (data.materialTables !== undefined) {
        data.materialTables = copy(cfg.library.materialTables || []);
      }
      if (!data.ysPlus) data.ysPlus = {};
      data.ysPlus.libraries = copy(cfg.library.libraries || []);
      // 4. template → rm_template_data
      if (cfg.template) {
        const tpl = copy(cfg.template);
        tpl.libCategories = copy(cfg.library.categories || []);
        tpl.materialTables = copy(cfg.library.materialTables || []);
        if (!tpl.ysPlus) tpl.ysPlus = {};
        tpl.ysPlus.libraries = copy(cfg.library.libraries || []);
        localStorage.setItem('rm_template_data', JSON.stringify(tpl));
      } else {
        localStorage.removeItem('rm_template_data');
      }
      // 5. preferences → localStorage
      for (const k of V.PREFERENCES) {
        const v = cfg.preferences ? cfg.preferences[k] : undefined;
        if (v === undefined || v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      }
      // 6. projectInfo (当前打开项目)
      const pi = data.projectInfo || {};
      for (const k of V.FIELDS) {
        if (V.FINANCIAL.has(k)) continue; // financial 不覆盖当前项目
        if (cfg.settings[k] !== undefined) {
          pi[k] = copy(cfg.settings[k]);
        } else if (mode === 'replace') {
          delete pi[k];
        }
      }
      data.projectInfo = pi;
      // 7. 保存 rm_current_data
      localStorage.setItem('rm_current_data', JSON.stringify(data));
      return { ok: true, appliedAt: new Date().toISOString() };
    });
  }

  // ---- restore: 从 IDB 'before-import' 恢复 ----
  async function restore() {
    return await B.restoreLastImport(MANAGED_KEYS);
  }

  // ---- panelHTML: 克隆设置 UI ----
  function panelHTML() {
    return [
      '<section class="ys-clone-card" style="padding:16px;border:1px solid #e5e7eb;border-radius:8px;margin:12px 0;background:#fff">',
      '<h3 style="margin:0 0 8px 0;font-size:16px">克隆设置</h3>',
      '<p style="color:#6b7280;margin:0 0 12px 0;font-size:13px">',
      '配置一次,直接导入 ZIP,统一工作室品牌、定额和版面。',
      '包含公司与 Logo、界面与打印设置、定额库及材料表、默认费率、已保存的初始模板。',
      '图片内嵌在包中,无需复制电脑路径。',
      '</p>',
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">',
      '<button type="button" class="ys-btn ys-btn-primary" data-ys-action="export" style="padding:8px 16px;background:#6366f1;color:#fff;border:none;border-radius:6px;cursor:pointer">导出克隆 ZIP</button>',
      '<button type="button" class="ys-btn" data-ys-action="import" style="padding:8px 16px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer">导入克隆 ZIP</button>',
      '<button type="button" class="ys-btn" data-ys-action="restore" style="padding:8px 16px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer">恢复导入前设置</button>',
      '</div>',
      '<input type="file" accept=".zip,application/zip" data-ys-input="file" style="display:none">',
      '<div data-ys-output style="margin-top:12px;padding:8px;background:#f9fafb;border-radius:4px;font-size:12px;color:#374151;min-height:24px"></div>',
      '<p style="color:#9ca3af;margin:8px 0 0 0;font-size:11px">',
      '导入前会显示包内信息并自动备份。模板只使用已保存的初始模板,不会把当前正在编辑的客户项目当作模板导出。',
      '</p>',
      '</section>'
    ].join('');
  }

  // ---- panelBind: 绑定 UI 事件 (在 panelHTML() 插入 DOM 后调用) ----
  function panelBind(rootEl, hooks) {
    hooks = hooks || {};
    if (!rootEl) return;
    const out = rootEl.querySelector('[data-ys-output]') || rootEl;
    const fileInput = rootEl.querySelector('[data-ys-input="file"]');

    function log(msg, kind) {
      if (hooks.log) hooks.log(msg, kind);
      else out.textContent = (out.textContent ? out.textContent + '\n' : '') + msg;
    }

    async function doExport() {
      try {
        log('正在导出...', 'info');
        const bytes = await exportBytes();
        const blob = new Blob([bytes], { type: 'application/zip' });
        const name = 'yunshu-zhuangqi_' + (getData().projectInfo ? (getData().projectInfo.companyName || 'studio') : 'studio')
          .replace(/[\\/:*?"<>|]/g, '_') + '_' +
          new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '.zip';
        // 浏览器下载
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        log('已导出: ' + name + ' (' + bytes.byteLength + ' bytes)', 'ok');
        if (hooks.onExport) hooks.onExport({ name: name, size: bytes.byteLength });
      } catch (e) {
        log('导出失败: ' + e.message, 'err');
        if (hooks.onError) hooks.onError(e);
      }
    }

    async function doImport() {
      if (!fileInput) return;
      fileInput.onchange = async function () {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;
        try {
          log('正在解析: ' + f.name + ' (' + f.size + ' bytes)', 'info');
          const buf = await f.arrayBuffer();
          const parsed = await inspect(new Uint8Array(buf));
          const m = parsed.manifest;
          log('解析成功: ' + m.company + ' / ' + m.createdAt + ' / 分类 ' + m.contents.categories, 'ok');
          if (hooks.onInspect) {
            const ok = await hooks.onInspect(m, parsed.config);
            if (ok === false) { log('用户取消', 'warn'); return; }
          }
          await apply(parsed.config);
          log('已应用', 'ok');
          if (hooks.onApplied) hooks.onApplied(parsed);
        } catch (e) {
          log('导入失败: ' + e.message, 'err');
          if (hooks.onError) hooks.onError(e);
        }
        fileInput.value = '';
      };
      fileInput.click();
    }

    async function doRestore() {
      try {
        await restore();
        log('已恢复导入前设置', 'ok');
        if (hooks.onRestored) hooks.onRestored();
      } catch (e) {
        log('恢复失败: ' + e.message, 'err');
        if (hooks.onError) hooks.onError(e);
      }
    }

    rootEl.addEventListener('click', function (ev) {
      const btn = ev.target.closest('[data-ys-action]');
      if (!btn) return;
      const act = btn.getAttribute('data-ys-action');
      if (act === 'export') doExport();
      else if (act === 'import') doImport();
      else if (act === 'restore') doRestore();
    });
  }

  // ---- 导出 ----
  global.YSClone = Object.freeze({
    FORMAT: FORMAT,
    SCHEMA: SCHEMA,
    APP: APP,
    ALLOWED_MIN_VERSIONS: ALLOWED_MIN_VERSIONS,
    MANAGED_KEYS: MANAGED_KEYS,
    snapshot: snapshot,
    exportBytes: exportBytes,
    inspect: inspect,
    apply: apply,
    restore: restore,
    panelHTML: panelHTML,
    panelBind: panelBind,
    sha256: sha256
  });
})(typeof window !== 'undefined' ? window : globalThis);
