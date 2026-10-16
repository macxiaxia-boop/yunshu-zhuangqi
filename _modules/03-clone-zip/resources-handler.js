/* resources-handler.js — 资料文件 base64 内嵌 (pack / unpack)
 * 用于 logo + 定额文件 的离线内嵌 (GitHub Pages 不支持 fetch 跨域)
 * Exposes window.YSCloneResources
 */
(function (global) {
  'use strict';

  const V = global.YSCloneValidate;
  if (!V) throw new Error('resources-handler.js 必须在 validation.js 之后加载');

  const MAX_RESOURCE_BYTES = V.MAX_RESOURCE_BYTES;
  const BASE64_RE = V.BASE64_RE;
  const SAFE_NAME_RE = /^[A-Za-z0-9._\-一-龥 ()]+$/;

  // base64 → Uint8Array
  function base64ToBytes(b64) {
    if (typeof b64 !== 'string') throw new Error('base64 不是字符串');
    if (!BASE64_RE.test(b64)) throw new Error('base64 格式错误');
    const clean = b64.replace(/[\r\n]/g, '');
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Uint8Array → base64
  function bytesToBase64(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  // 路径安全 (额外防止 ../ 路径穿越)
  function safeName(name) {
    if (typeof name !== 'string' || !name) throw new Error('name 缺失');
    if (/[\\/:*?"<>|]/.test(name)) throw new Error('name 含非法字符: ' + name);
    if (name.includes('..')) throw new Error('name 含 .. 路径穿越: ' + name);
    return name;
  }

  // File → {kind, name, base64}
  async function fileToResource(file, kind) {
    if (kind !== 'quota' && kind !== 'logo') throw new Error('kind 必须为 quota/logo');
    if (!file || !(file instanceof Blob)) throw new Error('file 不是 Blob');
    if (file.size > MAX_RESOURCE_BYTES) throw new Error('文件超过 25MB: ' + (file.name || '?'));
    const name = safeName(file.name || 'untitled');
    const buf = new Uint8Array(await file.arrayBuffer());
    const b64 = bytesToBase64(buf);
    return { kind: kind, name: name, base64: b64 };
  }

  // 多个 File 批量打包
  async function packResources(files, kind) {
    if (!Array.isArray(files)) throw new Error('files 不是数组');
    if (files.length > V.MAX_RESOURCE_FILES) throw new Error('文件数超过 200');
    const out = [];
    const seen = new Set();
    for (const f of files) {
      const r = await fileToResource(f, kind);
      const key = r.kind + '/' + r.name.toLowerCase();
      if (seen.has(key)) throw new Error('文件名重名: ' + key);
      seen.add(key);
      out.push(r);
    }
    return out;
  }

  // 恢复资源到 localStorage + IndexedDB (模拟 desktopBridge)
  async function unpackResources(arr, options) {
    if (!Array.isArray(arr)) return [];
    options = options || {};
    const results = [];
    for (const f of arr) {
      if (!f || typeof f !== 'object') throw new Error('资源条目无效');
      if (f.kind !== 'quota' && f.kind !== 'logo') throw new Error('kind 不在白名单');
      safeName(f.name);
      const bytes = base64ToBytes(f.base64);
      if (bytes.length > MAX_RESOURCE_BYTES) throw new Error('资源超过 25MB: ' + f.name);
      const key = 'ys_clone_resource_' + f.kind + '_' + f.name.toLowerCase();
      try {
        localStorage.setItem(key, JSON.stringify({
          kind: f.kind,
          name: f.name,
          size: bytes.length,
          mime: (f.name.match(/\.([a-z0-9]+)$/i) || [])[1] || '',
          storedAt: new Date().toISOString()
        }));
      } catch (e) {
        throw new Error('localStorage 写入失败: ' + e.message);
      }
      results.push({ kind: f.kind, name: f.name, size: bytes.length, key: key });
    }
    return results;
  }

  // 列出已恢复的资源
  function listRestored(kind) {
    const out = [];
    const prefix = 'ys_clone_resource_' + (kind || '') + '_';
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        try {
          const v = JSON.parse(localStorage.getItem(k));
          out.push({ key: k, kind: v.kind, name: v.name, size: v.size });
        } catch (e) { /* skip */ }
      }
    }
    return out;
  }

  // 清理
  function clearRestored(kind) {
    const prefix = 'ys_clone_resource_' + (kind || '') + '_';
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    keys.forEach(function (k) { localStorage.removeItem(k); });
    return keys.length;
  }

  global.YSCloneResources = Object.freeze({
    base64ToBytes: base64ToBytes,
    bytesToBase64: bytesToBase64,
    safeName: safeName,
    fileToResource: fileToResource,
    packResources: packResources,
    unpackResources: unpackResources,
    listRestored: listRestored,
    clearRestored: clearRestored
  });
})(typeof window !== 'undefined' ? window : globalThis);
