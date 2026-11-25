/* Lottus Wealth — Patrimônio, Bens e dívidas e Investimentos (posição, transações, ativos personalizados, detalhe, conexões). */
(function () {
  'use strict';
  const { esc, ico, tag } = W;
  const KIND = { acao: 'Ação', fii: 'FII', etf: 'ETF', bdr: 'BDR', fundo: 'Fundo', tesouro: 'Tesouro Direto', rf_pre: 'Renda fixa pré', rf_pos: 'Renda fixa pós (CDI)', rf_ipca: 'Renda fixa IPCA+', cripto: 'Cripto', imovel: 'Imóvel', veiculo: 'Veículo', outro: 'Outro' };
  const TX = { compra: 'Compra', venda: 'Venda', provento: 'Provento' };
  W.ASSET_KIND = KIND;
  const empty = (t, a = '') => `<div class="empty">${esc(t)}${a ? `<div style="margin-top:12px">${a}</div>` : ''}</div>`;
  const clsDelta = (v) => `<span class="${W.cls(v)}">${v === null || v === undefined ? '—' : W.sign(v, W.brl)}</span>`;

  /* ================= Períodos (calendário), seleção no gráfico e blocos comuns ================= */
  const BM = { CDI: 'CDI', IPCA: 'IPCA', nenhum: '' };
  // período: ?de=&ate= (calendário). Gráficos: últimos 12 meses por padrão; Posição: desde o início. "Desde o início" = de=inicio
  const periodOf = (ctx, defAll) => {
    const de = ctx.q.get('de'), ate = ctx.q.get('ate'); const today = W.ymd();
    const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && W.parseDate(s.split('-').reverse().join('/')) === s && s <= today;
    let to = ok(ate) ? ate : today; let from = ok(de) ? de : null; if (from && from > to) { from = null; to = today; }
    const n = new Date(to + 'T00:00:00'); const d12 = W.ymd(new Date(n.getFullYear(), n.getMonth() - 11, 1));
    const all = de === 'inicio' || (defAll && !from);
    return { from: all ? (defAll ? null : '2000-01-01') : from || d12, to, all }; };
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
  // desempenho de um trecho escolhido no gráfico (arrastando): "rent" = investimentos sem o efeito dos aportes (TWR diário); "pl" = variação do total
  const retInfo = (rows, mode) => (i0, i1) => {
    const a = rows[i0], b = rows[i1]; if (!a || !b || i1 <= i0) return null;
    if (mode === 'rent') {
      let f = 1; for (let k = i0 + 1; k <= i1; k++) { const prev = Number(rows[k - 1].inv); if (prev > 0) f *= (Number(rows[k].inv) - (Number(rows[k].b) - Number(rows[k - 1].b))) / prev; }
      return { money: Number(b.inv) - Number(a.inv) - (Number(b.b) - Number(a.b)), pct: f - 1, from: a.long, to: b.long };
    }
    const m = Number(b.a) - Number(a.a); return { money: m, pct: Number(a.a) ? m / Math.abs(Number(a.a)) : null, from: a.long, to: b.long };
  };
  const kpi = (l, v, sub, c = '') => `<div class="kpi"><div class="kpi-label">${l}</div><div class="big ${c}" title="${esc(String(v).replace(/<[^>]+>/g, ''))}">${v}</div>${sub ? `<div class="muted small one-line">${sub}</div>` : ''}</div>`;
  W.inv = { get periodOf() { return periodOf; }, get periodBar() { return periodBar; }, get retInfo() { return retInfo; }, get kpi() { return kpi; }, get resultSub() { return resultSub; }, BM, KIND };
  const resultSub = (nw) => `${W.sign(nw.resultado, W.brl)}${nw.rentabilidade === null ? '' : ` (${W.sign(nw.rentabilidade, (v) => W.pct(v, 2))})`}`;

  /* ================= Patrimônio ================= */
  // Bens e dívidas saiu na v2: o endereço antigo leva ao Patrimônio
  W.route('/w/:id/bens', async (ctx) => { W.go(`/w/${ctx.w.id}/patrimonio`); return ''; }, { wallet: true });
  const curId = () => (location.hash.match(/#\/w\/([^/?]+)/) || [])[1];
  W.curId = curId;

  /* ================= Posição (classes → subclasses → ativos, com TWR, P&L e custodiante) ================= */
  const classOf = (p) => {
    const k = p.kind;
    if (k === 'acao') return ['Renda Variável', 'Ações', 'rv']; if (k === 'fii') return ['Renda Variável', 'FIIs', 'rv']; if (k === 'etf') return ['Renda Variável', 'ETFs', 'rv']; if (k === 'bdr') return ['Renda Variável', 'BDRs', 'rv'];
    if (k === 'tesouro') return ['Renda Fixa', 'Tesouro Direto', 'rf']; if (k === 'rf_pos') return ['Renda Fixa', 'Pós-fixado', 'rf']; if (k === 'rf_pre') return ['Renda Fixa', 'Pré-fixado', 'rf']; if (k === 'rf_ipca') return ['Renda Fixa', 'Inflação (IPCA+)', 'rf'];
    if (k === 'fundo') return ['Fundos', 'Fundos de Investimento', 'fd']; if (k === 'cripto') return ['Criptoativos', 'Criptoativos', 'cr'];
    if (k === 'imovel') return ['Outros ativos', 'Imóveis', 'ot']; if (k === 'veiculo') return ['Outros ativos', 'Veículos', 'ot']; return ['Outros ativos', 'Outros', 'ot'];
  };
  const posSort = { key: 'weight', dir: -1 }; const posOpen = new Set(); let posAllClosed = false;
  const POS_COLS = [['name', 'Classe / Ativo', ''], ['value', 'Valor atualizado', 'num'], ['invested', 'Valor investido', 'num c-inv'], ['pnl', 'P&L', 'num'], ['twr', 'Rent. TWR', 'num'], ['qty', 'Quantidade', 'num c-qty'], ['custodian', 'Custodiante', 'c-cust'], ['weight', '% do portfólio', 'num']];
  const buildTree = (pos) => {
    const root = new Map();
    for (const p of pos) {
      const [c1, c2, col] = classOf(p); const g1 = root.get(c1) || { name: c1, col, subs: new Map() }; root.set(c1, g1);
      const g2 = g1.subs.get(c2) || { name: c2, assets: [] }; g1.subs.set(c2, g2); g2.assets.push(p);
    }
    const agg = (items) => { const o = { value: 0, invested: 0, pnl: 0, w: 0, tw: 0, weight: 0 }; for (const p of items) { o.value += Number(p.value); o.invested += Number(p.invested); o.pnl += Number(p.pnl ?? p.result ?? 0); o.weight += Number(p.weight || 0); if (p.twr !== null && p.twr !== undefined) { o.w += Math.max(Number(p.invested), 0); o.tw += Number(p.twr) * Math.max(Number(p.invested), 0); } } o.twr = o.w > 0 ? o.tw / o.w : null; return o; };
    const groups = [...root.values()].map((g1) => { const subs = [...g1.subs.values()].map((g2) => ({ ...g2, ...agg(g2.assets), name: g2.name })); const all = subs.flatMap((s) => s.assets); return { name: g1.name, col: g1.col, subs, ...agg(all) }; });
    return { groups, total: agg(pos) };
  };
  const posCell = (v, f) => (v === null || v === undefined ? '—' : f(v));
  const twrCell = (v) => (v === null || v === undefined ? '—' : `<span class="${W.cls(v)}">${W.pct(Math.abs(v), 2).replace(/^/, v < 0 ? '-' : '')}</span> <span class="${W.cls(v)}" aria-hidden="true">${v >= 0 ? '↑' : '↓'}</span>`);
  const pnlCell = (v) => `<span class="${W.cls(v)}">${v < 0 ? '-' : ''}${W.brl(Math.abs(v))}</span>`;
  const cmp = (key) => (a, b) => { const x = key === 'name' || key === 'custodian' ? String(a[key] || '').toLowerCase() : Number(a[key] ?? -Infinity), y = key === 'name' || key === 'custodian' ? String(b[key] || '').toLowerCase() : Number(b[key] ?? -Infinity); return (x < y ? -1 : x > y ? 1 : 0) * posSort.dir; };
  const renderPos = (id, pos) => {
    const tree = buildTree(pos); const sorter = cmp(posSort.key);
    const arrow = `<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const grow = (g, lvl, key) => { const open = !posOpen.has(`c:${key}`); return `<tr class="g g${lvl}" data-key="${esc(key)}" tabindex="0" role="button" aria-expanded="${open}"><td class="cell-name"><span class="gname" style="padding-left:${lvl * 18}px"><span class="tog${open ? ' open' : ''}">${arrow}</span>${esc(g.name)}${lvl === 0 ? ` <i class="dot col-${g.col}"></i>` : ''}</span></td><td class="num">${W.brl(g.value)}</td><td class="num c-inv">${W.brl(g.invested)}</td><td class="num">${pnlCell(g.pnl)}</td><td class="num">${twrCell(g.twr)}</td><td class="num c-qty">-</td><td class="c-cust">-</td><td class="num">${W.pct(g.weight, 2)}</td><td></td></tr>`; };
    const arow = (p, col, lvl) => `<tr class="a link" data-href="#/w/${id}/ativo/${esc(p.asset_id)}"><td class="cell-name" title="${esc(p.name)}"><span class="aname" style="padding-left:${lvl * 18}px;--bar:var(--c-${col})"><b>${esc(p.ticker || p.name)}</b>${p.ticker ? `<span class="muted small one-line"> ${esc(p.name)}</span>` : ''}</span><div class="show-md muted small one-line" style="padding-left:${lvl * 18 + 14}px">${W.qty(p.qty)} · ${esc(p.custodian || '—')}${p.maturity ? ` · vence ${W.dt(p.maturity)}` : ''}</div></td><td class="num">${W.brl(p.value)}</td><td class="num c-inv">${W.brl(p.invested)}</td><td class="num">${pnlCell(Number(p.pnl ?? p.result ?? 0))}</td><td class="num">${twrCell(p.twr === null ? null : Number(p.twr))}</td><td class="num c-qty">${W.qty(p.qty)}</td><td class="c-cust cell-name" title="${esc(p.custodian || '')}">${esc(p.custodian || '—')}</td><td class="num">${W.pct(Number(p.weight || 0), 2)}</td><td class="chev-r">›</td></tr>`;
    let html = '';
    for (const g of [...tree.groups].sort(sorter)) {
      html += grow(g, 0, g.name); if (posOpen.has(`c:${g.name}`)) continue;
      for (const s of [...g.subs].sort(sorter)) {
        html += grow(s, 1, `${g.name}/${s.name}`); if (posOpen.has(`c:${g.name}/${s.name}`)) continue;
        for (const p of [...s.assets].sort(sorter)) html += arow(p, g.col, 2);
      }
    }
    const T = tree.total;
    return { body: html, foot: `<tr class="tot"><td><b>Total</b></td><td class="num"><b>${W.brl(T.value)}</b></td><td class="num c-inv"><b>${W.brl(T.invested)}</b></td><td class="num"><b>${pnlCell(T.pnl)}</b></td><td class="num"><b>${twrCell(T.twr)}</b></td><td class="num c-qty"></td><td class="c-cust"></td><td class="num"><b>100%</b></td><td></td></tr>`, keys: tree.groups.flatMap((g) => [g.name, ...g.subs.map((s) => `${g.name}/${s.name}`)]) };
  };
  W.route('/w/:id/posicao', async (ctx) => {
    const id = ctx.w.id; const mode = W.viewMode(ctx); const per = periodOf(ctx, true);
    const pos = await W.rpc('w_positions', { p_wallet: id, p_mode: mode, p_from: per.from, p_to: per.to });
    ctx.after = () => {
      W.cur = ctx; const host = document.getElementById('pos-table');
      const paint = () => {
        const r = renderPos(id, pos); host.querySelector('tbody').innerHTML = r.body; host.querySelector('tfoot').innerHTML = r.foot; host.__keys = r.keys;
        host.querySelectorAll('th[data-sort]').forEach((th) => { th.setAttribute('aria-sort', th.dataset.sort === posSort.key ? (posSort.dir > 0 ? 'ascending' : 'descending') : 'none'); th.querySelector('.srt').textContent = th.dataset.sort === posSort.key ? (posSort.dir > 0 ? '▲' : '▼') : '↕'; });
      };
      paint();
      host.addEventListener('click', (e) => {
        const th = e.target.closest('th[data-sort]'); if (th) { const k = th.dataset.sort; if (posSort.key === k) posSort.dir = -posSort.dir; else { posSort.key = k; posSort.dir = k === 'name' || k === 'custodian' ? 1 : -1; } return paint(); }
        if (e.target.closest('[data-allpos]')) { posAllClosed = !posAllClosed; posOpen.clear(); if (posAllClosed) (host.__keys || []).forEach((k) => posOpen.add(`c:${k}`)); return paint(); }
        const g = e.target.closest('tr.g'); if (g) { const k = `c:${g.dataset.key}`; if (posOpen.has(k)) posOpen.delete(k); else posOpen.add(k); paint(); }
      });
      host.addEventListener('keydown', (e) => { const g = e.target.closest('tr.g'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); g.click(); } });
    };
    return `${W.pageHead('Posição', '', `${W.modeBar(mode)}${ctx.canWrite ? `<button class="btn secondary" data-act="imp-open">Importar arquivo</button><a class="btn" href="#/w/${id}/transacoes?new=1">${ico('plus')} Nova transação</a>` : ''}`)}
      <div data-evo-range>${periodBar(ctx, per)}</div>
      <div class="card flush">${pos.length ? `<div class="table-wrap"><table class="pos" id="pos-table"><thead><tr><th class="allpos"><button type="button" class="ghost-ico" data-allpos aria-label="Expandir ou recolher tudo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l5 5 5-5M7 13l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></th>${POS_COLS.slice(1).map(([k, l, c]) => `<th class="${c}" data-sort="${k}" aria-sort="none" tabindex="0"><span>${l}</span> <span class="srt" aria-hidden="true">↕</span></th>`).join('')}<th></th></tr></thead><tbody></tbody><tfoot></tfoot></table></div>` : empty('Nenhuma posição na data escolhida.')}</div>`;
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
    W.importUI(document.getElementById('imp-host'), { mode: 'invest', label: 'Arraste o CSV de posições aqui', onImport: async (rows, name) => { const r = await W.rpc('w_tx_import', { p_wallet: id, p_filename: name, p_rows: rows }); return `<p><b>${r.new}</b> lançamentos novos${r.renda_fixa ? ` (${r.renda_fixa} ${r.renda_fixa === 1 ? 'título' : 'títulos'} de renda fixa com a curva calculada)` : ''} · ${r.duplicates} já existiam · ${r.invalid} inválidos.</p><button class="btn" data-act="imp-done">Concluir</button>`; } });
  };
  W.acts['imp-done'] = () => { W.closeModal(); W.refresh(); };
  W.acts['tx-edit'] = (el) => openTx(W.cur, W.txRows.find((t) => t.id === el.dataset.id));
  W.acts['tx-del'] = async (el) => { if (!(await W.confirm('Excluir transação?', 'A posição será recalculada.', 'Excluir', true))) return; await W.rpc('w_tx_delete', { p_wallet: curId(), p_id: el.dataset.id }); W.toast('Transação excluída'); loadTx(W.cur); };
  async function openTx(ctx, t) {
    W.modal({ title: t ? 'Editar transação' : 'Nova transação', body: `<form class="stack" data-form="tx-save"><input type="hidden" name="id" value="${esc(t ? t.id : '')}">
      <div class="form-grid"><div class="field"><label>Tipo</label><select class="input" name="kind">${W.opts(Object.entries(TX), t ? t.kind : 'compra')}</select></div><div class="field"><label>Data</label><input class="input" name="date" data-mask="date" required max="${W.ymd()}" value="${esc(t ? t.date : W.ymd())}"></div>
      <div class="field full"><label>Ativo</label><div class="combo" data-combo="asset"><input class="input" name="asset_q" type="text" required autocomplete="off" placeholder="Digite o nome ou o ticker, ex.: PETR4" value="${esc(t ? `${t.ticker ? t.ticker + ' · ' : ''}${t.asset}` : '')}"><input type="hidden" name="asset_id" value="${esc(t ? t.asset_id : '')}"><div class="combo-list" hidden></div></div><div class="help" id="pu-hint">Não achou? <a href="#" data-act="asset-from-tx">Cadastre um ativo</a></div></div>
      <div class="field"><label>Quantidade</label><input class="input" name="qty" data-mask="qty" inputmode="decimal" required value="${t ? esc(W.qty(t.qty)) : ''}"></div><div class="field"><label>P.U. (R$)</label><input class="input" name="unit_price" data-mask="pu" inputmode="decimal" required value="${t ? esc(W.num(t.unit_price, 4)) : ''}"></div><div class="field full tx-total" id="tx-total" aria-live="polite"></div><div class="field full pu-day" id="pu-day" aria-live="polite"></div>
      <div class="field full"><label>Custodiante (opcional)</label><div class="combo" data-combo="cust"><input class="input" name="custodian" type="text" autocomplete="off" value="${esc(t ? t.custodian || '' : '')}" placeholder="Digite para buscar a corretora ou DTVM"><div class="combo-list" hidden></div></div></div></div>
      <div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>` });
    const form = document.querySelector('form[data-form=tx-save]'), ah = form.querySelector('[data-combo=asset]');
    const puIn = form.querySelector('input[name=unit_price]'); let puTouched = !!t; puIn.addEventListener('input', () => { puTouched = true; });
    const qIn = form.querySelector('input[name=qty]'), totEl = form.querySelector('#tx-total');
    const total = () => { const q = W.parseNum(qIn.value), p = W.parseNum(puIn.value); totEl.innerHTML = q > 0 && p >= 0 && qIn.value && puIn.value ? `Valor total da transação: <b>${W.brl(q * p)}</b>` : ''; };
    qIn.addEventListener('input', total); puIn.addEventListener('input', total); total();
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
    // em telas estreitas (até 1300 px, por causa do menu lateral e das 9 colunas) remuneração, vencimento, último P.U. e as ações vão para a célula do nome
    const acts = (a) => (ctx.canWrite ? `${a.valuation.mode === 'manual' ? `<button class="btn secondary sm" data-act="price-new" data-id="${esc(a.id)}">Atualizar valor</button>` : ''}<button class="btn ghost sm" data-act="asset-edit" data-id="${esc(a.id)}" aria-label="Editar ${esc(a.name)}">${ico('pencil')}</button>` : '');
    const row = (a) => `<tr>${ctx.canWrite ? `<td class="pick"><label><input type="checkbox" data-pick value="${esc(a.id)}" aria-label="Selecionar ${esc(a.name)}"></label></td>` : ''}<td><a href="#/w/${ctx.w.id}/ativo/${esc(a.id)}">${esc(a.name)}</a>${a.ticker ? `<div class="muted small">${esc(a.ticker)}</div>` : ''}
        <div class="show-sm" style="margin-top:4px">${tag(VAL[a.valuation.mode][0], VAL[a.valuation.mode][1])}${miss(a) ? `<div class="small warn-text">Falta: ${esc(a.valuation.missing.join(', '))}</div>` : ''}</div>
        ${a.qty ? `<div class="show-cq"><b>${W.brl(a.value)}</b></div>` : ''}<div class="muted small show-lg">${esc(KIND[a.kind] || '')}${a.indexer && a.rate !== null ? ' · ' + remun(a) : ''}${a.maturity ? ' · vence ' + W.dt(a.maturity) : ''}${a.last_pu !== null ? ` · P.U. ${W.num(a.last_pu, 4)}` : ''}</div>${ctx.canWrite ? `<div class="row show-lg" style="margin-top:6px">${acts(a)}</div>` : ''}</td>
      <td class="hide-lg">${esc(KIND[a.kind] || '')}</td>
      <td class="hide-sm">${tag(VAL[a.valuation.mode][0], VAL[a.valuation.mode][1])}${miss(a) ? `<div class="small warn-text">Falta: ${esc(a.valuation.missing.join(', '))}</div>` : ''}</td><td class="hide-lg">${a.indexer && a.rate !== null ? remun(a) : '—'}</td><td class="hide-lg">${W.dt(a.maturity)}</td>
      <td class="num hide-cq">${a.qty ? W.brl(a.value) : '—'}</td><td class="num hide-lg">${a.last_pu === null ? '—' : W.num(a.last_pu, 4)}<div class="muted small">${a.last_date ? W.dt(a.last_date) : ''}</div></td>
      <td class="actions hide-lg">${acts(a)}</td></tr>`;
    return `${W.pageHead('Ativos personalizados', 'O que não vem pronto da bolsa: CDB, LCI, LCA, crédito privado, debêntures, participações, imóveis, veículos… e como cada um é valorizado.', ctx.canWrite ? `<button class="btn" data-act="asset-new">${ico('plus')} Novo ativo</button>` : '')}
      <div class="banner info">${ico('tags')}<div class="grow"><b>Pela curva</b>: renda fixa com indexador, taxa e data de emissão é valorizada todo dia útil. <b>Cotação automática</b>: cripto, ações e fundos com código. <b>Manual</b>: você informa o valor (imóveis, veículos, participações).</div></div>
      ${nMiss ? `<div class="banner warn">${ico('alert')}<div class="grow"><b>${nMiss} ${nMiss === 1 ? 'ativo precisa' : 'ativos precisam'} de dados</b> para serem valorizados automaticamente; até lá ficam no preço da última transação. ${ctx.canWrite ? 'Selecione-os e use <b>Editar em lote</b> (por exemplo, todos os CDBs de 100% do CDI de uma vez).' : ''}</div>${f !== 'faltam' ? `<a class="btn secondary sm" href="#/w/${ctx.w.id}/ativos?f=faltam">Ver quais</a>` : ''}</div>` : ''}
      <nav class="period" aria-label="Filtrar ativos" style="margin-bottom:12px">${VAL_F.map(([k, l]) => `<a class="${k === f ? 'active' : ''}" href="#/w/${ctx.w.id}/ativos?f=${k}"${k === f ? ' aria-current="true"' : ''}>${l}</a>`).join('')}</nav>
      ${ctx.canWrite ? `<div class="bulk-bar" id="bulk-bar" hidden><span><b>0</b> selecionados</span><button class="btn sm" data-act="asset-bulk">Editar em lote</button></div>` : ''}
      <div class="card flush">${list.length ? `<div class="table-wrap"><table class="tight fit"><thead><tr>${ctx.canWrite ? '<th class="pick"><label><input type="checkbox" id="pick-all" aria-label="Selecionar todos"></label></th>' : ''}<th>Ativo</th><th class="hide-lg">Tipo</th><th class="hide-sm">Valorização</th><th class="hide-lg">Remuneração</th><th class="hide-lg">Vencimento</th><th class="num hide-cq">Posição</th><th class="num hide-lg">Último P.U.</th><th class="hide-lg"><span class="sr-only">Ações</span></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>` : empty(all.length ? 'Nenhum ativo neste filtro.' : 'Nenhum ativo personalizado ainda.', ctx.canWrite && !all.length ? `<button class="btn" data-act="asset-new">${ico('plus')} Novo ativo</button>` : '')}</div>`;
  });
  W.acts['asset-bulk'] = () => {
    const ids = [...document.querySelectorAll('input[data-pick]:checked')].map((c) => c.value); if (!ids.length) return;
    W.modal({ title: `Editar ${ids.length} ${ids.length === 1 ? 'ativo' : 'ativos'} em lote`, sub: 'Só os campos preenchidos mudam; os demais ficam como estão.', wide: true, body: `<form class="stack" data-form="asset-bulk"><input type="hidden" name="ids" value="${esc(ids.join(','))}">
      <div class="form-grid"><div class="field"><label for="bk-kind">Tipo</label><select class="input" id="bk-kind" name="kind">${W.opts(Object.entries(KIND), '', 'Manter')}</select></div>
        <div class="field"><label for="bk-idx">Remuneração</label><select class="input" id="bk-idx" name="indexer">${W.opts([['CDI', '% do CDI'], ['PRE', 'Pré-fixada (% a.a.)'], ['IPCA', 'IPCA + (% a.a.)']], '', 'Manter')}</select></div>
        <div class="field"><label for="bk-rate">Taxa (%)</label><input class="input" id="bk-rate" name="rate" data-mask="pct" inputmode="decimal" placeholder="Ex.: 100 (do CDI) ou 12,5 (a.a.)"></div>
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
      <div class="field" data-rate><label data-rate-l>Taxa</label><input class="input" name="rate" data-mask="pct" inputmode="decimal" value="${a && a.rate ? esc(W.num(a.rate * 100, 4)) : ''}"></div><div class="field" data-rate><label>P.U. de emissão (R$)</label><input class="input" name="pu_inicial" data-mask="pu" inputmode="decimal" value="${esc(a ? W.num(a.pu_inicial, 4) : '1.000,00')}"></div>
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
  function priceModal(a) { W.modal({ title: `Atualizar valor · ${a.name}`, body: `<form class="stack" data-form="price-save"><input type="hidden" name="asset" value="${esc(a.id)}"><div class="form-grid"><div class="field"><label>Data</label><input class="input" name="date" data-mask="date" required max="${W.ymd()}" value="${W.ymd()}"></div><div class="field"><label>P.U. (R$)</label><input class="input" name="pu" data-mask="pu" inputmode="decimal" required></div></div><div class="help">Vale daqui para frente, até o próximo valor informado.</div><div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>` }); }
  W.forms['price-save'] = async (f) => { const v = W.form(f); const pu = W.parseNum(v.pu); if (!(pu >= 0)) throw new Error('P.U. inválido.'); if (v.date && v.date > W.ymd()) { W.fieldError(f.querySelector('[name=date]'), 'A data não pode ser futura.'); const er = new Error('A data não pode ser futura.'); er.shownInField = true; throw er; } await W.rpc('w_asset_price_set', { p_wallet: curId(), p_asset: v.asset, p_date: v.date, p_pu: pu }); W.closeModal(); W.toast('Valor atualizado'); W.refresh(); };

  /* ================= Detalhe do ativo ================= */
  W.route('/w/:id/ativo/:aid', async (ctx) => {
    const d = await W.rpc('w_asset_detail', { p_wallet: ctx.w.id, p_asset: ctx.params.aid }); const a = d.asset, p = d.position; const id = ctx.w.id; const per = periodOf(ctx, true);
    ctx.after = () => { W.cur = ctx; W.assets = [a]; const pr = d.prices.filter((x) => (!per.from || x.date >= per.from) && x.date <= per.to); const host = document.getElementById('ch-px'); if (pr.length > 1) { const rows = pr.map((x) => ({ label: W.dt(x.date).slice(0, 5), long: W.dt(x.date), a: x.pu, b: x.pu_mercado === null ? undefined : x.pu_mercado })); W.lineChart(host, rows, { names: ['P.U.', 'P.U. a mercado'], format: (v) => W.num(v, 4), name: 'Histórico do P.U.', onRange: (i0, i1) => { const x = rows[i0], y = rows[i1]; if (!x || !y || !(Number(x.a) > 0)) return null; return { money: Number(y.a) - Number(x.a), pct: Number(y.a) / Number(x.a) - 1, from: x.long, to: y.long, fmt: (v) => W.num(v, 4) }; } }); } else host.innerHTML = empty('Não há histórico de P.U. neste período.'); };
    const own = a.wallet_id === id;
    return `${W.pageHead(a.ticker || a.name, `${KIND[a.kind] || ''}${a.ticker ? ' · ' + a.name : ''}${a.maturity ? ' · vence ' + W.dt(a.maturity) : ''}`, ctx.canWrite && own ? `<button class="btn secondary" data-act="price-new" data-id="${esc(a.id)}">Atualizar valor</button><button class="btn secondary" data-act="asset-edit" data-id="${esc(a.id)}">Editar ativo</button>` : '', [`/w/${id}/posicao`, 'Posição'])}
      <div class="kpis"><div class="kpi"><div class="kpi-label">Quantidade</div><div class="big">${p ? W.qty(p.qty) : '0'}</div></div><div class="kpi"><div class="kpi-label">P.U. médio</div><div class="big">${p ? W.num(p.avg_pu, 4) : '—'}</div></div><div class="kpi"><div class="kpi-label">P.U. atual</div><div class="big">${p ? W.num(p.pu, 4) : '—'}</div><div class="muted small">${p && p.pu_date ? W.dt(p.pu_date) : ''}</div></div><div class="kpi"><div class="kpi-label">Valor</div><div class="big">${p ? W.brl(p.qty * p.pu) : '—'}</div></div>
      <div class="kpi"><div class="kpi-label">Resultado</div><div class="big ${p ? W.cls(p.qty * (p.pu - p.avg_pu)) : ''}">${p ? W.sign(p.qty * (p.pu - p.avg_pu), W.brl) : '—'}</div></div></div>
      ${a.indexer ? `<div class="banner info">${ico('trend')}<div class="grow">Remuneração: <b>${remun(a)}</b>, valorizada pela curva todo dia útil${a.indexer === 'PRE' || a.indexer === 'IPCA' ? '. O P.U. “a mercado” é uma estimativa: taxa do Tesouro de prazo parecido hoje + o spread que o título tinha na emissão.' : a.indexer === 'CDI' ? '. Em % do CDI, o valor a mercado é igual ao da curva.' : '.'}</div></div>` : ''}
      ${d.valuation && (d.valuation.missing || []).length && own ? `<div class="banner warn">${ico('alert')}<div class="grow">Para valorizar automaticamente falta: <b>${esc(d.valuation.missing.join(', '))}</b>. Até lá vale o preço da última transação ou o valor informado.</div>${ctx.canWrite ? `<button class="btn secondary sm" data-act="asset-edit" data-id="${esc(a.id)}">Completar</button>` : ''}</div>` : ''}
      <div class="card" style="margin-bottom:16px" data-evo-range><div class="card-head"><h2>Histórico do P.U.</h2></div>${periodBar(ctx, per)}<div id="ch-px"></div></div>
      ${own && d.prices.some((x) => x.source === 'manual') ? `<div class="card flush" style="margin-bottom:16px"><div class="card-head" style="padding:18px 24px 0"><h2>Valores informados</h2></div><div class="table-wrap"><table class="tight fit"><thead><tr><th>Data</th><th class="num">P.U.</th><th></th></tr></thead><tbody>${d.prices.filter((x) => x.source === 'manual').reverse().map((x) => `<tr><td>${W.dt(x.date)}</td><td class="num">${W.num(x.pu, 4)}</td><td class="actions">${ctx.canWrite ? `<button class="btn ghost sm" data-act="price-del" data-asset="${esc(a.id)}" data-date="${esc(x.date)}" aria-label="Excluir valor de ${W.dt(x.date)}">${ico('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      <div class="card flush"><div class="card-head" style="padding:18px 24px 0"><h2>Transações</h2></div>${d.tx.length ? `<div class="table-wrap"><table class="tight"><thead><tr><th>Data</th><th>Tipo</th><th class="num">Quantidade</th><th class="num">P.U.</th><th class="num">Total</th><th>Custodiante</th></tr></thead><tbody>${d.tx.map((t) => `<tr><td>${W.dt(t.date)}</td><td>${tag(TX[t.kind])}</td><td class="num">${W.qty(t.qty)}</td><td class="num">${W.num(t.unit_price, 4)}</td><td class="num">${W.brl(Number(t.qty) * Number(t.unit_price))}</td><td>${esc(t.custodian || '—')}</td></tr>`).join('')}</tbody></table></div>` : empty('Sem transações.')}</div>`;
  });

})();
