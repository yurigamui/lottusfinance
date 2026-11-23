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

  /* ------------------------------------------------ base visual page/list */
  let uid = 0;
  const nextId = (p) => `${p}-${++uid}`;

  /** Cabeçalho: título, subtítulo, no máximo 1 ação principal e o menu "Mais ações".
   *  Ações destrutivas (danger) só aqui; quem trata o clique deve pedir confirmação. */
  function pageHead({ title, sub, primary, more } = {}) {
    const items = (more || []).filter((m) => m && m.id && m.label);
    const menuId = nextId('ph-menu');
    const menu = items.length
      ? `<div class="ph-menu">
          <button type="button" class="btn ghost ph-more" aria-haspopup="menu" aria-expanded="false" aria-controls="${menuId}">Mais ações</button>
          <ul class="ph-list" id="${menuId}" role="menu" hidden>${items
            .map((m) => `<li role="none"><button type="button" role="menuitem" class="ph-item${m.danger ? ' danger' : ''}" data-act="${esc(m.id)}">${esc(m.label)}</button></li>`)
            .join('')}</ul>
        </div>`
      : '';
    const main = primary && primary.id ? `<button type="button" class="btn ph-primary" data-act="${esc(primary.id)}">${esc(primary.label)}</button>` : '';
    return `<div class="page-head ph"><div class="ph-text"><h1>${esc(title)}</h1>${sub ? `<div class="page-sub">${esc(sub)}</div>` : ''}</div>${main || menu ? `<div class="ph-actions">${main}${menu}</div>` : ''}</div>`;
  }
  function onPage(el, handlers) {
    handlers = handlers || {};
    const btn = el.querySelector('.ph-more');
    const list = el.querySelector('.ph-list');
    const items = () => [...(list ? list.querySelectorAll('.ph-item') : [])];
    const isOpen = () => !!list && !list.hidden;
    const close = (focus) => {
      if (!list || list.hidden) return;
      list.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (focus) btn.focus();
    };
    const open = (focusIdx) => {
      list.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      if (focusIdx != null) { const it = items(); (it[focusIdx < 0 ? it.length - 1 : focusIdx] || it[0]).focus(); }
    };
    el.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', () => {
        close(false);
        const fn = handlers[b.dataset.act];
        if (fn) fn(b);
      });
    });
    if (!btn) return;
    btn.addEventListener('click', () => (isOpen() ? close(false) : open(null)));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); open(0); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); open(-1); }
      else if (e.key === 'Escape') close(true);
    });
    list.addEventListener('keydown', (e) => {
      const it = items(), i = it.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); it[(i + 1) % it.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); it[(i - 1 + it.length) % it.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); it[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); it[it.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === 'Tab') close(false);
    });
    const outside = (e) => {
      if (!el.isConnected) { document.removeEventListener('click', outside, true); return; }
      if (isOpen() && !btn.contains(e.target) && !list.contains(e.target)) close(false);
    };
    document.addEventListener('click', outside, true);
  }

  /** Lista com busca, paginação no cliente, tabela (≥641 px) e cartões (≤640 px) no mesmo markup.
   *  columns: [{key, label, num?, render?(row) → HTML já escapado, card?:false, searchText?(row), text?:true}]; a busca usa searchText(row), ou o texto exibido se text:true, ou o valor bruto; o texto padrão é escapado aqui. */
  const registry = new Map();
  const norm = (v) => String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function list(opts) {
    const o = Object.assign({ columns: [], rows: [], pageSize: 25, q: '', cardTitle: null, emptyText: 'Nada nesta fila.', searchLabel: 'Buscar' }, opts || {});
    for (const [k, v] of registry) if (!document.getElementById(k) && v.built < Date.now() - 5000) registry.delete(k);
    const id = nextId('lt');
    const st = { o, page: 0, q: String(o.q || ''), timer: null, built: Date.now() };
    st.titleKey = o.cardTitle || (o.columns[0] && o.columns[0].key);
    registry.set(id, st);
    const search = o.rows.length
      ? `<div class="field lt-search"><label for="${id}-q">${esc(o.searchLabel)}</label><input id="${id}-q" class="input" type="search" autocomplete="off" value="${esc(st.q)}" /></div>`
      : '';
    return `<div class="lt" id="${id}" data-list="${id}">${search}<div class="lt-body" data-list-body>${body(st)}</div></div>`;
  }
  // Texto que a pessoa vê numa célula (sem as marcas do HTML), para a busca achar 1.234,56 e dd/mm/aaaa
  const plain = (html) => new DOMParser().parseFromString(String(html == null ? '' : html), 'text/html').body.textContent || '';
  /** Texto pesquisável da coluna: searchText(row) → texto exibido (text:true) → valor bruto (padrão antigo). */
  function searchValue(c, r) {
    if (typeof c.searchText === 'function') return c.searchText(r);
    if (c.text && c.render) return plain(c.render(r));
    return r[c.key];
  }
  function filtered(st) {
    const q = norm(st.q.trim());
    if (!q) return st.o.rows;
    if (!st.hay) st.hay = new Map();
    return st.o.rows.filter((r) => {
      let h = st.hay.get(r);
      if (h === undefined) { h = st.o.columns.map((c) => norm(searchValue(c, r))).join('\u0001'); st.hay.set(r, h); }
      return h.includes(q);
    });
  }
  function body(st) {
    const { o } = st;
    if (!o.rows.length) return `<div class="empty lt-empty">${esc(o.emptyText)}</div>`;
    const rows = filtered(st);
    if (!rows.length) {
      return `<div class="empty lt-empty" role="status"><p>${esc(`Nada encontrado para "${st.q.trim()}".`)}</p><button type="button" class="btn secondary lt-btn" data-lt-clear>Limpar busca</button></div>`;
    }
    const size = Math.max(1, o.pageSize);
    const pages = Math.ceil(rows.length / size);
    st.page = Math.min(Math.max(0, st.page), pages - 1);
    const from = st.page * size;
    const slice = rows.slice(from, from + size);
    const cell = (c, r) => (c.render ? c.render(r) : esc(r[c.key]));
    const th = o.columns.map((c) => `<th scope="col"${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('');
    const tr = slice
      .map((r) => `<tr>${o.columns
        .map((c) => `<td data-label="${esc(c.label)}" class="${[c.num ? 'num' : '', c.key === st.titleKey ? 'lt-title' : '', c.card === false ? 'lt-nocard' : ''].filter(Boolean).join(' ')}">${cell(c, r)}</td>`)
        .join('')}</tr>`)
      .join('');
    const pager = pages > 1
      ? `<div class="lt-pager"><button type="button" class="btn secondary lt-btn" data-lt-prev${st.page === 0 ? ' disabled' : ''}>Anterior</button><button type="button" class="btn secondary lt-btn" data-lt-next${st.page >= pages - 1 ? ' disabled' : ''}>Próxima</button></div>`
      : '';
    return `<p class="lt-count small muted" role="status">Mostrando ${from + 1} a ${from + slice.length} de ${rows.length}</p>
      <div class="table-wrap lt-wrap"><table class="lt-table"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>${pager}`;
  }
  function onList(el) {
    el.querySelectorAll('[data-list]').forEach((root) => {
      const st = registry.get(root.dataset.list);
      if (!st || root.dataset.bound) return;
      root.dataset.bound = '1';
      const box = root.querySelector('[data-list-body]');
      const input = root.querySelector('input[type=search]');
      const paint = () => { box.innerHTML = body(st); };
      if (input) {
        input.addEventListener('input', () => {
          clearTimeout(st.timer);
          st.timer = setTimeout(() => { st.q = input.value; st.page = 0; paint(); }, 250);
        });
        input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { input.value = ''; st.q = ''; st.page = 0; clearTimeout(st.timer); paint(); } });
      }
      root.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || !root.contains(b)) return;
        if (b.hasAttribute('data-lt-clear')) { st.q = ''; st.page = 0; if (input) { input.value = ''; input.focus(); } paint(); return; }
        const dir = b.hasAttribute('data-lt-next') ? 1 : b.hasAttribute('data-lt-prev') ? -1 : 0;
        if (!dir) return;
        st.page += dir;
        paint();
        const first = root.querySelector('.lt-count');
        if (first) { first.setAttribute('tabindex', '-1'); first.focus({ preventScroll: false }); }
      });
    });
  }

  /** "Ver mais": o que não decide a ação fica recolhido. html é confiável (já escapado por quem chama). */
  const more = (summary, html) => `<details class="more"><summary>${esc(summary)}</summary><div class="more-body">${html}</div></details>`;
  function skeleton(rows = 5) {
    const r = Number(rows);
    const n = Number.isFinite(r) ? Math.max(1, Math.min(20, Math.floor(r))) : 5; // 0 ou negativo → 1
    return `<div class="skel" role="status"><span class="ui-sr">Carregando…</span>${'<div class="skel-row" aria-hidden="true"><span></span><span></span></div>'.repeat(n)}</div>`;
  }

  B.ui = { head, tabs, onTabs, empty, can, mergeAll, skipEmpty, pageHead, onPage, list, onList, more, skeleton };
})();
