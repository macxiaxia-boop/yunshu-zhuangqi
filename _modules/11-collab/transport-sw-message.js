/* transport-sw-message.js — Service Worker transport (cross-origin mock)
 * R31202 · Module 11 · 🅱️ yunshu-zhuangqi
 * Registers a Service Worker; SW relays messages between clients (broadcast to peers).
 * In mock/demo: SW relays within same origin between tabs (supplements BroadcastChannel).
 * Degrades gracefully if SW unsupported — caller falls back to BroadcastChannel.
 */
(function (root) {
  'use strict';

  var SW_PATH = './collab-sw.js';
  var REGISTRY = {};

  function isSupported() {
    return (typeof navigator !== 'undefined') &&
           ('serviceWorker' in navigator);
  }

  function register(roomId) {
    if (!isSupported()) {
      return Promise.resolve({ ok: false, reason: 'SW_UNSUPPORTED', transport: makeFallback() });
    }
    // Avoid double-register
    if (REGISTRY[roomId] && REGISTRY[roomId].registration) {
      return Promise.resolve({ ok: true, reason: 'REUSED', transport: REGISTRY[roomId].transport });
    }
    return navigator.serviceWorker.register(SW_PATH, { scope: './' })
      .then(function (reg) {
        var transport = makeTransport(reg, roomId);
        REGISTRY[roomId] = { registration: reg, transport: transport };
        return { ok: true, reason: 'REGISTERED', transport: transport };
      })
      .catch(function (err) {
        return { ok: false, reason: 'REGISTER_FAILED', error: String(err && err.message || err), transport: makeFallback() };
      });
  }

  function makeTransport(reg, roomId) {
    var transport = {
      registration: reg,
      roomId: roomId,
      supported: true,
      onMessage: null,
      post: function (msg) {
        // Wrap and post to SW; SW will broadcast to other clients
        try {
          if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage(Object.assign({ __ysCollab: true, roomId: roomId }, msg));
          } else if (reg && reg.active) {
            reg.active.postMessage(Object.assign({ __ysCollab: true, roomId: roomId }, msg));
          }
        } catch (e) { /* swallow */ }
      },
      close: function () {
        // Don't unregister; just detach listener
        try {
          if (transport._listener && navigator.serviceWorker) {
            navigator.serviceWorker.removeEventListener('message', transport._listener);
          }
        } catch (e) { /* swallow */ }
        transport._listener = null;
      }
    };
    if (navigator.serviceWorker) {
      transport._listener = function (ev) {
        var data = ev && ev.data;
        if (!data || !data.__ysCollab) return;
        if (data.roomId && roomId && data.roomId !== roomId) return;
        if (typeof transport.onMessage === 'function') {
          try { transport.onMessage(data); } catch (e) { /* swallow */ }
        }
      };
      navigator.serviceWorker.addEventListener('message', transport._listener);
    }
    return transport;
  }

  function makeFallback() {
    return {
      supported: false,
      onMessage: null,
      post: function () { /* no-op */ },
      close: function () { /* no-op */ }
    };
  }

  // Inject registration for test env (Node.js sandbox doesn't have SW)
  function registerWith(roomId, fakeSW) {
    if (!fakeSW || typeof fakeSW.postMessage !== 'function') {
      return Promise.resolve({ ok: false, reason: 'NO_INJECT', transport: makeFallback() });
    }
    var transport = {
      supported: true,
      injected: true,
      roomId: roomId,
      onMessage: null,
      post: function (msg) {
        try { fakeSW.postMessage(Object.assign({ __ysCollab: true, roomId: roomId }, msg)); }
        catch (e) { /* swallow */ }
      },
      close: function () { /* no-op */ }
    };
    REGISTRY[roomId] = { registration: { active: fakeSW }, transport: transport };
    return Promise.resolve({ ok: true, reason: 'INJECTED', transport: transport });
  }

  function unregister(roomId) {
    var r = REGISTRY[roomId];
    if (!r) return Promise.resolve(false);
    delete REGISTRY[roomId];
    if (r.registration && r.registration.unregister) {
      return r.registration.unregister().then(function () { return true; }).catch(function () { return false; });
    }
    return Promise.resolve(true);
  }

  // SW source code (string) — auto-injected when browser lacks the file.
  // Pure message relay: echoes incoming __ysCollab messages to ALL clients except sender.
  var SW_SOURCE = [
    "/* collab-sw.js — auto-installed by transport-sw-message.js */",
    "self.addEventListener('install', function (e) { self.skipWaiting(); });",
    "self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });",
    "self.addEventListener('message', function (ev) {",
    "  var data = ev.data; if (!data || !data.__ysCollab) return;",
    "  var roomId = data.roomId;",
    "  self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(function (list) {",
    "    list.forEach(function (c) {",
    "      if (c.id === ev.source && ev.source && ev.source.id) return;",
    "      try { c.postMessage(data); } catch (e) {}",
    "    });",
    "  });",
    "});"
  ].join('\n');

  // Inline-installer: blob-registers SW_SOURCE so demo works without a real .js file.
  function registerInline(roomId) {
    if (!isSupported()) {
      return Promise.resolve({ ok: false, reason: 'SW_UNSUPPORTED', transport: makeFallback() });
    }
    if (REGISTRY[roomId] && REGISTRY[roomId].registration) {
      return Promise.resolve({ ok: true, reason: 'REUSED', transport: REGISTRY[roomId].transport });
    }
    try {
      var blob = new Blob([SW_SOURCE], { type: 'application/javascript' });
      var url = URL.createObjectURL(blob);
      return navigator.serviceWorker.register(url, { scope: './' })
        .then(function (reg) {
          var transport = makeTransport(reg, roomId);
          REGISTRY[roomId] = { registration: reg, transport: transport };
          setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 5000);
          return { ok: true, reason: 'INLINE_REGISTERED', transport: transport };
        })
        .catch(function (err) {
          return { ok: false, reason: 'INLINE_FAILED', error: String(err && err.message || err), transport: makeFallback() };
        });
    } catch (e) {
      return Promise.resolve({ ok: false, reason: 'BLOB_UNSUPPORTED', error: String(e && e.message || e), transport: makeFallback() });
    }
  }

  root.YSCollabTransportSW = {
    register: register,
    registerInline: registerInline,
    registerWith: registerWith,
    unregister: unregister,
    isSupported: isSupported,
    SW_SOURCE: SW_SOURCE,
    _REGISTRY: REGISTRY
  };

})(typeof window !== 'undefined' ? window : this);