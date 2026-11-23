/* Lottus Admin — faturamento: faturas, cobrança por e-mail e régua automática */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, dateTime, ago, toast, run, modal, closeModal, confirmAction } = B;
  const { head, tabs, onTabs, empty, can } = B.ui;

  const PHASE = { open: ['A vencer', 'brand'], overdue: ['Em atraso', 'danger'], paid: ['Paga', 'success'], cancelled: ['Cancelada', ''] };
  const phaseTag = (i) => { const [l, t] = PHASE[i.phase] || [i.phase, '']; return `<span class="tag ${t}">${esc(l)}</span>`; };
  const KIND = { funder: 'Fundo (Partners)', sign: 'Lottus Sign', lead: 'Lead', other: 'Outro' };
  const METHODS = [['pix', 'Pix'], ['boleto', 'Boleto'], ['ted', 'TED'], ['cartao', 'Cartão'], ['outro', 'Outro']];
  const today = () => new Date().toISOString().slice(0, 10);
  const monthStart = () => today().slice(0, 7) + '-01';
  const num = (v) => { const n = Number(String(v || '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const csvCell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;

  /* ---------------------------------------------------------------- faturas */
  B.views.faturas = async (el, [arg], me) => {
    const mayWrite = can(me, 'approver');
    const FILTERS = [['overdue', 'Em atraso'], ['open', 'A vencer'], ['paid', 'Pagas'], ['all', 'Todas'], ['cancelled', 'Canceladas']];
    let status = FILTERS.some(([k]) => k === arg) ? arg : 'overdue';
    const wantNew = arg === 'new';
    const all = await rpc('bo_inv_list', { p_status: 'all', p_search: null });
    const cnt = (k) => all.filter((i) => (k === 'all' ? true : i.phase === k)).length;
    if (!arg && !cnt('overdue')) status = cnt('open') ? 'open' : 'all';
    let q = '';
    el.innerHTML = `
      ${head('A receber', 'Quem está devendo para a Lottus: mensalidades do Partners, planos do Sign e cobranças avulsas.',
        `<div class="row" style="gap:8px;flex-wrap:wrap">${mayWrite ? '<button class="btn secondary" id="gen">Gerar faturas do mês</button><button class="btn" id="new">Nova fatura</button>' : ''}<button class="btn ghost" id="csv">Exportar CSV</button></div>`)}
      <div class="kpi4" id="sum"></div>
      <div class="row u-mb16" style="gap:12px;flex-wrap:wrap;justify-content:space-between">
        ${tabs(FILTERS.map(([k, l]) => [k, `${l}${cnt(k) ? ` (${cnt(k)})` : ''}`]), status)}
        <input class="input search" id="q" type="search" placeholder="Buscar cliente, CNPJ ou número" aria-label="Buscar fatura">
      </div>
      <div class="card flush"><div class="table-wrap" id="list"></div></div>`;
    const sum = (f) => all.filter(f).reduce((t, i) => t + Number(i.amount), 0);
    el.querySelector('#sum').innerHTML = [
      ['Em atraso', brl(sum((i) => i.phase === 'overdue')), `${cnt('overdue')} fatura${cnt('overdue') === 1 ? '' : 's'}`, cnt('overdue') ? 'danger' : ''],
      ['A vencer', brl(sum((i) => i.phase === 'open')), `${cnt('open')} fatura${cnt('open') === 1 ? '' : 's'}`, 'main'],
      ['Recebido no mês', brl(sum((i) => i.phase === 'paid' && String(i.paid_at || '') >= monthStart())), 'faturas pagas neste mês', ''],
      ['Faturado no mês', brl(sum((i) => i.phase !== 'cancelled' && String(i.ref_month || i.created_at || '').slice(0, 7) === today().slice(0, 7))), 'competência do mês', ''],
    ].map(([l, v, s, c]) => `<div class="tile ${c}"><span class="kpi-label">${esc(l)}</span><span class="tile-value">${v}</span><span class="small muted">${esc(s)}</span></div>`).join('');

    const paint = () => {
      const t = q.toLowerCase();
      const list = all.filter((i) => (status === 'all' || i.phase === status) && (!t || `${i.customer_name} ${i.number} ${i.customer_doc || ''}`.toLowerCase().includes(t)));
      el.querySelector('#list').innerHTML = !list.length ? empty(status === 'overdue' ? 'Nenhuma fatura em atraso. Tudo em dia.' : 'Nenhuma fatura aqui.') : `<table>
        <thead><tr><th>Cliente</th><th>Fatura</th><th>Vencimento</th><th class="num">Valor</th><th>Cobranças</th><th></th></tr></thead>
        <tbody>${list.map((i) => `<tr class="link" data-id="${esc(i.id)}">
          <td><b>${esc(i.customer_name)}</b><div class="small muted">${esc(KIND[i.customer_kind] || '')}${i.customer_email ? ' · ' + esc(i.customer_email) : ' · sem e-mail'}</div></td>
          <td>${esc(i.number)}<div class="small muted">${esc(i.description)}</div></td>
          <td class="nowrap">${date(i.due_date)}<div>${phaseTag(i)}${i.days_overdue ? ` <span class="small muted">${i.days_overdue} d</span>` : ''}</div></td>
          <td class="num"><b>${brl(i.amount)}</b></td>
          <td class="small muted">${i.reminders ? `${i.reminders} e-mail${i.reminders === 1 ? '' : 's'}<br>${ago(i.last_reminder)}` : '—'}${i.reminders_paused ? '<br>pausada' : ''}</td>
          <td class="num nowrap">${mayWrite && i.status === 'open' ? `<button class="btn secondary sm" data-pay="${esc(i.id)}">Receber</button> ${i.customer_email ? `<button class="btn sm" data-send="${esc(i.id)}">Cobrar</button>` : ''}` : ''}</td></tr>`).join('')}</tbody></table>`;
      el.querySelectorAll('#list tr[data-id]').forEach((r) => (r.onclick = (e) => { if (!e.target.closest('button')) openInvoice(all.find((x) => x.id === r.dataset.id)); }));
      el.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => payDialog(all.find((x) => x.id === b.dataset.pay))));
      el.querySelectorAll('[data-send]').forEach((b) => (b.onclick = () => sendReminder(all.find((x) => x.id === b.dataset.send), b)));
    };
    paint();
    onTabs(el, (t) => (location.hash = `#/faturas/${t}`));
    el.querySelector('#q').oninput = (e) => { q = e.target.value.trim(); paint(); };
    el.querySelector('#csv').onclick = () => {
      const rows = [['Número', 'Cliente', 'CNPJ/CPF', 'E-mail', 'Descrição', 'Competência', 'Vencimento', 'Valor', 'Situação', 'Pago em', 'Forma']].concat(
        all.map((i) => [i.number, i.customer_name, i.customer_doc, i.customer_email, i.description, i.ref_month, i.due_date, String(i.amount).replace('.', ','), (PHASE[i.phase] || [i.phase])[0], i.paid_at, i.paid_method]));
      const blob = new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `faturas-${today()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    if (mayWrite) {
      el.querySelector('#new').onclick = () => editInvoice(null);
      if (wantNew) { const pre = B._pendingInvoice; B._pendingInvoice = null; editInvoice(null, pre); }
      el.querySelector('#gen').onclick = async () => {
        const ok = await confirmAction({ title: 'Gerar faturas do mês', text: 'Cria as faturas deste mês a partir das mensalidades do Partners e dos planos do Sign. Quem já tem fatura do mês não é duplicado.', confirmLabel: 'Gerar' });
        if (ok == null) return;
        const r = await run(null, () => rpc('bo_inv_generate', { p_month: monthStart() }));
        toast(`${r.partners} do Partners e ${r.sign} do Sign, vencimento ${date(r.due_date)}`);
        B.reload();
      };
    }

    function payDialog(i) {
      const box = modal({ title: 'Registrar recebimento', subtitle: `${esc(i.customer_name)} · ${esc(i.number)} · ${brl(i.amount)}`,
        body: `<div class="stack"><div class="field"><label>Recebido em</label><input class="input" type="date" id="pd" value="${today()}"></div>
          <div class="field"><label>Forma</label><select class="input" id="pm">${METHODS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div></div>`,
        foot: '<button class="btn secondary" data-close>Cancelar</button><button class="btn" data-ok>Confirmar</button>' });
      box.querySelector('[data-close]').onclick = closeModal;
      box.querySelector('[data-ok]').onclick = (e) => run(e.target, () => rpc('bo_inv_pay', { p_id: i.id, p_paid_at: box.querySelector('#pd').value || null, p_method: box.querySelector('#pm').value }), 'Recebimento registrado').then(() => { closeModal(); B.reload(); }).catch(() => {});
    }
    async function sendReminder(i, btn) {
      const ok = await confirmAction({ title: 'Enviar cobrança', text: `Enviar e-mail de cobrança para <b>${esc(i.customer_email)}</b>?`, confirmLabel: 'Enviar' });
      if (ok == null) return;
      run(btn, () => rpc('bo_inv_send', { p_id: i.id }), 'E-mail enviado').then(B.reload).catch(() => {});
    }
    function openInvoice(i) {
      const box = modal({ title: i.number, subtitle: `${esc(i.customer_name)} · ${phaseTag(i)}`, wide: false,
        body: `<dl class="kv"><dt>Descrição</dt><dd>${esc(i.description)}</dd><dt>Valor</dt><dd><b>${brl(i.amount)}</b></dd><dt>Vencimento</dt><dd>${date(i.due_date)}${i.days_overdue ? ` (${i.days_overdue} dias de atraso)` : ''}</dd>
          <dt>E-mail</dt><dd>${esc(i.customer_email || '—')}</dd><dt>CNPJ/CPF</dt><dd>${esc(i.customer_doc || '—')}</dd>
          ${i.paid_at ? `<dt>Pago em</dt><dd>${date(i.paid_at)} · ${esc(i.paid_method || '')}</dd>` : ''}
          <dt>Cobranças enviadas</dt><dd>${i.reminders || 0}${i.last_reminder ? ` (última ${dateTime(i.last_reminder)})` : ''}${i.reminders_paused ? ' · régua pausada' : ''}</dd>
          ${i.notes ? `<dt>Observações</dt><dd>${esc(i.notes)}</dd>` : ''}</dl>`,
        foot: mayWrite ? `${i.status === 'open' ? '<button class="btn secondary" data-a="edit">Editar</button><button class="btn secondary" data-a="' + (i.reminders_paused ? 'resume' : 'pause') + '">' + (i.reminders_paused ? 'Retomar régua' : 'Pausar régua') + '</button><button class="btn danger" data-a="cancel">Cancelar fatura</button>' : '<button class="btn secondary" data-a="reopen">Reabrir</button>'}` : '' });
      box.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => {
        const a = b.dataset.a;
        if (a === 'edit') { closeModal(); return editInvoice(i); }
        if (a === 'cancel' && (await confirmAction({ title: 'Cancelar fatura', text: 'A fatura deixa de ser cobrada.', confirmLabel: 'Cancelar fatura', danger: true })) == null) return;
        run(b, () => rpc('bo_inv_status', { p_id: i.id, p_action: a }), 'Feito').then(() => { closeModal(); B.reload(); }).catch(() => {});
      }));
    }
    function editInvoice(i, pre) {
      const v = i || Object.assign({ due_date: today(), amount: '', customer_kind: 'other' }, pre || {});
      const box = modal({ title: i ? `Editar ${i.number}` : 'Nova fatura',
        body: `<div class="stack">
          <div class="field"><label>Cliente</label><input class="input" id="f-name" value="${esc(v.customer_name || '')}" placeholder="Razão social ou nome"></div>
          <div class="grid-2"><div class="field"><label>CNPJ/CPF</label><input class="input" id="f-doc" value="${esc(v.customer_doc || '')}" inputmode="numeric"></div>
            <div class="field"><label>E-mail para cobrança</label><input class="input" id="f-mail" type="email" value="${esc(v.customer_email || '')}"></div></div>
          <div class="field"><label>Descrição</label><input class="input" id="f-desc" value="${esc(v.description || '')}" placeholder="Ex.: Consultoria, implantação, mensalidade"></div>
          <div class="grid-2"><div class="field"><label>Valor (R$)</label><input class="input" id="f-amt" inputmode="decimal" value="${v.amount === '' ? '' : String(v.amount).replace('.', ',')}"></div>
            <div class="field"><label>Vencimento</label><input class="input" id="f-due" type="date" value="${esc(v.due_date)}"></div></div>
          <div class="field"><label>Observações</label><textarea class="input" id="f-notes">${esc(v.notes || '')}</textarea></div>
          <div class="error-box" id="f-err" hidden></div></div>`,
        foot: '<button class="btn secondary" data-close>Cancelar</button><button class="btn" data-ok>Salvar</button>' });
      box.querySelector('[data-close]').onclick = closeModal;
      box.querySelector('[data-ok]').onclick = async (e) => {
        const g = (s) => box.querySelector(s).value;
        const err = box.querySelector('#f-err');
        if (!g('#f-name').trim() || !num(g('#f-amt')) || !g('#f-due')) { err.hidden = false; err.textContent = 'Preencha cliente, valor e vencimento.'; return; }
        try {
          await run(e.target, () => rpc('bo_inv_save', { p: { id: i && i.id, customer_kind: v.customer_kind, funder_id: v.funder_id, sign_account_id: v.sign_account_id, customer_name: g('#f-name'), customer_doc: g('#f-doc'),
            customer_email: g('#f-mail'), description: g('#f-desc'), amount: num(g('#f-amt')), due_date: g('#f-due'), notes: g('#f-notes') } }), 'Fatura salva');
          closeModal(); B.reload();
        } catch { /* aviso já mostrado */ }
      };
    }
  };

  B.newInvoice = (pre) => { B._pendingInvoice = pre || null; if (location.hash === '#/faturas/new') B.reload(); else location.hash = '#/faturas/new'; };

  /* ------------------------------------------------------- régua de cobrança */
  B.views.cobranca = async (el, _a, me) => {
    const admin = can(me, 'admin');
    const [s, mails] = await Promise.all([rpc('bo_inv_settings', { p: null }), admin ? rpc('bo_emails', { p_limit: 200 }).catch(() => null) : null]);
    const sent = ((mails && mails.items) || []).filter((m) => /^invoice_/.test(m.kind)).slice(0, 12);
    const STEPS = [['3 dias antes', 'Lembrete amigável de vencimento'], ['No dia', 'Aviso de que vence hoje'], ['3 dias depois', 'Aviso de atraso'], ['7 dias depois', 'Segundo aviso de atraso'], ['15 dias depois', 'Último aviso automático']];
    el.innerHTML = `
      ${head('Régua de cobrança', 'Os e-mails de cobrança saem sozinhos, todos os dias às 9h20 (Brasília), para faturas em aberto com e-mail do cliente.')}
      <div class="grid-2 dash-row">
        <div class="card"><h2>Quando enviar</h2>
          <div class="queue">${STEPS.map(([w, t], i) => `<div class="queue-row"><span class="queue-count">${i + 1}</span><span class="queue-label"><b>${esc(w)}</b><br><span class="small muted">${esc(t)}</span></span></div>`).join('')}</div>
          <p class="small muted" style="margin-top:12px">Cada etapa é enviada uma vez por fatura. Para parar a régua de um cliente, abra a fatura e use "Pausar régua".</p></div>
        <div class="card"><h2>Ajustes</h2>
          <div class="stack">
            <label class="row" style="gap:10px;justify-content:flex-start"><input type="checkbox" id="on" ${s.remind_enabled ? 'checked' : ''} ${admin ? '' : 'disabled'}> <span>Enviar cobranças automáticas</span></label>
            <div class="field"><label>Dia de vencimento das faturas geradas</label><input class="input" id="dd" type="number" min="1" max="28" value="${esc(s.due_day)}" ${admin ? '' : 'disabled'}><div class="help">Vencem neste dia do mês seguinte à competência.</div></div>
            <div class="field"><label>Como pagar (aparece no e-mail)</label><textarea class="input" id="pi" rows="4" placeholder="${esc(s.pix_key ? 'Em branco: usa a chave Pix CNPJ ' + s.pix_key : 'Ex.: Pix, chave CNPJ 00.000.000/0001-00 · Banco X')}" ${admin ? '' : 'disabled'}>${esc(s.pay_instructions || '')}</textarea></div>
            ${admin ? '<div><button class="btn" id="save">Salvar</button></div>' : '<p class="small muted">Só administradores alteram.</p>'}
          </div></div>
      </div>
      <div class="card"><h2>E-mails de cobrança recentes</h2>
        ${sent.length ? `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Para</th><th>Assunto</th><th>Situação</th></tr></thead><tbody>${sent.map((m) => `<tr><td class="nowrap">${dateTime(m.created_at)}</td><td>${esc(m.recipient)}</td><td>${esc(m.subject)}</td><td>${esc(m.status || 'enviado')}${m.error ? `<div class="small muted">${esc(m.error)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('Nenhum e-mail de cobrança enviado ainda.')}
      </div>`;
    const save = el.querySelector('#save');
    if (save) save.onclick = () => run(save, () => rpc('bo_inv_settings', { p: { remind_enabled: el.querySelector('#on').checked, due_day: Number(el.querySelector('#dd').value) || 10, pay_instructions: el.querySelector('#pi').value } }), 'Ajustes salvos').catch(() => {});
  };
})();
