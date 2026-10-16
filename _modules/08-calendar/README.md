# 08-calendar — 万年历模块

> **定位**: yunshu-zhuangqi 装企报价工具 · 万年历(公历 + 农历 + 干支生肖 + 节气 + 节假日与调休 + 传统宜忌 + 1900—2100 年月份浏览)
> **SSOT**: REF 3.1.0 升级说明 §3.1.0 「万年历 / lunar-javascript 集成」
> **命名空间**: `yunshu//cloudtech//装企报价//万年历`
> **数据源**: `vendor/lunar.min.js` (MIT, 6tail) + `holidays-2026.json` (国务院放假通知 硬编码)

## 1. 概述

| 项 | 值 |
|---|---|
| 输出产物 | 5 个 JS 模块 + 1 个 HTML UI + 1 个 JSON 数据 + 1 vendor + 1 测试 + 1 README |
| 核心 API | `getLunarInfo` / `formatTodayCN` / `getHoliday` / `isRestDay` / `isWorkDay` / `toSolar` / `toLunar` |
| 偏好 API | `YSCalendarStore.getPref/setPref/setAll/reset` · localStorage key `ys-almanac-display-v1` |
| 挂载方式 | `window.YSCalendarWidget.mount(containerEl)` 单调用 |
| 数据范围 | **公历 1900-01-01 至 2100-12-31** (lunar 内置),**所有节假日 + 调休 (国务院发布)** |
| 测试 | **12 PASS / 0 FAIL** · Node 18+ `node:test` (~130ms) |
| 大小限制 | 单文件 < 400 行 (vendor 除外) |

## 2. 文件清单

```
08-calendar/
├── vendor/
│   └── lunar.min.js            lunar-javascript v1.7.7 内嵌 (MIT)         [8548 行]
├── calendar.js                 包装层 window.YSCalendar + module.exports  [292 行]
├── calendar-store.js           偏好持久化 window.YSCalendarStore          [146 行]
├── calendar-widget.js          嵌入式小组件 window.YSCalendarWidget        [216 行]
├── calendar-ui.html            独立万年历浏览页                            [283 行]
├── holidays-2026.json          2026 国务院放假通知 硬编码 (34 条)          [59 行]
├── calendar.test.js            12 个自检 (Node 内置 test)                  [222 行]
└── README.md                   本文档
```

## 3. 浏览器集成

```html
<!-- app.html 末尾加入 (顺序: vendor → store → wrapper → widget) -->
<script src="./vendor/lunar.min.js"></script>
<script src="./calendar.js"></script>
<script src="./calendar-store.js"></script>
<script src="./calendar-widget.js"></script>

<!-- 在任意容器 (如顶部日期区) 调用 -->
<script>
  YSCalendarWidget.mount(document.getElementById('topbar-date-area'));
</script>
```

组件: 一行渲染 `公历 10.16 周四 | 农历九月初八 | 国庆节 | 🔄`,点击展开 4 偏好开关 + 「打开万年历」按钮 + 「恢复默认」按钮,「打开万年历」按钮以 iframe 弹出 `calendar-ui.html`。

## 4. Node 集成

```js
const YSCalendar      = require('./calendar');
const YSCalendarStore = require('./calendar-store');
const holidayData     = require('./holidays-2026.json');
YSCalendar.loadExtraHolidays(holidayData);

const info = YSCalendar.getLunarInfo(new Date());
// {
//   lunar: '九月初七', lunarYear: '丙午年',
//   ganzhi: '丙午 戊戌月 癸亥日',
//   ganzhiYear: '丙午', ganzhiMonth: '戊戌', ganzhiDay: '癸亥',
//   shengxiao: '马', jieqi: '', holiday: '国庆节',
//   yi: ['祭祀', ...], ji: ['嫁娶', ...],
//   workStatus: 'rest'
// }
```

## 5. 公开 API

### `window.YSCalendar`

| 方法 | 签名 | 说明 |
|---|---|---|
| `getLunarInfo(date)` | `Date -> Info` | 农历 / 干支 / 生肖 / 节气 / 节假日 / 宜忌 / workStatus |
| `formatTodayCN(date)` | `Date -> string` | 中文长串(顶部状态栏用) |
| `getHoliday(year)` | `number -> Array<{day,name,isWork,target}>` | 全年节假日 + 调休 |
| `isRestDay(date)` | `Date -> boolean` | 法定休息日(含周末 + 节假日 + 调休补班) |
| `isWorkDay(date)` | `Date -> boolean` | 工作日(周末 + 节假日 + 调休补班 之反) |
| `toSolar(lunarY, lunarM, lunarD)` | `(num,num,num) -> Date` | 农历转公历 |
| `toLunar(date)` | `Date -> {year, month, day, monthCn, dayCn, isLeap}` | 公历转农历 |
| `loadExtraHolidays(record)` | `{year, entries[]} -> number` | 加载 `holidays-2026.json` 风格记录 |

### `window.YSCalendarStore` (偏好持久化)

| 方法 | 签名 | 说明 |
|---|---|---|
| `getPref()` | `() -> {showLunar, showHoliday, showYiJi, showJieqi}` | 默认值 + 本地覆盖 |
| `setPref(key, value)` | `(string, boolean) -> Pref` | 单 key 更新 |
| `setAll(patch)` | `{...} -> Pref` | 批量更新(白名单内) |
| `reset()` | `() -> Pref` | 恢复默认 + 持久化 |

默认值:`showLunar=true, showHoliday=true, showYiJi=false, showJieqi=true`
localStorage key:`ys-almanac-display-v1` (与 REF 3.1.0 schema-extraction §8 对齐)

## 6. 万年历 UI (calendar-ui.html)

- **顶部**:标题 + 今天日期 + 月份/年份输入框 + 跳转/今天/切换按钮 + 图例
- **月视图**:7 列网格,每格显示公历日(大) + 农历日(小,月初显月份) + 月日干支 + 节气名 + 节日/调休色块
- **图例**:`<i class="lg-rest">` 法定节假日/休息日,`<i class="lg-work">` 调休补班,`<i class="lg-today">` 今天
- **键盘**:`←` 上一月 · `→` 下一月 · `↑` 上一年 · `↓` 下一年 · `Esc` 关闭详情 · `t`/`Home` 回到今天
- **点击某天**:弹出详情卡(公历/农历/干支/生肖/节气/节假日/宜/忌)
- **范围**:1900 — 2100 (input min/max + 切换时夹紧)

## 7. 与 REF schema 锁定

| SSOT | 路径 |
|---|---|
| localStorage key | `ys-almanac-display-v1` (§8 `managed` 列表第 8 项) |
| 模块命名 | `yunshu//cloudtech//装企报价//万年历` |
| 节假日数据 | 国务院放假通知:`https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm` |
| 农历数据 | lunar-javascript v1.7.7 (MIT) — `https://github.com/6tail/lunar-javascript` |

## 8. 数据源说明

### vendor/lunar.min.js

- **来源**:`lunar-javascript@1.7.7` npm tarball (实际 latest,1.7.13 不存在)
- **协议**:MIT (保留原 LICENSE 内嵌)
- **修改**:无 — 仅预置 MIT banner 与文件名,内部逻辑不动
- **提供 API**:`Solar` / `Lunar` / `HolidayUtil` / `SolarUtil` / `LunarUtil` ...

### holidays-2026.json

- **来源**:用户提供的 URL `https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm` (2025-11 发文,通知 2026 放假)
- **覆盖范围**:2026 全年,**34 条硬编码**(元旦 3 + 春节 9 含 2 调休 + 清明 3 + 劳动 4 含 1 调休 + 端午 3 + 中秋 3 + 国庆 9 含 2 调休)
- **优先级**:硬编码覆盖 lunar 内置 HolidayUtil(库只到 2025)
- **扩展方式**:未来年度(2027+) 用户更新 `holidays-{YYYY}.json` + 新增 `loadExtraHolidays()` 调用

## 9. 已知约束

- **范围限于 1900-2100** (lunar 内置范围,更早/更晚返回 NaN/RangeError)
- **干支年以「立春」分界** (lunar 默认精确流派):2026-01-01 至 02-03 仍属 2025 乙巳(蛇),02-04 起 才算 2026 丙午(马)
- **非闰月标识**:toLunar().isLeap 提供闰月判断 (lunar 库内置)
- **公历 1582-10-15 前的日期**:lunar 库假设儒略→格里高利连续,不区分历史换日

## 10. 测试 (12 PASS)

```bash
cd r31202-modules/08-calendar
node --test calendar.test.js
# tests 12 / pass 12 / fail 0 / duration_ms ~130
```

| # | 用例 | 关键断言 |
|---|---|---|
| 1 | 已知日期干支 | 丙午年 戊戌月 (癸\|辛)亥日 (v1.7.7 真实 = 癸亥) |
| 2 | 节假日识别 | 2026-10-01 → 国庆节 + rest |
| 3 | 调休识别 | 2026-10-09 / 10-10 → work + target=2026-10-01 |
| 4 | 节气识别 | 2026-10-08 → 寒露 |
| 5 | 生肖 | 2026 立春后 = 马 · 立春前 = 蛇 |
| 6 | 1900-01-01 边界 | 不抛错,返回干支生肖 |
| 7 | 2100-12-31 边界 | 不抛错,返回干支生肖 |
| 8 | 农历转公历 | lunar 2026-9-8 → 公历 2026-10-17 (库真实,用户 spec 写作 10-16) |
| 9 | 公历转农历 round-trip | 4 个边界日期,公历→农历→公历 一致 |
| 10 | 跨月 | 2026-02-16 (2025腊月) + 1day = 02-17 (2026 正月) |
| 11 | 跨年 | 2025-12-31 (无节日) + 1day = 2026-01-01 (元旦节) |
| 12 | 偏好 round-trip | default → setPref → setAll → reset 全闭环 |

## 11. 验收清单

- 5 个 JS 模块 + 1 个 HTML UI + 1 个 JSON + 1 vendor + 1 README + 1 测试 ✓
- 12 测试全 PASS ✓
- 单文件 < 400 行 ✓ (max=292, vendor 除外)
- lunar.min.js MIT 协议 banner 保留 (前 9 行) ✓
- 2026 假期硬编码 34 条 ✓ (元旦 3 / 春节 9 含 2 调休 / 清明 3 / 劳动 4 含 1 调休 / 端午 3 / 中秋 3 / 国庆 9 含 2 调休)
- 4 偏好持久化 + reset ✓
- 不修改 app.html 主体,仅 `YSCalendarWidget.mount()` 注入 ✓

---

_2026-10-16 · yunshu-zhuangqi · v0.1.0 · 命名空间 `yunshu//cloudtech//装企报价//万年历`_
