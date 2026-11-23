/* Lottus · Backoffice — taxa por comportamento e repasse da parte da Lottus (split payment) */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, dateTime, cnpj, run, toast, confirmAction } = B;
  const { head, tabs, onTabs, empty, can } = B.ui;

  const PHASE = {
    boas_vindas: ['Boas-vindas', 'brand', 'Primeiras antecipações: desconto em escada para criar o hábito.'],
    habitual: ['Habitual', 'success', 'Antecipa no ritmo de sempre. Se está confortável, a taxa sobe aos poucos.'],
    indeciso: ['Indeciso', 'warning', 'Simulou e não antecipou: desconto para fechar.'],
    em_risco: ['Sumindo', 'warning', 'Passou do ritmo dele sem antecipar: desconto para chamar de volta.'],
    inativo: ['Inativo', 'danger', 'Muito tempo sem antecipar: desconto maior para reativar.'],
    desligado: ['Desligado', '', 'Taxa por comportamento desligada.'],
  };
  const phaseTag = (p) => { const [l, t] = PHASE[p] || [p, '']; return `<span class="tag ${t}">${esc(l)}</span>`; };
  const pctS = (v) => `${Number(v) > 0 ? '+' : ''}${Math.round(Number(v || 0) * 100)}%`;
  const TR = { pending: ['A pagar', 'warning'], processing: ['Enviando', 'warning'], done: ['Recebido', 'success'], failed: ['Falhou', 'danger'],
               informed: ['Fundo informou', 'brand'], waived: ['Dispensado', ''] };
  const trTag = (s) => { const [l, t] = TR[s] || [s, '']; return `<span class="tag ${t}">${esc(l)}</span>`; };
  const TABS = [['clientes', 'Clientes'], ['ajustes', 'Ajustes'], ['repasses', 'Repasses à Lottus']];

  // Campos do ajuste: [chave, rótulo, tipo, ajuda]   tipo: pct (fração 0–1 mostrada em %), int, bool, ladder
  const FIELDS = [
    ['enabled', 'Ligada', 'bool', 'Desligada, todo cliente paga a taxa de tabela.'],
    ['max_discount', 'Desconto máximo', 'pct', 'Fração do spread da Lottus que pode virar desconto.'],
    ['max_increase', 'Aumento máximo', 'pct', 'Fração do spread que pode subir para quem está confortável.'],
    ['step_up', 'Passo do aumento', 'pct', 'Quanto sobe a cada antecipação paga no ritmo de sempre.'],
    ['welcome_ladder', 'Escada de boas-vindas', 'ladder', 'Desconto da 1ª, 2ª, 3ª… antecipação, separado por vírgula (ex.: 50, 30, 15).'],
    ['hesitant_views', 'Indeciso: simulações sem antecipar', 'int', null],
    ['hesitant_days', 'Indeciso: janela (dias)', 'int', null],
    ['hesitant_discount', 'Indeciso: desconto', 'pct', null],
    ['at_risk_days', 'Sumindo: dias sem antecipar (mínimo)', 'int', 'Vale o maior entre este número e 2× o intervalo de costume do cliente.'],
    ['at_risk_discount', 'Sumindo: desconto', 'pct', null],
    ['dormant_days', 'Inativo: dias sem antecipar', 'int', null],
    ['dormant_discount', 'Inativo: desconto', 'pct', null],
    ['comfort_min_ops', 'Aumento só depois de (antecipações pagas)', 'int', null],
    ['loyalty_ops', 'Fidelidade a partir de (antecipações pagas)', 'int', 'Sem nenhuma recompra.'],
    ['loyalty_discount', 'Fidelidade: desconto', 'pct', null],
    ['backoff', 'Recuo quando hesita depois de um aumento', 'pct', null],
    ['freeze_days', 'Sem novo aumento por (dias) depois do recuo', 'int', null],
    ['notify', 'Avisar o cliente quando a taxa baixar', 'bool', 'Notificação no app, uma vez por fase a cada 30 dias.'],
  ];

  B.views.taxa = async (el, [arg], me) => {
    const tab = TABS.some(([k]) => k === arg) ? arg : 'clientes';
    const [d, transfers] = await Promise.all([rpc('bo_pricing'), tab === 'repasses' ? rpc('bo_lottus_transfers', { p_status: null }) : Promise.resolve([])]);
    const s = d.settings || {}, sp = d.split || {};
    const admin = can(me, 'admin'), approver = can(me, 'approver');
    const ph = d.phases || {};
    const rev = d.revenue || {};
    el.innerHTML = `
      ${head('Taxa e repasse', 'O ajuste mexe só no spread da Lottus: o fundo recebe sempre a taxa dele', tabs(TABS, tab))}
      <div class="kpis">
        ${['boas_vindas', 'habitual', 'indeciso', 'em_risco', 'inativo'].map((k) => `<div class="kpi"><div class="kpi-label">${esc(PHASE[k][0])}</div><div class="kpi-value">${esc(ph[k] || 0)}</div></div>`).join('')}
        <div class="kpi"><div class="kpi-label">Parte da Lottus (30 dias)</div><div class="kpi-value">${brl(rev.lottus || 0)}</div><span class="small muted">${esc(rev.ops || 0)} operações pagas · ${brl(rev.transfers_open || 0)} a receber</span></div>
      </div>
      <div id="taxa-body"></div>`;
    onTabs(el, (t) => (location.hash = t === 'clientes' ? '#/taxa' : `#/taxa/${t}`));
    const body = el.querySelector('#taxa-body');

    if (tab === 'clientes') {
      const list = d.companies || [];
      body.innerHTML = `
        ${!s.enabled ? '<div class="note-box" style="margin-bottom:12px"><b>Desligada.</b> Todos os clientes pagam a taxa de tabela. Ligue em Ajustes.</div>' : ''}
        <div class="card flush"><div class="table-wrap">${list.length ? `<table>
          <thead><tr><th>Cedente</th><th>Fase</th><th class="num">Ajuste no spread</th><th>Por quê</th><th class="num">Pagas</th><th class="num">Dias sem antecipar</th><th></th></tr></thead>
          <tbody>${list.map((c) => `<tr>
            <td><a href="#/empresas/${esc(c.company_id)}"><b>${esc(c.name)}</b></a><div class="small muted">${esc(cnpj(c.cnpj))}</div></td>
            <td>${phaseTag(c.phase)}${c.frozen_until ? `<div class="small muted">sem aumento até ${esc(B.date(c.frozen_until))}</div>` : ''}</td>
            <td class="num"><b style="color:${Number(c.adj) < 0 ? 'var(--success)' : Number(c.adj) > 0 ? 'var(--warning)' : 'inherit'}">${pctS(c.adj)}</b>${Number(c.comfort) ? `<div class="small muted">conforto ${pctS(c.comfort)}</div>` : ''}</td>
            <td class="small" style="max-width:320px">${esc(c.reason || '')}<div class="muted">atualizado ${dateTime(c.updated_at)}</div></td>
            <td class="num">${esc(c.signals?.paid_ops ?? 0)}</td>
            <td class="num">${c.signals?.days_since == null ? '—' : esc(c.signals.days_since)}${c.signals?.median_gap ? `<div class="small muted">costuma ${esc(Math.round(c.signals.median_gap))}</div>` : ''}</td>
            <td class="num">${approver ? `<button class="btn ghost sm" data-refresh="${esc(c.company_id)}">Recalcular</button>` : ''}</td></tr>`).join('')}</tbody></table>`
          : empty('Nenhum cliente com limite aprovado ainda.')}</div></div>
        <div class="card" style="margin-top:16px"><h2>Mudanças recentes</h2>
          ${(d.history || []).length ? `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Cedente</th><th>Fase</th><th class="num">Ajuste</th><th>Por quê</th></tr></thead>
            <tbody>${d.history.slice(0, 40).map((h) => `<tr><td class="nowrap">${dateTime(h.created_at)}</td><td>${esc(h.name)}</td><td>${phaseTag(h.phase)}</td>
              <td class="num">${pctS(h.adj)}</td><td class="small">${esc(h.reason || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sem mudanças ainda.</p>'}</div>
        <div class="card" style="margin-top:16px"><h2>Como funciona</h2>
          <ul class="small" style="margin:8px 0 0 18px;line-height:1.6">
            ${Object.entries(PHASE).filter(([k]) => k !== 'desligado').map(([, v]) => `<li><b>${esc(v[0])}:</b> ${esc(v[2])}</li>`).join('')}
            <li>Depois de um aumento, se o cliente hesita ou some, o aumento recua e fica congelado. A taxa só sobe de novo quando ele volta ao ritmo.</li>
            <li>O cálculo roda todo dia às 6h45 e depois de cada pedido, pagamento ou cancelamento. A cotação mostra ao cliente o selo do desconto (boas-vindas, retorno, fidelidade); aumento não aparece como selo.</li>
          </ul></div>`;
      body.querySelectorAll('[data-refresh]').forEach((b) => (b.onclick = () => run(b, () => rpc('bo_pricing_refresh', { p_company: b.dataset.refresh }), 'Recalculado').then(B.reload)));
      return;
    }

    if (tab === 'ajustes') {
      const val = (k, t) => (t === 'pct' ? Math.round(Number(s[k] || 0) * 1000) / 10 : t === 'ladder' ? (s[k] || []).map((x) => Math.round(Number(x) * 100)).join(', ') : s[k]);
      body.innerHTML = `<div class="grid-2">
        <form class="card" id="pf"><h2>Taxa por comportamento</h2>
          <div class="stack-sm" style="margin-top:10px">${FIELDS.map(([k, label, t, help]) => t === 'bool'
            ? `<label class="switch-row"><input type="checkbox" name="${k}" ${s[k] ? 'checked' : ''} ${admin ? '' : 'disabled'}><span class="switch" aria-hidden="true"></span><span><b>${esc(label)}</b>${help ? `<span class="small muted" style="display:block">${esc(help)}</span>` : ''}</span></label>`
            : `<div class="field"><label>${esc(label)}${t === 'pct' ? ' (% do spread)' : ''}</label><input class="input" name="${k}" inputmode="${t === 'ladder' ? 'text' : 'decimal'}" value="${esc(val(k, t))}" ${admin ? '' : 'disabled'}>${help ? `<div class="help">${esc(help)}</div>` : ''}</div>`).join('')}</div>
          ${admin ? '<div class="save-bar"><span class="small muted">Ao salvar, todos os clientes são recalculados.</span><button class="btn" type="submit">Salvar</button></div>' : ''}</form>
        <form class="card" id="sf"><h2>Repasse da parte da Lottus</h2>
          <p class="small muted" style="margin-top:6px">Em cada operação, a Lottus fica com o spread dela (taxa do cedente menos o custo do fundo)${sp.lottus_takes_fee ? ' e a tarifa' : ''}, menos o bônus de indicação. No Pix ao cedente pela Conta Trio do fundo, um segundo Pix sai da mesma conta para a chave da Lottus.</p>
          <div class="stack-sm" style="margin-top:10px">
            <label class="switch-row"><input type="checkbox" name="split_enabled" ${sp.split_enabled ? 'checked' : ''} ${admin ? '' : 'disabled'}><span class="switch" aria-hidden="true"></span><span><b>Ligado</b><span class="small muted" style="display:block">Vale para operações aprovadas a partir de agora.</span></span></label>
            <div class="field"><label>Chave Pix da Lottus</label><input class="input mono" name="lottus_pix_key" value="${esc(sp.lottus_pix_key || '')}" placeholder="CNPJ da Lottus" ${admin ? '' : 'disabled'}>
              <div class="help">Use a chave CNPJ${sp.lottus_cnpj ? ` (${esc(cnpj(sp.lottus_cnpj))})` : ''}: antes de cada Pix conferimos que a chave é do CNPJ da Lottus.</div></div>
            <div class="field"><label>Cidade (para o QR Code)</label><input class="input" name="lottus_pix_city" value="${esc(sp.lottus_pix_city || '')}" ${admin ? '' : 'disabled'}></div>
            <label class="switch-row"><input type="checkbox" name="lottus_takes_fee" ${sp.lottus_takes_fee ? 'checked' : ''} ${admin ? '' : 'disabled'}><span class="switch" aria-hidden="true"></span><span><b>A tarifa é da Lottus</b></span></label>
          </div>
          ${admin ? '<div class="save-bar"><span></span><button class="btn" type="submit">Salvar</button></div>' : ''}</form></div>`;
      const pf = body.querySelector('#pf');
      pf.onsubmit = (ev) => {
        ev.preventDefault();
        const p = {};
        for (const [k, , t] of FIELDS) {
          const x = pf.elements[k];
          if (t === 'bool') p[k] = x.checked;
          else if (t === 'int') p[k] = Math.round(Number(String(x.value).replace(',', '.')));
          else if (t === 'pct') p[k] = Math.round(Number(String(x.value).replace(',', '.')) * 10) / 1000;
          else p[k] = String(x.value).split(/[;,\s]+/).filter(Boolean).map((v) => Math.round(Number(v)) / 100);
          if ((t === 'int' || t === 'pct') && !Number.isFinite(p[k])) { toast(`Confira o campo "${FIELDS.find((f) => f[0] === k)[1]}"`, true); return; }
        }
        run(pf.querySelector('[type=submit]'), () => rpc('bo_save_pricing', { p }), 'Ajustes salvos').then(B.reload);
      };
      const sf = body.querySelector('#sf');
      sf.onsubmit = (ev) => {
        ev.preventDefault();
        const p = { split_enabled: sf.elements.split_enabled.checked, lottus_pix_key: sf.elements.lottus_pix_key.value.trim(),
                    lottus_pix_city: sf.elements.lottus_pix_city.value.trim(), lottus_takes_fee: sf.elements.lottus_takes_fee.checked };
        run(sf.querySelector('[type=submit]'), () => rpc('bo_save_split_settings', { p }), 'Repasse salvo').then(B.reload);
      };
      return;
    }

    // Repasses
    body.innerHTML = `
      ${!sp.split_enabled ? '<div class="note-box" style="margin-bottom:12px"><b>Repasse desligado.</b> As operações guardam a parte da Lottus, mas nenhum Pix é pedido ao fundo. Ligue em Ajustes.</div>' : ''}
      <div class="card flush"><div class="table-wrap">${transfers.length ? `<table>
        <thead><tr><th>Operação</th><th>Fundo</th><th class="num">Valor</th><th>Situação</th><th>Comprovante</th><th></th></tr></thead>
        <tbody>${transfers.map((t) => `<tr>
          <td><a href="#/operacoes/${esc(t.operation_id)}"><b>${esc(t.company)}</b></a><div class="small muted">${brl(t.gross)} · ${t.paid_at ? 'paga ' + dateTime(t.paid_at) : 'ainda não paga'}</div></td>
          <td>${esc(t.funder || '—')}<div class="small muted">${esc(t.provider === 'trio' ? 'Conta Trio' : 'fora da Conta Trio')}</div></td>
          <td class="num"><b>${brl(t.amount)}</b></td>
          <td>${trTag(t.status)}${t.error && t.status === 'failed' ? `<div class="small" style="color:var(--danger);max-width:260px">${esc(t.error)}</div>` : ''}${t.attempts ? `<div class="small muted">${esc(t.attempts)} tentativa(s)</div>` : ''}</td>
          <td class="small">${t.reference ? `<span class="mono">${esc(t.reference)}</span>` : ''}${t.receipt_url ? ` <a href="${esc(B.safeUrl(t.receipt_url))}" target="_blank" rel="noopener">ver</a>` : ''}${t.note ? `<div class="muted">${esc(t.note)}</div>` : ''}</td>
          <td class="num nowrap">${approver && !['done', 'waived'].includes(t.status) ? `<button class="btn ghost sm" data-tr="confirm" data-op="${esc(t.operation_id)}">Recebido</button>
            ${['failed', 'informed'].includes(t.status) ? `<button class="btn ghost sm" data-tr="retry" data-op="${esc(t.operation_id)}">Tentar de novo</button>` : ''}
            <button class="btn ghost sm" data-tr="waive" data-op="${esc(t.operation_id)}">Dispensar</button>` : ''}</td></tr>`).join('')}</tbody></table>`
        : empty('Nenhum repasse ainda.')}</div></div>`;
    body.querySelectorAll('[data-tr]').forEach((b) => (b.onclick = async () => {
      const a = b.dataset.tr;
      const note = await confirmAction({
        title: a === 'confirm' ? 'Confirmar o recebimento' : a === 'waive' ? 'Dispensar o repasse' : 'Tentar o Pix de novo',
        text: a === 'confirm' ? 'Confira o Pix no extrato da Lottus antes de confirmar.' : a === 'waive' ? 'O fundo não precisa mais pagar esta parte. Conte o motivo (fica no histórico).' : 'Volta para a fila: o Pix sai de novo na próxima rotina da Trio (a cada 15 min).',
        note: a !== 'retry', noteLabel: a === 'waive' ? 'Motivo' : 'Anotação (opcional)', noteRequired: a === 'waive',
        confirmLabel: a === 'confirm' ? 'Confirmar' : a === 'waive' ? 'Dispensar' : 'Tentar de novo', danger: a === 'waive' });
      if (note == null) return;
      run(b, () => rpc('bo_lottus_transfer_action', { p_op: b.dataset.op, p_action: a, p_note: typeof note === 'string' ? note : null }), 'Feito').then(B.reload);
    }));
  };
})();
