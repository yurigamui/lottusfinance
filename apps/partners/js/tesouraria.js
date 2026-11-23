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
    const inn = x.direction === 'in';
    const box = B.modal({ title: inn ? 'Receber' : 'Pagar', subtitle: esc(x.label),
      body: `<div class="sumcard"><span class="lbl">${esc(x.who)}</span><span class="big">${brl(x.amount)}</span></div>
        <div class="small muted" style="margin:10px 0">${x.document ? 'CPF/CNPJ ' + esc(fmtDoc(x.document)) + '<br>' : ''}${dest.length ? dest.join('<br>') : '<span class="u-danger">Sem chave Pix nem conta cadastrada para este favorecido. Complete o cadastro para pagar pela API.</span>'}</div>
        <form id="pf" novalidate><div class="field"><label>${inn ? 'Conta que vai receber' : 'Conta que vai pagar'}</label><select class="input" name="acc">${accounts.map((a) => `<option value="${esc(a.id)}" data-api="${a.provider === 'trio' ? 1 : 0}" ${a.id === acc.id ? 'selected' : ''}>${esc(a.label)} · ${esc(a.provider_name || a.provider)}${a.provider === 'trio' ? ' (API)' : ''}</option>`).join('')}</select></div>
        <div class="field"><label>Data do pagamento <span class="small muted">(para o registro manual)</span></label><input class="input" name="on" data-mask="date" value="${esc(B.mask.toBr(today()))}"></div>
        <div class="grid-2"><div class="field"><label>Tipo de pagamento</label><select class="input" name="ft">${B.FEE_TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          <div class="field"><label>Tarifa do banco</label>${B.affix('<input class="input" name="fee" data-mask="money" placeholder="0,00" inputmode="decimal">', { pre: 'R$' })}</div></div>
        <div class="note-box small" id="pm-note"></div><div class="error-box" id="pe" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn secondary" data-act="manual">' + (inn ? 'Registrar recebimento' : 'Registrar pagamento') + '</button><button class="btn" data-act="api">Pagar pela API</button>' });
    B.mask.attach(box);
    const f = box.querySelector('#pf'), err = box.querySelector('#pe'), api = box.querySelector('[data-act=api]'), note = box.querySelector('#pm-note');
    const sync = () => {
      const isApi = !inn && f.acc.selectedOptions[0].dataset.api === '1';
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
      const ok = await B.confirmAction({ title: 'Enviar o Pix agora?', text: `${brl(x.amount)} para ${esc(x.who)}, pela conta ${esc(f.acc.selectedOptions[0].textContent)}. O Pix não pode ser desfeito.`, confirmLabel: 'Enviar Pix' });
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
    const pg = B.ui.pager('mov', shown, { unit: shown.length === 1 ? 'movimentação' : 'movimentações', sig: state.filter, cols: [(x) => x.paid_at || x.date, (x) => x.who, (x) => sign(x)] });
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
    if (!accounts.length) return toast('Cadastre uma conta em Configurações › Banco.', true);
    const groups = ['outro', 'escriturador', 'originador', 'investidor', 'cedente', 'sacado'];
    const partyOpts = `<option value="">Selecione…</option>${groups.map((g) => { const l = parties.filter((p) => p.kind === g); return l.length ? `<optgroup label="${KIND_LABEL[g]}">${l.map((p) => `<option value="${esc(p.key)}">${esc(p.name)}</option>`).join('')}</optgroup>` : ''; }).join('')}`;
    const box = B.drawer({ title: 'Nova transferência', subtitle: 'Pagamento ou recebimento avulso: pode ser agendado para outra data.',
      body: `<form id="mf" novalidate>
        <div class="field" style="margin-bottom:20px">${B.seg('dir', [['out', 'Pagamento'], ['in', 'Recebimento']], 'out')}</div>
        <div class="field"><label id="cp-l">Quem recebe</label><select class="input" name="party">${partyOpts}</select>
          <a class="linkbtn" href="#" id="newp">+ Cadastrar nova contraparte</a></div>
        <div class="field" id="cpb"><label>Conta da Contraparte</label><select class="input" name="cpbank"></select><div class="help" id="cph"></div></div>
        <div class="grid-2"><div class="field"><label>Valor</label>${B.affix('<input class="input" name="amount" data-mask="money" placeholder="0,00" inputmode="decimal">', { pre: 'R$' })}</div>
          <div class="field"><label id="dt-l">Data</label><input class="input" name="on" data-mask="date" value="${esc(B.mask.toBr(today()))}"></div></div>
        <div class="field"><label>Evento contábil</label><select class="input" name="event"></select><div class="help" id="evh"></div></div>
        <div class="field"><label id="bk-l">Conta do Fundo</label><select class="input" name="acc">${accounts.map((a) => `<option value="${esc(a.id)}" ${a.id === state.account ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select></div>
        <div class="grid-2" id="feew"><div class="field"><label>Tipo de pagamento</label><select class="input" name="ft">${B.FEE_TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          <div class="field"><label>Tarifa</label>${B.affix('<input class="input" name="fee" data-mask="money" placeholder="0,00" inputmode="decimal">', { pre: 'R$' })}</div></div>
        <div class="field"><label>Observação <span class="small muted">(opcional)</span></label><input class="input" name="note" maxlength="140" autocomplete="off"></div>
        <label class="check" style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><input type="checkbox" name="done"> <span id="dn-l">Já foi pago</span></label>
        <div class="error-box" id="me" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Lançar</button>' });
    B.formInit(box); B.mask.attach(box);
    const f = box.querySelector('#mf'), err = box.querySelector('#me');
    const dir = () => f.dir.value || 'out', party = () => parties.find((x) => x.key === f.party.value);
    const bankLabel = (b) => `${esc(b.bank_name || b.bank_code || 'Banco')} · ag. ${esc(b.branch || '—')} · conta ${esc(b.account_number || '—')}${b.account_digit ? '-' + esc(b.account_digit) : ''}${b.pix_key ? ' · Pix ' + esc(b.pix_key) : ''}`;
    const fmtM = (v) => (v ? (B.mask.fmtMoney ? B.mask.fmtMoney(v) : Number(v).toFixed(2).replace('.', ',')) : '');
    let feeTouched = false;
    const fillFee = (force) => { if (feeTouched && !force) return; const a = accounts.find((y) => y.id === f.acc.value) || {}; f.fee.value = dir() === 'out' ? fmtM(Number((a.fees || {})[f.ft.value] || 0)) : ''; };
    const syncBank = () => {
      const p = party(), b = p && p.bank && (p.bank.pix_key || p.bank.account_number) ? p.bank : null;
      box.querySelector('#cpb').hidden = dir() !== 'out';
      f.cpbank.innerHTML = b ? `<option value="1">${bankLabel(b)}</option>` : `<option value="">${p ? 'Sem conta parametrizada' : 'Selecione a contraparte'}</option>`;
      box.querySelector('#cph').textContent = p && !b ? 'Cadastre o banco/Pix no cadastro da contraparte. Com a conta, o pagamento sai pela API; sem ela, gere o QR Pix.' : '';
    };
    const hint = () => { const e = events.find((x) => x.id === f.event.value); box.querySelector('#evh').textContent = e ? e.lines.map((l) => `${l.side === 'D' ? 'Débito' : 'Crédito'}: ${l.account}`).join(' · ') : ''; };
    const sync = () => {
      const out = dir() === 'out', evs = events.filter((e) => e.active && e.kind === (out ? 'pagamento' : 'recebimento'));
      box.querySelector('#cp-l').textContent = out ? 'Quem recebe' : 'Quem paga';
      box.querySelector('#bk-l').textContent = out ? 'Conta do Fundo' : 'Conta do Fundo';
      box.querySelector('#dt-l').textContent = out ? 'Data do pagamento' : 'Data do recebimento';
      box.querySelector('#dn-l').textContent = out ? 'Já foi pago' : 'Já foi recebido';
      box.querySelector('#feew').hidden = !out;
      f.event.innerHTML = evs.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
      hint(); syncBank(); fillFee(true);
    };
    f.addEventListener('change', (ev) => { const n = ev.target.name; if (n === 'dir') sync(); else if (n === 'event') hint(); else if (n === 'party') syncBank(); else if (n === 'acc' || n === 'ft') { feeTouched = false; fillFee(); } });
    f.fee.addEventListener('input', () => { feeTouched = true; });
    sync();
    box.querySelector('#newp').onclick = (ev) => { ev.preventDefault(); closeModal(); B.partyForm('outro', null, () => moveDrawer(done)); };
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      err.hidden = true;
      const bad = (m) => { err.hidden = false; err.textContent = m; };
      const p = party(), v = B.mask.parse(f.amount.value), out = dir() === 'out', d = B.mask.iso(f.on);
      if (!p) return bad('Selecione a contraparte.');
      if (!(v > 0)) return bad('Informe o valor.');
      if (!d) return bad('Informe a data.');
      if (!f.event.value) return bad('Escolha o evento contábil.');
      if (f.done.checked && d > today()) return bad('Um lançamento já realizado não pode ter data futura. Desmarque "já foi" para agendar.');
      const cp = out && p.bank && (p.bank.pix_key || p.bank.account_number) ? p.bank : null;
      state.account = f.acc.value;
      try {
        await run(ev.currentTarget, () => rpc('partner_payment_schedule', { p: { direction: dir(), who: p.name, document: p.document, party_kind: p.kind, amount: v, date: d, event_id: f.event.value, account_id: f.acc.value, note: f.note.value.trim(),
          paid: f.done.checked, pix_key: cp ? (cp.pix_key || '') : '', cp_bank: cp || null, fee_method: out ? f.ft.value : null, fee: out ? (B.mask.parse(f.fee.value) || 0) : 0 } }), f.done.checked ? (out ? 'Pagamento registrado' : 'Recebimento registrado') : 'Transferência agendada');
        closeModal(); if (state.pf) { state.pf.st = 'all'; if (!f.done.checked && (d < state.pf.from || d > state.pf.to)) { state.pf.from = d < state.pf.from ? d : state.pf.from; state.pf.to = d > state.pf.to ? d : state.pf.to; } } done();
      } catch (e) { bad(B.message(e)); }
    };
  }


  /* ---------------- aba: Pagamentos (agenda do dia/período, recorrências e QR Pix) ---------------- */
  const FREQ = { weekly: 'Semanal', monthly: 'Mensal', quarterly: 'Trimestral', yearly: 'Anual' };
  const fmtIso = (d) => (d ? date(d) : '—');
  async function qrModal(x, accounts, me) {
    const out = x.direction !== 'in';
    const acc = accounts.find((a) => a.id === x.account_id) || accounts.find((a) => a.pix_key) || {};
    const key = out ? (x.pix_key || (x.bank || {}).pix_key) : (acc.pix_key || '');
    if (!key) { B.modal({ title: 'QR Pix', body: `<p class="u-m0">${out ? 'O favorecido não tem chave Pix cadastrada. Complete o cadastro da contraparte (ou a recorrência).' : 'A conta bancária escolhida não tem chave Pix. Informe em Configurações › Banco.'}</p>`, foot: '' }); return; }
    const code = B.pixPayload({ key, name: out ? x.who : ((me.funder && (me.funder.trade_name || me.funder.legal_name)) || acc.label), city: 'SAO PAULO', amount: Number(x.amount), txid: 'PG' + String(x.ref_id).replace(/-/g, '').slice(0, 20) });
    const box = B.modal({ title: `${out ? 'Pagar' : 'Receber'} por Pix · ${brl(x.amount)}`,
      body: `<div class="pix-box"><div class="pix-qr">${B.qrSvg(code)}</div><div class="small"><b>${esc(x.who)}</b><br>${esc(x.label)}<br>Chave: ${esc(key)}</div></div>
        <textarea class="u-mt12 input mono" rows="3" readonly>${esc(code)}</textarea><div class="u-mt8 small muted">${out ? 'Leia o QR ou use o copia e cola no app do banco.' : 'Envie o QR ou o código ao pagador.'} Depois, registre o ${out ? 'pagamento' : 'recebimento'} na lista.</div>`,
      foot: '<button class="btn" data-act="copy">Copiar código</button>' });
    box.querySelector('[data-act=copy]').onclick = () => B.copy(code);
  }

  async function recurringDrawer(r, done) {
    const [parties, events, accounts] = await Promise.all([rpc('partner_counterparties'), rpc('partner_acct_events'), rpc('partner_bank_accounts').catch(() => [])]);
    if (!accounts.length) return toast('Cadastre uma conta em Configurações › Banco.', true);
    const groups = ['outro', 'escriturador', 'originador', 'investidor', 'cedente', 'sacado'];
    const cur = r || {};
    const partyOpts = `<option value="">Selecione…</option>${groups.map((g) => { const l = parties.filter((p) => p.kind === g); return l.length ? `<optgroup label="${KIND_LABEL[g]}">${l.map((p) => `<option value="${esc(p.key)}" ${cur.who === p.name ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>` : ''; }).join('')}`;
    const box = B.drawer({ title: r ? 'Editar recorrência' : 'Nova recorrência', subtitle: 'Pagamento ou recebimento que se repete. Aparece na agenda a cada vencimento.',
      body: `<form id="rf" novalidate>
        <div class="field" style="margin-bottom:20px">${B.seg('dir', [['out', 'Pagamento'], ['in', 'Recebimento']], cur.direction || 'out')}</div>
        <div class="field"><label>Descrição</label><input class="input" name="label" maxlength="120" value="${esc(cur.label || '')}" autocomplete="off"></div>
        <div class="field"><label id="cp-l">Contraparte</label><select class="input" name="party">${partyOpts}</select></div>
        <div class="grid-2"><div class="field"><label>Valor</label>${B.affix(`<input class="input" name="amount" data-mask="money" placeholder="0,00" inputmode="decimal" value="${cur.amount ? esc(B.mask.fmtMoney ? B.mask.fmtMoney(cur.amount) : String(cur.amount).replace('.', ',')) : ''}">`, { pre: 'R$' })}</div>
          <div class="field"><label>Frequência</label><select class="input" name="freq">${Object.entries(FREQ).map(([k, l]) => `<option value="${k}" ${(cur.frequency || 'monthly') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <div class="grid-2"><div class="field"><label>Primeiro vencimento</label><input class="input" name="start" data-mask="date" value="${esc(B.mask.toBr(cur.start_date || today()))}"></div>
          <div class="field"><label>Até <span class="small muted">(opcional)</span></label><input class="input" name="end" data-mask="date" value="${cur.end_date ? esc(B.mask.toBr(cur.end_date)) : ''}"></div></div>
        <div class="field"><label>Evento contábil</label><select class="input" name="event"></select><div class="help" id="evh"></div></div>
        <div class="field"><label id="acc-l">Conta do Fundo</label><select class="input" name="acc">${accounts.map((a) => `<option value="${esc(a.id)}" ${a.id === (cur.account_id || state.account) ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select></div>
        <div class="field" id="cpb"><label>Conta da Contraparte</label><select class="input" name="cpbank"></select><div class="help" id="cph"></div></div>
        <div class="grid-2"><div class="field"><label>Tipo de pagamento</label><select class="input" name="ft">${B.FEE_TYPES.map(([k, l]) => `<option value="${k}" ${(cur.fee_method || 'pix') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Tarifa</label>${B.affix('<input class="input" name="fee" data-mask="money" placeholder="0,00" inputmode="decimal">', { pre: 'R$' })}</div></div>
        <div class="field"><label>Observação <span class="small muted">(opcional)</span></label><input class="input" name="note" maxlength="140" value="${esc(cur.note || '')}" autocomplete="off"></div>
        <div class="error-box" id="re" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar</button>' });
    B.formInit(box); B.mask.attach(box);
    const f = box.querySelector('#rf'), err = box.querySelector('#re');
    const dir = () => f.dir.value || 'out';
    const party = () => parties.find((x) => x.key === f.party.value);
    const bankLabel = (b) => `${esc(b.bank_name || b.bank_code || 'Banco')} · ag. ${esc(b.branch || '—')} · conta ${esc(b.account_number || '—')}${b.account_digit ? '-' + esc(b.account_digit) : ''}${b.pix_key ? ' · Pix ' + esc(b.pix_key) : ''}`;
    const fmtM = (v) => (v ? (B.mask.fmtMoney ? B.mask.fmtMoney(v) : Number(v).toFixed(2).replace('.', ',')) : '');
    let feeTouched = !!cur.fee;
    const fillFee = (force) => { if (feeTouched && !force) return; const a = accounts.find((y) => y.id === f.acc.value) || {}; f.fee.value = dir() === 'out' ? fmtM(Number((a.fees || {})[f.ft.value] || 0)) : ''; };
    const syncBank = () => {
      const p = party(), out = dir() === 'out', b = p && p.bank && (p.bank.pix_key || p.bank.account_number) ? p.bank : null;
      box.querySelector('#cpb').hidden = !out;
      f.cpbank.innerHTML = b ? `<option value="1">${bankLabel(b)}</option>` : `<option value="">${p ? 'Sem banco parametrizado' : 'Selecione a contraparte'}</option>`;
      box.querySelector('#cph').textContent = p && !b ? 'Cadastre o banco/Pix no cadastro da contraparte para pagar pela API ou gerar o QR.' : '';
    };
    const syncDir = () => {
      const out = dir() === 'out', evs = events.filter((e) => e.active && e.kind === (out ? 'pagamento' : 'recebimento'));
      box.querySelector('#cp-l').textContent = out ? 'Quem recebe' : 'Quem paga';
      box.querySelector('#acc-l').textContent = 'Conta do Fundo';
      f.event.innerHTML = evs.map((e) => `<option value="${esc(e.id)}" ${e.id === cur.event_id ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
      box.querySelector('[name=ft]').closest('.grid-2').hidden = !out;
      hint(); syncBank(); fillFee(true);
    };
    const hint = () => { const e = events.find((x) => x.id === f.event.value); box.querySelector('#evh').textContent = e ? e.lines.map((l) => `${l.side === 'D' ? 'Débito' : 'Crédito'}: ${l.account}`).join(' · ') : ''; };
    f.addEventListener('change', (ev) => {
      const n = ev.target.name;
      if (n === 'dir') syncDir(); else if (n === 'event') hint(); else if (n === 'party') syncBank(); else if (n === 'acc' || n === 'ft') { feeTouched = false; fillFee(); }
    });
    f.fee.addEventListener('input', () => { feeTouched = true; });
    syncDir(); if (cur.fee) f.fee.value = fmtM(cur.fee);
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      err.hidden = true; const p = party(), v = B.mask.parse(f.amount.value), out = dir() === 'out';
      const bad = (m) => { err.hidden = false; err.textContent = m; };
      if (!f.label.value.trim()) return bad('Informe a descrição.');
      if (!p) return bad('Selecione a contraparte.');
      if (!(v > 0)) return bad('Informe o valor.');
      if (!f.event.value) return bad('Escolha o evento contábil.');
      const cp = out && p.bank && (p.bank.pix_key || p.bank.account_number) ? p.bank : null;
      const body = { id: cur.id || null, direction: dir(), label: f.label.value.trim(), who: p.name, document: p.document, party_kind: p.kind, amount: v, frequency: f.freq.value, start_date: B.mask.iso(f.start), end_date: f.end.value ? B.mask.iso(f.end) : null,
        event_id: f.event.value, account_id: f.acc.value, note: f.note.value.trim(), active: cur.id ? cur.active : true, pix_key: cp ? (cp.pix_key || '') : '', cp_bank: cp || null, fee_method: out ? f.ft.value : null, fee: out ? (B.mask.parse(f.fee.value) || 0) : 0 };
      try { await run(ev.currentTarget, () => rpc('partner_recurring_save', { p: body }), 'Recorrência salva'); closeModal(); done(); } catch (e) { bad(B.message(e)); }
    };
  }

  function receiptDoc(x, accounts, me) {
    const acc = accounts.find((a) => a.id === x.account_id) || accounts.find((a) => a.pix_key) || {};
    const fn = (me.funder && (me.funder.trade_name || me.funder.legal_name)) || acc.label || 'Fundo';
    const code = acc.pix_key ? B.pixPayload({ key: acc.pix_key, name: fn, city: 'SAO PAULO', amount: Number(x.amount), txid: 'PG' + String(x.ref_id).replace(/-/g, '').slice(0, 20) }) : '';
    const w = window.open('', '_blank');
    if (!w) return toast('Permita pop-ups para gerar o documento.', true);
    const bank = [acc.bank_name, acc.branch ? 'ag. ' + acc.branch : '', acc.account_number ? 'conta ' + acc.account_number + (acc.account_digit ? '-' + acc.account_digit : '') : ''].filter(Boolean).join(' · ');
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Cobrança · ${esc(x.who)}</title><style>body{font:14px Arial,sans-serif;margin:32px;color:#111}h1{font-size:20px;margin:0 0 4px}.box{border:1px solid #999;border-radius:6px;padding:16px;margin:14px 0}.row{display:flex;justify-content:space-between;gap:16px}.big{font-size:26px;font-weight:700}.l{font-size:11px;color:#666;text-transform:uppercase}.qr{width:200px}code{display:block;word-break:break-all;font-size:11px;background:#f3f3f3;padding:8px;border-radius:4px}@media print{button{display:none}}</style>
      <h1>Cobrança</h1><div class="l">${esc(fn)}</div>
      <div class="box row"><div><div class="l">Pagador</div><b>${esc(x.who)}</b>${x.document ? '<br>' + esc(fmtDoc(x.document)) : ''}<div class="l" style="margin-top:10px">Descrição</div>${esc(x.label)}</div>
        <div style="text-align:right"><div class="l">Vencimento</div><b>${esc(date(x.date || x.due_date))}</b><div class="l" style="margin-top:10px">Valor</div><div class="big">${esc(brl(x.amount))}</div></div></div>
      <div class="box"><div class="l">Pague por Pix (QR Code)</div>${code ? `<div class="row" style="align-items:center"><div class="qr">${B.qrSvg(code)}</div><div style="flex:1"><div class="l">Favorecido</div>${esc(fn)}<br><span class="l">${esc(bank)}</span><div class="l" style="margin-top:10px">Chave Pix</div>${esc(acc.pix_key)}<div class="l" style="margin-top:10px">Pix copia e cola</div><code>${esc(code)}</code></div></div>` : '<p>A conta do fundo não tem chave Pix cadastrada. Informe em Configurações › Banco.</p>'}</div>
      <button onclick="window.print()">Imprimir / salvar PDF</button>`);
    w.document.close();
  }

  async function pagamentos(el, me, reload) {
    const [list, accounts, recs] = await Promise.all([rpc('partner_treasury_list'), rpc('partner_bank_accounts').catch(() => []), rpc('partner_recurring_list').catch(() => [])]);
    const canPay = me.can_sign !== false, t0 = today();
    if (!state.pf) state.pf = { from: t0, to: t0, dir: 'all', st: 'all', show: 'agenda' };
    const pf = state.pf;
    if (!state.account || !accounts.some((a) => a.id === state.account)) state.account = (accounts[0] || {}).id || '';
    const isPaid = (x) => x.status === 'paid';
    const dayOf = (x) => String(isPaid(x) ? (x.paid_at || x.date) : (x.date || x.due_date)).slice(0, 10);
    const shown = list.filter((x) => !x.ext && (pf.dir === 'all' || (pf.dir === 'in') === (x.direction === 'in'))
      && (pf.st === 'all' ? (x.status === 'pending' || isPaid(x)) : pf.st === 'paid' ? isPaid(x) : x.status === 'pending') && dayOf(x) >= pf.from && dayOf(x) <= pf.to)
      .sort((a, b) => dayOf(a).localeCompare(dayOf(b)));
    const sumOut = shown.filter((x) => x.direction !== 'in' && !isPaid(x)).reduce((s, x) => s + Number(x.amount), 0), sumIn = shown.filter((x) => x.direction === 'in' && !isPaid(x)).reduce((s, x) => s + Number(x.amount), 0);
    const pg = B.ui.pager('pag', shown, { unit: 'itens', sig: JSON.stringify(pf), cols: [(x) => dayOf(x), (x) => x.who, (x) => Number(x.amount)] });
        const agenda = `<div class="card u-mb12"><div class="row" style="gap:10px;align-items:center;flex-wrap:wrap;padding:12px">
        <input class="input" id="pf-range" style="max-width:240px" aria-label="Período">
        <div class="row" style="gap:6px">${pill('data-st', 'all', 'Tudo', pf.st)}${pill('data-st', 'pending', 'A pagar', pf.st)}${pill('data-st', 'paid', 'Pagos', pf.st)}</div>
        </div>
        <div class="small muted" style="padding:0 12px 12px">A pagar: <b class="u-danger">${brl(sumOut)}</b> · A receber: <b style="color:var(--success)">${brl(sumIn)}</b> · ${shown.length} ${shown.length === 1 ? 'item' : 'itens'}</div></div>
      ${shown.length ? `<div class="card"><table><thead><tr><th>Data</th><th>Descrição</th><th>Conta</th><th class="num">Tarifa</th><th class="num">Valor</th><th></th></tr></thead><tbody>
        ${pg.rows.map((x) => { const out = x.direction !== 'in', paid = isPaid(x); return `<tr><td class="nowrap">${esc(date(dayOf(x)))}<div class="small ${paid ? 'muted' : (dayOf(x) < t0 ? 'u-danger' : 'muted')}">${paid ? (out ? 'Pago' : 'Recebido') : (dayOf(x) < t0 ? 'Atrasado' : 'Pendente')}</div></td>
          <td><b>${esc(x.who)}</b><div class="small muted">${esc(x.label)}${x.note && !String(x.note).startsWith('ext:') ? ` · ${esc(x.note)}` : ''}${x.recurring_id ? ' · recorrente' : ''}${paid && x.method === 'api' ? ' · API' : ''}</div></td>
          <td class="small">${esc(x.account || '—')}</td><td class="num small">${Number(x.fee) ? brl(x.fee) : '—'}</td>
          <td class="num" style="color:${out ? 'var(--danger)' : 'var(--success)'}"><b>${out ? '−' : '+'} ${brl(x.amount)}</b></td>
          <td class="num nowrap">${paid ? (canPay && x.method === 'manual' ? `<button class="btn ghost sm" data-cancel="${esc(x.kind)}|${esc(x.ref_id)}">Cancelar</button>` : '')
            : `<button class="btn ghost sm" data-qr="${esc(x.kind)}|${esc(x.ref_id)}">QR Pix</button>${!out ? ` <button class="btn ghost sm" data-doc="${esc(x.kind)}|${esc(x.ref_id)}">Cobrança</button>` : ''}${canPay ? ` <button class="btn sm" data-pay="${esc(x.kind)}|${esc(x.ref_id)}">${out ? 'Pagar' : 'Receber'}</button>${x.kind === 'avulso' ? ` <button class="btn ghost sm" data-del="${esc(x.ref_id)}">Excluir</button>` : ''}` : ''}`}</td></tr>`; }).join('')}</tbody></table>${pg.bar}</div>`
        : `<div class="card">${empty('Nada neste período.')}</div>`}`;
    const recList = recs.length ? `<div class="card"><table><thead><tr><th>Descrição</th><th>Evento</th><th>Frequência</th><th>Próximo</th><th class="num">Valor</th><th></th></tr></thead><tbody>
        ${recs.map((r) => `<tr class="${r.active ? '' : 'muted'}"><td><b>${esc(r.label)}</b><div class="small muted">${r.direction === 'in' ? 'Receber de' : 'Pagar a'} ${esc(r.who)} · ${esc(r.account || '')}${Number(r.fee) ? ` · tarifa ${brl(r.fee)}` : ''}</div></td><td class="small">${esc(r.event || '')}</td><td class="small">${esc(FREQ[r.frequency] || r.frequency)}</td><td class="small">${esc(fmtIso(r.next_due))}</td>
          <td class="num"><b>${brl(r.amount)}</b></td><td class="num nowrap">${canPay ? `<button class="btn ghost sm" data-redit="${esc(r.id)}">Editar</button> <button class="btn ghost sm" data-rtog="${esc(r.id)}|${r.active ? 0 : 1}">${r.active ? 'Pausar' : 'Ativar'}</button> <button class="btn ghost sm" data-rdel="${esc(r.id)}">Excluir</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="card">${empty('Nenhuma recorrência cadastrada.')}</div>`;
    el.innerHTML = `<div class="row" style="gap:6px;margin-bottom:12px;align-items:center">${pill('data-s', 'agenda', 'Agenda', pf.show)}${pill('data-s', 'rec', 'Recorrências', pf.show)}
      <span style="margin-left:auto" class="row">${canPay ? '<button class="btn secondary sm" id="pf-new">Nova recorrência</button> <button class="btn sm" id="pf-av">Nova transferência</button>' : ''}</span></div>${pf.show === 'rec' ? recList : agenda}`;
    B.mask.attach(el);
    const find = (s) => { const [k, r] = s.split('|'); return list.find((y) => y.kind === k && String(y.ref_id) === r); };
    B.ui.pagerBind(el, 'pag', reload);
    el.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { pf.show = b.dataset.s; reload(); }));
        el.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { pf.st = b.dataset.st; reload(); }));
    const q = (s) => el.querySelector(s);
    if (q('#pf-range')) {
      const addD = (n) => { const d = new Date(`${t0}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
      const mEnd = () => { const d = new Date(`${t0.slice(0, 7)}-01T12:00:00`); d.setMonth(d.getMonth() + 1); d.setDate(0); return d.toISOString().slice(0, 10); };
      B.mask.rangePicker(q('#pf-range'), { get: () => ({ from: pf.from, to: pf.to }), set: (f, t) => { if (!f || !t) return; pf.from = f; pf.to = t; reload(); },
        presets: () => [{ label: 'Hoje', from: t0, to: t0 }, { label: 'Próximos 7 dias', from: t0, to: addD(6) }, { label: 'Este mês', from: `${t0.slice(0, 7)}-01`, to: mEnd() }, { label: 'Próximos 30 dias', from: t0, to: addD(29) }] });
    }
    if (q('#pf-new')) q('#pf-new').onclick = () => recurringDrawer(null, reload);
    if (q('#pf-av')) q('#pf-av').onclick = () => moveDrawer(reload);
    el.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => { const x = find(b.dataset.pay); if (x) payModal(x, accounts, x.account_id || state.account, me, reload); }));
    el.querySelectorAll('[data-qr]').forEach((b) => (b.onclick = () => { const x = find(b.dataset.qr); if (x) qrModal(x, accounts, me); }));
    el.querySelectorAll('[data-doc]').forEach((b) => (b.onclick = () => { const x = find(b.dataset.doc); if (x) receiptDoc(x, accounts, me); }));
    el.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = async () => {
      const x = find(b.dataset.cancel), out = x && x.direction !== 'in';
      const ok = await B.confirmAction({ title: out ? 'Cancelar o pagamento' : 'Cancelar o recebimento', text: x && x.kind === 'avulso' ? 'O lançamento volta para a agenda como pendente, e a contabilização e a conciliação dele são desfeitas.' : 'O item volta a ficar a pagar, e a contabilização e a conciliação dele são desfeitas.', confirmLabel: 'Cancelar transação' });
      if (ok == null) return;
      const [k, r] = b.dataset.cancel.split('|');
      try { await run(b, () => rpc('partner_payment_reopen', { p_kind: k, p_ref: r }), 'Transação cancelada'); reload(); } catch (_) { /* já avisado */ }
    }));
    el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      const ok = await B.confirmAction({ title: 'Excluir lançamento', text: 'O lançamento sai da agenda.', confirmLabel: 'Excluir' });
      if (ok == null) return;
      try { await run(b, () => rpc('partner_treasury_undo', { p_kind: 'avulso', p_ref: b.dataset.del }), 'Lançamento excluído'); reload(); } catch (_) { /* já avisado */ }
    }));
    el.querySelectorAll('[data-redit]').forEach((b) => (b.onclick = () => recurringDrawer(recs.find((r) => r.id === b.dataset.redit), reload)));
    el.querySelectorAll('[data-rtog]').forEach((b) => (b.onclick = async () => { const [id, on] = b.dataset.rtog.split('|'); try { await run(b, () => rpc('partner_recurring_toggle', { p_id: id, p_active: on === '1' }), on === '1' ? 'Recorrência ativada' : 'Recorrência pausada'); reload(); } catch (_) { /* já avisado */ } }));
    el.querySelectorAll('[data-rdel]').forEach((b) => (b.onclick = async () => {
      const ok = await B.confirmAction({ title: 'Excluir recorrência', text: 'Os lançamentos já pagos permanecem. Os pendentes futuros deixam de ser gerados.', confirmLabel: 'Excluir' });
      if (ok == null) return;
      try { await run(b, () => rpc('partner_recurring_delete', { p_id: b.dataset.rdel }), 'Recorrência excluída'); reload(); } catch (_) { /* já avisado */ }
    }));
  }

  /* ---------------- aba: Despesas recorrentes ---------------- */
  const TABS = [['pagamentos', 'Pagamentos'], ['conciliacao', 'Conciliação bancária'], ['movimentacoes', 'Movimentações']];
  B.views.tesouraria = async (el, [t], me) => {
    const tab = TABS.some(([k]) => k === t) ? t : 'pagamentos';
    const canPay = me.can_sign !== false;
    el.innerHTML = head('Tesouraria', 'Pagamentos, recebimentos e conciliação do extrato') + B.ui.tabs(TABS, tab) + '<div id="tab"></div>';
    B.ui.onTabs(el, (k) => { location.hash = `#/tesouraria/${k}`; });
    const host = el.querySelector('#tab'), reload = () => B.views.tesouraria(el, [tab], me);
    if (tab === 'conciliacao' && !state.refreshing) { state.refreshing = true; callEdge({ action: 'treasury_refresh' }).catch(() => {}).then(() => { state.refreshing = false; }); }
    if (tab === 'movimentacoes') await B.acct.movimentacoes(host, me); else if (tab === 'pagamentos') await pagamentos(host, me, reload); else await B.acct.conciliacao(host, me);
  };
})();
