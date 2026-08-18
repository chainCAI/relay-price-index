/* 中转站模型比价 — 前端逻辑（无依赖，file:// 可直接打开） */
(function () {
  'use strict';

  var DATA = window.PRICE_DATA || { records: [], fetched_at: '', sites: [], topup_notes: [] };
  var RECORDS = DATA.records || [];

  var FAMILY_ORDER = [
    'gemini-3.7-flash',
    'deepseek-v4-flash',
    'grok-4.6',
    'gpt-luna',
    'gpt-sol',
    'gpt-terra',
  ];
  var FAMILY_LABEL = {
    'gemini-3.7-flash': 'Gemini 3.7 Flash',
    'deepseek-v4-flash': 'DeepSeek V4 Flash',
    'grok-4.6': 'Grok 4.6',
    'gpt-luna': 'GPT Luna',
    'gpt-sol': 'GPT Sol',
    'gpt-terra': 'GPT Terra',
  };

  var state = { family: 'all', query: '', sort: 'asc', allFull: false };

  var els = {
    familyFilter: document.getElementById('family-filter'),
    cheapestStrip: document.getElementById('cheapest-strip'),
    grid: document.getElementById('price-grid'),
    empty: document.getElementById('empty-state'),
    count: document.getElementById('result-count'),
    note: document.getElementById('result-note'),
    search: document.getElementById('search-input'),
    sort: document.getElementById('sort-filter'),
    sortValue: document.getElementById('sort-filter-value'),
    clear: document.getElementById('clear-filters'),
    headerUpdated: document.getElementById('header-updated'),
    statSites: document.getElementById('stat-sites'),
    statRecords: document.getElementById('stat-records'),
    statFamilies: document.getElementById('stat-families'),
    toggleAll: document.getElementById('toggle-all'),
  };

  function fmt(n) {
    if (n === null || n === undefined) return '-';
    var v = Number(n);
    if (Number.isNaN(v)) return '-';
    return String(Math.round(v * 100000) / 100000).replace(/\.?0+$/, '');
  }

  function fmtRmb(n) {
    if (n === null || n === undefined) return '-';
    return '≈¥' + (Number(n) * 7.2).toFixed(2);
  }

  function sortKey(r) {
    // 按量优先于按次；同类型内按价格
    var kind = r.kind === 'call' ? 1 : 0;
    var price = r.kind === 'call'
      ? (r.per_call_usd != null ? r.per_call_usd : Infinity)
      : (r.input_usd_per_1m != null ? r.input_usd_per_1m : Infinity);
    return kind * 1e15 + price;
  }

  function siteShort(name) {
    var m = String(name).match(/^([^(（]+)[(（]/);
    return m ? m[1].trim() : String(name);
  }

  function familyCounts() {
    var base = RECORDS.filter(function (r) { return r.canonical; });
    var counts = { all: base.length };
    FAMILY_ORDER.forEach(function (f) { counts[f] = 0; });
    base.forEach(function (r) {
      if (counts[r.family] !== undefined) counts[r.family] += 1;
    });
    return counts;
  }

  function renderChips(counts) {
    var html = '';
    var allCount = counts.all;
    html += chipHtml('all', '全部', allCount);
    FAMILY_ORDER.forEach(function (f) {
      html += chipHtml(f, FAMILY_LABEL[f], counts[f] || 0);
    });
    els.familyFilter.innerHTML = html;
    els.familyFilter.querySelectorAll('[data-family]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.family = btn.getAttribute('data-family');
        renderChips(counts);
        render();
      });
    });
  }

  function chipHtml(id, label, count) {
    var active = state.family === id ? ' is-active' : '';
    return (
      '<button class="chip' + active + '" type="button" data-family="' + id + '">' +
      label + ' <span class="chip__count">' + count + '</span></button>'
    );
  }

  function cheapestFor(family, pool) {
    var list = pool.filter(function (r) { return r.family === family; });
    if (!list.length) return null;
    return list.reduce(function (a, b) { return sortKey(b) < sortKey(a) ? b : a; });
  }

  function renderStrip(pool) {
    var html = '';
    FAMILY_ORDER.forEach(function (f) {
      var best = cheapestFor(f, pool);
      if (!best) return;
      var price =
        best.kind === 'call'
          ? '$' + fmt(best.per_call_usd) + ' / 次'
          : '$' + fmt(best.input_usd_per_1m) + ' / $' + fmt(best.output_usd_per_1m);
      html +=
        '<div class="cheapest-item" title="' + escapeHtml(best.site) + '">' +
        '<span class="cheapest-item__model">' + FAMILY_LABEL[f] + '</span>' +
        '<span class="cheapest-item__row">' +
        '<span class="cheapest-item__site">' + escapeHtml(siteShort(best.site)) + '</span>' +
        '<span class="cheapest-item__price">' + price + '</span>' +
        '</span></div>';
    });
    els.cheapestStrip.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function rowHtml(r, isCheapest) {
    var badge = isCheapest ? '<span class="mini-badge" title="该模型类型下所有站点中的最低价">本模型最便宜</span>' : '';
    var variant = r.canonical ? '' : '<span class="variant-tag">· ' + FAMILY_LABEL[r.family] + ' 变体</span>';
    var ratio =
      (r.model_ratio != null && r.model_ratio ? fmt(r.model_ratio) + '×' : '-') +
      ' × ' +
      (r.group_ratio != null && r.group_ratio ? fmt(r.group_ratio) + '×' : '-');
    var cells;
    if (r.kind === 'call') {
      cells =
        '<td class="col-price">—</td>' +
        '<td class="col-price">—</td>' +
        '<td class="col-call">$' + fmt(r.per_call_usd) + ' / 次</td>' +
        '<td class="col-rmb">—</td>';
    } else {
      cells =
        '<td class="col-price">$' + fmt(r.input_usd_per_1m) + '</td>' +
        '<td class="col-price"><span class="out">$' + fmt(r.output_usd_per_1m) + '</span></td>' +
        '<td class="col-call">—</td>' +
        '<td class="col-rmb">' + fmtRmb(r.input_usd_per_1m) + '</td>';
    }
    return (
      '<tr class="' + (isCheapest ? 'is-cheapest' : '') + (r.kind === 'call' ? ' is-call' : '') + '">' +
      '<td class="col-site"><button class="site-link" type="button" data-site="' +
      escapeHtml(r.site) + '" title="点击跳转到站点">' + escapeHtml(siteShort(r.site)) +
      '</button>' + badge + '</td>' +
      '<td class="col-model">' + escapeHtml(r.model) + ' ' + variant + '</td>' +
      '<td class="col-group" title="' + escapeHtml(r.group) + '">' + escapeHtml(r.group) + '</td>' +
      '<td class="col-ratio">' + ratio + '</td>' +
      cells +
      '</tr>'
    );
  }

  // 每模型最低价：优先同名官方型号（token），否则取该家族最低 token 价
  function cheapestPerFamily(list) {
    var byFamily = {};
    list.forEach(function (r) {
      if (!(r.family in byFamily)) byFamily[r.family] = [];
      byFamily[r.family].push(r);
    });
    var result = [];
    Object.keys(byFamily).forEach(function (fam) {
      var es = byFamily[fam];
      var token = es.filter(function (e) { return e.kind === 'token'; });
      var pool = token.filter(function (e) { return e.canonical; });
      if (!pool.length) pool = token;
      if (!pool.length) pool = es;
      result.push(pool.reduce(function (a, b) { return sortKey(b) < sortKey(a) ? b : a; }));
    });
    return result;
  }

  function visibleRecords() {
    // 变体一律不进入表格；只显示标准型号（同名型号）
    var list = RECORDS.filter(function (r) { return r.canonical; });
    if (state.family !== 'all') list = list.filter(function (r) { return r.family === state.family; });

    if (state.family === 'all') {
      if (!state.allFull) return cheapestPerFamily(list); // 概览：每模型最低价
      return list;
    }
    return list;
  }

  function canonicalCount() {
    return RECORDS.filter(function (r) { return r.canonical; }).length;
  }

  function updateToggles() {
    var inAllOverview = state.family === 'all' && !state.allFull;
    els.toggleAll.hidden = state.family !== 'all';
    if (state.family === 'all') {
      els.toggleAll.textContent = state.allFull
        ? '只看各模型最低价'
        : '查看全部 ' + canonicalCount() + ' 条';
    }
  }

  function render() {
    var q = state.query.trim().toLowerCase();
    var pool = visibleRecords().filter(function (r) {
      if (!q) return true;
      return (
        String(r.site).toLowerCase().indexOf(q) >= 0 ||
        String(r.model).toLowerCase().indexOf(q) >= 0 ||
        String(r.group || '').toLowerCase().indexOf(q) >= 0
      );
    });

    renderStrip(pool);

    var sorted = pool.slice().sort(function (a, b) {
      if (state.sort === 'site') return a.site.localeCompare(b.site, 'zh-CN');
      var d = sortKey(a) - sortKey(b);
      return state.sort === 'desc' ? -d : d;
    });

    els.count.textContent = String(sorted.length);
    var modeNote = state.family === 'all'
      ? (state.allFull ? '全部记录' : '各模型最低价')
      : FAMILY_LABEL[state.family];
    els.note.textContent =
      modeNote + ' · ' +
      (state.sort === 'asc' ? '价格从低到高' : state.sort === 'desc' ? '价格从高到低' : '站点名排序');

    var cheapestSet = {};
    sorted.forEach(function (r) {
      var k = r.family;
      if (!(k in cheapestSet)) cheapestSet[k] = sortKey(r);
    });

    if (!sorted.length) {
      els.grid.innerHTML = '';
      els.empty.hidden = false;
      updateToggles();
      return;
    }
    els.empty.hidden = true;
    var thead =
      '<thead><tr>' +
      '<th>站点</th><th>型号</th><th>分组</th><th>倍率(模型×分组)</th>' +
      '<th>输入 $/1M</th><th>输出 $/1M</th><th>按次</th><th>约人民币(输入)</th>' +
      '</tr></thead>';
    els.grid.innerHTML =
      '<div class="table-wrap"><table class="price-table">' +
      thead +
      '<tbody>' +
      sorted.map(function (r) {
        return rowHtml(r, sortKey(r) === cheapestSet[r.family]);
      }).join('') +
      '</tbody></table></div>';
    updateToggles();
  }

  function init() {
    els.headerUpdated.textContent = DATA.fetched_at || '—';
    els.statSites.textContent = String(DATA.sites.length);
    els.statRecords.textContent = String(RECORDS.length);
    els.statFamilies.textContent = String(FAMILY_ORDER.length);

    renderChips(familyCounts());

    els.search.addEventListener('input', function () {
      state.query = els.search.value;
      render();
    });
    els.sort.addEventListener('change', function () {
      state.sort = els.sort.value;
      els.sortValue.textContent = els.sort.options[els.sort.selectedIndex].text;
      render();
    });
    els.clear.addEventListener('click', function () {
      state.query = '';
      state.family = 'all';
      els.search.value = '';
      renderChips(familyCounts());
      render();
    });

    els.toggleAll.addEventListener('click', function () {
      state.allFull = !state.allFull;
      render();
    });

    // 回到顶部
    var topBtn = document.getElementById('back-to-top');
    window.addEventListener('scroll', function () {
      topBtn.hidden = window.scrollY < 400;
    }, { passive: true });
    topBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 点击站点名 → 确认跳转弹窗
    var jumpModal = document.getElementById('jump-modal');
    var jumpSite = document.getElementById('jump-modal-site');
    var jumpUrl = document.getElementById('jump-modal-url');
    var pendingUrl = null;
    els.grid.addEventListener('click', function (event) {
      var btn = event.target.closest('.site-link');
      if (!btn) return;
      var siteName = btn.getAttribute('data-site');
      var url = (DATA.site_urls || {})[siteName] || '';
      if (!url) return;
      pendingUrl = url;
      jumpSite.textContent = btn.textContent;
      jumpUrl.textContent = url;
      jumpModal.hidden = false;
    });
    document.getElementById('jump-cancel').addEventListener('click', function () {
      jumpModal.hidden = true;
    });
    document.getElementById('jump-confirm').addEventListener('click', function () {
      if (pendingUrl) window.open(pendingUrl, '_blank', 'noopener');
      jumpModal.hidden = true;
    });
    jumpModal.addEventListener('click', function (event) {
      if (event.target === jumpModal) jumpModal.hidden = true;
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !jumpModal.hidden) jumpModal.hidden = true;
    });

    render();
  }

  init();
})();
