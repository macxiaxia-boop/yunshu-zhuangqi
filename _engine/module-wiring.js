/*!
 * yunshu-zhuangqi · 模块回写适配器
 *
 * 让各模块能真实读写引擎数据，而不只是打开就完事。
 * 每个模块页面引入本文件 + 调用对应 mount 函数即可接上数据流。
 */
(function (global) {
  'use strict';

  function bridge() {
    try {
      if (global.YSBridge) return global.YSBridge.connect('adapter');
      if (global.QE) return global.YSBridge._local(global.QE, 'adapter');
    } catch (e) { /* ignore */ }
    return null;
  }

  const Adapter = {
    /** 打印预览：把当前工程喂给它（引擎页已做，这里兜底） */
    feedPrint() {
      const b = bridge(); if (!b) return { ok: false, reason: '未连到引擎' };
      const c = b.calc();
      return {
        ok: true,
        total: c.total, constructionSum: c.constructionSum, materialSum: c.materialSum,
        project: JSON.parse(b.snapshot())
      };
    },

    /** 空间算量：把 rooms 换成报价行推回引擎 */
    pushRooms(rooms) {
      const b = bridge(); if (!b) return { ok: false, reason: '未连到引擎' };
      // 面积 → 墙面/地面；周长 → 吊顶/踢脚
      let n = 0;
      const areaRows = [], wallRows = [];
      for (const r of (rooms || [])) {
        const nm = r.name || '空间';
        if (r.area_m2 > 0) {
          areaRows.push({ name: `${nm} · 地面铺装`, unit: '㎡', qty: r.area_m2, price: 0, desc: `按 ${nm} 面积 ${r.area_m2}㎡ 自动生成（请填单价）`, source: 'spatial' });
        }
        if (r.area_m2 > 0) {
          areaRows.push({ name: `${nm} · 墙面粉刷`, unit: '㎡', qty: Math.round(r.area_m2 * 2.6), price: 0, desc: `按 ${nm} 面积 × 层高 2.6m（请填单价）`, source: 'spatial' });
        }
        if (r.perimeter > 0) {
          wallRows.push({ name: `${nm} · 吊顶/石膏线`, unit: '米', qty: r.perimeter, price: 0, desc: `按 ${nm} 周长（请填单价）`, source: 'spatial' });
        }
      }
      n += b.pushRows('c07', areaRows);   // 泥瓦工程
      n += b.pushRows('c09', wallRows);   // 涂饰工程
      return { ok: true, rows: n, tip: '已生成条目（单价为 0，请补填后计价）' };
    },

    /** AI 户型：把 AI 输出转报价行 */
    pushAI(aiResult, rates) {
      const b = bridge(); if (!b) return { ok: false, reason: '未连到引擎' };
      const R = Object.assign({ floor: 0, wall: 0, ceiling: 0 }, rates || {});
      const rows = { c07: [], c09: [], c08: [] };
      for (const rm of (aiResult.rooms || [])) {
        const a = Number(rm.area_m2 || 0);
        const per = Number(rm.perimeter || 0) || (a ? 2 * (Number(rm.length_m) + Number(rm.width_m)) : 0);
        if (a > 0) rows.c07.push({ name: `${rm.name} · 地面铺装`, unit: '㎡', qty: a, price: R.floor, desc: `AI 识别 ${rm.name} ${rm.length_m}m×${rm.width_m}m`, source: 'ai' });
        if (a > 0) rows.c09.push({ name: `${rm.name} · 墙面`, unit: '㎡', qty: Math.round(a * 2.6), price: R.wall, desc: `AI 识别面积 × 2.6m 层高`, source: 'ai' });
        if (per > 0) rows.c08.push({ name: `${rm.name} · 顶面`, unit: '㎡', qty: a, price: R.ceiling, desc: `AI 识别面积`, source: 'ai' });
      }
      let n = 0;
      for (const cid of Object.keys(rows)) n += b.pushRows(cid, rows[cid]);
      return { ok: true, rows: n, tip: `已生成 ${n} 条（单价按传入 rates 填）` };
    },

    /** 数字存证：给当前工程签名 */
    sign() {
      const b = bridge(); if (!b) return { ok: false, reason: '未连到引擎' };
      const snap = JSON.parse(b.snapshot());
      return { ok: true, payload: { format: 'YUNSHU_QUOTE_PROJECT', formatVersion: 1, project: snap, summary: b.calc() } };
    },

    /** 业主分享：生成可分享载荷 */
    sharePayload() {
      const b = bridge(); if (!b) return { ok: false, reason: '未连到引擎' };
      const snap = JSON.parse(b.snapshot());
      const c = b.calc();
      return {
        ok: true,
        payload: {
          projectInfo: snap.projectInfo,
          company: snap.company,
          categories: snap.categories.map(cat => ({
            id: cat.id,
            cn: (global.QE && global.QE.catDef(cat.id) || {}).cn || cat.id,
            items: cat.items.map(i => ({ name: i.name, unit: i.unit, qty: i.qty, price: i.price, _amount: i._amount }))
          })),
          summary: c
        }
      };
    },

    /** 三方协作：广播变更 */
    broadcast(reason) {
      const b = bridge(); if (!b) return false;
      try {
        if (global.opener && global.opener.__collabBroadcast) global.opener.__collabBroadcast(b.snapshot(), reason);
        return true;
      } catch (e) { return false; }
    },

    /** 克隆 ZIP：用真实费率 + 定额库 */
    clonePayload() {
      const b = bridge(); if (!b) return { ok: false, reason: '未连到引擎' };
      const QE = global.QE || (global.opener && global.opener.QE);
      if (!QE) return { ok: false, reason: '引擎未就绪' };
      return {
        ok: true,
        settings: Object.assign({ companyName: QE.company.companyName }, QE.fees),
        library: { fileType: 'YUNSHANG_QUOTA_LIBRARY', version: 1, categories: QE.state.quota.categories, libraries: [], materialTables: [] }
      };
    }
  };

  global.YSAdapter = Adapter;
  if (typeof module !== 'undefined' && module.exports) module.exports = Adapter;
})(typeof window !== 'undefined' ? window : globalThis);