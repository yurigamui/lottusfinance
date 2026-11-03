/* Lottus Partners — Tesouraria: o que o fundo tem a pagar, tudo o que já entrou e saiu, e a conciliação do extrato.
   Os registros (operações, resgates, comissões…) já valem sem esta etapa; aqui o usuário paga (pela API da conta ou marcando como pago)
   e lança o que acontece fora do sistema como "Movimentação avulsa". Contabilidade fica nos bastidores (Configurações e Relatórios). */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, toast, run, closeModal } = B;
  const { head, empty } = B.ui;
  const { today, fmtDoc, pill } = B;
  const state = { account: '', filter: 'all' };

  async function callEdge(body) {
    const { data, error } = await B.sb.functions.invoke('charges', { body });
    if (error) {
      let j = {}; try { j = await error.context.json(); } catch (_) { /* sem corpo */ }
      const e = new Error(j.error || 'unavailable'); e.detail = j.detail || null; throw e;
    }
    return data;
  }

  function payModal(x, accounts, accId, me, again) {
    const acc = accounts.find((a) => a.id === accId) || accounts[0];
    const bank = x.bank || {};
    const dest = [x.pix_key ? `Pix: <b>${esc(x.pix_key)}</b>` : '', bank.bank_code ? `${esc(bank.bank_name || bank.bank_code)} · ag. ${esc(bank.branch || '')} · conta ${esc(bank.account_number || '')}${bank.account_digit ? '-' + esc(bank.account_digit) : ''}` : ''].filter(Boolean);
    const box = B.modal({ title: 'Pagar', subtitle: esc(x.label),
      body: `<div class="sumcard"><span class="lbl">${esc(x.who)}</span><span class="big">${brl(x.amount)}</span></div>
        <div class="small muted" style="margin:10px 0">${x.document ? 'CPF/CNPJ ' + esc(fmtDoc(x.document)) + '<br>' : ''}${dest.length ? dest.join('<br>') : '<span class="u-danger">Sem chave Pix nem conta cadastrada para este favorecido. Complete o cadastro para pagar pela API.</span>'}</div>
        <form id="pf" novalidate><div class="field"><label>Conta que vai pagar</label><select class="input" name="acc">${accounts.map((a) => `<option value="${esc(a.id)}" data-api="${a.provider === 'trio' ? 1 : 0}" ${a.id === acc.id ? 'selected' : ''}>${esc(a.label)} · ${esc(a.provider_name || a.provider)}${a.provider === 'trio' ? ' (API)' : ''}</option>`).join('')}</select></div>
        <div class="field"><label>Data do pagamento <span class="small muted">(para o registro manual)</span></label><input class="input" name="on" data-mask="date" value="${esc(B.mask.toBr(today()))}"></div>
        <div class="grid-2"><div class="field"><label>Tipo de pagamento</label><select class="input" name="ft">${B.FEE_TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          <div class="field"><label>Tarifa do banco</label>${B.affix('<input class="input" name="fee" data-mask="money" placeholder="0,00" inputmode="decimal">', { pre: 'R$' })}</div></div>
        <div class="note-box small" id="pm-note"></div><div class="error-box" id="pe" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn secondary" data-act="manual">Registrar pagamento</button><button class="btn" data-act="api">Pagar pela API</button>' });
    B.mask.attach(box);
    const f = box.querySelector('#pf'), err = box.querySelector('#pe'), api = box.querySelector('[data-act=api]'), note = box.querySelector('#pm-note');
    const sync = () => {
      const isApi = f.acc.selectedOptions[0].dataset.api === '1';
      api.style.display = isApi ? '' : 'none';
      note.textContent = isApi ? (x.pix_key ? 'A conta tem a API configurada: o Pix sai agora para a chave do favorecido.' : 'A API paga por chave Pix. Cadastre a chave do favorecido ou marque como pago.') : 'Esta conta não tem API de pagamento. Pague no banco e marque como pago para registrar.';
      api.disabled = isApi && !x.pix_key;
    };
    const feeOf = () => { const a = accounts.find((y) => y.id === f.acc.value) || {}; return Number((a.fees || {})[f.ft.value] || 0); };
    const fillFee = () => { const v = feeOf(); f.fee.value = v ? B.mask.fmtMoney ? B.mask.fmtMoney(v) : v.toFixed(2).replace('.', ',') : ''; };
    const saveFee = async () => { const v = B.mask.parse(f.fee.value) || 0; try { await rpc('partner_payment_fee_set', { p_kind: x.kind, p_ref: x.ref_id, p_account: f.acc.value, p_method: f.ft.value, p_fee: v, p_who: x.who }); } catch (_) { /* a tarifa é opcional */ } };
    f.acc.addEventListener('change', () => { state.account = f.acc.value; sync(); fillFee(); }); f.ft.addEventListener('change', fillFee); sync();
    fillFee();
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=manual]').onclick = async (ev) => {
      try { await run(ev.currentTarget, () => rpc('partner_treasury_pay', { p: { kind: x.kind, ref_id: x.ref_id, account_id: f.acc.value, date: B.mask.iso(f.on) } }), 'Pagamento registrado'); await saveFee(); closeModal(); again(); } catch (e) { err.hidden = false; err.textContent = B.message(e); }
    };
    api.onclick = async (ev) => {
      const ok = await B.confirmAction({ title: 'Enviar o Pix agora?', text: `${brl(x.amount)} para ${x.who}, pela conta ${f.acc.selectedOptions[0].textContent}. O Pix não pode ser desfeito.`, confirmLabel: 'Enviar Pix' });
      if (ok == null) return payModal(x, accounts, f.acc.value, me, again);
      try { await run(ev.currentTarget, () => callEdge({ action: 'treasury_pay', kind: x.kind, ref_id: x.ref_id, account_id: f.acc.value }), 'Pix enviado'); await saveFee(); closeModal(); again(); }
      catch (e) { payModal(x, accounts, f.acc.value, me, again); const e2 = document.querySelector('#pe'); if (e2) { e2.hidden = false; e2.textContent = e.detail || B.message(e); } }
    };
  }

  
  /* ---------------- Pagar um item pendente (aberto a partir da Conciliação) ---------------- */
  async function payItem(kind, ref, me, again) {
    const [list, accounts] = await Promise.all([rpc('partner_treasury_list'), rpc('partner_bank_accounts').catch(() => [])]);
    if (!state.account || !accounts.some((a) => a.id === state.account)) state.account = (accounts[0] || {}).id || '';
    if (!accounts.length) return toast('Cadastre uma conta em Configurações › Banco.', true);
    const x = list.find((y) => y.kind === kind && y.ref_id === ref);
    if (!x) return toast('Este pagamento já foi feito.', true);
    payModal(x, accounts, state.account, me, again);
  }
  B.payItem = payItem;

  /* ---------------- aba: Movimentações (tudo o que já saiu e entrou) ---------------- */
  async function moves(el, me, reload) {
    const list = (await rpc('partner_treasury_list')).filter((x) => x.status === 'paid');
    const canPay = me.can_sign !== false;
    const shown = list.filter((x) => state.filter === 'all' || (state.filter === 'in') === (x.direction === 'in'));
    const sign = (x) => (x.direction === 'in' ? 1 : -1) * Number(x.amount);
    const pg = B.ui.pager('mov', shown, { unit: shown.length === 1 ? 'movimentação' : 'movimentações', sig: state.filter });
    el.innerHTML = `<div class="row" style="gap:6px;margin-bottom:12px">${pill('data-f', 'all', 'Tudo', state.filter)}${pill('data-f', 'out', 'Pagamentos', state.filter)}${pill('data-f', 'in', 'Recebimentos', state.filter)}</div>
      ${shown.length ? `<div class="card"><table><thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th><th></th></tr></thead><tbody>
        ${pg.rows.map((x) => `<tr><td>${esc(date(x.paid_at || x.date))}</td><td><b>${esc(x.who)}</b><div class="small muted">${esc(x.label)}${x.account ? ` · ${esc(x.account)}` : ''}${x.method === 'api' ? ' · API' : ''}${x.note ? ` · ${esc(x.note)}` : ''}</div></td>
          <td class="num" style="color:${sign(x) < 0 ? 'var(--danger)' : 'var(--success)'}"><b>${sign(x) < 0 ? '−' : '+'} ${brl(Math.abs(sign(x)))}</b></td>
          <td class="num">${x.method === 'manual' && canPay ? `<button class="btn ghost sm" data-undo="${esc(x.kind)}|${esc(x.ref_id)}" data-av="${x.kind === 'avulso' ? 1 : 0}">${x.kind === 'avulso' ? 'Excluir' : 'Desfazer'}</button>` : ''}</td></tr>`).join('')}</tbody></table>${pg.bar}</div>`
        : `<div class="card">${empty('Nenhuma movimentação ainda. Pagamentos e recebimentos feitos aparecem aqui.')}</div>`}`;
    B.ui.pagerBind(el, 'mov', reload);
    el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { state.filter = b.dataset.f; reload(); }));
    el.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = async () => {
      const [k, r] = b.dataset.undo.split('|'), av = b.dataset.av === '1';
      const ok = await B.confirmAction({ title: av ? 'Excluir movimentação' : 'Desfazer o registro', text: av ? 'A movimentação sai da Tesouraria e da contabilidade.' : 'O pagamento volta para a Conciliação bancária. Use só se registrou por engano.', confirmLabel: av ? 'Excluir' : 'Desfazer' });
      if (ok == null) return;
      try { await run(b, () => rpc('partner_treasury_undo', { p_kind: k, p_ref: r }), av ? 'Movimentação excluída' : 'Registro desfeito'); reload(); } catch (_) { /* já avisado */ }
    }));
  }

  /* ---------------- Movimentação avulsa: pagamento ou recebimento fora do sistema ---------------- */
  const KIND_LABEL = { cedente: 'Cedente', sacado: 'Sacado', investidor: 'Investidor', escriturador: 'Escriturador', originador: 'Originador', outro: 'Outros' };
  async function moveDrawer(done) {
    const [parties, events, accounts] = await Promise.all([rpc('partner_counterparties'), rpc('partner_acct_events'), rpc('partner_bank_accounts').catch(() => [])]);
    const groups = ['outro', 'escriturador', 'originador', 'investidor', 'cedente', 'sacado'];
    const partyOpts = `<option value="">Selecione…</option>${groups.map((g) => { const l = parties.filter((p) => p.kind === g); return l.length ? `<optgroup label="${KIND_LABEL[g]}">${l.map((p) => `<option value="${esc(p.key)}">${esc(p.name)}</option>`).join('')}</optgroup>` : ''; }).join('')}`;
    const box = B.drawer({ title: 'Movimentação avulsa', subtitle: 'Registre um pagamento ou um recebimento que aconteceu fora das operações.',
      body: `<form id="mf" novalidate>
        <div class="field">${B.seg('dir', [['out', 'Pagamento'], ['in', 'Recebimento']], 'out')}</div>
        <div class="field"><label id="cp-l">Quem recebeu</label><select class="input" name="party">${partyOpts}</select>
          <a class="linkbtn" href="#" id="newp">+ Cadastrar nova contraparte</a></div>
        <div class="grid-2"><div class="field"><label>Valor</label>${B.affix('<input class="input" name="amount" data-mask="money" placeholder="0,00" inputmode="decimal">', { pre: 'R$' })}</div>
          <div class="field"><label>Data</label><input class="input" name="on" data-mask="date" value="${esc(B.mask.toBr(today()))}"></div></div>
        <div class="field"><label>Evento contábil</label><select class="input" name="event"></select><div class="help" id="evh"></div></div>
        <div class="field" id="bk"><label id="bk-l">Conta bancária</label><select class="input" name="acc">${accounts.map((a) => `<option value="${esc(a.id)}" ${a.id === state.account ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select></div>
        <div class="field"><label>Observação <span class="small muted">(opcional)</span></label><input class="input" name="note" maxlength="140" autocomplete="off"></div>
        <div class="error-box" id="me" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Registrar pagamento</button>' });
    B.formInit(box); B.mask.attach(box);
    const f = box.querySelector('#mf'), err = box.querySelector('#me'), ok = box.querySelector('[data-act=ok]');
    const dir = () => f.dir.value || 'out';
    const sync = () => {
      const out = dir() === 'out', evs = events.filter((e) => e.active && e.kind === (out ? 'pagamento' : 'recebimento'));
      box.querySelector('#cp-l').textContent = out ? 'Quem recebeu' : 'Quem pagou';
      box.querySelector('#bk-l').textContent = out ? 'Pago pela conta' : 'Recebido na conta';
      f.event.innerHTML = evs.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
      ok.textContent = out ? 'Registrar pagamento' : 'Registrar recebimento';
      hint();
    };
    const hint = () => {
      const e = events.find((x) => x.id === f.event.value);
      box.querySelector('#bk').hidden = !(e && e.has_bank);
      box.querySelector('#evh').textContent = e ? e.lines.map((l) => `${l.side === 'D' ? 'Débito' : 'Crédito'}: ${l.account}`).join(' · ') : '';
    };
    f.addEventListener('change', (ev) => { if (ev.target.name === 'dir') sync(); else if (ev.target.name === 'event') hint(); });
    sync();
    box.querySelector('#newp').onclick = (ev) => { ev.preventDefault(); closeModal(); B.partyForm('outro', null, () => moveDrawer(done)); };
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    ok.onclick = async (ev) => {
      err.hidden = true;
      const p = parties.find((x) => x.key === f.party.value), v = B.mask.parse(f.amount.value);
      if (!p) { err.hidden = false; err.textContent = 'Selecione a contraparte.'; return; }
      if (!(v > 0)) { err.hidden = false; err.textContent = 'Informe o valor.'; return; }
      if (!f.event.value) { err.hidden = false; err.textContent = 'Escolha o evento contábil.'; return; }
      const ev0 = events.find((x) => x.id === f.event.value), needBank = !!(ev0 && ev0.has_bank);
      if (needBank && !f.acc.value) { err.hidden = false; err.textContent = 'Cadastre e escolha uma conta bancária (Configurações › Banco).'; return; }
      if (needBank) state.account = f.acc.value;
      try {
        await run(ev.currentTarget, () => rpc('partner_treasury_move_create', { p: { direction: dir(), who: p.name, document: p.document, party_kind: p.kind, amount: v, date: B.mask.iso(f.on), event_id: f.event.value, account_id: needBank ? f.acc.value : null, note: f.note.value.trim() } }), dir() === 'out' ? 'Pagamento registrado' : 'Recebimento registrado');
        closeModal(); done();
      } catch (e) { err.hidden = false; err.textContent = B.message(e); }
    };
  }

  const TABS = [['conciliacao', 'Conciliação bancária'], ['movimentacoes', 'Movimentações']];
  B.views.tesouraria = async (el, [t], me) => {
    const tab = TABS.some(([k]) => k === t) ? t : 'conciliacao';
    const canPay = me.can_sign !== false;
    el.innerHTML = head('Tesouraria', 'Pagamentos, recebimentos e conciliação do extrato', canPay ? '<button class="btn" id="avulsa">Movimentação avulsa</button>' : '') + B.ui.tabs(TABS, tab) + '<div id="tab"></div>';
    B.ui.onTabs(el, (k) => { location.hash = `#/tesouraria/${k}`; });
    const host = el.querySelector('#tab'), reload = () => B.views.tesouraria(el, [tab], me);
    const btn = el.querySelector('#avulsa'); if (btn) btn.onclick = () => moveDrawer(() => { if (tab === 'movimentacoes') reload(); else location.hash = '#/tesouraria/movimentacoes'; });
    if (tab === 'conciliacao' && !state.refreshing) { state.refreshing = true; callEdge({ action: 'treasury_refresh' }).catch(() => {}).then(() => { state.refreshing = false; }); }
    if (tab === 'movimentacoes') await moves(host, me, reload); else await B.acct.conciliacao(host, me);
  };
})();
