/* Lottus · Backoffice — operações, cobrança e quitações */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, pct, date, dateTime, ago, cnpj, tag, run, confirmAction } = B;
  const { head, tabs, onTabs, empty, can, mergeAll, skipEmpty } = B.ui;

  // As etapas do sistema (as mesmas do app e do quadro do fundo)
  const ALL = ['requested', 'in_review', 'approved', 'paid', 'settled', 'rejected', 'cancelled'];
  const FILTERS = {
    solicitacao: 'Solicitação', analise: 'Análise', pagamento: 'Pagamento', ativo: 'Ativo', vencido: 'Vencido',
    liquidado: 'Liquidado', reprovado: 'Reprovado', todas: 'Todas',
  };
  const STAGE = {
    solicitacao: ['Solicitação', 'brand'], analise: ['Análise', 'warning'], pagamento: ['Pagamento', 'warning'], ativo: ['Ativo', 'success'],
    vencido: ['Vencido', 'danger'], liquidado: ['Liquidado', ''], reprovado: ['Reprovado', 'danger'],
  };
  const stageTag = (s) => { const [l, t] = STAGE[s] || [s, '']; return `<span class="tag ${t}">${esc(l)}</span>`; };
  const LEGACY = { analisar: 'analise', pagar: 'pagamento', pagas: 'ativo', liquidadas: 'liquidado', recusadas: 'reprovado' };
  const today = () => new Date().toISOString().slice(0, 10);
  B.views.operacoes = async (el, [rawIn]) => {
    const raw = LEGACY[rawIn] || rawIn;
    const arg = raw || 'solicitacao';
    if (!FILTERS[arg]) return detail(el, arg);
    const all = await rpc('bo_operations', { p_status: ALL });
    const count = (k) => all.filter((o) => o.stage === k).length;
    const list = arg === 'todas' ? all : all.filter((o) => o.stage === arg);
    if (!raw && !list.length) { history.replaceState(null, '', '#/operacoes/todas'); return B.views.operacoes(el, ['todas']); }
    el.innerHTML = `
      ${head('Operações', 'As mesmas etapas do app e do quadro dos fundos. Quem aprova, paga e dá baixa é o fundo, no Lottus Partners.',
        tabs(Object.entries(FILTERS).map(([k, v]) => [k, k === 'todas' ? v : `${v}${count(k) ? ` (${count(k)})` : ''}`]), arg))}
      <div class="card flush"><div class="table-wrap">
        ${list.length === 0 ? empty('Nada nesta etapa.') : `<table>
          <thead><tr><th>Cedente</th><th>Fundo</th><th>Etapa</th><th class="num">Duplicatas</th><th class="num">1º vencimento</th><th class="num">Pedida</th></tr></thead>
          <tbody>${list.map((o) => `<tr class="link" data-id="${esc(o.id)}">
            <td><b>${esc(o.legal_name)}</b><div class="small muted">${esc(cnpj(o.cnpj))}</div></td>
            <td>${esc(o.funder || '—')}</td>
            <td>${stageTag(o.stage)}</td>
            <td class="num">${brl(o.gross_amount)}<div class="small muted">${esc(o.items)} título${o.items === 1 ? '' : 's'}</div></td>
            <td class="num nowrap">${date(o.first_due)}</td>
            <td class="num nowrap">${date(o.created_at)}<div class="small muted">${ago(o.created_at)}</div></td></tr>`).join('')}</tbody></table>`}
      </div></div>`;
    onTabs(el, (t) => (location.hash = `#/operacoes/${t}`));
    el.querySelectorAll('[data-id]').forEach((r) => (r.onclick = () => (location.hash = `#/operacoes/${r.dataset.id}`)));
  };

  const OFFER = { approved: ['aprovou', 'success'], declined: ['recusou', 'danger'], skipped: ['pulado', ''] };
  const PAY = { pending: 'na fila', processing: 'processando', done: 'pago', failed: 'falhou' };

  /** Operação no admin: só acompanhamento (quem decide e paga é o fundo, no Lottus Partners) */
  async function detail(el, id) {
    const [d, docs, fx] = await Promise.all([
      rpc('bo_operation', { p_id: id }),
      rpc('bo_operation_documents', { p_id: id }).catch(() => []),
      rpc('bo_operation_payout', { p_id: id }).catch(() => null),
    ]);
    const o = d.operation, st = o.status;
    const open = ['requested', 'in_review'].includes(st);
    const missing = docs.filter((x) => x.required && !x.ok && !(open && x.key === 'funder_acceptance'));
    const offers = (fx && fx.offers) || [];
    const p = fx && fx.payout;
    const overdue = (i) => i.charge_status === 'open' && st === 'paid' && i.due_date < today();
    const when = [['Pedida', o.created_at], ['Aprovada', o.approved_at], ['Paga', o.paid_at], ['Liquidada', o.settled_at]].filter((x) => x[1]);
    const fund = fx && fx.funder ? esc(fx.funder.name) : '—';
    const queue = offers.length > 1 || offers.some((x) => x.decision && x.decision !== 'approved')
      ? `<div class="small muted">${offers.map((x) => `${esc(x.funder)} ${x.decision ? OFFER[x.decision][0] : 'analisando'}`).join(' · ')}</div>` : '';

    el.innerHTML = `
      <div class="page-head"><div><a class="back" href="#/operacoes/todas">‹ Operações</a>
        <h1>${esc(d.company.legal_name)}</h1><div class="page-sub">${esc(cnpj(d.company.cnpj))} · pedida em ${dateTime(o.created_at)}</div></div></div>
      <div class="detail">
      <aside class="rail">
        <div class="card rail-card">
          ${tag('op', st === 'paid' && d.items.some((i) => overdue(i)) ? 'vencido' : st)}
          <div class="rail-amount">${brl(o.gross_amount)}</div>
          <div class="rail-amount-label">em duplicatas</div>
          <dl class="lines">
            <dt>Líquido ao cedente</dt><dd>${brl(o.net_amount)}</dd>
            <dt>Taxa</dt><dd>${pct(o.monthly_rate)} a.m.</dd>
          </dl>
          ${o.status_note ? `<div class="note-box">${esc(o.status_note)}</div>` : ''}
          <div class="stack-sm" style="margin-top:6px">
            <button class="btn ghost sm block" id="receipt">Baixar comprovante</button>
            ${docs.some((x) => ['anticipation', 'scheduled_withdrawal'].includes(x.key) && x.ok) ? '<button class="btn ghost sm block" id="contract">Baixar Contrato</button>' : ''}
          </div>
        </div>
      </aside>
      <div class="stack">
        <div class="card">
          <dl class="kv">
            <dt>Parceiro</dt><dd><b>${fund}</b>${queue}</dd>
            <dt>Cedente</dt><dd><a href="#/empresas/${esc(d.company.id)}">${esc(d.company.legal_name)}</a></dd>
            <dt>Documentos</dt><dd>${missing.length ? `<span class="tag danger">Falta: ${missing.map((x) => esc(x.label)).join(', ')}</span>` : '<span class="tag success">Tudo assinado</span>'}</dd>
            ${p ? `<dt>Pagamento</dt><dd>${esc(PAY[p.status] || p.status)}${p.error ? ` · <span style="color:var(--danger)">${esc(p.error)}</span>` : ''}</dd>` : ''}
            <dt>Datas</dt><dd>${when.map(([l, v]) => `${l} ${date(v)}`).join('<br>')}</dd>
          </dl>
        </div>

        <div class="card"><div class="card-head"><h2>Duplicatas</h2><span class="muted">${d.items.length}</span></div>
          <div class="list">${d.items.map((i) => `<div class="list-row">
            <div class="grow"><b>${esc(i.recipient_name || cnpj(i.recipient_cnpj))}</b>
              <div class="small muted">NF-e ${esc(i.invoice_number || '—')}/${esc(i.number)} · vence ${date(i.due_date)}</div></div>
            <div class="num"><b>${brl(i.amount)}</b><div>${overdue(i) ? '<span class="tag danger">Vencida</span>' : ['paid', 'settled'].includes(st) ? tag('charge', i.charge_status) : ''}</div></div></div>`).join('')}</div>
          <p class="small muted" style="margin:10px 0 0">Recompras, ocorrências e lembretes de cada duplicata: em <a href="#/cobrancas/all">Cobranças</a>.</p></div>

        <div class="card" id="nfe-card"></div>

        <div class="card" id="notices-card"></div>

        <details class="card"><summary><b>Assinaturas e histórico</b></summary>
          <div class="stack-sm" style="margin-top:12px">
            ${docs.map((x) => `<div class="row between"><span>${x.ok ? '✓' : '·'} ${esc(x.label)} <span class="small muted">${x.ok ? dateTime(x.signed_at) : 'não assinado'}</span></span>
              ${x.evidence_id ? `<button class="btn ghost sm" data-doc="${esc(x.evidence_id)}">Ver</button>` : ''}</div>`).join('')}
            ${offers.filter((x) => x.note).map((x) => `<div class="small muted">${esc(x.funder)} ${OFFER[x.decision] ? OFFER[x.decision][0] : ''}: ${esc(x.note)}</div>`).join('')}
            ${B.actionsList(d.actions)}
          </div>
        </details>
      </div>
      </div>`;

    const rb = el.querySelector('#receipt');
    if (rb) rb.onclick = () => B.openReceipt(o.id, rb);
    const kb = el.querySelector('#contract');
    if (kb) kb.onclick = () => B.openContract(o.id, kb);
    if (B.noticesCard) B.noticesCard(el.querySelector('#notices-card'), o.id);
    if (B.nfeCard) B.nfeCard(el.querySelector('#nfe-card'), o.id, st);
    el.querySelectorAll('[data-doc]').forEach((x) => (x.onclick = () => B.showLegalDocument(Number(x.dataset.doc))));
  }

  /* ============================================================ Quitações */
  const SETTLE_TABS = [['awaiting_payment', 'Aguardando Pix'], ['paid', 'Pagas'], ['expired', 'Expiradas'], ['all', 'Todas']];
  B.views.quitacoes = async (el, [arg], me) => {
    const status = SETTLE_TABS.some(([k]) => k === arg) ? arg : 'awaiting_payment';
    const one = (st) => rpc('bo_settlements', { p_status: st });
    const list = status === 'all' ? await mergeAll(one, ['awaiting_payment', 'paid', 'expired', 'cancelled']) : await one(status);
    if (skipEmpty(arg, list, 'quitacoes', 'all')) return B.views.quitacoes(el, ['all'], me);
    el.innerHTML = `
      ${head('Quitações', 'O Pix da quitação cai na conta do fundo; quem confirma é o fundo, no Lottus Partners.', tabs(SETTLE_TABS, status))}
      <div class="card flush"><div class="table-wrap">
        ${list.length === 0 ? empty('Nada nesta fila.') : `<table>
          <thead><tr><th>Pedida</th><th>Empresa</th><th>Fundo</th><th>Identificador</th><th class="num">Valor</th><th>Validade</th><th></th></tr></thead>
          <tbody>${list.map((s, i) => `<tr>
            <td class="nowrap">${dateTime(s.created_at)}<div class="small muted">${esc(s.requested_by || '')}</div></td>
            <td><b>${esc(s.legal_name)}</b><div class="small muted">${esc(cnpj(s.cnpj))}</div></td>
            <td>${esc(s.funder || '—')}</td>
            <td class="mono">${esc(s.txid)}</td><td class="num"><b>${brl(s.amount)}</b></td>
            <td class="nowrap">${dateTime(s.expires_at)}${new Date(s.expires_at) < new Date() && s.status === 'awaiting_payment' ? ' <span class="tag">vencida</span>' : ''}</td>
            <td class="num"><div class="row" style="justify-content:flex-end">
              <a class="btn ghost sm" href="#/operacoes/${esc(s.operation_id)}">Operação</a>
              ${tag('settlement', s.status)}
            </div></td></tr>`).join('')}</tbody></table>`}
      </div></div>
`;
    onTabs(el, (t) => (location.hash = `#/quitacoes/${t}`));
  };

  /** Pix da quitação antecipada recebido: confirma e liquida as duplicatas */
  B.confirmSettlement = async (s, b) => {
    const ok = await confirmAction({ title: 'Confirmar Pix recebido', confirmLabel: 'Confirmar',
      text: `Pix de <b>${brl(s.amount)}</b> com txid <span class="mono">${esc(s.txid)}</span>${s.legal_name ? ' de ' + esc(s.legal_name) : ''}.` });
    if (ok == null) return;
    run(b, () => rpc('bo_confirm_settlement', { p_id: s.id }), 'Quitação confirmada').then(B.reload);
  };
})();
