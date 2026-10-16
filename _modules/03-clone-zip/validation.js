/* validation.js — 克隆配置字段白名单 + 类型校验 + 反原型链攻击
 * Zero dependencies. Module-scope only. Exposes window.YSCloneValidate.
 * 覆盖:
 *   - safeJSON (防 __proto__/constructor/prototype 污染 + 深度≤60)
 *   - settingsValid (51 字段白名单 + 财务数值≥0 + themeColor 白名单 + base64 logo/watermark)
 *   - libraryValid (fileType/version/categories/libraries/materialTables)
 *   - templateValid (清空工程信息,仅留 categories)
 *   - preferencesValid (5 个 preference keys)
 *   - validateLogoData / validateWatermarkImage / validateResourceFiles
 *   - validateAll (整体抛错)
 */
(function (global) {
  'use strict';

  // -------- 白名单 SSOT (与 REF clone-settings.js 对位) --------
  const FIELDS = (
    'companyName englishName companyPhone companyAddress companyWebsite logoData ' +
    'uiTitleCn uiTitleEn themeColor ' +
    'sidebarLogoColorMode coverLogoColorMode coverLogoScale ' +
    'materialPrintScope materialShowPrice materialShowPageNumbers ' +
    'materialShowHeader materialShowFooter materialHeaderText materialFooterText ' +
    'materialBookTitle materialBookNote materialSampleCaption ' +
    'watermarkEnabled watermarkType watermarkText1 watermarkText2 watermarkImage ' +
    'watermarkColor watermarkOpacity watermarkAngle watermarkScale watermarkX watermarkY ' +
    'watermarkFontSize watermarkLetterSpacing watermarkLineHeight ' +
    'watermarkWeight watermarkTextAlign watermarkTile ' +
    'notes baseMaterials waterHeatingAppendixPrint ' +
    'managementFeeRate materialServiceFeeRate taxRate designRate discountRate'
  ).split(' ');

  const FINANCIAL = new Set([
    'managementFeeRate', 'materialServiceFeeRate', 'taxRate', 'designRate', 'discountRate'
  ]);

  const PREFERENCES = [
    'ys_studio_ui_v31_density',
    'ys_studio_ui_v31_color_mode',
    'ys_cloud_light_skin_v1',
    'ys-almanac-display-v1',
    'smart_quota_sources'
  ];

  // 6 主题 (yunshu-zhuangqi 主色 — 与 THEMES=red/navy/turquoise/ochre/purple/lilac 对位)
  const THEMES = new Set(['red', 'navy', 'turquoise', 'ochre', 'purple', 'lilac']);

  // 3 库分组 (与 schema-extraction.md Section 5 对位)
  const LIBRARY_GROUPS = new Set(['construction', 'material', 'equipment']);

  // 反原型链污染关键字段
  const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  // logo / watermark base64 格式正则
  const LOGO_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\r\n]+$/i;
  const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

  // 单资源文件大小 25MB
  const MAX_RESOURCE_BYTES = 25 * 1024 * 1024;
  // 配置主体 40MB
  const MAX_CONFIG_BYTES = 40 * 1024 * 1024;
  // ZIP 包 45MB
  const MAX_ZIP_BYTES = 45 * 1024 * 1024;
  // 资源文件数 200
  const MAX_RESOURCE_FILES = 200;
  // 配置深度 ≤ 60
  const MAX_DEPTH = 60;

  // -------- safeJSON: 防原型链污染 + 深度限制 --------
  function safeJSON(value, depth) {
    if (depth === undefined) depth = 0;
    if (depth > MAX_DEPTH) throw new Error('配置结构层级过深 (>60)');
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new Error('配置数字无效');
      }
      return;
    }
    // 数组
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        safeJSON(value[i], depth + 1);
      }
      return;
    }
    // 对象 — 必须 own property,不能是 __proto__ 等
    for (const k of Object.keys(value)) {
      if (PROTO_KEYS.has(k)) throw new Error('配置包含非法字段: ' + k);
      safeJSON(value[k], depth + 1);
    }
  }

  // -------- settingsValid: 51 字段白名单 + 财务数值 + themeColor --------
  function settingsValid(s) {
    if (!s || Array.isArray(s) || typeof s !== 'object') {
      throw new Error('系统设置无效');
    }
    for (const k of Object.keys(s)) {
      if (!FIELDS.includes(k)) throw new Error('不支持的设置字段: ' + k);
      const v = s[k];
      // logoData / watermarkImage: base64 格式
      if ((k === 'logoData' || k === 'watermarkImage') && v != null) {
        if (typeof v !== 'string' || !LOGO_RE.test(v)) {
          throw new Error('Logo/水印必须是内嵌图片 (data:image/(png|jpe?g|gif|webp);base64,...): ' + k);
        }
      }
      // financial: 数值 >= 0
      if (FINANCIAL.has(k)) {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) {
          throw new Error('默认费率无效 (>= 0): ' + k + '=' + String(v));
        }
      }
      // themeColor: 白名单
      if (k === 'themeColor' && v != null && !THEMES.has(v)) {
        throw new Error('主题色不受此版本支持: ' + String(v));
      }
      // baseMaterials: array
      if (k === 'baseMaterials' && v != null) {
        if (!Array.isArray(v)) throw new Error('基装材料表必须是数组');
      }
      // 其它字段: 标量或 null (不能是 object)
      else if (v !== null && typeof v === 'object') {
        throw new Error('设置字段类型无效 (期望标量): ' + k);
      }
    }
  }

  // -------- libraryValid: fileType/version/categories/libraries/materialTables --------
  function libraryValid(lib) {
    if (!lib || typeof lib !== 'object') throw new Error('定额库无效');
    if (lib.fileType !== 'YUNSHANG_QUOTA_LIBRARY') {
      throw new Error('定额库 fileType 必须为 YUNSHANG_QUOTA_LIBRARY');
    }
    if (lib.version !== 1) throw new Error('定额库 version 必须为 1');
    if (!Array.isArray(lib.categories)) throw new Error('定额库缺 categories');
    if (!Array.isArray(lib.libraries)) throw new Error('定额库缺 libraries');
    if (!Array.isArray(lib.materialTables)) throw new Error('定额库缺 materialTables');
    // categories 内层校验
    const ids = new Set();
    for (const c of lib.categories) {
      if (!c || typeof c !== 'object') throw new Error('定额分类不是对象');
      if (typeof c.id !== 'string' || !c.id) throw new Error('定额分类 id 缺失');
      if (ids.has(c.id)) throw new Error('定额分类 id 重复: ' + c.id);
      ids.add(c.id);
      if (typeof c.cn !== 'string') throw new Error('定额分类 cn 缺失: ' + c.id);
      const group = c.libraryType || c.group;
      if (!group || !LIBRARY_GROUPS.has(group)) {
        throw new Error('定额分类 libraryType/group 不在白名单: ' + c.id + '=' + String(group));
      }
      if (!Array.isArray(c.library)) throw new Error('定额分类 library 不是数组: ' + c.id);
      for (const r of c.library) {
        if (!r || typeof r !== 'object') throw new Error('定额条目无效');
        if (typeof r.name !== 'string') throw new Error('定额名称必须为字符串');
        if (r.price !== undefined && r.price !== '' && r.price !== null) {
          const n = Number(r.price);
          if (!Number.isFinite(n) || n < 0) throw new Error('定额单价无效: ' + r.name);
        }
      }
    }
  }

  // -------- templateValid: 模板只保留 categories,工程信息必须清空 --------
  function templateValid(t) {
    if (t == null) return; // optional
    if (!t || typeof t !== 'object') throw new Error('模板不是对象');
    if (!Array.isArray(t.categories)) throw new Error('模板 categories 缺失');
    // 工程信息字段必须不存在 (name/code/ownerName 等)
    const forbidden = ['name', 'code', 'ownerName', 'projectAddress', 'date', 'author', 'checker', 'email', 'designArea'];
    for (const f of forbidden) {
      if (t[f] !== undefined && t[f] !== '' && t[f] !== 0) {
        throw new Error('模板包含工程信息: ' + f);
      }
    }
    // projectInfo 必须为空对象或不存在
    if (t.projectInfo) {
      for (const f of forbidden) {
        if (t.projectInfo[f] !== undefined && t.projectInfo[f] !== '' && t.projectInfo[f] !== 0) {
          throw new Error('模板 projectInfo 含工程信息: ' + f);
        }
      }
    }
  }

  // -------- preferencesValid --------
  function preferencesValid(prefs) {
    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) {
      throw new Error('preferences 不是对象');
    }
    for (const k of Object.keys(prefs)) {
      if (!PREFERENCES.includes(k)) throw new Error('不支持的 preference: ' + k);
      const v = prefs[k];
      if (v !== null && typeof v !== 'string') throw new Error('preference 值必须为 string|null: ' + k);
    }
  }

  // -------- validateLogoData / validateWatermarkImage --------
  function validateLogoData(v) {
    if (v == null) return true;
    if (typeof v !== 'string') throw new Error('logoData 类型错误');
    if (!LOGO_RE.test(v)) throw new Error('logoData 格式错误 (需 data:image/(png|jpe?g|gif|webp);base64,...)');
    return true;
  }

  function validateWatermarkImage(v) {
    return validateLogoData(v);
  }

  // -------- validateResourceFiles --------
  function validateResourceFiles(arr) {
    if (arr === undefined || arr === null) return;
    if (!Array.isArray(arr)) throw new Error('resourceFiles 不是数组');
    if (arr.length > MAX_RESOURCE_FILES) throw new Error('resourceFiles 超过 200');
    const seen = new Set();
    for (const f of arr) {
      if (!f || typeof f !== 'object') throw new Error('resourceFile 无效');
      if (f.kind !== 'quota' && f.kind !== 'logo') throw new Error('resourceFile kind 不在白名单 (quota/logo)');
      if (typeof f.name !== 'string' || !f.name) throw new Error('resourceFile name 缺失');
      // 路径安全: Windows 不允许字符
      if (/[\\/:*?"<>|]/.test(f.name)) throw new Error('resourceFile name 含非法字符: ' + f.name);
      if (typeof f.base64 !== 'string' || !BASE64_RE.test(f.base64)) {
        throw new Error('resourceFile base64 格式错误: ' + f.name);
      }
      // 解码大小估算 (base64 → bytes: len * 3/4)
      const estBytes = Math.floor(f.base64.length * 3 / 4);
      if (estBytes > MAX_RESOURCE_BYTES) {
        throw new Error('resourceFile 超过 25MB: ' + f.name);
      }
      const key = f.kind + '/' + f.name.toLowerCase();
      if (seen.has(key)) throw new Error('resourceFile 重名: ' + key);
      seen.add(key);
    }
  }

  // -------- validateAll: 整体校验抛错 --------
  function validateAll(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('config 不是对象');
    }
    // 顶层 5 字段白名单
    const allowed = ['settings', 'library', 'template', 'preferences', 'resourceFiles'];
    for (const k of Object.keys(config)) {
      if (!allowed.includes(k)) throw new Error('config 含未知顶层字段: ' + k);
    }
    safeJSON(config);
    if (!config.settings) throw new Error('config.settings 缺失');
    settingsValid(config.settings);
    if (!config.library) throw new Error('config.library 缺失');
    libraryValid(config.library);
    templateValid(config.template);
    preferencesValid(config.preferences);
    validateResourceFiles(config.resourceFiles);
    return config;
  }

  // -------- 导出 --------
  global.YSCloneValidate = Object.freeze({
    FIELDS: FIELDS,
    FINANCIAL: FINANCIAL,
    PREFERENCES: PREFERENCES,
    THEMES: THEMES,
    LIBRARY_GROUPS: LIBRARY_GROUPS,
    PROTO_KEYS: PROTO_KEYS,
    LOGO_RE: LOGO_RE,
    BASE64_RE: BASE64_RE,
    MAX_DEPTH: MAX_DEPTH,
    MAX_CONFIG_BYTES: MAX_CONFIG_BYTES,
    MAX_ZIP_BYTES: MAX_ZIP_BYTES,
    MAX_RESOURCE_BYTES: MAX_RESOURCE_BYTES,
    MAX_RESOURCE_FILES: MAX_RESOURCE_FILES,
    safeJSON: safeJSON,
    settingsValid: settingsValid,
    libraryValid: libraryValid,
    templateValid: templateValid,
    preferencesValid: preferencesValid,
    validateLogoData: validateLogoData,
    validateWatermarkImage: validateWatermarkImage,
    validateResourceFiles: validateResourceFiles,
    validateAll: validateAll
  });
})(typeof window !== 'undefined' ? window : globalThis);
