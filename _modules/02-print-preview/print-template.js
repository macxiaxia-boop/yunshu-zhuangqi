/* print-template.js — 4 print templates
 *   renderQuoteTemplate    -> 封面 + 报价明细 + 编制说明 + 签字页
 *   renderChangeOrderTemplate -> 增减项明细
 *   renderMaterialBookTemplate -> 物料全书
 *   renderCoverTemplate    -> 封面（公司信息 + Logo + 工程信息）
 * Empty data is tolerated -> all templates render a placeholder notice.
 * Pure DOM string output -> no jQuery, no framework.
 */
(function (global) {
  'use strict';

  // ---------- helpers ----------
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function num(v) {
    const n = Number(v);
    return isFinite(n) ? n.toFixed(2) : '';
  }
  function dateNow() { return new Date().toISOString().slice(0, 10); }

  function page(html, extraClass) {
    return '<section class="paper ' + (extraClass || '') + '">' + html + '</section>';
  }

  // ---------- 1. 报价明细 ----------
  function renderQuoteTemplate(data) {
    if (!data) data = {};
    const proj = data.projectInfo || {};
    const cats = Array.isArray(data.categories) ? data.categories : [];

    const coverHtml = renderCoverTemplate(data, /*forEmbed*/ true);
    const breakdownHtml = renderBreakdown(cats);
    const notesHtml = renderNotes(proj);
    const signHtml = renderSign(proj);

    return coverHtml + breakdownHtml + notesHtml + signHtml;
  }

  function renderBreakdown(cats) {
    if (!cats.length) {
      return page('<div class="empty">暂无报价分类数据</div>', 'breakdown');
    }
    const rows = cats.map(function (c) {
      const it = Array.isArray(c.items) ? c.items : [];
      const subtotal = it.reduce(function (s, it2) {
        const q = parseFloat(it2.qty) || 0;
        const p = parseFloat(it2.price) || 0;
        return s + q * p;
      }, 0);
      const itemRows = it.length
        ? it.map(function (i) {
            const total = (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0);
            return '<tr>' +
              '<td>' + esc(i.name || '') + '</td>' +
              '<td>' + esc(i.unit || '') + '</td>' +
              '<td class="num">' + esc(i.qty || '') + '</td>' +
              '<td class="num">' + num(i.price) + '</td>' +
              '<td class="num">' + num(total) + '</td>' +
              '<td>' + esc((i.brand || '') + (i.model ? ' / ' + i.model : '')) + '</td>' +
              '</tr>';
          }).join('')
        : '<tr><td colspan="6" class="empty">（空）</td></tr>';
      return '<section class="paper breakdown">' +
        '<h2 class="cat-title">' + esc(c.num || '') + ' ' + esc(c.cn || '') +
        (c.en ? ' <small>' + esc(c.en) + '</small>' : '') + '</h2>' +
        '<table class="quote-table">' +
        '<thead><tr><th>项目名称</th><th>单位</th><th>工程量</th><th>综合单价</th><th>合价</th><th>品牌/型号</th></tr></thead>' +
        '<tbody>' + itemRows + '</tbody>' +
        '<tfoot><tr><td colspan="4" class="right">小计</td><td class="num">' + num(subtotal) + '</td><td></td></tr></tfoot>' +
        '</table>' +
        '</section>';
    }).join('');
    return rows;
  }

  function renderNotes(proj) {
    const notes = proj.notes || '';
    return page(
      '<h2 class="page-title">编制说明</h2>' +
      '<div class="notes-body">' + (notes ? esc(notes) : '（无编制说明）') + '</div>' +
      '<div class="meta">' +
      '<div>编制日期：' + esc(proj.date || dateNow()) + '</div>' +
      '<div>建筑面积：' + esc(proj.designArea || '') + ' ㎡</div>' +
      '</div>',
      'notes');
  }

  function renderSign(proj) {
    return page(
      '<h2 class="page-title">签字页</h2>' +
      '<div class="sign-grid">' +
      '<div><div class="sign-label">编制人员</div><div class="sign-val">' + esc(proj.author || '') + '</div></div>' +
      '<div><div class="sign-label">校对人员</div><div class="sign-val">' + esc(proj.checker || '') + '</div></div>' +
      '<div><div class="sign-label">客户签字</div><div class="sign-val">&nbsp;</div></div>' +
      '<div><div class="sign-label">日期</div><div class="sign-val">&nbsp;</div></div>' +
      '</div>' +
      '<div class="footer-line">' +
      esc(proj.companyName || '') + (proj.companyPhone ? ' · ' + esc(proj.companyPhone) : '') +
      '</div>',
      'sign');
  }

  // ---------- 2. 增减项明细 ----------
  function renderChangeOrderTemplate(data) {
    if (!data) data = {};
    const proj = data.projectInfo || {};
    const rows = Array.isArray(data.changeOrders) ? data.changeOrders : [];
    const trs = rows.length
      ? rows.map(function (r) {
          return '<tr>' +
            '<td>' + esc(r.kind === 'add' ? '增项' : '减项') + '</td>' +
            '<td>' + esc(r.name || '') + '</td>' +
            '<td>' + esc(r.unit || '') + '</td>' +
            '<td class="num">' + esc(r.qty || '') + '</td>' +
            '<td class="num">' + num(r.price) + '</td>' +
            '<td class="num">' + num((parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0)) + '</td>' +
            '<td>' + esc(r.note || '') + '</td>' +
            '</tr>';
        }).join('')
      : '<tr><td colspan="7" class="empty">（无增减项记录）</td></tr>';
    return page(
      '<h1 class="cover-title">' + esc(proj.name || '增减项明细') + '</h1>' +
      '<div class="subtitle">工程编号 ' + esc(proj.code || '') + '</div>' +
      '<table class="quote-table">' +
      '<thead><tr><th>类型</th><th>项目</th><th>单位</th><th>工程量</th><th>单价</th><th>合计</th><th>备注</th></tr></thead>' +
      '<tbody>' + trs + '</tbody>' +
      '</table>',
      'change-order');
  }

  // ---------- 3. 物料全书 ----------
  function renderMaterialBookTemplate(data) {
    if (!data) data = {};
    const proj = data.projectInfo || {};
    const cats = Array.isArray(data.categories) ? data.categories : [];
    const onlyMaterial = cats.filter(function (c) { return c.group === 'material'; });
    const blocks = (onlyMaterial.length ? onlyMaterial : cats).map(function (c) {
      const items = (c.items || []).filter(function (i) { return i.brand || i.model || i.image; });
      const itHtml = items.length
        ? items.map(function (i) {
            const img = i.image ? '<img class="mat-img" src="' + esc(i.image) + '" alt=""/>' : '<div class="mat-img ph">无图</div>';
            return '<div class="mat-item">' + img +
              '<div class="mat-info">' +
              '<div class="mat-name">' + esc(i.name || '') + '</div>' +
              '<div class="mat-meta">' + esc(i.brand || '') + (i.model ? ' / ' + esc(i.model) : '') + '</div>' +
              '<div class="mat-meta">' + esc(i.spec || '') + '</div>' +
              '</div></div>';
          }).join('')
        : '<div class="empty">（无物料条目）</div>';
      return '<section class="paper material-block">' +
        '<h2 class="cat-title">' + esc(c.cn || '') + '</h2>' +
        '<div class="mat-grid">' + itHtml + '</div>' +
        '</section>';
    }).join('');
    return page(
      '<h1 class="cover-title">' + esc(proj.materialBookTitle || '物料全书') + '</h1>' +
      '<div class="subtitle">' + esc(proj.name || '') + '</div>',
      'material-cover') + (blocks || '<section class="paper"><div class="empty">暂无物料数据</div></section>');
  }

  // ---------- 4. 封面 ----------
  function renderCoverTemplate(data, forEmbed) {
    const proj = (data && data.projectInfo) || {};
    const logo = proj.logoData
      ? '<img class="cover-logo" src="' + esc(proj.logoData) + '" alt="logo"/>'
      : '<div class="cover-logo ph">LOGO</div>';
    const klass = 'cover-page' + (forEmbed ? ' embed' : '');
    return page(
      '<div class="cover-inner">' +
      logo +
      '<div class="cover-cn">' + esc(proj.uiTitleCn || '云上室内建筑报价系统') + '</div>' +
      '<div class="cover-en">' + esc(proj.uiTitleEn || 'INTERIOR DESIGN QUOTATION SYSTEM') + '</div>' +
      '<div class="cover-line"></div>' +
      '<div class="cover-proj">' +
      '<div><b>工程名称：</b>' + esc(proj.name || '—') + '</div>' +
      '<div><b>工程编号：</b>' + esc(proj.code || '—') + '</div>' +
      '<div><b>业主：</b>' + esc(proj.ownerName || '—') + '</div>' +
      '<div><b>地址：</b>' + esc(proj.projectAddress || '—') + '</div>' +
      '<div><b>编制日期：</b>' + esc(proj.date || dateNow()) + '</div>' +
      '</div>' +
      '<div class="cover-foot">' +
      '<div>' + esc(proj.companyName || '') + '</div>' +
      '<div>' + esc(proj.companyAddress || '') + '</div>' +
      '<div>' + esc(proj.companyPhone || '') + (proj.companyWebsite ? ' ' + esc(proj.companyWebsite) : '') + '</div>' +
      '</div>' +
      '</div>',
      klass);
  }

  // ---------- export ----------
  global.PrintTemplate = Object.freeze({
    renderQuoteTemplate: renderQuoteTemplate,
    renderChangeOrderTemplate: renderChangeOrderTemplate,
    renderMaterialBookTemplate: renderMaterialBookTemplate,
    renderCoverTemplate: renderCoverTemplate
  });
})(typeof window !== 'undefined' ? window : globalThis);