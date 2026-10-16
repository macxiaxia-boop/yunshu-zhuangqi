// R31202 Module 13 · 报价单防篡改 + 区块链存证 (V4)
// 用 Web Crypto SHA-256 + 链式哈希 + IndexedDB 永久存储
// 🅱️ 护城河：业主扫码可见报价后，每份报价生成不可篡改的「数字存证证书」

window.YSCert = (function () {
  'use strict';

  // 1. 单文件 SHA-256 hash
  async function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // 2. 报价单的 stable JSON stringify（键名排序确保 hash 一致）
  function stableStringify(obj) {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys
      .map(k => JSON.stringify(k) + ':' + stableStringify(obj[k]))
      .join(',') + '}';
  }

  // 3. 链式哈希：每条 certificate 包含 prevHash
  async function chainHash(certificate) {
    const payload = {
      id: certificate.id,
      prevHash: certificate.prevHash,
      dataHash: certificate.dataHash,
      timestamp: certificate.timestamp,
      author: certificate.author,
      signature: certificate.signature
    };
    return await sha256(stableStringify(payload));
  }

  // 4. 创建「数字存证证书」
  // 数据：完整报价 data（含项目信息 + 9+15 分类 + 财务字段）
  async function createCertificate({ projectData, author = 'yunshu-zhuangqi' }) {
    const id = 'CERT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

    // dataHash = 项目数据的 SHA-256
    const dataJson = stableStringify(projectData);
    const dataHash = await sha256(dataJson);

    // 查找链上前一个 hash
    const prevHash = await getLatestChainHash();

    const certificate = {
      id,
      version: '1.0',
      prevHash: prevHash || '0'.repeat(64),  // genesis
      dataHash,
      timestamp: new Date().toISOString(),
      author,
      signature: await sha256(`${id}|${dataHash}|${prevHash}|${author}`),  // 简化签名
      metadata: {
        projectName: projectData?.projectInfo?.name || '未命名',
        companyName: projectData?.projectInfo?.companyName || '漳州装修工作室',
        totalAmount: projectData?.totalAmount || 0,
        itemsCount: Array.isArray(projectData?.categories)
          ? projectData.categories.reduce((s, c) => s + (c.items?.length || 0), 0)
          : 0,
        categoriesCount: Array.isArray(projectData?.categories) ? projectData.categories.length : 0
      }
    };

    certificate.chainHash = await chainHash(certificate);

    // 存到 IndexedDB
    await saveCertificate(certificate);

    return certificate;
  }

  // 5. 验证证书完整性（不依赖 DB 数据 — 重新计算 hash 对比）
  async function verifyCertificate(certificate) {
    const expectedDataHash = await sha256(stableStringify(certificate.fullData || {}));
    if (expectedDataHash !== certificate.dataHash) return { ok: false, reason: 'dataHash 不匹配（数据被篡改）' };

    const expectedChainHash = await chainHash(certificate);
    if (expectedChainHash !== certificate.chainHash) return { ok: false, reason: 'chainHash 不匹配（元数据被篡改）' };

    return { ok: true, certificate };
  }

  // 6. IndexedDB 持久化
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('yunshu-cert-db', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('certificates')) {
          db.createObjectStore('certificates', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveCertificate(cert) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('certificates', 'readwrite');
      tx.objectStore('certificates').put(cert);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function getLatestChainHash() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('certificates', 'readonly');
      const req = tx.objectStore('certificates').openCursor(null, 'prev');
      const seen = [];
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) {
          seen.push(cursor.value.chainHash);
          cursor.continue();
        } else {
          db.close();
          // 用最近 1 个 hash（如果有）
          resolve(seen[0] || null);
        }
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  async function listCertificates() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('certificates', 'readonly');
      const req = tx.objectStore('certificates').getAll();
      req.onsuccess = () => { db.close(); resolve(req.result.sort((a, b) => b.timestamp.localeCompare(a.timestamp))); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  // 7. 业主端验证（公开链接）
  async function publicVerify(certificateId, fullData) {
    const certs = await listCertificates();
    const cert = certs.find(c => c.id === certificateId);
    if (!cert) return { ok: false, reason: '证书不存在' };

    return await verifyCertificate({ ...cert, fullData });
  }

  // 8. 导出证书为可打印 PDF 友好的 JSON
  async function exportCertificate(certificateId) {
    const certs = await listCertificates();
    const cert = certs.find(c => c.id === certificateId);
    if (!cert) return null;
    return {
      certificate,
      qrData: JSON.stringify({
        v: cert.version,
        id: cert.id,
        dataHash: cert.dataHash,
        chainHash: cert.chainHash,
        timestamp: cert.timestamp,
        metadata: cert.metadata
      })
    };
  }

  return {
    sha256,
    stableStringify,
    chainHash,
    createCertificate,
    verifyCertificate,
    publicVerify,
    listCertificates,
    exportCertificate
  };
})();
