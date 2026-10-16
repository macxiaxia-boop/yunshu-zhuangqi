// assistant-core.js — 智能助手主流程（4 阶段：import/map/review/commit）
'use strict';

const sheets = (typeof module !== 'undefined' && module.exports)
  ? require('./assistant-sheets')
  : (typeof window !== 'undefined' ? window.AssistantSheets : null);

const conflict = (typeof module !== 'undefined' && module.exports)
  ? require('./import-conflict')
  : (typeof window !== 'undefined' ? window.ImportConflict : null);

// === 22 列字段别名（取自 schema-extraction.md + REF 常见命名） ===
const COLUMN_ALIASES = {
  name:           ['名称','项目名称','项目名称及备注','材料名称','分项名称','项目'],
  unit:           ['单位','计量单位'],
  qty:            ['工程量','数量','qty','quantity'],
  price:          ['综合单价','单价','综合取费','price','unit price'],
  total:          ['合价','金额','小计','total','amount'],
  desc:           ['施工工艺说明','备注工艺','备注','项目特征描述','工艺说明','说明'],
  brand:          ['品牌','brand','厂家'],
  model:          ['型号','model','规格型号'],
  spec:           ['规格','spec','尺寸'],
  laborCost:      ['人工费','人工','labor'],
  materialCost:   ['材料费','材料','material'],
  auxiliaryCost:  ['辅料费','辅料','auxiliary'],
  compositePrice: ['工料合计','工料分项','composite','分项合计'],
  lossRate:       ['损耗率','损耗','loss'],
  category:       ['分类','category','类别'],
  subCategory:    ['子分类','subcategory','二级分类'],
  room:           ['房间','room','适用空间'],
  floor:          ['楼层','floor'],
  area:           ['面积','area','施工面积'],
  code:           ['编号','编码','code','项目编号'],
  remark:         ['备注','remark','comment'],
  sourceSheet:    ['来源sheet','source sheet','原表'],
};

// 反向索引：列名 → 标准字段
function buildReverseIndex() {
  const idx = {};
  for (const [key, list] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of list) {
      idx[String(alias).toLowerCase().trim()] = key;
    }
  }
  return idx;
}

const REVERSE_INDEX = buildReverseIndex();

// 根据 header 数组返回 [stdField, ...] 映射数组
function mapHeaders(headers) {
  const mapped = headers.map((h) => {
    if (h == null) return null;
    const key = REVERSE_INDEX[String(h).toLowerCase().trim()];
    return key || null;
  });
  return mapped;
}

// === CSV/TSV 解析（纯原生） ===
// 支持多行字段（"..." 包裹 + 换行）
function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuote = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuote = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"') { inQuote = true; i++; continue; }
    if (ch === delimiter) { row.push(cell); cell = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
    cell += ch; i++;
  }
  // 最后一行
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // 去除完全空行
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

// 自动探测分隔符
function detectDelimiter(text) {
  const sample = text.slice(0, 4096);
  const tabCount = (sample.match(/\t/g) || []).length;
  const commaCount = (sample.match(/,/g) || []).length;
  const semiCount = (sample.match(/;/g) || []).length;
  if (tabCount >= commaCount && tabCount >= semiCount) return '\t';
  if (semiCount > commaCount) return ';';
  return ',';
}

// 解析单个文件内容（CSV/TSV 文本）
// 返回：{ fileName, sheets: [{name, headers, rows}], format }
function parseSheetText(text, fileName) {
  const delimiter = detectDelimiter(text);
  const format = delimiter === '\t' ? 'tsv' : 'csv';
  const rows = parseDelimited(text, delimiter);
  if (rows.length === 0) {
    return { fileName, format, sheets: [], error: 'empty_file' };
  }
  // 单 sheet 文件：所有行作为一个 sheet
  const sheetName = (fileName || 'Sheet1').replace(/\.(csv|tsv|txt)$/i, '');
  const headers = rows[0].map((h) => String(h || '').trim());
  const dataRows = rows.slice(1);
  return {
    fileName,
    format,
    sheets: [{ name: sheetName, headers, rows: dataRows }],
  };
}

// === 数字解析 ===
function parseNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(/,/g, '').replace(/[^\d.\-]/g, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

// 转换一行数据到标准 item
function rowToItem(headersMap, row, ctx) {
  const item = {
    id: `imp-${ctx.categoryId}-${ctx.rowIdx}-${Math.random().toString(36).slice(2, 8)}`,
    sourceSheet: ctx.sheetName,
    sourceRow: ctx.rowIdx,
    userPriceOverride: true,
  };
  headersMap.forEach((field, i) => {
    if (!field) return;
    const v = row[i];
    if (v == null || String(v).trim() === '') {
      if (['price','qty','laborCost','materialCost','auxiliaryCost','compositePrice','lossRate'].includes(field)) {
        return;
      }
    }
    if (['price','qty','laborCost','materialCost','auxiliaryCost','compositePrice','lossRate','total','area'].includes(field)) {
      item[field] = parseNumber(v);
    } else {
      item[field] = String(v == null ? '' : v).trim();
    }
  });
  // 若 price 缺，尝试从 compositePrice / total / qty 反推
  if (item.price == null && item.total != null && item.qty != null && item.qty !== 0) {
    item.price = Number((item.total / item.qty).toFixed(2));
  }
  // compositePrice = labor + material + auxiliary（若缺失自动算）
  if (item.compositePrice == null && (item.laborCost || item.materialCost || item.auxiliaryCost)) {
    item.compositePrice = (item.laborCost || 0) + (item.materialCost || 0) + (item.auxiliaryCost || 0);
  }
  return item;
}

// === 主流程 AssistantCore ===
class AssistantCore {
  constructor(opts = {}) {
    this.onProgress = opts.onProgress || (() => {});
    this.onLog = opts.onLog || (() => {});
    this.state = {
      stage: 'idle', // idle | importing | mapping | reviewing | committing | done
      files: [],
      parsedFiles: [],
      items: [],
      conflicts: null,
      missing: null,
      warnings: [],
      backupId: null,
      targetCategory: null,
    };
  }

  _progress(p, msg) {
    this.onProgress(p, msg);
    this.onLog(p, msg);
  }

  // === Stage 1: 导入文件 ===
  async importFiles(fileList) {
    this.state.stage = 'importing';
    this._progress(0, '开始导入文件');
    const files = Array.from(fileList);
    const parsedFiles = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const p = Math.round(((i + 1) / files.length) * 100);
      this._progress(p, `解析 ${f.name}`);

      if (f.size > 25 * 1024 * 1024) {
        throw new Error(`文件 ${f.name} 超过 25MB 限制（实际 ${(f.size / 1024 / 1024).toFixed(2)}MB）`);
      }
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!['csv', 'tsv', 'txt', 'xlsx'].includes(ext)) {
        throw new Error(`不支持的文件格式：${f.name}（仅支持 csv/tsv/txt/xlsx）`);
      }

      if (ext === 'xlsx') {
        // 纯原生不支持解析 xlsx zip，提示用户先转 csv
        throw new Error(`${f.name} 是 xlsx 二进制格式，请在 Excel 中"另存为 CSV UTF-8"后再导入`);
      }

      const text = await f.text();
      const parsed = parseSheetText(text, f.name);
      if (parsed.error === 'empty_file') {
        throw new Error(`${f.name} 内容为空`);
      }
      parsedFiles.push(parsed);
    }

    this.state.parsedFiles = parsedFiles;
    this.state.files = files;
    this._progress(100, '导入完成');
    return parsedFiles;
  }

  // === Stage 2: 映射 ===
  // 把每个 sheet 的 header 映射到标准字段，再做 sheet→category 匹配
  mapAll() {
    this.state.stage = 'mapping';
    const allItems = [];
    const sheetMappings = [];

    for (const pf of this.state.parsedFiles) {
      for (const sheet of pf.sheets) {
        const matched = sheets.matchSheetToCategory(sheet.name);
        const headersMap = mapHeaders(sheet.headers);
        const mappedCount = headersMap.filter(Boolean).length;
        sheetMappings.push({
          fileName: pf.fileName,
          sheetName: sheet.name,
          categoryId: matched.id,
          confidence: matched.confidence,
          matchType: matched.matchType,
          headers: sheet.headers,
          headersMap,
          mappedFields: mappedCount,
          totalFields: sheet.headers.length,
        });

        if (!matched.id) continue; // 未匹配的 sheet 跳过（或标记为 pending）

        sheet.rows.forEach((row, idx) => {
          const item = rowToItem(headersMap, row, {
            categoryId: matched.id,
            sheetName: sheet.name,
            rowIdx: idx + 2,
          });
          if (!item.name) return; // 跳过空名行
          item._categoryId = matched.id;
          item._group = matched.group;
          allItems.push(item);
        });
      }
    }

    this.state.items = allItems;
    this.state.sheetMappings = sheetMappings;
    this._progress(100, '映射完成');
    return { items: allItems, sheetMappings };
  }

  // === Stage 3: 核对（重复 + 缺失） ===
  review() {
    this.state.stage = 'reviewing';
    const items = this.state.items;
    const dup = conflict.detectDuplicates(items);
    this.state.conflicts = dup;
    const miss = conflict.detectMissing(dup.merged);
    this.state.missing = miss;
    this.state.warnings = miss.warnings;
    // 概览
    const total = items.length;
    const merged = dup.merged.length;
    const dupCount = dup.duplicateCount;
    const totalAmount = dup.merged.reduce((s, it) => {
      const q = parseFloat(it.qty) || 0;
      const p = parseFloat(it.price) || 0;
      return s + q * p;
    }, 0);
    const categories = new Set(dup.merged.map((it) => it._categoryId));
    this._progress(100, '核对完成');
    return {
      total,
      merged,
      duplicateCount: dupCount,
      warningCount: miss.warnings.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      categories: Array.from(categories),
    };
  }

  // === 跨工程检测 ===
  checkProjectMismatch(targetProjectName) {
    if (!this.state.currentProject) return null;
    const a = (this.state.currentProject.name || '').trim();
    const b = (targetProjectName || '').trim();
    if (!a || !b) return null;
    if (a === b) return null;
    return { source: a, target: b, severity: 'warning' };
  }

  // === Stage 4: 提交（先备份） ===
  async commit(data, opts = {}) {
    if (!data) throw new Error('data 必填');
    this.state.stage = 'committing';
    const items = (this.state.conflicts && this.state.conflicts.merged) || this.state.items;
    const projectId = opts.projectId || data.projectInfo && data.projectInfo.code || 'default';
    this._progress(10, '创建备份');
    const backupId = await conflict.backupCurrentProject(data, projectId);
    this.state.backupId = backupId;

    // 按 _categoryId 分组写入
    const groups = new Map();
    for (const it of items) {
      const cid = it._categoryId || this.state.targetCategory || 'c01';
      if (!groups.has(cid)) groups.set(cid, []);
      groups.get(cid).push(it);
    }

    let totalAdded = 0;
    const results = [];
    let i = 0;
    for (const [cid, groupItems] of groups) {
      const p = 20 + Math.round(((i + 1) / groups.size) * 70);
      this._progress(p, `写入分类 ${cid}`);
      const r = conflict.commitImport(data, groupItems, cid);
      results.push(r);
      totalAdded += r.added;
      i++;
    }
    this._progress(100, '提交完成');
    this.state.stage = 'done';
    return { backupId, totalAdded, results };
  }

  // === 取消 ===
  async cancel() {
    if (!this.state.backupId) {
      // 没提交过 → 无需回滚
      this.state.stage = 'idle';
      return { cancelled: true, rolledBack: false };
    }
    // 已提交过 → 滚动到备份
    const restored = await conflict.rollback(this.state.backupId);
    this.state.stage = 'idle';
    return { cancelled: true, rolledBack: true, restored };
  }

  // === 取目标跳转分类 ===
  getJumpTarget() {
    const cats = Array.from(new Set(this.state.items.map((it) => it._categoryId).filter(Boolean)));
    return cats;
  }
}

const api = {
  AssistantCore,
  COLUMN_ALIASES,
  REVERSE_INDEX,
  mapHeaders,
  parseDelimited,
  detectDelimiter,
  parseSheetText,
  parseNumber,
  rowToItem,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.AssistantCore = AssistantCore;
  window.AssistantApi = api;
}
