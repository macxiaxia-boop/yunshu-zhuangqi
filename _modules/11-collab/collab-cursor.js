/* collab-cursor.js — Real-time cursor sync (throttled 100ms)
 * R31202 · Module 11 · 🅱️ yunshu-zhuangqi
 * - Per-user random color
 * - Position = {rowId, column}
 * - Throttle: 100ms max
 * - Renders remote cursors as colored markers + name tooltip
 */
(function (root) {
  'use strict';

  var THROTTLE_MS = 100;

  function randomColor() {
    return '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0');
  }

  function createLocalCursor(user) {
    if (!user.userColor) user.userColor = randomColor();
    return {
      userId: user.userId,
      userName: user.userName,
      userColor: user.userColor,
      role: user.role,
      rowId: null,
      column: null,
      updatedAt: 0
    };
  }

  // ---- Throttled sender ----
  function makeThrottledSender(sendFn) {
    var last = 0;
    var pending = null;
    var timer = null;

    function flush() {
      timer = null;
      if (pending) {
        var p = pending;
        pending = null;
        last = Date.now();
        try { sendFn(p.rowId, p.column); } catch (e) { /* swallow */ }
      }
    }

    return function (rowId, column) {
      var now = Date.now();
      pending = { rowId: rowId, column: column };
      var remaining = THROTTLE_MS - (now - last);
      if (remaining <= 0) {
        flush();
      } else if (!timer) {
        timer = setTimeout(flush, remaining);
      }
    };
  }

  // ---- Renderer: places colored markers in DOM ----
  function render(peer, targetEl, opts) {
    if (!targetEl) return null;
    var existing = targetEl.querySelector('[data-ys-cursor="' + cssEscape(peer.userId) + '"]');
    var marker;
    if (existing) {
      marker = existing;
    } else {
      marker = document.createElement('span');
      marker.className = 'ys-collab-cursor';
      marker.setAttribute('data-ys-cursor', peer.userId);
      marker.style.cssText = 'position:absolute;pointer-events:none;border-left:2px solid ' + peer.userColor +
        ';height:18px;display:flex;align-items:center;';
      var tip = document.createElement('span');
      tip.className = 'ys-collab-cursor-tip';
      tip.textContent = peer.userName + (peer.role ? ' (' + peer.role + ')' : '');
      tip.style.cssText = 'background:' + peer.userColor + ';color:#fff;font-size:11px;padding:1px 6px;border-radius:8px;margin-left:4px;white-space:nowrap;';
      marker.appendChild(tip);
      targetEl.appendChild(marker);
    }
    // Position by data-row + data-column attributes (set on cells by consumer)
    if (opts && typeof opts.positionFor === 'function') {
      var pos = opts.positionFor(peer);
      if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
        marker.style.left = pos.left + 'px';
        marker.style.top = pos.top + 'px';
      } else {
        marker.style.display = 'none';
      }
    }
    return marker;
  }

  function clearAll(targetEl) {
    if (!targetEl) return;
    var nodes = targetEl.querySelectorAll('[data-ys-cursor]');
    for (var i = 0; i < nodes.length; i++) {
      try { targetEl.removeChild(nodes[i]); } catch (e) { /* swallow */ }
    }
  }

  function cssEscape(s) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_\-]/g, '_');
  }

  root.YSCollabCursor = {
    randomColor: randomColor,
    createLocalCursor: createLocalCursor,
    makeThrottledSender: makeThrottledSender,
    render: render,
    clearAll: clearAll,
    THROTTLE_MS: THROTTLE_MS
  };

})(typeof window !== 'undefined' ? window : this);