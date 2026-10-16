# share-link 部署文档 · Cloudflare Worker + KV

> R31202 · Module 10 · 🅱️ yunshu-zhuangqi
>
> **为什么选 Cloudflare Worker？**
> - 免费额度：每天 100K 请求 + 1GB KV 读写（demo 完全够用）
> - 全球边缘节点（业主扫码访问低延迟）
> - KV 持久化 + 自动 TTL 过期（替代自建过期清理）
> - 5 分钟部署 + 自定义域名绑定

---

## 1. 部署架构

```
[报价员 app.html]
  → POST  https://share.yunshu-zhuangqi.com/share      (Worker)
  → POST  https://share.yunshu-zhuangqi.com/share/:id/action  (Worker)
                    │
                    └─→ Cloudflare KV (sharedProjects)
                              │
[业主 share-view.html]  ←── GET https://share.yunshu-zhuangqi.com/share/:id
```

---

## 2. Worker 代码（30 行）

`worker/index.js`：

```javascript
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    // POST /share
    if (url.pathname === '/share' && req.method === 'POST') {
      const body = await req.json();
      const shareId = generateId();
      const data = sanitizeShareData(body);
      await env.SHARES.put(shareId, JSON.stringify(data), {
        expiration: Math.floor(Date.now() / 1000) + (body.expiresIn || 604800000) / 1000,
        metadata: { createdAt: Date.now(), accessType: body.accessType || 'public-read' }
      });
      return json({ shareId, expiresAt: data.expiresAt }, cors);
    }

    // GET /share/:id
    const getMatch = url.pathname.match(/^\/share\/([A-Z0-9]{12})$/);
    if (getMatch && req.method === 'GET') {
      const v = await env.SHARES.getWithMetadata(getMatch[1]);
      if (!v) return json({ error: 'NOT_FOUND' }, cors, 404);
      const data = JSON.parse(v.value);
      return json({ ...data, shareId: getMatch[1] }, cors);
    }

    // POST /share/:id/action
    const actMatch = url.pathname.match(/^\/share\/([A-Z0-9]{12})\/action$/);
    if (actMatch && req.method === 'POST') {
      const body = await req.json();
      const v = await env.SHARES.get(actMatch[1]);
      if (!v) return json({ error: 'NOT_FOUND' }, cors, 404);
      const data = JSON.parse(v);
      data.actions = data.actions || [];
      data.actions.push({ ...body, timestamp: Date.now() });
      await env.SHARES.put(actMatch[1], JSON.stringify(data));
      return json({ ok: true, total: data.actions.length }, cors);
    }

    return json({ error: 'NOT_FOUND' }, cors, 404);
  }
};
function generateId() { return Array.from(crypto.getRandomValues(new Uint8Array(8)))
  .map(b => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[b % 32]).join(''); }
function sanitizeShareData(b) {
  return {
    data: b.data, estimateAmount: Number(b.estimateAmount || 0),
    customerFields: b.customerFields, actions: [],
    expiresAt: Date.now() + (b.expiresIn || 7 * 86400000)
  };
}
function json(obj, cors, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
```

---

## 3. wrangler.toml 配置

```toml
name = "yunshu-share-link"
main = "worker/index.js"
compatibility_date = "2024-09-01"

[[kv_namespaces]]
binding = "SHARES"
id = "your-kv-namespace-id-here"        # ← wrangler kv:namespace create SHARES 获取
preview_id = "your-preview-id-here"

[env.production]
routes = [
  { pattern = "share.yunshu-zhuangqi.com/*", custom_domain = true }
]
```

---

## 4. KV namespace 创建步骤

```bash
# 登录
wrangler login

# 创建 KV namespace（生产环境）
wrangler kv:namespace create SHARES
# 输出: { "id": "abc123..." } ← 填入 wrangler.toml

# 创建预览环境 namespace
wrangler kv:namespace create SHARES --preview

# 部署
wrangler deploy
```

---

## 5. 域名绑定

Cloudflare Dashboard → Workers & Pages → `yunshu-share-link` → Settings → Triggers:
- Custom Domain: `share.yunshu-zhuangqi.com`
- 或 Route: `share.cloudtech.dev/*` (备选)

DNS 自动添加 CNAME 记录，无需手动配置。

---

## 6. 切换前端 IndexedDB → Worker

修改 `share-api-mock.js`，把 `YSShareAPI.create/get/addAction/list` 改为调用 Worker：

```javascript
// 替换 openDB/getAll/etc 为 fetch(workerUrl, ...)
async function create(payload) {
  const r = await fetch('https://share.yunshu-zhuangqi.com/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return await r.json();
}
```

---

## 7. 安全加强（生产必须）

- [ ] Cloudflare Turnstile 加在创建分享前（防机器人）
- [ ] Worker 里加 IP 速率限制：每 IP 每分钟 ≤ 10 次
- [ ] KV metadata 存 accessType='password-read' 时强制密码校验
- [ ] shareId 用 crypto.getRandomValues（已实现）
- [ ] 部署后立即测试：分享 → 业主扫码 → 确认 → 后台看到
- [ ] 监控：Cloudflare Dashboard 看 4xx/5xx 率

---

## 8. 备选方案

| 方案 | 成本 | 部署复杂度 | 推荐度 |
|---|---|---|---|
| **Cloudflare Worker + KV** | 免费额度足够 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Vercel Functions + KV | 免费额度足够 | ⭐⭐ | ⭐⭐⭐⭐ |
| GitHub Pages + Formspree | 0 美元 | ⭐ | ⭐⭐（仅 demo） |
| 自建 Node + SQLite | 服务器成本 | ⭐⭐⭐⭐ | ⭐⭐（不推荐） |
| **当前 IndexedDB mock** | 0 | 0 | ⭐⭐⭐（仅 demo） |

**生产推荐 Cloudflare Worker + KV · 5 分钟部署 · 免费额度支持日活 1000+**
