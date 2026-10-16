// calendar.js — yunshu-zhuangqi 万年历包装层
// SSOT: REF 3.1.0 升级说明 §3.1.0 「lunar-javascript 集成」
// 数据源：vendor/lunar.min.js (lunar-javascript v1.7.7, MIT)
//        + data/holidays-2026.json (国务院放假通知 硬编码)
// 范围：1900-2100 年（lunar 库内置范围）
// 输出：window.YSCalendar (浏览器) + module.exports (Node)

'use strict';

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./vendor/lunar.min.js'));
  } else {
    root.YSCalendar = factory(root.lunar);
  }
})(typeof self !== 'undefined' ? self : this, function (lunarNs) {
  if (!lunarNs || !lunarNs.Solar) {
    throw new Error('[YSCalendar] lunar-javascript 未加载，请先 vendor/lunar.min.js');
  }
  var Solar = lunarNs.Solar;
  var Lunar = lunarNs.Lunar;
  var HolidayUtil = lunarNs.HolidayUtil;

  // ----- 内部工具 -----

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function toSolarDate(y, m, d) {
    if (m < 1 || m > 12) throw new Error('[YSCalendar] month 越界: ' + m);
    if (d < 1 || d > 31) throw new Error('[YSCalendar] day 越界: ' + d);
    var s = Solar.fromYmd(y, m, d);
    return new Date(s.getYear(), s.getMonth() - 1, s.getDay());
  }

  // 周几中文 (1=Sun .. 7=Sat 是 lunar 库的约定，这里统一为 JS getDay 0=Sun .. 6=Sat)
  var WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  var WEEK_CN_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

  function getWeekCn(date) { return WEEK_CN[date.getDay()]; }
  function getWeekCnShort(date) { return WEEK_CN_SHORT[date.getDay()]; }

  // ----- 节假日数据合并（库内置 + 我们硬编码的 2026 国务院通知）-----
  var EXTRA_HOLIDAYS = {};     // key: 'YYYY-MM-DD' -> { name, isWork, target? }
  var EXTRA_BY_YEAR = {};      // key: year (int) -> [{day, name, isWork, target?}, ...]

  function loadExtraHolidays(record) {
    if (!record || typeof record !== 'object') return 0;
    var year = record.year;
    if (!year) return 0;
    EXTRA_BY_YEAR[year] = EXTRA_BY_YEAR[year] || [];
    var list = record.entries || [];
    var loaded = 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !e.date) continue;
      var key = e.date;
      EXTRA_HOLIDAYS[key] = {
        name: e.name || '',
        isWork: e.type === 'workday',
        target: e.target || null,
      };
      EXTRA_BY_YEAR[year].push({
        day: key,
        name: e.name || '',
        isWork: e.type === 'workday',
        target: e.target || null,
      });
      loaded++;
    }
    return loaded;
  }

  /**
   * 节假日查询：合并 lunar 内置 HolidayUtil + 硬编码 holidays-*.json
   * @param {number} y 公历年
   * @param {number} m 公历月 (1-12)
   * @param {number} d 公历日 (1-31)
   * @returns {{name:string, isWork:boolean, target:string|null}|null}
   */
  function lookupHoliday(y, m, d) {
    var key = y + '-' + pad2(m) + '-' + pad2(d);
    // 1) 优先硬编码 (覆盖库数据)
    if (Object.prototype.hasOwnProperty.call(EXTRA_HOLIDAYS, key)) {
      var h = EXTRA_HOLIDAYS[key];
      return { name: h.name, isWork: !!h.isWork, target: h.target };
    }
    // 2) fallback 到 lunar 内置库
    try {
      var libH = HolidayUtil.getHoliday(y, m, d);
      if (libH) {
        return {
          name: libH.getName(),
          isWork: !!libH.isWork(),
          target: libH.getTarget ? libH.getTarget() : null,
        };
      }
    } catch (e) { /* HolidayUtil 可能抛越界 */ }
    return null;
  }

  // ----- 公开 API -----

  /**
   * getLunarInfo(date) — 农历 + 干支 + 生肖 + 节气 + 节假日 + 宜忌
   * @param {Date} date
   */
  function getLunarInfo(date) {
    if (!(date instanceof Date)) throw new Error('[YSCalendar] date 必须是 Date 实例');
    var y = date.getFullYear();
    var m = date.getMonth() + 1;
    var d = date.getDate();
    var solar = Solar.fromYmd(y, m, d);
    var lunar = solar.getLunar();

    var yi = lunar.getDayYi ? lunar.getDayYi() : [];
    var ji = lunar.getDayJi ? lunar.getDayJi() : [];
    if (!Array.isArray(yi)) yi = [];
    if (!Array.isArray(ji)) ji = [];

    var jieqi = lunar.getJieQi ? lunar.getJieQi() : '';

    var holiday = lookupHoliday(y, m, d);

    var monthGZ = lunar.getMonthInGanZhi ? lunar.getMonthInGanZhi() : '';
    var dayGZ = lunar.getDayInGanZhi ? lunar.getDayInGanZhi() : '';
    var fullGZ = (lunar.getYearInGanZhi ? lunar.getYearInGanZhi() : '') +
                 ' ' + monthGZ + '月 ' + dayGZ + '日';

    var lunarText = lunar.getMonthInChinese() + '月' + lunar.getDayInChinese();
    var lunarYearText = lunar.getYearInGanZhi() + '年';

    var workStatus = 'normal';
    if (holiday) {
      workStatus = holiday.isWork ? 'work' : 'rest';
    } else {
      var dow = date.getDay();
      if (dow === 0 || dow === 6) workStatus = 'rest';
    }

    return {
      lunar: lunarText,
      lunarYear: lunarYearText,
      ganzhi: fullGZ.trim(),
      ganzhiYear: lunar.getYearInGanZhi ? lunar.getYearInGanZhi() : '',
      ganzhiMonth: monthGZ,
      ganzhiDay: dayGZ,
      shengxiao: lunar.getShengxiao ? lunar.getShengxiao() : '',
      jieqi: jieqi || '',
      holiday: holiday ? holiday.name : '',
      holidayTarget: holiday ? holiday.target : null,
      yi: yi,
      ji: ji,
      workStatus: workStatus,
    };
  }

  /**
   * formatTodayCN(date) — 中文长串，工具栏/卡片用
   */
  function formatTodayCN(date) {
    if (!(date instanceof Date)) throw new Error('[YSCalendar] date 必须是 Date 实例');
    var y = date.getFullYear();
    var m = pad2(date.getMonth() + 1);
    var d = pad2(date.getDate());
    var info = getLunarInfo(date);
    var parts = [];
    parts.push('公历 ' + y + '-' + m + '-' + d + ' ' + getWeekCn(date));
    parts.push('农历' + info.lunar);
    if (info.ganzhi) parts.push(info.ganzhi);
    if (info.shengxiao) parts.push(info.shengxiao);
    if (info.holiday) parts.push(info.holiday);
    if (info.yi && info.yi.length) parts.push('宜' + info.yi.slice(0, 4).join(' '));
    if (info.ji && info.ji.length) parts.push('忌' + info.ji.slice(0, 4).join(' '));
    return parts.join(' · ');
  }

  /**
   * getHoliday(year) — 返回该年的所有节假日 + 调休
   * @param {number} year
   * @returns {Array<{day, name, isWork, target}>}
   */
  function getHoliday(year) {
    if (typeof year !== 'number') throw new Error('[YSCalendar] year 必须为数字');
    var out = [];
    var seen = {};

    // 1) 硬编码
    if (EXTRA_BY_YEAR[year]) {
      for (var i = 0; i < EXTRA_BY_YEAR[year].length; i++) {
        var e = EXTRA_BY_YEAR[year][i];
        if (!seen[e.day]) {
          out.push({ day: e.day, name: e.name, isWork: e.isWork, target: e.target });
          seen[e.day] = true;
        }
      }
    }

    // 2) 库 (尝试用 HolidayUtil.getHolidays(y, 0/12); 这里我们对库数据按年扫描 1-12)
    try {
      for (var m = 1; m <= 12; m++) {
        var lst = HolidayUtil.getHolidays(year, m);
        for (var k = 0; k < lst.length; k++) {
          var h = lst[k];
          var dayStr = h.getDay();
          if (typeof dayStr !== 'string' || dayStr.length < 10) continue;
          if (!seen[dayStr]) {
            out.push({
              day: dayStr,
              name: h.getName(),
              isWork: !!h.isWork(),
              target: h.getTarget ? h.getTarget() : null,
            });
            seen[dayStr] = true;
          }
        }
      }
    } catch (e) { /* 越界年份 */ }

    out.sort(function (a, b) { return a.day < b.day ? -1 : a.day > b.day ? 1 : 0; });
    return out;
  }

  /**
   * isRestDay(date) — 法定休息日 (含周末 + 节假日 + 调休补休)
   * @param {Date} date
   */
  function isRestDay(date) {
    if (!(date instanceof Date)) return false;
    var h = lookupHoliday(date.getFullYear(), date.getMonth() + 1, date.getDate());
    if (h) return !h.isWork;       // 是节假日 且 非调休 → 休息
    var dow = date.getDay();
    return dow === 0 || dow === 6;  // 周末天然休息
  }

  /**
   * isWorkDay(date) — 工作日 (周末 + 节假日 + 调休补班) 之反
   */
  function isWorkDay(date) { return !isRestDay(date); }

  /**
   * toSolar(lunarYear, lunarMonth, lunarDay) — 农历转公历
   * @returns {Date} 公历 Date 实例
   */
  function toSolar(lunarYear, lunarMonth, lunarDay) {
    var l = Lunar.fromYmd(lunarYear, lunarMonth, lunarDay);
    var s = l.getSolar();
    return new Date(s.getYear(), s.getMonth() - 1, s.getDay());
  }

  /**
   * toLunar(date) — 公历转农历
   * @returns {object} { year, month, day, monthCn, dayCn, isLeap }
   */
  function toLunar(date) {
    if (!(date instanceof Date)) throw new Error('[YSCalendar] date 必须是 Date 实例');
    var s = Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate());
    var l = s.getLunar();
    return {
      year: l.getYear(),
      month: l.getMonth(),
      day: l.getDay(),
      monthCn: l.getMonthInChinese(),
      dayCn: l.getDayInChinese(),
      isLeap: !!l.isLeap,
    };
  }

  return {
    // 核心
    getLunarInfo: getLunarInfo,
    formatTodayCN: formatTodayCN,
    getHoliday: getHoliday,
    isRestDay: isRestDay,
    isWorkDay: isWorkDay,
    toSolar: toSolar,
    toLunar: toLunar,

    // 工具
    getWeekCn: getWeekCn,
    getWeekCnShort: getWeekCnShort,

    // 节假日数据管理
    loadExtraHolidays: loadExtraHolidays,
    __resetExtraHolidays: function () {
      EXTRA_HOLIDAYS = {};
      EXTRA_BY_YEAR = {};
    },

    // 内部常量 (测试用)
    __PAD2__: pad2,
  };
});
