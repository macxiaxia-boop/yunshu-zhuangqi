// Cloudflare Worker · yunshu-zhuangqi share-link 后端
// 部署：wrangler deploy
// 配合：_modules/10-share-link/share-api-mock.js (本地模式) ↔ worker.js (云端模式)

// CORS + JSON helpers
const json = (data, init = {}) => new Response(JSON.stringify(data), {
  status: init.status || 200,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Phone-Hash',
    ...(init.headers || {})
  }
});
const err = (msg, status = 400) => json({ ok: false, error: msg }, { status });

// 12 字符 base32 random
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // 去除 0/1/I/O/L
function randomShareId(length = 12) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

function hashPhone(phone) {
  // 简单 hash（生产用 Web Crypto SHA-256）
  return [...phone].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16).padStart(8, '0');
}

function maskPhone(phone) {
  if (!phone || phone.length < 11) return '****';
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

function sanitizeData(data) {
  // 安全过滤：只暴露必要字段给业主端
  if (!data || typeof data !== 'object') return {};
  return {
    projectInfo: {
      name: String(data.projectInfo?.name || '').slice(0, 100),
      code: String(data.projectInfo?.code || '').slice(0, 50),
      ownerName: String(data.projectInfo?.ownerName || '').slice(0, 30),
      projectAddress: String(data.projectInfo?.projectAddress || '').slice(0, 200),
      designArea: Number(data.projectInfo?.designArea) || 0,
      date: String(data.projectInfo?.date || '').slice(0, 30),
      author: String(data.projectInfo?.author || '').slice(0, 30),
      companyName: String(data.projectInfo?.companyName || '').slice(0, 100)
    },
    categories: Array.isArray(data.categories) ? data.categories.map(c => ({
      id: String(c.id || '').slice(0, 20),
      cn: String(c.cn || '').slice(0, 50),
      items: Array.isArray(c.items) ? c.items.map(i => ({
        name: String(i.name || '').slice(0, 100),
        unit: String(i.unit || '').slice(0, 10),
        qty: Number(i.qty) || 0,
        price: Number(i.price) || 0,
        brand: String(i.brand || '').slice(0, 50)
      })).slice(0, 500) : []
    })).slice(0, 30) : [],
    totalAmount: Number(data.totalAmount) || 0,
    createdAt: data.createdAt || new Date().toISOString()
  };
}

// 速率限制（按 phoneHash + 小时）
async function checkRateLimit(env, phoneHash) {
  const hour = Math.floor(Date.now() / 3.6e6);
  const key = `rate:${phoneHash}:${hour}`;
  const cur = parseInt(await env.SHARE_KV.get(key) || '0', 10);
  if (cur >= parseInt(env.RATE_LIMIT_PER_HOUR || '5', 10)) return false;
  await env.SHARE_KV.put(key, String(cur + 1), { expirationTtl: 7200 });
  return true;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') return json({ ok: true });

    // POST /share — 创建分享
    if (path === '/share' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { return err('JSON 解析失败'); }

      const { projectData, customerFields } = body;
      if (!projectData) return err('缺少 projectData');

      const shareId = randomShareId(parseInt(env.SHAREID_LENGTH || '12', 10));
      const expiresAt = new Date(Date.now() + parseInt(env.EXPIRE_SECONDS || '604800', 10) * 1000).toISOString();

      const record = {
        shareId,
        sanitizedData: sanitizeData(projectData),
        customerFields: {
          name: String(customerFields?.name || '').slice(0, 30),
          phoneHash: customerFields?.phone ? hashPhone(String(customerFields.phone)) : null,
          maskedPhone: customerFields?.phone ? maskPhone(String(customerFields.phone)) : null,
          note: String(customerFields?.note || '').slice(0, 200)
        },
        actions: [],
        createdAt: new Date().toISOString(),
        expiresAt
      };

      await env.SHARE_KV.put(`share:${shareId}`, JSON.stringify(record), {
        expirationTtl: parseInt(env.EXPIRE_SECONDS || '604800', 10)
      });

      return json({
        ok: true,
        shareId,
        expiresAt,
        shareUrl: `${url.origin}/share/${shareId}`
      });
    }

    // GET /share/:id — 业主读
    const getMatch = path.match(/^\/share\/([A-Z2-9]+)$/);
    if (getMatch && request.method === 'GET') {
      const shareId = getMatch[1];
      const raw = await env.SHARE_KV.get(`share:${shareId}`);
      if (!raw) return err('分享不存在或已过期', 404);

      const record = JSON.parse(raw);

      // 记录浏览
      record.actions = record.actions || [];
      record.actions.push({
        type: 'viewed',
        phoneHash: request.headers.get('X-Phone-Hash') || 'anon',
        at: new Date().toISOString()
      });
      await env.SHARE_KV.put(`share:${shareId}`, JSON.stringify(record), {
        expirationTtl: parseInt(env.EXPIRE_SECONDS || '604800', 10)
      });

      // 返回脱敏数据
      return json({
        ok: true,
        project: record.sanitizedData,
        customerFields: {
          name: record.customerFields.name,
          maskedPhone: record.customerFields.maskedPhone,
          note: record.customerFields.note
        },
        expiresAt: record.expiresAt
      });
    }

    // POST /share/:id/action — 业主确认/拒绝/评论
    const actionMatch = path.match(/^\/share\/([A-Z2-9]+)\/action$/);
    if (actionMatch && request.method === 'POST') {
      const shareId = actionMatch[1];
      let body;
      try { body = await request.json(); } catch (e) { return err('JSON 解析失败'); }

      const { type, phone, name, reason, text } = body;
      if (!['confirm', 'reject', 'comment'].includes(type)) return err('action 类型非法');
      if (type === 'reject' && !reason) return err('拒绝必须填 reason');

      // 速率限制
      const phoneHash = phone ? hashPhone(String(phone)) : 'anon';
      if (phone && !(await checkRateLimit(env, phoneHash))) return err('操作过于频繁，请 1 小时后再试', 429);

      const raw = await env.SHARE_KV.get(`share:${shareId}`);
      if (!raw) return err('分享不存在', 404);
      const record = JSON.parse(raw);

      // 单 shareId 限 1 业主手机（按 phoneHash 去重）
      if (phone) {
        const existingHash = record.customerFields.phoneHash;
        if (existingHash && existingHash !== phoneHash) return err('该分享已绑定业主手机', 403);
        if (!existingHash) record.customerFields.phoneHash = phoneHash;
        record.customerFields.maskedPhone = maskPhone(String(phone));
      }

      record.actions = record.actions || [];
      record.actions.push({
        type,
        name: String(name || '').slice(0, 30),
        text: String(text || '').slice(0, 500),
        reason: String(reason || '').slice(0, 200),
        phoneHash,
        at: new Date().toISOString()
      });

      const ttl = parseInt(env.EXPIRE_SECONDS || '604800', 10);
      await env.SHARE_KV.put(`share:${shareId}`, JSON.stringify(record), { expirationTtl: ttl });

      return json({ ok: true, action: record.actions[record.actions.length - 1] });
    }

    // GET /api/list — 报价员查 list（secret 鉴权）
    if (path === '/api/list' && request.method === 'GET') {
      const secret = url.searchParams.get('secret');
      if (!secret || secret !== (env.LIST_SECRET || 'dev-secret')) return err('未授权', 401);
      const list = await env.SHARE_KV.list({ prefix: 'share:' });
      const items = [];
      for (const k of list.keys) {
        const raw = await env.SHARE_KV.get(k.name);
        if (raw) {
          const r = JSON.parse(raw);
          items.push({
            shareId: r.shareId,
            createdAt: r.createdAt,
            expiresAt: r.expiresAt,
            customerName: r.customerFields.name,
            actionsCount: (r.actions || []).length,
            lastActionType: r.actions?.[r.actions.length - 1]?.type
          });
        }
      }
      return json({ ok: true, items });
    }

    // 健康检查
    if (path === '/' || path === '/health') return json({ ok: true, service: 'yunshu-share-worker' });

    return err('路由不存在', 404);
  }
};
