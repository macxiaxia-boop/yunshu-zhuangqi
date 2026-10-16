// index.js — 模块统一入口
'use strict';

const bjproj = require('./bjproj-parser');
const bjchange = require('./bjchange-parser');
const wlbook = require('./wlbook-parser');
const clone = require('./ref-to-ours-clone');
const formatter = require('./ours-formatter');

module.exports = {
  // 反向: REF → ours
  parseRefBjproj: bjproj.parseRefBjproj,
  parseRefBjprojArrayBuffer: bjproj.parseRefBjprojArrayBuffer,
  BjprojParseError: bjproj.BjprojParseError,

  parseRefBjchange: bjchange.parseRefBjchange,
  toOursBjchange: bjchange.toOursBjchange,
  BjchangeParseError: bjchange.BjchangeParseError,

  parseRefWlbook: wlbook.parseRefWlbook,
  WlbookParseError: wlbook.WlbookParseError,

  convertRefCloneZip: clone.convertRefCloneZip,
  inspectRefClone: clone.inspectRefClone,
  CloneZipError: clone.CloneZipError,

  // 正向: ours → ours 原生导出
  exportBjproj: formatter.exportBjproj,
  exportBjchange: formatter.exportBjchange,
  exportWlbook: formatter.exportWlbook,
  exportBjprojCSV: formatter.exportBjprojCSV,
  csvCell: formatter.csvCell,
  OursFormatError: formatter.OursFormatError,

  // 兼容性命名(浏览器 window 友好)
  YunshuRefReverse: {
    parseBjproj: bjproj.parseRefBjproj,
    parseBjchange: bjchange.parseRefBjchange,
    parseWlbook: wlbook.parseRefWlbook,
    convertCloneZip: clone.convertRefCloneZip,
    export: formatter.exportBjproj,
  },
};
