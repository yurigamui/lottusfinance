/* Lottus Partners — lista de instituições financeiras (BrasilAPI) e campo de banco com busca por nome ou código */
(function () {
  'use strict';
  const B = window.BO;
  // Nomes de uso comum (têm prioridade sobre o nome da lista oficial) e lista de reserva se a API não responder
  const COMMON = [['001', 'Banco do Brasil'], ['033', 'Santander'], ['104', 'Caixa Econômica Federal'], ['208', 'BTG Pactual'], ['237', 'Bradesco'], ['341', 'Itaú Unibanco'], ['260', 'Nubank'], ['077', 'Inter'],
    ['336', 'C6 Bank'], ['290', 'PagBank'], ['380', 'PicPay'], ['756', 'Sicoob'], ['748', 'Sicredi'], ['422', 'Safra'], ['655', 'Votorantim'], ['197', 'Stone'], ['212', 'Banco Original'], ['070', 'BRB'],
    ['085', 'Ailos'], ['041', 'Banrisul'], ['004', 'Banco do Nordeste'], ['003', 'Banco da Amazônia'], ['121', 'Agibank'], ['323', 'Mercado Pago'], ['403', 'Cora'], ['332', 'Acesso Soluções de Pagamento'],
    ['301', 'BPP Instituição de Pagamento'], ['082', 'Topázio'], ['634', 'Triângulo'], ['739', 'Banco Cetelem'], ['653', 'Indusval'], ['633', 'Rendimento'], ['218', 'BS2'], ['739', 'Cetelem'], ['630', 'Smartbank'],
    ['707', 'Daycoval'], ['623', 'Pan'], ['422', 'Safra'], ['746', 'Modal'], ['655', 'Neon / Votorantim'], ['269', 'HSBC'], ['422', 'Safra'], ['633', 'Rendimento']];
  let list = [], byCode = {}, ready = null;
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const set = (arr) => {
    const m = new Map();
    arr.forEach(([c, n]) => { if (c && n && !m.has(c)) m.set(c, n); });
    list = [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    byCode = Object.fromEntries(list);
  };
  set(COMMON);

  /** Carrega a lista completa uma vez por sessão; sem rede, segue com a lista de reserva */
  function load() {
    if (ready) return ready;
    ready = (async () => {
      try {
        const cached = JSON.parse(sessionStorage.getItem('lottus_banks') || 'null');
        if (Array.isArray(cached) && cached.length > 50) { set(COMMON.concat(cached)); return; }
      } catch (_) { /* sem cache */ }
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
        const r = await fetch('https://brasilapi.com.br/api/banks/v1', { signal: ctl.signal }); clearTimeout(t);
        if (!r.ok) return;
        const j = await r.json();
        const api = j.filter((b) => b.code != null && (b.fullName || b.name)).map((b) => [String(b.code).padStart(3, '0'),
          String(b.fullName || b.name).replace(/\s+(S\.?\s?A\.?|LTDA\.?|S\/A)\s*$/i, '').replace(/\s*-\s*PRUDENCIAL.*$/i, '').trim()]);
        if (api.length > 50) { try { sessionStorage.setItem('lottus_banks', JSON.stringify(api)); } catch (_) { /* segue */ } set(COMMON.concat(api)); }
      } catch (_) { /* fica com a lista de reserva */ }
    })();
    return ready;
  }

  const name = (code) => byCode[String(code || '').padStart(3, '0')] || '';
  const label = (c, n) => `${c} · ${n}`;

  /**
   * Troca um <select> de banco por um campo com busca (nome ou código).
   * O <select> continua no formulário (escondido) com o código escolhido; o evento "change" dispara como antes.
   */
  function enhance(sel) {
    if (!sel || sel.dataset.bankPick) return;
    sel.dataset.bankPick = '1';
    for (let n = sel.nextElementSibling; n && n.classList && n.classList.contains('bank-pick'); n = sel.nextElementSibling) n.remove();
    const hasOther = [...sel.options].some((o) => o.value === 'other');
    const cur = sel.value;
    sel.innerHTML = '<option value="">Selecione…</option>' + list.map(([c, n]) => `<option value="${c}">${B.esc(label(c, n))}</option>`).join('') + (hasOther ? '<option value="other">Outro banco…</option>' : '');
    if (cur && ![...sel.options].some((o) => o.value === cur)) sel.insertAdjacentHTML('beforeend', `<option value="${B.esc(cur)}">${B.esc(cur)}</option>`);
    sel.value = cur || '';
    sel.style.setProperty('display', 'none', 'important'); sel.setAttribute('aria-hidden', 'true'); sel.tabIndex = -1;
    const wrap = document.createElement('div');
    wrap.className = 'bank-pick'; wrap.style.position = 'relative';
    wrap.innerHTML = '<input class="input" type="text" autocomplete="off" spellcheck="false" placeholder="Buscar banco por nome ou código" aria-label="Banco"><div class="bank-list" role="listbox" hidden style="position:absolute;left:0;right:0;top:100%;z-index:50;max-height:260px;overflow:auto;background:var(--surface,#fff);border:1px solid var(--line,#e6dccf);border-radius:12px;margin-top:4px;box-shadow:0 8px 24px rgba(0,0,0,.12)"></div>';
    sel.insertAdjacentElement('afterend', wrap);
    const inp = wrap.querySelector('input'), box = wrap.querySelector('.bank-list');
    const text = () => { const o = sel.options[sel.selectedIndex]; return sel.value ? (sel.value === 'other' ? 'Outro banco…' : o.textContent) : ''; };
    inp.value = text();
    let active = -1, items = [];
    const draw = (q) => {
      const t = fold(q).trim();
      const hit = (t ? list.filter(([c, n]) => c.startsWith(t) || fold(n).includes(t) || fold(label(c, n)).includes(t)) : list).slice(0, 60);
      items = hit.map(([c, n]) => [c, label(c, n)]);
      if (hasOther) items.push(['other', 'Outro banco…']);
      box.innerHTML = items.length ? items.map(([c, l], i) => `<div role="option" data-c="${B.esc(c)}" data-i="${i}" style="padding:9px 14px;cursor:pointer;font-size:14px">${B.esc(l)}</div>`).join('') : '<div style="padding:9px 14px" class="small muted">Nenhum banco encontrado</div>';
      active = items.length ? 0 : -1; mark();
    };
    const mark = () => box.querySelectorAll('[role=option]').forEach((e, i) => { e.style.background = i === active ? 'var(--hover,#f7f3ec)' : ''; if (i === active) e.scrollIntoView({ block: 'nearest' }); });
    const open = () => { box.hidden = false; };
    const close = () => { box.hidden = true; inp.value = text(); };
    const pick = (c) => {
      sel.value = c;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      box.hidden = true; inp.value = text();
    };
    inp.addEventListener('focus', () => { inp.select(); draw(''); open(); });
    inp.addEventListener('input', () => { draw(inp.value); open(); if (!inp.value) { sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); } });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); open(); active = Math.min(items.length - 1, active + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
      else if (e.key === 'Enter') { if (!box.hidden && items[active]) { e.preventDefault(); pick(items[active][0]); } }
      else if (e.key === 'Escape') { close(); }
    });
    box.addEventListener('mousedown', (e) => { const o = e.target.closest('[role=option]'); if (o) { e.preventDefault(); pick(o.dataset.c); } });
    inp.addEventListener('blur', () => setTimeout(close, 120));
    sel.addEventListener('change', () => { inp.value = text(); });
  }

  /** Aplica em todos os campos de banco dentro de um bloco (depois de desenhar o formulário) */
  async function enhanceAll(root) {
    await load();
    (root || document).querySelectorAll('select[name=bank_sel], select[name=bank_code]').forEach(enhance);
    (root || document).querySelectorAll('.field').forEach((f) => { const w = f.querySelectorAll('.bank-pick'); for (let i = 1; i < w.length; i++) w[i].remove(); });
  }

  load();
  B.banks = { load, name, enhance, enhanceAll, list: () => list };
})();
