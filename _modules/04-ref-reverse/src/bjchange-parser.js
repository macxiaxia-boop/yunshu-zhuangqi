// bjchange-parser.js — REF .bjchange → yunshu-zhuangqi ours 增减项格式
// REF payload: {fileType:'QUOTE_CHANGE_ORDERS', formatVersion:1, savedAt, project:{name,code}, rows:[...]}

'use strict';

class BjchangeParseError extends Error {
  constructor(message, code = 'BJCHANGE_PARSE_ERROR', details = {}) {
    super(message);
    this.name = 'BjchangeParseError';
    this.code = code;
    this.details = details;
  }
}

const VALID_KINDS = new Set(['add', 'remove']);
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

function genId() {
  return `change-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toFiniteNumber(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  const s = String(v).trim().replace(/,/g, '');
  if (s === '') return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRow(refRow, existingIds) {
  if (!refRow || typeof refRow !== 'object') {
    throw new BjchangeParseError('Row must be an object', 'INVALID_ROW');
  }
  if (!VALID_KINDS.has(refRow.kind)) {
    throw new BjchangeParseError(
      `kind must be 'add' or 'remove', got: ${refRow.kind}`,
      'INVALID_KIND',
      { kind: refRow.kind }
    );
  }
  // 档案 ID 重生成(防止冲突)
  let id = refRow.id;
  if (!id || existingIds.has(id)) {
    id = genId();
  }
  existingIds.add(id);
  return {
    id,
    kind: refRow.kind,
    name: refRow.name || '',
    unit: refRow.unit || '项',
    qty: toFiniteNumber(refRow.qty, 0),
    price: toFiniteNumber(refRow.price, 0),
    note: refRow.note || '',
  };
}

function parseRefBjchange(jsonText) {
  if (typeof jsonText !== 'string') {
    throw new BjchangeParseError('jsonText must be a string', 'BAD_INPUT');
  }
  if (jsonText.length > MAX_FILE_SIZE_BYTES) {
    throw new BjchangeParseError(
      `Text too large: ${jsonText.length} > ${MAX_FILE_SIZE_BYTES}`,
      'TEXT_TOO_LARGE'
    );
  }
  let ref;
  try {
    ref = JSON.parse(jsonText);
  } catch (e) {
    throw new BjchangeParseError('Invalid JSON: ' + e.message, 'INVALID_JSON');
  }
  if (!ref || typeof ref !== 'object') {
    throw new BjchangeParseError('Payload must be an object', 'INVALID_STRUCTURE');
  }
  if (ref.fileType !== 'QUOTE_CHANGE_ORDERS') {
    throw new BjchangeParseError(
      `Invalid fileType: ${ref.fileType} (expected QUOTE_CHANGE_ORDERS)`,
      'INVALID_FILETYPE',
      { fileType: ref.fileType }
    );
  }
  const rows = Array.isArray(ref.rows) ? ref.rows : [];
  const existingIds = new Set();
  const normalized = rows.map((r) => normalizeRow(r, existingIds));
  return {
    fileType: 'YUNSHU_ZHUANGQI_CHANGE_ORDERS',
    formatVersion: 1,
    savedAt: ref.savedAt || new Date().toISOString(),
    project: {
      name: (ref.project && ref.project.name) || '',
      code: (ref.project && ref.project.code) || '',
    },
    rows: normalized,
  };
}

function toOursBjchange(ref) {
  // 兼容: 既接受 parseRefBjchange 的输出,也接受原始 ref 对象
  if (!ref) throw new BjchangeParseError('ref is required', 'MISSING_INPUT');
  if (ref.fileType === 'YUNSHU_ZHUANGQI_CHANGE_ORDERS' && Array.isArray(ref.rows)) {
    return ref;
  }
  return parseRefBjchange(typeof ref === 'string' ? ref : JSON.stringify(ref));
}

module.exports = {
  parseRefBjchange,
  toOursBjchange,
  BjchangeParseError,
  VALID_KINDS,
  MAX_FILE_SIZE_BYTES,
};
