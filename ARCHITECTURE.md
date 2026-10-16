# R31202 · yunshu-zhuangqi 架构总览

## 数据流架构

```
┌─────────────────────────────────────────────────────────────────┐
│  业主（手机浏览器）                报价员（PC/平板）              │
└─────────────────────────────────────────────────────────────────┘
        │                                │
        │ ┌────────────────────────┐    │ ┌────────────────────────────┐
        │ │ share-link (Module 10) │    │ │ _integrated.html            │
        │ │ 业主扫码查看报价       │    │ │ 13 个浮动按钮                │
        │ └────────────────────────┘    │ └────────────────────────────┘
        │           │                       │          │
        └─────┬─────┴───────────────────────┘          │
              │                                          │
              ▼                                          ▼
   ┌──────────────────────────┐         ┌────────────────────────────────┐
   │ Cloudflare Worker        │         │ 浏览器本地                     │
   │ POST /share              │ ◄────── │  ├ localStorage (clone payload)│
   │ GET /share/:id           │         │  ├ IndexedDB (项目/存证)        │
   │ POST /share/:id/action   │         │  ├ BroadcastChannel (collab)   │
   │ MinAppVersion + SHA256   │         │  └ Service Worker (PWA)        │
   └──────────────────────────┘         └────────────────────────────────┘
```

## 13 模块依赖图

```
[V1] 
  01-pwa ──► 全模块可离线缓存（基础设施）
  02-print ──► PDF/DOM/CSS（独立）
  03-clone ──► localStorage 镜像（多用）
  04-ref-reverse ──► 04 解析（独立）
  05-spatial ──► canvas + 测量（独立）
  06-material-calc ──► ours 9 基装分类
  07-assistant ──► 06 + Excel 解析
  08-calendar ──► lunar.js (vendor) + independent
  09-themes ──► CSS variables (全模块样式)
  10-share-link ──► Worker (后端) + ours JSON

[V2] 
  11-collab ──► BroadcastChannel + SW (V2 护城河)

[V3]
  12-ai-floorplan ──► 4 API 路径 (ANTHROPIC/DEEPSEEK/AGNES/MINIMAX) + Mock 3 fixtures + AGNES demo 3 PNG

[V4]
  13-blockchain-cert ──► SHA256 + chainHash + IndexedDB（数字存证）
```

## 安全 / 反滥用 设计

| 模块 | 防护 |
|---|---|
| 03-clone-zip | 反原型链 (`__proto__`/`constructor`/`prototype`) 检测 + 51 字段白名单 + SHA256 校验 + minAppVersion DRM |
| 07-assistant | 备份 + 冲突检测 + 取消不修改保证 |
| 10-share-link | 5 层防护：脱敏手机 + 单 shareId-单业主 hash + 每小时限速 + 输入 whitelist + phone hash 不存原值 |
| 13-blockchain-cert | SHA256 + 链式 prevHash + 篡改检测（verify 自动 fail on 任何字段改动） |

## 数据格式

| 文件 | 格式 | schema |
|---|---|---|
| `.bjproj` / `.json` 报价 | JSON | `{projectInfo, categories[], totalAmount}` |
| `.bjchange` 增减项 | JSON | `{fileType:'QUOTE_CHANGE_ORDERS', rows[]}` |
| `.wlbook` 物料全书 | JSON | `{materials:[5 类]}` |
| `ZIP 克隆包` | ZIP | `manifest.json + configuration.json + 使用说明.txt`（SHA256） |

## localStorage 键名（11 个权威）

```
rm_persistent_settings_v23       系统设置
rm_current_data                 当前编辑项目
rm_template_data                初始模板
ys_system_quota_library_v1      定额库
ys_clone_defaults_v1            克隆默认（财务费率）
ys_studio_ui_v31_color_mode     主题: light/dark
ys_studio_ui_v31_density        UI 密度
ys_cloud_light_skin_v1          主题色: red/navy/turquoise/ochre/purple/lilac
ys-almanac-display-v1           万年历显示偏好
smart_quota_sources             智能助手选源映射
quote_change_archives            增减项档案 (max 30)
```

---

_R31202 · 13 模块架构图 · 2026-10-16_
