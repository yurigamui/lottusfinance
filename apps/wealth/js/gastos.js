/* Lottus Wealth — Gastos: visão geral, transações, importar extrato, cadastros e regras. */
(function () {
  'use strict';
  const { esc, ico, tag } = W;
  const curId = () => W.curId();
  const empty = (t) => `<div class="empty">${esc(t)}</div>`;
  const AXES = { contraparte: 'Contraparte', centro: 'Centro de custo', grupo: 'Grupo' };
  const monthRange = () => { const n = new Date(); return [W.ymd(new Date(n.getFullYear(), n.getMonth(), 1)), W.ymd(new Date(n.getFullYear(), n.getMonth() + 1, 0))]; };
  const sel = (list, v, blank) => W.opts(list.map((c) => [c.id, c.name]), v, blank);
  const catName = (cad, id) => { const c = cad.find((x) => x.id === id); return c ? c.name : ''; };

  /* ================= Visão geral ================= */
  const ovr = {};
  W.route('/w/:id/gastos', async (ctx) => {
    const id = ctx.w.id; const f = ovr[id] = ovr[id] || (() => { const [a, b] = monthRange(); const n = new Date(); return { from: W.ymd(new Date(n.getFullYear(), n.getMonth() - 5, 1)), to: b }; })();
    const [banks] = await Promise.all([W.rpc('w_bank_list', { p_wallet: id })]);
    ctx.after = () => { W.cur = ctx; W.banks = banks; loadOverview(ctx); };
    return `${W.pageHead('Gastos', 'Receitas e despesas das suas contas bancárias.', ctx.canWrite ? `<button class="btn secondary" data-act="spend-imp-open">${ico('upload')} Importar extrato</button>` : '')}
      <form class="filters" data-live="ovr"><div class="field"><label>Período</label>${W.rangeHtml(f.from, f.to)}</div></form>
      <div id="ovr">${W.loading()}</div>
      <div class="card flush" style="margin-top:16px"><div class="card-head" style="padding:18px 24px 0"><h2>Contas bancárias</h2>${ctx.canWrite ? `<button class="btn secondary sm" data-act="bank-new">${ico('plus')} Nova conta</button>` : ''}</div>
        ${banks.length ? `<div class="table-wrap"><table class="tight"><thead><tr><th>Conta</th><th>Banco</th><th>Último lançamento</th><th class="num">Saldo</th><th></th></tr></thead><tbody>${banks.map((b) => `<tr><td><b>${esc(b.name)}</b></td><td>${esc(b.bank || '—')}${b.branch || b.account_number ? `<div class="muted small">Ag. ${esc(b.branch || '—')} · Conta ${esc(b.account_number || '—')}${b.account_digit ? '-' + esc(b.account_digit) : ''}</div>` : ''}</td><td>${W.dt(b.last_date)}</td><td class="num"><b>${W.brl(b.balance)}</b></td><td class="actions">${ctx.canWrite ? `<button class="btn ghost sm" data-act="bank-edit" data-id="${esc(b.id)}" aria-label="Editar">${ico('pencil')}</button><button class="btn ghost sm" data-act="bank-del" data-id="${esc(b.id)}" aria-label="Excluir">${ico('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('Cadastre uma conta para começar a importar extratos.')}</div>`;
  });
  async function loadOverview(ctx) {
    const id = ctx.w.id, f = ovr[id]; const host = document.getElementById('ovr'); if (!host) return;
    const s = await W.rpc('w_spend_summary', { p_wallet: id, p_from: f.from || '2000-01-01', p_to: f.to || W.ymd() });
    const tin = s.by_month.reduce((a, m) => a + Number(m.receitas || 0), 0), tout = s.by_month.reduce((a, m) => a + Number(m.despesas || 0), 0);
    const cash = (W.banks || []).reduce((x, b) => x + Number(b.balance || 0), 0);
    host.innerHTML = `<div class="kpis"><div class="kpi"><div class="kpi-label">Receitas</div><div class="big pos">${W.brl(tin)}</div></div><div class="kpi"><div class="kpi-label">Despesas</div><div class="big">${W.brl(tout)}</div></div><div class="kpi"><div class="kpi-label">Saldo do período</div><div class="big ${W.cls(tin - tout)}">${W.brl(tin - tout)}</div></div><div class="kpi"><div class="kpi-label">Saldo nas contas</div><div class="big">${W.brl(cash)}</div></div></div>
      ${s.unclassified ? `<a class="banner info" href="#/w/${id}/gastos/transacoes" style="text-decoration:none"><div class="grow"><b>${s.unclassified}</b> lançamentos sem contraparte ou centro de custo. Classificar agora →</div></a>` : ''}
      <div class="card" style="margin-bottom:16px"><div class="card-head"><h2>Receitas × despesas por mês</h2><span class="muted small">Transferências entre suas contas ficam de fora.</span></div><div id="ch-flow"></div></div>
      <div class="grid-2"><div class="card"><div class="card-head"><h2>Despesas por centro de custo</h2></div><div id="ch-cc"></div></div><div class="card"><div class="card-head"><h2>Maiores contrapartes</h2></div><div id="ch-cp"></div></div></div>`;
    if (s.by_month.length) W.flowChart(document.getElementById('ch-flow'), s.by_month.map((m) => ({ label: W.monthLabel(m.month), long: W.monthLabel(m.month), in: m.receitas, out: m.despesas }))); else document.getElementById('ch-flow').innerHTML = empty('Sem lançamentos no período.');
    W.donut(document.getElementById('ch-cc'), s.by_centro, { name: 'Despesas por centro de custo' }); W.donut(document.getElementById('ch-cp'), s.by_contraparte, { name: 'Maiores contrapartes' });
  }
  W.live.ovr = (form) => { const v = W.form(form); ovr[curId()] = { from: v.from, to: v.to }; loadOverview(W.cur).catch(W.fail); };

  const ACC_TYPES = [['corrente', 'Conta corrente'], ['poupanca', 'Poupança'], ['pagamento', 'Conta de pagamento'], ['investimento', 'Conta de investimento']];
  const bankModal = (b) => {
    W.modal({ title: b ? 'Editar conta' : 'Nova conta bancária', wide: true, body: `<form class="stack" data-form="bank-save"><input type="hidden" name="id" value="${esc(b ? b.id : '')}"><input type="hidden" name="bank_code" value="${esc(b ? b.bank_code || '' : '')}">
      <div class="form-grid"><div class="field full"><label>Banco</label><div class="combo" data-combo="bank"><input class="input" name="bank" type="text" required autocomplete="off" placeholder="Digite o nome ou o código do banco" value="${esc(b ? (b.bank_code ? b.bank_code + ' · ' : '') + (b.bank || '') : '')}"><div class="combo-list" hidden></div></div></div>
        <div class="field"><label>Tipo de conta</label><select class="input" name="account_type">${W.opts(ACC_TYPES, b ? b.account_type : 'corrente', 'Escolha')}</select></div><div class="field"><label>Apelido da conta</label><input class="input" name="name" required minlength="2" value="${esc(b ? b.name : '')}" placeholder="Ex.: Itaú Empresa"></div>
        <div class="field"><label>Agência</label><input class="input" name="branch" inputmode="numeric" maxlength="6" value="${esc(b ? b.branch || '' : '')}" placeholder="0000"></div><div class="grid-2" style="gap:14px"><div class="field"><label>Conta</label><input class="input" name="account_number" inputmode="numeric" maxlength="12" value="${esc(b ? b.account_number || '' : '')}"></div><div class="field"><label>Dígito</label><input class="input" name="account_digit" maxlength="2" value="${esc(b ? b.account_digit || '' : '')}"></div></div>

        <input type="hidden" name="holder_name" value="${esc(b ? b.holder_name || '' : '')}"><input type="hidden" name="holder_doc" value="${esc(b ? b.holder_doc || '' : '')}"><input type="hidden" name="opening_balance" value="${b ? esc(W.num(b.opening_balance)) : '0,00'}"><input type="hidden" name="opening_date" value="${esc(b && b.opening_date ? b.opening_date : W.ymd())}"></div>
      <div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>` });
    const f = document.querySelector('form[data-form=bank-save]'), host = f.querySelector('[data-combo=bank]');
    host.__onType = () => { f.querySelector('input[name=bank_code]').value = ''; };
    W.combo(host, { fetch: (q) => W.rpc('w_bank_catalog_search', { p_q: q.replace(/^\d+\s*·\s*/, '') }), label: (x) => `${x.code} · ${x.name}`, sub: () => '', onPick: (x) => { f.querySelector('input[name=bank_code]').value = x.code; f.querySelector('input[name=bank]').dataset.name = x.name; } });
  };
  Object.assign(W.acts, {
    'bank-new': () => bankModal(null), 'bank-edit': (el) => bankModal(W.banks.find((b) => b.id === el.dataset.id)),
    'bank-del': async (el) => { if (!(await W.confirm('Excluir conta?', 'Só é possível se ela não tiver lançamentos.', 'Excluir', true))) return; await W.rpc('w_bank_delete', { p_wallet: curId(), p_id: el.dataset.id }); W.toast('Conta excluída'); W.refresh(); },
  });
  W.forms['bank-save'] = async (f) => { const v = W.form(f); await W.rpc('w_bank_save', { p_wallet: curId(), p: { id: v.id, name: v.name, bank: (f.querySelector('input[name=bank]').dataset.name || v.bank.replace(/^\d+\s*·\s*/, '')), bank_code: v.bank_code, account_type: v.account_type, branch: v.branch, account_number: v.account_number, account_digit: v.account_digit, holder_name: v.holder_name, holder_doc: v.holder_doc, opening_balance: W.parseNum(v.opening_balance) || 0, opening_date: v.opening_date } }); W.closeModal(); W.toast('Conta salva'); W.refresh(); };

  /* ================= Transações ================= */
  const sf = {};
  W.route('/w/:id/gastos/transacoes', async (ctx) => {
    const id = ctx.w.id; const f = sf[id] = sf[id] || (() => { const [a, b] = monthRange(); return { from: a, to: b, transfers: 'ocultar' }; })(); sf.page = 1;
    const [banks, cad, imps] = await Promise.all([W.rpc('w_bank_list', { p_wallet: id }), W.rpc('w_cad_list', { p_wallet: id }), W.rpc('w_imports_list', { p_wallet: id })]); const hist = imps.filter((i) => i.kind === 'extrato');
    W.banks = banks; W.cad = cad.cadastros;
    const by = (k) => cad.cadastros.filter((c) => c.kind === k);
    ctx.after = () => { W.cur = ctx; loadSpend(ctx); };
    return `${W.pageHead('Transações', 'Todas as movimentações, com filtros por contraparte, centro de custo, grupo, tipo, conta e data.', ctx.canWrite ? `<button class="btn secondary" data-act="spend-imp-open">${ico('upload')} Importar extrato</button>` : '')}
      <form class="filters" data-live="spend"><div class="field"><label>Período</label>${W.rangeHtml(f.from, f.to)}</div>
        <div class="field"><label>Tipo</label><select class="input" name="tipo">${W.opts([['receita', 'Receita'], ['despesa', 'Despesa']], f.tipo, 'Todos')}</select></div>
        <div class="field"><label>Conta</label><select class="input" name="account">${sel(banks, f.account, 'Todas')}</select></div>
        <div class="field"><label>Contraparte</label><select class="input" name="counterparty" data-search>${sel(by('contraparte'), f.counterparty, 'Todas')}</select></div>
        <div class="field"><label>Centro de custo</label><select class="input" name="centro" data-search>${sel(by('centro'), f.centro, 'Todos')}</select></div>
        <div class="field"><label>Grupo</label><select class="input" name="grupo" data-search>${sel(by('grupo'), f.grupo, 'Todos')}</select></div>
        <div class="field"><label>Transferências</label><select class="input" name="transfers">${W.opts([['ocultar', 'Ocultar'], ['so', 'Só transferências']], f.transfers, 'Mostrar')}</select></div>
        <div class="field grow"><label>Buscar</label><input class="input" type="search" name="q" value="${esc(f.q || '')}" placeholder="Descrição…"></div></form>
      <div class="kpis" id="sp-kpis"></div><div class="card flush"><div class="table-wrap"><table class="tight"><thead><tr><th>Data</th><th>Descrição</th><th>Conta</th><th>Contraparte</th><th>Centro de custo</th><th>Grupo</th><th class="num">Valor</th><th></th></tr></thead><tbody id="sp-body"></tbody></table></div><div class="pager-bar" id="sp-pager"></div></div>
      ${hist.length ? `<div class="card flush" style="margin-top:16px"><div class="card-head" style="padding:18px 24px 0"><h2>Importações anteriores</h2></div><div class="table-wrap"><table class="tight"><thead><tr><th>Data</th><th>Arquivo</th><th class="num">Linhas</th><th class="num">Novas</th><th class="num">Repetidas</th></tr></thead><tbody>${hist.map((x) => `<tr><td>${W.dtm(x.at)}</td><td>${esc(x.filename || '—')}</td><td class="num">${x.total}</td><td class="num">${x.new}</td><td class="num">${x.dup}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  });
  async function loadSpend(ctx) {
    const id = ctx.w.id; const f = sf[id]; const r = await W.rpc('w_spend_list', { p_wallet: id, p_filters: f, p_page: sf.page || 1 }); W.spRows = r.rows;
    if (!document.getElementById('sp-kpis')) return; // o usuário já saiu da tela
    document.getElementById('sp-kpis').innerHTML = `<div class="kpi"><div class="kpi-label">Receitas</div><div class="big pos">${W.brl(r.receitas)}</div></div><div class="kpi"><div class="kpi-label">Despesas</div><div class="big">${W.brl(-r.despesas)}</div></div><div class="kpi"><div class="kpi-label">Saldo</div><div class="big ${W.cls(Number(r.receitas) + Number(r.despesas))}">${W.brl(Number(r.receitas) + Number(r.despesas))}</div></div>`;
    document.getElementById('sp-body').innerHTML = r.rows.length ? r.rows.map((t) => `<tr><td class="nowrap">${W.dt(t.date)}</td><td>${esc(t.description)}${t.is_transfer ? ` ${tag('Transferência')}` : ''}</td><td>${esc(t.account)}</td><td>${esc(catName(W.cad, t.counterparty_id) || '—')}</td><td>${esc(catName(W.cad, t.cost_center_id) || '—')}</td><td>${esc(catName(W.cad, t.group_id) || '—')}</td><td class="num ${W.cls(t.amount)}"><b>${W.brl(t.amount)}</b></td><td class="actions">${ctx.canWrite ? `<button class="btn ghost sm" data-act="sp-edit" data-id="${esc(t.id)}" aria-label="Classificar">${ico('pencil')}</button><button class="btn ghost sm" data-act="sp-del" data-id="${esc(t.id)}" aria-label="Excluir">${ico('trash')}</button>` : ''}</td></tr>`).join('') : `<tr><td colspan="8">${empty('Nenhuma transação com esses filtros.')}</td></tr>`;
    const pages = Math.max(1, Math.ceil(r.total / 50)), pg = r.page;
    document.getElementById('sp-pager').innerHTML = `<span>${r.total} lançamentos · 50 por página</span><div class="pager"><button class="btn secondary sm" data-act="sp-page" aria-label="Página anterior" data-n="${pg - 1}"${pg <= 1 ? ' disabled' : ''}>${ico('left')}</button><span>${pg} / ${pages}</span><button class="btn secondary sm" data-act="sp-page" aria-label="Próxima página" data-n="${pg + 1}"${pg >= pages ? ' disabled' : ''}>${ico('right')}</button></div>`;
  }
  W.live.spend = (form) => { const v = W.form(form); sf[curId()] = { from: v.from, to: v.to, tipo: v.tipo, account: v.account, counterparty: v.counterparty, centro: v.centro, grupo: v.grupo, transfers: v.transfers, q: v.q }; sf.page = 1; loadSpend(W.cur).catch(W.fail); };
  W.acts['sp-page'] = (el) => { sf.page = Number(el.dataset.n); loadSpend(W.cur).catch(W.fail); };
  W.acts['sp-del'] = async (el) => { if (!(await W.confirm('Excluir lançamento?', 'O saldo da conta será recalculado.', 'Excluir', true))) return; await W.rpc('w_spend_delete', { p_wallet: curId(), p_id: el.dataset.id }); W.toast('Lançamento excluído'); loadSpend(W.cur); };
  W.acts['sp-edit'] = (el) => {
    const t = W.spRows.find((x) => x.id === el.dataset.id); const by = (k) => W.cad.filter((c) => c.kind === k);
    W.modal({ title: 'Classificar lançamento', sub: `${W.dt(t.date)} · ${W.brl(t.amount)}`, body: `<form class="stack" data-form="sp-save"><input type="hidden" name="id" value="${esc(t.id)}"><div class="note-box" style="background:var(--soft);color:var(--ink)">${esc(t.description)}</div>
      <div class="field"><label>Contraparte</label><select class="input" name="counterparty_id" data-search>${sel(by('contraparte'), t.counterparty_id, '—')}</select></div><div class="field"><label>Centro de custo</label><select class="input" name="cost_center_id" data-search>${sel(by('centro'), t.cost_center_id, '—')}</select></div><div class="field"><label>Grupo</label><select class="input" name="group_id" data-search>${sel(by('grupo'), t.group_id, '—')}</select></div>
      <label class="check"><input type="checkbox" name="is_transfer"${t.is_transfer ? ' checked' : ''}> <span>É transferência entre minhas contas</span></label><label class="check"><input type="checkbox" name="rule"> <span>Criar regra: classificar assim toda vez que a descrição for igual</span></label>
      <div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>` });
  };
  W.forms['sp-save'] = async (f) => { const v = W.form(f); await W.rpc('w_spend_update', { p_wallet: curId(), p_id: v.id, p: { counterparty_id: v.counterparty_id, cost_center_id: v.cost_center_id, group_id: v.group_id, is_transfer: !!f.querySelector('[name=is_transfer]').checked }, p_make_rule: !!f.querySelector('[name=rule]').checked }); W.closeModal(); W.toast('Lançamento classificado'); loadSpend(W.cur); };

  /* ================= Importar extrato (popup) ================= */
  W.acts['spend-imp-open'] = async () => {
    const id = curId(); const banks = await W.rpc('w_bank_list', { p_wallet: id });
    if (!banks.length) { W.modal({ title: 'Importar extrato', body: '<p>Cadastre primeiro uma conta bancária: o extrato é importado para uma conta da carteira.</p>', foot: '<button class="btn secondary" data-act="modal-close">Fechar</button><button class="btn" data-act="bank-new-from-imp">Cadastrar conta</button>' }); return; }
    W.modal({ title: 'Importar extrato', wide: true, body: `<p class="muted small">Arraste o extrato do banco (OFX ou CSV). Repetidos são ignorados e o agrupamento é automático pelas suas regras.</p><div class="field" style="margin-top:14px"><label>Conta</label><select class="input" id="imp-acc">${sel(banks, '')}</select></div><div id="imp-host" style="margin-top:14px"></div>` });
    W.importUI(document.getElementById('imp-host'), { mode: 'extrato', label: 'Arraste o extrato aqui (OFX ou CSV)', onImport: async (rows, name) => {
      const acc = document.getElementById('imp-acc').value; const r = await W.rpc('w_spend_import', { p_wallet: id, p_account: acc, p_filename: name, p_rows: rows });
      return `<p><b>${r.new}</b> lançamentos novos · ${r.duplicates} já existiam (ignorados) · ${r.invalid} inválidos.${r.transfers ? ` <b>${r.transfers}</b> transferências entre suas contas foram identificadas.` : ''}</p><p class="muted small">As regras de classificação já foram aplicadas.</p><button class="btn" data-act="imp-done">Concluir</button>`; } });
  };
  W.acts['bank-new-from-imp'] = () => { W.closeModal(); bankModal(null); };

  /* ================= Cadastros e regras ================= */
  W.route('/w/:id/gastos/cadastros', async (ctx) => {
    const id = ctx.w.id; const d = await W.rpc('w_cad_list', { p_wallet: id }); W.cad = d.cadastros; W.rules = d.rules; ctx.after = () => { W.cur = ctx; };
    const list = (k) => { const l = d.cadastros.filter((c) => c.kind === k); return `<div class="card flush"><div class="card-head" style="padding:18px 24px 0"><h2>${AXES[k]}</h2>${ctx.canWrite ? `<button class="btn secondary sm" data-act="cad-new" data-kind="${k}">${ico('plus')} Novo</button>` : ''}</div>${l.length ? `<div class="table-wrap"><table class="tight"><tbody>${l.map((c) => `<tr><td>${esc(c.name)}${c.document ? `<div class="muted small">${esc(c.document)}</div>` : ''}</td><td class="num muted small">${c.uses} lançamentos</td><td class="actions">${ctx.canWrite ? `<button class="btn ghost sm" data-act="cad-edit" data-id="${esc(c.id)}" aria-label="Editar">${ico('pencil')}</button><button class="btn ghost sm" data-act="cad-del" data-id="${esc(c.id)}" aria-label="Excluir">${ico('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('Nada cadastrado.')}</div>`; };
    const SIGN = { any: 'Qualquer valor', in: 'Só receitas', out: 'Só despesas' }, MK = { contem: 'contém', igual: 'é igual a', comeca: 'começa com' };
    return `${W.pageHead('Cadastros e regras', 'Contrapartes, centros de custo e grupos são eixos independentes. As regras classificam os lançamentos importados.', ctx.canWrite ? `<button class="btn secondary" data-act="rules-apply">${ico('refresh')} Reaplicar regras</button>` : '')}
      <div class="grid-2" style="margin-bottom:16px">${list('contraparte')}${list('centro')}${list('grupo')}</div>
      <div class="card flush"><div class="card-head" style="padding:18px 24px 0"><h2>Regras de classificação</h2>${ctx.canWrite ? `<button class="btn sm" data-act="rule-new">${ico('plus')} Nova regra</button>` : ''}</div>
      ${d.rules.length ? `<div class="table-wrap"><table class="tight"><thead><tr><th>Se a descrição…</th><th>Valor</th><th>Contraparte</th><th>Centro de custo</th><th>Grupo</th><th>Ordem</th><th></th></tr></thead><tbody>${d.rules.map((r) => `<tr><td>${MK[r.match_kind]} <b>${esc(r.match_text)}</b>${r.active ? '' : ` ${tag('Inativa')}`}</td><td>${SIGN[r.sign]}</td><td>${esc(catName(d.cadastros, r.counterparty_id) || '—')}</td><td>${esc(catName(d.cadastros, r.cost_center_id) || '—')}</td><td>${esc(catName(d.cadastros, r.group_id) || '—')}</td><td>${r.priority}</td><td class="actions">${ctx.canWrite ? `<button class="btn ghost sm" data-act="rule-edit" data-id="${esc(r.id)}" aria-label="Editar">${ico('pencil')}</button><button class="btn ghost sm" data-act="rule-del" data-id="${esc(r.id)}" aria-label="Excluir">${ico('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div><p class="muted small" style="padding:0 24px 16px">Regras de menor número rodam primeiro; cada eixo é preenchido pela primeira regra que o atinge e nunca sobrescreve o que você já classificou.</p>` : empty('Nenhuma regra. Ao classificar um lançamento, marque “criar regra”.')}</div>`;
  });
  const cadModal = (kind, c) => W.modal({ title: `${c ? 'Editar' : 'Novo(a)'} ${AXES[kind].toLowerCase()}`, body: `<form class="stack" data-form="cad-save"><input type="hidden" name="id" value="${esc(c ? c.id : '')}"><input type="hidden" name="kind" value="${kind}"><div class="field"><label>Nome</label><input class="input" name="name" required minlength="2" value="${esc(c ? c.name : '')}"></div>${kind === 'contraparte' ? `<div class="field"><label>CPF/CNPJ (opcional)</label><input class="input" name="document" value="${esc(c ? c.document || '' : '')}"></div>` : ''}<div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>` });
  Object.assign(W.acts, {
    'cad-new': (el) => cadModal(el.dataset.kind, null), 'cad-edit': (el) => { const c = W.cad.find((x) => x.id === el.dataset.id); cadModal(c.kind, c); },
    'cad-del': async (el) => { if (!(await W.confirm('Excluir cadastro?', 'Os lançamentos que o usam ficam sem esse dado.', 'Excluir', true))) return; await W.rpc('w_cad_delete', { p_wallet: curId(), p_id: el.dataset.id }); W.toast('Excluído'); W.refresh(); },
    'rules-apply': async (el) => { await W.busy(el, async () => { const r = await W.rpc('w_rules_reapply', { p_wallet: curId() }); W.toast('Regras reaplicadas', `${r.updated} lançamentos atualizados.`); }); },
    'rule-new': () => ruleModal(null), 'rule-edit': (el) => ruleModal(W.rules.find((r) => r.id === el.dataset.id)),
    'rule-del': async (el) => { if (!(await W.confirm('Excluir regra?', 'Os lançamentos já classificados continuam como estão.', 'Excluir', true))) return; await W.rpc('w_rule_delete', { p_wallet: curId(), p_id: el.dataset.id }); W.toast('Regra excluída'); W.refresh(); },
  });
  W.forms['cad-save'] = async (f) => { const v = W.form(f); await W.rpc('w_cad_save', { p_wallet: curId(), p_kind: v.kind, p_id: v.id || null, p_name: v.name, p_document: v.document || null }); W.closeModal(); W.toast('Salvo'); W.refresh(); };
  function ruleModal(r) {
    const by = (k) => W.cad.filter((c) => c.kind === k);
    W.modal({ title: r ? 'Editar regra' : 'Nova regra', body: `<form class="stack" data-form="rule-save"><input type="hidden" name="id" value="${esc(r ? r.id : '')}"><div class="form-grid"><div class="field"><label>Descrição</label><select class="input" name="match_kind">${W.opts([['contem', 'contém'], ['igual', 'é igual a'], ['comeca', 'começa com']], r ? r.match_kind : 'contem')}</select></div><div class="field"><label>Texto</label><input class="input" name="match_text" required minlength="2" value="${esc(r ? r.match_text : '')}"></div>
      <div class="field"><label>Valor</label><select class="input" name="sign">${W.opts([['any', 'Qualquer'], ['in', 'Só receitas'], ['out', 'Só despesas']], r ? r.sign : 'any')}</select></div><div class="field"><label>Ordem (menor roda primeiro)</label><input class="input" name="priority" inputmode="numeric" value="${r ? r.priority : 100}"></div>
      <div class="field"><label>Contraparte</label><select class="input" name="counterparty_id" data-search>${sel(by('contraparte'), r && r.counterparty_id, '—')}</select></div><div class="field"><label>Centro de custo</label><select class="input" name="cost_center_id" data-search>${sel(by('centro'), r && r.cost_center_id, '—')}</select></div><div class="field"><label>Grupo</label><select class="input" name="group_id" data-search>${sel(by('grupo'), r && r.group_id, '—')}</select></div>
      <label class="check"><input type="checkbox" name="active"${!r || r.active ? ' checked' : ''}> <span>Regra ativa</span></label></div><div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>` });
  }
  W.forms['rule-save'] = async (f) => { const v = W.form(f); await W.rpc('w_rule_save', { p_wallet: curId(), p: { id: v.id, match_kind: v.match_kind, match_text: v.match_text, sign: v.sign, priority: v.priority, counterparty_id: v.counterparty_id, cost_center_id: v.cost_center_id, group_id: v.group_id, active: !!f.querySelector('[name=active]').checked } }); W.closeModal(); W.toast('Regra salva'); W.refresh(); };
})();
