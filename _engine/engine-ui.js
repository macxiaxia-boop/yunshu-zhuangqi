/*!
 * yunshu-zhuangqi · 报价工作台 UI 逻辑
 * 把 QE 引擎接到界面 + 13 模块桥
 */
(function () {
  'use strict';
  const QE = window.QE;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const money = n => (Number(n) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let view = 'summary';        // 'summary' | categoryId
  let quotaLoaded = false;

  // ══ Toast ══
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  // ══ 侧栏渲染 ══
  function renderSidebar(calc) {
    const groups = { construction: $('#navConstruction'), material: $('#navMaterial') };
    groups.construction.innerHTML = '';
    groups.material.innerHTML = '';
    let nC = 0, nM = 0;
    for (const def of QE.CATEGORIES) {
      const stat = calc.byCategory[def.id] || { sum: 0 };
      const cnt = (QE.data.categories.find(c => c.id === def.id) || { items: [] }).items.length;
      if (def.group === 'construction') nC++; else nM++;
      const el = document.createElement('div');
      el.className = 'nav-item' + (view === def.id ? ' active' : '');
      el.innerHTML =
        `<span class="num">${esc(def.num)}</span>` +
        `<span style="flex:1">${esc(def.cn)}${def.isAppendix ? ' <i class="apx">附</i>' : ''}` +
        `${cnt ? ` <i class="apx">${cnt}</i>` : ''}</span>` +
        `<span class="amt">${stat.sum ? money(stat.sum) : ''}</span>`;
      el.onclick = () => go(def.id);
      groups[def.group].appendChild(el);
    }
    $('#cntConstruction').textContent = nC;
    $('#cntMaterial').textContent = nM;
  }

  // ══ 顶栏指标 ══
  function renderTop(calc) {
    const p = QE.projectInfo;
    $('#prjNameTop').textContent = p.name || '未命名工程';
    $('#prjCodeTop').textContent = p.code || '—';
    $('#topMetrics').innerHTML = [
      ['基装', money(calc.constructionSum), 0],
      ['主材', money(calc.materialSum), 0],
      ['管理费', money(calc.managementFee), 0],
      ['税金', money(calc.tax), 0],
      ['总计', money(calc.total), 1]
    ].map(([l, v, hl]) =>
      `<div class="m${hl ? ' hl' : ''}"><b>${v}</b><span>${l}</span></div>`).join('');
    $('#dirtyDot').classList.toggle('on', !!QE.state.dirty);
  }

  // ══ 底栏汇总 ══
  function renderFoot(calc) {
    const cells = [
      ['基装合计', money(calc.constructionSum)],
      ['主材合计', money(calc.materialSum)],
      ['管理费 ' + QE.fees.managementRate + '%', money(calc.managementFee)],
      ['主材服务费 ' + QE.fees.materialServiceRate + '%', money(calc.materialFee)],
      ['税金 ' + QE.fees.taxRate + '%', money(calc.tax)],
      ['设计费', money(calc.designFee)],
      ['折扣 ' + QE.fees.discountRate + '%', money(calc.total)],
      ['', '¥ ' + money(calc.grandTotal), 'total']
    ];
    let html = cells.map(([l, v, cls]) =>
      `<div class="cell ${cls || ''}"><span class="l">${l}</span><span class="v">${v}</span></div>`).join('');
    if (calc.changeAdd || calc.changeRemove) {
      html += `<div class="cell neg"><span class="l">增减净额</span>` +
              `<span class="v">${calc.changeNet >= 0 ? '+' : '−'}${money(Math.abs(calc.changeNet))}</span></div>`;
    }
    $('#totalsBar').innerHTML = html;
    $('#chgBadge').textContent = (QE.data.changeOrders || []).length;
  }

  // ══ 概览页 ══
  function renderSummary(calc) {
    const p = QE.projectInfo;
    $('#summaryPanel').classList.remove('hidden');
    $('#tablePanel').classList.add('hidden');
    $('#crumb').textContent = '报价系统 / 项目报价工作台';
    $('#headMeta').innerHTML = [
      ['工程编号', p.code || '待填写'], ['业主', p.ownerName || '待填写'],
      ['地址', p.projectAddress || '待填写'], ['面积', (p.designArea || 0) + ' ㎡'],
      ['编制', p.author || '待填写'], ['日期', p.date || '—']
    ].map(([k, v]) => `<span><b style="font-weight:500">${k}</b> ${esc(v)}</span>`).join('');
    $('#cards').innerHTML = [
      ['设计费', money(calc.designFee), 0],
      ['基装工程', money(calc.constructionSum), 0],
      ['主材软装', money(calc.materialSum), 0],
      ['本次报价合计', money(calc.total), 1]
    ].map(([l, v, hl]) =>
      `<div class="card${hl ? ' hl' : ''}"><div class="lbl">${l}</div><div class="val">¥ ${v}</div></div>`).join('');
  }

  // ══ 分类表格页 ══
  let filterText = '';
  function renderTable(calc) {
    const def = QE.catDef(view);
    if (!def) return;
    $('#summaryPanel').classList.add('hidden');
    $('#tablePanel').classList.remove('hidden');
    $('#crumb').innerHTML = `报价系统 / ${esc(def.group === 'material' ? '主材软装' : '基装工程')} / <b>${esc(def.cn)}</b>`;
    $('#tableTitle').innerHTML = `${esc(def.num)} ${esc(def.cn)}` +
      (def.isAppendix ? ' <span style="font-size:11px;color:var(--muted)">（附表 · 不计入总额）</span>' : '');

    const cat = QE.data.categories.find(c => c.id === view);
    const rows = (cat.items || []).filter(it => {
      if (!filterText) return true;
      const hay = [it.name, it.unit, it.desc, it.brand, it.model, it.spec].join(' ').toLowerCase();
      return hay.includes(filterText.toLowerCase());
    });
    $('#itemBody').innerHTML = rows.length ? rows.map((it, i) => `
      <tr class="${it.excluded ? 'excluded' : ''}" data-id="${it.id}">
        <td class="row-idx">${i + 1}</td>
        <td><input data-f="name" value="${esc(it.name)}" placeholder="项目名称"></td>
        <td><input data-f="unit" value="${esc(it.unit)}"></td>
        <td class="num"><input data-f="qty" inputmode="decimal" value="${esc(it.qty)}"></td>
        <td class="num"><input data-f="price" inputmode="decimal" value="${esc(it.price)}"></td>
        <td class="amt" data-amt>${money(it._amount)}</td>
        <td><input data-f="desc" value="${esc(it.desc || '')}" placeholder="工艺说明"></td>
        <td class="ops">
          <button data-op="ex" title="${it.excluded ? '恢复计入' : '不计入报价'}">${it.excluded ? '○' : '●'}</button>
          <button data-op="del" title="删除">×</button>
        </td>
      </tr>`).join('')
      : `<tr><td colspan="8" class="empty-row">本分类暂无条目 — 点「＋ 添加行」手动录入，或「🔍 从定额库加」搜索 REF 标准定额</td></tr>`;
    $('#itemFoot').innerHTML = rows.length
      ? `<tr><td colspan="5" style="text-align:right">本分类小计（${rows.length} 条）</td>
         <td class="amt">${money(rows.filter(r => !r.excluded).reduce((s, r) => s + r._amount, 0))}</td><td colspan="2"></td></tr>`
      : '';
    $('#headMeta') && ($('#headMeta').innerHTML = `<span><b style="font-weight:500">条目</b> ${rows.length}</span>`);
  }

  // ══ 主渲染 ══
  function renderAll() {
    const calc = QE.calc();
    renderSidebar(calc); renderTop(calc); renderFoot(calc);
    if (view === 'summary') renderSummary(calc); else renderTable(calc);
    renderChanges();
  }
  function go(id) { view = id; filterText = ''; $('#tableFilter').value = ''; renderAll(); }

  // ══ 事件：表格编辑 ══
  $('#itemBody').addEventListener('input', e => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const f = e.target.dataset.f; if (!f) return;
    const patch = {};
    if (f === 'qty' || f === 'price') {
      let v = e.target.value.trim();
      if (v === '' || v === '.') v = '0';
      else if (!/^\d*(\.\d*)?$/.test(v)) return;
      patch[f] = Number(v) || 0;
    } else patch[f] = e.target.value;
    QE.ops.updateRow(view, tr.dataset.id, patch);
    const cell = tr.querySelector('[data-amt]');
    const row = QE.data.categories.find(c => c.id === view).items.find(r => r.id === tr.dataset.id);
    if (cell) cell.textContent = money(row._amount);
  });
  $('#itemBody').addEventListener('click', e => {
    const btn = e.target.closest('button[data-op]'); if (!btn) return;
    const tr = btn.closest('tr[data-id]');
    if (btn.dataset.op === 'del') { QE.ops.removeRow(view, tr.dataset.id); toast('已删除'); }
    else { QE.ops.toggleExclude(view, tr.dataset.id); }
  });
  $('#tableFilter').addEventListener('input', e => { filterText = e.target.value; renderTable(QE.calc()); });
  $('#btnAddRow').onclick = () => {
    const r = QE.ops.addRow(view, { name: '', unit: defUnit(), qty: 1, price: 0 });
    renderAll();
    const tr = document.querySelector(`tr[data-id="${r.id}"] input[data-f="name"]`);
    if (tr) tr.focus();
  };
  function defUnit() { const d = QE.catDef(view); return d && d.group === 'material' ? '项' : '㎡'; }
  $('#btnClearCat').onclick = () => {
    const cat = QE.data.categories.find(c => c.id === view);
    if (!cat || !cat.items.length) return;
    if (!confirm(`确认清空「${QE.catDef(view).cn}」的 ${cat.items.length} 条明细？此操作不可撤销。`)) return;
    QE.ops.clearCategory(view); toast('已清空');
  };
  $('#btnAddQuota').onclick = () => openQuota(view);

  // ══ 项目资料 ══
  const INFO_FIELDS = [
    ['name', '工程名称', 1], ['code', '工程编号'], ['ownerName', '业主姓名'],
    ['projectAddress', '项目地址', 1], ['designArea', '建筑面积 ㎡'],
    ['date', '编制日期', 'date'], ['author', '编制人员'], ['checker', '校对人员'],
    ['email', '邮箱'], ['notes', '编制说明', 'textarea']
  ];
  function openInfo() {
    const p = QE.projectInfo;
    $('#infoForm').innerHTML = INFO_FIELDS.map(([k, lbl, type]) => {
      const v = esc(p[k] == null ? '' : p[k]);
      return `<div class="f${type === 1 ? ' full' : ''}"><label>${lbl}</label>` +
        (type === 'textarea' ? `<textarea data-i="${k}">${v}</textarea>`
          : `<input data-i="${k}" type="${type || 'text'}" value="${v}">`) + `</div>`;
    }).join('');
    $('#infoForm').oninput = e => {
      const k = e.target.dataset.i; if (!k) return;
      const v = k === 'designArea' ? (Number(e.target.value) || 0) : e.target.value;
      QE.ops.setInfo({ [k]: v });
    };
    $('#dlgInfo').showModal();
  }

  // ══ 费率 ══
  const FEE_FIELDS = [
    ['managementRate', '管理费率 %', '基装合计 × %'],
    ['materialServiceRate', '主材服务费率 %', '主材合计 × %'],
    ['taxRate', '税金率 %', '小计 × %'],
    ['designRate', '设计费 元/㎡', '建筑面积 × 元'],
    ['discountRate', '折扣率 %', '小计 × %（100 = 不打折）']
  ];
  function openFees() {
    $('#feeForm').innerHTML = FEE_FIELDS.map(([k, lbl, hint]) =>
      `<div class="f"><label>${lbl}</label><input data-fee="${k}" inputmode="decimal" value="${QE.fees[k]}"><span style="font-size:10.5px;color:var(--muted)">${hint}</span></div>`).join('');
    $('#feeForm').oninput = e => {
      const k = e.target.dataset.fee; if (!k) return;
      const n = Number(e.target.value);
      if (!Number.isFinite(n) || n < 0) { e.target.style.borderColor = 'var(--danger)'; return; }
      e.target.style.borderColor = '';
      QE.ops.setFee(k, n);
      renderFeePreview();
    };
    renderFeePreview();
    $('#dlgFees').showModal();
  }
  function renderFeePreview() {
    const c = QE.calc();
    $('#feePreview').innerHTML = [
      `基装合计　　 ${money(c.constructionSum)}`,
      `+ 管理费　   ${money(c.managementFee)}`,
      `主材合计　　 ${money(c.materialSum)}`,
      `+ 主材服务费 ${money(c.materialFee)}`,
      `= 小计　　　 ${money(c.subtotal)}`,
      `+ 税金　　   ${money(c.tax)}`,
      `+ 设计费　　 ${money(c.designFee)}`,
      `= 折前　　　 ${money(c.beforeDiscount)}`,
      `× 折扣 ${QE.fees.discountRate}%`,
      `= 总计　　　 ¥ ${money(c.total)}`
    ].join('<br>');
  }

  // ══ 定额库 ══
  let quotaTarget = null;
  function openQuota(target) {
    quotaTarget = target || view;
    if (quotaTarget === 'summary') quotaTarget = 'c01';
    const sel = $('#quotaCat');
    sel.innerHTML = '<option value="">全部分类</option>' +
      QE.CATEGORIES.map(c => `<option value="${c.id}"${c.id === quotaTarget ? ' selected' : ''}>${esc(c.cn)}</option>`).join('');
    sel.onchange = () => { quotaTarget = sel.value || 'c01'; renderQuotaList(); };
    renderQuotaList();
    $('#dlgQuota').showModal();
  }
  function renderQuotaList() {
    const kw = $('#quotaSearch').value;
    const catId = $('#quotaCat').value;
    const qty = Number($('#quotaQty').value) || 1;
    const hits = QE.quota.search(kw, catId);
    $('#quotaCount').textContent = `${hits.length} 条命中`;
    $('#quotaList').innerHTML = hits.length ? hits.slice(0, 300).map(h => `
      <div class="q-item" data-cn="${esc(h.categoryCn)}" data-i="${hits.indexOf(h)}">
        <div>
          <div class="nm">${esc(h.name)}
            <span class="tag">${esc(h.categoryCn)}</span>
            ${h.brand ? `<span class="tag">${esc(h.brand)}</span>` : ''}
            ${h.spec ? `<span class="tag">${esc(h.spec)}</span>` : ''}</div>
          ${h.desc ? `<div class="ds">${esc(h.desc)}</div>` : ''}
        </div>
        <div class="pr"><b>${money(h.price)}</b><small>/ ${esc(h.unit || '项')}</small>
          <button class="btn sm" style="margin-top:4px" data-add>加入 ×${qty}</button></div>
      </div>`).join('')
      : '<div class="empty-row" style="padding:30px">未命中 — 换个关键词，或点「定额库中心」批量导入</div>';
    $('#quotaList')._hits = hits;
  }
  $('#quotaSearch').addEventListener('input', renderQuotaList);
  $('#quotaQty').addEventListener('input', renderQuotaList);
  $('#quotaList').addEventListener('click', e => {
    const btn = e.target.closest('button[data-add]'); if (!btn) return;
    const row = btn.closest('.q-item');
    const h = $('#quotaList')._hits[Number(row.dataset.i)];
    const qty = Number($('#quotaQty').value) || 1;
    QE.quota.addToQuote(h.categoryId, h, qty);
    view = h.categoryId; renderAll();
    toast(`已加入「${h.name}」→ ${h.categoryCn}`);
  });

  // ══ 增减项 ══
  function openChanges() { renderChanges(); $('#dlgChanges').showModal(); }
  function renderChanges() {
    const rows = QE.data.changeOrders || [];
    $('#chgBody').innerHTML = rows.length ? rows.map(r => `
      <tr data-id="${r.id}">
        <td><select data-c="kind">
          <option value="add"${r.kind === 'add' ? ' selected' : ''}>增项</option>
          <option value="remove"${r.kind === 'remove' ? ' selected' : ''}>减项</option></select></td>
        <td><input data-c="name" value="${esc(r.name)}" placeholder="变更项目"></td>
        <td><input data-c="unit" value="${esc(r.unit)}"></td>
        <td class="num"><input data-c="qty" inputmode="decimal" value="${esc(r.qty)}"></td>
        <td class="num"><input data-c="price" inputmode="decimal" value="${esc(r.price)}"></td>
        <td class="amt" data-camt>${money((Number(r.qty) || 0) * (Number(r.price) || 0))}</td>
        <td><input data-c="note" value="${esc(r.note || '')}" placeholder="变更原因"></td>
        <td class="ops"><button data-cop="del">×</button></td>
      </tr>`).join('')
      : '<tr><td colspan="8" class="empty-row">暂无增减项</td></tr>';
    const c = QE.calc();
    $('#chgSummary').textContent =
      `增 ${money(c.changeAdd)} · 减 ${money(c.changeRemove)} · 净 ${c.changeNet >= 0 ? '+' : '−'}${money(Math.abs(c.changeNet))}`;
  }
  $('#chgBody').addEventListener('input', e => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const f = e.target.dataset.c; if (!f) return;
    const v = (f === 'qty' || f === 'price') ? (Number(e.target.value) || 0) : e.target.value;
    const r = QE.ops.updateChange(tr.dataset.id, { [f]: v });
    if (r) {
      const cell = tr.querySelector('[data-camt]');
      if (cell) cell.textContent = money((Number(r.qty) || 0) * (Number(r.price) || 0));
    }
    renderChanges();
  });
  $('#chgBody').addEventListener('click', e => {
    const b = e.target.closest('button[data-cop]'); if (!b) return;
    QE.ops.removeChange(b.closest('tr').dataset.id);
  });
  $('#chgAdd').onclick = () => { QE.ops.addChange('add', { name: '' }); renderChanges(); };
  $('#chgAddR').onclick = () => { QE.ops.addChange('remove', { name: '' }); renderChanges(); };

  // ══ 档案 ══
  function openProjects() {
    const list = QE.store.listProjects();
    $('#projList').innerHTML = list.length ? list.map(p => `
      <div class="proj-item${p.id === QE.data.id ? ' cur' : ''}" data-id="${p.id}">
        <div><div class="p1">${esc(p.name)}</div>
          <div class="p2">${esc(p.id)} · ${esc(String(p.updatedAt).slice(0, 16).replace('T', ' '))}</div></div>
        <div style="text-align:right">
          <div class="p1" style="font-family:var(--mono)">¥ ${money(p.total)}</div>
          <button class="btn sm danger" data-del="${p.id}">删除</button></div>
      </div>`).join('')
      : '<div class="empty-row" style="padding:30px">还没有保存的工程</div>';
    $('#dlgProjects').showModal();
  }
  $('#projList').addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if (del) {
      if (!confirm('删除该工程档案？不可撤销。')) return;
      QE.store.deleteProject(del.dataset.del); openProjects(); return;
    }
    const item = e.target.closest('.proj-item');
    if (item) { QE.store.loadProject(item.dataset.id); closeDlg('dlgProjects'); view = 'summary'; renderAll(); toast('已载入工程'); }
  });
  $('#projNew').onclick = () => {
    if (QE.state.dirty && !confirm('当前工程有未保存修改，确认新建？')) return;
    QE.store.newProject(); closeDlg('dlgProjects'); view = 'summary'; renderAll(); toast('已新建工程');
  };

  // ══ 导出 ══
  function download(filename, text, mime) {
    const blob = new Blob(['﻿' + text], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  function safeName() {
    return (QE.projectInfo.name || '未命名工程').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  }
  $('#dlgExport').addEventListener('click', e => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    const x = b.dataset.x;
    if (x === 'json') { download(safeName() + '.json', QE.toJSON(), 'application/json'); toast('已导出工程 JSON'); }
    else if (x === 'csv') { download(safeName() + '-报价明细.csv', QE.toCSV(), 'text/csv;charset=utf-8'); toast('已导出 CSV'); }
    else if (x === 'print') { closeDlg('dlgExport'); setTimeout(() => window.print(), 120); }
    else if (x === 'import') {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        try { QE.fromJSON(await f.text()); closeDlg('dlgExport'); view = 'summary'; renderAll(); toast('导入成功'); }
        catch (err) { alert('导入失败：' + err.message); }
      };
      inp.click();
    }
  });

  // ══ 顶栏按钮 ══
  $('#btnInfo').onclick = openInfo;
  $('#btnFees').onclick = openFees;
  $('#btnQuota').onclick = () => openQuota('summary');
  $('#btnChanges').onclick = openChanges;
  $('#btnProjects').onclick = openProjects;
  $('#btnExport').onclick = () => $('#dlgExport').showModal();
  $('#btnSave').onclick = () => { QE.store.saveProject(); renderAll(); toast('✓ 已保存到本机档案'); };

  function closeDlg(id) { const d = document.getElementById(id); if (d.open) d.close(); }

  // ══ 13 模块桥（接真实数据流） ══
  const MODULES = [
    { k: 'print', label: '🖨️ 22纸型打印', accent: true, run() {
        window.open('../_modules/02-print-preview/print-preview.html?data=' + btoa(unescape(encodeURIComponent(QE.toJSON(false)))));
      } },
    { k: 'quota-ref', label: '🔄 REF 定额导入', run() {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,.bjproj';
        inp.onchange = async () => { const f = inp.files[0]; if (!f) return;
          try { QE.fromJSON(await f.text()); view = 'summary'; renderAll(); toast('REF 报价已导入'); }
          catch (err) { alert('导入失败：' + err.message); } };
        inp.click();
      } },
    { k: 'assistant', label: '🤖 智能助手 (Excel)', run() {
        window.open('../_modules/07-assistant/assistant.html?target=' + encodeURIComponent(location.href));
      } },
    { k: 'spatial', label: '📐 空间算量', run() {
        window.open('../_modules/05-spatial/spatial.html', '_blank', 'width=1200,height=820');
      } },
    { k: 'material-calc', label: '💰 费率汇总', run() {
        window.open('../_modules/06-material-calc/src/fee-summary.html', '_blank', 'width=820,height=640');
      } },
    { k: 'share', label: '🅱️ 分享业主', accent: true, run() {
        window.open('../_modules/10-share-link/share-create.html', '_blank', 'width=900,height=760');
      } },
    { k: 'collab', label: '🤝 三方协作', run() {
        window.open('../_modules/11-collab/collab-view.html', '_blank', 'width=1200,height=800');
      } },
    { k: 'ai', label: '🧠 AI 户型', run() {
        window.open('../_modules/12-ai-floorplan/ai-floorplan.html', '_blank', 'width=1100,height=820');
      } },
    { k: 'cert', label: '📜 数字存证', run() {
        window.open('../_modules/13-blockchain-cert/cert-view.html', '_blank', 'width=1000,height=820');
      } },
    { k: 'calendar', label: '📅 万年历', run() {
        window.open('../_modules/08-calendar/calendar-ui.html', '_blank', 'width=900,height=720');
      } },
    { k: 'themes', label: '🎨 主题 (36)', run() {
        window.open('../_modules/09-themes/src/themes-matrix-snap.html', '_blank', 'width=1100,height=800');
      } },
    { k: 'clone', label: '📦 克隆配置 ZIP', run() {
        if (window.YSClone) {
          try {
            const settings = Object.assign({ companyName: QE.company.companyName, companyPhone: QE.company.companyPhone },
              QE.fees, { themeColor: localStorage.getItem('ys_cloud_light_skin_v1') || 'red' });
            const library = { fileType: 'YUNSHANG_QUOTA_LIBRARY', version: 1, categories: QE.state.quota.categories, libraries: [], materialTables: [] };
            const bytes = window.YSClone.exportBytes(settings, library, null, {}, []);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
            a.download = (QE.company.companyName || '报价系统') + '_克隆配置_' + Date.now() + '.zip';
            a.click(); toast('✓ 克隆 ZIP 已导出（含费率+定额库）');
          } catch (err) { alert('导出失败：' + err.message + '\n（需要先加载 03-clone-zip 模块）'); }
        } else alert('克隆模块未加载');
      } },
    { k: 'pwa', label: '📴 离线安装', run() {
        if (window.__pwa) { const st = await0(window.__pwa.ready); toast(st ? 'PWA 已激活 · 可离线使用' : 'PWA 未注册（需 HTTPS 或 localhost）'); }
        else alert('PWA 模块未加载');
      } }
  ];
  function await0(p) { return p && typeof p.then === 'function' ? p : Promise.resolve(p); }

  function renderModuleBar() {
    const bar = $('#moduleBar');
    bar.innerHTML = MODULES.map((m, i) =>
      `<button data-m="${i}" class="${m.accent ? 'accent' : ''}">${m.label}</button>`).join('');
    bar.onclick = e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      try { MODULES[Number(b.dataset.m)].run(); }
      catch (err) { alert('模块打开失败：' + err.message); }
    };
  }

  // 供 QE_BRIDGE.focus() 调用
  window.__engineGo = function (categoryId) { go(categoryId); toast('已定位到 ' + (QE.catDef(categoryId) || {}).cn); };

  // ══ 启动 ══
  async function boot() {
    renderModuleBar();
    // 恢复上次工程
    try {
      const last = localStorage.getItem('yunshu_current_project_v1');
      if (last) QE.store.loadProject(last);
    } catch (e) { console.warn('[UI] 恢复工程失败', e); }
    // 加载定额库
    try {
      const q = await QE.quota.load('./quota-seed.json');
      quotaLoaded = true;
      $('#quotaStat').textContent = `定额库 ${q.categories.length} 类 / ${q.counts.items} 条`;
    } catch (e) {
      $('#quotaStat').textContent = '定额库加载失败';
      console.error('[UI] quota load fail', e);
    }
    QE.on(() => renderAll());
    renderAll();
    window.ENGINE_READY = true;
    if (window.YSBridge) window.YSBridge.install();
  }
  boot();
})();