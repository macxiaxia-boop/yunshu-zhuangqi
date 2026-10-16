/* index-backup.js — IndexedDB 自动备份 + 回滚 + 重试 pending 标记
 * 用途: apply() 之前快照 'before-import',失败时回滚
 * Exposes window.YSCloneBackup
 *
 * Schema:
 *   db: ys-clone-backups-v1 (objectStore: backups, keyPath: id)
 *   records: { id: 'before-import' | 'pending', snapshot: {...}, createdAt: ISO }
 *   snapshot = { records: {key: value}, current: {...}, resourceFiles: [...], oldCurrent: string|null, createdAt: ISO }
 */
(function (global) {
  'use strict';

  const DB_NAME = 'ys-clone-backups-v1';
  const STORE = 'backups';
  const VERSION = 1;

  // 打开 IndexedDB (Promise 包装)
  function openDB() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB 不可用 (浏览器?)'));
        return;
      }
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB 打开失败')); };
    });
  }

  // 通用事务: mode = 'readonly' | 'readwrite'
  function txAction(mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result;
        const req = fn(store);
        if (req && req.onsuccess !== undefined) {
          req.onsuccess = function () { result = req.result; };
        }
        t.oncomplete = function () {
          db.close();
          resolve(result);
        };
        t.onerror = function () {
          db.close();
          reject(t.error || new Error('IndexedDB 事务失败'));
        };
        t.onabort = function () {
          db.close();
          reject(t.error || new Error('IndexedDB 事务中止'));
        };
      });
    });
  }

  // 写入快照
  function putBackup(id, snapshot) {
    return txAction('readwrite', function (s) {
      return s.put({ id: id, snapshot: snapshot, createdAt: new Date().toISOString() });
    });
  }

  // 读取快照
  function getBackup(id) {
    return txAction('readonly', function (s) {
      return s.get(id);
    });
  }

  // 删除快照
  function deleteBackup(id) {
    return txAction('readwrite', function (s) {
      return s.delete(id);
    });
  }

  // 列出所有快照 id
  function listBackups() {
    return txAction('readonly', function (s) {
      return s.getAllKeys();
    });
  }

  // 捕获当前状态 (供 apply 前快照)
  // records: managed keys list
  function captureCurrent(managed, currentData, resourceFiles, oldCurrent) {
    const records = {};
    for (const k of managed) {
      const v = localStorage.getItem(k);
      if (v !== null) records[k] = v;
      else records[k] = null;
    }
    return {
      records: records,
      current: currentData ? JSON.parse(JSON.stringify(currentData)) : null,
      resourceFiles: Array.isArray(resourceFiles) ? resourceFiles.slice() : undefined,
      oldCurrent: oldCurrent !== undefined ? oldCurrent : (localStorage.getItem('rm_current_data') || null),
      createdAt: new Date().toISOString()
    };
  }

  // 恢复 records 到 localStorage
  function restoreRecords(snapshot) {
    if (!snapshot || !snapshot.records) throw new Error('snapshot 缺失');
    for (const k of Object.keys(snapshot.records)) {
      const v = snapshot.records[k];
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    }
  }

  // apply 包装: 失败回滚
  async function safeApply(managed, currentData, config, applyFn) {
    // 1. 捕获当前
    const before = captureCurrent(managed, currentData);
    // 2. 写入 'before-import' 备份
    await putBackup('before-import', before);
    // 3. 写入 'pending' 标记 (重试用)
    await putBackup('pending', before);
    let resourceFilesRolledBack = false;
    try {
      // 4. 执行 apply
      const result = await applyFn(config);
      // 5. 清除 pending
      await deleteBackup('pending');
      return result;
    } catch (e) {
      // 6. 回滚
      try {
        if (before.resourceFiles !== undefined && global.YSCloneResources) {
          await global.YSCloneResources.unpackResources(before.resourceFiles);
          resourceFilesRolledBack = true;
        }
      } catch (re) { /* 资源回滚失败 */ }
      try {
        restoreRecords(before);
        if (before.oldCurrent === null) localStorage.removeItem('rm_current_data');
        else localStorage.setItem('rm_current_data', before.oldCurrent);
      } catch (re2) { /* 记录回滚失败 */ }
      try { await deleteBackup('pending'); } catch (re3) { /* 标记清理失败 */ }
      throw e;
    }
  }

  // 启动时检查 pending (上一次未完成导入)
  async function checkPending(managed, applyFn) {
    try {
      const p = await getBackup('pending');
      if (!p) return { ok: true, pending: false };
      // 上次未完成 → 回滚
      restoreRecords(p.snapshot);
      await deleteBackup('pending');
      if (applyFn) await applyFn();
      return { ok: true, pending: true, message: '检测到上次克隆导入未完成,已恢复导入前设置' };
    } catch (e) {
      return { ok: false, pending: false, error: e.message };
    }
  }

  // 恢复最近一次导入前设置 (手动触发)
  async function restoreLastImport(managed) {
    const b = await getBackup('before-import');
    if (!b) throw new Error('没有可恢复的导入前设置');
    restoreRecords(b.snapshot);
    if (b.snapshot.oldCurrent === null) localStorage.removeItem('rm_current_data');
    else if (b.snapshot.oldCurrent) localStorage.setItem('rm_current_data', b.snapshot.oldCurrent);
    return { ok: true, restoredAt: b.createdAt };
  }

  global.YSCloneBackup = Object.freeze({
    DB_NAME: DB_NAME,
    STORE: STORE,
    openDB: openDB,
    putBackup: putBackup,
    getBackup: getBackup,
    deleteBackup: deleteBackup,
    listBackups: listBackups,
    captureCurrent: captureCurrent,
    restoreRecords: restoreRecords,
    safeApply: safeApply,
    checkPending: checkPending,
    restoreLastImport: restoreLastImport
  });
})(typeof window !== 'undefined' ? window : globalThis);
