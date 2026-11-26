/* Lottus — peças de tela compartilhadas (títulos, abas, vazio, níveis)

   API de tabela/lista (B.ui.list, com o apelido B.ui.table; ligar com B.ui.onList / B.ui.onTable):
     const html = B.ui.table({
       columns: [{ key, label, num?, render?(row), card?, searchText?(row), text?, clip? }],
       rows: [...],            // objetos; a ordem é a que você passar
       pageSize: 25,           // paginação no cliente (padrão 25)
       search: true,           // false esconde a busca (padrão: aparece quando há linhas)
       searchLabel: 'Buscar',  // rótulo acessível do campo de busca
       q: '',                  // busca inicial
       cardTitle: 'name',      // coluna que vira o título do cartão no celular (padrão: a 1ª)
       rowHref: (row) => '#/clientes/sign/' + row.id,   // linha leva a um endereço (#/… ou https://…): o título vira link de verdade
       onRow: (row, ev) => { … },                       // OU ação ao clicar na linha (o título vira botão); rowHref vence onRow
       emptyText: 'Nada nesta fila.',
     });
     el.innerHTML = html; B.ui.onTable(el);   // depois de pôr o HTML na página
   Colunas
     key        nome do campo; label = cabeçalho e rótulo do cartão (data-label).
     render     devolve HTML JÁ ESCAPADO (use B.esc); sem render, o valor é escapado aqui.
     num        valor monetário/numérico: alinhado à direita, algarismos de largura fixa.
     card:false a coluna some no cartão do celular (continua na tabela).
     clip       texto cortado com reticências na tabela (≥641 px) e o texto inteiro no atributo title; no cartão quebra a linha.
     searchText texto usado na busca (padrão: valor bruto; text:true usa o texto exibido).
   Estados: vazio (emptyText), busca sem resultado (com "Limpar busca") e paginação com foco no contador.
   Texto do usuário: sempre quebra com overflow-wrap:anywhere. Celular (≤640 px): lista de cartões; ≥641 px: tabela.
   Para tabelas feitas à mão, use o utilitário CSS table.stack-m (veja o topo de styles.css).

   Abas (B.ui.tabs): role=tablist/tab, aria-selected, setas ←/→, Home e End (um só tratador no documento);
   em ≤768 px a barra rola na horizontal dentro dela, com esmaecido nas bordas e a aba ativa visível. */
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
      .map(([v, l]) => `<button type="button" role="tab" data-tab="${esc(v)}" class="${v === value ? 'active' : ''}" aria-selected="${v === value}" tabindex="${v === value ? 0 : -1}">${esc(l)}</button>`)
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
    // resposta atrasada de outra tela não pode reescrever o endereço de quem já navegou
    if (!(location.hash === `#/${base}` || location.hash === `#/${base}/`)) return false;
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
    const o = Object.assign({ columns: [], rows: [], pageSize: 25, q: '', cardTitle: null, emptyText: 'Nada nesta fila.', searchLabel: 'Buscar', search: true, rowHref: null, onRow: null }, opts || {});
    for (const [k, v] of registry) if (!document.getElementById(k) && v.built < Date.now() - 5000) registry.delete(k);
    const id = nextId('lt');
    const st = { o, page: 0, q: String(o.q || ''), timer: null, built: Date.now() };
    st.titleKey = o.cardTitle || (o.columns[0] && o.columns[0].key);
    registry.set(id, st);
    const search = o.rows.length && o.search !== false
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
    const clickable = !!(o.rowHref || o.onRow);
    if (clickable && !st.idx) st.idx = new Map(o.rows.map((r, i) => [r, i]));
    // título da linha: link (rowHref) ou botão (onRow), para o teclado e o leitor de tela
    const titled = (c, r, inner) => {
      if (!clickable || c.key !== st.titleKey) return inner;
      const h = o.rowHref ? o.rowHref(r) : null;
      if (o.rowHref) return h ? `<a class="lt-link" href="${esc(B.safeUrl(h))}">${inner}</a>` : inner;
      return `<button type="button" class="lt-link" data-lt-row>${inner}</button>`;
    };
    const tdOf = (c, r) => {
      const inner = cell(c, r);
      const cls = [c.num ? 'num' : '', c.key === st.titleKey ? 'lt-title' : '', c.card === false ? 'lt-nocard' : '', c.clip ? 'lt-clip' : ''].filter(Boolean).join(' ');
      const ttl = c.clip ? ` title="${esc(plain(inner).trim())}"` : '';
      return `<td data-label="${esc(c.label)}" class="${cls}"${ttl}>${titled(c, r, inner)}</td>`;
    };
    const th = o.columns.map((c) => `<th scope="col"${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('');
    const tr = slice
      .map((r) => `<tr${clickable ? ` class="lt-row-click" data-ri="${st.idx.get(r)}"` : ''}>${o.columns.map((c) => tdOf(c, r)).join('')}</tr>`)
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
        // clique em qualquer ponto da linha (menos em links, botões e campos) faz o mesmo que o título
        const tr = e.target.closest('tr[data-ri]');
        if (tr && root.contains(tr) && (st.o.rowHref || st.o.onRow)) {
          const inner = e.target.closest('a, input, select, textarea, label, summary, button:not([data-lt-row])');
          if (!inner || !tr.contains(inner)) {
            const r = st.o.rows[Number(tr.dataset.ri)];
            if (st.o.rowHref) {
              const h = r && st.o.rowHref(r);
              if (h && !e.target.closest('a')) { const u = B.safeUrl(h); if (/^#/.test(u)) location.hash = u; else window.open(u, '_blank', 'noopener'); }
            } else if (r) st.o.onRow(r, e);
            return;
          }
        }
        const b = e.target.closest('button');
        if (!b || !root.contains(b) || b.hasAttribute('data-lt-row')) return;
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

  /* ---------------------------------------------------- permissão, erro, campo */
  const homeHref = () => (B.me && B.me.partner ? '#/assinar' : '#/painel');
  /** Caixa "Sem permissão": diz qual tela, quem pode e leva ao Início. Não chama RPC. */
  function denied(el, me, what, who) {
    const lvl = (B.LEVEL && me && B.LEVEL[me.level]) || 'sem nível definido';
    el.innerHTML = `<div class="card denied" role="alert"><h1 tabindex="-1">Sem permissão</h1>
      <p>${esc(what)} é só para ${esc(who || 'administradores')}. Seu nível é ${esc(lvl)}. Se precisar desta tela, peça a um administrador.</p>
      <a class="btn" href="${homeHref()}">Voltar ao Início</a></div>`;
    const h = el.querySelector('h1'); if (h && el.isConnected) h.focus({ preventScroll: true });
  }
  /** Erro de tela: mensagem, "Tentar de novo" e "Ir ao Início" (nenhum beco sem saída). */
  const errorCard = (msg) => `<div class="card"><div class="error-box" role="alert">${esc(msg)}</div>
    <div class="err-actions"><button type="button" class="btn secondary" data-retry>Tentar de novo</button><a class="btn ghost" href="${homeHref()}">Ir ao Início</a></div></div>`;
  /** Mensagem de erro ao lado do campo (aria-invalid + aria-describedby). msg vazio limpa. */
  function fieldError(input, msg) {
    if (!input) return;
    const n = input.nextElementSibling;
    if (n && n.classList.contains('field-error')) n.remove();
    input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby');
    if (!msg) return;
    const id = nextId('fe');
    const d = document.createElement('div');
    d.className = 'field-error'; d.id = id; d.setAttribute('role', 'alert'); d.textContent = msg;
    input.insertAdjacentElement('afterend', d);
    input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', id);
  }
  const clearFieldErrors = (root) => root.querySelectorAll('.field-error').forEach((n) => { const i = n.previousElementSibling; if (i) { i.removeAttribute('aria-invalid'); i.removeAttribute('aria-describedby'); } n.remove(); });

  /* ------------------------------------------------------------ abas (teclado, rolagem) */
  const TAB_SEL = '.tabs, .settings-nav, [role=tablist]';
  const tabsOf = (list) => [...list.querySelectorAll('[role=tab]')].filter((t) => t.offsetParent !== null || t === document.activeElement);
  function tabFade(list) {
    const max = list.scrollWidth - list.clientWidth;
    list.classList.toggle('tabs-fade-l', max > 2 && list.scrollLeft > 2);
    list.classList.toggle('tabs-fade-r', max > 2 && list.scrollLeft < max - 2);
  }
  /** Garante papéis, tabindex e esmaecido nas barras de abas de root e deixa a aba ativa visível. */
  function tabsReady(root) {
    (root || document).querySelectorAll(TAB_SEL).forEach((list) => {
      if (!list.hasAttribute('role')) list.setAttribute('role', 'tablist');
      const items = [...list.querySelectorAll('button, a')];
      items.forEach((t) => { if (!t.hasAttribute('role')) t.setAttribute('role', 'tab'); });
      items.forEach((t) => {
        const on = t.classList.contains('active') || t.getAttribute('aria-current') === 'page';
        if (!t.hasAttribute('aria-selected')) t.setAttribute('aria-selected', String(on));
      });
      const sel = items.find((t) => t.getAttribute('aria-selected') === 'true') || items[0];
      items.forEach((t) => t.setAttribute('tabindex', t === sel ? '0' : '-1'));
      if (list.scrollWidth > list.clientWidth + 2 && sel && !list.dataset.tabsCentered) {
        list.dataset.tabsCentered = '1';
        list.scrollLeft = Math.max(0, sel.offsetLeft - (list.clientWidth - sel.offsetWidth) / 2);
      }
      tabFade(list);
    });
    restoreTabFocus();
  }
  /* M-1: ativar uma aba pelo teclado (Enter/Espaço) redesenha a barra; o foco volta à aba ativa nova da mesma barra */
  let tabKey = null;
  function restoreTabFocus() {
    if (!tabKey) return;
    if (Date.now() - tabKey.t > 4000) { tabKey = null; return; }
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) { if (a.closest && a.closest('[role=tablist]')) tabKey = null; return; }
    const list = document.querySelectorAll(TAB_SEL)[tabKey.i];
    const sel = list && list.querySelector('[role=tab][aria-selected=true]');
    if (!sel) return;
    tabKey = null;
    sel.focus({ preventScroll: true });
    sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  document.addEventListener('keydown', (e) => {
    const t = e.target && e.target.closest ? e.target.closest('[role=tab]') : null;
    if (!t) return;
    const list = t.closest('[role=tablist]');
    if (!list) return;
    if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && !e.repeat) {
      const i = [...document.querySelectorAll(TAB_SEL)].indexOf(list);
      if (i >= 0) tabKey = { i, t: Date.now() };
    }
    if ((e.key === ' ' || e.key === 'Spacebar') && t.tagName === 'A') { e.preventDefault(); t.click(); return; }
    const k = e.key;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(k)) return;
    const all = tabsOf(list);
    const i = all.indexOf(t);
    if (i < 0) return;
    const to = k === 'Home' ? all[0] : k === 'End' ? all[all.length - 1] : all[(i + (k === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
    e.preventDefault();
    all.forEach((x) => x.setAttribute('tabindex', x === to ? '0' : '-1'));
    to.focus();
    tabFade(list);
  });
  // rolagem dentro da barra atualiza o esmaecido (scroll não borbulha: captura)
  document.addEventListener('scroll', (e) => { const l = e.target; if (l && l.matches && l.matches(TAB_SEL)) tabFade(l); }, true);
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => document.querySelectorAll(TAB_SEL).forEach(tabFade), 120); });

  B.ui = { tabsReady, table: list, onTable: onList, denied, errorCard, fieldError, clearFieldErrors, homeHref, head, tabs, onTabs, empty, can, mergeAll, skipEmpty, pageHead, onPage, list, onList, more, skeleton };
})();
