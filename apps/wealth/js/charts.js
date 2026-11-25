/* Lottus Wealth — gráficos em SVG (linha/área, colunas receitas × despesas, rosca) com dica e tabela equivalente. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  function niceMax(v) { if (!(v > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p; return 10 * p; }
  function niceRange(min, max) {
    if (min >= 0) return [0, niceMax(max)];
    const top = niceMax(Math.max(max, 0)), bot = -niceMax(-min); return [bot, top];
  }
  function shell(host, label) {
    host.classList.add('chart-host'); host.innerHTML = '';
    const wrap = document.createElement('div'); wrap.className = 'chart';
    const tip = document.createElement('div'); tip.className = 'chart-tip'; tip.hidden = true; wrap.appendChild(tip); host.appendChild(wrap);
    return { wrap, tip };
  }
  function table(host, head, rows) {
    const det = document.createElement('details'); det.className = 'chart-table';
    det.innerHTML = `<summary>Ver em tabela</summary><table><thead><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ''}>${W.esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ''}>${W.esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    host.appendChild(det);
  }
  function setTip(tip, lines, x, y, W_) {
    tip.innerHTML = lines.map((l, i) => (i === 0 ? `<strong>${W.esc(l)}</strong>` : `<span>${W.esc(l)}</span>`)).join(''); tip.hidden = false;
    const tw = tip.offsetWidth; tip.style.left = `${Math.min(Math.max(x - tw / 2, 0), W_ - tw)}px`; tip.style.top = `${Math.max(0, y - tip.offsetHeight - 12)}px`;
  }

  /** rows: [{label, long, a, b?}]  a = série principal (área); b = série tracejada (ex.: aportes) */
  W.lineChart = (host, rows, o = {}) => {
    const { wrap, tip } = shell(host); const fmt = o.format || W.brl; const H = o.height || 260; const names = o.names || ['Valor', 'Aportes'];
    // seleção por arraste (como no Google): o balão mostra o desempenho só do trecho escolhido
    let sel = null, drag = null; const bubble = document.createElement('div'); bubble.className = 'chart-sel'; bubble.hidden = true; wrap.appendChild(bubble);
    const paintBubble = () => {
      if (!sel || !o.onRange) { bubble.hidden = true; return; }
      const r = o.onRange(Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)); if (!r) { bubble.hidden = true; return; }
      const cls = W.cls(r.money); bubble.hidden = false;
      bubble.innerHTML = `<span class="sel-val ${cls}">${r.money === null || r.money === undefined ? '' : W.sign(r.money, fmt)}${r.pct === null || r.pct === undefined ? '' : ` (${W.sign(r.pct, (v) => W.pct(v, 2))})`} <span aria-hidden="true">${Number(r.money) >= 0 ? '↑' : '↓'}</span></span><span class="sel-per">${W.esc(r.from)} – ${W.esc(r.to)}</span><button type="button" class="sel-x" aria-label="Limpar seleção">×</button>`;
      bubble.querySelector('.sel-x').onclick = () => { sel = null; draw(); };
    };
    function draw() {
      const Wd = Math.max(200, wrap.clientWidth), m = { t: 16, r: 8, b: 26, l: 56 }, pw = Wd - m.l - m.r, ph = H - m.t - m.b;
      const vals = rows.flatMap((r) => [r.a, r.b, r.c]).filter((v) => v !== undefined && v !== null).map(Number);
      const [lo, hi] = niceRange(Math.min(0, ...vals), Math.max(0, ...vals));
      const y = (v) => m.t + ph - ((v - lo) / (hi - lo || 1)) * ph; const x = (i) => m.l + (rows.length === 1 ? pw / 2 : (pw * i) / (rows.length - 1));
      const svg = el('svg', { width: Wd, height: H, viewBox: `0 0 ${Wd} ${H}`, role: 'img', 'aria-label': o.name || 'Gráfico' });
      for (let i = 0; i <= 4; i++) {
        const v = lo + ((hi - lo) / 4) * i, yy = Math.round(y(v)) + 0.5;
        svg.appendChild(el('line', { x1: m.l, x2: Wd - m.r, y1: yy, y2: yy, class: Math.abs(v) < 1e-9 ? 'chart-base' : 'chart-grid' }));
        const t = el('text', { x: m.l - 8, y: yy + 4, 'text-anchor': 'end', class: 'chart-axis' }); t.textContent = Math.abs(v) < 1e-9 ? '0' : W.brlC(v).replace('R$ ', ''); svg.appendChild(t);
      }
      const every = Math.ceil(rows.length / Math.max(2, Math.floor(pw / 56)));
      rows.forEach((r, i) => { if (i % every === 0 || i === rows.length - 1) { const t = el('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', class: 'chart-axis' }); t.textContent = r.label; svg.appendChild(t); } });
      const path = (k) => rows.map((r, i) => (r[k] === undefined || r[k] === null ? null : `${x(i)},${y(Number(r[k]))}`)).filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p}`).join('');
      if (rows.length > 1) svg.appendChild(el('path', { d: `${path('a')}L${x(rows.length - 1)},${y(Math.max(lo, 0))}L${x(0)},${y(Math.max(lo, 0))}Z`, class: 'line-area' }));
      if (rows.some((r) => r.b !== undefined)) svg.appendChild(el('path', { d: path('b'), class: 'line-path alt' }));
      if (rows.some((r) => r.c !== undefined && r.c !== null)) svg.appendChild(el('path', { d: path('c'), class: 'line-path bench' }));
      svg.appendChild(el('path', { d: path('a'), class: 'line-path' }));
      const dot = el('circle', { r: 5, class: 'line-dot', visibility: 'hidden' }); svg.appendChild(dot);
      const band = pw / Math.max(rows.length - 1, 1);
      rows.forEach((r, i) => {
        const hit = el('rect', { x: x(i) - band / 2, y: m.t, width: band, height: ph, class: 'chart-hit', tabindex: '0', 'aria-label': `${r.long || r.label}: ${fmt(r.a)}` });
        const show = () => { dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(Number(r.a))); dot.setAttribute('visibility', 'visible'); setTip(tip, [fmt(r.a), r.long || r.label, ...(r.b !== undefined ? [`${names[1]}: ${fmt(r.b)}`] : []), ...(r.c !== undefined && r.c !== null ? [`${names[2]}: ${fmt(r.c)}`] : [])], x(i), y(Number(r.a)), Wd); };
        const hide = () => { tip.hidden = true; dot.setAttribute('visibility', 'hidden'); };
        hit.addEventListener('pointerenter', show); hit.addEventListener('pointermove', show); hit.addEventListener('pointerleave', hide); hit.addEventListener('focus', show); hit.addEventListener('blur', hide);
        svg.appendChild(hit);
      });
      if (o.onRange && rows.length > 1) {
        svg.style.touchAction = 'pan-y'; svg.classList.add('selectable');
        const band = el('rect', { class: 'sel-band', y: m.t, height: ph, visibility: 'hidden' }); svg.insertBefore(band, svg.querySelector('.chart-hit'));
        const d1 = el('circle', { r: 5, class: 'sel-dot', visibility: 'hidden' }), d2 = el('circle', { r: 5, class: 'sel-dot', visibility: 'hidden' }); svg.append(d1, d2);
        const idxAt = (cx) => { const b = svg.getBoundingClientRect(); return Math.max(0, Math.min(rows.length - 1, Math.round(((cx - b.left - m.l) / pw) * (rows.length - 1)))); };
        const paint = () => {
          if (!sel || sel.a === sel.b) { band.setAttribute('visibility', 'hidden'); d1.setAttribute('visibility', 'hidden'); d2.setAttribute('visibility', 'hidden'); return; }
          const lo = Math.min(sel.a, sel.b), hi = Math.max(sel.a, sel.b);
          band.setAttribute('x', x(lo)); band.setAttribute('width', Math.max(1, x(hi) - x(lo))); band.setAttribute('visibility', 'visible');
          d1.setAttribute('cx', x(lo)); d1.setAttribute('cy', y(Number(rows[lo].a))); d2.setAttribute('cx', x(hi)); d2.setAttribute('cy', y(Number(rows[hi].a))); d1.setAttribute('visibility', 'visible'); d2.setAttribute('visibility', 'visible');
        };
        svg.addEventListener('pointerdown', (e) => { if (e.button > 0) return; drag = { a: idxAt(e.clientX), moved: false }; sel = null; try { svg.setPointerCapture(e.pointerId); } catch (x) { /* sem captura */ } });
        svg.addEventListener('pointermove', (e) => { if (!drag) return; const i = idxAt(e.clientX); if (i !== drag.a) { drag.moved = true; sel = { a: drag.a, b: i }; tip.hidden = true; paint(); paintBubble(); } });
        const end = () => { if (drag && !drag.moved) { sel = null; paint(); paintBubble(); } drag = null; };
        svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
        paint();
      }
      const old = wrap.querySelector('svg'); if (old) old.replaceWith(svg); else wrap.insertBefore(svg, tip);
      paintBubble();
    }
    draw();
    const hasC = rows.some((r) => r.c !== undefined && r.c !== null);
    table(host, ['Mês', names[0], ...(rows.some((r) => r.b !== undefined) ? [names[1]] : []), ...(hasC ? [names[2]] : [])], rows.map((r) => [r.long || r.label, fmt(r.a), ...(r.b !== undefined ? [fmt(r.b)] : []), ...(hasC ? [r.c === null || r.c === undefined ? '—' : fmt(r.c)] : [])]));
    if (window.ResizeObserver) { let last = wrap.clientWidth; new ResizeObserver(() => { if (Math.abs(wrap.clientWidth - last) > 4) { last = wrap.clientWidth; draw(); } }).observe(wrap); }
  };

  /** rows: [{label, long, in, out}] — receitas (verde) e despesas (rosa) lado a lado */
  W.flowChart = (host, rows, o = {}) => {
    const { wrap, tip } = shell(host); const H = o.height || 240;
    function draw() {
      const Wd = Math.max(200, wrap.clientWidth), m = { t: 16, r: 4, b: 26, l: 56 }, pw = Wd - m.l - m.r, ph = H - m.t - m.b;
      const max = niceMax(Math.max(0, ...rows.flatMap((r) => [Number(r.in) || 0, Number(r.out) || 0]))); const y = (v) => m.t + ph - (v / max) * ph;
      const svg = el('svg', { width: Wd, height: H, viewBox: `0 0 ${Wd} ${H}`, role: 'img', 'aria-label': 'Receitas e despesas por mês' });
      for (let i = 0; i <= 4; i++) { const v = (max / 4) * i, yy = Math.round(y(v)) + 0.5; svg.appendChild(el('line', { x1: m.l, x2: Wd - m.r, y1: yy, y2: yy, class: i === 0 ? 'chart-base' : 'chart-grid' })); const t = el('text', { x: m.l - 8, y: yy + 4, 'text-anchor': 'end', class: 'chart-axis' }); t.textContent = i === 0 ? '0' : W.brlC(v).replace('R$ ', ''); svg.appendChild(t); }
      const band = pw / Math.max(rows.length, 1), bw = Math.min(18, band * 0.34);
      rows.forEach((r, i) => {
        const cx = m.l + band * i + band / 2;
        [[Number(r.in) || 0, -bw - 1, 'bar-in'], [Number(r.out) || 0, 1, 'bar-out']].forEach(([v, dx, c]) => { if (v > 0) svg.appendChild(el('rect', { x: cx + dx, y: y(v), width: bw, height: m.t + ph - y(v), rx: 3, class: c })); });
        if (band >= 34 || i % 2 === 0) { const t = el('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'chart-axis' }); t.textContent = r.label; svg.appendChild(t); }
        const hit = el('rect', { x: m.l + band * i, y: m.t, width: band, height: ph, class: 'chart-hit', tabindex: '0', 'aria-label': `${r.long}: receitas ${W.brl(r.in)}, despesas ${W.brl(r.out)}` });
        const show = () => setTip(tip, [r.long, `Receitas: ${W.brl(r.in)}`, `Despesas: ${W.brl(r.out)}`, `Saldo: ${W.brl((Number(r.in) || 0) - (Number(r.out) || 0))}`], cx, y(Math.max(Number(r.in) || 0, Number(r.out) || 0)), Wd);
        hit.addEventListener('pointerenter', show); hit.addEventListener('pointermove', show); hit.addEventListener('pointerleave', () => { tip.hidden = true; }); hit.addEventListener('focus', show); hit.addEventListener('blur', () => { tip.hidden = true; });
        svg.appendChild(hit);
      });
      const old = wrap.querySelector('svg'); if (old) old.replaceWith(svg); else wrap.insertBefore(svg, tip);
    }
    draw();
    table(host, ['Mês', 'Receitas', 'Despesas'], rows.map((r) => [r.long, W.brl(r.in), W.brl(r.out)]));
    if (window.ResizeObserver) { let last = wrap.clientWidth; new ResizeObserver(() => { if (Math.abs(wrap.clientWidth - last) > 4) { last = wrap.clientWidth; draw(); } }).observe(wrap); }
  };

  /** rosca com legenda: rows [{name, value}] (até 5 fatias + "Outros") */
  W.donut = (host, rows, o = {}) => {
    const fmt = o.format || W.brl; const list = rows.filter((r) => Number(r.value) > 0).sort((a, b) => b.value - a.value);
    let top = list.slice(0, 5); const rest = list.slice(5).reduce((s, r) => s + Number(r.value), 0); if (rest > 0) top = [...top, { name: 'Outros', value: rest }];
    const total = top.reduce((s, r) => s + Number(r.value), 0); host.innerHTML = '';
    if (!total) { host.innerHTML = '<div class="empty">Sem dados no período.</div>'; return; }
    const R = 62, r = 40, C = 80; let a0 = -Math.PI / 2; const svg = el('svg', { width: 160, height: 160, viewBox: '0 0 160 160', role: 'img', 'aria-label': o.name || 'Composição' });
    top.forEach((s, i) => {
      const a1 = a0 + (Number(s.value) / total) * Math.PI * 2 - (top.length > 1 ? 0.02 : 0), big = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad, a) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
      const path = el('path', { d: top.length === 1 ? `M${C - R},${C}a${R},${R} 0 1,0 ${2 * R},0a${R},${R} 0 1,0 ${-2 * R},0M${C - r},${C}a${r},${r} 0 1,1 ${2 * r},0a${r},${r} 0 1,1 ${-2 * r},0Z` : `M${p(R, a0)}A${R},${R} 0 ${big} 1 ${p(R, a1)}L${p(r, a1)}A${r},${r} 0 ${big} 0 ${p(r, a0)}Z`, class: `c${i}`, 'fill-rule': 'evenodd' });
      const t = el('title'); t.textContent = `${s.name}: ${fmt(s.value)} (${W.pct(s.value / total, 1)})`; path.appendChild(t); svg.appendChild(path); a0 += (Number(s.value) / total) * Math.PI * 2;
    });
    const box = document.createElement('div'); box.className = 'row donut-box'; box.style.flexWrap = 'nowrap';
    const leg = document.createElement('div'); leg.className = 'legend grow';
    leg.innerHTML = top.map((s, i) => `<div class="legend-row"><span class="dot c${i}"></span><span class="grow">${W.esc(s.name)}</span><b>${W.pct(s.value / total, 1)}</b></div>`).join('');
    box.append(svg, leg); host.appendChild(box);
  };
})();
