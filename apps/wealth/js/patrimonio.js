/* Lottus Wealth — Patrimônio: visão geral que liga as duas partes (Investimentos e Gastos/contas):
   patrimônio líquido, evolução, composição, liquidez imediata e o resumo de cada parte com atalho para o detalhe. */
(function () {
  'use strict';
  const { esc, ico } = W;
  const empty = (t) => `<div class="empty">${esc(t)}</div>`;
  const classOf = (k) => ({ acao: 'Renda Variável', fii: 'Renda Variável', etf: 'Renda Variável', bdr: 'Renda Variável', tesouro: 'Renda Fixa', rf_pos: 'Renda Fixa', rf_pre: 'Renda Fixa', rf_ipca: 'Renda Fixa', fundo: 'Fundos', cripto: 'Criptoativos' }[k] || 'Outros ativos');
  const cl = (v) => (v === null || v === undefined || !isFinite(v) ? '' : W.cls(v));
  const pc = (v, d = 2) => (v === null || v === undefined || !isFinite(v) ? '—' : W.pct(v, d));
  const link = (href, txt) => `<a class="card-link" href="#${href}">${txt} <span aria-hidden="true">→</span></a>`;
  const card = (title, body, cls = '', extra = '') => `<section class="card dash-card ${cls}"><div class="card-head"><h2>${title}</h2>${extra}</div>${body}</section>`;
  const mini = (l, v, c = '', sub = '') => `<div class="mini"><span class="muted small">${l}</span><b class="${c}">${v}</b>${sub ? `<span class="muted small">${sub}</span>` : ''}</div>`;

  W.route('/w/:id/patrimonio', async (ctx) => {
    const id = ctx.w.id; const mode = W.viewMode(ctx); const I = W.inv; const per = I.periodOf(ctx);
    const [nw, rg, pos, liq, sp] = await Promise.all([W.rpc('w_networth', { p_wallet: id, p_mode: mode }), W.rpc('w_equity_range', { p_wallet: id, p_from: per.from, p_to: per.to, p_mode: mode }), W.rpc('w_positions', { p_wallet: id, p_mode: mode, p_perf: false }), W.rpc('w_liquidity', { p_wallet: id, p_mode: mode }), W.rpc('w_spend_summary', { p_wallet: id, p_from: per.from, p_to: per.to })]);
    const eq = rg.points; const lab = (x) => (rg.step === 'mes' ? W.monthLabel(x.date) : W.dt(x.date).slice(0, rg.step === 'dia' ? 5 : 8));
    const tin = sp.by_month.reduce((a, m) => a + Number(m.receitas || 0), 0), tout = sp.by_month.reduce((a, m) => a + Number(m.despesas || 0), 0);
    const first = eq[0], last = eq[eq.length - 1]; const dTotal = first && last ? Number(last.total) - Number(first.total) : null; const pTotal = first && Number(first.total) ? dTotal / Math.abs(Number(first.total)) : null;
    const byClass = new Map(); for (const p of pos) { const k = classOf(p.kind); byClass.set(k, (byClass.get(k) || 0) + Number(p.value)); }
    const comp = [...byClass.entries()].map(([name, value]) => ({ name, value })); if (Number(nw.contas) > 0) comp.push({ name: 'Contas bancárias', value: Number(nw.contas) });
    const top = [...pos].sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 5); const totInv = pos.reduce((s, p) => s + Number(p.value), 0);
    const diaria = (liq.buckets.find((b) => b.key === 'diaria') || {}).value || 0; const venc = (liq.buckets.find((b) => b.key === 'vencido') || {}).value || 0; const d30 = (liq.buckets.find((b) => b.key === 'd30') || {}).value || 0;
    const imediata = Number(nw.contas) + Number(diaria);
    ctx.after = () => {
      W.cur = ctx;
      const rows = eq.map((p) => ({ label: lab(p), long: W.dt(p.date), t: Number(p.total), i: Number(p.investimentos), c: Number(p.contas) }));
      const draw = (m) => W.lineChart(document.getElementById('ch-pat'), m === 'total' ? rows.map((r) => ({ label: r.label, long: r.long, a: r.t })) : rows.map((r) => ({ label: r.label, long: r.long, a: r.i, b: r.c })), { names: m === 'total' ? ['Patrimônio líquido'] : ['Investimentos', 'Contas bancárias'], name: 'Evolução do patrimônio', onRange: m === 'total' ? (i0, i1) => { const a = rows[i0], b = rows[i1]; if (!a || !b) return null; return { money: b.t - a.t, pct: a.t ? (b.t - a.t) / Math.abs(a.t) : null, from: a.long, to: b.long }; } : undefined });
      if (rows.length > 1) draw('total'); else document.getElementById('ch-pat').innerHTML = empty('Período curto demais para o gráfico.');
      document.querySelectorAll('[data-pchart]').forEach((b) => b.addEventListener('click', () => { document.querySelectorAll('[data-pchart]').forEach((x) => x.classList.toggle('active', x === b)); document.getElementById('lg-parts').hidden = b.dataset.pchart !== 'parts'; if (rows.length > 1) draw(b.dataset.pchart); }));
      W.donut(document.getElementById('ch-comp'), comp, { name: 'Composição do patrimônio' });
      if (sp.by_month.length) W.flowChart(document.getElementById('ch-flow'), sp.by_month.map((m) => ({ label: W.monthLabel(m.month), long: W.monthLabel(m.month), in: m.receitas, out: m.despesas }))); else document.getElementById('ch-flow').innerHTML = empty('Sem lançamentos no período.');
    };
    const actions = `${W.modeBar(mode)}<button class="btn secondary" data-act="reports-open">${ico('file')} Relatórios</button>${ctx.canWrite ? `<a class="btn" href="#/w/${id}/transacoes?new=1">${ico('plus')} Nova transação</a>` : ''}`;
    return `${W.pageHead('Patrimônio', '', actions)}
      <div data-evo-range class="dash-range"><div class="field"><label>Período</label>${W.rangeHtml(per.all ? '' : per.from, per.all ? '' : per.to, [3, 6, 12, 24, 60])}</div></div>
      <div class="kpis">${I.kpi('Patrimônio líquido', W.brl(nw.total), dTotal === null ? '' : `${W.sign(dTotal, W.brl)} no período`)}${I.kpi('Investimentos', W.brl(nw.investimentos), I.resultSub(nw))}${I.kpi('Contas bancárias', W.brl(nw.contas))}${I.kpi('Liquidez imediata', W.brl(imediata))}</div>
      <div class="dash-grid">
        ${card('Evolução do patrimônio', `<div class="legend-bench" id="lg-parts" hidden><span><i></i>Investimentos</span><span><i class="alt"></i>Contas bancárias</span></div><div id="ch-pat"></div>`, 'span-8', '<div class="tabs"><button class="active" data-pchart="total">Total</button><button data-pchart="parts">Por parte</button></div>')}
        ${card('Composição', '<div id="ch-comp"></div>', 'span-4')}
        ${card('Investimentos', `<div class="minis">${mini('Valor atual', W.brl(nw.investimentos))}${mini('Aportes líquidos', W.brl(nw.aportes))}${mini('Resultado', W.sign(nw.resultado, W.brl), cl(nw.resultado), nw.rentabilidade === null ? '' : W.sign(nw.rentabilidade, (v) => W.pct(v, 2)))}</div>
          ${top.length ? `<div class="table-wrap"><table class="tight fit"><thead><tr><th>Maiores posições</th><th class="num">Valor</th><th class="num">Peso</th></tr></thead><tbody>${top.map((p) => `<tr class="link" data-href="#/w/${id}/ativo/${esc(p.asset_id)}"><td class="cell-name" title="${esc(p.name)}"><b>${esc(p.ticker || p.name)}</b></td><td class="num">${W.brl(p.value)}</td><td class="num">${totInv > 0 ? pc(Number(p.value) / totInv, 1) : '—'}</td></tr>`).join('')}</tbody></table></div>` : empty('Nenhum investimento registrado.')}
          <div class="card-foot">${link(`/w/${id}/investimentos`, 'Abrir dashboard de investimentos')}${link(`/w/${id}/posicao`, 'Posição')}</div>`, 'span-6')}
        ${card('Gastos', `<div class="minis">${mini('Receitas', W.brl(tin), 'pos')}${mini('Despesas', W.brl(tout))}${mini('Saldo do período', W.sign(tin - tout, W.brl), cl(tin - tout))}</div><div id="ch-flow"></div>
          ${sp.unclassified ? `<a class="banner info" href="#/w/${id}/gastos/transacoes" style="text-decoration:none"><div class="grow"><b>${sp.unclassified}</b> lançamentos sem classificação. Classificar →</div></a>` : ''}
          <div class="card-foot">${link(`/w/${id}/gastos`, 'Abrir gastos')}${link(`/w/${id}/gastos/transacoes`, 'Lançamentos')}</div>`, 'span-6')}
        ${card('Liquidez do patrimônio', `<div class="table-wrap"><table class="tight fit dash-t"><thead><tr><th>Disponibilidade</th><th class="num">Valor</th><th class="num">% do patrimônio</th></tr></thead><tbody>
          ${[['Contas bancárias', Number(nw.contas)], ['Investimentos com liquidez diária', Number(diaria)], ['Vencendo em até 30 dias', Number(d30)], ['Vencido, a resgatar', Number(venc)]].filter(([, v]) => v > 0).map(([l, v]) => `<tr><td>${l}</td><td class="num">${W.brl(v)}</td><td class="num">${Number(nw.total) > 0 ? pc(v / Number(nw.total), 1) : '—'}</td></tr>`).join('') || `<tr><td colspan="3">${empty('Sem dados de liquidez.')}</td></tr>`}</tbody></table></div><div class="card-foot">${link(`/w/${id}/investimentos`, 'Ver vencimentos completos')}</div>`, 'span-12')}
      </div>`;
  });
})();
