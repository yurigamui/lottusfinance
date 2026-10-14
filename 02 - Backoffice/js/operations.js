/* Lottus · Backoffice — operações, cobrança e quitações */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, pct, date, dateTime, ago, cnpj, cpf, tag, check, run, toast, confirmAction, modal, closeModal } = B;
  const { head, tabs, onTabs, empty, can, mergeAll, skipEmpty } = B.ui;

  const FILTERS = {
    analisar: ['Para analisar', ['requested', 'in_review']],
    pagar: ['Aprovadas a pagar', ['approved']],
    pagas: ['Pagas · em cobrança', ['paid']],
    liquidadas: ['Liquidadas', ['settled']],
    recusadas: ['Recusadas e canceladas', ['rejected', 'cancelled']],
    todas: ['Todas', ['requested', 'in_review', 'approved', 'paid', 'settled', 'rejected', 'cancelled']],
  };
  const today = () => new Date().toISOString().slice(0, 10);
  const SOURCE = {
    app: 'Pedido no app pelo administrador', request: 'Pedido do financeiro aprovado pelo administrador',
    delegated: 'Financeiro dentro da alçada', schedule: 'Saque agendado',
  };
  const EVIDENCE = {
    master_agreement: 'Contrato-mãe aceito', anticipation_request: 'Pedido assinado', anticipation: 'Cessão assinada',
    scheduled_withdrawal: 'Agendamento assinado', delegation: 'Alçada concedida',
  };

  B.views.operacoes = async (el, [raw]) => {
    const arg = raw || 'analisar';
    if (!FILTERS[arg]) return detail(el, arg);
    const list = await rpc('bo_operations', { p_status: FILTERS[arg][1] });
    if (skipEmpty(raw, list, 'operacoes', 'todas')) return B.views.operacoes(el, ['todas']);
    el.innerHTML = `
      ${head('Operações', null, tabs(Object.entries(FILTERS).map(([k, v]) => [k, v[0]]), arg))}
      <div class="card flush"><div class="table-wrap">
        ${list.length === 0 ? empty('Nada nesta fila.') : `<table>
          <thead><tr><th>Pedida</th><th>Empresa</th><th>Situação</th><th class="num">Duplicatas</th><th class="num">Líquido</th><th>1º vencimento</th></tr></thead>
          <tbody>${list.map((o) => `<tr class="link" data-id="${esc(o.id)}">
            <td class="nowrap">${dateTime(o.created_at)}<div class="small muted">${ago(o.created_at)}</div></td>
            <td><b>${esc(o.legal_name)}</b><div class="small muted">${esc(cnpj(o.cnpj))}</div></td>
            <td>${tag('op', o.status)}</td>
            <td class="num">${brl(o.gross_amount)}<div class="small muted">${esc(o.items)} parcela(s) · ${esc(o.debtors)} sacado(s)</div></td>
            <td class="num"><b>${brl(o.net_amount)}</b><div class="small muted">${pct(o.monthly_rate)} a.m.</div></td>
            <td class="nowrap">${date(o.first_due)}</td></tr>`).join('')}</tbody></table>`}
      </div></div>`;
    onTabs(el, (t) => (location.hash = `#/operacoes/${t}`));
    el.querySelectorAll('[data-id]').forEach((r) => (r.onclick = () => (location.hash = `#/operacoes/${r.dataset.id}`)));
  };

  async function detail(el, id) {
    const me = await rpc('bo_me');
    const d = await rpc('bo_operation', { p_id: id });
    // Contexto das assinaturas (aparelho, biometria, sessão, identidade, e-mail ao signatário)
    const ev = d.evidence.length
      ? await rpc('bo_evidence_details', { p_ids: d.evidence.map((e) => e.id) }).catch(() => ({}))
      : {};
    const o = d.operation, b = d.bank, approver = can(me, 'approver');
    const st = o.status;
    const back = { requested: 'analisar', in_review: 'analisar', approved: 'pagar', paid: 'pagas', settled: 'liquidadas' }[st] || 'recusadas';

    // Ações possíveis na situação atual
    const actions = [];
    if (st === 'requested') actions.push(['review', 'Iniciar análise', 'secondary']);
    if (approver && (st === 'requested' || st === 'in_review')) actions.push(['approve', 'Aprovar operação', '']);
    if (approver && st === 'approved') actions.push(['pay', 'Registrar pagamento', 'brand']);
    if (approver && st === 'paid') actions.push(['settle', 'Liquidar operação', 'secondary']);
    if (approver && ['requested', 'in_review'].includes(st)) actions.push(['reject', 'Recusar', 'danger']);
    if (approver && st === 'approved') actions.push(['cancel', 'Cancelar', 'danger']);

    const debtors = {};
    d.items.forEach((i) => {
      const k = i.recipient_cnpj;
      debtors[k] = debtors[k] || { name: i.recipient_name, total: 0, contact: i.contact };
      debtors[k].total += Number(i.amount);
    });
    const overdue = (i) => i.charge_status === 'open' && st === 'paid' && i.due_date < today();

    const ctxOf = (e) => ev[e.id]?.context || {};
    const sumOf = (e) => ev[e.id]?.summary || {};
    o._company = d.company.legal_name;
    el.innerHTML = `
      <div class="page-head"><div><a class="back" href="#/operacoes/${back}">‹ Operações</a>
        <h1>${esc(d.company.legal_name)}</h1><div class="page-sub">Pedida em ${dateTime(o.created_at)}${d.requested_by ? ' por ' + esc(d.requested_by) : ''}</div></div></div>
      <div class="detail">
      <aside class="rail">
        <div id="funder-card"></div>
        <div class="card rail-card">
          ${tag('op', st)}
          <div class="rail-amount">${brl(o.net_amount)}</div>
          <div class="rail-amount-label">líquido para a empresa</div>
          <dl class="lines">
            <dt>Duplicatas</dt><dd>${brl(o.gross_amount)}</dd>
            <dt>Deságio</dt><dd>− ${brl(o.discount_amount)}</dd>
            ${Number(o.iof_amount) ? `<dt>IOF</dt><dd>− ${brl(o.iof_amount)}</dd>` : ''}
            ${Number(o.fee_amount) ? `<dt>Tarifa</dt><dd>− ${brl(o.fee_amount)}</dd>` : ''}
            ${Number(o.bonus_amount) ? `<dt>Bônus de indicação</dt><dd>+ ${brl(o.bonus_amount)}</dd>` : ''}
            <dt>Taxa</dt><dd>${pct(o.monthly_rate)} a.m.</dd>
            <dt>Custo efetivo</dt><dd>${pct(o.effective_monthly_rate)} a.m.</dd>
          </dl>
          ${o.status_note ? `<div class="note-box">${esc(o.status_note)}</div>` : ''}
          ${actions.length ? `<div class="rail-actions" id="actions">${actions.map(([a, l, c]) => `<button class="btn block ${c}" data-action="${a}">${esc(l)}</button>`).join('')}</div>` : ''}
          <button class="btn ghost sm block" id="receipt" style="margin-top:8px">Comprovante (PDF)</button>
        </div>
        <div class="card rail-card">
          <h3>Conta de crédito</h3>
          ${!b ? '<p class="muted">Sem conta informada.</p>' : `<dl class="lines">
            <dt>Banco</dt><dd>${esc(b.bank_code)} ${esc(b.bank_name)}</dd>
            <dt>Agência</dt><dd>${esc(b.branch)}</dd>
            <dt>Conta</dt><dd>${esc(b.account_number)}-${esc(b.account_digit)}</dd>
            <dt>Tipo</dt><dd>${b.account_type === 'payment' ? 'Pagamento' : 'Corrente'}</dd>
            <dt>Titular</dt><dd>${esc(cnpj(b.holder_document))}</dd>
          </dl>
          ${b.holder_document !== d.company.cnpj ? `<div class="note-box">Titular diferente do CNPJ da empresa</div>` : ''}
          <button class="btn secondary sm block" id="copy-bank">Copiar dados</button>`}
        </div>
      </aside>
      <div class="stack">
        <div class="card">
          <dl class="kv">
            <dt>Empresa</dt><dd><a href="#/empresas/${esc(d.company.id)}">${esc(d.company.legal_name)}</a> ${esc(cnpj(d.company.cnpj))}</dd>
            <dt>Situação na Receita</dt><dd>${esc(d.company.status)}</dd>
            <dt>Origem</dt><dd>${esc(SOURCE[o.source] || 'Pedido no app')}</dd>
            <dt>Limite</dt><dd>${d.credit ? `${brl(d.credit.limit_amount)} a ${pct(d.credit.monthly_rate)} a.m. ${tag('credit', d.credit.status)}` : '—'}</dd>
            ${o.approved_at ? `<dt>Aprovada</dt><dd>${dateTime(o.approved_at)}</dd>` : ''}
            ${o.paid_at ? `<dt>Paga</dt><dd>${dateTime(o.paid_at)}, comprovante <span class="mono">${esc(o.payout_reference || '—')}</span></dd>` : ''}
            ${o.settled_at ? `<dt>Liquidada</dt><dd>${dateTime(o.settled_at)}</dd>` : ''}
          </dl>
        </div>

        <div class="card"><h2>Sacados</h2>
          <div class="list">${Object.entries(debtors).map(([k, v]) => `<div class="list-row">
            <div class="grow"><b>${esc(v.name || cnpj(k))}</b><div class="small muted">${esc(cnpj(k))}${v.contact ? ', ' + esc(v.contact) : ''}</div>
              ${v.contact ? '' : '<div class="small" style="color:var(--danger)">Sem e-mail de cobrança</div>'}</div>
            <div class="num">${brl(v.total)}</div></div>`).join('')}</div></div>

        <div class="card"><div class="card-head"><h2>Duplicatas</h2><span class="muted">${d.items.length} ${d.items.length === 1 ? 'parcela' : 'parcelas'}</span></div>
          <div class="list">${d.items.map((i, n) => `<div class="list-row dup">
            <div class="grow"><b>NF-e ${esc(i.invoice_number || '—')}, parcela ${esc(i.number)}</b>
              <div class="small muted">${esc(i.recipient_name || cnpj(i.recipient_cnpj))}</div></div>
            <div class="dup-due">${date(i.due_date)}<div class="small muted">${esc(i.days)} dias</div></div>
            <div class="dup-amount num"><b>${brl(i.amount)}</b>${i.paid_at ? `<div class="small muted">paga em ${date(i.paid_at)}</div>` : ''}</div>
            <div class="dup-status">${overdue(i) ? '<span class="tag danger">Vencida</span>' : tag('charge', i.charge_status)}</div>
            <div class="dup-actions">
              <button class="btn ghost sm" data-key="${n}" title="Copiar chave de acesso">Chave</button>
              ${i.xml_path ? `<button class="btn ghost sm" data-xml="${n}">XML</button>` : ''}
              ${approver && ['approved', 'paid'].includes(st) && i.charge_status === 'open' ? `<button class="btn secondary sm" data-charge="${n}">${i.digitable_line ? 'Boleto ✓' : 'Boleto'}</button>` : ''}
              ${approver && st === 'paid' && i.charge_status === 'open' ? `<button class="btn sm" data-paid="${n}">Dar baixa</button>` : ''}
            </div></div>`).join('')}</div></div>

        <div class="card"><h2>Assinaturas eletrônicas</h2>
          ${d.evidence.length === 0 ? '<p class="muted">Nenhuma assinatura registrada.</p>' :
            `<div class="stack-sm">${d.evidence.map((e, n) => `<details>
              <summary>${esc(EVIDENCE[e.kind] || e.kind)}
                <span class="muted">por ${esc(e.signer_name)}, ${dateTime(e.signed_at)}</span></summary>
              <dl class="kv" style="margin:10px 0">
                <dt>CPF</dt><dd>${esc(cpf(e.signer_cpf))} · ${esc(B.ACCESS[e.signer_access] || e.signer_access || '')}</dd>
                <dt>IP</dt><dd>${esc(e.ip || '—')}${ctxOf(e).network?.country ? ' · ' + esc(ctxOf(e).network.country) : ''}</dd>
                <dt>Aparelho</dt><dd class="small">${esc(sumOf(e).device || e.user_agent || '—')}${sumOf(e).device_since ? ` · em uso desde ${date(sumOf(e).device_since)}` : ''}</dd>
                ${sumOf(e).confirmation ? `<dt>Confirmação</dt><dd>${esc(sumOf(e).confirmation)}${ctxOf(e).confirmation?.seconds_before != null ? ` · ${esc(ctxOf(e).confirmation.seconds_before)} s antes de assinar` : ''}</dd>` : ''}
                ${ctxOf(e).session ? `<dt>Sessão</dt><dd class="small">${esc([ctxOf(e).session.aal, (ctxOf(e).session.amr || []).map((m) => m.method).join('+'), ctxOf(e).session.started_at ? 'login ' + dateTime(ctxOf(e).session.started_at) : null, ctxOf(e).session.login_ip ? 'IP do login ' + ctxOf(e).session.login_ip : null].filter(Boolean).join(' · '))}</dd>` : ''}
                ${ctxOf(e).account ? `<dt>Conta</dt><dd>${esc(ctxOf(e).account.email || '')}${ctxOf(e).account.email_confirmed_at ? ` · confirmado em ${date(ctxOf(e).account.email_confirmed_at)}` : ''}</dd>` : ''}
                ${ctxOf(e).identity ? `<dt>Identidade</dt><dd>Aprovada em ${dateTime(ctxOf(e).identity.approved_at)}${ctxOf(e).identity.provider ? ' · ' + esc(ctxOf(e).identity.provider) : ''}</dd>` : ''}
                ${sumOf(e).statement ? `<dt>Declaração</dt><dd class="small">${esc(sumOf(e).statement)}</dd>` : ''}
                ${(ev[e.id]?.notifications || []).length ? `<dt>Aviso</dt><dd>E-mail para ${esc(ev[e.id].notifications[0].email)} em ${dateTime(ev[e.id].notifications[0].at)}</dd>` : ''}
                <dt>Hash do documento</dt><dd class="mono">${esc(e.document_hash)}</dd>
                ${ev[e.id]?.context_hash ? `<dt>Hash do contexto</dt><dd class="mono">${esc(ev[e.id].context_hash)}</dd>` : ''}
                <dt>Hash do registro</dt><dd class="mono">${esc(e.record_hash)}</dd>
              </dl>
              <pre class="json">${esc(JSON.stringify(e.document, null, 2))}</pre>
              ${ev[e.id]?.context ? `<pre class="json">${esc(JSON.stringify(ev[e.id].context, null, 2))}</pre>` : ''}
              <button class="btn secondary sm" data-ev="${n}">Baixar evidência (JSON)</button>
            </details>`).join('')}</div>`}
        </div>

        ${d.settlements.length ? `<div class="card"><h2>Quitação antecipada</h2><div class="stack-sm" style="margin-top:12px">${d.settlements.map((s) =>
          `<div class="row between"><div>${tag('settlement', s.status)} <span class="mono">${esc(s.txid)}</span><div class="small muted">pedida ${dateTime(s.created_at)} · vale até ${dateTime(s.expires_at)}</div></div><b>${brl(s.amount)}</b></div>`).join('')}</div>
          <a class="btn secondary sm" style="margin-top:12px" href="#/quitacoes">Ver quitações</a></div>` : ''}

        <div class="card"><h2>Histórico na Lottus</h2>${B.actionsList(d.actions)}</div>
      </div>
      </div>`;

    // Parceiro (cessionária), aceite e boletos
    o._items = d.items.length;
    if (B.funderCard) B.funderCard(el.querySelector('#funder-card'), o, me);

    // Ações da operação
    el.querySelectorAll('[data-action]').forEach((btn) => (btn.onclick = () => doAction(btn, btn.dataset.action, o, b)));
    const rb = el.querySelector('#receipt');
    if (rb) rb.onclick = () => B.openReceipt(o.id, rb);
    const cb = el.querySelector('#copy-bank');
    if (cb) cb.onclick = () => B.copy(`${b.bank_code} ${b.bank_name}\nAgência ${b.branch}\nConta ${b.account_number}-${b.account_digit}\nCNPJ ${cnpj(b.holder_document)}\n${d.company.legal_name}\nValor ${brl(o.net_amount)}`);
    el.querySelectorAll('[data-key]').forEach((x) => (x.onclick = () => B.copy(d.items[x.dataset.key].access_key)));
    el.querySelectorAll('[data-xml]').forEach((x) => (x.onclick = () => B.openFile('invoices', d.items[x.dataset.xml].xml_path)));
    el.querySelectorAll('[data-ev]').forEach((x) => (x.onclick = () => {
      const e = { ...d.evidence[x.dataset.ev], ...(ev[d.evidence[x.dataset.ev].id] || {}) };
      const blob = new Blob([JSON.stringify(e, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `evidencia-${e.kind}-${e.id}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }));
    el.querySelectorAll('[data-paid]').forEach((x) => (x.onclick = async () => {
      const i = d.items[x.dataset.paid];
      const r = await confirmAction({
        title: 'Dar baixa na duplicata', confirmLabel: 'Dar baixa',
        text: `NF-e ${esc(i.invoice_number)}/${esc(i.number)} · ${esc(i.recipient_name || '')} · ${brl(i.amount)}.`,
        extra: `<div class="field"><label>Pago em</label><input class="input" type="date" data-field="paid_on" value="${today()}"></div>`,
      });
      if (r == null) return;
      run(null, () => rpc('bo_mark_installment_paid', { p_installment: i.installment_id, p_paid_on: r.values.paid_on || today() }), 'Baixa registrada').then(B.reload);
    }));
    el.querySelectorAll('[data-charge]').forEach((x) => (x.onclick = async () => {
      const i = d.items[x.dataset.charge];
      const r = await confirmAction({
        title: 'Boleto registrado no banco', confirmLabel: 'Salvar boleto',
        text: `NF-e ${esc(i.invoice_number)}/${esc(i.number)} · vence ${date(i.due_date)} · ${brl(i.amount)}`,
        extra: `<div class="field"><label>Nosso número</label><input class="input" data-field="our" value="${esc(i.our_number || '')}"></div>
          <div class="field"><label>Linha digitável (47 dígitos)</label><input class="input mono" data-field="line" value="${esc(i.digitable_line || '')}"></div>`,
      });
      if (r == null) return;
      run(null, () => rpc('bo_register_charge', { p_installment: i.installment_id, p_our_number: r.values.our, p_digitable_line: r.values.line }), 'Boleto salvo').then(B.reload);
    }));
  }

  async function doAction(btn, action, o, bank) {
    const call = (note, ref) => run(btn, () => rpc('bo_operation_action', { p_id: o.id, p_action: action, p_note: note || null, p_reference: ref || null }));
    if (action === 'review') return call().then(() => { toast('Operação em análise'); B.reload(); });
    if (action === 'approve') {
      const ok = await confirmAction({ title: 'Aprovar operação', confirmLabel: 'Aprovar',
        text: `${brl(o.net_amount)} para ${esc(o._company)}` });
      if (ok == null) return;
      return call().then(() => { toast('Operação aprovada'); B.reload(); });
    }
    if (action === 'pay') {
      if (!bank) return toast('A operação não tem conta de crédito.', true);
      const r = await confirmAction({ title: 'Registrar pagamento', confirmLabel: 'Registrar pagamento',
        text: `<b>${brl(o.net_amount)}</b> para ${esc(bank.bank_name)}, agência ${esc(bank.branch)}, conta ${esc(bank.account_number)}-${esc(bank.account_digit)}`,
        extra: `<div class="field"><label>Comprovante (id do Pix ou da TED)</label><input class="input mono" data-field="ref" placeholder="E1234567820261009..."></div>` });
      if (r == null) return;
      if (!r.values.ref.trim()) return toast('Informe o comprovante.', true);
      return call(null, r.values.ref).then(async () => {
        toast('Pagamento registrado');
        // Com a API do parceiro configurada, os boletos já saem registrados
        if (B._funderReady && B.issueCharges) await B.issueCharges(o.id, true);
        B.reload();
      });
    }
    if (action === 'settle') {
      const ok = await confirmAction({ title: 'Liquidar operação', confirmLabel: 'Liquidar',
        text: `${brl(o.gross_amount)} em duplicatas de ${esc(o._company)}` });
      if (ok == null) return;
      return call().then(() => { toast('Operação liquidada'); B.reload(); });
    }
    if (action === 'reject' || action === 'cancel') {
      const note = await confirmAction({ title: action === 'reject' ? 'Recusar operação' : 'Cancelar operação',
        confirmLabel: action === 'reject' ? 'Recusar' : 'Cancelar operação', danger: true, note: true, noteRequired: true,
        notePlaceholder: 'Ex.: a nota 1234 foi cancelada pelo emitente.' });
      if (note == null) return;
      return call(note).then(() => { toast(action === 'reject' ? 'Operação recusada' : 'Operação cancelada'); B.reload(); });
    }
  }

  /* ============================================================ Quitações */
  const SETTLE_TABS = [['awaiting_payment', 'Aguardando Pix'], ['paid', 'Pagas'], ['expired', 'Expiradas'], ['all', 'Todas']];
  B.views.quitacoes = async (el, [arg], me) => {
    const status = SETTLE_TABS.some(([k]) => k === arg) ? arg : 'awaiting_payment';
    const one = (st) => rpc('bo_settlements', { p_status: st });
    const list = status === 'all' ? await mergeAll(one, ['awaiting_payment', 'paid', 'expired', 'cancelled']) : await one(status);
    if (skipEmpty(arg, list, 'quitacoes', 'all')) return B.views.quitacoes(el, ['all'], me);
    const approver = can(me, 'approver');
    el.innerHTML = `
      ${head('Quitações', null, tabs(SETTLE_TABS, status))}
      <div class="card flush"><div class="table-wrap">
        ${list.length === 0 ? empty('Nada nesta fila.') : `<table>
          <thead><tr><th>Pedida</th><th>Empresa</th><th>txid</th><th class="num">Valor</th><th>Validade</th><th></th></tr></thead>
          <tbody>${list.map((s, i) => `<tr>
            <td class="nowrap">${dateTime(s.created_at)}<div class="small muted">${esc(s.requested_by || '')}</div></td>
            <td><b>${esc(s.legal_name)}</b><div class="small muted">${esc(cnpj(s.cnpj))}</div></td>
            <td class="mono">${esc(s.txid)}</td><td class="num"><b>${brl(s.amount)}</b></td>
            <td class="nowrap">${dateTime(s.expires_at)}${new Date(s.expires_at) < new Date() && s.status === 'awaiting_payment' ? ' <span class="tag">vencida</span>' : ''}</td>
            <td class="num"><div class="row" style="justify-content:flex-end">
              <a class="btn ghost sm" href="#/operacoes/${esc(s.operation_id)}">Operação</a>
              ${approver && s.status !== 'paid' ? `<button class="btn sm" data-confirm="${i}">Confirmar Pix</button>` : tag('settlement', s.status)}
            </div></td></tr>`).join('')}</tbody></table>`}
      </div></div>
`;
    onTabs(el, (t) => (location.hash = `#/quitacoes/${t}`));
    el.querySelectorAll('[data-confirm]').forEach((b) => (b.onclick = async () => {
      const s = list[b.dataset.confirm];
      const ok = await confirmAction({ title: 'Confirmar Pix recebido', confirmLabel: 'Confirmar',
        text: `Pix de <b>${brl(s.amount)}</b> com txid <span class="mono">${esc(s.txid)}</span> de ${esc(s.legal_name)}.` });
      if (ok == null) return;
      run(b, () => rpc('bo_confirm_settlement', { p_id: s.id }), 'Quitação confirmada').then(B.reload);
    }));
  };
})();
