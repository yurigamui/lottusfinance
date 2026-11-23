/* Lottus Wealth — Relatórios e Acessos (menu Patrimônio) e Configurações da carteira. */
(function () {
  'use strict';
  const { esc, ico, tag } = W;
  const curId = () => W.curId();
  const empty = (t) => `<div class="empty">${esc(t)}</div>`;
  const ROLE_HELP = { visualizador: 'Vê tudo e extrai relatórios.', editor: 'Visualizador + adiciona, edita e exclui transações, investimentos e lançamentos.', gestor: 'Editor + cria e remove acessos, altera alçadas e configura a carteira.' };

  /* ================= Relatórios ================= */
  W.route('/w/:id/relatorios', async (ctx) => {
    const id = ctx.w.id; ctx.after = () => { W.cur = ctx; };
    const card = (k, icon, t, d, period) => `<form class="card stack" data-form="report" data-kind="${k}"><span class="org-mark">${ico(icon)}</span><div><h3>${t}</h3><p class="muted small">${d}</p></div>${period ? `<div class="field"><label>Período</label>${W.rangeHtml('', '')}</div>` : ''}<div class="row"><button class="btn sm" type="submit" name="fmt" value="csv">${ico('download')} Planilha (CSV)</button>${k === 'posicao' ? `<button class="btn secondary sm" type="submit" name="fmt" value="print">${ico('file')} Imprimir / PDF</button>` : ''}</div></form>`;
    return `${W.pageHead('Relatórios', 'Extraia os dados da carteira. Disponível para todas as alçadas.')}
      <div class="grid-2">${card('posicao', 'trend', 'Patrimônio e posição', `Patrimônio líquido e posição por ativo hoje, na visão ${ctx.w.view_mode === 'mercado' ? 'a mercado' : 'na curva'} (padrão da carteira).`, false)}${card('invest', 'list', 'Transações de investimentos', 'Compras, vendas e proventos do período.', true)}${card('gastos', 'receipt', 'Extrato de gastos', 'Todos os lançamentos classificados, do período.', true)}</div>`;
  });
  document.addEventListener('submit', (e) => { const f = e.target.closest('form[data-form=report]'); if (f) f._fmt = e.submitter ? e.submitter.value : 'csv'; }, true);
  W.forms.report = async (f, e) => {
    const id = curId(); const kind = f.dataset.kind; const fmt = (e.submitter && e.submitter.value) || f._fmt || 'csv'; const v = W.form(f); const name = (W.state.wallets.find((w) => w.id === id) || {}).name || 'carteira';
    const stamp = W.ymd(); const file = (n) => `lottus-wealth_${name.replace(/[^\w]+/g, '-').toLowerCase()}_${n}_${stamp}.csv`;
    if (kind === 'posicao') {
      const [nw, pos] = await Promise.all([W.rpc('w_networth', { p_wallet: id }), W.rpc('w_positions', { p_wallet: id })]);
      const vis = nw.mode === 'mercado' ? 'A mercado' : 'Na curva';
      if (fmt === 'csv') return W.download(file('posicao'), W.csv([['Ativo', 'Tipo', 'Quantidade', 'PU médio', `PU (${vis.toLowerCase()})`, 'Data do PU', 'Valor', 'Resultado', 'Peso'], ...pos.map((p) => [p.ticker || p.name, W.ASSET_KIND[p.kind] || p.kind, p.qty, p.avg_pu, p.pu_view, p.pu_date, p.value, p.result, p.weight]), [], ['Visão', vis], ['Patrimônio líquido', nw.total], ['Investimentos', nw.investimentos], ['Contas', nw.contas]]));
      return printReport(name, nw, pos);
    }
    if (kind === 'invest') {
      const rows = []; for (let p = 1; p <= 200; p++) { const r = await W.rpc('w_tx_list', { p_wallet: id, p_filters: { from: v.from, to: v.to }, p_page: p }); rows.push(...r.rows); if (rows.length >= r.total) break; }
      return W.download(file('investimentos'), W.csv([['Data', 'Tipo', 'Ativo', 'Quantidade', 'PU', 'Total', 'Custodiante', 'Origem'], ...rows.map((t) => [t.date, t.kind, t.ticker || t.asset, t.qty, t.unit_price, t.total, t.custodian, t.source])]));
    }
    if (kind === 'gastos') {
      const cad = (await W.rpc('w_cad_list', { p_wallet: id })).cadastros; const nm = (x) => (cad.find((c) => c.id === x) || {}).name || '';
      const rows = []; for (let p = 1; p <= 400; p++) { const r = await W.rpc('w_spend_list', { p_wallet: id, p_filters: { from: v.from, to: v.to }, p_page: p }); rows.push(...r.rows); if (rows.length >= r.total) break; }
      return W.download(file('gastos'), W.csv([['Data', 'Conta', 'Descrição', 'Valor', 'Tipo', 'Contraparte', 'Centro de custo', 'Grupo', 'Transferência'], ...rows.map((t) => [t.date, t.account, t.description, t.amount, t.amount >= 0 ? 'Receita' : 'Despesa', nm(t.counterparty_id), nm(t.cost_center_id), nm(t.group_id), t.is_transfer ? 'Sim' : ''])]));
    }
  };
  function printReport(name, nw, pos) {
    const root = document.createElement('div'); root.id = 'print-root';
    root.innerHTML = `<h1>${esc(name)}</h1><p>Lottus Wealth · posição em ${W.dt(W.ymd())}</p><h2>Patrimônio (${nw.mode === 'mercado' ? 'a mercado' : 'na curva'})</h2><table><tbody><tr><td>Investimentos</td><td class="num">${W.brl(nw.investimentos)}</td></tr><tr><td>Contas</td><td class="num">${W.brl(nw.contas)}</td></tr><tr><td><b>Patrimônio líquido</b></td><td class="num"><b>${W.brl(nw.total)}</b></td></tr></tbody></table>
      <h2>Posição</h2><table><thead><tr><th>Ativo</th><th class="num">Qtd</th><th class="num">P.U.</th><th class="num">Valor</th><th class="num">Resultado</th><th class="num">Peso</th></tr></thead><tbody>${pos.map((p) => `<tr><td>${esc(p.ticker || p.name)}</td><td class="num">${W.qty(p.qty)}</td><td class="num">${W.num(p.pu_view, 4)}</td><td class="num">${W.brl(p.value)}</td><td class="num">${W.brl(p.result)}</td><td class="num">${W.pct(p.weight, 1)}</td></tr>`).join('')}</tbody></table>
      <p class="small">Valores informados com base nos P.U. mais recentes disponíveis; renda fixa ${nw.mode === 'mercado' ? 'pelo preço estimado de mercado' : 'pela curva contratada'}. Documento informativo, sem valor de extrato oficial de custódia.</p>`;
    document.body.appendChild(root); window.addEventListener('afterprint', () => root.remove(), { once: true }); setTimeout(() => window.print(), 50);
  }

  /* ================= Acessos ================= */
  W.route('/w/:id/acessos', async (ctx) => {
    const id = ctx.w.id; const ger = ctx.w.role === 'gestor' && !ctx.w.read_only;
    const [members, invites, log] = await Promise.all([W.rpc('w_members_list', { p_wallet: id }), ctx.w.role === 'gestor' ? W.rpc('w_invites_list', { p_wallet: id }) : [], ctx.w.role === 'gestor' ? W.rpc('w_access_log', { p_wallet: id }) : []]);
    W.members = members; ctx.after = () => { W.cur = ctx; };
    const ACT = { wallet_created: 'Criou a carteira', wallet_updated: 'Alterou a carteira', wallet_archived: 'Arquivou a carteira', invite_created: 'Convidou alguém', invite_accepted: 'Aceitou o convite', invite_declined: 'Recusou o convite', invite_cancelled: 'Cancelou um convite', member_role: 'Alterou uma alçada', member_removed: 'Removeu um acesso', tx_saved: 'Salvou transação de investimento', tx_deleted: 'Excluiu transação de investimento', import_invest: 'Importou investimentos', import_spend: 'Importou extrato', asset_saved: 'Salvou ativo', price_set: 'Informou valor de ativo', bank_saved: 'Salvou conta bancária', bank_deleted: 'Excluiu conta bancária', cad_saved: 'Salvou cadastro', cad_deleted: 'Excluiu cadastro', rule_saved: 'Salvou regra', rule_deleted: 'Excluiu regra', rules_reapplied: 'Reaplicou regras', spend_updated: 'Classificou lançamento', spend_deleted: 'Excluiu lançamento', other_saved: 'Salvou bem/dívida', other_deleted: 'Excluiu bem/dívida' };
    return `${W.pageHead('Acessos', 'Quem enxerga e edita esta carteira.', ger ? `<button class="btn" data-act="invite-new">${ico('plus')} Convidar pessoa</button>` : '')}
      <div class="banner info">${ico('shield')}<div class="grow"><b>Visualizador</b>: ${ROLE_HELP.visualizador} · <b>Editor</b>: ${ROLE_HELP.editor} · <b>Gestor</b>: ${ROLE_HELP.gestor}</div></div>
      <div class="card flush"><div class="table-wrap"><table><thead><tr><th>Pessoa</th>${ctx.w.role === 'gestor' ? '<th>E-mail</th><th>CPF</th>' : ''}<th>Alçada</th><th>Desde</th><th></th></tr></thead><tbody>${members.map((m) => `<tr><td><b>${esc(m.name)}</b> ${m.is_me ? tag('Você') : ''} ${m.is_owner ? tag('Titular da cobrança', 'brand') : ''}</td>${ctx.w.role === 'gestor' ? `<td>${esc(m.email || '—')}</td><td>${esc(W.cpfMasked(m.cpf))}</td>` : ''}<td>${ger ? `<select class="inline" data-role-user="${esc(m.user_id)}" aria-label="Alçada"${m.is_owner ? ' disabled title="O titular da cobrança continua como gestor"' : ''}>${W.opts(Object.entries(W.ROLE), m.role)}</select>` : esc(W.ROLE[m.role])}</td><td>${W.dt(m.since)}</td><td class="actions">${ger && !(m.is_me && m.is_owner) ? `<button class="btn danger sm" data-act="member-rm" data-id="${esc(m.user_id)}" data-owner="${m.is_owner ? 1 : 0}" data-me="${m.is_me ? 1 : 0}">${m.is_me ? 'Sair' : 'Remover'}</button>` : !ger && m.is_me && !m.is_owner ? '<button class="btn danger sm" data-act="wallet-leave">Sair da carteira</button>' : ''}</td></tr>`).join('')}</tbody></table></div></div>
      ${ctx.w.role !== 'gestor' ? '<p class="muted small" style="margin-top:12px">Por privacidade, e-mail e CPF das outras pessoas só aparecem para gestores.</p>' : ''}
      ${invites.length ? `<div class="card flush" style="margin-top:16px"><div class="card-head" style="padding:18px 24px 0"><h2>Convites pendentes</h2></div><div class="table-wrap"><table class="tight"><thead><tr><th>Nome</th><th>E-mail</th><th>Alçada</th><th>Vale até</th><th></th></tr></thead><tbody>${invites.map((i) => `<tr><td>${esc(i.name)}</td><td class="mono">${esc(i.email)}</td><td>${esc(W.ROLE[i.role])}</td><td>${W.dt(i.expires_at)}</td><td class="actions">${ger ? `<button class="btn ghost sm" data-act="invite-cancel" data-id="${esc(i.id)}">Cancelar</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      ${ctx.w.role === 'gestor' ? `<div class="card flush" style="margin-top:16px"><div class="card-head" style="padding:18px 24px 0"><h2>Registro de acessos e alterações</h2><span class="muted small">Últimos 200 eventos</span></div>${log.length ? `<div class="table-wrap"><table class="tight"><thead><tr><th>Quando</th><th>Quem</th><th>O que</th></tr></thead><tbody>${log.map((l) => `<tr><td class="nowrap">${W.dtm(l.at)}</td><td>${esc(l.user)}</td><td>${esc(ACT[l.action] || l.action)}</td></tr>`).join('')}</tbody></table></div>` : empty('Sem eventos.')}</div>` : ''}`;
  });
  document.addEventListener('change', async (e) => {
    const s = e.target.closest('select[data-role-user]'); if (!s) return;
    try { await W.rpc('w_member_set_role', { p_wallet: curId(), p_user: s.dataset.roleUser, p_role: s.value }); W.toast('Alçada alterada'); W.refresh(); } catch (err) { W.fail(err); W.refresh(); }
  });
  W.acts['invite-new'] = () => W.modal({ title: 'Convidar pessoa', sub: 'O acesso só começa quando a pessoa aceitar o convite.', body: `<form class="stack" data-form="invite-save"><div class="form-grid"><div class="field full"><label>Nome</label><input class="input" name="name" required minlength="3"></div><div class="field"><label>CPF</label><input class="input" name="cpf" data-mask="cpf" inputmode="numeric" maxlength="14" required></div><div class="field"><label>E-mail</label><input class="input" name="email" type="email" required></div>
    <div class="field full"><label>Alçada</label><select class="input" name="role">${W.opts(Object.entries(W.ROLE), 'visualizador')}</select></div></div><div class="help">Se este CPF já tiver conta no Lottus Wealth, o convite vai para o e-mail que a pessoa cadastrou (mostramos só uma versão parcial).</div><div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn" type="submit">Enviar convite</button></div></form>` });
  W.forms['invite-save'] = async (f) => {
    const v = W.form(f); const r = await W.rpc('w_invite_create', { p_wallet: curId(), p_name: v.name, p_cpf: v.cpf, p_email: v.email, p_role: v.role });
    W.modal({ title: 'Convite enviado', body: `<p>O convite foi para <b class="mono">${esc(r.email)}</b>.${r.existing_account ? ' Esse CPF já tem conta; usamos o e-mail cadastrado.' : ''}</p>${r.email_sent ? '' : '<div class="note-box">Não conseguimos enviar o e-mail agora. Cancele o convite e tente de novo em instantes.</div>'}`, foot: '<button class="btn" data-act="invite-done">Ok</button>' });
  };
  W.acts['invite-done'] = () => { W.closeModal(); W.refresh(); };
  W.acts['invite-cancel'] = async (el) => { await W.rpc('w_invite_cancel', { p_wallet: curId(), p_invite: el.dataset.id }); W.toast('Convite cancelado'); W.refresh(); };
  W.acts['member-rm'] = async (el) => {
    const m = W.members.find((x) => x.user_id === el.dataset.id); const owner = el.dataset.owner === '1';
    const msg = owner ? `${m.name} é o titular da cobrança. Se você remover, a cobrança desta carteira passa a ser sua${W.state.me.profile.plan !== 'gratis' ? '' : ' (no plano Grátis, só se você não tiver outra carteira)'}.` : 'A pessoa perde o acesso imediatamente.';
    if (!(await W.confirm(`Remover ${m.name}?`, msg, 'Remover', true))) return;
    const r = await W.rpc('w_member_remove', { p_wallet: curId(), p_user: el.dataset.id }); W.state.wallets = []; W.toast('Acesso removido', r.owner_changed ? 'Você agora é o titular da cobrança.' : ''); if (el.dataset.me === '1') W.go('/carteiras'); else W.refresh();
  };
  W.acts['wallet-leave'] = async () => { if (!(await W.confirm('Sair da carteira?', 'Você perde o acesso. Um gestor pode convidar você de novo.', 'Sair', true))) return; await W.rpc('w_wallet_leave', { p_wallet: curId() }); W.state.wallets = []; W.toast('Você saiu da carteira'); W.go('/carteiras'); };

  /* ================= Configurações ================= */
  const BMS = [['CDI', 'CDI'], ['IPCA', 'IPCA (inflação)'], ['nenhum', 'Nenhum']];
  W.route('/w/:id/config', async (ctx) => {
    const w = ctx.w; if (w.role !== 'gestor') return `${W.pageHead('Configurações', '')}<div class="card center"><h2>Só gestores acessam esta tela.</h2><p class="muted">Peça a um gestor da carteira para mudar nome, benchmark, marca ou excluir.</p><a class="btn" href="#/w/${esc(w.id)}/patrimonio">Voltar ao Patrimônio</a></div>`;
    ctx.after = () => { W.cur = ctx; };
    const pr = W.state.me.profile; const fund = pr.plan === 'fund'; const groupsOk = pr.plan !== 'gratis';
    const mine = (w.groups || []).filter((g) => g.mine); const others = (w.groups || []).filter((g) => !g.mine);
    let brand;
    if (!mine.length && others.length) brand = `<div class="card stack"><h2>Marca</h2><p class="muted small">Esta carteira está no grupo <b>${esc(others[0].name)}</b>, de outra pessoa; a marca é definida por quem criou o grupo.</p></div>`;
    else if (!fund) brand = `<div class="card stack"><div class="row between"><div><h2>Marca</h2><div class="muted small">Logo, cores e estilo no lugar das iniciais, para todas as pessoas com acesso.</div></div>${tag('Plano Fund', 'brand')}</div><div><a class="btn secondary" href="#/conta?aba=plano">Conhecer o plano Fund</a></div></div>`;
    else if (mine.length) {
      const g = await W.rpc('w_group_get', { p_id: mine[0].id });
      brand = `<div class="note-box" style="margin-top:16px">A marca pertence ao grupo <b>${esc(g.name)}</b> (${g.wallets.length} ${g.wallets.length === 1 ? 'carteira' : 'carteiras'}) e vale para todas as carteiras dele. <a href="#/grupos/${esc(g.id)}">Abrir o grupo</a></div>${W.brandHtml(g)}`;
    } else if (others.length) brand = `<div class="card stack"><h2>Marca</h2><p class="muted small">Esta carteira está no grupo <b>${esc(others[0].name)}</b>, de outra pessoa; a marca é definida por quem criou o grupo.</p></div>`;
    else {
      const gl = await W.rpc('w_groups_list');
      brand = `<form class="card stack" data-form="brand-group"><div><h2>Marca</h2><div class="muted small">A marca é de um grupo de carteiras. Coloque esta carteira num grupo para definir logo, cores e estilo.</div></div>
        ${gl.groups.length ? `<div class="field"><label for="bg-sel">Grupo</label><select class="input" id="bg-sel" name="group">${W.opts([['', 'Criar um grupo novo'], ...gl.groups.map((g) => [g.id, g.name])], '')}</select></div>` : '<input type="hidden" name="group" value="">'}
        <div class="field" id="bg-new"><label for="bg-name">Nome do novo grupo</label><input class="input" id="bg-name" name="name" minlength="2" maxlength="80" value="${esc(w.name)}"></div>
        <div><button class="btn" type="submit">Colocar no grupo e definir a marca</button></div></form>`;
    }
    return `${W.pageHead('Configurações', 'Portfólio, marca e exclusão desta carteira.')}
      <div class="grid-2"><form class="card stack" data-form="wallet-settings"><h2>Portfólio</h2>
        <div class="field"><label for="ws-name">Nome do portfólio</label><input class="input" id="ws-name" name="name" required minlength="2" maxlength="80" value="${esc(w.name)}"><div class="help">Nome da pessoa ou empresa dona do patrimônio.</div></div>
        <div class="field"><label for="ws-bm">Benchmark</label><select class="input" id="ws-bm" name="benchmark">${W.opts(BMS, w.benchmark || 'CDI')}</select><div class="help">Índice para comparar o resultado: mostramos quanto os mesmos aportes renderiam nele.</div></div>
        <div class="field"><label for="ws-vm">Visão padrão dos preços</label><select class="input" id="ws-vm" name="view_mode">${W.opts([['curva', 'Na curva (taxa contratada)'], ['mercado', 'A mercado (preço de venda hoje)']], w.view_mode || 'curva')}</select><div class="help">Vale para todos que acessam e para relatórios e API. Em cada tela dá para alternar na hora.</div></div>
        <div><button class="btn" type="submit"${w.read_only ? ' disabled' : ''}>Salvar</button></div></form>
      <div class="card stack"><h2>Cobrança</h2><p class="muted small">Titular da cobrança: <b>${esc(w.is_owner ? 'você' : w.owner_name || '—')}</b>. A mensalidade desta carteira é cobrada do titular. Se o titular for removido por outro gestor, quem removeu passa a ser o titular.</p><a class="btn secondary" href="#/conta?aba=plano">Ver plano e faturas</a>
        ${groupsOk ? '' : '<p class="muted small">Grupos de carteiras e marca própria estão nos planos pagos.</p>'}</div></div>
      <div style="margin-top:16px">${brand}</div>
      ${w.is_owner ? `<div class="card stack danger-zone" style="margin-top:16px"><h2>Arquivar ou excluir</h2>
        <div class="row between"><div><b>Arquivar</b><div class="muted small">A carteira some da lista de todos e deixa de ser cobrada. Os dados ficam guardados; a equipe Lottus pode reativar.</div></div><button class="btn secondary" data-act="wallet-archive"${w.read_only ? ' disabled' : ''}>Arquivar</button></div>
        <div class="row between"><div><b>Excluir de vez</b><div class="muted small">Apaga a carteira, os lançamentos, as contas, os ativos personalizados e os acessos. Não dá para desfazer. Faturas já emitidas continuam na sua conta.</div></div><button class="btn danger" data-act="wallet-delete">Excluir carteira</button></div></div>` : '<p class="muted small" style="margin-top:16px">Só o titular da cobrança pode arquivar ou excluir esta carteira.</p>'}`;
  });
  W.forms['wallet-settings'] = async (f) => { const v = W.form(f); const nm = f.querySelector('[name=name]'); W.fieldError(nm, ''); const n = String(v.name || '').trim(); if (n.length < 2 || n.length > 80) W.fieldFail(nm, 'O nome precisa ter de 2 a 80 caracteres.'); await W.rpc('w_wallet_settings_save', { p_wallet: curId(), p: { name: v.name, benchmark: v.benchmark, view_mode: v.view_mode } }); W.state.wallets = []; W.toast('Configurações salvas'); W.refresh(); };
  document.addEventListener('change', (e) => { if (e.target.id === 'bg-sel') { const n = document.getElementById('bg-new'); if (n) n.hidden = !!e.target.value; } });
  W.forms['brand-group'] = async (f) => {
    const v = W.form(f); const id = curId();
    if (v.group) await W.rpc('w_group_wallet_add', { p_group: v.group, p_wallet: id });
    else { if (String(v.name || '').trim().length < 2) throw new Error('Dê um nome ao grupo.'); await W.rpc('w_group_save', { p_id: null, p_name: v.name, p_wallets: [id] }); }
    W.state.wallets = []; W.toast('Carteira no grupo', 'Agora defina a marca.'); W.refresh();
  };
  W.acts['wallet-archive'] = async () => { if (!(await W.confirm('Arquivar esta carteira?', 'Todos perdem o acesso pela lista. Para reativar, fale com a equipe Lottus.', 'Arquivar', true))) return; await W.rpc('w_wallet_archive', { p_wallet: curId() }); W.state = Object.assign(W.state, { wallets: [] }); await W.rpc('w_me').then((m) => { W.state.me = m; }); W.toast('Carteira arquivada'); W.go('/carteiras'); };
  W.acts['wallet-delete'] = () => {
    const w = (W.state.wallets || []).find((x) => x.id === curId()); if (!w) return;
    W.modal({ title: 'Excluir carteira de vez?', body: `<form class="stack" data-form="wallet-delete"><div class="error-box">Isto apaga <b>${esc(w.name)}</b> com todos os lançamentos, contas, ativos personalizados e acessos. Não dá para desfazer.</div>
      <div class="field"><label for="wd-name">Para confirmar, digite o nome da carteira: <b>${esc(w.name)}</b></label><input class="input" id="wd-name" name="confirm" required autocomplete="off"></div>
      <div class="modal-foot"><button type="button" class="btn secondary" data-act="modal-close">Cancelar</button><button class="btn danger" type="submit" id="wd-ok" disabled>Excluir de vez</button></div></form>` });
    const inp = document.getElementById('wd-name'); const ok = document.getElementById('wd-ok'); const norm = (s) => s.trim().toLowerCase();
    inp.addEventListener('input', () => { ok.disabled = norm(inp.value) !== norm(w.name); });
  };
  W.forms['wallet-delete'] = async (f) => {
    const v = W.form(f); const inp = f.querySelector('[name=confirm]'); W.fieldError(inp, '');
    try { await W.rpc('w_wallet_delete', { p_wallet: curId(), p_confirm: v.confirm }); } catch (e) { if (/confirm_mismatch|não confere/.test(e.message)) { W.fieldError(inp, W.msgOf('confirm_mismatch')); e.shownInField = true; } throw e; }
    W.closeModal(); W.state.wallets = []; W.toast('Carteira excluída'); W.go('/carteiras');
  };
})();
