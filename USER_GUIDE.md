# 用户运营手册 · USER_GUIDE.md

> 老板专用 — 讲清楚怎么收款、怎么开通、怎么管客户。

## 🎯 业务流程一览

```
客户看到广告/链接 → 访问首页
   ↓
点"立即使用" → 注册(邮箱+密码)
   ↓
跳到「待激活」页面,扫码付 ¥200
   ↓
加您的客服微信,把凭证(邮箱)发给您
   ↓
您打开 admin.html,标记激活码为"已发"
   ↓
把激活码发给客户
   ↓
客户输入 → 验证通过 → 进 app.html 开始使用
```

---

## 📱 第 1 步:上传您的微信收款码(必须)

1. 微信 → 我 → 收付款 → 二维码收款 → 保存图片
2. 复制到 `C:\Users\xinzh\xhs-quote-app\assets\qrcode.jpg`
3. push 到 GitHub:
   ```bash
   cd C:\Users\xinzh\xhs-quote-app
   gh api -X PUT repos/macxiaxia-boop/yunshu-zhuangqi/contents/assets/qrcode.jpg \
     -f "message=add qrcode" -f "branch=main" \
     -f "content=$(base64 -w 0 assets/qrcode.jpg)"
   ```
4. 等 30 秒,Pages 自动重建,客户刷新就能看到您的收款码

## 📱 第 2 步:修改客服微信号(必做)

打开 `pending.html`,找到 `xinzh_quote`,改成您的微信号:

```html
📞 <b>客服微信:</b> 您的微信号
```

然后 push:
```bash
# 用 gh api PUT update(需要 sha)
SHA=$(gh api repos/macxiaxia-boop/yunshu-zhuangqi/contents/pending.html?ref=main | grep -o '"sha":"[a-f0-9]*"' | head -1 | sed 's/"sha":"//; s/"//')
B64=$(base64 -w 0 pending.html)
printf '{"message":"update wechat","branch":"main","sha":"%s","content":"%s"}' "$SHA" "$B64" > /tmp/b.json
gh api -X PUT repos/macxiaxia-boop/yunshu-zhuangqi/contents/pending.html \
  --input /tmp/b.json -H "Content-Type: application/json"
```

---

## 👑 第 3 步:开通 Admin 工具

**地址**: https://macxiaxia-boop.github.io/yunshu-zhuangqi/admin.html
**密码**: `yunshu-admin-2026`

⚠️ **第一次访问后请修改密码**(后面讲怎么改)

### 3.1 修改 Admin 密码

打开 `admin.html`,找到 `const ADMIN_PWD = 'yunshu-admin-2026';`,改成您的密码,然后 push。

或者更安全:用环境变量 / 后端鉴权(但需要部署后端)。

### 3.2 查看 100 个激活码

打开 admin.html → 默认显示 100 个激活码。
- 🟢 **未发放** = 可发给客户
- 🟡 **已发放** = 已用(标记过的)

### 3.3 给客户开通的具体步骤

1. **客户扫码付了 ¥200**
2. **客户加您微信**,发邮箱给您(例:`zhang@example.com`)
3. **您打开 admin.html**,输入密码进入
4. **找一个未发放的码**(点"未发放"过滤)
5. **点 ✓ 按钮** → 弹窗输入客户邮箱 → 确定
6. **复制激活码** → 点码本身一键复制
8. **微信发给客户**:「您的激活码是 YNSH-XXXX-XXXX-XXXX,请到 pending 页面输入」
10. **客户输入** → 验证 → 跳 app.html → 全功能开通

### 3.4 撤销误操作

如果点错了 ✓:
- 点 × 按钮 → 该码恢复为未发放
- 可重新发给别的客户

---

## 📊 怎么看激活码使用情况

admin.html 顶部 4 个数字:
- **总激活码**: 100(预生成)
- **未发放**: 还有多少没发出去
- **已发放**: 已标记的(可能客户还没用)
- **注册用户**: 客户在自己浏览器注册的(本地 localStorage,跨设备看不到)

---

## ❓ 常见问题

### Q: 客户扫码付了款,但页面看不到我的收款码?
**A**: 您还没上传 `assets/qrcode.jpg`。看上文第 1 步。

### Q: 客户注册了邮箱,但 admin.html 看不到?
**A**: 客户的注册数据存在**他/她自己的浏览器** localStorage 里,不是存在您这里。客户的邮箱只能通过微信沟通确认。

### Q: 100 个激活码用完了?
**A**: 重新生成。在 admin.html 看到用完时,告诉我,我再生成 100 个新的。或者您直接修改 `activation_codes.js` 加更多码。

### Q: 激活码被泄露了怎么办?
**A**: 在 admin.html 把这个码标记为"已发放"(即使没真发)→ 客户就无法再用。或者直接告诉我,我把泄露的码加黑名单。

### Q: 客户付了款但忘了激活码?
**A**: 客户的注册邮箱已经记在您的微信对话里。问客户"您注册用的邮箱是什么?",然后查 admin 的"已发放"列表,找到对应记录,把激活码再发一次。

### Q: 怎么批量发激活码给老客户(已经免费用过 R1906 的)?
**A**: 直接发激活码 + 提示"到 app.html 输入激活码激活"。老客户的邮箱可能在 admin 里看不到(老客户是 R1906 之前的,数据不互通),让他们重新注册 + 用新激活码即可。

---

## 🛡️ 安全建议

1. **改 admin 密码**(必做)
2. **不要在公共电脑登录 admin**(admin 数据存在本地)
3. **定期导出激活码**(export)备份到安全位置
4. **激活码不要批量公开**(每个只给一个客户)

---

## 📈 运营数据记录(建议)

在 admin 旁边的本地文件/Notion 里记:
- 客户邮箱
- 激活码
- 开通时间
- 是否续费(本系统是一次性付费,不需要续费)
- 备注(怎么找到您的、需求等)

---

## 🚨 故障排查

| 问题 | 解决 |
|------|------|
| admin.html 提示密码错误 | 检查大小写 / 重新输入 |
| 激活码验证失败 | 客户输入错误 → 重发 |
| 客户付了款但页面没反应 | 检查 Pages build 状态(gh api .../pages/builds/latest) |
| 100 码用完 | 重新生成 |
| 想更换客服微信 | 改 pending.html 重新 push |

---

## 💰 价格 & 退款政策

**单价**: ¥200 / 激活码(永久使用)
**不退款**: 激活码一旦发放,即使客户没用,也不退款(您可以撤销 × 1 让该码可重用)

如需调整价格(¥100 / ¥300 / ¥500),改 `pending.html` 的金额文字 + admin 页面 + memory 记录。

---

## 🛠️ 常见更新操作

### 更新客服微信号
改 `pending.html` 然后 push:
```bash
SHA=$(gh api .../contents/pending.html | grep sha)
gh api PUT .../contents/pending.html --input /tmp/b.json -H "Content-Type: application/json"
```

### 修改 admin 密码
改 `admin.html` 的 `const ADMIN_PWD`,然后 push。

### 加更多激活码(从 100 变成 200)
修改 `activation_codes.js`,新增 100 个码(我帮您生成),然后 push。

### 修改激活码前缀
把 `YNSH-` 改成您想要的(如 `YS-`),改 `pending.html` / `activation.html` / `admin.html` 中的正则匹配。

---

## 📞 技术支持

如有任何技术问题,告诉我:
- GitHub: https://github.com/macxiaxia-boop/yunshu-zhuangqi/issues
- 邮箱: hello@yunshu.cn

---

**老板必做的 3 件事**:
1. ☐ 上传微信收款码 `assets/qrcode.jpg`
2. ☐ 修改 `pending.html` 的客服微信号
3. ☐ 修改 `admin.html` 的 admin 密码

完成后,这套系统就可以正式上线营业了!

Made for 云数装企 · 2026-10-15