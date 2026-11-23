/* Lottus Wealth — Relatórios, Acessos e Configurações da carteira. */
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
      <div class="grid-2">${card('posicao', 'trend', 'Patrimônio e posição', 'Patrimônio líquido, composição e posição por ativo na data de hoje.', false)}${card('invest', 'list', 'Transações de investimentos', 'Compras, vendas e proventos do período.', true)}${card('gastos', 'receipt', 'Extrato de gastos', 'Todos os lançamentos classificados, do período.', true)}${card('bens', 'home', 'Bens e dívidas', 'Itens informados e valores de referência.', false)}</div>`;
  });
  document.addEventListener('submit', (e) => { const f = e.target.closest('form[data-form=report]'); if (f) f._fmt = e.submitter ? e.submitter.value : 'csv'; }, true);
  W.forms.report = async (f, e) => {
    const id = curId(); const kind = f.dataset.kind; const fmt = (e.submitter && e.submitter.value) || f._fmt || 'csv'; const v = W.form(f); const name = (W.state.wallets.find((w) => w.id === id) || {}).name || 'carteira';
    const stamp = W.ymd(); const file = (n) => `lottus-wealth_${name.replace(/[^\w]+/g, '-').toLowerCase()}_${n}_${stamp}.csv`;
    if (kind === 'posicao') {
      const [nw, pos] = await Promise.all([W.rpc('w_networth', { p_wallet: id }), W.rpc('w_positions', { p_wallet: id })]);
      if (fmt === 'csv') return W.download(file('posicao'), W.csv([['Ativo', 'Tipo', 'Quantidade', 'PU médio', 'PU atual', 'Data do PU', 'Valor', 'Resultado', 'Peso'], ...pos.map((p) => [p.ticker || p.name, W.ASSET_KIND[p.kind] || p.kind, p.qty, p.avg_pu, p.pu, p.pu_date, p.value, p.result, p.weight]), [], ['Patrimônio líquido', nw.total], ['Investimentos', nw.investimentos], ['Contas', nw.contas], ['Bens', nw.bens], ['Dívidas', nw.dividas]]));
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
    const o = await W.rpc('w_other_list', { p_wallet: id });
    W.download(file('bens-dividas'), W.csv([['Tipo', 'Nome', 'Valor', 'Data de referência', 'Observação'], ...o.map((x) => [x.kind === 'bem' ? 'Bem' : 'Dívida', x.name, x.value, x.ref_date, x.notes])]));
  };
  function printReport(name, nw, pos) {
    const root = document.createElement('div'); root.id = 'print-root';
    root.innerHTML = `<h1>${esc(name)}</h1><p>Lottus Wealth · posição em ${W.dt(W.ymd())}</p><h2>Patrimônio</h2><table><tbody><tr><td>Investimentos</td><td class="num">${W.brl(nw.investimentos)}</td></tr><tr><td>Contas</td><td class="num">${W.brl(nw.contas)}</td></tr><tr><td>Bens</td><td class="num">${W.brl(nw.bens)}</td></tr><tr><td>Dívidas</td><td class="num">− ${W.brl(nw.dividas)}</td></tr><tr><td><b>Patrimônio líquido</b></td><td class="num"><b>${W.brl(nw.total)}</b></td></tr></tbody></table>
      <h2>Posição</h2><table><thead><tr><th>Ativo</th><th class="num">Qtd</th><th class="num">P.U.</th><th class="num">Valor</th><th class="num">Resultado</th><th class="num">Peso</th></tr></thead><tbody>${pos.map((p) => `<tr><td>${esc(p.ticker || p.name)}</td><td class="num">${W.qty(p.qty)}</td><td class="num">${W.num(p.pu, 4)}</td><td class="num">${W.brl(p.value)}</td><td class="num">${W.brl(p.result)}</td><td class="num">${W.pct(p.weight, 1)}</td></tr>`).join('')}</tbody></table>
      <p class="small">Valores informados com base nos P.U. mais recentes disponíveis; renda fixa pela curva contratada. Documento informativo, sem valor de extrato oficial de custódia.</p>`;
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
    const msg = owner ? `${m.name} é o titular da cobrança. Se você remover, a cobrança desta carteira passa a ser sua${W.state.me.profile.payment_ok || W.state.me.profile.plan === 'fund' ? '' : ' (será preciso ter forma de pagamento cadastrada se você já tem outra carteira)'}.` : 'A pessoa perde o acesso imediatamente.';
    if (!(await W.confirm(`Remover ${m.name}?`, msg, 'Remover', true))) return;
    const r = await W.rpc('w_member_remove', { p_wallet: curId(), p_user: el.dataset.id }); W.state.wallets = []; W.toast('Acesso removido', r.owner_changed ? 'Você agora é o titular da cobrança.' : ''); if (el.dataset.me === '1') W.go('/carteiras'); else W.refresh();
  };
  W.acts['wallet-leave'] = async () => { if (!(await W.confirm('Sair da carteira?', 'Você perde o acesso. Um gestor pode convidar você de novo.', 'Sair', true))) return; await W.rpc('w_wallet_leave', { p_wallet: curId() }); W.state.wallets = []; W.toast('Você saiu da carteira'); W.go('/carteiras'); };

  /* ================= Configurações ================= */
  W.route('/w/:id/config', async (ctx) => {
    const w = ctx.w; if (w.role !== 'gestor') return `${W.pageHead('Configurações', '')}<div class="card center"><h2>Só gestores acessam esta tela.</h2></div>`;
    ctx.after = () => { W.cur = ctx; };
    return `${W.pageHead('Configurações da carteira', 'Nome da pessoa ou empresa e titularidade da cobrança.')}
      <div class="grid-2"><form class="card stack" data-form="wallet-edit"><div class="field"><label>Nome da pessoa ou empresa</label><input class="input" name="name" required minlength="2" maxlength="80" value="${esc(w.name)}"></div><div><button class="btn" type="submit"${w.read_only ? ' disabled' : ''}>Salvar</button></div></form>
      <div class="card stack"><h3>Cobrança</h3><p class="muted small">Titular da cobrança: <b>${esc(w.is_owner ? 'você' : w.owner_name || '—')}</b>. A mensalidade desta carteira é cobrada do titular. Se o titular for removido por outro gestor, quem removeu passa a ser o titular.</p><a class="btn secondary" href="#/conta">Ver plano e faturas</a></div></div>
      ${w.is_owner ? `<div class="card stack" style="margin-top:16px"><h3>Arquivar carteira</h3><p class="muted small">A carteira some da lista de todos e deixa de ser cobrada. Os dados ficam guardados.</p><div><button class="btn danger" data-act="wallet-archive"${w.read_only ? ' disabled' : ''}>Arquivar carteira</button></div></div>` : ''}`;
  });
  W.forms['wallet-edit'] = async (f) => { const v = W.form(f); await W.rpc('w_wallet_update', { p_wallet: curId(), p_name: v.name, p_kind: null }); W.state.wallets = []; W.toast('Carteira atualizada'); W.refresh(); };
  W.acts['wallet-archive'] = async () => { if (!(await W.confirm('Arquivar esta carteira?', 'Todos perdem o acesso pela lista. Não dá para desfazer por aqui.', 'Arquivar', true))) return; await W.rpc('w_wallet_archive', { p_wallet: curId() }); W.state = Object.assign(W.state, { wallets: [] }); await W.rpc('w_me').then((m) => { W.state.me = m; }); W.toast('Carteira arquivada'); W.go('/carteiras'); };
})();
