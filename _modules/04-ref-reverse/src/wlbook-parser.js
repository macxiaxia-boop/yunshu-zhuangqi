// wlbook-parser.js — REF .wlbook → yunshu-zhuangqi ours 物料全书格式
// REF wlbook: 5 类 (材料/洁具/灯具/五金/开关面板)

'use strict';

class WlbookParseError extends Error {
  constructor(message, code = 'WLBOOK_PARSE_ERROR', details = {}) {
    super(message);
    this.name = 'WlbookParseError';
    this.code = code;
    this.details = details;
  }
}

const CATEGORY_KEYWORDS = [
  { oursKey: 'material', refKeys: ['材料', 'material', '主材', 'materials'] },
  { oursKey: 'jianJu',   refKeys: ['洁具', 'jianju', '卫浴', 'bathroom'] },
  { oursKey: 'light',    refKeys: ['灯具', 'light', '灯', 'lighting'] },
  { oursKey: 'fiveGold', refKeys: ['五金', 'fivegold', 'hardware'] },
  { oursKey: 'switch',   refKeys: ['开关面板', 'switch', '面板', 'switchpanel'] },
];

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

const IMAGE_PREFIX_RX = /^data:image\/(png|jpe?g|gif|webp);base64,/i;

function detectCategory(name) {
  if (!name) return 'material';
  const low = String(name).toLowerCase();
  for (const k of CATEGORY_KEYWORDS) {
    if (k.refKeys.some((rk) => low.includes(rk.toLowerCase()))) {
      return k.oursKey;
    }
  }
  return 'material';
}

function genId() {
  return `mat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function validateBase64Image(v) {
  if (v == null || v === '') return '';
  const s = String(v);
  if (!IMAGE_PREFIX_RX.test(s)) {
    throw new WlbookParseError(
      `Image must be data:image/(png|jpe?g|gif|webp);base64,... format, got: ${s.slice(0, 32)}...`,
      'INVALID_IMAGE_FORMAT',
      { prefix: s.slice(0, 32) }
    );
  }
  // 仅检查前缀完整性,数据部分不强校验(过大会被 GBK 解码独立超时)
  return s;
}

function normalizeMaterial(refMat) {
  const rawCat = refMat.category || detectCategory(refMat.group || refMat.name || '');
  // 把 REF 中文 / 英文类别归一化为 ours 5 类 key
  let cat = 'material';
  for (const k of CATEGORY_KEYWORDS) {
    if (k.refKeys.some((rk) => String(rawCat).toLowerCase() === rk.toLowerCase())) {
      cat = k.oursKey;
      break;
    }
  }
  return {
    id: refMat.id || genId(),
    category: cat,
    name: refMat.name || '',
    brand: refMat.brand || '',
    model: refMat.model || '',
    spec: refMat.spec || '',
    supplier: refMat.supplier || '',
    image: validateBase64Image(refMat.image),
    remark: refMat.remark || refMat.note || '',
  };
}

function parseRefWlbook(jsonText) {
  if (typeof jsonText !== 'string') {
    throw new WlbookParseError('jsonText must be a string', 'BAD_INPUT');
  }
  if (jsonText.length > MAX_FILE_SIZE_BYTES) {
    throw new WlbookParseError(
      `Text too large: ${jsonText.length}`,
      'TEXT_TOO_LARGE'
    );
  }
  let ref;
  try {
    ref = JSON.parse(jsonText);
  } catch (e) {
    throw new WlbookParseError('Invalid JSON: ' + e.message, 'INVALID_JSON', { original: e.message });
  }
  if (!ref || typeof ref !== 'object') {
    throw new WlbookParseError('Payload must be an object', 'INVALID_STRUCTURE');
  }
  // 容许多种 fileType: WLBOOK / YUNSHANG_MATERIAL_BOOK / null
  if (ref.fileType && ref.fileType !== 'YUNSHANG_MATERIAL_BOOK' && ref.fileType !== 'WLBOOK') {
    // 警告: 不是 fatal, 但记录在 _warnings
  }
  const materials = Array.isArray(ref.materials) ? ref.materials : [];
  const byCategory = {
    material: [], jianJu: [], light: [], fiveGold: [], switch: [],
  };
  for (const m of materials) {
    const norm = normalizeMaterial(m);
    byCategory[norm.category] = byCategory[norm.category] || [];
    byCategory[norm.category].push(norm);
  }
  // ours 是单类结构,所以打散成统一的 ours.materials 数组 + 类别映射
  const flat = [];
  for (const arr of Object.values(byCategory)) {
    for (const m of arr) flat.push(m);
  }
  return {
    fileType: 'YUNSHU_ZHUANGQI_MATERIAL_BOOK',
    formatVersion: 1,
    savedAt: ref.savedAt || new Date().toISOString(),
    byCategory,
    materials: flat,
  };
}

module.exports = {
  parseRefWlbook,
  WlbookParseError,
  detectCategory,
  validateBase64Image,
  CATEGORY_KEYWORDS,
  MAX_FILE_SIZE_BYTES,
};
