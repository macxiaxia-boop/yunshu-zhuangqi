// index.js — 模块统一入口
'use strict';

const calc = require('./material-calc');
const excel = require('./excel-import-extended');

module.exports = {
  // 工料分项核心
  calcComposite:    calc.calcComposite,
  calcModeAuto:     calc.calcModeAuto,
  calcModeManual:   calc.calcModeManual,
  calcModeLock:     calc.calcModeLock,
  processItem:      calc.processItem,
  calcTotal:        calc.calcTotal,
  mergeFeeTable:    calc.mergeFeeTable,
  flattenCategories:calc.flattenCategories,
  validateItem:     calc.validateItem,
  checkUnitConflict:calc.checkUnitConflict,
  DEFAULT_FEE_TABLE:calc.DEFAULT_FEE_TABLE,
  MODES:            calc.MODES,
  MaterialCalcError:calc.MaterialCalcError,
  toFinite:         calc.toFinite,

  // Excel 扩充
  importExcel:      excel.importExcel,
  parseDelimited:   excel.parseDelimited,
  detectDelimiter:  excel.detectDelimiter,
  detectFormula:    excel.detectFormula,
  rowToItem:        excel.rowToItem,
  ALIASES:        excel.ALIASES,
  getAliasesList:   excel.getAliasesList,
  readFileAsText:   excel.readFileAsText,

  // 浏览器兼容 (window 友好)
  YunshuMaterialCalc: {
    processItem:    calc.processItem,
    calcComposite:  calc.calcComposite,
    calcTotal:      calc.calcTotal,
    DEFAULT_FEE_TABLE: calc.DEFAULT_FEE_TABLE,
    importExcel:    excel.importExcel,
  },
};