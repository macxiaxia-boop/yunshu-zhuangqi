/* collab-presence.js — Heartbeat + online peer tracking
 * R31202 · Module 11 · 🅱️ yunshu-zhuangqi
 * Heartbeat every 5s · timeout 15s = offline
 * Cursor op IS the heartbeat payload (reuses transport — no extra cost)
 */
(function (root) {
  'use strict';

  var HEARTBEAT_MS = 5000;
  var TIMEOUT_MS = 15000;
  var GC_MS = 7000; // GC sweep cadence

  function now() { return Date.now(); }

  function start(room, user, transport, opts) {
    var stopped = false;
    var listeners = (opts && opts.listeners) || {};
    var tick = 0;

    function emitPeers() {
      if (typeof listeners.onPeers === 'function') {
        try { listeners.onPeers(peers(room, user.userId)); } catch (e) { /* swallow */ }
      }
    }

    function hb() {
      if (stopped) return;
      tick++;
      var payload = {
        userId: user.userId,
        userName: user.userName,
        userColor: user.userColor,
        role: user.role,
        rowId: user.cursorRowId || null,
        column: user.cursorColumn || null
      };
      // Heartbeat IS a cursor op (no separate channel)
      try {
        var op = root.YSCollabSync.cursor(room, user.userId, payload);
        if (transport && typeof transport.post === 'function') transport.post({ kind: 'op', op: op });
      } catch (e) { /* swallow */ }
      emitPeers();
    }

    hb(); // immediate first beat
    var hbTimer = setInterval(hb, HEARTBEAT_MS);
    var gcTimer = setInterval(function () {
      if (stopped) return;
      gc(room, user.userId);
      emitPeers();
    }, GC_MS);

    function stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(hbTimer);
      clearInterval(gcTimer);
      // Remove self from cursors
      if (room.cursors) delete room.cursors[user.userId];
    }

    return {
      stop: stop,
      peers: function () { return peers(room, user.userId); },
      isOnline: function (uid) { return isOnline(room, uid); }
    };
  }

  function isOnline(room, userId) {
    var c = room.cursors && room.cursors[userId];
    if (!c) return false;
    return (now() - (c.lastSeen || 0)) < TIMEOUT_MS;
  }

  function gc(room, selfUserId) {
    if (!room.cursors) return 0;
    var removed = 0;
    Object.keys(room.cursors).forEach(function (uid) {
      if (uid === selfUserId) return;
      var c = room.cursors[uid];
      if (now() - (c.lastSeen || 0) > TIMEOUT_MS) {
        delete room.cursors[uid];
        removed++;
      }
    });
    return removed;
  }

  function peers(room, selfUserId) {
    var list = [];
    if (!room.cursors) return list;
    Object.keys(room.cursors).forEach(function (uid) {
      var c = room.cursors[uid];
      var online = (now() - (c.lastSeen || 0)) < TIMEOUT_MS;
      list.push({
        userId: uid,
        userName: c.userName,
        userColor: c.userColor,
        role: c.role,
        rowId: c.rowId || null,
        column: c.column || null,
        online: online,
        lastSeen: c.lastSeen || 0,
        isSelf: uid === selfUserId
      });
    });
    list.sort(function (a, b) { return b.lastSeen - a.lastSeen; });
    return list;
  }

  function updateCursor(user, rowId, column) {
    user.cursorRowId = rowId;
    user.cursorColumn = column;
  }

  root.YSCollabPresence = {
    start: start,
    stop: function () { /* placeholder */ },
    isOnline: isOnline,
    peers: peers,
    gc: gc,
    updateCursor: updateCursor,
    HEARTBEAT_MS: HEARTBEAT_MS,
    TIMEOUT_MS: TIMEOUT_MS,
    GC_MS: GC_MS
  };

})(typeof window !== 'undefined' ? window : this);