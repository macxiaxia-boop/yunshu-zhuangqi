// calendar-widget.js — 顶部嵌入式小组件
// 集成: app.html 末尾 <script>
//   window.YSCalendarWidget.mount(document.getElementById('topbar-date-area'))
// 不修改 app.html 主体，仅暴露 mount(containerEl)
// 行为:
//   1) render compact 一行: 「公历 10.16 周四 | 农历九月初八 | 国庆节 | 🔄」
//   2) 偏好持久化: showLunar/showHoliday/showYiJi/showJieqi 开关 + 重渲染
//   3) 点击展开: 弹出 calendar-ui.html(月视图)覆盖层
//   4) Esc 关闭覆盖层

'use strict';

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.YSCalendarWidget = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  var COMPACT_TPL = '<div class="ys-cal-widget" role="group" aria-label="万年历">' +
    '<button type="button" class="ys-cal-trigger" aria-haspopup="dialog">' +
      '<span class="ys-cal-date-solar"></span>' +
      '<span class="ys-cal-sep">|</span>' +
      '<span class="ys-cal-date-lunar"></span>' +
      '<span class="ys-cal-sep ys-cal-sep-hide">|</span>' +
      '<span class="ys-cal-date-holiday"></span>' +
      '<span class="ys-cal-sep ys-cal-sep-toggle">|</span>' +
      '<span class="ys-cal-toggle" title="切换显示">🔄</span>' +
    '</button>' +
    '<div class="ys-cal-pref-panel" hidden>' +
      '<label><input type="checkbox" data-pref="showLunar"> 显示农历</label>' +
      '<label><input type="checkbox" data-pref="showHoliday"> 显示节假日</label>' +
      '<label><input type="checkbox" data-pref="showYiJi"> 显示宜忌</label>' +
      '<label><input type="checkbox" data-pref="showJieqi"> 显示节气</label>' +
      '<button type="button" class="ys-cal-pref-open" data-action="openCalendar">打开万年历</button>' +
      '<button type="button" class="ys-cal-pref-reset" data-action="resetPref">恢复默认</button>' +
    '</div>' +
  '</div>';

  var STYLE_ID = 'ys-cal-widget-style';
  var STYLE_TXT = '.ys-cal-widget{display:inline-flex;align-items:center;font-size:13px;line-height:1.6;}' +
    '.ys-cal-widget .ys-cal-trigger{cursor:pointer;background:transparent;border:0;padding:2px 8px;font-size:13px;display:inline-flex;align-items:center;gap:4px;color:inherit;}' +
    '.ys-cal-widget .ys-cal-trigger:hover{background:rgba(127,127,127,.08);border-radius:4px;}' +
    '.ys-cal-widget .ys-cal-sep{opacity:.35;margin:0 4px;}' +
    '.ys-cal-widget .ys-cal-date-solar{font-weight:600;}' +
    '.ys-cal-widget .ys-cal-date-lunar{color:#8a6d3b;}' +
    '.ys-cal-widget .ys-cal-date-holiday{color:#c0392b;}' +
    '.ys-cal-widget .ys-cal-toggle{cursor:pointer;}' +
    '.ys-cal-widget .ys-cal-pref-panel{position:absolute;background:#fff;border:1px solid #ddd;border-radius:6px;padding:8px 12px;box-shadow:0 4px 16px rgba(0,0,0,.1);z-index:9999;display:flex;flex-direction:column;gap:6px;font-size:13px;color:#333;min-width:160px;}' +
    '.ys-cal-widget .ys-cal-pref-panel label{display:flex;gap:6px;align-items:center;cursor:pointer;}' +
    '.ys-cal-widget .ys-cal-pref-panel button{margin-top:4px;cursor:pointer;border:1px solid #ccc;background:#f7f7f7;padding:4px 8px;border-radius:4px;}' +
    '.ys-cal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;}' +
    '.ys-cal-overlay iframe{width:880px;height:680px;max-width:96vw;max-height:92vh;border:0;background:#fff;border-radius:8px;box-shadow:0 12px 48px rgba(0,0,0,.25);}';

  function ensureStyle() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = STYLE_TXT;
    (document.head || document.documentElement).appendChild(s);
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function getCalendar() {
    return (typeof window !== 'undefined' && window.YSCalendar) || null;
  }
  function getStore() {
    return (typeof window !== 'undefined' && window.YSCalendarStore) || null;
  }

  function renderCompact(rootEl, pref) {
    var cal = getCalendar();
    if (!cal) {
      rootEl.querySelector('.ys-cal-trigger').textContent = '万年历(YSCalendar 未加载)';
      return;
    }
    var now = new Date();
    var info = cal.getLunarInfo(now);
    var store = getStore();
    if (store) pref = store.getPref();

    var solarEl = rootEl.querySelector('.ys-cal-date-solar');
    var lunarEl = rootEl.querySelector('.ys-cal-date-lunar');
    var holidayEl = rootEl.querySelector('.ys-cal-date-holiday');
    var sepHideA = rootEl.querySelectorAll('.ys-cal-sep')[0];
    var sepHideB = rootEl.querySelector('.ys-cal-sep-hide');
    var sepHideC = rootEl.querySelector('.ys-cal-sep-toggle');

    // 周几中文 (JS getDay: 0=Sun)
    var wk = ['日','一','二','三','四','五','六'][now.getDay()];
    var solarText = (now.getMonth() + 1) + '.' + now.getDate() + ' 周' + wk;
    solarEl.textContent = solarText;

    var showLunar = pref ? !!pref.showLunar : true;
    var showHoliday = pref ? !!pref.showHoliday : true;

    lunarEl.textContent = showLunar ? ('农历' + info.lunar) : '';
    lunarEl.style.display = showLunar ? '' : 'none';
    sepHideB.style.display = showLunar ? '' : 'none';

    holidayEl.textContent = showHoliday && info.holiday ? (info.holiday + (info.workStatus === 'work' ? '(调休)' : '')) : '';
    holidayEl.style.display = (showHoliday && info.holiday) ? '' : 'none';
    sepHideC.style.display = (showHoliday && info.holiday) ? '' : 'none';
    sepHideA.style.display = (showLunar || (showHoliday && info.holiday)) ? '' : 'none';
  }

  function wirePref(rootEl) {
    var prefPanel = rootEl.querySelector('.ys-cal-pref-panel');
    var trigger = rootEl.querySelector('.ys-cal-trigger');
    var store = getStore();
    if (!store) return;

    // 初始化 checkbox
    var pref = store.getPref();
    var cbs = rootEl.querySelectorAll('input[data-pref]');
    for (var i = 0; i < cbs.length; i++) {
      cbs[i].checked = !!pref[cbs[i].getAttribute('data-pref')];
    }

    // 触发按钮切换
    trigger.addEventListener('click', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('ys-cal-toggle')) {
        // toggle 图标切换显隐面板
        e.stopPropagation();
        prefPanel.hidden = !prefPanel.hidden;
        return;
      }
      prefPanel.hidden = !prefPanel.hidden;
    });

    // 偏好 checkbox 联动
    var onCb = function () {
      var name = this.getAttribute('data-pref');
      var upd = store.setPref(name, this.checked);
      renderCompact(rootEl, upd);
    };
    for (var j = 0; j < cbs.length; j++) {
      cbs[j].addEventListener('change', onCb);
    }

    // 打开万年历覆盖层
    var btnOpen = rootEl.querySelector('[data-action="openCalendar"]');
    if (btnOpen) {
      btnOpen.addEventListener('click', function (e) {
        e.stopPropagation();
        openOverlay();
        prefPanel.hidden = true;
      });
    }
    // 恢复默认
    var btnReset = rootEl.querySelector('[data-action="resetPref"]');
    if (btnReset) {
      btnReset.addEventListener('click', function (e) {
        e.stopPropagation();
        var def = store.reset();
        var cs = rootEl.querySelectorAll('input[data-pref]');
        for (var k = 0; k < cs.length; k++) {
          cs[k].checked = !!def[cs[k].getAttribute('data-pref')];
        }
        renderCompact(rootEl, def);
      });
    }

    // 点外部关闭
    if (typeof document !== 'undefined') {
      document.addEventListener('click', function (ev) {
        if (!rootEl.contains(ev.target)) prefPanel.hidden = true;
      });
    }
  }

  function openOverlay() {
    if (typeof document === 'undefined') return null;
    var existing = document.getElementById('ys-cal-overlay');
    if (existing) { existing.style.display = ''; return existing; }
    var ov = document.createElement('div');
    ov.id = 'ys-cal-overlay';
    ov.className = 'ys-cal-overlay';
    ov.innerHTML = '<iframe src="./calendar-ui.html" title="万年历"></iframe>';
    ov.tabIndex = -1;
    document.body.appendChild(ov);
    var close = function (e) {
      if (e.key === 'Escape' || e.type === 'click') {
        ov.style.display = 'none';
      }
    };
    ov.addEventListener('click', close);
    document.addEventListener('keydown', close);
    return ov;
  }

  function mount(containerEl) {
    if (!containerEl) throw new Error('[YSCalendarWidget] containerEl 为空');
    if (typeof document === 'undefined') {
      throw new Error('[YSCalendarWidget] 仅浏览器环境可用');
    }
    ensureStyle();
    containerEl.innerHTML = COMPACT_TPL;
    var pref = getStore() ? getStore().getPref() : null;
    renderCompact(containerEl, pref);
    wirePref(containerEl);
    return {
      refresh: function () { renderCompact(containerEl, pref); },
      destroy: function () { containerEl.innerHTML = ''; },
    };
  }

  return {
    mount: mount,
    openOverlay: openOverlay,
    COMPACT_TPL: COMPACT_TPL,
  };
});
