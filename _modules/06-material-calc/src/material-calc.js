// material-calc.js — 工料分项计算 (3 字段 + 5 费率)
// 主库: Node CommonJS + browser window.MaterialCalc 兼容

'use strict';

class MaterialCalcError extends Error {
  constructor(message, code = 'MATERIAL_CALC_ERROR', details = {}) {
    super(message);
    this.name = 'MaterialCalcError';
    this.code = code;
    this.details = details;
  }
}

// ===== 常量 =====
const MODES = ['auto', 'manual', 'lock'];

const DEFAULT_FEE_TABLE = Object.freeze({
  management:    { rate: 5,   base: 'sum_construction',         apply: 'total' },
  taxRate:       { rate: 3,   base: 'subtotal_with_management', apply: 'total' },
  materialService:{ rate: 5,  base: 'sum_material',             apply: 'material_subtotal' },
  design:        { rate: 80,  base: 'designArea',               apply: 'fixed' },
  discount:      { rate: 100, base: 'total',                    apply: 'multiplier' },
});

// ===== 内部工具 =====
function toFinite(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  const s = String(v).trim();
  if (s === '') return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function requireNonNeg(n, name) {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new MaterialCalcError(`${name} 必须是数字, got: ${n}`, 'INVALID_NUMBER', { name, value: n });
  }
  if (n < 0) {
    throw new MaterialCalcError(`${name} 不能为负, got: ${n}`, 'NEGATIVE_VALUE', { name, value: n });
  }
  return n;
}

// ===== 1) 3 字段求和 =====
function calcComposite({ laborCost, materialCost, auxiliaryCost } = {}) {
  const l = requireNonNeg(toFinite(laborCost, 0),    'laborCost');
  const m = requireNonNeg(toFinite(materialCost, 0), 'materialCost');
  const a = requireNonNeg(toFinite(auxiliaryCost, 0),'auxiliaryCost');
  // 保留 2 位小数避免浮点
  return Math.round((l + m + a) * 100) / 100;
}

// ===== 2) 三种模式 =====

// auto: 用户改任意 1/2/3 字段 → 自动重算 compositePrice
function calcModeAuto(item, patch = {}) {
  const merged = Object.assign({}, item, patch);
  // 容忍 null/NaN → 0
  merged.laborCost     = toFinite(merged.laborCost, 0);
  merged.materialCost  = toFinite(merged.materialCost, 0);
  merged.auxiliaryCost = toFinite(merged.auxiliaryCost, 0);
  // 校验
  if (merged.laborCost < 0 || merged.materialCost < 0 || merged.auxiliaryCost < 0) {
    throw new MaterialCalcError('auto 模式禁止负值', 'NEGATIVE_VALUE');
  }
  merged.compositePrice = calcComposite(merged);
  merged.compositeAuto = true;
  return merged;
}

// manual: 用户改 compositePrice → 按比例反推 3 字段
function calcModeManual(item, patch = {}) {
  const merged = Object.assign({}, item, patch);
  // 只在用户改了 compositePrice 时才分配
  if (patch.compositePrice === undefined) {
    return merged;
  }
  const oldSum = calcComposite({
    laborCost: item.laborCost,
    materialCost: item.materialCost,
    auxiliaryCost: item.auxiliaryCost,
  });
  const newTotal = toFinite(merged.compositePrice, 0);
  if (oldSum === 0) {
    // 等分兜底
    merged.laborCost = Math.round((newTotal / 3) * 100) / 100;
    merged.materialCost = Math.round((newTotal / 3) * 100) / 100;
    merged.auxiliaryCost = Math.round((newTotal - merged.laborCost - merged.materialCost) * 100) / 100;
  } else {
    const ratio = newTotal / oldSum;
    merged.laborCost = Math.round(item.laborCost * ratio * 100) / 100;
    merged.materialCost = Math.round(item.materialCost * ratio * 100) / 100;
    merged.auxiliaryCost = Math.round((newTotal - merged.laborCost - merged.materialCost) * 100) / 100;
  }
  merged.compositePrice = newTotal;
  merged.compositeAuto = false;
  return merged;
}

// lock: 3 字段锁定, 仅 compositePrice 编辑
function calcModeLock(item, patch = {}) {
  const merged = Object.assign({}, item, patch);
  merged.laborCost = item.laborCost;
  merged.materialCost = item.materialCost;
  merged.auxiliaryCost = item.auxiliaryCost;
  merged.compositePrice = toFinite(merged.compositePrice, 0);
  merged.compositeAuto = false;
  return merged;
}

function processItem(item, patch = {}, mode = 'auto') {
  if (!MODES.includes(mode)) {
    throw new MaterialCalcError(`未知模式: ${mode}`, 'INVALID_MODE', { mode });
  }
  switch (mode) {
    case 'auto':   return calcModeAuto(item, patch);
    case 'manual': return calcModeManual(item, patch);
    case 'lock':   return calcModeLock(item, patch);
  }
}

// ===== 3) feeTable / calcTotal =====

// 展平分类 → 项目列表
function flattenCategories(categories) {
  if (!Array.isArray(categories)) return [];
  const out = [];
  for (const cat of categories) {
    const items = Array.isArray(cat.items) ? cat.items : [];
    for (const it of items) {
      out.push(Object.assign({ categoryGroup: cat.group || 'construction' }, it));
    }
  }
  return out;
}

// 直接喂 items 列表(含 categoryGroup / isMaterial)
function calcTotal(itemsOrCategories, feeTable = DEFAULT_FEE_TABLE, options = {}) {
  const fee = mergeFeeTable(feeTable);
  const list = Array.isArray(itemsOrCategories) && itemsOrCategories.length > 0 && itemsOrCategories[0] && Array.isArray(itemsOrCategories[0].items)
    ? flattenCategories(itemsOrCategories)
    : (Array.isArray(itemsOrCategories) ? itemsOrCategories : []);

  let constructionSum = 0;
  let materialSum = 0;
  for (const it of list) {
    const line = (Number(toFinite(it.qty, 0))) * (Number(toFinite(it.price, 0)));
    if (it.categoryGroup === 'material' || it.isMaterial === true) {
      materialSum += line;
    } else {
      constructionSum += line;
    }
  }

  const mgmtFee = round2(constructionSum * fee.management.rate / 100);
  const subtotalWithMgmt = constructionSum + mgmtFee;
  const taxFee = round2(subtotalWithMgmt * fee.taxRate.rate / 100);
  const matlService = round2(materialSum * fee.materialService.rate / 100);
  const designArea = Number(toFinite(options.designArea, 0));
  const designFee = round2(fee.design.rate * designArea);

  const preDiscountTotal = subtotalWithMgmt + taxFee + matlService + designFee;
  const discountMultiplier = fee.discount.rate / 100;
  const total = round2(preDiscountTotal * discountMultiplier);

  return {
    constructionSum: round2(constructionSum),
    materialSum: round2(materialSum),
    mgmtFee,
    taxFee,
    matlService,
    designFee,
    discount: fee.discount.rate,
    total,
  };
}

function mergeFeeTable(partial) {
  const merged = {};
  for (const k of Object.keys(DEFAULT_FEE_TABLE)) {
    merged[k] = Object.assign({}, DEFAULT_FEE_TABLE[k], partial && partial[k] ? partial[k] : {});
    merged[k].rate = toFinite(merged[k].rate, DEFAULT_FEE_TABLE[k].rate);
  }
  return merged;
}

function round2(n) { return Math.round(n * 100) / 100; }

// ===== 4) 校验 =====

function validateItem(item) {
  const result = { status: 'ok', warnings: [] };
  if (!item || typeof item !== 'object') {
    result.status = 'invalid';
    result.warnings.push('item must be object');
    return result;
  }
  if (!item.unit || String(item.unit).trim() === '') {
    result.status = 'pending';
    result.warnings.push('missing unit');
  }
  const price = toFinite(item.price, NaN);
  if (!Number.isFinite(price) || price <= 0) {
    result.status = 'pending';
    result.warnings.push('missing or non-positive price');
  }
  return result;
}

function checkUnitConflict(name, unit, seenMap) {
  if (!seenMap) seenMap = new Map();
  if (!seenMap.has(name)) seenMap.set(name, new Set());
  const set = seenMap.get(name);
  const prev = Array.from(set);
  set.add(unit);
  const conflict = prev.length > 0 && !prev.includes(unit);
  return {
    conflict,
    previous: prev,
    current: unit,
    name,
    warning: conflict ? `单位冲突: ${name} 之前=${prev.join('|')} 现在=${unit}` : null,
  };
}

// ===== 5) 导出 / 浏览器全局 =====

const api = {
  calcComposite,
  calcModeAuto,
  calcModeManual,
  calcModeLock,
  processItem,
  calcTotal,
  mergeFeeTable,
  flattenCategories,
  validateItem,
  checkUnitConflict,
  DEFAULT_FEE_TABLE,
  MODES,
  MaterialCalcError,
  toFinite,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.MaterialCalc = api;
}