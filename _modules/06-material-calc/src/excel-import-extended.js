// excel-import-extended.js — 扩充的 Excel/CSV/TSV 解析 (工料分项增强)
// 纯原生 JS, 无 SheetJS 依赖;CSV/TSV 直接解析,XLSX 待后续扩展

'use strict';

const ALIASES = Object.freeze({
  name:           ['名称', '项目名称', '项目名称及备注', '材料名称', 'Item', 'Name', '项目'],
  unit:           ['单位', 'Unit', '计量单位'],
  price:          ['综合单价', '单价', '综合取费', 'Price', 'Unit Price', '单价(元)', '综合价'],
  desc:           ['施工工艺说明', '备注工艺', '备注', '项目特征描述', 'Description', 'Desc', '工艺'],
  brand:          ['品牌', 'Brand'],
  model:          ['型号', 'Model'],
  spec:           ['规格', 'Spec', 'Specifications'],
  qty:            ['数量', 'Qty', 'Quantity', '工程量'],
  laborCost:      ['人工费', 'Labor', 'LaborCost', '人工'],
  materialCost:   ['材料费', 'Material', 'MaterialCost', '主材费', '材料'],
  auxiliaryCost:  ['辅料费', 'Auxiliary', 'AuxiliaryCost', '辅材费', '辅料'],
  compositePrice: ['综合单价', '合计', 'Total', '小计', 'TotalPrice'],
});

// 反向查找表: 别名 → 字段
const ALIAS_LOOKUP = (function build() {
  const m = new Map();
  for (const [field, list] of Object.entries(ALIASES)) {
    for (const a of list) m.set(a.toLowerCase().trim(), field);
  }
  return m;
})();

function getAliasesList() {
  const seen = new Set();
  const out = [];
  for (const list of Object.values(ALIASES)) {
    for (const a of list) {
      const k = a.toLowerCase().trim();
      if (!seen.has(k)) { seen.add(k); out.push(a); }
    }
  }
  return out;
}

// ===== CSV/TSV 解析 (RFC 4180 简化版, 支持引号转义) =====

function detectDelimiter(text) {
  const sample = text.slice(0, 4096);
  const tabs = (sample.match(/\t/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  if (tabs > commas) return '\t';
  return ',';
}

function parseDelimited(text, delimiter) {
  if (typeof text !== 'string') throw new TypeError('parseDelimited: text must be string');
  const d = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === d) { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); cur = ''; rows.push(row); row = []; }
      else if (ch === '\r') { /* skip */ }
      else cur += ch;
    }
  }
  if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

// ===== 公式检测 =====

function detectFormula(cell) {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'number') return null;
  const s = String(cell).trim();
  if (s === '') return null;
  if (s.startsWith('=')) return { formula: s, type: 'excel_expr' };
  const sumRange = s.match(/^SUM\(([A-Z]+\d+):([A-Z]+\d+)\)$/i);
  if (sumRange) return { formula: s, type: 'sum_range', range: [sumRange[1], sumRange[2]] };
  const cells = s.match(/^([A-Z]+\d+)([+\-*/][A-Z]+\d+)+$/);
  if (cells) return { formula: s, type: 'cells' };
  return null;
}

// 同一行内已有 laborCost/materialCost/auxiliaryCost → 重算 compositePrice
function recomputeFromRow(item) {
  const l = Number(item.laborCost) || 0;
  const m = Number(item.materialCost) || 0;
  const a = Number(item.auxiliaryCost) || 0;
  if (l + m + a > 0) {
    item.compositePrice = Math.round((l + m + a) * 100) / 100;
    item.compositeAuto = true;
    item._formulaDetected = true;
  }
  return item;
}

// ===== 单行 → item =====

function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function rowToItem(header, row) {
  const item = {
    name: '',
    unit: '',
    qty: 0,
    price: 0,
    compositePrice: 0,
    laborCost: 0,
    materialCost: 0,
    auxiliaryCost: 0,
    compositeAuto: true,
    desc: '',
    brand: '',
    model: '',
    spec: '',
    _status: 'ok',
    _warnings: [],
  };
  let priceFormulaDetected = false;
  for (let i = 0; i < header.length; i++) {
    const raw = header[i];
    if (raw === undefined || raw === null) continue;
    const field = ALIAS_LOOKUP.get(String(raw).toLowerCase().trim());
    if (!field) continue;
    const cell = row[i];
    if (field === 'compositePrice' || field === 'price') {
      const f = detectFormula(cell);
      if (f) {
        priceFormulaDetected = true;
        // 不解析具体单元格值(无 Excel 引擎),仅标记
        item._formulaDetected = f.type;
        continue;
      }
      item[field] = toNumber(cell);
    } else if (field === 'qty' || field === 'laborCost' || field === 'materialCost' || field === 'auxiliaryCost') {
      item[field] = toNumber(cell);
    } else {
      item[field] = cell === null || cell === undefined ? '' : String(cell).trim();
    }
  }

  // 若 price 列检测到公式,且 3 字段有值 → 重算 compositePrice
  if (priceFormulaDetected && (item.laborCost || item.materialCost || item.auxiliaryCost)) {
    recomputeFromRow(item);
  } else if (item.laborCost || item.materialCost || item.auxiliaryCost) {
    // 即便没检测到公式,有 3 字段也优先重算
    recomputeFromRow(item);
  } else {
    // 否则把 price 当 compositePrice
    item.compositePrice = item.price;
    item.compositeAuto = false;
  }

  // 校验
  if (!item.unit) item._status = 'pending';
  if (!item.price || item.price <= 0) item._status = 'pending';
  if (item.name === '') item._status = 'pending';

  return item;
}

// ===== 整表解析 =====

function importExcel(text, opts = {}) {
  const delimiter = opts.delimiter || null;
  const rows = parseDelimited(text, delimiter);
  if (rows.length === 0) return { header: [], items: [], stats: { totalRows: 0, matched: 0 } };
  const header = rows[0];
  const items = [];
  let matched = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].every((c) => String(c).trim() === '')) continue;
    const it = rowToItem(header, rows[i]);
    // 至少命中一个字段
    if (it.name || it.unit || it.price) {
      items.push(it);
      matched++;
    }
  }
  return {
    header,
    items,
    stats: { totalRows: rows.length - 1, matched, formulaDetected: items.filter((i) => i._formulaDetected).length },
  };
}

// 浏览器 <input type="file"> → Promise<text>
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('no file'));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsText(file, 'utf-8');
  });
}

const api = {
  ALIASES,
  getAliasesList,
  detectDelimiter,
  parseDelimited,
  detectFormula,
  recomputeFromRow,
  rowToItem,
  importExcel,
  readFileAsText,
  toNumber,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.ExcelImportExtended = api;