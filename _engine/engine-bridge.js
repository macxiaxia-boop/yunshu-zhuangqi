/*!
 * yunshu-zhuangqi · 引擎 ↔ 模块 桥
 *
 * 让 13 个模块能读写真实报价数据（不再是无壳演示）
 *
 * 用法（模块侧）：
 *   <script src="../_engine/engine-bridge.js"></script>
 *   const bridge = YSBridge.connect('spatial');
 *   bridge.pushRows('c07', [{ name:'地砖铺贴', unit:'㎡', qty:98, price:56 }]);
 *
 * 用法（引擎侧自动提供）：window.QE_BRIDGE
 */
(function (global) {
  'use strict';

  function getEngine() {
    // 优先 opener（模块在子窗口）
    const openerEngine = (function () {
      try { return global.opener && global.opener.QE; } catch (e) { return null; }
    })();
    if (openerEngine) return openerEngine;
    // 再找 parent
    try { if (global.parent && global.parent !== global && global.parent.QE) return global.parent.QE; } catch (e) {}
    // 自己也加载了引擎
    return global.QE || null;
  }

  const YSBridge = {
    /** 模块侧：连到引擎（父窗口）。返回 null 表示没连上 */
    connect(moduleKey) {
      const QE = getEngine();
      if (!QE) {
        console.warn('[YSBridge] 未找到报价引擎 — 请从 engine.html 打开本模块');
        return null;
      }
      const target = global.opener || global.parent;
      if (!target || !target.QE_BRIDGE) {
        // 同窗口场景：直接操作
        return this._local(QE, moduleKey);
      }
      return {
        QE,
        moduleKey,
        /** 读：当前工程快照 */
        snapshot() { return target.QE_BRIDGE.snapshot(); },
        calc() { return target.QE_BRIDGE.calc(); },
        info() { return target.QE_BRIDGE.info(); },
        /** 写：往某分类加行 */
        pushRows(categoryId, rows) { return target.QE_BRIDGE.pushRows(categoryId, rows); },
        /** 写：批量加（自动按分类名映射） */
        pushAuto(mapping) { return target.QE_BRIDGE.pushAuto(mapping); },
        /** 写：加增项 */
        pushChange(kind, row) { return target.QE_BRIDGE.pushChange(kind, row); },
        /** 写：设费率 */
        setFee(k, v) { return target.QE_BRIDGE.setFee(k, v); },
        /** 写：设项目资料 */
        setInfo(patch) { return target.QE_BRIDGE.setInfo(patch); },
        /** 写：导出 JSON（引擎侧保存为档案） */
        saveProject() { return target.QE_BRIDGE.saveProject(); },
        /** 定位：跳到某分类 */
        focus(categoryId) { return target.QE_BRIDGE.focus(categoryId); }
      };
    },

    /** 同窗口：直接 API */
    _local(QE, moduleKey) {
      return {
        QE, moduleKey,
        snapshot: () => QE.toJSON(false),
        calc: () => QE.calc(),
        info: () => JSON.parse(JSON.stringify(QE.projectInfo)),
        pushRows: (cid, rows) => { let n = 0; for (const r of (rows || [])) { QE.ops.addRow(cid, r); n++; } return n; },
        pushAuto: (mapping) => {
          let n = 0;
          for (const [cid, rows] of Object.entries(mapping || {})) { n += (rows || []).length; for (const r of rows) QE.ops.addRow(cid, r); }
          return n;
        },
        pushChange: (kind, row) => QE.ops.addChange(kind, row),
        setFee: (k, v) => QE.ops.setFee(k, v),
        setInfo: (p) => QE.ops.setInfo(p),
        saveProject: () => QE.store.saveProject(),
        focus: () => {}
      };
    },

    /** 引擎侧：安装桥（供子窗口调用） */
    install() {
      const QE = getEngine();
      if (!QE) return null;
      global.QE_BRIDGE = {
        snapshot: () => QE.toJSON(false),
        calc: () => QE.calc(),
        info: () => JSON.parse(JSON.stringify(QE.projectInfo)),
        pushRows: (cid, rows) => { let n = 0; for (const r of (rows || [])) { QE.ops.addRow(cid, r); n++; } return n; },
        pushAuto: (mapping) => {
          let n = 0;
          for (const [cid, rows] of Object.entries(mapping || {})) { for (const r of (rows || [])) { QE.ops.addRow(cid, r); n++; } }
          return n;
        },
        pushChange: (kind, row) => QE.ops.addChange(kind, row),
        setFee: (k, v) => QE.ops.setFee(k, v),
        setInfo: (p) => QE.ops.setInfo(p),
        saveProject: () => QE.store.saveProject(),
        focus: (cid) => { if (global.__engineGo) global.__engineGo(cid); }
      };
      return global.QE_BRIDGE;
    }
  };

  global.YSBridge = YSBridge;
  if (typeof module !== 'undefined' && module.exports) module.exports = YSBridge;

  // 引擎侧自动安装
  if (global.QE && !global.opener) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => YSBridge.install());
    else YSBridge.install();
  }
})(typeof window !== 'undefined' ? window : globalThis);