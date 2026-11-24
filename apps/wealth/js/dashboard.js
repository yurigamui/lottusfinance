/* Lottus Wealth — Dashboard do Patrimônio: rentabilidade × CDI, alocação, evolução, resumo por período,
   resultado mês a mês, eventos, volatilidade, drawdown, liquidez e custodiantes. Tudo calculado da série diária. */
(function () {
  'use strict';
  const { esc, ico } = W;
  const empty = (t) => `<div class="empty">${esc(t)}</div>`;
  const KIND = { acao: 'Ação', fii: 'FII', etf: 'ETF', bdr: 'BDR', fundo: 'Fundo', tesouro: 'Tesouro Direto', rf_pre: 'Renda fixa pré', rf_pos: 'Renda fixa pós', rf_ipca: 'Renda fixa IPCA+', cripto: 'Cripto', imovel: 'Imóvel', veiculo: 'Veículo', outro: 'Outro' };
  const MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const AX = (v) => W.pct(v, Math.abs(v) < 0.02 ? 2 : 1);
  const p2 = (v, d = 2) => (v === null || v === undefined || !isFinite(v) ? '—' : W.pct(v, d));
  const sg = (v) => (v === null || v === undefined || !isFinite(v) ? '—' : W.sign(v, W.brl));
  const cl = (v) => (v === null || v === undefined || !isFinite(v) ? '' : W.cls(v));
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return W.ymd(d); };
  const addMonths = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setMonth(d.getMonth() + n); return W.ymd(d); };

  /* ---------- cálculo sobre a série diária: [data, valor dos investimentos, aporte líquido do dia, proventos do dia, fator do CDI] ---------- */
  const calc = (days) => {
    const n = days.length; const d = days.map((x) => x[0]); const inv = days.map((x) => Number(x[1])), fl = days.map((x) => Number(x[2])), inc = days.map((x) => Number(x[3])), k = days.map((x) => Number(x[4]));
    const r = new Array(n).fill(0), idx = new Array(n).fill(1), cumFl = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      if (i > 0) { const prev = inv[i - 1]; r[i] = prev > 0 ? (inv[i] - fl[i] + inc[i]) / prev - 1 : 0; idx[i] = idx[i - 1] * (1 + r[i]); cumFl[i] = cumFl[i - 1] + fl[i]; } else cumFl[i] = fl[i];
    }
    const wk = d.map((s) => { const g = new Date(s + 'T12:00:00').getDay(); return g > 0 && g < 6; });
    const at = (s) => { let lo = 0, hi = n - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (d[m] <= s) { a = m; lo = m + 1; } else hi = m - 1; } return a; };
    // base de uma janela que começa em "s": último dia anterior a s
    const base = (s) => Math.max(at(addDays(s, -1)), 0);
    const vol = (i0, i1) => { const x = []; for (let i = i0 + 1; i <= i1; i++) if (wk[i]) x.push(r[i]); if (x.length < 3) return null; const mu = x.reduce((a, b) => a + b, 0) / x.length; return Math.sqrt(x.reduce((a, b) => a + (b - mu) ** 2, 0) / (x.length - 1)) * Math.sqrt(252); };
    const win = (i0, i1) => {
      if (i1 <= i0) return { ret: null, money: null, cdi: null, vol: null, sharpe: null };
      const ret = idx[i1] / idx[i0] - 1, cdi = k[i1] / k[i0] - 1; let money = inv[i1] - inv[i0]; for (let i = i0 + 1; i <= i1; i++) money += -fl[i] + inc[i];
      const days365 = (new Date(d[i1]) - new Date(d[i0])) / 864e5, v = vol(i0, i1);
      const ann = (x) => (days365 >= 30 ? Math.pow(1 + x, 365 / days365) - 1 : x);
      return { ret, money, cdi, vol: v, sharpe: v && v > 0 && days365 >= 90 ? (ann(ret) - ann(cdi)) / v : null };
    };
    return { n, d, inv, fl, inc, k, r, idx, cumFl, wk, at, base, vol, win };
  };
  const rollVol = (c, w, i0, i1) => { const out = []; const wr = []; const pos = []; for (let i = 0; i < c.n; i++) if (c.wk[i]) { wr.push(c.r[i]); pos.push(i); }
    const byIdx = new Map(); let s = 0, s2 = 0; const q = [];
    for (let j = 0; j < wr.length; j++) { q.push(wr[j]); s += wr[j]; s2 += wr[j] * wr[j]; if (q.length > w) { const o = q.shift(); s -= o; s2 -= o * o; } if (q.length >= Math.min(w, 20)) { const m = s / q.length; byIdx.set(pos[j], Math.sqrt(Math.max(0, (s2 - q.length * m * m) / (q.length - 1))) * Math.sqrt(252)); } }
    let last = null; for (let i = i0; i <= i1; i++) { if (byIdx.has(i)) last = byIdx.get(i); out.push(last); } return out; };

  const classOf = (kind) => ({ acao: 'Renda Variável', fii: 'Renda Variável', etf: 'Renda Variável', bdr: 'Renda Variável', tesouro: 'Renda Fixa', rf_pos: 'Renda Fixa', rf_pre: 'Renda Fixa', rf_ipca: 'Renda Fixa', fundo: 'Fundos', cripto: 'Criptoativos' }[kind] || 'Outros ativos');
  const groupBy = (pos, keyFn) => { const m = new Map(); for (const p of pos) { const k = keyFn(p) || '—'; const g = m.get(k) || { name: k, value: 0, w: 0, tw: 0, pnl: 0 }; g.value += Number(p.value); g.pnl += Number(p.pnl ?? 0); if (p.twr !== null && p.twr !== undefined) { const wt = Math.max(Number(p.invested), 0); g.w += wt; g.tw += Number(p.twr) * wt; } m.set(k, g); } return [...m.values()].map((g) => ({ ...g, twr: g.w > 0 ? g.tw / g.w : null })).sort((a, b) => b.value - a.value); };

  const card = (title, body, cls = '', extra = '') => `<section class="card dash-card ${cls}"><div class="card-head"><h2>${title}</h2>${extra}</div>${body}</section>`;
  const tbl = (head, rows, foot = '') => `<div class="table-wrap"><table class="tight fit dash-t"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table></div>`;

  const perOf = (ctx) => {
    const today = W.ymd(); const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && s <= today && !isNaN(new Date(s));
    const de = ctx.q.get('de'), ate = ctx.q.get('ate'); const to = ok(ate) ? ate : today;
    if (de === 'inicio') return { from: null, to, all: true };
    let from = ok(de) ? de : addDays(to, -29); if (from > to) from = addDays(to, -29); return { from, to, all: false };
  };

  W.route('/w/:id/patrimonio', async (ctx) => {
    const id = ctx.w.id; const mode = W.viewMode(ctx); const per = perOf(ctx);
    const [ser, nw, pos, liq] = await Promise.all([W.rpc('w_dashboard_series', { p_wallet: id, p_from: null, p_to: per.to, p_mode: mode }), W.rpc('w_networth', { p_wallet: id, p_mode: mode }), W.rpc('w_positions', { p_wallet: id, p_mode: mode, p_from: per.from, p_to: per.to }), W.rpc('w_liquidity', { p_wallet: id, p_mode: mode })]);
    const actions = `${W.modeBar(mode)}<button class="btn secondary" data-act="reports-open">${ico('file')} Relatórios</button>${ctx.canWrite ? `<a class="btn" href="#/w/${id}/transacoes?new=1">${ico('plus')} Nova transação</a>` : ''}`;
    if (!ser.days.length) return `${W.pageHead('Patrimônio', '', actions)}${empty('Ainda não há investimentos para mostrar. Registre uma transação ou importe um arquivo.')}`;
    const c = calc(ser.days); const first = ser.first; const from = per.all ? first : per.from < first ? first : per.from;
    const i0 = c.base(from), i1 = c.at(per.to); const cur = c.win(i0, i1);
    const rows = []; for (let i = i0 + 1; i <= i1; i++) rows.push(i);
    const rebased = rows.map((i) => ({ label: W.dt(c.d[i]).slice(0, 5), long: W.dt(c.d[i]), a: c.idx[i] / c.idx[i0] - 1, b: c.k[i] / c.k[i0] - 1 }));
    const allocRows = groupBy(pos, (p) => classOf(p.kind)); const totalPos = pos.reduce((s, p) => s + Number(p.value), 0);
    const cust = groupBy(pos, (p) => p.custodian || 'Sem custodiante');
    // janelas do resumo
    const t = per.to, y0 = `${t.slice(0, 4)}-01-01`, m0 = `${t.slice(0, 7)}-01`;
    const W6 = [['Período', cur], ['Mês', c.win(c.base(m0 < first ? first : m0), i1)], ['Ano', c.win(c.base(y0 < first ? first : y0), i1)], ['12 meses', c.win(c.base(addMonths(t, -12) < first ? first : addMonths(t, -12)), i1)], ['24 meses', c.win(c.base(addMonths(t, -24) < first ? first : addMonths(t, -24)), i1)], ['Desde o início', c.win(0, i1)]];
    const sumRow = (lab, f) => `<tr><th scope="row">${lab}</th>${W6.map(([, w]) => `<td class="num">${f(w)}</td>`).join('')}</tr>`;
    const resumo = tbl(`<th></th>${W6.map(([l]) => `<th class="num">${l}</th>`).join('')}`, sumRow('Rentabilidade', (w) => `<span class="${cl(w.ret)}">${p2(w.ret)}</span>`) + sumRow('Retorno', (w) => `<span class="${cl(w.money)}">${sg(w.money)}</span>`) + sumRow('CDI', (w) => p2(w.cdi)) + sumRow('Volatilidade', (w) => p2(w.vol)) + sumRow('Sharpe', (w) => (w.sharpe === null ? '—' : w.sharpe.toFixed(2).replace('.', ','))));
    // mês a mês
    const byYear = new Map(); { let prevI = 0; const months = []; for (let i = 1; i < c.n; i++) { const last = i === c.n - 1 || c.d[i].slice(0, 7) !== c.d[i + 1].slice(0, 7); if (last) { months.push([c.d[i].slice(0, 7), prevI, i]); prevI = i; } }
      for (const [ym, a, b] of months) { const y = ym.slice(0, 4), mo = Number(ym.slice(5)) - 1; const w = c.win(a, b); const e = byYear.get(y) || { ret: [], cdi: [], money: [] }; e.ret[mo] = w.ret; e.cdi[mo] = w.cdi; e.money[mo] = w.money; byYear.set(y, e); } }
    const prod = (a) => a.filter((x) => x !== undefined && x !== null).reduce((p, x) => p * (1 + x), 1) - 1; const sum = (a) => a.filter((x) => x !== undefined && x !== null).reduce((p, x) => p + x, 0);
    const years = [...byYear.keys()].sort().reverse();
    const monthly = (kind) => tbl(`<th></th>${MES.map((m) => `<th class="num">${m}</th>`).join('')}<th class="num">Total</th>`, years.map((y) => { const e = byYear.get(y); const cell = (v, f) => (v === undefined || v === null ? '<td class="num muted">-</td>' : `<td class="num ${cl(v)}">${f(v)}</td>`);
      return kind === 'ret' ? `<tr><th scope="row">${y}</th>${MES.map((_, i) => cell(e.ret[i], p2)).join('')}<td class="num"><b class="${cl(prod(e.ret))}">${p2(prod(e.ret))}</b></td></tr><tr class="sub"><th scope="row">CDI</th>${MES.map((_, i) => `<td class="num muted">${e.cdi[i] === undefined ? '-' : p2(e.cdi[i])}</td>`).join('')}<td class="num muted"><b>${p2(prod(e.cdi))}</b></td></tr>` : `<tr><th scope="row">${y}</th>${MES.map((_, i) => cell(e.money[i], sg)).join('')}<td class="num"><b class="${cl(sum(e.money))}">${sg(sum(e.money))}</b></td></tr>`; }).join(''));
    // eventos no período
    let aportes = 0, resgates = 0, prov = 0; for (let i = i0 + 1; i <= i1; i++) { if (c.fl[i] > 0) aportes += c.fl[i]; else resgates += -c.fl[i]; prov += c.inc[i]; }
    const evRows = [['Aportes', aportes], ['Resgates', resgates], ['Rendimentos', prov]].filter(([, v]) => v > 0);
    // drawdown no período
    let peak = -Infinity; const dd = rows.map((i) => { const v = c.idx[i]; peak = Math.max(peak, v, i0 >= 0 ? c.idx[i0] : v); return { label: W.dt(c.d[i]).slice(0, 5), long: W.dt(c.d[i]), a: v / peak - 1 }; });
    const wkDays = [['3M', 63], ['6M', 126], ['12M', 252], ['24M', 504]];
    ctx.after = () => {
      W.cur = ctx;
      const hit = (r, a, b) => ({ money: null, pct: (1 + r[b].a) / (1 + r[a].a) - 1, from: r[a].long, to: r[b].long });
      if (rebased.length > 1) W.lineChart(document.getElementById('d-rent'), rebased, { names: ['Portfólio', 'CDI'], name: 'Rentabilidade acumulada', format: (v) => W.pct(v, 2), axisFormat: AX, onRange: (a, b) => { const r = hit(rebased, a, b); return { ...r, money: r.pct }; } }); else document.getElementById('d-rent').innerHTML = empty('Período curto demais para o gráfico.');
      const evo = rows.map((i) => ({ label: W.dt(c.d[i]).slice(0, 5), long: W.dt(c.d[i]), a: c.inv[i], b: c.cumFl[i] }));
      if (evo.length > 1) W.lineChart(document.getElementById('d-evo'), evo, { names: ['Portfólio', 'Valor investido'], name: 'Evolução patrimonial' });
      if (dd.length > 1) W.lineChart(document.getElementById('d-dd'), dd, { names: ['Drawdown'], name: 'Drawdown', format: (v) => W.pct(v, 2), axisFormat: AX });
      const drawVol = (w) => { const vv = rollVol(c, w, i0 + 1, i1); const vr = rows.map((i, j) => ({ label: W.dt(c.d[i]).slice(0, 5), long: W.dt(c.d[i]), a: vv[j] === null ? 0 : vv[j] })); if (vr.length > 1) W.lineChart(document.getElementById('d-vol'), vr, { names: ['Volatilidade anualizada'], name: 'Volatilidade', format: (v) => W.pct(v, 2), axisFormat: AX }); };
      drawVol(252);
      document.querySelectorAll('[data-vol]').forEach((b) => b.addEventListener('click', () => { document.querySelectorAll('[data-vol]').forEach((x) => x.classList.toggle('active', x === b)); drawVol(Number(b.dataset.vol)); }));
      document.querySelectorAll('[data-mt]').forEach((b) => b.addEventListener('click', () => { document.querySelectorAll('[data-mt]').forEach((x) => x.classList.toggle('active', x === b)); document.getElementById('m-ret').hidden = b.dataset.mt !== 'ret'; document.getElementById('m-money').hidden = b.dataset.mt !== 'money'; }));
      W.donut(document.getElementById('d-alloc'), allocRows.map((g) => ({ name: g.name, value: g.value })), { name: 'Alocação patrimonial' });
    };
    let cum = 0; const liqTbl = liq.buckets.filter((b) => b.count > 0);
    const liqCard = liqTbl.length ? tbl('<th>Período</th><th class="num">Valor</th><th class="num">%</th><th class="num hide-sm">Valor acumulado</th><th class="num hide-sm">% acum.</th>', liqTbl.map((b) => { cum += Number(b.value); return `<tr><td>${esc(b.label)}</td><td class="num">${W.brl(b.value)}</td><td class="num">${p2(b.share, 2)}</td><td class="num hide-sm">${W.brl(cum)}</td><td class="num hide-sm">${p2(b.cumulative, 2)}</td></tr>`; }).join('')) : empty('Sem dados de liquidez.');
    const head = `<div class="dash-top"><div><div class="dash-name">${esc(ctx.w.name)}</div><div class="muted small">Início do portfólio: ${W.dt(first)}</div></div>
      <div class="dash-kpi"><span class="muted small">Patrimônio em ${W.dt(per.to)}</span><b>${W.brl(nw.total)}</b></div>
      <div class="dash-kpi"><span class="muted small">Resultado (${per.all ? 'desde o início' : `${Math.round((new Date(per.to) - new Date(per.from)) / 864e5) + 1} dias`})</span><b class="${cl(cur.money)}">${sg(cur.money)} <span class="pill ${cl(cur.ret)}">${p2(cur.ret)} ${cur.ret >= 0 ? '↑' : '↓'}</span></b></div></div>`;
    const evoPer = `<div data-evo-range class="dash-range"><div class="field"><label>Período</label>${W.rangeHtml(per.all ? '' : from, per.all ? '' : per.to, [3, 6, 12, 24])}</div></div>`;
    return `${W.pageHead('Patrimônio', '', actions)}${evoPer}${head}
      <div class="dash-grid">
        ${card('Rentabilidade', '<div id="d-rent"></div>', 'span-7')}
        ${card('Alocação patrimonial', `<div class="dash-alloc"><div id="d-alloc"></div>${tbl('<th>Classe de ativo</th><th class="num">Valor atualizado</th><th class="num">Rentabilidade</th>', allocRows.map((g) => `<tr><td>${esc(g.name)}</td><td class="num">${W.brl(g.value)}</td><td class="num ${cl(g.twr)}">${p2(g.twr)}</td></tr>`).join(''))}</div>`, 'span-5')}
        ${card('Resumo do portfólio', resumo, 'span-7')}
        ${card('Evolução patrimonial (R$)', '<div id="d-evo"></div>', 'span-5')}
        ${card('Resultado financeiro e rentabilidade', `<div id="m-ret">${monthly('ret')}</div><div id="m-money" hidden>${monthly('money')}</div>`, 'span-12', '<div class="tabs"><button class="active" data-mt="ret">Rentabilidade</button><button data-mt="money">Retorno (R$)</button></div>')}
        ${card('Eventos', evRows.length ? tbl('<th>Evento</th><th class="num">Valor</th>', evRows.map(([l, v]) => `<tr><td>${l}</td><td class="num">${W.brl(v)}</td></tr>`).join('')) : empty('Nenhum evento no período.'), 'span-4')}
        ${card('Volatilidade', '<div id="d-vol"></div>', 'span-8', `<div class="tabs" aria-label="Janela de cálculo">${wkDays.map(([l, n]) => `<button data-vol="${n}"${n === 252 ? ' class="active"' : ''}>${l}</button>`).join('')}</div>`)}
        ${card('Drawdown', '<div id="d-dd"></div>', 'span-7')}
        ${card('Liquidez', liqCard, 'span-5')}
        ${card('Alocação por custodiante', cust.length ? tbl('<th>Custodiante</th><th class="num">Total</th><th class="num">% carteira</th><th class="num">Rent. %</th>', cust.map((g) => `<tr><td class="cell-name" title="${esc(g.name)}">${esc(g.name)}</td><td class="num">${W.brl(g.value)}</td><td class="num">${totalPos > 0 ? p2(g.value / totalPos, 2) : '—'}</td><td class="num ${cl(g.twr)}">${p2(g.twr)}</td></tr>`).join(''), `<tr><td><b>Total</b></td><td class="num"><b>${W.brl(totalPos)}</b></td><td class="num"><b>100%</b></td><td class="num"><b class="${cl(cur.ret)}">${p2(cur.ret)}</b></td></tr>`) : empty('Sem posições.'), 'span-12')}
      </div>`;
  });
})();
