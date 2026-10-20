/*!
 * yunshu-zhuangqi · 真实报价引擎 (Quote Engine)
 * R31202-A · 2026-10-20
 *
 * 解决的核心问题：原 app.html 是静态演示壳（无 data model / 无计算 / 无持久化）。
 * 本引擎提供真正的报价数据流：
 *   data model → 计算引擎 → localStorage 持久化 → 导入导出
 *
 * 数据契约（供 13 模块消费）：
 *   window.QE.state      完整工程对象（响应式）
 *   window.QE.calc()     实时计算结果
 *   window.QE.on(fn)     订阅变更
 *   window.QE.data       当前项目 data（与 REF 同构，便于 Module 04/07 反向导入）
 */
(function (global) {
  'use strict';

  // ============================================================
  // 1. 分类定义（25 分类 · 10 基装 + 15 主材 + 1 水电暖附录）
  // ============================================================
  const CATEGORIES = [
    { id: 'c01', num: '01', cn: '措施项目',       group: 'construction' },
    { id: 'c02', num: '02', cn: '拆除工程',       group: 'construction' },
    { id: 'c03', num: '03', cn: '砌筑工程',       group: 'construction' },
    { id: 'c04', num: '04', cn: '水电暖工程',     group: 'construction' },
    { id: 'c04a', num: '附', cn: '水电暖施工单价表', group: 'construction', isAppendix: true },
    { id: 'c05', num: '05', cn: '防水防潮工程',   group: 'construction' },
    { id: 'c06', num: '06', cn: '保温隔热静音工程', group: 'construction' },
    { id: 'c07', num: '07', cn: '泥瓦工程',       group: 'construction' },
    { id: 'c08', num: '08', cn: '木作工程',       group: 'construction' },
    { id: 'c09', num: '09', cn: '涂饰工程',       group: 'construction' },
    { id: 'c10', num: '10', cn: '其它',           group: 'construction' },
    { id: 'm01', num: '01', cn: '瓷砖',           group: 'material' },
    { id: 'm02', num: '02', cn: '石材',           group: 'material' },
    { id: 'm03', num: '03', cn: '地板',           group: 'material' },
    { id: 'm04', num: '04', cn: '门窗',           group: 'material' },
    { id: 'm05', num: '05', cn: '套装门',         group: 'material' },
    { id: 'm06', num: '06', cn: '全屋定制',       group: 'material' },
    { id: 'm07', num: '07', cn: '五金',           group: 'material' },
    { id: 'm08', num: '08', cn: '卫浴',           group: 'material' },
    { id: 'm09', num: '09', cn: '开关插座',       group: 'material' },
    { id: 'm10', num: '10', cn: '灯具',           group: 'material' },
    { id: 'm11', num: '11', cn: '智能家居',       group: 'material' },
    { id: 'm12', num: '12', cn: '设备',           group: 'material' },
    { id: 'm13', num: '13', cn: '电器',           group: 'material' },
    { id: 'm14', num: '14', cn: '家具',           group: 'material' },
    { id: 'm15', num: '15', cn: '软装配饰',       group: 'material' }
  ];

  // ============================================================
  // 2. 默认费率（对齐 REF clone-settings financial Set）
  // ============================================================
  const DEFAULT_FEES = {
    managementRate: 5,      // 管理费 %（基数：基装合计）
    materialServiceRate: 5, // 主材服务费 %（基数：主材合计）
    taxRate: 3,             // 税金 %（基数：含管理费小计）
    designRate: 80,         // 设计费 元/㎡（基数：建筑面积）
    discountRate: 100       // 折扣 %（乘数）
  };

  // ============================================================
  // 3. 工程对象工厂
  // ============================================================
  let idSeq = 0;
  function uid(prefix) {
    idSeq += 1;
    return (prefix || 'i') + '-' + Date.now().toString(36) + '-' + idSeq.toString(36);
  }

  function emptyProjectInfo() {
    return {
      name: '', code: '', ownerName: '', projectAddress: '',
      date: new Date().toISOString().slice(0, 10),
      author: '', checker: '', email: '', designArea: 0, notes: ''
    };
  }

  function newProject(overrides) {
    const p = {
      id: uid('prj'),
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectInfo: emptyProjectInfo(),
      company: {
        companyName: '装报价', englishName: '', companyPhone: '',
        companyAddress: '', companyWebsite: '', logoData: ''
      },
      fees: Object.assign({}, DEFAULT_FEES),
      categories: CATEGORIES.map(c => ({ id: c.id, items: [] })),
      changeOrders: [],
      _meta: {}
    };
    if (overrides) return deepMerge(p, overrides);
    return p;
  }

  function deepMerge(target, src) {
    if (!src || typeof src !== 'object') return target;
    for (const k of Object.keys(src)) {
      const sv = src[k];
      if (Array.isArray(sv)) target[k] = sv.slice();
      else if (sv && typeof sv === 'object' && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
        deepMerge(target[k], sv);
      } else if (sv !== undefined) {
        target[k] = sv;
      }
    }
    return target;
  }

  // ============================================================
  // 4. 计算引擎
  // ============================================================
  const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

  /** 派生字段即时刷新：让 UI 每次渲染都能读到 _amount，无需先算总额 */
  function refreshRowAmount(row) {
    const qty = Number(row.qty), price = Number(row.price);
    row._amount = (Number.isFinite(qty) && Number.isFinite(price)) ? round2(qty * price) : 0;
    return row._amount;
  }
  function refreshCategory(catId) {
    const cat = state.project.categories.find(c => c.id === catId);
    if (cat) cat.items.forEach(refreshRowAmount);
  }
  function refreshAll() {
    state.project.categories.forEach(c => c.items.forEach(refreshRowAmount));
    return state.project;
  }

  function calc() {
    const st = state.project;
    const fees = st.fees || DEFAULT_FEES;

    let constructionSum = 0;   // 基装合计
    let materialSum = 0;      // 主材合计（代购）
    const byCategory = {};

    for (const cat of st.categories) {
      const def = CATEGORIES.find(c => c.id === cat.id) || {};
      let sum = 0;
      for (const it of cat.items) {
        const qty = Number(it.qty);
        const price = Number(it.price);
        const amount = (Number.isFinite(qty) && Number.isFinite(price)) ? round2(qty * price) : 0;
        it._amount = amount;                       // 派生字段（不参与持久化比对）
        if (it.excluded) continue;                 // 手动排除不计价
        sum += amount;
      }
      byCategory[cat.id] = { sum: round2(sum), group: def.group || 'construction', cn: def.cn || cat.id, isAppendix: !!def.isAppendix };
      if (def.isAppendix) continue;                // 附表不计入总额（对齐 REF）
      if (def.group === 'material') materialSum += sum;
      else constructionSum += sum;
    }

    constructionSum = round2(constructionSum);
    materialSum = round2(materialSum);

    // 费用链（顺序对齐 REF）
    const managementFee  = round2(constructionSum * (fees.managementRate || 0) / 100);
    const materialFee    = round2(materialSum * (fees.materialServiceRate || 0) / 100);
    const subtotal       = round2(constructionSum + managementFee + materialSum + materialFee);
    const tax            = round2(subtotal * (fees.taxRate || 0) / 100);
    const designFee      = round2((Number(st.projectInfo.designArea) || 0) * (fees.designRate || 0));
    const beforeDiscount = round2(subtotal + tax + designFee);
    const total          = round2(beforeDiscount * (fees.discountRate == null ? 100 : fees.discountRate) / 100);

    // 增减项（独立汇总，不并入报价总额 — 对齐 REF）
    let changeAdd = 0, changeRemove = 0;
    for (const r of (st.changeOrders || [])) {
      const a = round2((Number(r.qty) || 0) * (Number(r.price) || 0));
      if (r.kind === 'remove') changeRemove += a; else changeAdd += a;
    }

    const itemCount = st.categories.reduce((s, c) => s + c.items.filter(i => !i.excluded).length, 0);

    return {
      constructionSum, materialSum,
      managementFee, materialFee, subtotal, tax, designFee, beforeDiscount, total,
      changeAdd, changeRemove, changeNet: round2(changeAdd - changeRemove),
      grandTotal: round2(total + changeAdd - changeRemove),
      itemCount, byCategory
    };
  }

  // ============================================================
  // 5. 状态 + 订阅
  // ============================================================
  const state = { project: newProject(), quota: { categories: [], feeTable: [] }, dirty: false };
  const listeners = new Set();

  function emit(reason) {
    state.dirty = true;
    for (const fn of listeners) { try { fn(state.project, calc(), reason); } catch (e) { console.warn('[QE] listener error', e); } }
  }
  function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  // ============================================================
  // 6. 持久化（localStorage · 项目 CRUD + 档案）
  // ============================================================
  const LS_PROJECTS = 'yunshu_projects_v1';
  const LS_CURRENT  = 'yunshu_current_project_v1';
  const LS_SETTINGS = 'yunshu_settings_v1';

  function lsGet(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { console.warn('[QE] ls parse fail', key, e); return fallback; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { console.error('[QE] ls write fail', key, e); return false; }
  }

  const store = {
    listProjects() {
      const arr = lsGet(LS_PROJECTS, []) || [];
      return arr.map(p => ({
        id: p.id, name: p.projectInfo?.name || '(未命名)',
        updatedAt: p.updatedAt, createdAt: p.createdAt,
        total: (() => { const prev = state.project; state.project = p; const c = calc(); state.project = prev; return c.total; })()
      })).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    },
    saveProject() {
      state.project.updatedAt = new Date().toISOString();
      const arr = lsGet(LS_PROJECTS, []) || [];
      const i = arr.findIndex(p => p.id === state.project.id);
      const snapshot = JSON.parse(JSON.stringify(state.project, (k, v) => (k.charAt(0) === '_' ? undefined : v)));
      if (i >= 0) arr[i] = snapshot; else arr.push(snapshot);
      lsSet(LS_PROJECTS, arr);
      lsSet(LS_CURRENT, state.project.id);
      state.dirty = false;
      return state.project.id;
    },
    loadProject(id) {
      const arr = lsGet(LS_PROJECTS, []) || [];
      const p = arr.find(x => x.id === id);
      if (!p) throw new Error('项目不存在: ' + id);
      const fresh = newProject();
      fresh.id = p.id; fresh.createdAt = p.createdAt; fresh.updatedAt = p.updatedAt;
      deepMerge(fresh, p);
      state.project = fresh;
      emit('load');
      return fresh;
    },
    deleteProject(id) {
      const arr = lsGet(LS_PROJECTS, []) || [];
      lsSet(LS_PROJECTS, arr.filter(p => p.id !== id));
      if (lsGet(LS_CURRENT) === id) lsSet(LS_CURRENT, null);
    },
    newProject(info) {
      state.project = newProject();
      if (info) deepMerge(state.project, info);
      emit('new');
      return state.project;
    },
    getSettings() { return lsGet(LS_SETTINGS, {}); },
    setSettings(s) { lsSet(LS_SETTINGS, s); }
  };

  // ============================================================
  // 7. 定额库（seed 加载 + 搜索 + 加入报价）
  // ============================================================
  const quota = {
    async load(url) {
      const res = await fetch(url || './quota-seed.json');
      if (!res.ok) throw new Error('定额库加载失败 HTTP ' + res.status);
      const json = await res.json();
      state.quota = { categories: json.categories || [], feeTable: json.feeTable || [], counts: json.counts || {} };
      return state.quota;
    },
    /** 搜索：name / desc / brand / spec 模糊匹配 */
    search(keyword, categoryId) {
      const kw = String(keyword || '').trim().toLowerCase();
      const out = [];
      for (const c of state.quota.categories) {
        if (categoryId && c.id !== categoryId) continue;
        for (const it of c.items) {
          if (!kw) { out.push(Object.assign({ categoryId: c.id, categoryCn: c.cn, group: c.group }, it)); continue; }
          const hay = [it.name, it.desc, it.brand, it.model, it.spec].filter(Boolean).join(' ').toLowerCase();
          if (hay.includes(kw)) out.push(Object.assign({ categoryId: c.id, categoryCn: c.cn, group: c.group }, it));
        }
      }
      return out;
    },
    /** 把定额加入报价分类 */
    addToQuote(categoryId, quotaItem, qty) {
      const cat = state.project.categories.find(c => c.id === categoryId);
      if (!cat) throw new Error('分类不存在: ' + categoryId);
      const entry = {
        id: uid('row'),
        name: quotaItem.name,
        unit: quotaItem.unit || '',
        price: Number(quotaItem.price) || 0,
        qty: qty == null ? 1 : Number(qty),
        desc: quotaItem.desc || '',
        source: 'quota',
        refId: quotaItem.refId || quotaItem.id || ''
      };
      if (quotaItem.brand) entry.brand = quotaItem.brand;
      if (quotaItem.model) entry.model = quotaItem.model;
      if (quotaItem.spec) entry.spec = quotaItem.spec;
      if (quotaItem.laborCost != null) {
        entry.laborCost = Number(quotaItem.laborCost) || 0;
        entry.materialCost = Number(quotaItem.materialCost) || 0;
        entry.auxiliaryCost = Number(quotaItem.auxiliaryCost) || 0;
      }
      cat.items.push(entry);
      emit('quota-add');
      return entry;
    }
  };

  // ============================================================
  // 8. 编辑操作（供 UI / 模块调用）
  // ============================================================
  const ops = {
    setInfo(patch) { deepMerge(state.project.projectInfo, patch || {}); emit('info'); },
    setCompany(patch) { deepMerge(state.project.company, patch || {}); emit('company'); },
    setFee(key, value) {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) throw new Error('费率必须是非负数字');
      state.project.fees[key] = n; emit('fee');
    },
    addRow(categoryId, row) {
      const cat = state.project.categories.find(c => c.id === categoryId);
      if (!cat) throw new Error('分类不存在: ' + categoryId);
      const e = Object.assign({ id: uid('row'), name: '', unit: '项', qty: 1, price: 0, desc: '' }, row || {});
      e.qty = Number(e.qty) || 0; e.price = Number(e.price) || 0;
      refreshRowAmount(e);
      cat.items.push(e); emit('row-add'); return e;
    },
    updateRow(categoryId, rowId, patch) {
      const cat = state.project.categories.find(c => c.id === categoryId);
      if (!cat) return null;
      const row = cat.items.find(r => r.id === rowId);
      if (!row) return null;
      Object.assign(row, patch || {});
      refreshRowAmount(row);
      emit('row-update'); return row;
    },
    removeRow(categoryId, rowId) {
      const cat = state.project.categories.find(c => c.id === categoryId);
      if (!cat) return false;
      const i = cat.items.findIndex(r => r.id === rowId);
      if (i < 0) return false;
      cat.items.splice(i, 1); emit('row-remove'); return true;
    },
    toggleExclude(categoryId, rowId) {
      const cat = state.project.categories.find(c => c.id === categoryId);
      const row = cat && cat.items.find(r => r.id === rowId);
      if (!row) return false;
      row.excluded = !row.excluded; emit('row-exclude'); return row.excluded;
    },
    clearCategory(categoryId) {
      const cat = state.project.categories.find(c => c.id === categoryId);
      if (!cat) return false;
      cat.items.length = 0; emit('clear'); return true;
    },
    // 增减项
    addChange(kind, patch) {
      const r = Object.assign({ id: uid('chg'), kind: kind || 'add', name: '', unit: '项', qty: 1, price: 0, note: '' }, patch || {});
      r.qty = Number(r.qty) || 0; r.price = Number(r.price) || 0;
      state.project.changeOrders = state.project.changeOrders || [];
      state.project.changeOrders.push(r); emit('change-add'); return r;
    },
    updateChange(id, patch) {
      const r = (state.project.changeOrders || []).find(x => x.id === id);
      if (!r) return null;
      Object.assign(r, patch || {}); emit('change-update'); return r;
    },
    removeChange(id) {
      const arr = state.project.changeOrders || [];
      const i = arr.findIndex(x => x.id === id);
      if (i < 0) return false;
      arr.splice(i, 1); emit('change-remove'); return true;
    }
  };

  // ============================================================
  // 9. 导入 / 导出（REF 兼容 + ours 原生）
  // ============================================================
  function toJSON(pretty) {
    const p = JSON.parse(JSON.stringify(state.project, (k, v) => (k.charAt(0) === '_' ? undefined : v)));
    p.format = 'YUNSHU_QUOTE_PROJECT';
    p.formatVersion = 1;
    p.summary = calc();
    return JSON.stringify(p, null, pretty === false ? 0 : 2);
  }

  function fromJSON(text) {
    let obj;
    try { obj = typeof text === 'string' ? JSON.parse(text) : text; }
    catch (e) { throw new Error('JSON 解析失败: ' + e.message); }
    if (!obj || typeof obj !== 'object') throw new Error('无效的工程文件');
    // REF 兼容：REF 用 fileType 区分
    const fresh = newProject();
    const src = obj.categories ? obj : (obj.project || obj.data || obj);
    if (src.projectInfo) deepMerge(fresh.projectInfo, src.projectInfo);
    if (src.company) deepMerge(fresh.company, src.company);
    if (src.companyName) fresh.company.companyName = src.companyName;
    if (src.companyPhone) fresh.company.companyPhone = src.companyPhone;
    if (src.logoData) fresh.company.logoData = src.logoData;
    if (src.fees) deepMerge(fresh.fees, src.fees);
    else {
      // REF 把费率直接放在 projectInfo
      for (const k of Object.keys(DEFAULT_FEES)) {
        if (src.projectInfo && src.projectInfo[k] != null) fresh.fees[k] = Number(src.projectInfo[k]) || 0;
      }
    }
    if (Array.isArray(src.categories)) {
      for (const c of src.categories) {
        const target = fresh.categories.find(x => x.id === (c.id || c.libraryId) || x.id === catIdByCn(c.cn));
        if (!target) continue;
        const items = c.items || c.library || [];
        target.items = items.map(it => ({
          id: uid('row'),
          name: it.name || '', unit: it.unit || '',
          qty: Number(it.qty) || 0, price: Number(it.price) || 0,
          desc: it.desc || '', brand: it.brand || '', model: it.model || '', spec: it.spec || '',
          source: it.sourceSheet || it.source || 'import'
        }));
      }
    }
    if (Array.isArray(src.changeOrders)) {
      fresh.changeOrders = src.changeOrders.map(r => Object.assign({ id: uid('chg') }, r));
    }
    state.project = fresh;
    emit('import');
    return fresh;
  }

  function catIdByCn(cn) {
    if (!cn) return null;
    const hit = CATEGORIES.find(c => c.cn === cn);
    if (hit) return hit.id;
    const loose = CATEGORIES.find(c => cn.includes(c.cn) || c.cn.includes(cn));
    return loose ? loose.id : null;
  }

  // ============================================================
  // 10. CSV 导出（防注入 + BOM）
  // ============================================================
  const csvCell = v => '"' + String(v == null ? '' : v).replace(/^[=+\-@]/, "'$&").replace(/"/g, '""') + '"';

  function toCSV() {
    const c = calc();
    const p = state.project.projectInfo;
    const lines = [];
    lines.push(['工程名称', p.name].map(csvCell).join(','));
    lines.push(['工程编号', p.code].map(csvCell).join(','));
    lines.push(['业主姓名', p.ownerName].map(csvCell).join(','));
    lines.push(['项目地址', p.projectAddress].map(csvCell).join(','));
    lines.push(['编制日期', p.date].map(csvCell).join(','));
    lines.push(['建筑面积', p.designArea || 0].map(csvCell).join(','));
    lines.push('');
    lines.push(['分类', '项目名称', '单位', '工程量', '单价', '金额', '工艺说明'].map(csvCell).join(','));
    for (const cat of state.project.categories) {
      const def = CATEGORIES.find(x => x.id === cat.id) || {};
      for (const it of cat.items) {
        lines.push([def.cn || cat.id, it.name, it.unit, it.qty, it.price, it._amount || 0, it.desc]
          .map(csvCell).join(','));
      }
    }
    lines.push('');
    lines.push(['基装合计', c.constructionSum].map(csvCell).join(','));
    lines.push(['主材合计', c.materialSum].map(csvCell).join(','));
    lines.push(['管理费', c.managementFee].map(csvCell).join(','));
    lines.push(['主材服务费', c.materialFee].map(csvCell).join(','));
    lines.push(['税金', c.tax].map(csvCell).join(','));
    lines.push(['设计费', c.designFee].map(csvCell).join(','));
    lines.push(['折扣后总计', c.total].map(csvCell).join(','));
    return '﻿' + lines.join('\r\n');
  }

  // ============================================================
  // 导出 API
  // ============================================================
  const QE = {
    version: '1.0.0',
    CATEGORIES,
    DEFAULT_FEES,
    get state() { return state; },
    get data() { return state.project; },
    get projectInfo() { return state.project.projectInfo; },
    get company() { return state.project.company; },
    get fees() { return state.project.fees; },
    calc, on, store, quota, ops,
    refreshRowAmount, refreshCategory, refreshAll,
    toJSON, fromJSON, toCSV,
    catDef: id => CATEGORIES.find(c => c.id === id) || null,
    reset: () => { state.project = newProject(); emit('reset'); }
  };

  global.QE = QE;
  if (typeof module !== 'undefined' && module.exports) module.exports = QE;
})(typeof window !== 'undefined' ? window : globalThis);