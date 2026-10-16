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

  /** Texto de contrato com a marcação simples dos modelos ("# ", "## ") */
  B.contractHtml = B.contractHtml || ((text) => `<div class="contract">${String(text || '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
    .map((b) => (b.startsWith('# ') ? `<h3 class="contract-title">${esc(b.slice(2))}</h3>` : b.startsWith('## ') ? `<h4>${esc(b.slice(3))}</h4>`
      : `<p>${esc(b).replace(/\n/g, '<br>')}</p>`)).join('')}</div>`);

  // Abas calculadas aqui, com a lista completa: troca de aba na hora e contagem em cada uma
  const IN_TAB = {
    pending: (o) => !o.signed_at && !o.declined_at && ['requested', 'in_review'].includes(o.status),
    to_pay: (o) => o.status === 'approved',
    paid: (o) => ['paid', 'settled'].includes(o.status),
    all: () => true,
  };
  const stateOf = (o) => o.declined_at ? ['Recusada', 'danger']
    : ['paid', 'settled'].includes(o.status) ? ['Paga', 'success']
    : o.status === 'approved' ? (o.payout === 'failed' ? ['Pagamento falhou', 'danger'] : o.payout === 'processing' ? ['Pagando', 'brand'] : ['A pagar', 'warning'])
    : ['rejected', 'cancelled'].includes(o.status) ? ['Encerrada', ''] : ['Para aprovar', 'brand'];
  const stateTag = (o) => { const [l, t] = stateOf(o); return `<span class="tag ${t}">${esc(l)}</span>`; };
  const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const daysTo = (iso) => (iso ? Math.round((new Date(iso + 'T12:00:00') - new Date(todayIso() + 'T12:00:00')) / 86400000) : null);
  const dueText = (iso) => { const n = daysTo(iso); return n == null ? '' : n < 0 ? `vencida há ${-n} d` : n === 0 ? 'vence hoje' : `em ${n} dias`; };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  B.views.assinar = async (el, [raw], me) => {
    const arg = raw || 'pending';
    if (!IN_TAB[arg] && arg !== 'signed') return partnerDetail(el, arg, me);
    const all = await rpc('partner_operations', { p_tab: 'all' });
    const count = Object.fromEntries(Object.keys(IN_TAB).map((k) => [k, all.filter(IN_TAB[k]).length]));
    let tab = arg === 'signed' ? 'all' : arg;
    if (!raw && !count.pending) tab = count.to_pay ? 'to_pay' : 'all';
    const labels = P_TABS.map(([k, l]) => [k, count[k] && k !== 'all' ? `${l} · ${count[k]}` : l]);
    el.innerHTML = `
      ${head('Operações', me.funder ? me.funder.legal_name : null, tabs(labels, tab))}
      <div class="ops-bar">
        <input class="input search" id="q" type="search" placeholder="Buscar cedente ou CNPJ" aria-label="Buscar cedente ou CNPJ">
        <span class="small muted" id="sum"></span>
      </div>
      <div class="card flush"><div id="list"></div></div>`;
    const paint = () => {
      const q = norm(el.querySelector('#q').value).replace(/[.\-/]/g, '');
      const list = all.filter(IN_TAB[tab]).filter((o) => !q || norm(o.legal_name).includes(q) || String(o.cnpj || '').includes(q));
      const gross = list.reduce((s, o) => s + Number(o.gross || 0), 0);
      el.querySelector('#sum').textContent = list.length ? `${list.length} ${list.length === 1 ? 'operação' : 'operações'} · ${brl(gross)} em duplicatas` : '';
      el.querySelector('#list').innerHTML = list.length === 0
        ? `<div class="empty-cta"><b>${q ? 'Nenhuma operação encontrada' : tab === 'pending' ? 'Tudo em dia' : 'Nada por aqui'}</b>
            <span class="small muted">${q ? 'Confira o nome ou o CNPJ.' : tab === 'pending' ? 'Nenhuma operação esperando a sua aprovação. Avisamos por e-mail quando chegar outra.' : 'As operações aparecem aqui conforme forem aprovadas e pagas.'}</span></div>`
        : `<table class="ops-table">
          <thead><tr><th>Cedente</th><th class="num">Duplicatas</th><th class="num">Líquido ao cedente</th><th>1º vencimento</th><th>Situação</th><th class="num">Pedida</th><th aria-hidden="true"></th></tr></thead>
          <tbody>${list.map((o) => `<tr class="link" data-id="${esc(o.id)}" tabindex="0">
            <td data-label="Cedente"><div class="ops-name"><b>${esc(o.legal_name)}</b> ${tierTagP(o.tier)}</div><div class="small muted">${esc(cnpj(o.cnpj))}</div></td>
            <td class="num" data-label="Duplicatas"><b>${brl(o.gross)}</b><div class="small muted">${esc(o.items)} ${Number(o.items) === 1 ? 'parcela' : 'parcelas'} · ${pct(o.monthly_rate)} a.m.</div></td>
            <td class="num" data-label="Líquido">${brl(o.net)}</td>
            <td data-label="1º vencimento">${o.first_due ? `${date(o.first_due)}<div class="small muted">${dueText(o.first_due)}</div>` : '—'}</td>
            <td data-label="Situação">${stateTag(o)}</td>
            <td class="num nowrap" data-label="Pedida">${B.ago ? B.ago(o.created_at) : date(o.created_at)}</td>
            <td class="go" aria-hidden="true">›</td>
          </tr>`).join('')}</tbody></table>`;
      el.querySelectorAll('[data-id]').forEach((r) => {
        r.onclick = () => (location.hash = `#/assinar/${r.dataset.id}`);
        r.onkeydown = (e) => { if (e.key === 'Enter') r.onclick(); };
      });
    };
    el.querySelector('#q').oninput = paint;
    onTabs(el, (t) => { tab = t; history.replaceState(null, '', `#/assinar/${t}`); el.querySelectorAll('[data-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.tab === t); b.setAttribute('aria-selected', String(b.dataset.tab === t)); }); paint(); });
    paint();
  };

  /** Recusa com motivos rápidos */
  const REASONS = ['Sacado fora da política do fundo', 'Cedente fora da política do fundo', 'Sem limite disponível', 'Prazo acima do aceito', 'Documentação insuficiente'];
  function askDecline() {
    return new Promise((resolve) => {
      const box = modal({
        title: 'Recusar a operação',
        subtitle: 'A operação segue para o próximo fundo da fila. O cedente só é avisado se nenhum fundo aprovar.',
        body: `<div class="stack"><div class="chips" role="group" aria-label="Motivo">${REASONS.map((r, i) => `<button type="button" class="chip" data-r="${i}">${esc(r)}</button>`).join('')}</div>
          <div class="field"><label for="dn">Motivo</label><textarea id="dn" class="input" placeholder="Escolha acima ou escreva"></textarea></div>
          <div class="error-box" id="de" hidden></div></div>`,
        foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn danger" data-act="ok">Recusar</button>',
      });
      const ta = box.querySelector('#dn');
      box.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => {
        box.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
        ta.value = REASONS[b.dataset.r]; ta.focus();
      }));
      box.querySelector('[data-act=cancel]').onclick = () => { closeModal(); resolve(null); };
      box.querySelector('[data-act=ok]').onclick = () => {
        const v = ta.value.trim();
        if (!v) { const e = box.querySelector('#de'); e.hidden = false; e.textContent = 'Escolha ou escreva o motivo.'; return; }
        closeModal(); resolve(v);
      };
    });
  }

  async function partnerDetail(el, id, me) {
    const [d, x, queue] = await Promise.all([
      rpc('partner_operation', { p_id: id }), rpc('partner_operation_details', { p_id: id }),
      rpc('partner_operations', { p_tab: 'pending' }).catch(() => []),
    ]);
    const o = d.operation, c = d.company, a = x.assignor || {}, bh = a.behavior || {};
    const isPending = !o.signed_at && !o.declined_at && ['requested', 'in_review'].includes(x.status || o.status);
    const canApprove = d.can_sign && isPending;
    const missing = (x.checks || []).filter((k) => k.required && !k.ok && k.key !== 'funder_acceptance');
    const pay = x.payout ? PAYOUT[x.payout.status] : null;
    const api = x.payout_mode && x.payout_mode !== 'manual';
    const maxDays = Math.max(0, ...d.items.map((i) => Number(i.days) || 0));
    const firstDue = d.items.map((i) => i.due_date).filter(Boolean).sort()[0];
    const pc = (v) => (v == null ? '—' : `${Math.round(Number(v) * 100)}%`);
    const xmls = (x.invoices || []).filter((i) => i.xml_path);
    const debtors = x.debtors || [];
    const RANK = { A: 1, B: 2, C: 3, D: 4, E: 5 };
    const worst = debtors.map((s) => s.rating).filter(Boolean).sort((p, q) => (RANK[q] || 9) - (RANK[p] || 9))[0];
    const exposure = debtors.reduce((s, r) => s + Number(r.exposure_funder || 0), 0);
    const pos = queue.findIndex((q) => q.id === id);
    const prev = pos > 0 ? queue[pos - 1].id : null, next = pos >= 0 && pos < queue.length - 1 ? queue[pos + 1].id : null;
    const afterDecision = () => { const n = queue.filter((q) => q.id !== id)[0]; location.hash = n ? `#/assinar/${n.id}` : '#/assinar/pending'; if (n) B.toast('Próxima operação para aprovar'); };
    const status = o.declined_at ? '<span class="tag danger">Recusada por você</span>' : ['paid', 'settled'].includes(x.status) ? '<span class="tag success">Paga</span>'
      : x.status === 'approved' ? '<span class="tag warning">Aprovada · a pagar</span>' : ['rejected', 'cancelled'].includes(x.status) ? '<span class="tag">Encerrada</span>' : '<span class="tag brand">Para aprovar</span>';
    const check = (ok, title, text) => `<li class="${ok === true ? 'ok' : ok === false ? 'no' : 'info'}"><span class="ci" aria-hidden="true">${ok === true ? '✓' : ok === false ? '!' : '·'}</span>
      <span><b>${title}</b><span class="small muted">${text}</span></span></li>`;

    el.innerHTML = `
      <div class="page-head"><div><a class="back" href="#/assinar">‹ Operações</a>
        <h1>${esc(c.legal_name)} ${tierTagP(a.tier)}</h1><div class="page-sub">${esc(cnpj(c.cnpj))}${c.city ? ` · ${esc(c.city)}/${esc(c.uf || '')}` : ''} · pedida ${B.ago ? B.ago(o.created_at) : dateTime(o.created_at)}</div></div>
        ${pos >= 0 && queue.length > 1 ? `<div class="pager"><span class="small muted">${pos + 1} de ${queue.length} para aprovar</span>
          <a class="btn ghost sm ${prev ? '' : 'disabled'}" ${prev ? `href="#/assinar/${esc(prev)}"` : 'aria-disabled="true"'} aria-label="Anterior">‹</a>
          <a class="btn ghost sm ${next ? '' : 'disabled'}" ${next ? `href="#/assinar/${esc(next)}"` : 'aria-disabled="true"'} aria-label="Próxima">›</a></div>` : ''}</div>
      <div class="detail">
        <aside class="rail"><div class="card rail-card">
          ${status}
          <div class="rail-amount">${brl(o.gross)}</div><div class="rail-amount-label">em duplicatas</div>
          <dl class="lines">
            <dt>Líquido ao cedente</dt><dd><b>${brl(o.net)}</b></dd>
            <dt>Taxa</dt><dd>${pct(o.monthly_rate)} a.m.</dd>
            <dt>1º vencimento</dt><dd>${firstDue ? `${date(firstDue)}` : '—'}</dd>
            <dt>Prazo máximo</dt><dd>${maxDays} dias</dd>
          </dl>
          ${isPending ? `<ul class="decide">
            ${check(!missing.length, 'Documentos', missing.length ? `Falta: ${esc(missing.map((m) => m.label).join(', '))}` : 'Tudo assinado pelo cedente')}
            ${check(a.tier ? !['CCC', 'CC', 'C', 'DDD', 'DD', 'D'].includes(a.tier) : null, 'Cedente', a.tier ? `Rating ${esc(a.tier)}${a.score != null ? `, nota ${Math.round(a.score)}` : ''}` : 'Sem rating')}
            ${check(worst ? !['D', 'E'].includes(worst) : null, debtors.length === 1 ? 'Sacado' : `${debtors.length} sacados`, worst ? `Pior rating ${esc(worst)}` : 'Sem rating')}
            ${check(null, 'Exposição', exposure ? `${brl(exposure)} já com você nestes sacados` : 'Primeira operação com estes sacados')}
          </ul>` : ''}
          ${canApprove ? `<div class="rail-actions" id="acts"><button class="btn block lg" id="approve" ${missing.length ? 'disabled' : ''}>Aprovar</button>
            <button class="btn danger block" id="decline">Recusar</button></div>
            <p class="small muted" style="margin:0">Aprovar assina o aceite da cessão${api ? ' e paga o cedente pela API' : ''}.</p>` : ''}
          ${o.decline_note ? `<div class="note-box">${esc(o.decline_note)}</div>` : ''}
          ${x.status === 'approved' || x.payout ? `<div class="stack-sm pay-box">
            <div class="row between"><b>Pagamento ao cedente</b> ${pay ? `<span class="tag ${pay[1]}">${esc(pay[0])}</span>` : ''}</div>
            ${x.payout && x.payout.error ? `<div class="small" style="color:var(--danger)">${esc(x.payout.error)}</div>` : ''}
            ${x.payout && x.payout.receipt_url ? `<a class="small" href="${esc(x.payout.receipt_url)}" target="_blank" rel="noopener">Ver comprovante</a>` : ''}
            ${x.status === 'approved' && x.bank ? `<dl class="lines small">
                <dt>Valor</dt><dd><b>${brl(o.net)}</b></dd>
                <dt>Banco</dt><dd>${esc(x.bank.bank_code)} ${esc(x.bank.bank_name || '')}</dd>
                <dt>Agência · conta</dt><dd>${esc(x.bank.branch)} · ${esc(x.bank.account)}</dd>
                <dt>Titular</dt><dd>${esc(cnpj(x.bank.holder_document))}</dd></dl>
              ${me.can_sign !== false ? `${api && (!x.payout || x.payout.status === 'failed') ? '<button class="btn block" id="payapi">Pagar pela API</button>' : ''}
              <button class="btn secondary block" id="paymanual">Registrar pagamento feito</button>` : ''}` : ''}
          </div>` : ''}
        </div></aside>
        <div class="stack">
          <div class="card"><div class="card-head"><h2>Sacados</h2><span class="small muted">quem paga as duplicatas</span></div>
            <div class="list">${debtors.map((s) => `<div class="list-row">
              <div class="grow"><b>${esc(s.name || cnpj(s.cnpj))}</b> <span class="tag ${debtorTone(s.rating)}">${esc(s.rating || '—')}</span>${s.blocked ? ' <span class="tag danger">Bloqueado</span>' : ''}
                <div class="small muted">${esc(cnpj(s.cnpj))} · ${s.paid_history && s.paid_history.count ? `${esc(s.paid_history.count)} pagas, ${esc(s.paid_history.late)} com atraso` : 'sem histórico na Lottus'}${Number(s.exposure_funder) ? ` · ${brl(s.exposure_funder)} já com você` : ''}</div></div>
              <div class="num"><b>${brl(s.gross)}</b></div></div>`).join('')}</div></div>

          <div class="card"><div class="card-head"><h2>Duplicatas</h2><span class="small muted">${d.items.length} ${d.items.length === 1 ? 'parcela' : 'parcelas'}</span></div>
            <div class="list">${d.items.map((i) => `<div class="list-row">
              <div class="grow"><b>NF-e ${esc(i.nfe_number || '—')}/${esc(i.installment)}</b><div class="small muted">${esc(i.debtor_name || cnpj(i.debtor_cnpj))}</div></div>
              <div class="num"><b>${brl(i.amount)}</b><div class="small muted">${date(i.due_date)} · ${dueText(i.due_date)}</div></div></div>`).join('')}</div></div>

          <div class="card"><h2>Cedente</h2><dl class="kv" style="margin-top:12px">
              <dt>Rating</dt><dd>${tierTagP(a.tier)} ${a.score != null ? `nota ${Math.round(a.score)}` : ''}</dd>
              <dt>Na Lottus</dt><dd>${esc(bh.ops_total || 0)} operações${bh.on_time_ratio != null ? ` · ${pc(bh.on_time_ratio)} em dia` : ''}</dd>
              ${Number(bh.overdue_open) ? `<dt>Em atraso</dt><dd style="color:var(--danger)">${brl(bh.overdue_open)}</dd>` : ''}
            </dl>
            ${(x.documents || []).length || xmls.length ? `<div class="row" style="flex-wrap:wrap;gap:6px;justify-content:flex-start;margin-top:14px">
              ${(x.documents || []).map((f, i) => `<button class="btn secondary sm" data-doc="${i}">${esc(DOCK[f.kind] || f.kind)}</button>`).join('')}
              ${xmls.map((i, n) => `<button class="btn ghost sm" data-xml="${n}">XML NF-e ${esc(i.number || '—')}</button>`).join('')}</div>` : ''}
          </div>

          <details class="card"><summary><b>Assinaturas e termo de cessão</b></summary>
            <div class="stack-sm" style="margin-top:12px">
              ${(x.checks || []).map((k) => `<div class="small">${k.ok ? '✓' : '·'} ${esc(k.label)} <span class="muted">${k.ok ? dateTime(k.signed_at) : k.key === 'funder_acceptance' ? 'assinado ao aprovar' : 'não assinado'}</span></div>`).join('')}
              ${d.contract_text ? `<details style="margin-top:8px"><summary class="small"><b>Ler o termo assinado pelo cedente</b></summary>
                <div class="contract-box" style="margin-top:8px">${B.contractHtml(d.contract_text)}</div></details>` : ''}
            </div></details>
        </div>
      </div>
      ${canApprove ? `<div class="decision-bar"><button class="btn danger" data-dec>Recusar</button><button class="btn" data-ap ${missing.length ? 'disabled' : ''}>Aprovar ${brl(o.gross)}</button></div>` : ''}`;

    el.querySelectorAll('[data-doc]').forEach((b) => (b.onclick = () => B.openFile('company-docs', x.documents[b.dataset.doc].path)));
    el.querySelectorAll('[data-xml]').forEach((b) => (b.onclick = () => B.openFile('invoices', xmls[b.dataset.xml].xml_path)));

    const approve = async (btn) => {
      const ok = await confirmAction({ title: 'Aprovar a operação', confirmLabel: 'Aprovar e assinar',
        text: `<dl class="lines" style="margin:0 0 12px"><dt>Cedente</dt><dd><b>${esc(c.legal_name)}</b></dd><dt>Duplicatas</dt><dd><b>${brl(o.gross)}</b></dd>
          <dt>Líquido ao cedente</dt><dd><b>${brl(o.net)}</b></dd><dt>Taxa</dt><dd>${pct(o.monthly_rate)} a.m.</dd></dl>
          <span class="small muted">${esc(d.statement)}</span>` });
      if (ok == null) return;
      const r = await run(btn, () => rpc('partner_approve', { p_id: id }), 'Operação aprovada e aceite assinado').catch(() => null);
      if (!r) return;
      if (r.payout_mode && r.payout_mode !== 'manual') await run(null, () => runPayout(id), 'Pagamento enviado ao cedente').catch(() => null);
      afterDecision();
    };
    const decline = async (btn) => {
      const note = await askDecline();
      if (note == null) return;
      const r = await run(btn, () => rpc('partner_decline', { p_id: id, p_note: note }), 'Operação recusada').catch(() => null);
      if (r) afterDecision();
    };
    el.querySelectorAll('#approve, [data-ap]').forEach((b) => (b.onclick = () => approve(b)));
    el.querySelectorAll('#decline, [data-dec]').forEach((b) => (b.onclick = () => decline(b)));
    const pa = el.querySelector('#payapi');
    if (pa) pa.onclick = () => run(pa, () => runPayout(id), 'Pagamento enviado ao cedente').then(B.reload).catch(() => null);
    const pm = el.querySelector('#paymanual');
    if (pm) pm.onclick = async () => {
      const ref = await confirmAction({ title: 'Registrar pagamento ao cedente', confirmLabel: 'Registrar', note: true, noteRequired: true, noteLabel: 'Identificação do pagamento',
        text: `Pix ou TED de <b>${brl(o.net)}</b> para ${esc(c.legal_name)}.`, notePlaceholder: 'Id do Pix (E2E) ou número da TED' });
      if (ref == null) return;
      run(pm, () => rpc('partner_register_payment', { p_id: id, p_reference: ref }), 'Pagamento registrado').then(B.reload).catch(() => null);
    };
  }
})();
