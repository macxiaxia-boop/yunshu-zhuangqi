// bjproj-parser.js — REF .bjproj → yunshu-zhuangqi ours 格式
// SSOT: /d/sandbox_quotation_system/docs/schema-extraction.md

'use strict';

const CATEGORY_MAP_REF_TO_OURS = {
  // 9 基装 + 1 附录 c10 → ours c01..c10
  c01: { id: 'c01', num: '01', en: 'MEASURES',         cn: '措施项目',         group: 'construction' },
  c02: { id: 'c02', num: '02', en: 'DEMOLITION',       cn: '拆除工程',         group: 'construction' },
  c03: { id: 'c03', num: '03', en: 'MASONRY',          cn: '砌筑工程',         group: 'construction' },
  c04: { id: 'c04', num: '04', en: 'MEP',              cn: '水电暖工程',       group: 'construction' },
  c10: { id: 'c10', num: '附', en: 'MEP UNIT PRICE',   cn: '水电暖施工单价表', group: 'construction', isAppendix: true },
  c05: { id: 'c05', num: '05', en: 'WATERPROOFING',    cn: '防水工程',         group: 'construction' },
  c06: { id: 'c06', num: '06', en: 'INSULATION',       cn: '保温隔热静音工程', group: 'construction' },
  c07: { id: 'c07', num: '07', en: 'TILING',           cn: '泥瓦工程',         group: 'construction' },
  c08: { id: 'c08', num: '08', en: 'CARPENTRY',        cn: '木作工程',         group: 'construction' },
  c09: { id: 'c09', num: '09', en: 'PAINTING',         cn: '涂饰工程',         group: 'construction' },
  // 15 主材 m01..m15
  m01: { id: 'm01', num: '01', en: 'MATERIAL', cn: '瓷砖',     group: 'material' },
  m02: { id: 'm02', num: '02', en: 'MATERIAL', cn: '石材',     group: 'material' },
  m03: { id: 'm03', num: '03', en: 'MATERIAL', cn: '地板',     group: 'material' },
  m04: { id: 'm04', num: '04', en: 'MATERIAL', cn: '门窗',     group: 'material' },
  m05: { id: 'm05', num: '05', en: 'MATERIAL', cn: '套装门',   group: 'material' },
  m06: { id: 'm06', num: '06', en: 'MATERIAL', cn: '全屋定制', group: 'material' },
  m07: { id: 'm07', num: '07', en: 'MATERIAL', cn: '五金',     group: 'material' },
  m08: { id: 'm08', num: '08', en: 'MATERIAL', cn: '卫浴',     group: 'material' },
  m09: { id: 'm09', num: '09', en: 'MATERIAL', cn: '开关插座', group: 'material' },
  m10: { id: 'm10', num: '10', en: 'MATERIAL', cn: '灯具',     group: 'material' },
  m11: { id: 'm11', num: '11', en: 'MATERIAL', cn: '智能家居', group: 'material' },
  m12: { id: 'm12', num: '12', en: 'MATERIAL', cn: '设备',     group: 'material' },
  m13: { id: 'm13', num: '13', en: 'MATERIAL', cn: '电器',     group: 'material' },
  m14: { id: 'm14', num: '14', en: 'MATERIAL', cn: '家具',     group: 'material' },
  m15: { id: 'm15', num: '15', en: 'MATERIAL', cn: '软装配饰', group: 'material' },
};

class BjprojParseError extends Error {
  constructor(message, code = 'BJPROP_PARSE_ERROR', details = {}) {
    super(message);
    this.name = 'BjprojParseError';
    this.code = code;
    this.details = details;
  }
}

const MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024; // 150MB
const SUPPORTED_VERSIONS = Array.from({ length: 17 }, (_, i) => i + 1); // REF 1..17

function genId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function decodeBufferAuto(buf) {
  if (buf == null) throw new BjprojParseError('Empty buffer', 'EMPTY_BUFFER');
  if (buf.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new BjprojParseError(
      `File too large: ${buf.byteLength} > ${MAX_FILE_SIZE_BYTES}`,
      'FILE_TOO_LARGE',
      { size: buf.byteLength, limit: MAX_FILE_SIZE_BYTES }
    );
  }
  // 去除 BOM
  let view = buf;
  let bomSkipped = false;
  if (buf.byteLength >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    view = buf.slice(3);
    bomSkipped = true;
  }
  // 尝试 UTF-8
  let decoded = new TextDecoder('utf-8', { fatal: true }).decode(view);
  if (!bomSkipped) {
    // 用 GBK 备份试探
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(view);
    } catch {
      decoded = new TextDecoder('gbk').decode(view);
    }
  }
  return decoded;
}

function normalizeField(refObj, oursObj, srcKey, dstKey, transform = (v) => v) {
  if (refObj && Object.prototype.hasOwnProperty.call(refObj, srcKey)) {
    oursObj[dstKey] = transform(refObj[srcKey]);
  }
}

function mapItem(refItem) {
  const isMaterial = refItem && refItem.kind === 'material';
  const item = {
    id: refItem.id || genId('item'),
    name: refItem.name || '',
    unit: refItem.unit || '项',
    price: refItem.price == null ? null : refItem.price,
    desc: refItem.desc || '',
    status: refItem.status || 'enabled',
    sourceSheet: refItem.sourceSheet || '',
    sourceRow: refItem.sourceRow || 0,
    qty: refItem.qty == null ? '' : refItem.qty,
  };
  if (isMaterial) {
    item.brand = refItem.brand || '';
    item.model = refItem.model || '';
    item.spec = refItem.spec || '';
  } else {
    item.laborCost = refItem.laborCost == null ? 0 : refItem.laborCost;
    item.materialCost = refItem.materialCost == null ? 0 : refItem.materialCost;
    item.auxiliaryCost = refItem.auxiliaryCost == null ? 0 : refItem.auxiliaryCost;
  }
  return item;
}

function mapCategory(refCat, warnings) {
  const mapped = CATEGORY_MAP_REF_TO_OURS[refCat.id];
  if (!mapped) {
    if (warnings) warnings.push(`未知分类 ID: ${refCat.id}`);
    return null;
  }
  if (refCat.id !== mapped.id && warnings) {
    warnings.push(`分类映射不一致: REF=${refCat.id}, ours=${mapped.id}`);
  }
  return {
    ...mapped,
    items: Array.isArray(refCat.items) ? refCat.items.map(mapItem) : [],
  };
}

function parseRefBjprojArrayBuffer(buf) {
  if (buf == null) throw new BjprojParseError('buf is required', 'MISSING_INPUT');
  const jsonText = decodeBufferAuto(buf);
  return parseRefBjproj(jsonText);
}

function parseRefBjproj(jsonText) {
  if (typeof jsonText !== 'string') {
    throw new BjprojParseError('jsonText must be a string', 'BAD_INPUT');
  }
  let ref;
  try {
    ref = JSON.parse(jsonText);
  } catch (e) {
    throw new BjprojParseError('Invalid JSON: ' + e.message, 'INVALID_JSON');
  }
  // 校验 fileType 与 version
  if (!ref || typeof ref !== 'object') {
    throw new BjprojParseError('REF payload must be an object', 'INVALID_STRUCTURE');
  }
  const fileType = ref.fileType || ref.file_type;
  if (fileType !== 'YUNSHANG_QUOTATION_PROJECT' && fileType !== 'YUNSHANG_QUOTE_PROJECT') {
    throw new BjprojParseError(
      `Invalid fileType: ${fileType} (expected YUNSHANG_QUOTATION_PROJECT/YUNSHANG_QUOTE_PROJECT)`,
      'INVALID_FILETYPE',
      { fileType }
    );
  }
  const version = ref.version || ref.formatVersion || 1;
  if (!SUPPORTED_VERSIONS.includes(version) && warnings.shouldWarn('version')) {
    // warn later
  }
  const warnings = [];
  warnings.shouldWarn = () => true;
  if (!SUPPORTED_VERSIONS.includes(Number(version))) {
    warnings.push(`未知 version=${version}, 已尽力兼容`);
  }
  if (!ref.data || typeof ref.data !== 'object') {
    throw new BjprojParseError('Missing data field', 'MISSING_DATA');
  }
  const projInfo = ref.data.projectInfo || {};
  const refCategories = Array.isArray(ref.data.categories) ? ref.data.categories : [];
  const refLibCategories = Array.isArray(ref.data.libCategories) ? ref.data.libCategories : [];
  // projectInfo 字段 1:1 复制
  const ourProjectInfo = { ...projInfo };
  // categories 映射
  const ourCategories = [];
  for (const cat of refCategories) {
    const mapped = mapCategory(cat, warnings);
    if (mapped) ourCategories.push(mapped);
  }
  // libCategories 映射
  const ourLibCategories = [];
  for (const cat of refLibCategories) {
    const lib = CATEGORY_MAP_REF_TO_OURS[cat.id];
    if (!lib) {
      warnings.push(`未知 libCategory ID: ${cat.id}`);
      continue;
    }
    ourLibCategories.push({
      ...lib,
      library: Array.isArray(cat.library) ? cat.library.slice() : [],
    });
  }
  return {
    fileType: 'YUNSHU_ZHUANGQI_QUOTE',
    formatVersion: 1,
    sourceMeta: {
      origin: 'ref',
      refFileType: fileType,
      refVersion: version,
    },
    data: {
      projectInfo: ourProjectInfo,
      categories: ourCategories,
      libCategories: ourLibCategories,
      changeOrders: [],
    },
    _warnings: warnings,
  };
}

module.exports = {
  parseRefBjproj,
  parseRefBjprojArrayBuffer,
  BjprojParseError,
  CATEGORY_MAP_REF_TO_OURS,
  MAX_FILE_SIZE_BYTES,
};
