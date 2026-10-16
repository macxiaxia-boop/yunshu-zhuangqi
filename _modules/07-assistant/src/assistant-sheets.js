// assistant-sheets.js — 9 基装 + 15 主材 sheet name 智能匹配
// 命名空间归一化：去除前缀 `0` / `、` / `_` / 空格 / 中横线 / 顿号
'use strict';

const CATEGORY_ALIASES = [
  { id: 'c01', en: 'MEASURES',       cn: ['措施项目','项目措施'],                    group: 'construction' },
  { id: 'c02', en: 'DEMOLITION',     cn: ['拆除工程','拆除'],                        group: 'construction' },
  { id: 'c03', en: 'MASONRY',        cn: ['砌筑工程','砌筑','砌墙','泥工'],          group: 'construction' },
  { id: 'c04', en: 'MEP',            cn: ['水电工程','水电暖工程','水电暖','水暖'],  group: 'construction' },
  { id: 'c05', en: 'WATERPROOFING',  cn: ['防水工程','防水'],                        group: 'construction' },
  { id: 'c06', en: 'INSULATION',     cn: ['保温工程','保温','隔音','静音','保温隔热'], group: 'construction' },
  { id: 'c07', en: 'TILING',         cn: ['泥瓦工程','泥瓦','贴砖'],                 group: 'construction' },
  { id: 'c08', en: 'CARPENTRY',      cn: ['木作工程','木作','木工'],                 group: 'construction' },
  { id: 'c09', en: 'PAINTING',       cn: ['涂饰工程','涂饰','油漆','乳胶漆'],       group: 'construction' },
  { id: 'm01', cn: ['瓷砖','地砖','墙砖'],         group: 'material' },
  { id: 'm02', cn: ['石材','大理石'],               group: 'material' },
  { id: 'm03', cn: ['地板','木地板','复合地板'],    group: 'material' },
  { id: 'm04', cn: ['门窗'],                       group: 'material' },
  { id: 'm05', cn: ['套装门','木门'],               group: 'material' },
  { id: 'm06', cn: ['全屋定制','定制柜','衣柜'],    group: 'material' },
  { id: 'm07', cn: ['五金','锁具'],                 group: 'material' },
  { id: 'm08', cn: ['卫浴','洁具','马桶'],          group: 'material' },
  { id: 'm09', cn: ['开关','插座','面板','开关插座'], group: 'material' },
  { id: 'm10', cn: ['灯具','灯'],                   group: 'material' },
  { id: 'm11', cn: ['智能家居','智能'],             group: 'material' },
  { id: 'm12', cn: ['设备','热水器','新风'],        group: 'material' },
  { id: 'm13', cn: ['电器','家电'],                 group: 'material' },
  { id: 'm14', cn: ['家具'],                       group: 'material' },
  { id: 'm15', cn: ['软装','配饰','窗帘','软装配饰'], group: 'material' },
];

// 归一化：去前缀 0 / 、 / _ / 空格 / - / 序号标记
// 注意：保留 "工程" / "项目" 等后缀（用于完全匹配加分）
function normalizeName(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  // 去除 BOM
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  // 去除前缀编号："01 拆除工程" → "拆除工程"；"1.防水" → "防水工程"；"1_水电" → "水电"
  s = s.replace(/^[\s\d零一二三四五六七八九十、，,._\-—–·•]+/, '');
  // 仅去除中间空白（保留前后缀用于匹配）
  s = s.replace(/\s+/g, '');
  return s;
}

// 计算 sheetName 与 alias 的匹配分数
// 加权：完全匹配=100，包含匹配=60，en完全=80，en包含=40
function scoreMatch(sheetNorm, aliasText) {
  if (!sheetNorm || !aliasText) return 0;
  if (sheetNorm === aliasText) return 100;
  if (sheetNorm.includes(aliasText)) return 60;
  if (aliasText.includes(sheetNorm) && sheetNorm.length >= 2) return 40;
  return 0;
}

// 智能匹配 sheet name → category
function matchSheetToCategory(sheetName) {
  const norm = normalizeName(sheetName);
  if (!norm) return { id: null, group: null, confidence: 0, matchType: 'empty' };

  let best = { id: null, group: null, confidence: 0, matchType: 'none' };
  for (const cat of CATEGORY_ALIASES) {
    let localBest = 0;
    let localMatch = '';
    // 命中 cn aliases
    for (const cn of cat.cn) {
      const aliasNorm = normalizeName(cn);
      const sc = scoreMatch(norm, aliasNorm);
      if (sc > localBest) {
        localBest = sc;
        localMatch = 'cn';
      }
    }
    // 命中 en (仅 c01-c09)
    if (cat.en) {
      const sc = scoreMatch(norm, cat.en);
      if (sc > localBest) {
        localBest = sc;
        localMatch = 'en';
      }
    }
    if (localBest > best.confidence) {
      best = {
        id: cat.id,
        group: cat.group,
        confidence: localBest,
        matchType: localMatch,
      };
    }
  }
  // 60 分以上算作已映射
  if (best.confidence < 40) {
    return { id: null, group: null, confidence: best.confidence, matchType: 'pending' };
  }
  return best;
}

// 从 sheetName 直接取映射（带缓存）
function matchMany(sheetNames) {
  return sheetNames.map((n) => ({ sheetName: n, ...matchSheetToCategory(n) }));
}

// 取所有 categories（便于 UI 渲染人工映射下拉框）
function listCategories() {
  return CATEGORY_ALIASES.map((c) => ({ ...c }));
}

const api = {
  CATEGORY_ALIASES,
  normalizeName,
  matchSheetToCategory,
  matchMany,
  listCategories,
  scoreMatch,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.AssistantSheets = api;
}
