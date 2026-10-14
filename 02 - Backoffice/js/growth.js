/* Lottus · Backoffice — saques agendados e indicações */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, dateTime, cnpj, tag, run, toast, confirmAction } = B;
  const { head, tabs, onTabs, empty, can, mergeAll, skipEmpty } = B.ui;

  /* ========================================================= Agendamentos */
  const SCHEDULE_TABS = [['scheduled', 'Agendados'], ['done', 'Feitos'], ['failed', 'Não feitos'], ['cancelled', 'Cancelados'], ['all', 'Todos']];

  B.views.agendamentos = async (el, [arg]) => {
    const status = SCHEDULE_TABS.some(([k]) => k === arg) ? arg : 'scheduled';
    const one = (st) => rpc('bo_scheduled', { p_status: st });
    const list = status === 'all' ? await mergeAll(one, ['scheduled', 'done', 'failed', 'cancelled']) : await one(status);
    if (skipEmpty(arg, list, 'agendamentos', 'all')) return B.views.agendamentos(el, ['all']);
    const total = list.reduce((s, w) => s + Number(w.estimated_net || 0), 0);
    el.innerHTML = `
      ${head('Agendamentos', null, tabs(SCHEDULE_TABS, status))}
      ${status === 'scheduled' && list.length ? `<div class="kpis">
        <div class="kpi"><div class="kpi-label">Saques agendados</div><div class="kpi-value">${list.length}</div></div>
        <div class="kpi"><div class="kpi-label">Líquido estimado</div><div class="kpi-value">${brl(total)}</div></div>
      </div>` : ''}
      <div class="card flush"><div class="table-wrap">
        ${list.length === 0 ? empty('Nada nesta fila.') : `<table>
          <thead><tr><th>Data do saque</th><th>Empresa</th><th class="num">Duplicatas</th><th class="num">Líquido estimado</th><th>Agendado por</th><th></th></tr></thead>
          <tbody>${list.map((w) => `<tr>
            <td class="nowrap"><b>${date(w.scheduled_for)}</b>${status === 'all' ? `<div>${tag('schedule', w.status)}</div>` : ''}</td>
            <td><a href="#/empresas/${esc(w.company_id)}"><b>${esc(w.legal_name)}</b></a><div class="small muted">${esc(cnpj(w.cnpj))}</div></td>
            <td class="num">${brl(w.gross)}<div class="small muted">${esc(w.installments)} parcela(s)</div></td>
            <td class="num"><b>${brl(w.estimated_net)}</b></td>
            <td>${esc(w.created_by || '—')}<div class="small muted">${dateTime(w.created_at)}</div></td>
            <td class="num">${w.operation_id ? `<a class="btn ghost sm" href="#/operacoes/${esc(w.operation_id)}">Operação</a>`
              : w.failure_reason ? `<span class="small" style="color:var(--danger)">${esc(w.failure_reason)}</span>` : ''}</td>
          </tr>`).join('')}</tbody></table>`}
      </div></div>`;
    onTabs(el, (t) => (location.hash = `#/agendamentos/${t}`));
  };

  /* =========================================================== Indicações */
  const REF_LABEL = {
    pending: ['Aguardando 1º saque', 'warning'], qualified: ['Qualificada', 'brand'],
    credited: ['Bônus usado', 'success'], cancelled: ['Cancelada', 'danger'],
  };
  const refTag = (s) => { const [l, t] = REF_LABEL[s] || [s, '']; return `<span class="tag ${t}">${esc(l)}</span>`; };

  B.views.indicacoes = async (el, _p, me) => {
    const d = await rpc('bo_referrals');
    const items = d.items || [];
    const admin = can(me, 'admin'), approver = can(me, 'approver');
    const n = (s) => items.filter((r) => r.status === s).length;
    el.innerHTML = `
      ${head('Indicações')}
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Bônus por indicação</div><div class="kpi-value">${brl(d.bonus)}</div>
          ${admin ? '<button class="btn secondary sm" id="set-bonus" style="margin-top:10px">Alterar</button>' : ''}</div>
        <div class="kpi"><div class="kpi-label">Aguardando 1º saque</div><div class="kpi-value">${n('pending')}</div></div>
        <div class="kpi"><div class="kpi-label">Qualificadas</div><div class="kpi-value">${n('qualified')}</div></div>
        <div class="kpi"><div class="kpi-label">Bônus usados</div><div class="kpi-value">${n('credited')}</div></div>
      </div>
      <div class="card flush"><div class="table-wrap">
        ${items.length === 0 ? empty('Nenhuma indicação ainda.') : `<table>
          <thead><tr><th>Data</th><th>Quem indicou</th><th>Empresa indicada</th><th>Código</th><th>Situação</th><th class="num">Bônus</th><th></th></tr></thead>
          <tbody>${items.map((r, i) => `<tr>
            <td class="nowrap">${dateTime(r.created_at)}</td>
            <td><a href="#/empresas/${esc(r.referrer_id)}">${esc(r.referrer)}</a></td>
            <td><a href="#/empresas/${esc(r.referred_id)}">${esc(r.referred)}</a>${r.qualified_at ? `<div class="small muted">1º saque pago ${date(r.qualified_at)}</div>` : ''}</td>
            <td class="mono">${esc(r.code || '')}</td>
            <td>${refTag(r.status)}</td>
            <td class="num">${Number(r.bonus) ? brl(r.bonus) : '—'}</td>
            <td class="num"><div class="row" style="justify-content:flex-end">
              ${r.credited_operation_id ? `<a class="btn ghost sm" href="#/operacoes/${esc(r.credited_operation_id)}">Operação</a>` : ''}
              ${approver && ['pending', 'qualified'].includes(r.status) ? `<button class="btn ghost sm" data-cancel="${i}">Cancelar</button>` : ''}
            </div></td>
          </tr>`).join('')}</tbody></table>`}
      </div></div>`;

    const sb = el.querySelector('#set-bonus');
    if (sb) sb.onclick = async () => {
      const r = await confirmAction({
        title: 'Bônus por indicação', confirmLabel: 'Salvar',
        text: 'Valor creditado a quem indicou, somado ao líquido do próximo saque depois que a empresa indicada fizer o primeiro saque pago.',
        extra: `<div class="field"><label>Valor (R$)</label><input class="input" inputmode="decimal" data-field="amount" value="${esc(String(d.bonus ?? 0).replace('.', ','))}"></div>`,
      });
      if (r == null) return;
      const v = Number(String(r.values.amount || '').replace(/\./g, '').replace(',', '.'));
      if (!Number.isFinite(v) || v < 0) return toast('Informe um valor válido.', true);
      run(sb, () => rpc('bo_set_referral_bonus', { p_amount: v }), 'Bônus atualizado').then(B.reload);
    };
    el.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = async () => {
      const r = items[b.dataset.cancel];
      const ok = await confirmAction({ title: 'Cancelar indicação', confirmLabel: 'Cancelar indicação', danger: true,
        text: `${esc(r.referrer)} indicou ${esc(r.referred)}. O bônus não será pago.` });
      if (ok == null) return;
      run(b, () => rpc('bo_cancel_referral', { p_id: r.id }), 'Indicação cancelada').then(B.reload);
    }));
  };

  /* ===================================================== Comprovante (PDF) */
  B.openReceipt = async (id, btn) => {
    // Abre a janela já no clique (evita bloqueio de pop-up) e preenche depois
    const w = window.open('', '_blank');
    if (!w) return toast('Permita pop-ups para abrir o comprovante.', true);
    w.document.write('<p style="font-family:Inter,sans-serif;padding:24px">Gerando comprovante…</p>');
    try {
      if (btn) btn.disabled = true;
      const data = await rpc('bo_operation_receipt', { p_id: id });
      w.document.open();
      w.document.write(B.buildReceiptHtml(data));
      w.document.close();
      w.document.title = `Comprovante ${String(id).slice(0, 8)}`;
      setTimeout(() => { try { w.focus(); w.print(); } catch { /* a janela foi fechada */ } }, 400);
    } catch (e) {
      w.close();
      toast(B.message(e), true);
    } finally {
      if (btn) btn.disabled = false;
    }
  };
})();
