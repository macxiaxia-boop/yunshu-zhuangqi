/* transport-broadcastchannel.js — Same-browser cross-tab transport
 * R31202 · Module 11 · 🅱️ yunshu-zhuangqi
 * BroadcastChannel('yunshu-collab-<roomId>') — zero-server, zero-cost dev/demo.
 * Falls back to no-op if BroadcastChannel unavailable.
 */
(function (root) {
  'use strict';

  function channelName(roomId) {
    return 'yunshu-collab-' + roomId;
  }

  function create(roomId) {
    if (typeof BroadcastChannel === 'undefined') {
      return {
        post: function () { /* no-op */ },
        close: function () { /* no-op */ },
        onMessage: null,
        supported: false,
        channel: null
      };
    }
    var ch = new BroadcastChannel(channelName(roomId));
    var transport = {
      channel: ch,
      supported: true,
      onMessage: null,
      post: function (msg) {
        try { ch.postMessage(msg); } catch (e) { /* swallow */ }
      },
      close: function () {
        try { ch.close(); } catch (e) { /* swallow */ }
        transport.channel = null;
      }
    };
    ch.onmessage = function (ev) {
      if (typeof transport.onMessage === 'function') {
        try { transport.onMessage(ev.data); } catch (e) { /* swallow handler error */ }
      }
    };
    return transport;
  }

  // Test-friendly: allow injection
  function createWith(roomId, mockBroadcastChannel) {
    if (!mockBroadcastChannel || typeof mockBroadcastChannel !== 'function') return create(roomId);
    var ch = new mockBroadcastChannel(channelName(roomId));
    var transport = {
      channel: ch,
      supported: true,
      onMessage: null,
      post: function (msg) {
        try { ch.postMessage(msg); } catch (e) { /* swallow */ }
      },
      close: function () {
        try { ch.close(); } catch (e) { /* swallow */ }
        transport.channel = null;
      }
    };
    if (ch && ch.addEventListener) {
      ch.addEventListener('message', function (ev) {
        if (typeof transport.onMessage === 'function') {
          try { transport.onMessage(ev.data); } catch (e) { /* swallow */ }
        }
      });
    }
    return transport;
  }

  root.YSCollabTransportBroadcast = {
    create: create,
    createWith: createWith,
    channelName: channelName
  };

})(typeof window !== 'undefined' ? window : this);