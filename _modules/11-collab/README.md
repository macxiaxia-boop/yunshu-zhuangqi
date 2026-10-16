# Module 11 · 三方实时协作（V2 升级）

> **R31202 · 🅱️ yunshu-zhuangqi**
> V1 → V2：业主扫码看报价 → **报价员 + 设计师 + 客户三方同时编辑一份报价**
> 纯前端 mock：BroadcastChannel（同 Tab 多窗口）+ Service Worker（跨源 mock）+ IndexedDB
> 零后端依赖，零外部包，GitHub Pages 直接可跑

---

## 文件清单

| 文件 | 行数 | 职责 |
|---|---|---|
| `collab-room.js` | 193 | 房间模型（create / join / token / snapshot） |
| `collab-sync.js` | 214 | CRDT 风格同步（LWW + 操作日志 + version 自增） |
| `transport-broadcastchannel.js` | 75 | 同浏览器跨 Tab 传输 |
| `transport-sw-message.js` | 169 | Service Worker 跨源消息（mock + inline 注册） |
| `collab-presence.js` | 127 | Heartbeat 5s / 超时 15s / peers 列表 |
| `collab-cursor.js` | 112 | 实时光标 + 100ms 节流 + 用户色 |
| `collab-view.html` | 379 | 三栏协作视图（左输入 / 中显示 / 右 peers） |
| `collab-test.js` | 502 | **18 个自检**（Node.js 跑，无需浏览器） |

**总计 9 个文件 / 1771 行**（不含 README）

---

## 从 `_integrated.html` 集成

```html
<!-- 加按钮 -->
<button onclick="openCollab()">🤝 协作</button>
<script>
function openCollab() {
  var project = window.appState.currentProject;
  var room = window.YSCollab.createRoom({
    projectId: project.id,
    projectName: project.name,
    ownerName: window.appState.userName
  });
  // 把 ownerToken 存到本地以便权限管理
  localStorage.setItem('ys_collab_owner_' + room.roomId, room.ownerToken);
  // 打开协作视图
  window.open(room.joinUrl, '_blank');
}
</script>
<script src="_modules/11-collab/collab-room.js"></script>
<script src="_modules/11-collab/collab-sync.js"></script>
```

---

## 演示流程（2 Tab 同一浏览器）

```
Tab 1（报价员）               Tab 2（客户）
  │                              │
  ├─ 点 🤝 协作 → 创建房间        │
  │   joinUrl 含 roomId+token     │
  │                              │
  ├─ 把 joinUrl 复制给客户 →      ├─ 打开 joinUrl
  │                              ├─ joinRoom → editor/viewer role
  │                              │
  ├─ 改"瓷砖"单价 = 200  ───┐
  │                         ├─→ BroadcastChannel('yunshu-collab-XXX')
  │                         │   → Tab 2 onMessage
  │                         │   → YSCollabSync.applyOp(op)
  │                         │   → renderAll() → 实时显示新单价
  │                         │
  ├─ Tab 2 看到 "200" ✓
  ├─ peers 列表：报价员 + 客户
  ├─ 光标移动 → 彩色光标标记
  ├─ 操作日志：v3 · u_xxx · setField → projectInfo.companyName
```

### 关键演示点

| 场景 | 看到什么 |
|---|---|
| 跨 Tab 同步 | A 改字段 → B < 100ms 内看到 |
| 多用户并发 | 3 个 user 同时改同一字段 → 最后版本胜出 |
| 离线降级 | 关 Tab 2 → 开 Tab 3 → replayOps 接续 |
| 权限 | viewer 角色打开 → 所有 input 禁用 |
| 操作日志 | 实时滚动 v1→v2→v3 + opId |

---

## 关键 API

### `window.YSCollab`
```js
YSCollab.createRoom({ projectId, projectName, ownerName })
  → { roomId, joinUrl, ownerToken, createdAt }

YSCollab.joinRoom(room, { userName, role, token })
  → { sessionToken, userId, peers, snapshot, history, syncVersion }

YSCollab.generateRoomId()       // 12字符 base32 (Crockford, 无 I/L/O/U)
YSCollab.isValidRoomId(id)
YSCollab.isValidToken(tok)
```

### `window.YSCollabSync`（CRDT 核心）
```js
YSCollabSync.setField(room, userId, 'projectInfo.companyName', '云数科技')
YSCollabSync.addRow(room, userId, categoryId, { name, unit, qty, price, note })
YSCollabSync.updateRow(room, userId, rowId, { qty: 20 })
YSCollabSync.removeRow(room, userId, rowId)
YSCollabSync.cursor(room, userId, { rowId, column })  // 同时是 heartbeat
YSCollabSync.applyOp(room, op)         // 接收远端 op
YSCollabSync.replayOps(room, opsArray) // 离线后接续
YSCollabSync.history(room, 50)
```

### `window.YSCollabPresence`
```js
YSCollabPresence.start(room, user, transport, { listeners: { onPeers } })
  → heartbeat 5s + GC sweep 7s + timeout 15s
YSCollabPresence.peers(room, selfUserId)
YSCollabPresence.isOnline(room, userId)
```

### `window.YSCollabCursor`
```js
YSCollabCursor.randomColor()
YSCollabCursor.makeThrottledSender(sendFn)  // 100ms 节流
YSCollabCursor.render(peer, targetEl, { positionFor })
```

---

## K8S V2 升级路径（生产环境）

### 当前 mock 局限

| 局限 | 影响 |
|---|---|
| BroadcastChannel 只跨 Tab 不跨设备 | 设计师 iPad + 业主手机 不互通 |
| SW mock 是同源 relay | 不解决真正的跨设备 |
| 无服务端持久化 | 关浏览器 = 房间消失 |
| 无冲突仲裁 | LWW 在密集并发下可能丢字段 |

### V2 生产：Cloudflare Durable Objects

```
                   ┌─────────────────────────┐
   Tab A ──┐       │  Cloudflare Workers     │
           │       │  + Durable Objects      │
           ├──BC──→│  ┌──────────────────┐   │
           │       │  │ DO(roomId)       │   │
           │       │  │  - WebSocket集线  │   │
           ├──WS──→│  │  - 操作日志存储   │   │
   Tab B ──┘       │  │  - LWW 仲裁      │   │
                   │  │  - 持久化 (R2)   │   │
   iPad ──────────→│  └──────────────────┘   │
                   │                         │
   Phone ─────────→│  WebSocket relay        │
                   └─────────────────────────┘
```

**关键点**：

| 能力 | 当前 mock | V2 Durable Objects |
|---|---|---|
| 跨设备同步 | ❌ 仅同浏览器 | ✅ WebSocket relay |
| 持久化 | ❌ 内存 | ✅ R2 / DO 内置 storage |
| 房间生命周期 | ❌ 关浏览器即丢 | ✅ DO 空闲 1h 后休眠 |
| 冲突解决 | ✅ LWW 本地 | ✅ 服务端 LWW + 仲裁 |
| 历史回溯 | ⚠️ 最近 1000 op | ✅ 永久（按项目计费） |
| 容量 | ⚠️ ~5 Tab | ✅ ~50 WebSocket/房间 |

### 迁移代码改动

```js
// 当前 mock：transport 直接 post 到 BroadcastChannel
transport.post({ kind: 'op', op: op });

// V2 生产：transport → Durable Object (WebSocket)
const ws = new WebSocket('wss://collab.ys.workers.dev/rooms/' + roomId);
ws.onopen = () => ws.send(JSON.stringify({ kind: 'op', op }));
ws.onmessage = (ev) => applyOp(JSON.parse(ev.data));
```

**5 处替换**：
1. `transport-broadcastchannel.js` → `transport-durable-object.js`
2. `YSCollabSync.applyOp` 不变（数据层稳定）
3. `YSCollabRoom.createRoom` → POST `/api/rooms` (服务端持久化)
4. `YSCollabPresence.heartbeat` → 改为 WebSocket ping/pong
5. `YSCollabCursor` throttle 不变（前端依然 100ms）

### 何时升级

- 单浏览器 5 Tab 演示：当前 mock 够用（V1 demo）
- 跨设备 / 持久化 / 多用户并发：V2 Durable Objects
- 预计 R3200 切换（用户量 > 100 后）

---

## 测试结果

```
========================================
Module 11 collab (V2) · 18 自检
========================================
  PASS  T1  房间创建（12字符base32 · 5000唯一）
  PASS  T2  加入房间（返回完整snapshot + peers + history）
  PASS  T3  setField operation（version 自增 v1→v2）
  PASS  T4  apply operation（JSON 树正确修改）
  PASS  T5  LWW 冲突解决（同字段旧值被新值覆盖）
  PASS  T6  跨 Tab 同步（BroadcastChannel 跨窗口接收）
  PASS  T7  peers heartbeat（5s 心跳 / 15s 超时）
  PASS  T8  光标位置（100ms 节流 · 20→≤2）
  PASS  T9  历史记录（最多保留 1000 条 op）
  PASS  T10 离线降级（localStorage 缓存 + replay）
  PASS  T11 权限校验（editor 可写 · viewer 只读）
  PASS  T12 9位/11位/非 base32 字符拒绝
  PASS  T13 token 校验错误拒绝
  PASS  T14 SW 注册失败降级 BroadcastChannel
  PASS  T15 空 op log / 畸形 op 不报错
  PASS  T16 多用户并发（3 user → syncVersion 最高胜出）
  PASS  T17 ops 顺序保证（广播顺序 = 日志顺序）
  PASS  T18 addRow / updateRow / removeRow 集成
========================================
结果：18 PASS · 0 FAIL
========================================
```

**运行方式**：
```bash
cd _modules/11-collab
node collab-test.js
# Exit: 0 = PASS ALL · 1 = FAIL
```

---

## 沙箱运行方式（浏览器演示）

```bash
# 选项 A：直接双击 collab-view.html（部分浏览器限制 BroadcastChannel）
# 选项 B：起本地服务（推荐）
cd _modules/11-collab
python -m http.server 8080
# 浏览器开 2 个 Tab：
#   http://localhost:8080/collab-view.html?roomId=ABCDEFGHJKMN&token=YYYYYYYYYYYYYYYY&role=editor
#   http://localhost:8080/collab-view.html?roomId=ABCDEFGHJKMN&token=YYYYYYYYYYYYYYYY&role=viewer
```

---

## 严禁

- ❌ 不要 npm install（GitHub Pages 不支持）
- ❌ 不要引入外部包
- ✅ 必须纯原生 JS（BroadcastChannel + IndexedDB + WebCrypto + Service Worker）
- ✅ 数据层 LWW 仲裁（不引入 Yjs / Automerge 等重型 CRDT 库）

---

_R31202 · Module 11 collab (V2) · 🅱️ yunshu-zhuangqi · 9 文件 / 1771 行 / 18 测试 PASS_