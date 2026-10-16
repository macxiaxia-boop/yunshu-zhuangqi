# 部署指南 · DEPLOY.md

> 把 **云数装企报价系统** 部署到公网,任何人都能访问。

## 📦 部署前准备

你已经有一个完整的 deploy-ready 包:

```
xhs-quote-app/
├── index.html              # 🌟 主应用(130KB / 2500+ 行)
├── manifest.json           # PWA 配置
├── favicon.svg             # 矢量图标(708 bytes)
├── favicon-192.png         # PWA 图标 192x192
├── favicon-512.png         # PWA 图标 512x512
├── README.md               # 用户文档
├── DEV.md                  # 开发者文档
├── start.bat               # Windows 一键启动
├── assets/
│   ├── hero.png             # 主 hero 图(239KB)
│   ├── demo.gif             # 演示动画(413KB)
│   └── themes.png          # 主题色预览(16KB)
└── xhs-quote-app-deploy.zip  ← 已打包好的部署包
```

**整个应用是纯静态文件** — 无后端,无数据库,无需任何环境变量。任何静态托管服务都能跑。

---

## 🚀 4 种免费部署方式(选一个即可)

### 方式 1:Netlify Drop(最快 · 推荐) ⭐

**30 秒上线,无需注册就能获得可分享链接**

1. 打开 https://app.netlify.com/drop
2. 直接把整个 `xhs-quote-app` 文件夹拖到页面中央
3. 等待几秒,会得到一个 `https://xxx.netlify.app` 的链接
4. **完成!**这个链接任何人点开都能用

**优点**:
- 无需注册(拖文件夹就行)
- 免费 HTTPS
- 全球 CDN
- 自动部署(以后更新拖文件夹即可覆盖)

**缺点**:
- 链接是 Netlify 二级域名(如 `xxx.netlify.app`)
- 想用自己域名需注册账号

### 方式 2:GitHub Pages(免费 + 自定义域名 + 自动部署) ⭐ 推荐长期项目

**适合长期项目,版本控制 + 自动部署**

**已经包含 `.github/workflows/deploy.yml`,push 后自动部署!**

1. **创建 GitHub 仓库**
   ```bash
   cd xhs-quote-app
   git init
   git add .
   git commit -m "Initial commit: 云数装企报价系统 v1.0"
   git branch -M main
   git remote add origin https://github.com/你的用户名/yunshu-zhuangqi.git
   git push -u origin main
   ```

2. **开启 GitHub Pages**
   - 进入仓库 Settings → Pages
   - Source: `GitHub Actions`(不要选 branch)
   - 点击 Save

3. **自动部署**
   - GitHub Actions 自动运行 `.github/workflows/deploy.yml`
   - 1-2 分钟后部署完成
   - 访问:`https://你的用户名.github.io/yunshu-zhuangqi/`

4. **后续更新**
   - 改完代码后 `git push`
   - GitHub Actions 自动重新部署,无需手动操作

### 方式 3:Vercel(国内访问最快)

1. **导入 GitHub 仓库**到 https://vercel.com/new
2. **配置**
   - Build Command: 留空(纯静态)
   - Output Directory: `.` (当前目录)
3. **部署**:点击 Deploy
4. **得到链接**:`https://yunshu-zhuangqi.vercel.app`

**优点**:国内访问速度优于 GitHub Pages(有大陆 CDN 节点)

### 方式 4:Cloudflare Pages(全球最快)

1. 登录 https://pages.cloudflare.com/
2. **Upload assets**(直接拖文件夹)
3. **Project name**: `yunshu-zhuangqi`
4. **部署**:得到 `https://yunshu-zhuangqi.pages.dev`

**优点**:Cloudflare 全球 CDN,速度最快;免费 HTTPS

---

## 🏢 自托管(自己的服务器)

### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name quote.yunshu.com;  # 替换为你的域名
    root /var/www/yunshu-zhuangqi;
    index index.html;

    # 启用 gzip 压缩
    gzip on;
    gzip_types text/html text/css application/javascript image/svg+xml;
    gzip_min_length 1000;

    # 单页应用 fallback(虽然这里用不到)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 缓存静态资源
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|webp|woff2)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

### Apache `.htaccess`

```apache
# 启用 gzip
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/html text/css application/javascript
</IfModule>

# MIME 类型
AddType image/svg+xml .svg

# 缓存
<IfModule mod_expires.c>
    ExpiresByType image/png "access 7 days"
    ExpiresByType image/jpeg "access 7 days"
    ExpiresByType image/svg+xml "access 7 days"
    ExpiresByType text/css "access 7 days"
    ExpiresByType application/javascript "access 7 days"
</IfModule>
```

### IIS `web.config`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <staticContent>
      <remove fileExtension=".svg" />
      <mimeMap fileExtension=".svg" mimeType="image/svg+xml" />
      <mimeMap fileExtension=".json" mimeType="application/json" />
    </staticContent>
    <httpCompression>
      <staticTypes>
        <add mimeType="text/html" enabled="true" />
        <add mimeType="text/css" enabled="true" />
        <add mimeType="application/javascript" enabled="true" />
        <add mimeType="image/svg+xml" enabled="true" />
      </staticTypes>
    </httpCompression>
  </system.webServer>
</configuration>
```

---

## 🔒 部署后必做

### 1. 测试清单

打开部署链接,逐项验证:
- [ ] 页面正常加载,看到 hero 主界面
- [ ] 6 主题色切换正常(系统设置 → 界面设置)
- [ ] 数字键 `1-8` 切换模块
- [ ] `Ctrl+P` 打开打印预览
- [ ] `Ctrl+K` 打开命令面板
- [ ] `?` 显示快捷键面板
- [ ] 导出报价书按钮正常下载 HTML
- [ ] 项目切换器 3 个示例都能切换
- [ ] 移动端响应式(< 768px 显示汉堡菜单式导航)
- [ ] 浏览器 console 无报错

### 2. PWA 验证(可选)

- 移动端访问,用 Chrome / Safari
- 添加到主屏幕:应该出现 "添加云数装企到主屏幕" 提示
- 添加后从主屏幕打开:应该像原生 App 一样启动(无浏览器地址栏)

### 3. 性能验证

打开 Chrome DevTools → Lighthouse:
- 目标:Performance > 95, Accessibility > 90, Best Practices > 90, SEO > 80
- PWA:可安装 + manifest + service worker(默认无 service worker,如需离线可加)

### 4. SEO 验证

- [ ] `<title>` 设置正确:"云数装企 · 报价系统 v1.0"
- [ ] `<meta name="description">` 已设置
- [ ] `<meta name="theme-color">` 已设置
- [ ] manifest.json 完整

---

## 📊 部署后分享

部署完成后,可以这样分享:

1. **直接发链接**:微信/邮件/小红书评论区贴 URL
2. **二维码**:用任意二维码生成器(草料/百度)生成链接的二维码
3. **嵌入小红书**:作为小红书笔记的链接
4. **下载模式**:依然可以保留 zip 包,给朋友离线体验

---

## ⚠️ 重要提醒

### 关于品牌

部署链接会显示 **「云数装企 · 报价系统」** 品牌名。
- 想改名:在 `index.html` 里修改 brand 区块(第 1133-1134 行),重新打包部署
- 想加 logo:替换 `favicon.svg` 和 `favicon-192.png`

### 关于数据

- **当前版本**:用户项目数据保存在浏览器 localStorage,**不跨设备同步**
- **生产建议**:后续迭代可加 IndexedDB(本地大量数据)+ 后端 API(多端同步)

### 关于更新

部署后用户数据不会丢失,但**产品代码更新后需要重新部署**:
- **Netlify Drop**:重新拖文件夹覆盖
- **GitHub Pages**:git push 后自动部署
- **Vercel/Cloudflare**:git push 后自动部署

---

## 🆘 故障排查

| 症状 | 解决 |
|------|------|
| 页面 404 | 检查 index.html 在根目录 |
| 主题色不切换 | 检查 `<body data-theme="...">` 设置 |
| 静态资源 404 | 检查相对路径(都在同文件夹) |
| 移动端样式乱 | 检查 viewport meta + CSS 媒体查询 |
| PWA 不安装 | 检查 manifest.json 在根目录 + HTTPS |

---

## ✅ 推荐部署顺序

**首选**:Netlify Drop(30 秒搞定,无需账号)
**次选**:GitHub Pages(长期项目,版本控制)
**生产**:自托管 Nginx(完全可控,需要服务器)

---

部署有任何问题,回到 `C:\Users\xinzh\xhs-quote-app\`,开发用也行(`start.bat`)。

Made by 云数装企 · 2026-10-15