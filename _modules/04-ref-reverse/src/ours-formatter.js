// ours-formatter.js — yunshu-zhuangqi ours 原生导出
// 用于把我们当前的报价保存成 ours 单文件 JSON 格式

'use strict';

class OursFormatError extends Error {
  constructor(message, code = 'OURS_FORMAT_ERROR', details = {}) {
    super(message);
    this.name = 'OursFormatError';
    this.code = code;
    this.details = details;
  }
}

const OURS_FILE_TYPE_QUOTE = 'YUNSHU_ZHUANGQI_QUOTE';
const OURS_FILE_TYPE_CHANGE = 'YUNSHU_ZHUANGQI_CHANGE_ORDERS';
const OURS_FILE_TYPE_WLBOOK = 'YUNSHU_ZHUANGQI_MATERIAL_BOOK';
const OURS_FORMAT_VERSION = 1;

// CSV 注入防护:
// =/+/-/@ 开头的字段前缀加单引号
// 同时对双引号进行 RFC 4180 转义
function csvCell(v) {
  let s = String(v == null ? '' : v);
  // 防护前缀
  s = s.replace(/^[=+@-]/, "'$&");
  // RFC 4180 转义
  return '"' + s.replaceAll('"', '""') + '"';
}

function csvRow(values) {
  return values.map(csvCell).join(',');
}

function exportBjproj(data) {
  if (!data || typeof data !== 'object') {
    throw new OursFormatError('data must be an object', 'BAD_INPUT');
  }
  const payload = {
    fileType: OURS_FILE_TYPE_QUOTE,
    formatVersion: OURS_FORMAT_VERSION,
    savedAt: new Date().toISOString(),
    data: {
      projectInfo: data.projectInfo || {},
      categories: Array.isArray(data.categories) ? data.categories : [],
      libCategories: Array.isArray(data.libCategories) ? data.libCategories : [],
      changeOrders: Array.isArray(data.changeOrders) ? data.changeOrders : [],
    },
  };
  return JSON.stringify(payload, null, 2);
}

function exportBjchange(rows, projectInfo = {}) {
  const list = Array.isArray(rows) ? rows : [];
  return JSON.stringify({
    fileType: OURS_FILE_TYPE_CHANGE,
    formatVersion: OURS_FORMAT_VERSION,
    savedAt: new Date().toISOString(),
    project: {
      name: projectInfo.name || '',
      code: projectInfo.code || '',
    },
    rows: list,
  }, null, 2);
}

function exportWlbook(materials) {
  const list = Array.isArray(materials) ? materials : [];
  const byCategory = {
    material: [], jianJu: [], light: [], fiveGold: [], switch: [],
  };
  for (const m of list) {
    const c = m.category || 'material';
    if (!byCategory[c]) byCategory[c] = [];
    byCategory[c].push(m);
  }
  return JSON.stringify({
    fileType: OURS_FILE_TYPE_WLBOOK,
    formatVersion: OURS_FORMAT_VERSION,
    savedAt: new Date().toISOString(),
    byCategory,
    materials: list,
  }, null, 2);
}

function exportBjprojCSV(data) {
  // CSV: project info + 9 基装分类 + 主材
  const lines = ['# yunshu-zhuangqi ours CSV 导出'];
  const pi = (data && data.projectInfo) || {};
  lines.push(`# 工程名称,${csvCell(pi.name)}`);
  lines.push(`# 工程编号,${csvCell(pi.code)}`);
  lines.push(`# 业主姓名,${csvCell(pi.ownerName)}`);
  lines.push(`# 项目地址,${csvCell(pi.projectAddress)}`);
  lines.push(`# 编制日期,${csvCell(pi.date)}`);
  lines.push('# ');
  lines.push(csvRow(['分类ID', '分类中文', '项目名称', '单位', '数量', '单价', '备注']));
  const cats = (data && data.categories) || [];
  for (const cat of cats) {
    const items = cat.items || [];
    for (const it of items) {
      lines.push(csvRow([
        cat.id || '',
        cat.cn || '',
        it.name || '',
        it.unit || '',
        it.qty == null ? '' : it.qty,
        it.price == null ? '' : it.price,
        it.desc || '',
      ]));
    }
  }
  return lines.join('\n');
}

module.exports = {
  exportBjproj,
  exportBjchange,
  exportWlbook,
  exportBjprojCSV,
  csvCell,
  csvRow,
  OursFormatError,
  OURS_FILE_TYPE_QUOTE,
  OURS_FILE_TYPE_CHANGE,
  OURS_FILE_TYPE_WLBOOK,
  OURS_FORMAT_VERSION,
};
