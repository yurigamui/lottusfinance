/* Lottus Partners — operações do fundo: aprovar, recusar e pagar */
(function () {
  'use strict';
  const B = window.BO;
  const { sb, rpc, esc, brl, pct, date, dateTime, cnpj, cpf, toast, run, confirmAction, modal, closeModal } = B;
  const { head, tabs, onTabs, empty, can, skipEmpty } = B.ui;
  const icon = (n) => B.icon(n);

  const TONE = (t) => (['AAA', 'AA', 'A'].includes(t) ? 'success' : ['BBB', 'BB', 'B'].includes(t) ? 'brand' : ['CCC', 'CC', 'C'].includes(t) ? 'warning' : 'danger');
  B.tierTag = (t) => (t ? `<span class="tag ${TONE(t)}">${esc(t)}</span>` : '');

  /* ===================================================== Lottus Partners */
  const P_TABS = [['pending', 'Para aprovar'], ['to_pay', 'A pagar'], ['paid', 'Pagas'], ['all', 'Todas']];
  const PAYOUT = { processing: ['Pagamento em processamento', 'warning'], done: ['Pago', 'success'], failed: ['Pagamento falhou', 'danger'], pending: ['Aguardando pagamento', 'warning'] };
  const DOCK = { contract: 'Contrato social', power_of_attorney: 'Procuração', revenue: 'Faturamento 12 meses', address: 'Comprovante de endereço', financials: 'Balanço e DRE', other: 'Outro' };
  const tierTagP = (t) => (B.tierTag ? B.tierTag(t) : t ? `<span class="tag">${esc(t)}</span>` : '');
  const debtorTone = (r) => ({ A: 'success', B: 'success', C: 'warning', D: 'danger', E: 'danger' })[r] || '';

  async function runPayout(id, btn) {
    const { data, error } = await sb.functions.invoke('charges', { body: { action: 'payout', operation_id: id } });
    if (error) { let c = 'unavailable'; try { c = (await error.context.json()).error || c; } catch { /* sem corpo */ } throw new Error(c); }
    return data;
  }

  B.views.assinar = async (el, [raw], me) => {
    const arg = raw || 'pending';
    if (!P_TABS.some(([k]) => k === arg) && arg !== 'signed') return partnerDetail(el, arg, me);
    const list = await rpc('partner_operations', { p_tab: arg });
    if (skipEmpty(raw, list, 'assinar', 'all')) return B.views.assinar(el, ['all'], me);
    const state = (o) => o.declined_at ? '<span class="tag danger">Recusada</span>'
      : ['paid', 'settled'].includes(o.status) ? '<span class="tag success">Paga</span>'
      : o.status === 'approved' ? (o.payout === 'failed' ? '<span class="tag danger">Pagamento falhou</span>' : '<span class="tag warning">A pagar</span>')
      : ['rejected', 'cancelled'].includes(o.status) ? '<span class="tag">Encerrada</span>' : '<span class="tag brand">Para aprovar</span>';
    el.innerHTML = `
      ${head('Operações', me.funder ? me.funder.legal_name : null, tabs(P_TABS, arg))}
      <div class="card flush"><div class="table-wrap">
        ${list.length === 0 ? empty(arg === 'pending' ? 'Nenhuma operação esperando a sua aprovação.' : 'Nada por aqui.') : `<table>
          <thead><tr><th>Cedente</th><th class="num">Duplicatas</th><th>Situação</th><th class="num">Pedida</th></tr></thead>
          <tbody>${list.map((o) => `<tr class="link" data-id="${esc(o.id)}">
            <td><b>${esc(o.legal_name)}</b> ${tierTagP(o.tier)}</td>
            <td class="num">${brl(o.gross)}<div class="small muted">${pct(o.monthly_rate)} a.m.</div></td>
            <td>${state(o)}</td>
            <td class="num nowrap">${date(o.created_at)}</td>
          </tr>`).join('')}</tbody></table>`}
      </div></div>`;
    onTabs(el, (t) => (location.hash = `#/assinar/${t}`));
    el.querySelectorAll('[data-id]').forEach((r) => (r.onclick = () => (location.hash = `#/assinar/${r.dataset.id}`)));
  };

  async function partnerDetail(el, id, me) {
    const [d, x] = await Promise.all([rpc('partner_operation', { p_id: id }), rpc('partner_operation_details', { p_id: id })]);
    const o = d.operation, c = d.company, a = x.assignor || {}, bh = a.behavior || {};
    const canApprove = d.can_sign;
    const missing = (x.checks || []).filter((k) => k.required && !k.ok && k.key !== 'funder_acceptance');
    const pay = x.payout ? PAYOUT[x.payout.status] : null;
    const api = x.payout_mode && x.payout_mode !== 'manual';
    const maxDays = Math.max(0, ...d.items.map((i) => Number(i.days) || 0));
    const pc = (v) => (v == null ? '—' : `${Math.round(Number(v) * 100)}%`);
    const xmls = (x.invoices || []).filter((i) => i.xml_path);
    const status = o.declined_at ? '<span class="tag danger">Recusada</span>' : ['paid', 'settled'].includes(x.status) ? '<span class="tag success">Paga</span>'
      : x.status === 'approved' ? '<span class="tag warning">Aprovada · a pagar</span>' : ['rejected', 'cancelled'].includes(x.status) ? '<span class="tag">Encerrada</span>' : '<span class="tag brand">Para aprovar</span>';
    el.innerHTML = `
      <div class="page-head"><div><a class="back" href="#/assinar">‹ Operações</a>
        <h1>${esc(c.legal_name)} ${tierTagP(a.tier)}</h1><div class="page-sub">pedida em ${dateTime(o.created_at)}</div></div></div>
      <div class="detail">
        <aside class="rail"><div class="card rail-card">
          ${status}
          <div class="rail-amount">${brl(o.gross)}</div><div class="rail-amount-label">em duplicatas</div>
          <dl class="lines">
            <dt>Líquido ao cedente</dt><dd><b>${brl(o.net)}</b></dd>
            <dt>Taxa</dt><dd>${pct(o.monthly_rate)} a.m.</dd>
            <dt>Prazo máximo</dt><dd>${maxDays} dias</dd>
          </dl>
          ${canApprove ? `${missing.length ? `<div class="note-box">Falta: ${esc(missing.map((m) => m.label).join(', '))}</div>` : ''}
            <div class="rail-actions"><button class="btn block" id="approve" ${missing.length ? 'disabled' : ''}>Aprovar</button>
            <button class="btn danger block" id="decline">Recusar</button></div>
            <p class="small muted" style="margin:8px 0 0">Aprovar assina o aceite da cessão${api ? ' e paga o cedente pela API' : ''}.</p>` : ''}
          ${o.decline_note ? `<div class="note-box">${esc(o.decline_note)}</div>` : ''}
          ${x.status === 'approved' || x.payout ? `<div class="stack-sm" style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">
            <b>Pagamento ao cedente</b> ${pay ? `<span class="tag ${pay[1]}">${esc(pay[0])}</span>` : ''}
            ${x.payout && x.payout.error ? `<div class="small" style="color:var(--danger)">${esc(x.payout.error)}</div>` : ''}
            ${x.payout && x.payout.receipt_url ? `<a class="small" href="${esc(x.payout.receipt_url)}" target="_blank" rel="noopener">Comprovante</a>` : ''}
            ${x.status === 'approved' && x.bank ? `<div class="small muted">${brl(o.net)} · ${esc(x.bank.bank_code)} ${esc(x.bank.bank_name)} · ag. ${esc(x.bank.branch)} · cc ${esc(x.bank.account)} · ${esc(cnpj(x.bank.holder_document))}</div>
              ${me.can_sign !== false ? `${api && (!x.payout || x.payout.status === 'failed') ? '<button class="btn block" id="payapi">Pagar pela API</button>' : ''}
              <button class="btn secondary block" id="paymanual">Registrar pagamento feito</button>` : ''}` : ''}
          </div>` : ''}
        </div></aside>
        <div class="stack">
          <div class="card"><h2>Sacados</h2><div class="list">${(x.debtors || []).map((s) => `<div class="list-row">
            <div class="grow"><b>${esc(s.name || cnpj(s.cnpj))}</b> <span class="tag ${debtorTone(s.rating)}">${esc(s.rating || '—')}</span>${s.blocked ? ' <span class="tag danger">Bloqueado</span>' : ''}
              <div class="small muted">${s.paid_history && s.paid_history.count ? `${esc(s.paid_history.count)} pagas, ${esc(s.paid_history.late)} com atraso` : 'sem histórico'}${Number(s.exposure_funder) ? ` · ${brl(s.exposure_funder)} já com você` : ''}</div></div>
            <div class="num"><b>${brl(s.gross)}</b></div></div>`).join('')}</div></div>

          <div class="card"><h2>Cedente</h2><dl class="kv">
              <dt>Rating</dt><dd>${tierTagP(a.tier)} ${a.score != null ? `nota ${Math.round(a.score)}` : ''}</dd>
              <dt>Na Lottus</dt><dd>${esc(bh.ops_total || 0)} operações${bh.on_time_ratio != null ? ` · ${pc(bh.on_time_ratio)} em dia` : ''}</dd>
              ${Number(bh.overdue_open) ? `<dt>Em atraso</dt><dd style="color:var(--danger)">${brl(bh.overdue_open)}</dd>` : ''}
            </dl>
            ${(x.documents || []).length || xmls.length ? `<div class="row" style="flex-wrap:wrap;gap:6px;justify-content:flex-start;margin-top:12px">
              ${(x.documents || []).map((f, i) => `<button class="btn secondary sm" data-doc="${i}">${esc(DOCK[f.kind] || f.kind)}</button>`).join('')}
              ${xmls.map((i, n) => `<button class="btn ghost sm" data-xml="${n}">XML NF-e ${esc(i.number || '—')}</button>`).join('')}</div>` : ''}
          </div>

          <details class="card"><summary><b>Mais detalhes</b></summary>
            <div class="stack-sm" style="margin-top:12px">
              ${(x.checks || []).map((k) => `<div class="small">${k.ok ? '✓' : '·'} ${esc(k.label)} <span class="muted">${k.ok ? dateTime(k.signed_at) : k.key === 'funder_acceptance' ? 'assinado ao aprovar' : 'não assinado'}</span></div>`).join('')}
              <h3 class="section-title" style="margin-top:8px">Duplicatas</h3>
              ${d.items.map((i) => `<div class="row between small"><span>NF-e ${esc(i.nfe_number || '—')}/${esc(i.installment)} · ${esc(i.debtor_name || cnpj(i.debtor_cnpj))} · ${date(i.due_date)}</span><b>${brl(i.amount)}</b></div>`).join('')}
              ${d.contract_text ? `<details style="margin-top:8px"><summary class="small"><b>Termo de cessão assinado pelo cedente</b></summary>
                <div class="contract-box" style="margin-top:8px">${B.contractHtml(d.contract_text)}</div></details>` : ''}
            </div></details>
        </div>
      </div>`;

    el.querySelectorAll('[data-doc]').forEach((b) => (b.onclick = () => B.openFile('company-docs', x.documents[b.dataset.doc].path)));
    el.querySelectorAll('[data-xml]').forEach((b) => (b.onclick = () => B.openFile('invoices', xmls[b.dataset.xml].xml_path)));

    const ap = el.querySelector('#approve');
    if (ap) ap.onclick = async () => {
      const ok = await confirmAction({ title: 'Aprovar a operação', confirmLabel: 'Aprovar e assinar',
        text: `${esc(d.statement)}<br><br><b>${brl(o.gross)}</b> em duplicatas de ${esc(c.legal_name)}. Líquido ao cedente: <b>${brl(o.net)}</b>.` });
      if (ok == null) return;
      const r = await run(ap, () => rpc('partner_approve', { p_id: id }), 'Operação aprovada e aceite assinado');
      if (r && r.payout_mode && r.payout_mode !== 'manual') {
        await run(null, () => runPayout(id), 'Pagamento enviado ao cedente').catch(() => null);
      }
      B.reload();
    };
    const dec = el.querySelector('#decline');
    if (dec) dec.onclick = async () => {
      const note = await confirmAction({ title: 'Recusar a operação', confirmLabel: 'Recusar', danger: true, note: true, noteRequired: true,
        notePlaceholder: 'Ex.: sacado fora da política do fundo.' });
      if (note == null) return;
      run(dec, () => rpc('partner_decline', { p_id: id, p_note: note }), 'Operação recusada').then((r) => { if (r) location.hash = '#/assinar'; });
    };
    const pa = el.querySelector('#payapi');
    if (pa) pa.onclick = () => run(pa, () => runPayout(id), 'Pagamento enviado ao cedente').then(B.reload);
    const pm = el.querySelector('#paymanual');
    if (pm) pm.onclick = async () => {
      const ref = await confirmAction({ title: 'Registrar pagamento ao cedente', confirmLabel: 'Registrar', note: true, noteRequired: true,
        text: `Pix ou TED de <b>${brl(o.net)}</b> para ${esc(c.legal_name)}.`, notePlaceholder: 'Id do Pix (E2E) ou número da TED' });
      if (ref == null) return;
      run(pm, () => rpc('partner_register_payment', { p_id: id, p_reference: ref }), 'Pagamento registrado').then(B.reload);
    };
  }
})();
