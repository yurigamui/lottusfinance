/* Lottus — peças de tela compartilhadas (títulos, abas, vazio, níveis) */
(function () {
  'use strict';
  const B = window.BO;
  const { esc } = B;
  B.views = B.views || {};
  const can = (me, level) => ({ analyst: 1, approver: 2, admin: 3 })[me.level] >= ({ analyst: 1, approver: 2, admin: 3 })[level];

  function head(title, sub, right) {
    return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<div class="page-sub">${esc(sub)}</div>` : ''}</div>${right || ''}</div>`;
  }
  function tabs(options, value) {
    return `<div class="tabs" role="tablist">${options
      .map(([v, l]) => `<button role="tab" data-tab="${esc(v)}" class="${v === value ? 'active' : ''}" aria-selected="${v === value}">${esc(l)}</button>`)
      .join('')}</div>`;
  }
  function onTabs(el, fn) {
    el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => fn(b.dataset.tab)));
  }
  const empty = (text) => `<div class="empty">${esc(text)}</div>`;
  /* "Todas": junta as filas de cada situação, da mais recente para a mais antiga */
  async function mergeAll(fetchOne, statuses) {
    const parts = await Promise.all(statuses.map(fetchOne));
    return parts.flat().sort((a, b) => (String(a.created_at || '') < String(b.created_at || '') ? 1 : -1));
  }
  /* Ao entrar numa seção sem nada em aberto, mostra direto a aba "Todas" */
  function skipEmpty(arg, list, base, allKey) {
    if (arg !== undefined || list.length) return false;
    history.replaceState(null, '', `#/${base}/${allKey}`);
    return true;
  }
  /* Paginação padrão: "Total", itens por página e próxima página. O estado fica por lista (chave) e volta à página 1 ao mudar o filtro. */
  const PG = {};
  function pager(key, list, o) {
    o = o || {};
    const st = PG[key] || (PG[key] = { size: 25, page: 0, sig: '', sort: null });
    st.cols = o.cols || null;
    const sig = o.sig == null ? String(list.length) : String(o.sig);
    if (st.sig !== sig) { st.sig = sig; st.page = 0; }
    if (st.cols && st.sort && st.cols[st.sort.i]) list = sortList(list, st.cols[st.sort.i], st.sort.dir);
    const pages = Math.max(1, Math.ceil(list.length / st.size));
    if (st.page >= pages) st.page = pages - 1;
    const from = st.page * st.size, rows = list.slice(from, from + st.size);
    const unit = o.unit || 'itens';
    const sum = o.sum != null ? ` <span class="muted">·</span> <b>${B.brl(o.sum)}</b>` : '';
    const bar = list.length ? `<div class="pager" data-pg-key="${esc(key)}"><div class="pager-total">Total: <b>${list.length}</b> ${esc(unit)}${sum}</div>
      <div class="pager-ctl"><label class="small muted">Por página <select class="input pager-size" data-pg-size aria-label="Itens por página">${[10, 25, 50, 100].map((n) => `<option value="${n}" ${n === st.size ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <span class="small muted">${from + 1}–${from + rows.length} de ${list.length}</span>
        <button class="btn ghost sm" data-pg-prev ${st.page === 0 ? 'disabled' : ''} aria-label="Página anterior">‹</button>
        <button class="btn ghost sm" data-pg-next ${st.page >= pages - 1 ? 'disabled' : ''} aria-label="Próxima página">›</button></div></div>` : '';
    return { rows, bar, from };
  }
  function pagerBind(root, key, again) {
    const st = PG[key]; if (!st) return;
    st.again = again;
    const sz = root.querySelector('[data-pg-size]'); if (sz) sz.onchange = () => { st.size = Number(sz.value); st.page = 0; again(); };
    const pv = root.querySelector('[data-pg-prev]'); if (pv) pv.onclick = () => { st.page = Math.max(0, st.page - 1); again(); };
    const nx = root.querySelector('[data-pg-next]'); if (nx) nx.onclick = () => { st.page += 1; again(); };
  }

  /* Ordenação por coluna: clique no título (crescente, decrescente, volta ao padrão). */
  const COLL = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
  function cmpVal(a, b) {
    const na = a == null || a === '', nb = b == null || b === '';
    if (na || nb) return na && nb ? 0 : na ? 1 : -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return COLL.compare(String(a), String(b));
  }
  function sortList(list, fn, dir) {
    const m = dir === 'desc' ? -1 : 1;
    return list.map((x, i) => [x, i, fn(x)]).sort((p, q) => {
      const a = p[2], b = q[2], na = a == null || a === '', nb = b == null || b === '';
      if (na || nb) return na && nb ? p[1] - q[1] : na ? 1 : -1; // vazios sempre no fim
      return cmpVal(a, b) * m || p[1] - q[1];
    }).map((p) => p[0]);
  }
  function cellVal(td) {
    const t = (td ? td.textContent : '').replace(/\s+/g, ' ').trim();
    if (!t || /^[—–-]$/.test(t)) return null;
    let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t); if (m) return Number(m[3] + m[2] + m[1]);
    m = /^([−-]?)\s*(R\$)?\s*([−-]?)\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d+))?\s*(%|deb\.)?$/.exec(t);
    if (m) { const n = Number(m[4].replace(/\./g, '') + (m[5] ? '.' + m[5] : '')); return (m[1] || m[3]) ? -n : n; }
    return t;
  }
  const pagerKeyOf = (table) => { const c = table.closest('.card'); const p = c && c.querySelector('[data-pg-key]'); return p ? p.dataset.pgKey : null; };
  function enhanceTables(root) {
    (root || document).querySelectorAll('table').forEach((tb) => {
      if (tb.classList.contains('nosort') || !tb.tHead || !tb.tBodies[0] || !tb.tBodies[0].rows.length) return;
      const key = pagerKeyOf(tb), st = key && PG[key];
      const ths = tb.tHead.rows[tb.tHead.rows.length - 1].cells;
      for (let i = 0; i < ths.length; i++) {
        const th = ths[i], ok = st ? !!(st.cols && st.cols[i]) : true;
        if (!th.textContent.trim() || !ok) { th.removeAttribute('data-s'); continue; }
        th.setAttribute('data-s', '1'); th.setAttribute('tabindex', '0'); th.setAttribute('role', 'columnheader');
        const cur = st ? st.sort : tb.__sort;
        th.setAttribute('aria-sort', cur && cur.i === i ? (cur.dir === 'asc' ? 'ascending' : 'descending') : 'none');
      }
    });
  }
  function toggle(cur, i) { return !cur || cur.i !== i ? { i, dir: 'asc' } : cur.dir === 'asc' ? { i, dir: 'desc' } : null; }
  function onSort(th) {
    const tb = th.closest('table'), row = th.parentElement, i = Array.prototype.indexOf.call(row.cells, th);
    const key = pagerKeyOf(tb), st = key && PG[key];
    if (st) { if (!st.cols || !st.cols[i] || !st.again) return; st.sort = toggle(st.sort, i); st.page = 0; st.again(); return; }
    const body = tb.tBodies[0], rows = Array.from(body.rows);
    if (rows.some((r) => Array.from(r.cells).some((c) => c.colSpan > 1))) return;
    tb.__sort = toggle(tb.__sort, i);
    const orig = tb.__orig || (tb.__orig = rows.slice()), s = tb.__sort;
    const out = s ? sortList(rows, (r) => cellVal(r.cells[i]), s.dir) : orig;
    out.forEach((r) => body.appendChild(r));
    enhanceTables(tb.parentElement);
  }
  document.addEventListener('click', (e) => {
    const th = e.target.closest && e.target.closest('th[data-s]');
    if (th && !e.target.closest('button, a, input, select, label')) onSort(th);
  });
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('th[data-s]')) { e.preventDefault(); onSort(e.target); } });
  let raf = 0;
  new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; enhanceTables(document); }); }).observe(document.documentElement, { childList: true, subtree: true });
  B.FEE_TYPES = [['pix', 'Pix'], ['ted', 'TED'], ['boleto', 'Boleto'], ['doc', 'DOC'], ['outro', 'Outro']];
  /* Painel de filtros reaproveitável (botão "Filtros" + campos). fields: [{k, label, type: 'text'|'select'|'range'|'number', options: [[valor, rótulo]], all, from, to, placeholder, presets}] */
  const filters = {
    count(fields, st) { return fields.filter((f) => (f.type === 'range' ? st[f.from || 'from'] || st[f.to || 'to'] : st[f.k])).length; },
    html(id, fields, st, right) {
      const n = filters.count(fields, st);
      return `<div class="row between" style="gap:8px;margin-bottom:12px;flex-wrap:wrap"><div class="small muted" data-fl-sum="${id}"></div><div class="u-g8 row">${right || ''}<button type="button" class="btn secondary sm" data-fl-btn="${id}" aria-expanded="${n ? 'true' : 'false'}">Filtros <span class="tag brand" data-fl-badge="${id}" ${n ? '' : 'hidden'}>${n || ''}</span></button></div></div>
        <div class="card" data-fl-panel="${id}" ${n ? '' : 'hidden'} style="margin-bottom:12px"><div class="fgrid">${fields.map((f) => `<div class="field"><label>${esc(f.label)}</label>${
          f.type === 'select' ? `<select class="input" name="${f.k}"><option value="">${esc(f.all || 'Todos')}</option>${(f.options || []).map(([v, l]) => `<option value="${esc(v)}" ${String(st[f.k] || '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
          : f.type === 'range' ? `<input class="input" data-fl-range="${f.k}" placeholder="Selecione o período">`
          : `<input class="input" name="${f.k}" type="${f.type === 'number' ? 'text' : 'search'}" placeholder="${esc(f.placeholder || 'Buscar')}" value="${esc(st[f.k] || '')}">`}</div>`).join('')}</div>
          <div class="row" style="justify-content:flex-end;margin-top:8px"><button type="button" class="linkbtn" data-fl-clear="${id}">Limpar filtros</button></div></div>`;
    },
    bind(root, id, fields, st, onChange) {
      const panel = root.querySelector(`[data-fl-panel="${id}"]`), btn = root.querySelector(`[data-fl-btn="${id}"]`), badge = root.querySelector(`[data-fl-badge="${id}"]`);
      const upd = () => { const n = filters.count(fields, st); badge.hidden = !n; badge.textContent = n; };
      let tmr = null; const pickers = [];
      fields.forEach((f) => {
        if (f.type === 'range') {
          const fk = f.from || 'from', tk = f.to || 'to';
          pickers.push(B.mask.rangePicker(panel.querySelector(`[data-fl-range="${f.k}"]`), { get: () => ({ from: st[fk] || '', to: st[tk] || '' }), emptyLabel: f.emptyLabel || '', presets: f.presets || B.mask.presetsStd({ future: f.future }), set: (a, b) => { st[fk] = a; st[tk] = b; upd(); onChange(); } }));
          return;
        }
        const inp = panel.querySelector(`[name="${f.k}"]`); if (!inp) return;
        const h = () => { st[f.k] = inp.value; upd(); clearTimeout(tmr); tmr = setTimeout(onChange, f.type === 'select' ? 0 : 200); };
        inp.addEventListener('input', h); inp.addEventListener('change', h);
      });
      root.querySelector(`[data-fl-clear="${id}"]`).onclick = () => {
        fields.forEach((f) => { if (f.type === 'range') { st[f.from || 'from'] = ''; st[f.to || 'to'] = ''; } else { st[f.k] = ''; const i = panel.querySelector(`[name="${f.k}"]`); if (i) i.value = ''; } });
        pickers.forEach((p) => p.refresh()); upd(); onChange();
      };
      btn.onclick = () => { panel.hidden = !panel.hidden; btn.setAttribute('aria-expanded', String(!panel.hidden)); };
      return { update: upd, active: () => filters.count(fields, st) };
    },
  };
  B.ui = { head, tabs, onTabs, empty, can, mergeAll, skipEmpty, pager, pagerBind, filters };
})();
