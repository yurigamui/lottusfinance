/* Lottus Admin — faturamento: faturas, cobrança por e-mail e régua automática */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, dateTime, ago, toast, run, modal, closeModal, confirmAction } = B;
  const { head, tabs, onTabs, empty, can, fieldError } = B.ui;

  const PHASE = { open: ['A vencer', 'brand'], overdue: ['Em atraso', 'danger'], paid: ['Paga', 'success'], cancelled: ['Cancelada', ''] };
  const phaseTag = (i) => { const [l, t] = PHASE[i.phase] || [i.phase, '']; return `<span class="tag ${t}">${esc(l)}</span>`; };
  const KIND = { funder: 'Fundo (Partners)', sign: 'Lottus Sign', lead: 'Lead', other: 'Outro' };
  const METHODS = [['pix', 'Pix'], ['boleto', 'Boleto'], ['ted', 'TED'], ['cartao', 'Cartão'], ['outro', 'Outro']];
  const today = () => B.today();
  const monthStart = () => B.monthStart();
  const csvCell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;

  /** Confere a fatura no front (o banco confere de novo). Mostra o erro ao lado de cada campo e devolve o primeiro campo com erro. */
  function validateInvoice(box) {
    const f = (s) => box.querySelector(s);
    let first = null;
    const bad = (sel, msg) => { fieldError(f(sel), msg); if (!first) first = f(sel); };
    ['#f-name', '#f-amt', '#f-due', '#f-mail'].forEach((s) => fieldError(f(s), ''));
    if (!f('#f-name').value.trim()) bad('#f-name', 'Informe o cliente.');
    const amt = B.parseMoney(f('#f-amt').value);
    if (amt === null) bad('#f-amt', 'Informe o valor.');
    else if (Number.isNaN(amt)) bad('#f-amt', 'Valor inválido. Use só números, como 1.234,56.');
    else if (amt <= 0) bad('#f-amt', 'O valor precisa ser maior que zero.');
    else if (amt > 999999999.99) bad('#f-amt', 'O valor máximo é R$ 999.999.999,99.');
    else if (Math.abs(amt * 100 - Math.round(amt * 100)) > 1e-6) bad('#f-amt', 'Use no máximo duas casas decimais.');
    const due = f('#f-due').value;
    const real = /^\d{4}-\d{2}-\d{2}$/.test(due) && new Date(due + 'T12:00:00Z').toISOString().slice(0, 10) === due;
    if (!due) bad('#f-due', 'Informe o vencimento.');
    else if (!real) bad('#f-due', 'Vencimento inválido. Use uma data real.');
    else if (due < '2000-01-01') bad('#f-due', 'O vencimento não pode ser anterior a 2000.');
    else if (due > '2100-12-31') bad('#f-due', 'O vencimento não pode passar de 2100.');
    const mail = f('#f-mail').value.trim();
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) bad('#f-mail', 'E-mail inválido. Exemplo: nome@empresa.com.br');
    return first;
  }

  /* ---------------------------------------------------------------- faturas */
  B.views.faturas = async (el, [arg], me) => {
    const mayWrite = can(me, 'approver');
    const FILTERS = [['overdue', 'Em atraso'], ['open', 'A vencer'], ['paid', 'Pagas'], ['all', 'Todas'], ['cancelled', 'Canceladas']];
    let status = FILTERS.some(([k]) => k === arg) ? arg : 'overdue';
    const wantNew = arg === 'new';
    const all = await rpc('bo_inv_list', { p_status: 'all', p_search: null });
    const cnt = (k) => all.filter((i) => (k === 'all' ? true : i.phase === k)).length;
    if (!arg && !cnt('overdue')) status = cnt('open') ? 'open' : 'all';
    let kind = 'all', dFrom = '', dTo = '';
    // Em atraso: etapa de carência vinda de bo_overdue_list (D3: só informa; não bloqueia nem rebaixa ninguém)
    let od = null;
    if (status === 'overdue') { try { od = { d: await B.plan.overdue() }; } catch (e) { od = { e }; } }
    const ovMap = new Map(((od && od.d && od.d.items) || []).map((x) => [x.id, x]));
    const grace = od && od.d && od.d.grace_days != null ? Number(od.d.grace_days) : null;
    const daysOf = (i) => (ovMap.has(i.id) ? Number(ovMap.get(i.id).days_overdue) : Number(i.days_overdue || 0));
    const stageOf = (i) => (ovMap.has(i.id) ? ovMap.get(i.id).stage : grace != null ? (daysOf(i) <= grace ? 'grace' : 'beyond_grace') : null);
    const STAGE = { grace: ['Dentro da carência', 'warning'], beyond_grace: ['Além da carência', 'danger'] };
    const moreActs = [];
    if (mayWrite) moreActs.push({ id: 'gen', label: 'Gerar faturas do mês' });
    moreActs.push({ id: 'csv', label: 'Exportar CSV' });
    el.innerHTML = `
      ${B.ui.pageHead({ title: 'A receber', sub: 'Quem está devendo para a Lottus: mensalidades do Partners, planos do Sign e cobranças avulsas.', primary: mayWrite ? { id: 'new', label: 'Nova fatura' } : null, more: moreActs })}
      <div class="kpi4 kpi4-c" id="sum"></div>
      <div class="u-mb16">${tabs(FILTERS.map(([k, l]) => [k, `${l}${cnt(k) ? ` (${cnt(k)})` : ''}`]), status)}</div>
      <div id="od-info"></div>
      <div class="u-mb16" id="mf-box">${B.ui.more('Mais filtros', `<div class="grid-2">
          <div class="field"><label for="mf-kind">Tipo de cliente</label><select class="input" id="mf-kind"><option value="all">Todos</option>${Object.entries(KIND).map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</select></div>
          <div class="grid-2"><div class="field"><label for="mf-from">Vence a partir de</label><input class="input" type="date" id="mf-from"></div>
            <div class="field"><label for="mf-to">Vence até</label><input class="input" type="date" id="mf-to"></div></div></div>
          <button type="button" class="btn secondary u-m4t" id="mf-clear">Limpar filtros</button>`)}</div>
      <div id="list"></div>`;
    const sum = (f) => all.filter(f).reduce((t, i) => t + Number(i.amount), 0);
    el.querySelector('#sum').innerHTML = [
      ['Em atraso', brl(sum((i) => i.phase === 'overdue')), `${cnt('overdue')} fatura${cnt('overdue') === 1 ? '' : 's'}`, cnt('overdue') ? 'danger' : ''],
      ['A vencer', brl(sum((i) => i.phase === 'open')), `${cnt('open')} fatura${cnt('open') === 1 ? '' : 's'}`, 'main'],
      ['Recebido no mês', brl(sum((i) => i.phase === 'paid' && String(i.paid_at || '') >= monthStart())), 'faturas pagas neste mês', ''],
      ['Faturado no mês', brl(sum((i) => i.phase !== 'cancelled' && String(i.ref_month || i.created_at || '').slice(0, 7) === today().slice(0, 7))), 'competência do mês', ''],
    ].map(([l, v, s, c]) => `<div class="tile ${c}"><span class="kpi-label">${esc(l)}</span><span class="tile-value">${v}</span><span class="small muted">${esc(s)}</span></div>`).join('');

    const odBox = el.querySelector('#od-info');
    if (od && od.d) {
      const late = all.filter((i) => i.phase === 'overdue');
      const n1 = late.filter((i) => stageOf(i) === 'grace').length, n2 = late.filter((i) => stageOf(i) === 'beyond_grace').length;
      odBox.innerHTML = `<div class="card u-mb16 od-info"><p><b>${od.d.total}</b> fatura${Number(od.d.total) === 1 ? '' : 's'} em atraso, somando <b>${brl(od.d.total_amount)}</b>.</p>
        <p class="small muted">Carência de ${esc(grace)} dias: ${n1} dentro da carência e ${n2} além dela. Nada é bloqueado nem rebaixado sozinho: a equipe decide caso a caso (Cobrar, pausar a régua ou falar com o cliente).</p></div>`;
    } else if (od && od.e) {
      odBox.innerHTML = `<div class="${B.plan.isMissing(od.e) ? 'note-box' : 'error-box'} u-mb16" role="status">Etapa de carência: ${esc(B.plan.errorMessage(od.e))}</div>`;
    }
    const custHref = (i) => (i.funder_id ? `#/clientes/funder/${i.funder_id}` : i.sign_account_id ? `#/clientes/sign/${i.sign_account_id}` : null);
    // ação principal da linha: Cobrar (atrasada, com e-mail) ou Receber; o resto fica no modal da fatura
    const mainAct = (i) => {
      const lk = od && custHref(i) ? `<a class="btn ghost sm" href="${esc(B.safeUrl(custHref(i)))}" aria-label="Ver cliente de ${esc(i.number)}">Ver cliente</a>` : '';
      if (!mayWrite || i.status !== 'open') return lk;
      return (i.phase === 'overdue' && i.customer_email
        ? `<button type="button" class="btn secondary sm" data-send="${esc(i.id)}" aria-label="Cobrar ${esc(i.number)} por e-mail">Cobrar</button>`
        : `<button type="button" class="btn secondary sm" data-pay="${esc(i.id)}" aria-label="Registrar recebimento de ${esc(i.number)}">Receber</button>`) + lk;
    };
    const keepQ = () => { const inp = el.querySelector('#list .lt-search input'); return inp ? inp.value : ''; };
    const paint = () => {
      const list = all.filter((i) => (status === 'all' || i.phase === status) && (kind === 'all' || i.customer_kind === kind)
        && (!dFrom || String(i.due_date) >= dFrom) && (!dTo || String(i.due_date) <= dTo));
      const host = el.querySelector('#list');
      host.innerHTML = B.ui.table({
        rows: list, pageSize: 25, q: keepQ(), searchLabel: 'Buscar por cliente, CNPJ ou número da fatura', cardTitle: 'customer_name',
        emptyText: status === 'overdue' && kind === 'all' && !dFrom && !dTo ? 'Nenhuma fatura em atraso. Tudo em dia.' : 'Nenhuma fatura aqui.',
        onRow: (i) => openInvoice(i),
        columns: [
          { key: 'customer_name', label: 'Cliente', searchText: (i) => `${i.customer_name} ${i.customer_doc || ''} ${B.cnpj(i.customer_doc || '')} ${i.customer_email || ''}`, render: (i) => `<b>${esc(i.customer_name)}</b><div class="small muted">${esc(KIND[i.customer_kind] || '')}${i.customer_email ? ' · ' + esc(i.customer_email) : ' · sem e-mail'}</div>` },
          { key: 'number', label: 'Fatura', render: (i) => `${esc(i.number)}<div class="small muted">${esc(i.description)}</div>` },
          { key: 'due_date', label: 'Vencimento', searchText: () => '', render: (i) => `<span class="nowrap">${date(i.due_date)}</span><div>${phaseTag(i)}${i.days_overdue ? ` <span class="small muted">${i.days_overdue} d</span>` : ''}</div>` },
          { key: 'amount', label: 'Valor', num: true, searchText: () => '', render: (i) => `<b>${brl(i.amount)}</b>` },
          ...(grace != null && status === 'overdue' ? [{ key: 'stage', label: 'Carência', searchText: (i) => (STAGE[stageOf(i)] || [''])[0], render: (i) => { const g = STAGE[stageOf(i)]; return g ? `<span class="tag ${g[1]}">${esc(g[0])}</span><div class="small muted">${daysOf(i)} dia${daysOf(i) === 1 ? '' : 's'} de atraso</div>` : '—'; } }] : []),
          { key: 'reminders', label: 'Cobranças', card: false, searchText: () => '', render: (i) => `<span class="small muted">${i.reminders ? `${i.reminders} e-mail${i.reminders === 1 ? '' : 's'}<br>${esc(ago(i.last_reminder))}` : '—'}${i.reminders_paused ? '<br>pausada' : ''}</span>` },
          { key: 'id', label: 'Ações', searchText: () => '', render: mainAct },
        ],
      });
      B.ui.onTable(host);
      const qi = host.querySelector('.lt-search input');
      if (qi) { qi.id = 'q'; const lb = host.querySelector('.lt-search label'); if (lb) lb.htmlFor = 'q'; }
    };
    // um só tratador no contêiner da lista: continua valendo depois de buscar ou trocar de página
    el.querySelector('#list').onclick = (e) => {
      const pay = e.target.closest('[data-pay]'), snd = e.target.closest('[data-send]');
      if (pay) payDialog(all.find((x) => x.id === pay.dataset.pay));
      else if (snd) sendReminder(all.find((x) => x.id === snd.dataset.send), snd);
    };
    paint();
    onTabs(el.querySelector('.u-mb16'), (t) => (location.hash = `#/faturas/${t}`));
    const mfk = el.querySelector('#mf-kind'), mff = el.querySelector('#mf-from'), mft = el.querySelector('#mf-to');
    mfk.onchange = () => { kind = mfk.value; paint(); };
    mff.onchange = () => { dFrom = mff.value; paint(); };
    mft.onchange = () => { dTo = mft.value; paint(); };
    el.querySelector('#mf-clear').onclick = () => { kind = 'all'; dFrom = ''; dTo = ''; mfk.value = 'all'; mff.value = ''; mft.value = ''; paint(); };
    const exportCsv = () => {
      const rows = [['Número', 'Cliente', 'CNPJ/CPF', 'E-mail', 'Descrição', 'Competência', 'Vencimento', 'Valor', 'Situação', 'Pago em', 'Forma']].concat(
        all.map((i) => [i.number, i.customer_name, i.customer_doc, i.customer_email, i.description, i.ref_month, i.due_date, String(i.amount).replace('.', ','), (PHASE[i.phase] || [i.phase])[0], i.paid_at, i.paid_method]));
      const blob = new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `faturas-${today()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    const generate = async () => {
      const ok = await confirmAction({ title: 'Gerar faturas do mês', text: 'Cria as faturas deste mês a partir das mensalidades do Partners e dos planos do Sign. Quem já tem fatura do mês não é duplicado.', confirmLabel: 'Gerar' });
      if (ok == null) return;
      const r = await run(null, () => rpc('bo_inv_generate', { p_month: monthStart() }));
      toast(`${r.partners} do Partners e ${r.sign} do Sign, vencimento ${date(r.due_date)}`);
      B.reload();
    };
    B.ui.onPage(el, { new: () => editInvoice(null), gen: generate, csv: exportCsv });
    // "Nova fatura" da ficha do cliente: ao salvar ou cancelar, volta à ficha (guardada em B._invReturn)
    let ret = null;
    if (mayWrite && wantNew) { const pre = B._pendingInvoice; B._pendingInvoice = null; ret = /^#\/clientes\/(funder|sign)\//.test(B._invReturn || '') ? B._invReturn : null; B._invReturn = null; editInvoice(null, pre); }
    else B._invReturn = null;

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
    // "Ver cliente": só quando a fatura nasceu de um fundo ou de uma conta Sign
    const custLink = (i) => (i.funder_id ? `<a class="btn secondary" href="#/clientes/funder/${esc(i.funder_id)}">Ver cliente</a>` : i.sign_account_id ? `<a class="btn secondary" href="#/clientes/sign/${esc(i.sign_account_id)}">Ver cliente</a>` : '');
    function openInvoice(i) {
      const box = modal({ title: i.number, subtitle: `${esc(i.customer_name)} · ${phaseTag(i)}`, wide: false,
        body: `<dl class="kv"><dt>Descrição</dt><dd>${esc(i.description)}</dd><dt>Valor</dt><dd><b>${brl(i.amount)}</b></dd><dt>Vencimento</dt><dd>${date(i.due_date)}${i.days_overdue ? ` (${i.days_overdue} dias de atraso)` : ''}</dd>
          <dt>E-mail</dt><dd>${esc(i.customer_email || '—')}</dd><dt>CNPJ/CPF</dt><dd>${esc(i.customer_doc || '—')}</dd>
          ${i.paid_at ? `<dt>Pago em</dt><dd>${date(i.paid_at)} · ${esc(i.paid_method || '')}</dd>` : ''}
          <dt>Cobranças enviadas</dt><dd>${i.reminders || 0}${i.last_reminder ? ` (última ${dateTime(i.last_reminder)})` : ''}${i.reminders_paused ? ' · régua pausada' : ''}</dd>
          ${i.notes ? `<dt>Observações</dt><dd>${esc(i.notes)}</dd>` : ''}</dl>`,
        foot: `${custLink(i)}${!mayWrite ? '' : i.status === 'open'
          ? `<button class="btn secondary" data-a="receive">Registrar recebimento</button>${i.customer_email ? '<button class="btn secondary" data-a="remind">Cobrar por e-mail</button>' : ''}<button class="btn secondary" data-a="edit">Editar</button><button class="btn secondary" data-a="${i.reminders_paused ? 'resume' : 'pause'}">${i.reminders_paused ? 'Retomar régua' : 'Pausar régua'}</button><button class="btn danger" data-a="cancel">Cancelar fatura</button>`
          : '<button class="btn secondary" data-a="reopen">Reabrir</button>'}` });
      box.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => {
        const a = b.dataset.a;
        if (a === 'edit') { closeModal(); return editInvoice(i); }
        if (a === 'receive') return payDialog(i);
        if (a === 'remind') return sendReminder(i, b);
        if (a === 'cancel' && (await confirmAction({ title: 'Cancelar fatura', text: 'A fatura deixa de ser cobrada.', confirmLabel: 'Cancelar fatura', danger: true })) == null) return openInvoice(i);
        if (a === 'reopen' && (await confirmAction({ title: 'Reabrir fatura', text: `A fatura <b>${esc(i.number)}</b> volta para em aberto e pode voltar a ser cobrada por e-mail pela régua. Confirma?`, confirmLabel: 'Reabrir' })) == null) return openInvoice(i);
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
            <div class="field"><label>Vencimento</label><input class="input" id="f-due" type="date" min="2000-01-01" value="${esc(v.due_date)}"></div></div>
          <div class="field"><label>Observações</label><textarea class="input" id="f-notes">${esc(v.notes || '')}</textarea></div>
          <div class="error-box" id="f-err" hidden></div></div>`,
        // Esc, ✕ e fundo também voltam à ficha (onClose do modal); só se a pessoa ainda está em A receber (trocar de tela já leva a outro lugar)
        onClose: () => { if (!i && ret && /^#\/faturas(\/|$)/.test(location.hash)) location.hash = ret; },
        foot: '<button class="btn secondary" data-close>Cancelar</button><button class="btn" data-ok>Salvar</button>' });
      box.querySelector('[data-close]').onclick = () => { closeModal(); if (!i && ret) location.hash = ret; };
      box.querySelectorAll('input, textarea').forEach((x) => x.addEventListener('input', () => fieldError(x, '')));
      box.querySelector('[data-ok]').onclick = async (e) => {
        const g = (s) => box.querySelector(s).value;
        const bad = validateInvoice(box);
        if (bad) { bad.focus(); return; }
        try {
          await run(e.target, () => rpc('bo_inv_save', { p: { id: i && i.id, customer_kind: v.customer_kind, funder_id: v.funder_id, sign_account_id: v.sign_account_id, customer_name: g('#f-name'), customer_doc: g('#f-doc'),
            customer_email: g('#f-mail'), description: g('#f-desc'), amount: B.parseMoney(g('#f-amt')), due_date: g('#f-due'), notes: g('#f-notes') } }), 'Fatura salva');
          closeModal(); if (!i && ret) location.hash = ret; else B.reload();
        } catch { /* aviso já mostrado */ }
      };
    }
  };

  B.newInvoice = (pre) => { B._pendingInvoice = pre || null; if (location.hash === '#/faturas/new') B.reload(); else location.hash = '#/faturas/new'; };

  /* ------------------------------------------------------- régua de cobrança */
  B.views.cobranca = async (el, _a, me) => {
    const admin = can(me, 'admin');
    const [s, mails] = await Promise.all([rpc('bo_inv_settings', { p: null }), admin ? rpc('bo_emails', { p_limit: 200 }).catch(() => null) : null]);
    // a geração automática (dia 2) vem da migração de planos e preços: se bo_plan_catalog ainda não existe, o banco não foi atualizado
    const autoOn = await B.plan.catalog().then(() => true, () => false);
    const sent = ((mails && mails.items) || []).filter((m) => /^invoice_/.test(m.kind)).slice(0, 12);
    const STEPS = [['3 dias antes', 'Lembrete amigável de vencimento'], ['No dia', 'Aviso de que vence hoje'], ['3 dias depois', 'Aviso de atraso'], ['7 dias depois', 'Segundo aviso de atraso'], ['15 dias depois', 'Último aviso automático']];
    el.innerHTML = `
      ${head('Régua de cobrança', 'Os e-mails de cobrança saem sozinhos, todos os dias às 9h20 (Brasília), para faturas em aberto com e-mail do cliente.')}
      <div class="card dash-row"><h2>Geração automática das faturas</h2>
        <p>${autoOn
          ? `Todo dia 2, às 10h (Brasília), o sistema gera as faturas do mês anterior (taxa de plataforma dos fundos e mensalidade do Sign), com vencimento no dia <b>${esc(s.due_day)}</b> do mês seguinte à competência. Quem já tem fatura da competência não é duplicado.`
          : `Prevista para todo dia 2, com vencimento no dia <b>${esc(s.due_day)}</b>. ${esc(B.plan.MISSING_TEXT)} Até lá, use "Gerar faturas do mês" em A receber.`}</p>
        <p class="small muted">Régua de e-mails: ${s.remind_enabled ? '<b>ligada</b>' : '<b>desligada</b>'}. ${autoOn ? 'As faturas geradas automaticamente ainda não entram nos e-mails da régua (pendência em análise): para cobrá-las, use Cobrar em A receber.' : ''} Nenhuma conta é bloqueada nem rebaixada sozinha por atraso.</p></div>
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
    const ddIn = el.querySelector('#dd');
    if (ddIn) ddIn.addEventListener('input', () => fieldError(ddIn, ''));
    if (save) save.onclick = () => {
      const raw = ddIn.value.trim(), day = Number(raw);
      if (!/^\d{1,2}$/.test(raw) || day < 1 || day > 28) { fieldError(ddIn, 'Use um dia de 1 a 28 (o dia 29 a 31 não existe em todos os meses).'); ddIn.focus(); return; }
      fieldError(ddIn, '');
      run(save, () => rpc('bo_inv_settings', { p: { remind_enabled: el.querySelector('#on').checked, due_day: day, pay_instructions: el.querySelector('#pi').value } }), 'Ajustes salvos').catch(() => {});
    };
  };
})();
