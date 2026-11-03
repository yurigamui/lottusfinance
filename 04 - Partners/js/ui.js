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
    const st = PG[key] || (PG[key] = { size: 25, page: 0, sig: '' });
    const sig = o.sig == null ? String(list.length) : String(o.sig);
    if (st.sig !== sig) { st.sig = sig; st.page = 0; }
    const pages = Math.max(1, Math.ceil(list.length / st.size));
    if (st.page >= pages) st.page = pages - 1;
    const from = st.page * st.size, rows = list.slice(from, from + st.size);
    const unit = o.unit || 'itens';
    const sum = o.sum != null ? ` <span class="muted">·</span> <b>${B.brl(o.sum)}</b>` : '';
    const bar = list.length ? `<div class="pager"><div class="pager-total">Total: <b>${list.length}</b> ${esc(unit)}${sum}</div>
      <div class="pager-ctl"><label class="small muted">Por página <select class="input pager-size" data-pg-size aria-label="Itens por página">${[10, 25, 50, 100].map((n) => `<option value="${n}" ${n === st.size ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <span class="small muted">${from + 1}–${from + rows.length} de ${list.length}</span>
        <button class="btn ghost sm" data-pg-prev ${st.page === 0 ? 'disabled' : ''} aria-label="Página anterior">‹</button>
        <button class="btn ghost sm" data-pg-next ${st.page >= pages - 1 ? 'disabled' : ''} aria-label="Próxima página">›</button></div></div>` : '';
    return { rows, bar, from };
  }
  function pagerBind(root, key, again) {
    const st = PG[key]; if (!st) return;
    const sz = root.querySelector('[data-pg-size]'); if (sz) sz.onchange = () => { st.size = Number(sz.value); st.page = 0; again(); };
    const pv = root.querySelector('[data-pg-prev]'); if (pv) pv.onclick = () => { st.page = Math.max(0, st.page - 1); again(); };
    const nx = root.querySelector('[data-pg-next]'); if (nx) nx.onclick = () => { st.page += 1; again(); };
  }
  B.FEE_TYPES = [['pix', 'Pix'], ['ted', 'TED'], ['boleto', 'Boleto'], ['doc', 'DOC'], ['outro', 'Outro']];
  B.ui = { head, tabs, onTabs, empty, can, mergeAll, skipEmpty, pager, pagerBind };
})();
