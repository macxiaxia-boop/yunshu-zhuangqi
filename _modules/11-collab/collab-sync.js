/* collab-sync.js — CRDT-style sync (LWW + operation log)
 * R31202 · Module 11 · 🅱️ yunshu-zhuangqi
 * Data model: JSON tree of {projectInfo, categories[], totals}
 * Ops: setField / addRow / removeRow / updateRow / cursor
 * Conflict: Last-Write-Wins by version (syncVersion monotonic)
 * Replay-safe: ops are idempotent given same opId (early return).
 */
(function (root) {
  'use strict';

  var MAX_OPS = 1000;

  function nextVersion(room) {
    room.syncVersion = (room.syncVersion || 0) + 1;
    return room.syncVersion;
  }

  function newOpId(room, userId) {
    return 'op_' + room.syncVersion + '_' + userId + '_' + Math.floor(Math.random() * 100000);
  }

  function trimLog(room) {
    if (room.operations.length > MAX_OPS) {
      room.operations = room.operations.slice(-MAX_OPS);
    }
  }

  function applySetField(room, op) {
    var p = op.path; // dot-path: "projectInfo.companyName"
    if (!p) return false;
    var segs = p.split('.');
    var node = room.snapshot;
    for (var i = 0; i < segs.length - 1; i++) {
      if (node[segs[i]] == null || typeof node[segs[i]] !== 'object') node[segs[i]] = {};
      node = node[segs[i]];
    }
    node[segs[segs.length - 1]] = op.value;
    return true;
  }

  function findCategory(room, categoryId) {
    var cats = room.snapshot.categories || [];
    for (var i = 0; i < cats.length; i++) if (cats[i].id === categoryId) return cats[i];
    return null;
  }

  function applyAddRow(room, op) {
    var cat = findCategory(room, op.categoryId);
    if (!cat) return false;
    var row = Object.assign({ id: op.rowId || 'r_' + Math.random().toString(36).slice(2, 10) }, op.row || {});
    cat.items = cat.items || [];
    // Dedup by id
    for (var i = 0; i < cat.items.length; i++) if (cat.items[i].id === row.id) return true;
    cat.items.push(row);
    return true;
  }

  function applyRemoveRow(room, op) {
    var cats = room.snapshot.categories || [];
    for (var ci = 0; ci < cats.length; ci++) {
      var items = cats[ci].items || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === op.rowId) {
          items.splice(i, 1);
          return true;
        }
      }
    }
    return false;
  }

  function applyUpdateRow(room, op) {
    var cats = room.snapshot.categories || [];
    for (var ci = 0; ci < cats.length; ci++) {
      var items = cats[ci].items || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === op.rowId) {
          Object.assign(items[i], op.patch || {});
          return true;
        }
      }
    }
    return false;
  }

  function applyCursor(room, op) {
    room.cursors = room.cursors || {};
    room.cursors[op.userId] = {
      userId: op.userId,
      userName: op.userName,
      userColor: op.userColor,
      role: op.role,
      rowId: op.rowId || null,
      column: op.column || null,
      lastSeen: Date.now()
    };
    return true;
  }

  // ---- Public: buildOp ----
  function buildOp(room, userId, type, payload) {
    var ver = nextVersion(room);
    var op = {
      opId: newOpId(room, userId),
      userId: userId,
      type: type,
      version: ver,
      ts: Date.now(),
      payload: payload
    };
    // applyOp handles dedup + staleness check + push to log atomically
    applyOp(room, op);
    return op;
  }

  // ---- Public: applyOp (idempotent) ----
  function applyOp(room, op) {
    if (!op || !op.opId) return false;
    room.operations = room.operations || [];
    // Dedup by opId
    for (var i = 0; i < room.operations.length; i++) {
      if (room.operations[i].opId === op.opId) return true; // already applied
    }
    // LWW: if an op with same path/key & higher version exists, drop this one
    if (isStale(room, op)) return false;
    var p = op.payload || {};
    var ok = false;
    switch (op.type) {
      case 'setField': ok = applySetField(room, p); break;
      case 'addRow': ok = applyAddRow(room, p); break;
      case 'removeRow': ok = applyRemoveRow(room, p); break;
      case 'updateRow': ok = applyUpdateRow(room, p); break;
      case 'cursor': ok = applyCursor(room, p); break;
      default: return false;
    }
    if (!ok) return false;
    room.operations.push(op);
    if (op.version > (room.syncVersion || 0)) room.syncVersion = op.version;
    trimLog(room);
    return true;
  }

  function isStale(room, op) {
    // LWW: if there's a NEWER prev op with same target, drop incoming op
    var p = op.payload || {};
    var sameField = (op.type === 'setField' && p.path);
    var sameRow = ((op.type === 'updateRow' || op.type === 'removeRow') && p.rowId);
    if (!sameField && !sameRow) return false;
    for (var i = 0; i < room.operations.length; i++) {
      var prev = room.operations[i];
      // Skip prev ops that are older or same version (don't make us stale)
      if (prev.version <= op.version) continue;
      if (op.type !== prev.type) continue;
      if (sameField && prev.payload && prev.payload.path === p.path) return true;
      if (sameRow && prev.payload && prev.payload.rowId === p.rowId) return true;
    }
    return false;
  }

  // ---- Convenience helpers ----
  function setField(room, userId, path, value) {
    return buildOp(room, userId, 'setField', { path: path, value: value });
  }

  function addRow(room, userId, categoryId, row) {
    var rowId = row && row.id ? row.id : 'r_' + Math.random().toString(36).slice(2, 10);
    return buildOp(room, userId, 'addRow', { categoryId: categoryId, rowId: rowId, row: row });
  }

  function removeRow(room, userId, rowId) {
    return buildOp(room, userId, 'removeRow', { rowId: rowId });
  }

  function updateRow(room, userId, rowId, patch) {
    return buildOp(room, userId, 'updateRow', { rowId: rowId, patch: patch });
  }

  function cursor(room, userId, payload) {
    return buildOp(room, userId, 'cursor', Object.assign({ userId: userId }, payload));
  }

  // ---- Bulk replay (offline catchup) ----
  function replayOps(room, ops) {
    var applied = 0;
    if (!Array.isArray(ops)) return 0;
    // Sort by version asc for deterministic order
    var sorted = ops.slice().sort(function (a, b) { return (a.version || 0) - (b.version || 0); });
    for (var i = 0; i < sorted.length; i++) {
      if (applyOp(room, sorted[i])) applied++;
    }
    return applied;
  }

  function history(room, limit) {
    var ops = room.operations || [];
    var n = typeof limit === 'number' ? limit : 50;
    return ops.slice(-n);
  }

  root.YSCollabSync = {
    buildOp: buildOp,
    applyOp: applyOp,
    setField: setField,
    addRow: addRow,
    removeRow: removeRow,
    updateRow: updateRow,
    cursor: cursor,
    replayOps: replayOps,
    history: history,
    nextVersion: nextVersion,
    isStale: isStale,
    MAX_OPS: MAX_OPS
  };

})(typeof window !== 'undefined' ? window : this);