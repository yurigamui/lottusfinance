/* Lottus Partners — máscaras de campo (valor, taxa, número, CNPJ, CPF, telefone) e calendário próprio */
(function () {
  'use strict';
  const B = window.BO;
  const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const pad = (n) => String(n).padStart(2, '0');
  const isoOfDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };

  /* Digitação natural: 500000 vira 500.000; a vírgula abre os centavos; ao sair completa ,00 */
  const fmtMoney = (n, dec = 2) => (n == null || n === '' || isNaN(Number(n)) ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  const parse = (v) => { const n = Number(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
  function money(el, dec = 2) {
    const run = () => {
      let v = el.value.replace(/[^\d,]/g, '');
      const c = v.indexOf(',');
      let int = (c < 0 ? v : v.slice(0, c)).replace(/^0+(?=\d)/, ''), d = c < 0 ? null : v.slice(c + 1).replace(/,/g, '').slice(0, dec);
      if (c < 0 && !int) { el.value = ''; return; }
      int = (int || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      el.value = d === null || !dec ? int : `${int},${d}`;
    };
    el.inputMode = 'decimal'; el.autocomplete = 'off';
    el.addEventListener('input', run);
    el.addEventListener('blur', () => { if (el.value && dec) { const n = parse(el.value); el.value = fmtMoney(n, dec); } });
    if (el.value) { el.value = fmtMoney(parse(el.value), dec); }
  }
  const only = (el, re, fmt) => { el.autocomplete = 'off'; const run = () => { el.value = fmt(el.value.replace(re, '')); }; el.addEventListener('input', run); if (el.value) run(); };
  const intMask = (el) => { el.inputMode = 'numeric'; only(el, /\D/g, (v) => v); };
  const cnpjMask = (el) => only(el, /[^0-9a-zA-Z]/g, (v) => { v = v.toUpperCase().slice(0, 14); return v.replace(/^(.{2})(.{0,3})(.{0,3})(.{0,4})(.{0,2}).*/, (m, a, b, c, d, e) => a + (b ? '.' + b : '') + (c ? '.' + c : '') + (d ? '/' + d : '') + (e ? '-' + e : '')); });
  const cpfMask = (el) => { el.inputMode = 'numeric'; only(el, /\D/g, (v) => v.slice(0, 11).replace(/^(\d{3})(\d{0,3})(\d{0,3})(\d{0,2}).*/, (m, a, b, c, d) => a + (b ? '.' + b : '') + (c ? '.' + c : '') + (d ? '-' + d : ''))); };
  const phoneMask = (el) => { el.inputMode = 'tel'; only(el, /\D/g, (v) => { v = v.slice(0, 11); return v.length <= 2 ? (v ? `(${v}` : '') : v.length <= 6 ? `(${v.slice(0, 2)}) ${v.slice(2)}` : v.length <= 10 ? `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}` : `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`; }); };

  /* ---------------- calendário ---------------- */
  const toIso = (txt) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(txt || ''); if (!m) return ''; const d = new Date(+m[3], +m[2] - 1, +m[1]); return d.getFullYear() === +m[3] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[1] ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
  const toBr = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
  let pop = null;
  const closePop = () => { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', esc, true); window.removeEventListener('resize', closePop); } };
  const outside = (e) => { if (pop && !pop.contains(e.target) && !pop.__input.contains(e.target)) closePop(); };
  const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePop(); } };

  function openCalendar(el) {
    closePop();
    const start = toIso(el.value) ? new Date(toIso(el.value) + 'T12:00:00') : new Date();
    let y = start.getFullYear(), m = start.getMonth();
    pop = document.createElement('div'); pop.className = 'cal'; pop.__input = el; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Escolher data');
    const paint = () => {
      const sel = toIso(el.value), today = isoOfDate(new Date());
      const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < first; i++) cells += '<span></span>';
      for (let d = 1; d <= days; d++) { const iso = `${y}-${pad(m + 1)}-${pad(d)}`; cells += `<button type="button" class="cal-d${iso === sel ? ' on' : ''}${iso === today ? ' today' : ''}" data-iso="${iso}">${d}</button>`; }
      pop.innerHTML = `<div class="cal-head"><button type="button" class="cal-nav" data-n="-1" aria-label="Mês anterior">‹</button><b>${MONTHS[m]} ${y}</b><button type="button" class="cal-nav" data-n="1" aria-label="Próximo mês">›</button></div>
        <div class="cal-grid cal-wd">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((w) => `<span>${w}</span>`).join('')}</div><div class="cal-grid">${cells}</div>
        <div class="cal-foot"><button type="button" class="cal-link" data-today>Hoje</button><button type="button" class="cal-link" data-clear>Limpar</button></div>`;
      pop.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => { m += +b.dataset.n; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } paint(); }));
      pop.querySelectorAll('[data-iso]').forEach((b) => (b.onclick = () => { el.value = toBr(b.dataset.iso); fire(el); closePop(); }));
      pop.querySelector('[data-today]').onclick = () => { el.value = toBr(today); fire(el); closePop(); };
      pop.querySelector('[data-clear]').onclick = () => { el.value = ''; fire(el); closePop(); };
    };
    paint();
    document.body.appendChild(pop);
    const r = el.getBoundingClientRect(), h = pop.offsetHeight, w = pop.offsetWidth;
    pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    pop.style.top = `${r.bottom + h + 12 > window.innerHeight && r.top > h + 12 ? r.top - h - 6 : r.bottom + 6}px`;
    document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', esc, true); window.addEventListener('resize', closePop);
  }
  function dateMask(el) {
    el.type = 'text'; el.inputMode = 'numeric'; el.autocomplete = 'off'; el.placeholder = el.placeholder || 'dd/mm/aaaa'; el.classList.add('date-input');
    if (/^\d{4}-/.test(el.value)) el.value = toBr(el.value);
    el.addEventListener('input', () => { const d = el.value.replace(/\D/g, '').slice(0, 8); el.value = d.replace(/^(\d{2})(\d{0,2})(\d{0,4}).*/, (x, a, b, c) => a + (b ? '/' + b : '') + (c ? '/' + c : '')); });
    el.addEventListener('focus', () => openCalendar(el));
    el.addEventListener('click', () => { if (!pop || pop.__input !== el) openCalendar(el); });
  }

  const docMask = (el) => only(el, /[^0-9a-zA-Z]/g, (v) => { const d = v.replace(/\D/g, ''); return /^\d*$/.test(v) && d.length <= 11 ? d.slice(0, 11).replace(/^(\d{3})(\d{0,3})(\d{0,3})(\d{0,2}).*/, (m, a, b, c, d2) => a + (b ? '.' + b : '') + (c ? '.' + c : '') + (d2 ? '-' + d2 : '')) : v.toUpperCase().slice(0, 14).replace(/^(.{2})(.{0,3})(.{0,3})(.{0,4})(.{0,2}).*/, (m, a, b, c, d3, e) => a + (b ? '.' + b : '') + (c ? '.' + c : '') + (d3 ? '/' + d3 : '') + (e ? '-' + e : '')); });
  const KINDS = { doc: docMask, money: (e) => money(e, 2), rate: (e) => money(e, 2), int: intMask, cnpj: cnpjMask, cpf: cpfMask, phone: phoneMask, date: dateMask };
  function attach(root) {
    (root || document).querySelectorAll('[data-mask]').forEach((el) => { if (el.__masked) return; el.__masked = true; (KINDS[el.dataset.mask] || (() => {}))(el); });
  }
  B.mask = { attach, parse, fmtMoney, iso: (el) => toIso(el.value), toIso, toBr, closeCalendar: closePop };
})();
