/* Lottus Partners — campos de seleção com busca: vale para todo <select class="input"> (digite e a lista vai filtrando).
   Opte por não usar com data-nocombo. O <select> continua no formulário (escondido) com o valor escolhido; o evento "change" dispara como antes. */
(function () {
  'use strict';
  const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const valDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');

  function enhance(sel) {
    if (!sel || sel.dataset.combo || sel.dataset.bankPick || sel.multiple || 'nocombo' in sel.dataset || sel.classList.contains('pager-size') || sel.hasAttribute('data-pg-size')) return;
    if (!sel.classList.contains('input')) return;
    sel.dataset.combo = '1';
    const wrap = document.createElement('div');
    wrap.className = 'combo'; wrap.style.position = 'relative';
    if (sel.style.maxWidth) wrap.style.maxWidth = sel.style.maxWidth;
    if (sel.style.width) wrap.style.width = sel.style.width;
    if (sel.style.minWidth) wrap.style.minWidth = sel.style.minWidth;
    wrap.innerHTML = `<input class="input combo-in" type="text" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-label="${(sel.getAttribute('aria-label') || '').replace(/"/g, '&quot;')}" placeholder="Digite para buscar">`;
    sel.insertAdjacentElement('afterend', wrap);
    const d0 = sel.style.display;
    const many = () => [...sel.options].filter((o) => o.value !== '').length > 8;
    const inp = wrap.querySelector('input');
    let list = null, items = [], active = -1;
    const text = () => { const o = sel.options[sel.selectedIndex]; return o && (o.value !== '' || o.textContent.trim() !== '') && !/^selecione/i.test(o.textContent.trim()) ? o.textContent.trim() : ''; };
    const sync = () => { const on = many(); sel.style.display = on ? 'none' : d0; if (document.activeElement !== inp) inp.value = text(); inp.disabled = sel.disabled; wrap.hidden = sel.hidden || !on; inp.placeholder = (sel.options[0] && /^selecione/i.test(sel.options[0].textContent.trim())) ? 'Selecione…' : 'Digite para buscar'; };
    const closeList = () => { if (list) { list.remove(); list = null; } inp.setAttribute('aria-expanded', 'false'); inp.value = text(); };
    const mark = () => { if (!list) return; list.querySelectorAll('[role=option]').forEach((e, i) => { e.classList.toggle('on', i === active); if (i === active) e.scrollIntoView({ block: 'nearest' }); }); };
    const pick = (i) => {
      const o = items[i]; if (!o) return;
      valDesc.set.call(sel, o.value); sel.dispatchEvent(new Event('change', { bubbles: true }));
      closeList();
    };
    const draw = (q) => {
      const t = fold(q).trim();
      const rows = []; let lastG = null, n = 0;
      items = [];
      [...sel.options].forEach((o) => {
        if (o.disabled && o.value === '') return;
        const label = o.textContent.trim();
        if (t && !fold(label).includes(t)) return;
        if (n >= 250) return;
        const g = o.parentElement && o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : null;
        if (g && g !== lastG) { rows.push(`<div class="combo-g">${g.replace(/</g, '&lt;')}</div>`); }
        lastG = g;
        rows.push(`<div class="combo-o" role="option" data-i="${items.length}">${label.replace(/&/g, '&amp;').replace(/</g, '&lt;') || '—'}</div>`); items.push(o); n++;
      });
      if (!list) { list = document.createElement('div'); list.className = 'combo-list'; list.setAttribute('role', 'listbox'); document.body.appendChild(list); }
      list.innerHTML = rows.length ? rows.join('') : '<div class="combo-g">Nada encontrado</div>';
      const r = inp.getBoundingClientRect();
      list.style.left = `${r.left}px`; list.style.width = `${Math.max(r.width, 180)}px`;
      const h = Math.min(280, list.scrollHeight);
      list.style.top = `${r.bottom + h + 8 > window.innerHeight && r.top > h + 8 ? r.top - h - 4 : r.bottom + 4}px`;
      const cur = items.findIndex((o) => o.value === sel.value);
      active = t ? (items.length ? 0 : -1) : (cur >= 0 ? cur : 0); mark();
      inp.setAttribute('aria-expanded', 'true');
    };
    inp.addEventListener('focus', () => { inp.select(); draw(''); });
    inp.addEventListener('click', () => { if (!list) { inp.select(); draw(''); } });
    inp.addEventListener('input', () => draw(inp.value));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!list) draw(''); active = Math.min(items.length - 1, active + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
      else if (e.key === 'Enter') { if (list && items[active]) { e.preventDefault(); e.stopPropagation(); pick(active); } }
      else if (e.key === 'Escape') { if (list) { e.stopPropagation(); closeList(); } }
      else if (e.key === 'Tab') closeList();
    });
    document.addEventListener('mousedown', (e) => { if (!list) return; const o = e.target.closest && e.target.closest('.combo-o'); if (o && list.contains(o)) { e.preventDefault(); pick(+o.dataset.i); } }, true);
    inp.addEventListener('blur', () => setTimeout(closeList, 120));
    window.addEventListener('resize', () => { if (list) closeList(); });
    sel.addEventListener('change', sync);
    new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden'] });
    // código que troca o valor sem disparar "change" também atualiza o campo
    Object.defineProperty(sel, 'value', { configurable: true, get() { return valDesc.get.call(sel); }, set(v) { valDesc.set.call(sel, v); sync(); } });
    // a etiqueta (label for=) passa a focar o campo de busca
    if (sel.id) { const lb = document.querySelector(`label[for="${sel.id}"]`); if (lb) lb.addEventListener('click', (e) => { e.preventDefault(); inp.focus(); }); }
    sync();
  }

  const scan = (root) => (root || document).querySelectorAll && (root || document).querySelectorAll('select.input').forEach(enhance);
  const start = () => {
    scan(document);
    new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType !== 1) return; if (n.tagName === 'SELECT') enhance(n); else scan(n); }); }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.BO = window.BO || {}; window.BO.combo = { enhance, scan };
})();
