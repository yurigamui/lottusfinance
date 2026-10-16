/* Lottus Partners — gráfico de colunas (uma série) em SVG, com dica ao passar o mouse
   e tabela com os mesmos números. Cores vêm do tema (var(--rosa)), claro ou escuro. */
(function () {
  'use strict';
  const B = window.BO;
  const NS = 'http://www.w3.org/2000/svg';

  const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  B.brlCompact = (v) => `R$ ${compact.format(Number(v) || 0)}`;

  /** Teto "redondo" para o eixo: 1, 2, 2,5 ou 5 × 10^k */
  function niceMax(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
    return 10 * p;
  }
  const el = (tag, attrs = {}) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  /** Coluna com topo arredondado (4px) e base reta */
  function barPath(x, y, w, h) {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  /**
   * rows: [{ label, long, value, detail }]  (label curto no eixo, long na dica/tabela)
   * opts: { name, format(v), height }
   */
  B.columnChart = (host, rows, opts = {}) => {
    const fmt = opts.format || B.brl;
    const H = opts.height || 220;
    host.classList.add('chart-host');
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'chart';
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    const tv = document.createElement('strong');
    const tl = document.createElement('span');
    const td = document.createElement('span');
    td.className = 'chart-tip-sub';
    tip.append(tv, tl, td);
    wrap.appendChild(tip);
    host.appendChild(wrap);

    // Tabela com os mesmos números (acessível sem passar o mouse)
    const det = document.createElement('details');
    det.className = 'chart-table';
    const sum = document.createElement('summary');
    sum.textContent = 'Ver em tabela';
    const tbl = document.createElement('table');
    const thead = tbl.createTHead().insertRow();
    for (const t of ['Mês', opts.name || 'Valor']) { const th = document.createElement('th'); th.textContent = t; thead.appendChild(th); }
    thead.lastChild.className = 'num';
    const tb = tbl.createTBody();
    for (const r of rows) {
      const tr = tb.insertRow();
      tr.insertCell().textContent = r.long || r.label;
      const c = tr.insertCell(); c.className = 'num'; c.textContent = fmt(r.value) + (r.detail ? ` · ${r.detail}` : '');
    }
    det.append(sum, tbl);
    host.appendChild(det);

    function draw() {
      const W = Math.max(260, wrap.clientWidth);
      const m = { t: 22, r: 4, b: 26, l: 52 };
      const pw = W - m.l - m.r, ph = H - m.t - m.b;
      const max = niceMax(Math.max(0, ...rows.map((r) => Number(r.value) || 0)));
      const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.name || 'Gráfico' });
      const y = (v) => m.t + ph - (v / max) * ph;

      // Grade (linha fina, discreta) e valores do eixo
      for (let i = 0; i <= 4; i++) {
        const v = (max / 4) * i, yy = Math.round(y(v)) + 0.5;
        svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: yy, y2: yy, class: i === 0 ? 'chart-base' : 'chart-grid' }));
        const t = el('text', { x: m.l - 8, y: yy + 4, 'text-anchor': 'end', class: 'chart-axis' });
        t.textContent = i === 0 ? '0' : B.brlCompact(v).replace('R$ ', '');
        svg.appendChild(t);
      }

      const band = pw / rows.length;
      const bw = Math.min(24, band * 0.56);
      const every = band < 34 ? 2 : 1;
      const imax = rows.reduce((b, r, i) => ((Number(r.value) || 0) > (Number(rows[b].value) || 0) ? i : b), 0);
      const bars = [];
      rows.forEach((r, i) => {
        const v = Number(r.value) || 0;
        const cx = m.l + band * i + band / 2;
        if (v > 0) {
          const top = y(v), h = m.t + ph - top;
          const p = el('path', { d: barPath(cx - bw / 2, top, bw, Math.max(h, 1)), class: 'chart-bar' });
          svg.appendChild(p);
          bars[i] = p;
          // Rótulo só no maior valor e no último mês com valor
          if (i === imax || (i === rows.length - 1)) {
            const t = el('text', { x: cx, y: top - 7, 'text-anchor': 'middle', class: 'chart-value' });
            t.textContent = B.brlCompact(v);
            svg.appendChild(t);
          }
        }
        if (i % every === 0 || i === rows.length - 1) {
          const t = el('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'chart-axis' });
          t.textContent = r.label;
          svg.appendChild(t);
        }
      });

      // Áreas de toque: a faixa inteira do mês (maior que a coluna)
      rows.forEach((r, i) => {
        const hit = el('rect', { x: m.l + band * i, y: m.t, width: band, height: ph, class: 'chart-hit', tabindex: '0',
          'aria-label': `${r.long || r.label}: ${fmt(r.value)}${r.detail ? ', ' + r.detail : ''}` });
        const show = () => {
          tv.textContent = fmt(r.value);
          tl.textContent = r.long || r.label;
          td.textContent = r.detail || '';
          td.hidden = !r.detail;
          tip.hidden = false;
          svg.classList.add('hovering');
          bars.forEach((b, j) => b && b.classList.toggle('on', j === i));
          const cx = m.l + band * i + band / 2;
          const tw = tip.offsetWidth;
          tip.style.left = `${Math.min(Math.max(cx - tw / 2, 0), W - tw)}px`;
          tip.style.top = `${Math.max(0, y(Number(r.value) || 0) - tip.offsetHeight - 12)}px`;
        };
        const hide = () => { tip.hidden = true; svg.classList.remove('hovering'); bars.forEach((b) => b && b.classList.remove('on')); };
        hit.addEventListener('pointerenter', show);
        hit.addEventListener('pointermove', show);
        hit.addEventListener('pointerleave', hide);
        hit.addEventListener('focus', show);
        hit.addEventListener('blur', hide);
        svg.appendChild(hit);
      });

      const old = wrap.querySelector('svg');
      if (old) old.replaceWith(svg); else wrap.insertBefore(svg, tip);
    }
    draw();
    if (window.ResizeObserver) {
      let last = wrap.clientWidth;
      new ResizeObserver(() => { if (Math.abs(wrap.clientWidth - last) > 4) { last = wrap.clientWidth; draw(); } }).observe(wrap);
    }
  };
})();
