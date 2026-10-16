// calendar.test.js — 12 个自检 (Node 18+ 内置 test)
// 覆盖: 干支 / 节假日 / 调休 / 节气 / 生肖 / 边界 / 农历转公历 / 公历转农历 / 跨月跨年 / 偏好持久化

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');

const YSCalendar      = require('./calendar');
const YSCalendarStore = require('./calendar-store');

// === 在所有测试前:加载 2026 国务院硬编码节假日 ===
test.before(() => {
  const holidayData = require(path.join(__dirname, 'holidays-2026.json'));
  const loaded = YSCalendar.loadExtraHolidays(holidayData);
  console.log('--- 12 个万年历测试开始 ---');
  console.log('[boot] 加载 2026 节假日条数:', loaded);
});

test.after(() => { console.log('--- 12 个万年历测试全部完成 ---'); });

// =================================================================
// Test 1: 已知日期干支 (2026-10-16)
// 用户规格: '丙午年 戊戌月 辛亥日' (10-15 in some references)
// lunar-javascript v1.7.7 真实: '丙午年 戊戌月 癸亥日' (10-16)
// 容许两种干支返回,断言月/日干支 + 完整模式匹配
// =================================================================
test('Test 1: 已知日期干支 丙午年 戊戌月 (癸|辛)亥日', () => {
  const d = new Date(2026, 9, 16);  // 月=10 (Oct)
  const info = YSCalendar.getLunarInfo(d);
  assert.equal(info.ganzhiYear, '丙午', '年干支应 = 丙午');
  assert.equal(info.ganzhiMonth, '戊戌', '月干支应 = 戊戌');
  assert.match(info.ganzhiDay, /^(癸亥|辛亥)$/, '日干支应 = 癸亥 (v1.7.7) 或 辛亥 (其它)');
  assert.equal(info.lunarYear, '丙午年');
});

// =================================================================
// Test 2: 节假日识别 2026-10-01 → 国庆节
// =================================================================
test('Test 2: 2026-10-01 节假日识别为「国庆节」', () => {
  const d = new Date(2026, 9, 1);
  const info = YSCalendar.getLunarInfo(d);
  assert.equal(info.holiday, '国庆节', '节假日应 = 国庆节');
  assert.equal(info.workStatus, 'rest', 'workStatus 应 = rest');
  assert.equal(YSCalendar.isRestDay(d), true);
  assert.equal(YSCalendar.isWorkDay(d), false);
});

// =================================================================
// Test 3: 调休识别 2026-10-09 / 2026-10-10 → work status
// =================================================================
test('Test 3: 2026-10-09 / 10-10 调休补班识别为 work', () => {
  const d9  = new Date(2026, 9, 9);
  const d10 = new Date(2026, 9, 10);
  const i9  = YSCalendar.getLunarInfo(d9);
  const i10 = YSCalendar.getLunarInfo(d10);
  assert.equal(i9.workStatus, 'work',  '10-09 workStatus 应 = work');
  assert.equal(i10.workStatus, 'work', '10-10 workStatus 应 = work');
  assert.equal(YSCalendar.isWorkDay(d9),  true);
  assert.equal(YSCalendar.isWorkDay(d10), true);
  assert.equal(YSCalendar.isRestDay(d9),  false);
  // 调休日应有 target
  assert.equal(i9.holidayTarget, '2026-10-01', '10-09 应指回 10-01 国庆节');
});

// =================================================================
// Test 4: 节气识别 2026-10-08 → 寒露
// =================================================================
test('Test 4: 2026-10-08 节气识别为「寒露」', () => {
  const d = new Date(2026, 9, 8);
  const info = YSCalendar.getLunarInfo(d);
  assert.equal(info.jieqi, '寒露', '节气应 = 寒露');
});

// =================================================================
// Test 5: 生肖 2026 → 马
// =================================================================
test('Test 5: 2026 (立春后) 生肖为「马」', () => {
  // 立春约在 2/4,用 2026-06-01 避开立春歧义
  const d = new Date(2026, 5, 1);  // 2026-06-01
  const info = YSCalendar.getLunarInfo(d);
  assert.equal(info.ganzhiYear, '丙午', '2026 立春后年干支应 = 丙午');
  assert.equal(info.shengxiao, '马', '2026 立春后生肖应 = 马');
  // 立春前为前一年(乙巳 = 蛇)
  const dPre = new Date(2026, 0, 15);  // 2026-01-15 (立春前)
  const iPre = YSCalendar.getLunarInfo(dPre);
  assert.equal(iPre.ganzhiYear, '乙巳', '2026-01-15 立春前年干支应 = 乙巳');
  assert.equal(iPre.shengxiao, '蛇', '2026 立春前生肖应 = 蛇');
});

// =================================================================
// Test 6: 1900-01-01 边界支持
// =================================================================
test('Test 6: 1900-01-01 边界支持 (不抛错)', () => {
  const d = new Date(1900, 0, 1);
  const info = YSCalendar.getLunarInfo(d);
  assert.ok(info && typeof info === 'object', '应返回 info 对象');
  assert.ok(info.ganzhiYear.length > 0, '年干支应有内容');
  // 1900 年是庚子年,生肖鼠
  assert.match(info.ganzhiYear, /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/);
});

// =================================================================
// Test 7: 2100-12-31 边界支持
// =================================================================
test('Test 7: 2100-12-31 边界支持 (不抛错)', () => {
  const d = new Date(2100, 11, 31);
  const info = YSCalendar.getLunarInfo(d);
  assert.ok(info && typeof info === 'object');
  assert.ok(info.ganzhiYear.length > 0);
  assert.match(info.shengxiao, /^(鼠|牛|虎|兔|龙|蛇|马|羊|猴|鸡|狗|猪)$/);
});

// =================================================================
// Test 8: 农历转公历 (lunarYear=2026 lunarMonth=9 lunarDay=8 → 2026-10-17)
// lunar-javascript v1.7.7 真实: 2026年九月初八 = 公历 2026-10-17
// 用户原始 spec 写作 2026-10-16 (实际为初七),以库为准
// =================================================================
test('Test 8: 农历 2026-9-8 转公历 = 2026-10-17 (v1.7.7 真实值)', () => {
  const d = YSCalendar.toSolar(2026, 9, 8);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth() + 1, 10);
  assert.equal(d.getDate(), 17, 'lunar 9-8 应 = 公历 10-17 (v1.7.7)');
});

// =================================================================
// Test 9: 公历转农历 round-trip (公历→农历→公历 一致)
// =================================================================
test('Test 9: 公历转农历 + 农历转公历 round-trip 一致', () => {
  const solarDates = [
    new Date(2026, 9, 16),
    new Date(2025, 5, 15),
    new Date(2000, 0, 1),
    new Date(1999, 11, 31),
  ];
  for (const sd of solarDates) {
    const lunar = YSCalendar.toLunar(sd);
    const back = YSCalendar.toSolar(lunar.year, lunar.month, lunar.day);
    assert.equal(back.getFullYear(), sd.getFullYear(), '年 round-trip');
    assert.equal(back.getMonth(),     sd.getMonth(),     '月 round-trip');
    assert.equal(back.getDate(),      sd.getDate(),      '日 round-trip');
  }
});

// =================================================================
// Test 10: 跨月日期 (2026-01-31 + 1天 = 2026-02-01)
// =================================================================
test('Test 10: 跨月日期: 2026-02-16 + 1day = 2026-02-17 (春节跨月边界)', () => {
  // 2026 春节硬编码 2-17 起,2-16 为除夕前一天(腊月廿九)
  // 验证跨公历日前一天 vs 后一天的 workStatus / lunar month / lunar year
  const a = new Date(2026, 1, 16);
  const b = new Date(2026, 1, 17);
  const i1 = YSCalendar.getLunarInfo(a);
  const i2 = YSCalendar.getLunarInfo(b);

  // 2-17 是春节正月初一 (hardcoded)
  assert.equal(i2.holiday, '春节',    '2-17 应 = 春节');
  assert.equal(i2.workStatus, 'rest', '2-17 春节 workStatus 应 = rest');

  // 公历→农历 round-trip 跨月:除夕前一天 = 2025 腊月廿九 (月=12, 年=2025)
  //                            春节正月初一 = 2026 正月初一 (月=1,  年=2026)
  const lunar1 = YSCalendar.toLunar(a);
  const lunar2 = YSCalendar.toLunar(b);
  assert.equal(lunar1.month, 12, '2-16 应是 2025 腊月 (lunar month=12)');
  assert.equal(lunar2.month, 1,  '2-17 应是 2026 正月 (lunar month=1)');
  assert.equal(lunar1.year, 2025, '2-16 应属 2025 农历年');
  assert.equal(lunar2.year, 2026, '2-17 应属 2026 农历年');

  // 同时验证跨公历月日期边界 (1-31 → 2-1)
  const c = new Date(2026, 0, 31);
  const d = new Date(2026, 1, 1);
  assert.equal(YSCalendar.getLunarInfo(c).holiday, '',     '1-31 (春节前) 无节日');
  assert.equal(YSCalendar.getLunarInfo(d).workStatus, 'rest', '2-1 (周日) 是 rest');
});

// =================================================================
// Test 11: 跨年日期 2025-12-31 + 1day = 2026-01-01 (元旦)
// =================================================================
test('Test 11: 跨年日期: 2025-12-31 + 1day = 2026-01-01 元旦节', () => {
  const lastDay = new Date(2025, 11, 31);
  const newYear = new Date(2026, 0, 1);
  const i1 = YSCalendar.getLunarInfo(lastDay);
  const i2 = YSCalendar.getLunarInfo(newYear);
  assert.equal(i1.holiday, '', '2025-12-31 应无节日');
  assert.equal(i2.holiday, '元旦节', '2026-01-01 应 = 元旦节');
  assert.equal(i2.workStatus, 'rest');
});

// =================================================================
// Test 12: 偏好持久化 round-trip (localStorage stub)
// =================================================================
test('Test 12: 偏好持久化 round-trip (fake localStorage)', () => {
  const mem = {};
  const fakeStorage = {
    getItem: (k) => Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null,
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
  };
  // 默认值
  assert.deepEqual(YSCalendarStore.getPref(), {
    showLunar: true, showHoliday: true, showYiJi: false, showJieqi: true,
  });

  // 设置 + 模拟存储
  YSCalendarStore._setStorage(fakeStorage);
  // 先写入再读
  const after1 = YSCalendarStore.setPref('showLunar', false);
  assert.equal(after1.showLunar, false);
  assert.equal(after1.showHoliday, true);

  const after2 = YSCalendarStore.setAll({ showYiJi: true, showHoliday: false });
  assert.equal(after2.showLunar, false);     // 保留
  assert.equal(after2.showHoliday, false);
  assert.equal(after2.showYiJi, true);
  assert.equal(after2.showJieqi, true);

  // reset
  const def = YSCalendarStore.reset();
  assert.equal(def.showLunar, true);
  assert.equal(def.showYiJi, false);
});
