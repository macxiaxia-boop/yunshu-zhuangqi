/* collab-room.js — Room model + tokens + snapshots
 * R31202 · Module 11 · 🅱️ yunshu-zhuangqi
 * V2 upgrade: extends Module 10 share-link with multi-party realtime collab.
 * Pure native (BroadcastChannel + IndexedDB + WebCrypto). No external deps.
 */
(function (root) {
  'use strict';

  // ---- Constants ----
  var BASE32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford, no I/L/O/U
  var ROOM_ID_LEN = 12;
  var TOKEN_LEN = 16;
  var MAX_OPS = 1000;

  // ---- ID generation ----
  function generateRoomId() {
    var bytes = new Uint8Array(8);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    var out = '';
    var view = new DataView(bytes.buffer);
    var num = 0;
    for (var k = 0; k < 6; k++) num = num * 256 + bytes[k];
    for (var j = ROOM_ID_LEN - 1; j >= 0; j--) {
      out = BASE32_ALPHABET[num % 32] + out;
      num = Math.floor(num / 32);
    }
    return out;
  }

  function generateToken() {
    var bytes = new Uint8Array(12);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < 12; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    var out = '';
    var view = new DataView(bytes.buffer);
    var num = 0;
    for (var k = 0; k < 8; k++) num = num * 256 + bytes[k];
    for (var j = TOKEN_LEN - 1; j >= 0; j--) {
      out = BASE32_ALPHABET[num % 32] + out;
      num = Math.floor(num / 32);
    }
    return out;
  }

  function isValidRoomId(id) {
    if (typeof id !== 'string') return false;
    if (id.length !== ROOM_ID_LEN) return false;
    return /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$/.test(id);
  }

  function isValidToken(tok) {
    if (typeof tok !== 'string') return false;
    if (tok.length !== TOKEN_LEN) return false;
    return /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{16}$/.test(tok);
  }

  function buildJoinUrl(roomId, token) {
    var origin = (typeof window !== 'undefined' && window.location)
      ? window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/')
      : 'https://yunshu-zhuangqi.com/';
    return origin + '_modules/11-collab/collab-view.html?roomId=' + roomId + '&token=' + token;
  }

  // ---- Default snapshot (empty project) ----
  function defaultSnapshot(projectName) {
    return {
      projectInfo: {
        projectName: projectName || '新报价项目',
        companyName: '',
        projectAddress: '',
        customerName: '',
        customerPhone: '',
        createDate: new Date().toISOString().slice(0, 10),
        themeColor: '#C04851'
      },
      categories: [
        { id: 'cat_main', name: '主材', items: [] },
        { id: 'cat_labor', name: '人工', items: [] },
        { id: 'cat_misc', name: '其他', items: [] }
      ],
      totals: { subTotal: 0, grandTotal: 0 }
    };
  }

  // ---- Room operations ----
  function createRoom(opts) {
    if (!opts || !opts.projectId) throw new Error('PROJECT_ID_REQUIRED');
    var ownerName = String(opts.ownerName || 'owner');
    var projectName = String(opts.projectName || '新报价项目');
    var ownerToken = generateToken();
    var roomId = generateRoomId();

    var room = {
      roomId: roomId,
      projectId: String(opts.projectId),
      projectName: projectName,
      ownerName: ownerName,
      ownerToken: ownerToken,
      tokens: [ownerToken],
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      snapshot: defaultSnapshot(projectName),
      operations: [],
      syncVersion: 0,
      cursors: {}
    };
    return {
      roomId: roomId,
      joinUrl: buildJoinUrl(roomId, ownerToken),
      ownerToken: ownerToken,
      createdAt: room.createdAt,
      _room: room
    };
  }

  function joinRoom(room, opts) {
    if (!room) throw new Error('ROOM_NOT_FOUND');
    var userName = String((opts && opts.userName) || 'guest');
    var role = (opts && opts.role === 'editor') ? 'editor' : 'viewer';
    var token = String((opts && opts.token) || '');
    if (!isValidToken(token)) throw new Error('TOKEN_INVALID');
    if (room.tokens.indexOf(token) < 0) throw new Error('TOKEN_REJECTED');

    var sessionToken = generateToken();
    var userId = 'u_' + generateRoomId().slice(0, 8);
    var userColor = '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0');

    var peers = Object.keys(room.cursors || {}).map(function (uid) {
      var c = room.cursors[uid];
      return { userId: uid, userName: c.userName, role: c.role, userColor: c.userColor, lastSeen: c.lastSeen };
    });

    return {
      sessionToken: sessionToken,
      userId: userId,
      userName: userName,
      role: role,
      userColor: userColor,
      peers: peers,
      snapshot: JSON.parse(JSON.stringify(room.snapshot)),
      history: room.operations.slice(-100),
      syncVersion: room.syncVersion
    };
  }

  function addToken(room, newToken, role) {
    if (!newToken) throw new Error('TOKEN_REQUIRED');
    if (room.tokens.indexOf(newToken) >= 0) throw new Error('TOKEN_DUPLICATE');
    room.tokens.push(newToken);
    return { ok: true, token: newToken, role: role || 'editor' };
  }

  function revokeToken(room, token) {
    var idx = room.tokens.indexOf(token);
    if (idx < 0) throw new Error('TOKEN_NOT_FOUND');
    if (token === room.ownerToken) throw new Error('CANNOT_REVOKE_OWNER');
    room.tokens.splice(idx, 1);
    return { ok: true };
  }

  function exportSnapshot(room) {
    return {
      roomId: room._room ? room._room.roomId : room.roomId,
      snapshot: JSON.parse(JSON.stringify((room._room || room).snapshot)),
      syncVersion: (room._room || room).syncVersion,
      operations: (room._room || room).operations.slice(-100)
    };
  }

  root.YSCollab = {
    createRoom: createRoom,
    joinRoom: joinRoom,
    addToken: addToken,
    revokeToken: revokeToken,
    exportSnapshot: exportSnapshot,
    isValidRoomId: isValidRoomId,
    isValidToken: isValidToken,
    generateRoomId: generateRoomId,
    generateToken: generateToken,
    defaultSnapshot: defaultSnapshot,
    MAX_OPS: MAX_OPS,
    ROOM_ID_LEN: ROOM_ID_LEN,
    TOKEN_LEN: TOKEN_LEN,
    BASE32_ALPHABET: BASE32_ALPHABET
  };

})(typeof window !== 'undefined' ? window : this);