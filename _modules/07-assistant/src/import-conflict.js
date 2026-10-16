// import-conflict.js — 冲突检测 + IndexedDB 备份 + 回滚
// 必须先做 IndexedDB 快照，确认提交才允许修改原报价
'use strict';

const DB_NAME = 'yunshu-assistant';
const DB_VERSION = 1;
const STORE_BACKUP = 'backups';
const STORE_SESSION = 'sessions';

// IndexedDB 抽象（Promise 化）
function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB 不可用'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_BACKUP)) {
        db.createObjectStore(STORE_BACKUP, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SESSION)) {
        db.createObjectStore(STORE_SESSION, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function _put(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
  });
}

async function _get(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function _getAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function _del(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// === 1. 重复检测 ===
// 按 name+unit 聚合，qty 累加；其他字段保留首次出现的值
function detectDuplicates(items) {
  const groups = new Map();
  const duplicates = [];
  for (const item of items) {
    const key = `${(item.name || '').trim()}|${(item.unit || '').trim()}`;
    if (groups.has(key)) {
      const existing = groups.get(key);
      const prevQty = parseFloat(existing.qty) || 0;
      const curQty = parseFloat(item.qty) || 0;
      existing.qty = prevQty + curQty;
      existing._count = (existing._count || 1) + 1;
      existing._sources = existing._sources || [{ qty: prevQty, source: existing.sourceSheet || '' }];
      existing._sources.push({ qty: curQty, source: item.sourceSheet || '' });
      duplicates.push({ ...item, mergedInto: existing.id });
    } else {
      const copy = { ...item };
      copy._count = 1;
      copy._sources = [{ qty: parseFloat(item.qty) || 0, source: item.sourceSheet || '' }];
      groups.set(key, copy);
    }
  }
  return {
    merged: Array.from(groups.values()),
    duplicates,
    duplicateCount: duplicates.length,
  };
}

// === 2. 缺失检测 ===
// 缺单位 → warning；缺价格 → warning；价格为 0 → warning（主材基装都算）
function detectMissing(items) {
  const warnings = [];
  for (const item of items) {
    const issues = [];
    if (!item.unit || String(item.unit).trim() === '') {
      issues.push('missing_unit');
    }
    if (item.price == null || item.price === '' || (typeof item.price === 'number' && isNaN(item.price))) {
      issues.push('missing_price');
    } else if (Number(item.price) <= 0) {
      issues.push('zero_price');
    }
    if (!item.name || String(item.name).trim() === '') {
      issues.push('missing_name');
    }
    if (issues.length > 0) {
      warnings.push({
        item: { ...item },
        issues,
        severity: issues.includes('missing_name') ? 'error' : 'warning',
      });
    }
  }
  return {
    warnings,
    warningCount: warnings.length,
    hasErrors: warnings.some((w) => w.severity === 'error'),
  };
}

// === 3. 备份当前报价到 IndexedDB ===
async function backupCurrentProject(data, projectId) {
  const stamp = Date.now();
  const backup = {
    id: `before-import-${projectId || 'default'}-${stamp}`,
    timestamp: stamp,
    projectId: projectId || 'default',
    data: JSON.parse(JSON.stringify(data)), // 深拷贝
    note: '智能助手导入前快照',
  };
  await _put(STORE_BACKUP, backup);
  return backup.id;
}

// === 4. 提交导入 ===
// 把 items 写入 data.libCategories[category].library；若 category 已存在则追加
// 重复 ID 检测：若新生成 id 与现有冲突则改名
function commitImport(data, items, categoryId) {
  if (!data || typeof data !== 'object') throw new Error('data 必须为对象');
  if (!Array.isArray(data.libCategories)) data.libCategories = [];

  let target = data.libCategories.find((c) => c.id === categoryId);
  if (!target) {
    target = { id: categoryId, library: [] };
    data.libCategories.push(target);
  }
  if (!Array.isArray(target.library)) target.library = [];

  const beforeLen = target.library.length;
  const existingIds = new Set(target.library.map((it) => it.id));
  let added = 0;
  let conflicts = [];
  const now = Date.now();

  for (const it of items) {
    let id = it.id;
    if (!id || existingIds.has(id)) {
      id = `imp-${categoryId}-${now}-${added}`;
    }
    existingIds.add(id);
    const cleanItem = {
      ...it,
      id,
      userPriceOverride: true, // 强制保留人工单价
      importedAt: now,
    };
    target.library.push(cleanItem);
    added++;
  }

  return {
    success: true,
    categoryId,
    added,
    beforeLen,
    afterLen: target.library.length,
    conflicts,
  };
}

// === 5. 回滚 ===
// 通过 backupId 恢复 data（必须先做备份才能回滚）
async function rollback(backupId) {
  const backup = await _get(STORE_BACKUP, backupId);
  if (!backup) throw new Error(`备份 ${backupId} 不存在`);
  return JSON.parse(JSON.stringify(backup.data));
}

// === 6. 列出所有备份 ===
async function listBackups() {
  const all = await _getAll(STORE_BACKUP);
  return all.sort((a, b) => b.timestamp - a.timestamp);
}

// === 7. 删除备份 ===
async function deleteBackup(backupId) {
  return _del(STORE_BACKUP, backupId);
}

const api = {
  detectDuplicates,
  detectMissing,
  backupCurrentProject,
  commitImport,
  rollback,
  listBackups,
  deleteBackup,
  DB_NAME,
  STORE_BACKUP,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
  // 注入 _internals 仅供测试
  module.exports._internals = { openDB, _put, _get, _getAll, _del };
}
if (typeof window !== 'undefined') {
  window.ImportConflict = api;
}
