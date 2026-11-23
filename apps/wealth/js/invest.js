/* Lottus Wealth — Patrimônio, Bens e dívidas e Investimentos (posição, transações, ativos personalizados, detalhe, conexões). */
(function () {
  'use strict';
  const { esc, ico, tag } = W;
  const KIND = { acao: 'Ação', fii: 'FII', etf: 'ETF', bdr: 'BDR', fundo: 'Fundo', tesouro: 'Tesouro Direto', rf_pre: 'Renda fixa pré', rf_pos: 'Renda fixa pós (CDI)', rf_ipca: 'Renda fixa IPCA+', cripto: 'Cripto', outro: 'Outro' };
  const TX = { compra: 'Compra', venda: 'Venda', provento: 'Provento' };
  W.ASSET_KIND = KIND;
  const empty = (t, a = '') => `<div class="empty">${esc(t)}${a ? `<div style="margin-top:12px">${a}</div>` : ''}</div>`;
  const clsDelta = (v) => `<span class="${W.cls(v)}">${v === null || v === undefined ? '—' : W.sign(v, W.brl)}</span>`;

  /* ================= Patrimônio ================= */
  W.route('/w/:id/patrimonio', async (ctx) => {
    const id = ctx.w.id; const months = Number(ctx.q.get('m')) || 12;
    const [nw, eq, pos] = await Promise.all([W.rpc('w_networth', { p_wallet: id }), W.rpc('w_equity', { p_wallet: id, p_months: months }), W.rpc('w_positions', { p_wallet: id })]);
    const kpi = (l, v, sub, c = '') => `<div class="kpi"><div class="kpi-label">${l}</div><div class="big ${c}">${v}</div>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>`;
    ctx.after = () => {
      const rows = eq.map((p) => ({ label: W.monthLabel(p.date), long: W.dt(p.date), a: p.total, b: p.aportes, inv: p.investimentos }));
      const draw = (mode) => W.lineChart(document.getElementById('ch-eq'), mode === 'rent' ? rows.map((r) => ({ ...r, a: r.inv, b: r.b })) : rows.map((r) => ({ label: r.label, long: r.long, a: r.a })), { names: mode === 'rent' ? ['Investimentos', 'Aportes líquidos'] : ['Patrimônio líquido'], name: 'Evolução' });
      draw('pl');
      document.querySelectorAll('[data-chart]').forEach((b) => b.addEventListener('click', () => { document.querySelectorAll('[data-chart]').forEach((x) => x.classList.toggle('active', x === b)); draw(b.dataset.chart); }));
      const kinds = {}; pos.forEach((p) => { kinds[KIND[p.kind] || 'Outro'] = (kinds[KIND[p.kind] || 'Outro'] || 0) + Number(p.value); });
      W.donut(document.getElementById('ch-alloc'), Object.entries(kinds).map(([name, value]) => ({ name, value })), { name: 'Alocação por tipo de ativo' });
      W.donut(document.getElementById('ch-comp'), [{ name: 'Investimentos', value: nw.investimentos }, { name: 'Contas (Gastos)', value: Math.max(nw.contas, 0) }, { name: 'Bens', value: nw.bens }], { name: 'Composição do patrimônio' });
    };
    return `${W.pageHead('Patrimônio', 'Investimentos + saldos das contas + bens − dívidas.', ctx.canWrite ? `<a class="btn secondary" href="#/w/${id}/bens">Bens e dívidas</a><a class="btn" href="#/w/${id}/transacoes?new=1">${ico('plus')} Nova transação</a>` : '')}
      <div class="kpis">${kpi('Patrimônio líquido', W.brl(nw.total), '')}${kpi('Investimentos', W.brl(nw.investimentos), `Resultado ${W.sign(nw.resultado, W.brl)}${nw.rentabilidade === null ? '' : ` (${W.sign(nw.rentabilidade, (v) => W.pct(v))})`}`)}${kpi('Contas (saldo em Gastos)', W.brl(nw.contas), '')}${kpi('Bens e dívidas', W.brl(Number(nw.bens) - Number(nw.dividas)), `Bens ${W.brl(nw.bens)} · Dívidas ${W.brl(nw.dividas)}`)}</div>
      <div class="card" style="margin-bottom:16px"><div class="card-head"><h2>Evolução</h2><div class="row"><div class="tabs"><button class="active" data-chart="pl">Patrimônio</button><button data-chart="rent">Investimentos × aportes</button></div>
        <div class="tabs">${[12, 24, 36, 60].map((m) => `<a class="chip${m === months ? ' active' : ''}" href="#/w/${id}/patrimonio?m=${m}">${m < 24 ? '12 meses' : m / 12 + ' anos'}</a>`).join('')}</div></div></div><div id="ch-eq"></div>
        <p class="muted small">Rentabilidade simples: resultado ÷ aportes líquidos (não desconta o tempo em que cada aporte ficou investido).</p></div>
      <div class="grid-2"><div class="card"><div class="card-head"><h2>Composição</h2></div><div id="ch-comp"></div></div><div class="card"><div class="card-head"><h2>Investimentos por tipo</h2></div><div id="ch-alloc"></div></div></div>`;
  });

  /* ================= Bens e dívidas ================= */
  W.route('/w/:id/bens', async (ctx) => {
    const rows = await W.rpc('w_other_list', { p_wallet: ctx.w.id });
    ctx.after = () => { ctx.items = rows; W.cur = ctx; };
    const tbl = (kind) => { const l = rows.filter((r) => r.kind === kind); return l.length ? `<div class="table-wrap"><table class="tight"><thead><tr><th>Nome</th><th>Data de referência</th><th class="num">Valor</th><th></th></tr></thead><tbody>${l.map((r) => `<tr><td>${esc(r.name)}${r.notes ? `<div class="muted small">${esc(r.notes)}</div>` : ''}</td><td>${W.dt(r.ref_date)}</td><td class="num">${W.brl(r.value)}</td><td class="actions">${ctx.canWrite ? `<button class="btn ghost sm" data-act="other-edit" data-id="${esc(r.id)}" aria-label="Editar">${ico('pencil')}</button><button class="btn ghost sm" data-act="other-del" data-id="${esc(r.id)}" aria-label="Excluir">${ico('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : empty(kind === 'bem' ? 'Nenhum bem cadastrado.' : 'Nenhuma dívida cadastrada.'); };
    W.other = rows;
    return `${W.pageHead('Bens e dívidas', 'Imóveis, veículos, financiamentos… Informados por você; entram no patrimônio, mas não na base de cobrança.', ctx.canWrite ? `<button class="btn secondary" data-act="other-new" data-kind="divida">${ico('plus')} Dívida</button><button class="btn" data-act="other-new" data-kind="bem">${ico('plus')} Bem</button>` : '')}
      <div class="stack"><div class="card flush"><div class="card-head" style="padding:18px 24px 0"><h2>Bens</h2><b>${W.brl(rows.filter((r) => r.kind === 'bem').reduce((s, r) => s + Number(r.value), 0))}</b></div>${tbl('bem')}</div>
      <div class="card flush"><div class="card-head" style="padding:18px 24px 0"><h2>Dívidas</h2><b>${W.brl(rows.filter((r) => r.kind === 'divida').reduce((s, r) => s + Number(r.value), 0))}</b></div>${tbl('divida')}</div></div>`;
  });
  const otherModal = (kind, it) => W.modal({ title: kind === 'bem' ? `${it ? 'Editar' : 'Novo'} bem` : `${it ? 'Editar' : 'Nova'} dívida`, body: `<form class="stack" data-form="other-save"><input type="hidden" name="id" value="${esc(it ? it.id : '')}"><input type="hidden" name="kind" value="${kind}">
    <div class="field"><label>Nome</label><input class="input" name="name" required minlength="2" value="${esc(it ? it.name : '')}" placeholder="${kind === 'bem' ? 'Apartamento, carro…' : 'Financiamento, cartão…'}"></div>
    <div class="form-grid"><div class="field"><label>Valor (R$)</label><input class="input" name="value" inputmode="decimal" required value="${it ? esc(W.num(it.value)) : ''}"></div><div class="field"><label>Data de referência</label><input class="input" name="ref_date" data-mask="date" required value="${esc(it ? it.ref_date : W.ymd())}"></div></div>
    <div class="field"><label>Observação (opcional)</label><input class="input" name="notes" value="${esc(it ? it.notes || '' : '')}"></div><div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>` });
  Object.assign(W.acts, {
    'other-new': (el) => otherModal(el.dataset.kind, null),
    'other-edit': (el) => { const it = W.other.find((r) => r.id === el.dataset.id); otherModal(it.kind, it); },
    'other-del': async (el) => { if (!(await W.confirm('Excluir item?', 'Ele deixa de entrar no patrimônio.', 'Excluir', true))) return; await W.rpc('w_other_delete', { p_wallet: curId(), p_id: el.dataset.id }); W.toast('Item excluído'); W.refresh(); },
  });
  const curId = () => (location.hash.match(/#\/w\/([^/?]+)/) || [])[1];
  W.curId = curId;
  W.forms['other-save'] = async (f) => { const v = W.form(f); const val = W.parseNum(v.value); if (val === null || val < 0) throw new Error('Valor inválido.'); await W.rpc('w_other_save', { p_wallet: curId(), p: { id: v.id, kind: v.kind, name: v.name, value: val, ref_date: v.ref_date, notes: v.notes } }); W.closeModal(); W.toast('Salvo'); W.refresh(); };

  /* ================= Visão geral de investimentos ================= */
  W.route('/w/:id/investimentos', async (ctx) => {
    const id = ctx.w.id; const months = Number(ctx.q.get('m')) || 12;
    const [nw, eq, pos] = await Promise.all([W.rpc('w_networth', { p_wallet: id }), W.rpc('w_equity', { p_wallet: id, p_months: months }), W.rpc('w_positions', { p_wallet: id })]);
    const kpi = (l, v, sub, c = '') => `<div class="kpi"><div class="kpi-label">${l}</div><div class="big ${c}">${v}</div>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>`;
    const top = [...pos].sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 6); const tot = pos.reduce((x, p) => x + Number(p.value), 0);
    ctx.after = () => {
      W.lineChart(document.getElementById('ch-inv'), eq.map((p) => ({ label: W.monthLabel(p.date), long: W.dt(p.date), a: p.investimentos, b: p.aportes })), { names: ['Investimentos', 'Aportes líquidos'], name: 'Evolução dos investimentos' });
      const kinds = {}; pos.forEach((p) => { kinds[KIND[p.kind] || 'Outro'] = (kinds[KIND[p.kind] || 'Outro'] || 0) + Number(p.value); });
      W.donut(document.getElementById('ch-alloc'), Object.entries(kinds).map(([name, value]) => ({ name, value })), { name: 'Alocação por tipo de ativo' });
    };
    return `${W.pageHead('Visão geral', 'Quanto você tem investido e como está distribuído.', ctx.canWrite ? `<button class="btn secondary" data-act="imp-open">Importar arquivo</button><a class="btn" href="#/w/${id}/transacoes?new=1">${ico('plus')} Nova transação</a>` : '')}
      <div class="kpis">${kpi('Valor atual', W.brl(nw.investimentos), `${pos.length} ${pos.length === 1 ? 'ativo' : 'ativos'}`)}${kpi('Aportes líquidos', W.brl(nw.aportes), 'Compras menos vendas')}${kpi('Resultado', W.sign(nw.resultado, W.brl), nw.rentabilidade === null ? 'Sem aportes registrados' : `${W.sign(nw.rentabilidade, (v) => W.pct(v))} sobre os aportes`, W.cls(nw.resultado))}${kpi('Maior posição', top.length && tot > 0 ? W.pct(Number(top[0].value) / tot, 1) : '—', top.length ? esc(top[0].ticker || top[0].name) : 'Sem posições')}</div>
      <div class="card" style="margin-bottom:16px"><div class="card-head"><h2>Evolução</h2><div class="tabs">${[12, 24, 36, 60].map((m) => `<a class="chip${m === months ? ' active' : ''}" href="#/w/${id}/investimentos?m=${m}">${m < 24 ? '12 meses' : m / 12 + ' anos'}</a>`).join('')}</div></div><div id="ch-inv"></div></div>
      <div class="grid-2"><div class="card"><div class="card-head"><h2>Alocação por tipo</h2></div><div id="ch-alloc"></div></div>
        <div class="card flush"><div class="card-head" style="padding:18px 24px 0"><h2>Maiores posições</h2><a href="#/w/${id}/posicao" class="muted small">Ver todas</a></div>${top.length ? `<div class="table-wrap"><table class="tight"><thead><tr><th>Ativo</th><th class="num">Valor</th><th class="num">Peso</th></tr></thead><tbody>${top.map((p) => `<tr class="link" data-href="#/w/${id}/ativo/${esc(p.asset_id)}"><td><b>${esc(p.ticker || p.name)}</b></td><td class="num">${W.brl(p.value)}</td><td class="num">${tot > 0 ? W.pct(Number(p.value) / tot, 1) : '—'}</td></tr>`).join('')}</tbody></table></div>` : empty('Nenhum investimento registrado.')}</div></div>`;
  });

  /* ================= Posição ================= */
  W.route('/w/:id/posicao', async (ctx) => {
    const id = ctx.w.id; const pos = await W.rpc('w_positions', { p_wallet: id });
    const hasMkt = pos.some((p) => p.pu_mercado !== null);
    const draw = (merc) => {
      const tot = pos.reduce((s, p) => s + Number(merc && p.value_mercado !== null ? p.value_mercado : p.value), 0), cost = pos.reduce((s, p) => s + Number(p.cost), 0);
      document.getElementById('pos-body').innerHTML = pos.length ? pos.map((p) => { const v = merc && p.value_mercado !== null ? p.value_mercado : p.value; const r = Number(v) - Number(p.cost); return `<tr class="link" data-href="#/w/${id}/ativo/${esc(p.asset_id)}"><td><b>${esc(p.ticker || p.name)}</b>${p.ticker ? `<div class="muted small">${esc(p.name)}</div>` : ''}</td><td>${esc(KIND[p.kind] || '')}${p.maturity ? `<div class="muted small">vence ${W.dt(p.maturity)}</div>` : ''}</td><td class="num">${W.qty(p.qty)}</td><td class="num">${W.num(p.avg_pu, 4)}</td><td class="num">${W.num(merc && p.pu_mercado !== null ? p.pu_mercado : p.pu, 4)}<div class="muted small">${W.dt(p.pu_date)}</div></td><td class="num"><b>${W.brl(v)}</b></td><td class="num">${clsDelta(r)}<div class="small ${W.cls(r)}">${p.cost > 0 ? W.sign(r / p.cost, (x) => W.pct(x)) : ''}</div></td><td class="num">${tot > 0 ? W.pct(Number(v) / tot, 1) : '—'}</td></tr>`; }).join('') : `<tr><td colspan="8">${empty('Nenhum investimento registrado.')}</td></tr>`;
      document.getElementById('pos-foot').innerHTML = pos.length ? `<tr><td colspan="5"><b>Total</b></td><td class="num"><b>${W.brl(tot)}</b></td><td class="num">${clsDelta(tot - cost)}</td><td class="num">100%</td></tr>` : '';
    };
    ctx.after = () => { draw(false); const cb = document.getElementById('merc'); if (cb) cb.addEventListener('change', () => draw(cb.checked)); document.getElementById('pos-body').addEventListener('click', (e) => { const r = e.target.closest('tr[data-href]'); if (r) location.hash = r.dataset.href.slice(1); }); };
    return `${W.pageHead('Posição', 'Quanto você tem em cada ativo hoje.', `${hasMkt ? '<label class="check"><input type="checkbox" id="merc"> Mostrar pré-fixados a mercado</label>' : ''}${ctx.canWrite ? `<button class="btn secondary" data-act="imp-open">Importar arquivo</button><a class="btn" href="#/w/${id}/transacoes?new=1">${ico('plus')} Nova transação</a>` : ''}`)}
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
      <form class="filters" data-live="tx"><div class="field"><label>Ativo</label><select class="input" name="asset">${W.opts(assets.map((a) => [a.id, a.ticker || a.name]), f.asset, 'Todos')}</select></div>
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
      <div class="field"><label>Quantidade</label><input class="input" name="qty" inputmode="decimal" required value="${t ? esc(W.qty(t.qty)) : ''}"></div><div class="field"><label>P.U. (R$)</label><input class="input" name="unit_price" inputmode="decimal" required value="${t ? esc(W.num(t.unit_price, 4)) : ''}"></div>
      <div class="field full"><label>Custodiante (opcional)</label><div class="combo" data-combo="cust"><input class="input" name="custodian" type="text" autocomplete="off" value="${esc(t ? t.custodian || '' : '')}" placeholder="Digite para buscar a corretora ou DTVM"><div class="combo-list" hidden></div></div></div></div>
      <div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>` });
    const form = document.querySelector('form[data-form=tx-save]'), ah = form.querySelector('[data-combo=asset]');
    const puIn = form.querySelector('input[name=unit_price]'); let puTouched = !!t; puIn.addEventListener('input', () => { puTouched = true; });
    ah.__onType = () => { form.querySelector('input[name=asset_id]').value = ''; };
    W.combo(ah, { fetch: (q) => W.rpc('w_asset_search', { p_wallet: ctx.w.id, p_q: q }), label: (a) => `${a.ticker ? a.ticker + ' · ' : ''}${a.name}`, sub: (a) => (a.last_pu !== null && a.last_pu !== undefined ? `R$ ${W.num(a.last_pu, 4)}` : KIND[a.kind] || ''),
      onPick: (a) => { form.querySelector('input[name=asset_id]').value = a.id; const hint = document.getElementById('pu-hint');
        if (a.last_pu !== null && a.last_pu !== undefined) { if (!puTouched || !puIn.value) { puIn.value = W.num(a.last_pu, 4); puTouched = false; } hint.textContent = ""; }
        else hint.innerHTML = 'Sem cotação atualizada para este ativo: informe o P.U. da operação.'; } });
    const cu = form.querySelector('[data-combo=cust]');
    W.combo(cu, { fetch: (q) => W.rpc('w_custodian_search', { p_q: q }), label: (c) => c.name, sub: (c) => ({ dtvm: 'DTVM', ctvm: 'Corretora', banco: 'Banco' }[c.kind] || ''), onPick: () => {} });
  }
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
  W.route('/w/:id/ativos', async (ctx) => {
    const list = await W.rpc('w_assets_custom', { p_wallet: ctx.w.id }); W.assets = list; ctx.after = () => { W.cur = ctx; };
    return `${W.pageHead('Ativos personalizados', 'Cadastre o que não está na bolsa: CDB, crédito privado, debêntures, participações, imóveis em fundo… e acompanhe a valorização.', ctx.canWrite ? `<button class="btn" data-act="asset-new">${ico('plus')} Novo ativo</button>` : '')}
      <div class="banner info">${ico('tags')}<div class="grow">Renda fixa com taxa (pré, % do CDI ou IPCA+) é valorizada <b>todo dia útil</b> pela curva. Para os demais, marque “valorização manual” e informe o P.U. quando quiser.</div></div>
      <div class="card flush">${list.length ? `<div class="table-wrap"><table class="tight"><thead><tr><th>Ativo</th><th>Tipo</th><th>Remuneração</th><th>Vencimento</th><th class="num">Último P.U.</th><th></th></tr></thead><tbody>${list.map((a) => `<tr><td><a href="#/w/${ctx.w.id}/ativo/${esc(a.id)}">${esc(a.name)}</a>${a.ticker ? `<div class="muted small">${esc(a.ticker)}</div>` : ''}</td><td>${esc(KIND[a.kind] || '')}</td><td>${a.indexer ? remun(a) : tag(a.custom ? 'Valorização manual' : '—')}</td><td>${W.dt(a.maturity)}</td><td class="num">${a.last_pu === null ? '—' : W.num(a.last_pu, 4)}<div class="muted small">${a.last_date ? W.dt(a.last_date) : ''}</div></td><td class="actions">${ctx.canWrite ? `${a.custom || !a.indexer ? `<button class="btn secondary sm" data-act="price-new" data-id="${esc(a.id)}">Atualizar valor</button>` : ''}<button class="btn ghost sm" data-act="asset-edit" data-id="${esc(a.id)}" aria-label="Editar">${ico('pencil')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('Nenhum ativo personalizado ainda.')}</div>`;
  });
  const remun = (a) => (a.indexer === 'PRE' ? `${W.num(a.rate * 100)}% a.a.` : a.indexer === 'CDI' ? `${W.num(a.rate * 100)}% do CDI` : `IPCA + ${W.num(a.rate * 100)}% a.a.`);
  function assetModal(ctx, a) {
    W.modal({ title: a ? 'Editar ativo' : 'Novo ativo', body: `<form class="stack" data-form="asset-save"><input type="hidden" name="id" value="${esc(a ? a.id : '')}">
      <div class="form-grid"><div class="field full"><label>Nome</label><input class="input" name="name" required minlength="2" value="${esc(a ? a.name : '')}" placeholder="CDB Banco X 2028, Debênture Y…"></div>
      <div class="field"><label>Tipo</label><select class="input" name="kind" data-kind>${W.opts(Object.entries(KIND), a ? a.kind : 'rf_pos')}</select></div><div class="field"><label>Ticker/código (opcional)</label><input class="input" name="ticker" value="${esc(a ? a.ticker || '' : '')}"></div>
      <div class="field" data-rate><label data-rate-l>Taxa</label><input class="input" name="rate" inputmode="decimal" value="${a && a.rate ? esc(W.num(a.rate * 100, 4)) : ''}"></div><div class="field" data-rate><label>P.U. de emissão (R$)</label><input class="input" name="pu_inicial" inputmode="decimal" value="${esc(a ? W.num(a.pu_inicial, 4) : '1.000,00')}"></div>
      <div class="field" data-rate><label>Data de emissão</label><input class="input" name="issue_date" data-mask="date" value="${esc(a ? a.issue_date || '' : '')}"></div><div class="field"><label>Vencimento (opcional)</label><input class="input" name="maturity" data-mask="date" value="${esc(a ? a.maturity || '' : '')}"></div>
      <label class="check full"><input type="checkbox" name="custom"${a ? (a.custom ? ' checked' : '') : ''}> <span>Valorização manual (eu informo o P.U.)</span></label></div>
      <div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>` });
    const sync = () => { const k = document.querySelector('[data-kind]').value; const r = RATE[k]; document.querySelectorAll('[data-rate]').forEach((x) => { x.hidden = !r; }); if (r) document.querySelector('[data-rate-l]').textContent = r[0]; };
    document.querySelector('[data-kind]').addEventListener('change', sync); sync();
  }
  W.acts['asset-new'] = () => assetModal(W.cur, null);
  W.acts['asset-edit'] = (el) => assetModal(W.cur, W.assets.find((a) => a.id === el.dataset.id));
  W.forms['asset-save'] = async (f) => {
    const v = W.form(f); const r = RATE[v.kind]; const rate = r ? W.parseNum(v.rate) : null;
    if (r && (rate === null || rate <= 0)) throw new Error('Informe a taxa.'); if (r && !v.issue_date) throw new Error('Informe a data de emissão.');
    const res = await W.rpc('w_asset_save', { p_wallet: curId(), p: { id: v.id, name: v.name, kind: v.kind, ticker: v.ticker, indexer: r ? r[1] : '', rate: r ? rate / 100 : '', issue_date: v.issue_date, maturity: v.maturity, pu_inicial: W.parseNum(v.pu_inicial) || 1000, custom: !!f.querySelector('[name=custom]').checked } });
    W.closeModal(); W.toast('Ativo salvo'); if (document.getElementById('tx-body')) { /* veio do modal de transação */ openTx(W.cur, null); } else W.refresh();
  };
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
      ${a.indexer ? `<div class="banner info">${ico('trend')}<div class="grow">Remuneração: <b>${remun(a)}</b>, valorizada pela curva todo dia útil${a.indexer === 'PRE' ? '. O P.U. “a mercado” é uma estimativa por taxa de referência.' : '.'}</div></div>` : ''}
      <div class="card" style="margin-bottom:16px"><div class="card-head"><h2>Histórico do P.U.</h2></div><div id="ch-px"></div></div>
      <div class="card flush"><div class="card-head" style="padding:18px 24px 0"><h2>Transações</h2></div>${d.tx.length ? `<div class="table-wrap"><table class="tight"><thead><tr><th>Data</th><th>Tipo</th><th class="num">Quantidade</th><th class="num">P.U.</th><th>Custodiante</th></tr></thead><tbody>${d.tx.map((t) => `<tr><td>${W.dt(t.date)}</td><td>${tag(TX[t.kind])}</td><td class="num">${W.qty(t.qty)}</td><td class="num">${W.num(t.unit_price, 4)}</td><td>${esc(t.custodian || '—')}</td></tr>`).join('')}</tbody></table></div>` : empty('Sem transações.')}</div>`;
  });

})();
