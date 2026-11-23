/* Lottus Wealth — Patrimônio, Bens e dívidas e Investimentos (posição, transações, ativos personalizados, detalhe, conexões). */
(function () {
  'use strict';
  const { esc, ico, tag } = W;
  const KIND = { acao: 'Ação', fii: 'FII', etf: 'ETF', bdr: 'BDR', fundo: 'Fundo', tesouro: 'Tesouro Direto', rf_pre: 'Renda fixa pré', rf_pos: 'Renda fixa pós (CDI)', rf_ipca: 'Renda fixa IPCA+', cripto: 'Cripto', imovel: 'Imóvel', veiculo: 'Veículo', outro: 'Outro' };
  const TX = { compra: 'Compra', venda: 'Venda', provento: 'Provento' };
  W.ASSET_KIND = KIND;
  const empty = (t, a = '') => `<div class="empty">${esc(t)}${a ? `<div style="margin-top:12px">${a}</div>` : ''}</div>`;
  const clsDelta = (v) => `<span class="${W.cls(v)}">${v === null || v === undefined ? '—' : W.sign(v, W.brl)}</span>`;

  /* ================= Patrimônio ================= */
  const BM = { CDI: 'CDI', IPCA: 'IPCA', nenhum: '' };
  // período da evolução: ?de=&ate= (calendário); padrão: últimos 12 meses; "Desde o início" = de=inicio
  const periodOf = (ctx) => {
    const de = ctx.q.get('de'), ate = ctx.q.get('ate'); const today = W.ymd();
    const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && W.parseDate(s.split('-').reverse().join('/')) === s && s <= today;
    // endereço com data impossível, futura ou invertida volta ao padrão (últimos 12 meses, como o atalho do calendário)
    let to = ok(ate) ? ate : today; let from = ok(de) ? de : null; if (from && from > to) { from = null; to = today; }
    const n = new Date(to + 'T00:00:00'); const d12 = W.ymd(new Date(n.getFullYear(), n.getMonth() - 11, 1));
    return { from: de === 'inicio' ? '2000-01-01' : from || d12, to, all: de === 'inicio' }; };
  const rangeLabel = (r) => (r.step === 'mes' ? (x) => W.monthLabel(x.date) : (x) => W.dt(x.date).slice(0, r.step === 'dia' ? 5 : 8));
  const periodBar = (ctx, per) => `<div class="range-bar"><div class="field"><label>Período</label>${W.rangeHtml(per.all ? '' : per.from, per.all ? '' : per.to, [3, 6, 12, 24, 60])}</div></div>`;
  // ao escolher no calendário, o período vai para o endereço (F5 e Voltar mantêm)
  document.addEventListener('change', (e) => {
    const box = e.target.closest('[data-evo-range] [data-range]'); if (!box || e.target.name !== 'to') return;
    const f = box.querySelector('[name=from]').value, to = box.querySelector('[name=to]').value;
    const [path, qs] = location.hash.slice(1).split('?'); const q = new URLSearchParams(qs || ''); q.delete('m');
    if (!f && !to) { q.set('de', 'inicio'); q.delete('ate'); } else { if (f) q.set('de', f); else q.delete('de'); if (to) q.set('ate', to); else q.delete('ate'); }
    location.hash = `${path}?${q}`;
  });
  // rendimento do benchmark no período, aplicado aos aportes (mesmo dinheiro, mesmas datas)
  const benchKpi = (eq, bm) => { const l = eq[eq.length - 1]; if (!bm || !l || l.benchmark === null || l.benchmark === undefined || !(Number(l.aportes) > 0)) return null; return { val: Number(l.benchmark), diff: Number(l.investimentos) - Number(l.benchmark) }; };
  W.route('/w/:id/patrimonio', async (ctx) => {
    const id = ctx.w.id; const mode = W.viewMode(ctx); const per = periodOf(ctx);
    const [nw, rg, pos] = await Promise.all([W.rpc('w_networth', { p_wallet: id, p_mode: mode }), W.rpc('w_equity_range', { p_wallet: id, p_from: per.from, p_to: per.to, p_mode: mode }), W.rpc('w_positions', { p_wallet: id, p_mode: mode })]);
    const eq = rg.points; const lab = rangeLabel(rg);
    const bm = BM[nw.benchmark] || ''; const bk = benchKpi(eq, bm);
    const kpi = (l, v, sub, c = '') => `<div class="kpi"><div class="kpi-label">${l}</div><div class="big ${c}">${v}</div>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>`;
    ctx.after = () => {
      const rows = eq.map((p) => ({ label: lab(p), long: W.dt(p.date), a: p.total, b: p.aportes, inv: p.investimentos, c: p.benchmark }));
      const draw = (m) => W.lineChart(document.getElementById('ch-eq'), m === 'rent' ? rows.map((r) => ({ label: r.label, long: r.long, a: r.inv, b: r.b, ...(bm ? { c: r.c } : {}) })) : rows.map((r) => ({ label: r.label, long: r.long, a: r.a })), { names: m === 'rent' ? ['Investimentos', 'Aportes líquidos', `Aportes rendendo ${bm}`] : ['Patrimônio líquido'], name: 'Evolução' });
      draw('pl');
      document.querySelectorAll('[data-chart]').forEach((b) => b.addEventListener('click', () => { document.querySelectorAll('[data-chart]').forEach((x) => x.classList.toggle('active', x === b)); document.getElementById('lg-rent').hidden = b.dataset.chart !== 'rent'; draw(b.dataset.chart); }));
      const kinds = {}; pos.forEach((p) => { kinds[KIND[p.kind] || 'Outro'] = (kinds[KIND[p.kind] || 'Outro'] || 0) + Number(p.value); });
      W.donut(document.getElementById('ch-alloc'), Object.entries(kinds).map(([name, value]) => ({ name, value })), { name: 'Alocação por tipo de ativo' });
      W.donut(document.getElementById('ch-comp'), [{ name: 'Investimentos', value: nw.investimentos }, { name: 'Contas (Gastos)', value: Math.max(nw.contas, 0) }], { name: 'Composição do patrimônio' });
    };
    return `${W.pageHead('Patrimônio', 'Investimentos + saldos das contas. Imóveis, veículos e outros bens entram como ativos personalizados.', `${W.modeBar(mode)}<a class="btn secondary" href="#/w/${id}/relatorios">${ico('file')} Relatórios</a><a class="btn secondary" href="#/w/${id}/acessos">${ico('users')} Acessos</a>${ctx.canWrite ? `<a class="btn" href="#/w/${id}/transacoes?new=1">${ico('plus')} Nova transação</a>` : ''}`)}
      ${W.modeHint(mode, nw.tem_mercado)}
      <div class="kpis">${kpi('Patrimônio líquido', W.brl(nw.total), mode === 'mercado' ? 'A mercado' : 'Na curva')}${kpi('Investimentos', W.brl(nw.investimentos), `Resultado ${W.sign(nw.resultado, W.brl)}${nw.rentabilidade === null ? '' : ` (${W.sign(nw.rentabilidade, (v) => W.pct(v))})`}`)}${kpi('Contas (saldo em Gastos)', W.brl(nw.contas), '')}${bk ? kpi(`Comparado ao ${bm}`, W.sign(bk.diff, W.brl), `Os mesmos aportes rendendo ${bm} desde a data de cada um valeriam ${W.brl(bk.val)}`, W.cls(bk.diff)) : kpi('Benchmark', bm || 'Nenhum', bm ? 'Sem aportes no período' : (ctx.w.role === 'gestor' ? `<a href="#/w/${id}/config">Escolher em Configurações</a>` : 'Definido pelo gestor'))}</div>
      <div class="card" style="margin-bottom:16px" data-evo-range><div class="card-head"><h2>Evolução</h2><div class="row"><div class="tabs"><button class="active" data-chart="pl">Patrimônio</button><button data-chart="rent">Investimentos × aportes</button></div></div></div>
        ${periodBar(ctx, per)}<p class="muted small">${W.dt(rg.from)} a ${W.dt(rg.to)} · ${{ dia: 'um ponto por dia', semana: 'um ponto por semana', mes: 'um ponto por mês' }[rg.step]}, pelos P.U. de cada dia</p><div class="legend-bench" id="lg-rent" hidden><span><i></i>Investimentos</span><span><i class="alt"></i>Aportes líquidos</span>${bm ? `<span><i class="bench"></i>Aportes rendendo ${bm}</span>` : ''}</div><div id="ch-eq"></div>
        <p class="muted small">Rentabilidade simples: resultado ÷ aportes líquidos (não desconta o tempo em que cada aporte ficou investido).${bm ? ` A linha do ${bm} aplica o índice a cada aporte desde a data dele.` : ''}</p></div>
      <div class="grid-2"><div class="card"><div class="card-head"><h2>Composição</h2></div><div id="ch-comp"></div></div><div class="card"><div class="card-head"><h2>Investimentos por tipo</h2></div><div id="ch-alloc"></div></div></div>`;
  });
  // Bens e dívidas saiu na v2: o endereço antigo leva ao Patrimônio
  W.route('/w/:id/bens', async (ctx) => { W.go(`/w/${ctx.w.id}/patrimonio`); return ''; }, { wallet: true });
  const curId = () => (location.hash.match(/#\/w\/([^/?]+)/) || [])[1];
  W.curId = curId;

  /* ================= Visão geral de investimentos ================= */
  W.route('/w/:id/investimentos', async (ctx) => {
    const id = ctx.w.id; const mode = W.viewMode(ctx); const per = periodOf(ctx);
    const [nw, rg, pos] = await Promise.all([W.rpc('w_networth', { p_wallet: id, p_mode: mode }), W.rpc('w_equity_range', { p_wallet: id, p_from: per.from, p_to: per.to, p_mode: mode }), W.rpc('w_positions', { p_wallet: id, p_mode: mode })]);
    const eq = rg.points; const lab = rangeLabel(rg);
    const bm = BM[nw.benchmark] || ''; const bk = benchKpi(eq, bm);
    const kpi = (l, v, sub, c = '') => `<div class="kpi"><div class="kpi-label">${l}</div><div class="big ${c}">${v}</div>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>`;
    const top = [...pos].sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 6); const tot = pos.reduce((x, p) => x + Number(p.value), 0);
    ctx.after = () => {
      W.lineChart(document.getElementById('ch-inv'), eq.map((p) => ({ label: lab(p), long: W.dt(p.date), a: p.investimentos, b: p.aportes, ...(bm ? { c: p.benchmark } : {}) })), { names: ['Investimentos', 'Aportes líquidos', `Aportes rendendo ${bm}`], name: 'Evolução dos investimentos' });
      const kinds = {}; pos.forEach((p) => { kinds[KIND[p.kind] || 'Outro'] = (kinds[KIND[p.kind] || 'Outro'] || 0) + Number(p.value); });
      W.donut(document.getElementById('ch-alloc'), Object.entries(kinds).map(([name, value]) => ({ name, value })), { name: 'Alocação por tipo de ativo' });
    };
    return `${W.pageHead('Visão geral', 'Quanto você tem investido e como está distribuído.', `${W.modeBar(mode)}${ctx.canWrite ? `<button class="btn secondary" data-act="imp-open">Importar arquivo</button><a class="btn" href="#/w/${id}/transacoes?new=1">${ico('plus')} Nova transação</a>` : ''}`)}
      ${W.modeHint(mode, nw.tem_mercado)}
      <div class="kpis">${kpi('Valor atual', W.brl(nw.investimentos), `${pos.length} ${pos.length === 1 ? 'ativo' : 'ativos'}`)}${kpi('Aportes líquidos', W.brl(nw.aportes), 'Compras menos vendas')}${kpi('Resultado', W.sign(nw.resultado, W.brl), nw.rentabilidade === null ? 'Sem aportes registrados' : `${W.sign(nw.rentabilidade, (v) => W.pct(v))} sobre os aportes`, W.cls(nw.resultado))}${bk ? kpi(`Comparado ao ${bm}`, W.sign(bk.diff, W.brl), `Aportes rendendo ${bm} desde a data de cada um: ${W.brl(bk.val)}`, W.cls(bk.diff)) : kpi('Maior posição', top.length && tot > 0 ? W.pct(Number(top[0].value) / tot, 1) : '—', top.length ? esc(top[0].ticker || top[0].name) : 'Sem posições')}</div>
      <div class="card" style="margin-bottom:16px" data-evo-range><div class="card-head"><h2>Evolução</h2></div>${periodBar(ctx, per)}<p class="muted small">${W.dt(rg.from)} a ${W.dt(rg.to)} · ${{ dia: 'um ponto por dia', semana: 'um ponto por semana', mes: 'um ponto por mês' }[rg.step]}, pelos P.U. de cada dia</p><div class="legend-bench"><span><i></i>Investimentos</span><span><i class="alt"></i>Aportes líquidos</span>${bm ? `<span><i class="bench"></i>Aportes rendendo ${bm}</span>` : ''}</div><div id="ch-inv"></div></div>
      <div class="grid-2"><div class="card"><div class="card-head"><h2>Alocação por tipo</h2></div><div id="ch-alloc"></div></div>
        <div class="card flush"><div class="card-head" style="padding:18px 24px 0"><h2>Maiores posições</h2><a href="#/w/${id}/posicao" class="muted small">Ver todas</a></div>${top.length ? `<div class="table-wrap"><table class="tight"><thead><tr><th>Ativo</th><th class="num">Valor</th><th class="num">Peso</th></tr></thead><tbody>${top.map((p) => `<tr class="link" data-href="#/w/${id}/ativo/${esc(p.asset_id)}"><td><b>${esc(p.ticker || p.name)}</b></td><td class="num">${W.brl(p.value)}</td><td class="num">${tot > 0 ? W.pct(Number(p.value) / tot, 1) : '—'}</td></tr>`).join('')}</tbody></table></div>` : empty('Nenhum investimento registrado.')}</div></div>`;
  });

  /* ================= Posição ================= */
  W.route('/w/:id/posicao', async (ctx) => {
    const id = ctx.w.id; const mode = W.viewMode(ctx); const pos = await W.rpc('w_positions', { p_wallet: id, p_mode: mode });
    const hasMkt = pos.some((p) => p.pu_mercado !== null); const merc = mode === 'mercado';
    const draw = () => {
      const tot = pos.reduce((s, p) => s + Number(merc && p.value_mercado !== null ? p.value_mercado : p.value), 0), cost = pos.reduce((s, p) => s + Number(p.cost), 0);
      document.getElementById('pos-body').innerHTML = pos.length ? pos.map((p) => { const v = merc && p.value_mercado !== null ? p.value_mercado : p.value; const r = Number(v) - Number(p.cost); return `<tr class="link" data-href="#/w/${id}/ativo/${esc(p.asset_id)}"><td><b>${esc(p.ticker || p.name)}</b>${p.ticker ? `<div class="muted small">${esc(p.name)}</div>` : ''}</td><td>${esc(KIND[p.kind] || '')}${p.maturity ? `<div class="muted small">vence ${W.dt(p.maturity)}</div>` : ''}</td><td class="num">${W.qty(p.qty)}</td><td class="num">${W.num(p.avg_pu, 4)}</td><td class="num">${W.num(merc && p.pu_mercado !== null ? p.pu_mercado : p.pu, 4)}<div class="muted small">${W.dt(p.pu_date)}</div></td><td class="num"><b>${W.brl(v)}</b></td><td class="num">${clsDelta(r)}<div class="small ${W.cls(r)}">${p.cost > 0 ? W.sign(r / p.cost, (x) => W.pct(x)) : ''}</div></td><td class="num">${tot > 0 ? W.pct(Number(v) / tot, 1) : '—'}</td></tr>`; }).join('') : `<tr><td colspan="8">${empty('Nenhum investimento registrado.')}</td></tr>`;
      document.getElementById('pos-foot').innerHTML = pos.length ? `<tr><td colspan="5"><b>Total</b></td><td class="num"><b>${W.brl(tot)}</b></td><td class="num">${clsDelta(tot - cost)}</td><td class="num">100%</td></tr>` : '';
    };
    ctx.after = () => { draw(); document.getElementById('pos-body').addEventListener('click', (e) => { const r = e.target.closest('tr[data-href]'); if (r) location.hash = r.dataset.href.slice(1); }); };
    return `${W.pageHead('Posição', 'Quanto você tem em cada ativo hoje.', `${W.modeBar(mode)}${ctx.canWrite ? `<button class="btn secondary" data-act="imp-open">Importar arquivo</button><a class="btn" href="#/w/${id}/transacoes?new=1">${ico('plus')} Nova transação</a>` : ''}`)}
      ${W.modeHint(mode, hasMkt)}
      <div class="card flush"><div class="table-wrap"><table><thead><tr><th>Ativo</th><th>Tipo</th><th class="num">Quantidade</th><th class="num">P.U. médio</th><th class="num">P.U. atual</th><th class="num">Valor</th><th class="num">Resultado</th><th class="num">Peso</th></tr></thead><tbody id="pos-body"></tbody><tfoot id="pos-foot"></tfoot></table></div></div>`;
  });
  document.addEventListener('click', (e) => { const r = e.target.closest('tr.link[data-href]'); if (r && !e.target.closest('a,button')) location.hash = r.dataset.href.slice(1); });

  /* ================= Transações ================= */
  const txFilter = {};
  W.route('/w/:id/transacoes', async (ctx) => {
    const id = ctx.w.id; txFilter.page = 1; const f = (txFilter[id] = txFilter[id] || {});
    const [assets, imps] = await Promise.all([W.rpc('w_tx_assets', { p_wallet: id }), W.rpc('w_imports_list', { p_wallet: id })]); W.impList = imps.filter((i) => i.kind === 'investimentos');
    ctx.after = async () => { W.cur = ctx; await loadTx(ctx); if (ctx.q.get('new')) openTx(ctx, null); };
    return `${W.pageHead('Transações', 'Compras, vendas e proventos. Cada linha altera a posição.', ctx.canWrite ? `<button class="btn secondary" data-act="imp-open">Importar arquivo</button><button class="btn" data-act="tx-new">${ico('plus')} Nova transação</button>` : '')}
      <form class="filters" data-live="tx"><div class="field"><label>Ativo</label><select class="input" name="asset" data-search>${W.opts(assets.map((a) => [a.id, a.ticker || a.name]), f.asset, 'Todos')}</select></div>
        <div class="field"><label>Tipo</label><select class="input" name="kind">${W.opts(Object.entries(TX), f.kind, 'Todos')}</select></div><div class="field"><label>Período</label>${W.rangeHtml(f.from, f.to)}</div></form>
      <div class="card flush"><div class="table-wrap"><table class="tight"><thead><tr><th>Data</th><th>Tipo</th><th>Ativo</th><th class="num">Quantidade</th><th class="num">P.U.</th><th class="num">Total</th><th>Custodiante</th><th></th></tr></thead><tbody id="tx-body"></tbody></table></div><div class="pager-bar" id="tx-pager"></div></div>
      ${W.impList.length ? `<div class="card flush" style="margin-top:16px"><div class="card-head" style="padding:18px 24px 0"><h2>Importações anteriores</h2></div><div class="table-wrap"><table class="tight"><thead><tr><th>Data</th><th>Arquivo</th><th class="num">Linhas</th><th class="num">Novas</th><th class="num">Repetidas</th></tr></thead><tbody>${W.impList.map((i) => `<tr><td>${W.dtm(i.at)}</td><td>${esc(i.filename || '—')}</td><td class="num">${i.total}</td><td class="num">${i.new}</td><td class="num">${i.dup}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  });
  async function loadTx(ctx) {
    const id = ctx.w.id; const f = txFilter[id] || {}; const r = await W.rpc('w_tx_list', { p_wallet: id, p_filters: { asset: f.asset || '', kind: f.kind || '', from: f.from || '', to: f.to || '' }, p_page: txFilter.page || 1 });
    W.txRows = r.rows;
    document.getElementById('tx-body').innerHTML = r.rows.length ? r.rows.map((t) => `<tr><td>${W.dt(t.date)}</td><td>${tag(TX[t.kind], t.kind === 'compra' ? 'success' : t.kind === 'venda' ? 'brand' : '')}</td><td><a href="#/w/${id}/ativo/${esc(t.asset_id)}">${esc(t.ticker || t.asset)}</a>${t.source !== 'manual' ? `<div class="muted small">via ${esc(t.source)}</div>` : ''}</td><td class="num">${W.qty(t.qty)}</td><td class="num">${W.num(t.unit_price, 4)}</td><td class="num">${W.brl(t.total)}</td><td>${esc(t.custodian || '—')}</td><td class="actions">${ctx.canWrite ? `<button class="btn ghost sm" data-act="tx-edit" data-id="${esc(t.id)}" aria-label="Editar">${ico('pencil')}</button><button class="btn ghost sm" data-act="tx-del" data-id="${esc(t.id)}" aria-label="Excluir">${ico('trash')}</button>` : ''}</td></tr>`).join('') : `<tr><td colspan="8">${empty('Nenhuma transação encontrada.')}</td></tr>`;
    const pages = Math.max(1, Math.ceil(r.total / 50)), pg = r.page;
    document.getElementById('tx-pager').innerHTML = `<span>${r.total} transações</span><div class="pager"><button class="btn secondary sm" data-act="tx-page" aria-label="Página anterior" data-n="${pg - 1}"${pg <= 1 ? ' disabled' : ''}>${ico('left')}</button><span>${pg} / ${pages}</span><button class="btn secondary sm" data-act="tx-page" aria-label="Próxima página" data-n="${pg + 1}"${pg >= pages ? ' disabled' : ''}>${ico('right')}</button></div>`;
  }
  W.live.tx = (form) => { const id = curId(); const v = W.form(form); txFilter[id] = { asset: v.asset, kind: v.kind, from: v.from, to: v.to }; txFilter.page = 1; loadTx(W.cur).catch(W.fail); };
  W.acts['tx-page'] = (el) => { txFilter.page = Number(el.dataset.n); loadTx(W.cur).catch(W.fail); };
  W.acts['tx-new'] = () => openTx(W.cur, null);
  W.acts['imp-open'] = () => {
    const id = curId();
    W.modal({ title: 'Importar arquivo', wide: true, body: '<p class="muted small">Arraste aqui o CSV com todas as suas posições (ativo, quantidade e preço médio) ou o extrato de negociação da corretora. Você confere as colunas antes de importar; linhas repetidas não entram duas vezes.</p><div id="imp-host" style="margin-top:14px"></div>' });
    W.importUI(document.getElementById('imp-host'), { mode: 'invest', label: 'Arraste o CSV de posições aqui', onImport: async (rows, name) => { const r = await W.rpc('w_tx_import', { p_wallet: id, p_filename: name, p_rows: rows }); return `<p><b>${r.new}</b> lançamentos novos · ${r.duplicates} já existiam · ${r.invalid} inválidos.</p><button class="btn" data-act="imp-done">Concluir</button>`; } });
  };
  W.acts['imp-done'] = () => { W.closeModal(); W.refresh(); };
  W.acts['tx-edit'] = (el) => openTx(W.cur, W.txRows.find((t) => t.id === el.dataset.id));
  W.acts['tx-del'] = async (el) => { if (!(await W.confirm('Excluir transação?', 'A posição será recalculada.', 'Excluir', true))) return; await W.rpc('w_tx_delete', { p_wallet: curId(), p_id: el.dataset.id }); W.toast('Transação excluída'); loadTx(W.cur); };
  async function openTx(ctx, t) {
    W.modal({ title: t ? 'Editar transação' : 'Nova transação', body: `<form class="stack" data-form="tx-save"><input type="hidden" name="id" value="${esc(t ? t.id : '')}">
      <div class="form-grid"><div class="field"><label>Tipo</label><select class="input" name="kind">${W.opts(Object.entries(TX), t ? t.kind : 'compra')}</select></div><div class="field"><label>Data</label><input class="input" name="date" data-mask="date" required max="${W.ymd()}" value="${esc(t ? t.date : W.ymd())}"></div>
      <div class="field full"><label>Ativo</label><div class="combo" data-combo="asset"><input class="input" name="asset_q" type="text" required autocomplete="off" placeholder="Digite o nome ou o ticker, ex.: PETR4" value="${esc(t ? `${t.ticker ? t.ticker + ' · ' : ''}${t.asset}` : '')}"><input type="hidden" name="asset_id" value="${esc(t ? t.asset_id : '')}"><div class="combo-list" hidden></div></div><div class="help" id="pu-hint">Não achou? <a href="#" data-act="asset-from-tx">Cadastre um ativo</a></div></div>
      <div class="field"><label>Quantidade</label><input class="input" name="qty" inputmode="decimal" required value="${t ? esc(W.qty(t.qty)) : ''}"></div><div class="field"><label>P.U. (R$)</label><input class="input" name="unit_price" inputmode="decimal" required value="${t ? esc(W.num(t.unit_price, 4)) : ''}"></div><div class="field full pu-day" id="pu-day" aria-live="polite"></div>
      <div class="field full"><label>Custodiante (opcional)</label><div class="combo" data-combo="cust"><input class="input" name="custodian" type="text" autocomplete="off" value="${esc(t ? t.custodian || '' : '')}" placeholder="Digite para buscar a corretora ou DTVM"><div class="combo-list" hidden></div></div></div></div>
      <div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>` });
    const form = document.querySelector('form[data-form=tx-save]'), ah = form.querySelector('[data-combo=asset]');
    const puIn = form.querySelector('input[name=unit_price]'); let puTouched = !!t; puIn.addEventListener('input', () => { puTouched = true; });
    ah.__onType = () => { form.querySelector('input[name=asset_id]').value = ''; };
    W.combo(ah, { fetch: (q) => W.rpc('w_asset_search', { p_wallet: ctx.w.id, p_q: q }), label: (a) => `${a.ticker ? a.ticker + ' · ' : ''}${a.name}`, sub: (a) => (a.last_pu !== null && a.last_pu !== undefined ? `R$ ${W.num(a.last_pu, 4)}` : KIND[a.kind] || ''),
      onPick: (a) => { form.querySelector('input[name=asset_id]').value = a.id; document.getElementById('pu-hint').textContent = ''; puDay(); } });
    // P.U. do ativo no dia escolhido no calendário (busca na fonte se o banco não tiver)
    const dIn = form.querySelector('input[name=date]'); let puSeq = 0, puTm;
    const SRC = { b3_cotahist: 'B3', cvm_informe_diario: 'CVM', tesouro_transparente: 'Tesouro Direto', curva: 'calculado pela curva', manual: 'informado', mercado_bitcoin: 'Mercado Bitcoin', anbima: 'ANBIMA', exemplo: 'exemplo' };
    const show = (r, iso) => {
      const box = document.getElementById('pu-day'); if (!box) return;
      if (!r || !r.found) { if (!puTouched) puIn.value = ''; box.innerHTML = `<div class="pu-box muted small">Sem P.U. registrado para ${W.dt(iso)}${r && r.valuation === 'manual' ? ' (ativo de valorização manual)' : ''}. Informe o P.U. da operação.</div>`; return; }
      const same = r.date === iso; const val = W.num(r.pu, 4);
      box.innerHTML = `<div class="pu-box"><span>P.U. em <b>${W.dt(r.date)}</b>: <b>R$ ${esc(val)}</b> <span class="muted small">(${esc(SRC[r.source] || r.source)}${same ? '' : `; último antes de ${W.dt(iso)}`})</span></span><button type="button" class="btn secondary sm" data-act="pu-use" data-pu="${esc(val)}">Usar este P.U.</button></div>`;
      if (!puTouched || !puIn.value) { puIn.value = val; puTouched = false; }
    };
    const puDay = () => {
      clearTimeout(puTm); puTm = setTimeout(async () => {
        const id = form.querySelector('input[name=asset_id]').value; const iso = W.parseDate(dIn.value); const box = document.getElementById('pu-day');
        if (!box) return;
        if (!id || !iso || iso > W.ymd()) { box.innerHTML = ''; return; }
        const n = ++puSeq; box.innerHTML = '<div class="pu-box muted small">Buscando o P.U. do dia…</div>';
        try {
          let r = await W.rpc('w_pu_at', { p_wallet: ctx.w.id, p_asset: id, p_date: iso });
          if (n !== puSeq) return;
          if ((!r.found || !r.exact) && r.valuation !== 'manual') { const f = await W.fn('wealth-pu?action=pu_at', { wallet: ctx.w.id, asset: id, date: iso }); if (n !== puSeq) return; if (f && f.ok) r = f; }
          show(r, iso);
        } catch (e) { if (n === puSeq && box.isConnected) box.innerHTML = ''; }
      }, 250);
    };
    dIn.addEventListener('change', puDay); dIn.addEventListener('input', () => { if (W.parseDate(dIn.value)) puDay(); });
    if (t) puDay();
    const cu = form.querySelector('[data-combo=cust]');
    W.combo(cu, { fetch: (q) => W.rpc('w_custodian_search', { p_q: q }), label: (c) => c.name, sub: (c) => ({ dtvm: 'DTVM', ctvm: 'Corretora', banco: 'Banco' }[c.kind] || ''), onPick: () => {} });
  }
  W.acts['pu-use'] = (el) => { const f = el.closest('form'); const i = f.querySelector('input[name=unit_price]'); i.value = el.dataset.pu; i.dispatchEvent(new Event('input', { bubbles: true })); W.toast('P.U. aplicado'); };
  W.forms['tx-save'] = async (f) => {
    const v = W.form(f); const qty = W.parseNum(v.qty), pu = W.parseNum(v.unit_price);
    if (!v.asset_id) throw new Error('Escolha o ativo na lista que aparece abaixo do campo.');
    if (!(qty > 0) || pu === null || pu < 0) throw new Error('Confira quantidade e P.U.');
    if (v.date && v.date > W.ymd()) throw new Error('A data não pode ser futura.');
    await W.rpc('w_tx_save', { p_wallet: curId(), p: { id: v.id, asset_id: v.asset_id, kind: v.kind, date: v.date, qty, unit_price: pu, custodian: v.custodian } });
    W.closeModal(); W.toast('Transação salva'); if (document.getElementById('tx-body')) loadTx(W.cur); else W.refresh();
  };
  W.acts['asset-from-tx'] = () => assetModal(W.cur, null);

  /* ================= Ativos personalizados ================= */
  const RATE = { rf_pre: ['Taxa pré-fixada (% a.a.)', 'PRE'], rf_pos: ['Percentual do CDI (%)', 'CDI'], rf_ipca: ['Taxa real acima do IPCA (% a.a.)', 'IPCA'] };
  const VAL = { curva: ['Pela curva', 'success'], cotacao: ['Cotação automática', 'success'], manual: ['Manual', ''] };
  const VAL_F = [['todos', 'Todos'], ['faltam', 'Faltam dados'], ['manual', 'Manuais'], ['curva', 'Pela curva'], ['cotacao', 'Por cotação']];
  W.route('/w/:id/ativos', async (ctx) => {
    const all = await W.rpc('w_assets_custom', { p_wallet: ctx.w.id }); W.assets = all;
    const f = VAL_F.some(([k]) => k === ctx.q.get('f')) ? ctx.q.get('f') : 'todos';
    const miss = (a) => (a.valuation.missing || []).length > 0;
    const list = all.filter((a) => f === 'todos' || (f === 'faltam' ? miss(a) : a.valuation.mode === f));
    const nMiss = all.filter(miss).length;
    ctx.after = () => { W.cur = ctx; const upd = () => { const n = document.querySelectorAll('input[data-pick]:checked').length; const bar = document.getElementById('bulk-bar'); if (bar) { bar.hidden = !n; bar.querySelector('b').textContent = n; } }; document.getElementById('view').addEventListener('change', (e) => { if (e.target.matches('#pick-all')) document.querySelectorAll('input[data-pick]').forEach((c) => { c.checked = e.target.checked; }); if (e.target.matches('input[data-pick],#pick-all')) upd(); }); };
    // em telas estreitas (até 1100 px) remuneração, vencimento, último P.U. e as ações vão para a célula do nome
    const acts = (a) => (ctx.canWrite ? `${a.valuation.mode === 'manual' ? `<button class="btn secondary sm" data-act="price-new" data-id="${esc(a.id)}">Atualizar valor</button>` : ''}<button class="btn ghost sm" data-act="asset-edit" data-id="${esc(a.id)}" aria-label="Editar ${esc(a.name)}">${ico('pencil')}</button>` : '');
    const row = (a) => `<tr>${ctx.canWrite ? `<td class="pick"><label><input type="checkbox" data-pick value="${esc(a.id)}" aria-label="Selecionar ${esc(a.name)}"></label></td>` : ''}<td><a href="#/w/${ctx.w.id}/ativo/${esc(a.id)}">${esc(a.name)}</a>${a.ticker ? `<div class="muted small">${esc(a.ticker)}</div>` : ''}
        <div class="muted small show-md">${esc(KIND[a.kind] || '')}${a.indexer && a.rate !== null ? ' · ' + remun(a) : ''}${a.maturity ? ' · vence ' + W.dt(a.maturity) : ''}${a.last_pu !== null ? ` · P.U. ${W.num(a.last_pu, 4)}` : ''}</div>${ctx.canWrite ? `<div class="row show-md" style="margin-top:6px">${acts(a)}</div>` : ''}</td>
      <td class="hide-md">${esc(KIND[a.kind] || '')}</td>
      <td>${tag(VAL[a.valuation.mode][0], VAL[a.valuation.mode][1])}${miss(a) ? `<div class="small warn-text">Falta: ${esc(a.valuation.missing.join(', '))}</div>` : ''}</td><td class="hide-md">${a.indexer && a.rate !== null ? remun(a) : '—'}</td><td class="hide-md">${W.dt(a.maturity)}</td>
      <td class="num">${a.qty ? W.brl(a.value) : '—'}</td><td class="num hide-md">${a.last_pu === null ? '—' : W.num(a.last_pu, 4)}<div class="muted small">${a.last_date ? W.dt(a.last_date) : ''}</div></td>
      <td class="actions hide-md">${acts(a)}</td></tr>`;
    return `${W.pageHead('Ativos personalizados', 'O que não vem pronto da bolsa: CDB, LCI, LCA, crédito privado, debêntures, participações, imóveis, veículos… e como cada um é valorizado.', ctx.canWrite ? `<button class="btn" data-act="asset-new">${ico('plus')} Novo ativo</button>` : '')}
      <div class="banner info">${ico('tags')}<div class="grow"><b>Pela curva</b>: renda fixa com indexador, taxa e data de emissão é valorizada todo dia útil. <b>Cotação automática</b>: cripto, ações e fundos com código. <b>Manual</b>: você informa o valor (imóveis, veículos, participações).</div></div>
      ${nMiss ? `<div class="banner warn">${ico('alert')}<div class="grow"><b>${nMiss} ${nMiss === 1 ? 'ativo precisa' : 'ativos precisam'} de dados</b> para serem valorizados automaticamente; até lá ficam no preço da última transação. ${ctx.canWrite ? 'Selecione-os e use <b>Editar em lote</b> (por exemplo, todos os CDBs de 100% do CDI de uma vez).' : ''}</div>${f !== 'faltam' ? `<a class="btn secondary sm" href="#/w/${ctx.w.id}/ativos?f=faltam">Ver quais</a>` : ''}</div>` : ''}
      <nav class="period" aria-label="Filtrar ativos" style="margin-bottom:12px">${VAL_F.map(([k, l]) => `<a class="${k === f ? 'active' : ''}" href="#/w/${ctx.w.id}/ativos?f=${k}"${k === f ? ' aria-current="true"' : ''}>${l}</a>`).join('')}</nav>
      ${ctx.canWrite ? `<div class="bulk-bar" id="bulk-bar" hidden><span><b>0</b> selecionados</span><button class="btn sm" data-act="asset-bulk">Editar em lote</button></div>` : ''}
      <div class="card flush">${list.length ? `<div class="table-wrap"><table class="tight fit"><thead><tr>${ctx.canWrite ? '<th class="pick"><label><input type="checkbox" id="pick-all" aria-label="Selecionar todos"></label></th>' : ''}<th>Ativo</th><th class="hide-md">Tipo</th><th>Valorização</th><th class="hide-md">Remuneração</th><th class="hide-md">Vencimento</th><th class="num">Posição</th><th class="num hide-md">Último P.U.</th><th class="hide-md"></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>` : empty(all.length ? 'Nenhum ativo neste filtro.' : 'Nenhum ativo personalizado ainda.', ctx.canWrite && !all.length ? `<button class="btn" data-act="asset-new">${ico('plus')} Novo ativo</button>` : '')}</div>`;
  });
  W.acts['asset-bulk'] = () => {
    const ids = [...document.querySelectorAll('input[data-pick]:checked')].map((c) => c.value); if (!ids.length) return;
    W.modal({ title: `Editar ${ids.length} ${ids.length === 1 ? 'ativo' : 'ativos'} em lote`, sub: 'Só os campos preenchidos mudam; os demais ficam como estão.', wide: true, body: `<form class="stack" data-form="asset-bulk"><input type="hidden" name="ids" value="${esc(ids.join(','))}">
      <div class="form-grid"><div class="field"><label for="bk-kind">Tipo</label><select class="input" id="bk-kind" name="kind">${W.opts(Object.entries(KIND), '', 'Manter')}</select></div>
        <div class="field"><label for="bk-idx">Remuneração</label><select class="input" id="bk-idx" name="indexer">${W.opts([['CDI', '% do CDI'], ['PRE', 'Pré-fixada (% a.a.)'], ['IPCA', 'IPCA + (% a.a.)']], '', 'Manter')}</select></div>
        <div class="field"><label for="bk-rate">Taxa (%)</label><input class="input" id="bk-rate" name="rate" inputmode="decimal" placeholder="Ex.: 100 (do CDI) ou 12,5 (a.a.)"></div>
        <div class="field"><label for="bk-mat">Vencimento</label><input class="input" id="bk-mat" name="maturity" data-mask="date"></div>
        <div class="field"><label for="bk-iss">Emissor</label><input class="input" id="bk-iss" name="issuer" maxlength="120"></div>
        <div class="field"><label for="bk-val">Valorização</label><select class="input" id="bk-val" name="valuation">${W.opts([['auto', 'Automática (curva ou cotação)'], ['manual', 'Manual']], '', 'Manter')}</select></div></div>
      <label class="check"><input type="checkbox" name="issue_ftx" checked> <span>Onde a data de emissão estiver em branco: usar a data da 1ª compra</span></label>
      <label class="check"><input type="checkbox" name="pu_ftx" checked> <span>Onde a data de emissão estiver em branco: P.U. de emissão = preço da 1ª compra</span></label>
      <div class="help">Valem só para renda fixa sem emissão informada (como CDBs importados de extrato); quem já tem emissão não muda.</div>
      <div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">Aplicar</button></div></form>` });
  };
  W.forms['asset-bulk'] = async (f) => {
    const v = W.form(f); const p = {}; const rateEl = f.querySelector('[name=rate]'); W.fieldError(rateEl, '');
    if (v.kind) p.kind = v.kind;
    if (v.indexer) p.indexer = v.indexer;
    if (v.rate) { const r = W.parseNum(v.rate); if (r === null || r <= 0 || r > 500) W.fieldFail(rateEl, 'Taxa entre 0 e 500%.'); p.rate = r / 100; }
    if ((p.indexer && p.rate === undefined) || (p.rate !== undefined && !p.indexer)) W.fieldFail(rateEl, 'Informe a remuneração e a taxa juntas.');
    if (v.maturity) { if (v.maturity <= '1990-01-01') W.fieldFail(f.querySelector('[name=maturity]'), 'Vencimento inválido.'); p.maturity = v.maturity; }
    if (v.issuer) p.issuer = v.issuer;
    if (v.valuation) p.custom = v.valuation === 'manual';
    if (f.querySelector('[name=issue_ftx]').checked) p.issue_from_first_tx = true;
    if (f.querySelector('[name=pu_ftx]').checked) p.pu_from_first_tx = true;
    let r; try { r = await W.rpc('w_assets_bulk_update', { p_wallet: curId(), p_ids: v.ids.split(','), p }); } catch (e) { if (e.message === W.msgOf('maturity_before_issue')) W.fieldFail(f.querySelector('[name=maturity]'), e.message); throw e; }
    W.closeModal(); W.toast(`${r.updated} ${r.updated === 1 ? 'ativo atualizado' : 'ativos atualizados'}`, p.custom === false || p.indexer ? 'Os preços pela curva entram na próxima atualização diária.' : ''); W.refresh();
  };
  const remun = (a) => (a.indexer === 'PRE' ? `${W.num(a.rate * 100)}% a.a.` : a.indexer === 'CDI' ? `${W.num(a.rate * 100)}% do CDI` : `IPCA + ${W.num(a.rate * 100)}% a.a.`);
  function assetModal(ctx, a) {
    W.modal({ title: a ? 'Editar ativo' : 'Novo ativo', body: `<form class="stack" data-form="asset-save"><input type="hidden" name="id" value="${esc(a ? a.id : '')}">
      <div class="form-grid"><div class="field full"><label>Nome</label><input class="input" name="name" required minlength="2" value="${esc(a ? a.name : '')}" placeholder="CDB Banco X 2028, Debênture Y…"></div>
      <div class="field"><label>Tipo</label><select class="input" name="kind" data-kind>${W.opts(Object.entries(KIND), a ? a.kind : 'rf_pos')}</select></div><div class="field"><label>Ticker/código (opcional)</label><input class="input" name="ticker" value="${esc(a ? a.ticker || '' : '')}"><div class="help" data-tick-help>Cripto e bolsa com código têm cotação automática.</div></div><div class="field"><label>Emissor (opcional)</label><input class="input" name="issuer" maxlength="120" value="${esc(a ? a.issuer || '' : '')}"></div>
      <div class="field" data-rate><label data-rate-l>Taxa</label><input class="input" name="rate" inputmode="decimal" value="${a && a.rate ? esc(W.num(a.rate * 100, 4)) : ''}"></div><div class="field" data-rate><label>P.U. de emissão (R$)</label><input class="input" name="pu_inicial" inputmode="decimal" value="${esc(a ? W.num(a.pu_inicial, 4) : '1.000,00')}"></div>
      <div class="field" data-rate><label>Data de emissão</label><input class="input" name="issue_date" data-mask="date" value="${esc(a ? a.issue_date || '' : '')}"></div><div class="field"><label>Vencimento (opcional)</label><input class="input" name="maturity" data-mask="date" value="${esc(a ? a.maturity || '' : '')}"></div>
      <div class="field full"><label>Valorização</label><select class="input" name="valuation">${W.opts([['auto', 'Automática (curva para renda fixa, cotação para cripto e bolsa)'], ['manual', 'Manual (eu informo o valor)']], a ? (a.custom ? 'manual' : 'auto') : 'auto')}</select></div></div>
      <div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>` });
    const sync = () => { const k = document.querySelector('[data-kind]').value; const r = RATE[k]; document.querySelectorAll('[data-rate]').forEach((x) => { x.hidden = !r; }); if (r) document.querySelector('[data-rate-l]').textContent = r[0];
      const vs = document.querySelector('form[data-form=asset-save] [name=valuation]'); if (['imovel', 'veiculo'].includes(k) && !a) vs.value = 'manual'; };
    document.querySelector('[data-kind]').addEventListener('change', sync); sync();
  }
  W.acts['asset-new'] = () => assetModal(W.cur, null);
  W.acts['asset-edit'] = (el) => assetModal(W.cur, W.assets.find((a) => a.id === el.dataset.id));
  W.forms['asset-save'] = async (f) => {
    const v = W.form(f); const r = RATE[v.kind]; const rate = r ? W.parseNum(v.rate) : null; const manual = v.valuation === 'manual';
    const rEl = f.querySelector('[name=rate]'), iEl = f.querySelector('[name=issue_date]'); W.fieldError(rEl, ''); W.fieldError(iEl, '');
    if (r && !manual && (rate === null || rate <= 0)) W.fieldFail(rEl, 'Informe a taxa para valorizar pela curva (ou escolha valorização manual).');
    if (r && !manual && !v.issue_date) W.fieldFail(iEl, 'Informe a data de emissão para valorizar pela curva.');
    if (v.issue_date && v.maturity && v.maturity <= v.issue_date) W.fieldFail(f.querySelector('[name=maturity]'), 'O vencimento precisa ser depois da emissão.');
    const res = await W.rpc('w_asset_save', { p_wallet: curId(), p: { id: v.id, name: v.name, kind: v.kind, ticker: v.ticker, issuer: v.issuer, indexer: r && rate ? r[1] : '', rate: r && rate ? rate / 100 : '', issue_date: v.issue_date, maturity: v.maturity, pu_inicial: W.parseNum(v.pu_inicial) || 1000, custom: manual } });
    W.closeModal(); W.toast('Ativo salvo'); if (document.getElementById('tx-body')) { /* veio do modal de transação */ openTx(W.cur, null); } else W.refresh();
  };
  W.acts['price-del'] = async (el) => { if (!(await W.confirm('Excluir este valor?', `O valor informado em ${W.dt(el.dataset.date)} deixa de valer; vale o anterior.`, 'Excluir', true))) return; await W.rpc('w_asset_price_delete', { p_wallet: curId(), p_asset: el.dataset.asset, p_date: el.dataset.date }); W.toast('Valor excluído'); W.refresh(); };
  W.acts['price-new'] = (el) => { const a = (W.assets || []).find((x) => x.id === el.dataset.id) || { id: el.dataset.id, name: 'Ativo' }; priceModal(a); };
  function priceModal(a) { W.modal({ title: `Atualizar valor · ${a.name}`, body: `<form class="stack" data-form="price-save"><input type="hidden" name="asset" value="${esc(a.id)}"><div class="form-grid"><div class="field"><label>Data</label><input class="input" name="date" data-mask="date" required max="${W.ymd()}" value="${W.ymd()}"></div><div class="field"><label>P.U. (R$)</label><input class="input" name="pu" inputmode="decimal" required></div></div><div class="help">Vale daqui para frente, até o próximo valor informado.</div><div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>` }); }
  W.forms['price-save'] = async (f) => { const v = W.form(f); const pu = W.parseNum(v.pu); if (!(pu >= 0)) throw new Error('P.U. inválido.'); if (v.date && v.date > W.ymd()) { W.fieldError(f.querySelector('[name=date]'), 'A data não pode ser futura.'); const er = new Error('A data não pode ser futura.'); er.shownInField = true; throw er; } await W.rpc('w_asset_price_set', { p_wallet: curId(), p_asset: v.asset, p_date: v.date, p_pu: pu }); W.closeModal(); W.toast('Valor atualizado'); W.refresh(); };

  /* ================= Detalhe do ativo ================= */
  W.route('/w/:id/ativo/:aid', async (ctx) => {
    const d = await W.rpc('w_asset_detail', { p_wallet: ctx.w.id, p_asset: ctx.params.aid }); const a = d.asset, p = d.position; const id = ctx.w.id;
    ctx.after = () => { W.cur = ctx; W.assets = [a]; const pr = d.prices; const host = document.getElementById('ch-px'); if (pr.length > 1) W.lineChart(host, pr.map((x) => ({ label: W.dt(x.date).slice(0, 5), long: W.dt(x.date), a: x.pu, b: x.pu_mercado === null ? undefined : x.pu_mercado })), { names: ['P.U.', 'P.U. a mercado'], format: (v) => W.num(v, 4), name: 'Histórico do P.U.' }); else host.innerHTML = empty('Ainda não há histórico de P.U. para este ativo.'); };
    const own = a.wallet_id === id;
    return `${W.pageHead(a.ticker || a.name, `${KIND[a.kind] || ''}${a.ticker ? ' · ' + a.name : ''}${a.maturity ? ' · vence ' + W.dt(a.maturity) : ''}`, ctx.canWrite && own ? `<button class="btn secondary" data-act="price-new" data-id="${esc(a.id)}">Atualizar valor</button><button class="btn secondary" data-act="asset-edit" data-id="${esc(a.id)}">Editar ativo</button>` : '', [`/w/${id}/posicao`, 'Posição'])}
      <div class="kpis"><div class="kpi"><div class="kpi-label">Quantidade</div><div class="big">${p ? W.qty(p.qty) : '0'}</div></div><div class="kpi"><div class="kpi-label">P.U. médio</div><div class="big">${p ? W.num(p.avg_pu, 4) : '—'}</div></div><div class="kpi"><div class="kpi-label">P.U. atual</div><div class="big">${p ? W.num(p.pu, 4) : '—'}</div><div class="muted small">${p && p.pu_date ? W.dt(p.pu_date) : ''}</div></div><div class="kpi"><div class="kpi-label">Valor</div><div class="big">${p ? W.brl(p.qty * p.pu) : '—'}</div></div>
      <div class="kpi"><div class="kpi-label">Resultado</div><div class="big ${p ? W.cls(p.qty * (p.pu - p.avg_pu)) : ''}">${p ? W.sign(p.qty * (p.pu - p.avg_pu), W.brl) : '—'}</div></div></div>
      ${a.indexer ? `<div class="banner info">${ico('trend')}<div class="grow">Remuneração: <b>${remun(a)}</b>, valorizada pela curva todo dia útil${a.indexer === 'PRE' || a.indexer === 'IPCA' ? '. O P.U. “a mercado” é uma estimativa: taxa do Tesouro de prazo parecido hoje + o spread que o título tinha na emissão.' : a.indexer === 'CDI' ? '. Em % do CDI, o valor a mercado é igual ao da curva.' : '.'}</div></div>` : ''}
      ${d.valuation && (d.valuation.missing || []).length && own ? `<div class="banner warn">${ico('alert')}<div class="grow">Para valorizar automaticamente falta: <b>${esc(d.valuation.missing.join(', '))}</b>. Até lá vale o preço da última transação ou o valor informado.</div>${ctx.canWrite ? `<button class="btn secondary sm" data-act="asset-edit" data-id="${esc(a.id)}">Completar</button>` : ''}</div>` : ''}
      <div class="card" style="margin-bottom:16px"><div class="card-head"><h2>Histórico do P.U.</h2></div><div id="ch-px"></div></div>
      ${own && d.prices.some((x) => x.source === 'manual') ? `<div class="card flush" style="margin-bottom:16px"><div class="card-head" style="padding:18px 24px 0"><h2>Valores informados</h2></div><div class="table-wrap"><table class="tight fit"><thead><tr><th>Data</th><th class="num">P.U.</th><th></th></tr></thead><tbody>${d.prices.filter((x) => x.source === 'manual').reverse().map((x) => `<tr><td>${W.dt(x.date)}</td><td class="num">${W.num(x.pu, 4)}</td><td class="actions">${ctx.canWrite ? `<button class="btn ghost sm" data-act="price-del" data-asset="${esc(a.id)}" data-date="${esc(x.date)}" aria-label="Excluir valor de ${W.dt(x.date)}">${ico('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      <div class="card flush"><div class="card-head" style="padding:18px 24px 0"><h2>Transações</h2></div>${d.tx.length ? `<div class="table-wrap"><table class="tight"><thead><tr><th>Data</th><th>Tipo</th><th class="num">Quantidade</th><th class="num">P.U.</th><th>Custodiante</th></tr></thead><tbody>${d.tx.map((t) => `<tr><td>${W.dt(t.date)}</td><td>${tag(TX[t.kind])}</td><td class="num">${W.qty(t.qty)}</td><td class="num">${W.num(t.unit_price, 4)}</td><td>${esc(t.custodian || '—')}</td></tr>`).join('')}</tbody></table></div>` : empty('Sem transações.')}</div>`;
  });

})();
