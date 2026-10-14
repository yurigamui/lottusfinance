/* Lottus · Backoffice — telas de cadastro, crédito, sacados e controle */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, pct, date, dateTime, ago, cnpj, cpf, tag, check, run, toast, confirmAction, modal, closeModal } = B;
  const views = (B.views = {});
  const can = (me, level) => ({ analyst: 1, approver: 2, admin: 3 })[me.level] >= ({ analyst: 1, approver: 2, admin: 3 })[level];

  function head(title, sub, right) {
    return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<div class="page-sub">${esc(sub)}</div>` : ''}</div>${right || ''}</div>`;
  }
  function tabs(options, value) {
    return `<div class="tabs" role="tablist">${options
      .map(([v, l]) => `<button role="tab" data-tab="${esc(v)}" class="${v === value ? 'active' : ''}" aria-selected="${v === value}">${esc(l)}</button>`)
      .join('')}</div>`;
  }
  function onTabs(el, fn) {
    el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => fn(b.dataset.tab)));
  }
  const empty = (text) => `<div class="empty">${esc(text)}</div>`;
  /* "Todas": junta as filas de cada situação, da mais recente para a mais antiga */
  async function mergeAll(fetchOne, statuses) {
    const parts = await Promise.all(statuses.map(fetchOne));
    return parts.flat().sort((a, b) => (String(a.created_at || '') < String(b.created_at || '') ? 1 : -1));
  }
  /* Ao entrar numa seção sem nada em aberto, mostra direto a aba "Todas" */
  function skipEmpty(arg, list, base, allKey) {
    if (arg !== undefined || list.length) return false;
    history.replaceState(null, '', `#/${base}/${allKey}`);
    return true;
  }
  B.ui = { head, tabs, onTabs, empty, can, mergeAll, skipEmpty };

  /* =============================================================== Painel */
  views.painel = async (el, _p, me) => {
    const [d, recent] = await Promise.all([
      rpc('bo_dashboard'),
      rpc('bo_operations', { p_status: ['requested', 'in_review', 'approved', 'paid'] }).catch(() => []),
    ]);
    const queues = [
      ['identidade', d.identity, 'Identidade para analisar', 'Identidades para analisar'],
      ['documentos', d.documents, 'Documento para analisar', 'Documentos para analisar'],
      ['credito', d.credit, 'Limite para decidir', 'Limites para decidir'],
      ['operacoes/analisar', d.operations_review, 'Operação para analisar', 'Operações para analisar'],
      ['operacoes/pagar', d.operations_to_pay, 'Operação aprovada a pagar', 'Operações aprovadas a pagar'],
      ['quitacoes', d.settlements, 'Quitação aguardando Pix', 'Quitações aguardando Pix'],
      ['operacoes/pagas', d.overdue, 'Duplicata vencida', 'Duplicatas vencidas'],
    ];
    const open = queues.filter((q) => q[1] > 0);
    const kpi = (label, value, href, alert) =>
      `<a class="kpi ${alert && Number(value) > 0 ? 'alert' : ''}" href="#/${href}"><span class="kpi-label">${esc(label)}</span><span class="kpi-value">${brl(value)}</span></a>`;
    const latest = recent.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 6);
    el.innerHTML = `
      ${head(`Visão geral, ${me.name.split(' ')[0]}`, new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))}
      <div class="kpis">
        ${kpi('Carteira em aberto', d.portfolio, 'operacoes/pagas')}
        ${kpi('Vencido e não pago', d.overdue_amount, 'operacoes/pagas', true)}
        ${kpi('Desembolsado em 30 dias', d.volume_30d, 'operacoes/liquidadas')}
        ${kpi('Limites aprovados', d.approved_limits, 'credito/aprovados')}
      </div>
      <div class="split">
        <section class="split-main">
          <h2 class="section-title">Para fazer</h2>
          <div class="card flush">${open.length ? `<div class="queue">${open.map(([href, n, one, many]) => `
            <a class="queue-row" href="#/${href}"><span class="queue-count">${esc(n)}</span>
              <span class="queue-label">${esc(n === 1 ? one : many)}</span><span class="queue-go" aria-hidden="true">›</span></a>`).join('')}</div>`
            : empty('Nenhuma fila pendente.')}</div>
        </section>
        <section class="split-side">
          <h2 class="section-title">Operações recentes</h2>
          <div class="card recent">${latest.length ? latest.map((o) => `
            <a class="recent-row" href="#/operacoes/${esc(o.id)}">
              <div class="grow"><div class="recent-name">${esc(o.legal_name)}</div>
                <div class="small muted">${brl(o.net_amount)}, ${dateTime(o.created_at)}</div></div>
              ${tag('op', o.status)}</a>`).join('') : empty('Nenhuma operação em andamento.')}</div>
        </section>
      </div>`;
  };

  /* =========================================================== Identidade */
  const ID_TABS = [['in_review', 'Em análise'], ['approved', 'Aprovadas'], ['rejected', 'Recusadas'], ['all', 'Todas']];
  views.identidade = async (el, [arg]) => {
    const status = ID_TABS.some(([k]) => k === arg) ? arg : 'in_review';
    const one = (st) => rpc('bo_identity_queue', { p_status: st });
    const list = status === 'all' ? await mergeAll(one, ['in_review', 'approved', 'rejected']) : await one(status);
    if (skipEmpty(arg, list, 'identidade', 'all')) return views.identidade(el, ['all']);
    el.innerHTML = `
      ${head('Identidade', null, tabs(ID_TABS, status))}
      <div class="card flush"><div class="table-wrap">
        ${list.length === 0 ? empty('Nada nesta fila.') : `<table>
          <thead><tr><th>Pessoa</th><th>Empresas</th><th>Documento</th><th>Enviado</th><th></th></tr></thead>
          <tbody>${list.map((v, i) => `
            <tr>
              <td><div style="font-weight:600">${esc(v.name || '—')}</div>
                <div class="small muted">CPF ${esc(cpf(v.cpf))} · ${esc(v.email || '')}</div>
                ${v.previous ? `<div class="small muted">${v.previous} envio(s) anterior(es)</div>` : ''}</td>
              <td>${v.companies.map((c) => `<div><a href="#/empresas/${esc(c.id)}">${esc(c.legal_name)}</a>
                <span class="small muted">· ${esc(B.ACCESS[c.access] || c.access)} · ${esc(B.ROLE[c.role] || c.role)}</span>
                ${c.partner_verified ? '<span class="small check ok">✓ no QSA</span>' : ''}</div>`).join('') || '—'}</td>
              <td>${esc((v.document_type || '').toUpperCase())}<div class="small muted">${tag('identity', v.status)}</div>
                ${v.review_notes ? `<div class="small muted">${esc(v.review_notes)}</div>` : ''}</td>
              <td class="nowrap">${dateTime(v.created_at)}<div class="small muted">${ago(v.created_at)}</div></td>
              <td class="num"><button class="btn ${v.status === 'in_review' ? '' : 'secondary '}sm" data-open="${i}">${v.status === 'in_review' ? 'Analisar' : 'Ver'}</button></td>
            </tr>`).join('')}</tbody></table>`}
      </div></div>`;
    onTabs(el, (t) => (location.hash = `#/identidade/${t}`));
    el.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => openIdentity(list[b.dataset.open], list[b.dataset.open].status)));
  };

  async function openIdentity(v, status) {
    const box = modal({
      title: v.name || 'Identidade',
      subtitle: `CPF ${esc(cpf(v.cpf))} · ${esc((v.document_type || '').toUpperCase())} · enviado ${esc(dateTime(v.created_at))}`,
      wide: true,
      body: `<div class="stack">
        <div class="media-grid" id="media"><div class="spinner"></div></div>
        <div class="panel">
          ${v.companies.map((c) => `<div class="row between"><div><b>${esc(c.legal_name)}</b> <span class="muted">${esc(cnpj(c.cnpj))}</span></div>
            <span class="small muted">${esc(B.ACCESS[c.access] || '')}, ${esc((B.ROLE[c.role] || '').toLowerCase())}${c.partner_verified ? ', no QSA' : ', por convite'}</span></div>`).join('') || '<div class="muted">Sem empresa</div>'}
        </div>
      </div>`,
      foot: status === 'in_review'
        ? `<button class="btn danger" data-act="reject">Recusar</button><button class="btn" data-act="approve">Aprovar identidade</button>`
        : '',
    });
    const media = box.querySelector('#media');
    const files = [['Frente', v.front], ['Verso', v.back], ['Selfie', v.selfie]];
    const urls = await Promise.all(files.map(([, p]) => B.signedUrl('kyc', p).catch(() => null)));
    media.innerHTML = files
      .map(([label], i) => `<div class="media">${urls[i] ? `<img src="${esc(urls[i])}" alt="${esc(label)}" data-full="${esc(urls[i])}">` : '<div class="empty">Não carregou</div>'}
        <div class="cap"><span>${esc(label)}</span>${urls[i] ? `<a href="${esc(urls[i])}" target="_blank" rel="noopener" class="small">abrir</a>` : ''}</div></div>`)
      .join('');
    media.querySelectorAll('img').forEach((img) => (img.onclick = () => window.open(img.dataset.full, '_blank', 'noopener')));

    const approve = box.querySelector('[data-act=approve]');
    const reject = box.querySelector('[data-act=reject]');
    if (approve) approve.onclick = () => run(approve, () => rpc('bo_review_identity', { p_id: v.id, p_approve: true }), 'Identidade aprovada').then(() => { closeModal(); B.reload(); });
    if (reject) reject.onclick = async () => {
      closeModal();
      const note = await confirmAction({
        title: 'Recusar identidade', confirmLabel: 'Recusar', danger: true, note: true, noteRequired: true,
        notePlaceholder: 'Ex.: a foto do documento está ilegível. Envie de novo com boa luz.',
      });
      if (note == null) return;
      run(null, () => rpc('bo_review_identity', { p_id: v.id, p_approve: false, p_note: note }), 'Identidade recusada').then(B.reload);
    };
  }

  /* =========================================================== Documentos */
  const DOC_TABS = [['in_review', 'Em análise'], ['approved', 'Aprovados'], ['rejected', 'Recusados'], ['all', 'Todos']];
  views.documentos = async (el, [arg]) => {
    const status = DOC_TABS.some(([k]) => k === arg) ? arg : 'in_review';
    const one = (st) => rpc('bo_documents_queue', { p_status: st });
    const list = status === 'all' ? await mergeAll(one, ['in_review', 'approved', 'rejected']) : await one(status);
    if (skipEmpty(arg, list, 'documentos', 'all')) return views.documentos(el, ['all']);
    el.innerHTML = `
      ${head('Documentos', null, tabs(DOC_TABS, status))}
      <div class="card flush"><div class="table-wrap">
        ${list.length === 0 ? empty('Nada nesta fila.') : `<table>
          <thead><tr><th>Empresa</th><th>Documento</th><th>Enviado por</th><th>Quando</th><th></th></tr></thead>
          <tbody>${list.map((d, i) => `
            <tr>
              <td><a href="#/empresas/${esc(d.company_id)}" style="font-weight:600">${esc(d.legal_name)}</a>
                <div class="small muted">${esc(cnpj(d.cnpj))} · ${esc(d.company_status || '')}</div></td>
              <td>${esc(B.DOC_KIND[d.kind] || d.kind)}<div class="small muted">${esc(d.file_name || '')}</div>
                ${d.review_notes ? `<div class="small muted">${esc(d.review_notes)}</div>` : ''}</td>
              <td>${esc(d.uploaded_by || '—')}</td>
              <td class="nowrap">${dateTime(d.created_at)}<div class="small muted">${ago(d.created_at)}</div></td>
              <td class="num"><div class="row" style="justify-content:flex-end">
                <button class="btn secondary sm" data-file="${i}">Abrir</button>
                ${d.status === 'in_review' ? `<button class="btn danger sm" data-reject="${i}">Recusar</button>
                <button class="btn sm" data-approve="${i}">Aprovar</button>` : tag('doc', d.status)}
              </div></td>
            </tr>`).join('')}</tbody></table>`}
      </div></div>
`;
    onTabs(el, (t) => (location.hash = `#/documentos/${t}`));
    el.querySelectorAll('[data-file]').forEach((b) => (b.onclick = () => B.openFile('company-docs', list[b.dataset.file].path)));
    el.querySelectorAll('[data-approve]').forEach((b) => (b.onclick = () =>
      run(b, () => rpc('bo_review_document', { p_id: list[b.dataset.approve].id, p_approve: true }), 'Documento aprovado').then(B.reload)));
    el.querySelectorAll('[data-reject]').forEach((b) => (b.onclick = async () => {
      const note = await confirmAction({ title: 'Recusar documento', confirmLabel: 'Recusar', danger: true, note: true, noteRequired: true,
        notePlaceholder: 'Ex.: o contrato enviado não é a última alteração.' });
      if (note == null) return;
      run(null, () => rpc('bo_review_document', { p_id: list[b.dataset.reject].id, p_approve: false, p_note: note }), 'Documento recusado').then(B.reload);
    }));
  };

  /* ============================================================ Empresas */
  views.empresas = async (el, [id]) => {
    if (id) return companyDetail(el, id);
    el.innerHTML = `${head('Empresas', null, `<input class="input search" id="q" type="search" placeholder="Buscar por nome ou CNPJ" aria-label="Buscar empresa">`)}
      <div class="card flush"><div class="table-wrap" id="list"><div class="spinner"></div></div></div>`;
    const q = el.querySelector('#q');
    const load = async () => {
      const list = await rpc('bo_companies', { p_search: q.value || null });
      if (!el.querySelector('#list')) return; // a tela mudou enquanto carregava
      el.querySelector('#list').innerHTML = list.length === 0 ? empty('Nenhuma empresa encontrada.') : `<table>
        <thead><tr><th>Empresa</th><th>Receita</th><th>Limite</th><th class="num">Pessoas</th><th class="num">Operações</th><th>Desde</th></tr></thead>
        <tbody>${list.map((c) => `<tr class="link" data-id="${esc(c.id)}">
          <td><div style="font-weight:600">${esc(c.trade_name || c.legal_name)}</div><div class="small muted">${esc(c.legal_name)} · ${esc(cnpj(c.cnpj))}</div></td>
          <td>${esc(c.status)}<div class="small muted">${esc([c.city, c.uf].filter(Boolean).join('/'))}</div></td>
          <td>${c.credit_status ? tag('credit', c.credit_status) : '—'}${c.credit_status === 'approved' ? `<div class="small muted">${brl(c.limit_amount)}</div>` : ''}</td>
          <td class="num">${esc(c.members)}</td><td class="num">${esc(c.operations)}</td>
          <td class="nowrap">${date(c.created_at)}</td></tr>`).join('')}</tbody></table>`;
      el.querySelectorAll('[data-id]').forEach((r) => (r.onclick = () => (location.hash = `#/empresas/${r.dataset.id}`)));
    };
    let t; q.oninput = () => { clearTimeout(t); t = setTimeout(load, 300); };
    await load();
  };

  async function companyDetail(el, id) {
    const d = await rpc('bo_company', { p_id: id });
    const c = d.company, cr = d.credit || {}, inv = d.invoices || {};
    const partners = Array.isArray(c.partners) ? c.partners : [];
    el.innerHTML = `
      ${head(c.trade_name || c.legal_name, cnpj(c.cnpj), `<a class="btn secondary" href="#/empresas">Voltar</a>`)}
      <div class="stack">
        <div class="grid-2">
          <div class="card"><div class="card-head"><h2>Receita Federal</h2>${tag('', c.status)}</div>
            <dl class="kv">
              <dt>Razão social</dt><dd>${esc(c.legal_name)}</dd>
              <dt>CNPJ</dt><dd>${esc(cnpj(c.cnpj))}</dd>
              <dt>Abertura</dt><dd>${date(c.opened_at)}${c.opened_at ? ` · ${B.yearsSince(c.opened_at)} anos` : ''}</dd>
              <dt>Atividade</dt><dd>${esc(c.activity || '—')}</dd>
              <dt>Cidade</dt><dd>${esc([c.city, c.uf].filter(Boolean).join('/') || '—')}</dd>
              <dt>QSA</dt><dd>${partners.map((p) => `${esc(p.name)} <span class="muted small">${esc(p.role || '')} ${esc(p.cpfMasked || '')}</span>`).join('<br>') || '—'}</dd>
            </dl></div>
          <div class="card"><div class="card-head"><h2>Crédito</h2>${cr.status ? tag('credit', cr.status) : ''}</div>
            <dl class="kv">
              <dt>Faturamento declarado</dt><dd>${esc(B.REVENUE[d.profile && d.profile.monthly_revenue] || '—')}</dd>
              <dt>Prazo médio de recebimento</dt><dd>${d.profile ? esc(d.profile.avg_receivable_days) + ' dias' : '—'}</dd>
              <dt>Limite</dt><dd>${cr.status === 'approved' ? brl(cr.limit_amount) : '—'}</dd>
              <dt>Taxa</dt><dd>${cr.status === 'approved' ? pct(cr.monthly_rate) + ' a.m.' : '—'}</dd>
              <dt>Rating</dt><dd>${esc(cr.rating || '—')}</dd>
              <dt>Notas no app</dt><dd>${esc(inv.count || 0)} · ${esc(inv.eligible || 0)} disponíveis (${brl(inv.eligible_amount)}) · ${esc(inv.debtors || 0)} clientes</dd>
            </dl>
            <div style="margin-top:12px"><a class="btn secondary sm" href="#/credito/${cr.status === 'approved' ? 'aprovados' : cr.status === 'rejected' ? 'recusados' : 'analise'}">Ver em Crédito</a></div></div>
        </div>

        <div class="card flush"><div class="card-pad-head"><h2>Pessoas</h2></div><div class="table-wrap"><table>
          <thead><tr><th>Nome</th><th>Contato</th><th>Acesso</th><th>Identidade</th></tr></thead>
          <tbody>${d.members.map((m) => `<tr>
            <td><b>${esc(m.name || '—')}</b><div class="small muted">CPF ${esc(cpf(m.cpf))}</div></td>
            <td>${esc(m.email || '')}<div class="small muted">${esc(m.phone || '')}</div></td>
            <td>${esc(B.ACCESS[m.access] || m.access)} · ${esc(B.ROLE[m.role] || m.role)}
              <div class="small">${m.partner_verified ? check(true, 'no QSA') : '<span class="muted">por convite</span>'}</div></td>
            <td>${m.identity ? tag('identity', m.identity) : '<span class="muted">não enviou</span>'}</td></tr>`).join('')}</tbody></table></div></div>

        <div class="grid-2">
          <div class="card flush"><div class="card-pad-head"><h2>Documentos</h2></div>
            ${d.documents.length === 0 ? empty('Nenhum documento.') : `<table><tbody>${d.documents.map((x, i) => `<tr>
              <td>${esc(B.DOC_KIND[x.kind] || x.kind)}<div class="small muted">${dateTime(x.created_at)}${x.review_notes ? ' · ' + esc(x.review_notes) : ''}</div></td>
              <td>${tag('doc', x.status)}</td>
              <td class="num"><button class="btn secondary sm" data-doc="${i}">Abrir</button></td></tr>`).join('')}</tbody></table>`}</div>
          <div class="card flush"><div class="card-pad-head"><h2>Contas bancárias</h2></div>
            ${d.banks.length === 0 ? empty('Nenhuma conta.') : `<table><tbody>${d.banks.map((b) => `<tr>
              <td>${esc(b.bank_code)} · ${esc(b.bank_name)}${b.is_default ? ' <span class="tag">Principal</span>' : ''}
                <div class="small muted">Ag. ${esc(b.branch)} · ${esc(b.account_number)}-${esc(b.account_digit)}</div></td>
              </tr>`).join('')}</tbody></table>`}</div>
        </div>

        <div class="card flush"><div class="card-pad-head"><h2>Operações</h2></div>
          ${d.operations.length === 0 ? empty('Nenhuma operação.') : `<table>
            <thead><tr><th>Data</th><th>Situação</th><th class="num">Duplicatas</th><th class="num">Líquido</th></tr></thead>
            <tbody>${d.operations.map((o) => `<tr class="link" data-op="${esc(o.id)}"><td>${dateTime(o.created_at)}</td><td>${tag('op', o.status)}</td>
              <td class="num">${brl(o.gross_amount)}</td><td class="num">${brl(o.net_amount)}</td></tr>`).join('')}</tbody></table>`}</div>

        <div class="grid-2">
          <div class="card"><h2>Ações da equipe Lottus</h2>${actionsList(d.actions)}</div>
          <div class="card"><h2>Atividade no app</h2>
            ${d.activity.length === 0 ? '<p class="muted">Nada ainda.</p>' : `<div class="stack-sm" style="margin-top:12px">${d.activity.map((a) =>
              `<div><b>${esc(a.who)}</b> · ${esc(a.action)}<div class="small muted">${dateTime(a.created_at)}</div></div>`).join('')}</div>`}</div>
        </div>
      </div>`;
    el.querySelectorAll('[data-doc]').forEach((b) => (b.onclick = () => B.openFile('company-docs', d.documents[b.dataset.doc].path)));
    el.querySelectorAll('[data-op]').forEach((r) => (r.onclick = () => (location.hash = `#/operacoes/${r.dataset.op}`)));
  }

  const ACTION_LABEL = {
    identity_approved: 'aprovou a identidade', identity_rejected: 'recusou a identidade',
    document_approved: 'aprovou um documento', document_rejected: 'recusou um documento',
    bank_validated: 'validou a conta bancária', bank_rejected: 'recusou a conta bancária',
    credit_approved: 'aprovou o limite', credit_rejected: 'recusou o limite',
    operation_review: 'iniciou a análise da operação', operation_approve: 'aprovou a operação',
    operation_pay: 'registrou o pagamento da operação', operation_settle: 'liquidou a operação',
    operation_reject: 'recusou a operação', operation_cancel: 'cancelou a operação',
    charge_registered: 'registrou o boleto de uma duplicata', installment_paid: 'deu baixa em uma duplicata',
    settlement_confirmed: 'confirmou a quitação antecipada', debtor_updated: 'ajustou um sacado', staff_saved: 'alterou a equipe Lottus',
    referral_bonus_set: 'alterou o bônus por indicação', referral_cancelled: 'cancelou uma indicação',
  };
  B.ACTION_LABEL = ACTION_LABEL;
  function actionsList(list) {
    if (!list || list.length === 0) return '<p class="muted">Nada ainda.</p>';
    return `<div class="stack-sm" style="margin-top:12px">${list.map((a) => {
      const det = a.details || {};
      const extra = det.note || det.reference || (det.limit ? `${brl(det.limit)} a ${pct(det.rate)}` : '') || (det.amount != null ? brl(det.amount) : '');
      return `<div><b>${esc(a.staff)}</b> ${esc(ACTION_LABEL[a.action] || a.action)}${extra ? ` <span class="muted">· ${esc(extra)}</span>` : ''}
        <div class="small muted">${dateTime(a.created_at)}</div></div>`;
    }).join('')}</div>`;
  }
  B.actionsList = actionsList;

  const rateInput = (r) => (r == null || r === '' ? '' : (Number(r) * 100).toFixed(2).replace('.', ','));

  /* ============================================================== Crédito */
  const CREDIT = { analise: 'in_review', aprovados: 'approved', recusados: 'rejected' };
  views.credito = async (el, [arg], me) => {
    const tab = CREDIT[arg] || arg === 'todos' ? arg : 'analise';
    const one = (st) => rpc('bo_credit_queue', { p_status: st });
    const list = tab === 'todos' ? await mergeAll(one, Object.values(CREDIT)) : await one(CREDIT[tab]);
    if (skipEmpty(arg, list, 'credito', 'todos')) return views.credito(el, ['todos'], me);
    const approver = can(me, 'approver');
    el.innerHTML = `
      ${head('Crédito', null, tabs([['analise', 'Em análise'], ['aprovados', 'Aprovados'], ['recusados', 'Recusados'], ['todos', 'Todos']], tab))}
      <div class="stack">${list.length === 0 ? `<div class="card">${empty('Nada nesta fila.')}</div>` : list.map((x, i) => `
        <div class="card">
          <div class="card-head">
            <div><h2><a href="#/empresas/${esc(x.company_id)}">${esc(x.legal_name)}</a></h2>
              <div class="muted small">${esc(cnpj(x.cnpj))} · ${esc(x.company_status || '')} · aberta em ${date(x.opened_at)}${x.opened_at ? ` (${B.yearsSince(x.opened_at)} anos)` : ''} · ${esc([x.city, x.uf].filter(Boolean).join('/'))}</div></div>
            ${tag('credit', x.status)}
          </div>
          <div class="grid-2">
            <div class="stack-sm">
              <div class="row">${check(x.identity_ok, 'Identidade do administrador aprovada', 'Identidade do administrador pendente')}</div>
              <div class="row">${check(x.contract_ok, 'Contrato social aprovado', 'Contrato social pendente')}</div>
              <dl class="kv" style="margin-top:8px">
                <dt>Faturamento declarado</dt><dd>${esc(B.REVENUE[x.revenue] || '—')}</dd>
                <dt>Prazo médio</dt><dd>${x.avg_days ? esc(x.avg_days) + ' dias' : '—'}</dd>
                <dt>Atividade</dt><dd>${esc(x.activity || '—')}</dd>
                <dt>Notas disponíveis</dt><dd>${brl(x.eligible_amount)}</dd>
                <dt>Sugestão do motor</dt><dd>${brl(x.suggested_limit)} · ${pct(x.suggested_rate)} a.m. · rating ${esc(x.suggested_rating || '—')}</dd>
                ${x.status !== 'in_review' ? `<dt>Decidido</dt><dd>${dateTime(x.decided_at)} · ${brl(x.limit_amount)} a ${pct(x.monthly_rate)}${x.notes ? ' · ' + esc(x.notes) : ''}</dd>` : ''}
              </dl>
            </div>
            ${approver ? `<form class="stack-sm" data-form="${i}">
              <div class="form-row">
                <div class="field"><label>Limite (R$)</label><input class="input" name="limit" inputmode="decimal" value="${esc(x.status === 'approved' ? x.limit_amount : x.suggested_limit || '')}"></div>
                <div class="field"><label>Taxa (% a.m.)</label><input class="input" name="rate" inputmode="decimal" value="${esc(rateInput(x.status === 'approved' ? x.monthly_rate : x.suggested_rate))}"></div>
              </div>
              <div class="form-row">
                <div class="field"><label>Rating</label><select class="input" name="rating">${['A', 'B', 'C', 'D', 'E'].map((r) =>
                  `<option ${r === (x.rating || x.suggested_rating) ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
                <div class="field"><label>Prazo máximo (dias)</label><input class="input" name="days" inputmode="numeric" value="${esc(x.max_days || 120)}"></div>
                <div class="field"><label>Tarifa por operação (R$)</label><input class="input" name="fee" inputmode="decimal" value="${esc(x.fee_amount || 0)}"></div>
              </div>
              <div class="field"><label>Observação (aparece para o cliente)</label><input class="input" name="note" value="${esc(x.notes || '')}"></div>
              <div class="row" style="justify-content:flex-end">
                <button type="button" class="btn danger" data-reject="${i}">Recusar</button>
                <button type="submit" class="btn">${x.status === 'approved' ? 'Atualizar limite' : 'Aprovar limite'}</button>
              </div>
            </form>` : ''}
          </div>
        </div>`).join('')}</div>`;
    onTabs(el, (t) => (location.hash = `#/credito/${t}`));
    const num = (v) => Number(String(v).replace(/\./g, '').replace(',', '.'));
    el.querySelectorAll('[data-form]').forEach((f) => (f.onsubmit = (e) => {
      e.preventDefault();
      const x = list[f.dataset.form];
      const limit = num(f.limit.value), rate = num(f.rate.value) / 100;
      if (!(limit > 0) || !(rate > 0 && rate < 0.2)) return toast('Confira o limite e a taxa.', true);
      if (!x.identity_ok || !x.contract_ok) {
        if (!window.confirm('A identidade ou o contrato social ainda não foram aprovados. Aprovar o limite mesmo assim?')) return;
      }
      run(f.querySelector('[type=submit]'), () => rpc('bo_decide_credit', {
        p_company: x.company_id, p_approve: true, p_limit: limit, p_rate: rate, p_rating: f.rating.value,
        p_max_days: parseInt(f.days.value, 10) || 120, p_fee: num(f.fee.value) || 0, p_note: f.note.value || null,
      }), 'Limite aprovado').then(B.reload);
    }));
    el.querySelectorAll('[data-reject]').forEach((b) => (b.onclick = async () => {
      const note = await confirmAction({ title: 'Recusar limite', confirmLabel: 'Recusar', danger: true, note: true, noteRequired: true,
        notePlaceholder: 'Ex.: neste momento não conseguimos aprovar um limite. Podemos reavaliar em 90 dias.' });
      if (note == null) return;
      run(null, () => rpc('bo_decide_credit', { p_company: list[b.dataset.reject].company_id, p_approve: false, p_note: note }), 'Limite recusado').then(B.reload);
    }));
  };

  /* ============================================================== Sacados */
  views.sacados = async (el, _p, me) => {
    el.innerHTML = `${head('Sacados', null, `<input class="input search" id="q" type="search" placeholder="Buscar por nome ou CNPJ" aria-label="Buscar sacado">`)}
      <div class="card flush"><div class="table-wrap" id="list"><div class="spinner"></div></div></div>
`;
    const q = el.querySelector('#q');
    const approver = can(me, 'approver');
    const load = async () => {
      const list = await rpc('bo_debtors', { p_search: q.value || null });
      if (!el.querySelector('#list')) return; // a tela mudou enquanto carregava
      el.querySelector('#list').innerHTML = list.length === 0 ? empty('Nenhum sacado encontrado.') : `<table>
        <thead><tr><th>Sacado</th><th>Receita</th><th>Rating</th><th class="num">Limite global</th><th class="num">Em aberto</th><th class="num">Cedentes</th><th></th></tr></thead>
        <tbody>${list.map((d, i) => `<tr>
          <td><b>${esc(d.legal_name || '—')}</b><div class="small muted">${esc(cnpj(d.cnpj))} · ${d.contacts ? 'com e-mail de cobrança' : 'sem e-mail'}</div></td>
          <td>${esc(d.status || '—')}<div class="small muted">${esc(d.size || '')}${d.opened_at ? ' · desde ' + date(d.opened_at) : ''}</div></td>
          <td>${esc(d.rating)}${d.manual ? ' <span class="tag">manual</span>' : ''}${d.blocked ? ' <span class="tag danger">bloqueado</span>' : ''}</td>
          <td class="num">${brl(d.limit_amount)}</td>
          <td class="num">${brl(d.exposure)}${Number(d.limit_amount) > 0 ? `<div class="small muted">${Math.round((d.exposure / d.limit_amount) * 100)}% do limite</div>` : ''}</td>
          <td class="num">${esc(d.assignors)}</td>
          <td class="num">${approver ? `<button class="btn secondary sm" data-edit="${i}">Ajustar</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
      el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => editDebtor(list[b.dataset.edit], load)));
    };
    let t; q.oninput = () => { clearTimeout(t); t = setTimeout(load, 300); };
    await load();
  };

  function editDebtor(d, reload) {
    const box = modal({
      title: d.legal_name || cnpj(d.cnpj), subtitle: esc(cnpj(d.cnpj)),
      body: `<form class="stack" id="f">
        <div class="form-row">
          <div class="field"><label>Rating</label><select class="input" name="rating">${['A', 'B', 'C', 'D', 'E'].map((r) => `<option ${r === d.rating ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
          <div class="field"><label>Limite global (R$)</label><input class="input" name="limit" inputmode="decimal" value="${esc(d.limit_amount)}"></div>
        </div>
        <label class="row"><input type="checkbox" name="blocked" ${d.blocked ? 'checked' : ''}> Bloquear novas antecipações contra este sacado</label>
      </form>`,
      foot: `<button class="btn secondary" data-close-btn>Cancelar</button><button class="btn" data-save>Salvar</button>`,
    });
    box.querySelector('[data-close-btn]').onclick = closeModal;
    box.querySelector('[data-save]').onclick = (e) => {
      const f = box.querySelector('#f');
      const limit = Number(String(f.limit.value).replace(/\./g, '').replace(',', '.'));
      run(e.target, () => rpc('bo_update_debtor', { p_cnpj: d.cnpj, p_rating: f.rating.value, p_limit: limit, p_blocked: f.blocked.checked }), 'Sacado ajustado')
        .then(() => { closeModal(); reload(); });
    };
  }

  /* ============================================================ Auditoria */
  views.auditoria = async (el) => {
    const [list, ev] = await Promise.all([rpc('bo_audit', { p_limit: 300 }), rpc('bo_evidence_check')]);
    el.innerHTML = `
      ${head('Auditoria')}
      <div class="stack">
        <div class="card"><div class="card-head"><h2>Assinaturas eletrônicas</h2>
          ${ev.problems.length === 0 ? '<span class="tag success">Cadeia íntegra</span>' : `<span class="tag danger">${ev.problems.length} registro(s) com problema</span>`}</div>
          <p class="muted" style="margin:0">${esc(ev.records)} evidências registradas</p>
          ${ev.problems.length ? `<pre class="json">${esc(JSON.stringify(ev.problems, null, 2))}</pre>` : ''}</div>
        <div class="card flush"><div class="card-pad-head"><h2>Ações da equipe</h2></div><div class="table-wrap">
          ${list.length === 0 ? empty('Nada ainda.') : `<table>
            <thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Empresa</th><th>Detalhe</th></tr></thead>
            <tbody>${list.map((a) => `<tr>
              <td class="nowrap">${dateTime(a.created_at)}</td><td>${esc(a.staff)}</td>
              <td>${esc(ACTION_LABEL[a.action] || a.action)}</td>
              <td>${a.company_id ? `<a href="#/empresas/${esc(a.company_id)}">${esc(a.company || '')}</a>` : '—'}</td>
              <td class="small">${a.target_type === 'operation' ? `<a href="#/operacoes/${esc(a.target_id)}">ver operação</a> ` : ''}<span class="muted">${esc(a.details.note || a.details.reference || '')}</span></td>
            </tr>`).join('')}</tbody></table>`}
        </div></div>
      </div>`;
  };

  /* ======================================================== Equipe Lottus */
  views.equipe = async (el, _p, me) => {
    if (!can(me, 'admin')) { el.innerHTML = `<div class="card">${empty('Só administradores gerenciam a equipe.')}</div>`; return; }
    const list = await rpc('bo_staff');
    el.innerHTML = `
      ${head('Equipe Lottus', null, '<button class="btn" id="add">Convidar pessoa</button>')}
      <div class="card flush"><div class="table-wrap"><table>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Nível</th><th>Último acesso</th><th></th></tr></thead>
        <tbody>${list.map((s, i) => `<tr>
          <td><b>${esc(s.name)}</b>${s.active ? '' : ' <span class="tag danger">inativa</span>'}</td><td>${esc(s.email)}</td>
          <td>${esc(B.LEVEL[s.level])}</td><td>${dateTime(s.last_sign_in_at)}</td>
          <td class="num"><button class="btn secondary sm" data-edit="${i}">Editar</button></td></tr>`).join('')}</tbody></table></div></div>
`;
    const edit = (s) => {
      const box = modal({
        title: s ? 'Editar pessoa' : 'Convidar pessoa', subtitle: s ? '' : 'A pessoa recebe um e-mail para criar a senha e ativar o autenticador.',
        body: `<form class="stack" id="f">
          <div class="field"><label>E-mail do login</label><input class="input" name="email" type="email" value="${esc(s ? s.email : '')}" ${s ? 'readonly' : ''}></div>
          <div class="field"><label>Nome</label><input class="input" name="name" value="${esc(s ? s.name : '')}"></div>
          <div class="field"><label>Nível</label><select class="input" name="level">${Object.entries(B.LEVEL).map(([k, v]) =>
            `<option value="${k}" ${s && s.level === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          ${s ? `<label class="row"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> Ativa</label>` : ''}
        </form>`,
        foot: `<button class="btn secondary" data-c>Cancelar</button><button class="btn" data-s>${s ? 'Salvar' : 'Enviar convite'}</button>`,
      });
      box.querySelector('[data-c]').onclick = closeModal;
      box.querySelector('[data-s]').onclick = async (e) => {
        const f = box.querySelector('#f');
        if (s) {
          run(e.target, () => rpc('bo_upsert_staff', { p_email: f.email.value, p_name: f.name.value, p_level: f.level.value, p_active: f.active.checked }), 'Equipe atualizada')
            .then(() => { closeModal(); B.reload(); }, () => null);
          return;
        }
        if (!f.name.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim())) return toast('Preencha nome e e-mail.', true);
        const out = await run(e.target, async () => {
          const { data, error } = await B.sb.functions.invoke('backoffice-access', { body: { action: 'invite_staff', email: f.email.value, name: f.name.value, level: f.level.value, redirect_to: location.origin + location.pathname } });
          if (error) { let c = 'unavailable'; try { c = (await error.context.json()).error || c; } catch { /* sem corpo */ } throw new Error(c); }
          return data;
        }, null).catch(() => null);
        if (!out) return;
        closeModal();
        if (out.sent) { toast(`Convite enviado para ${f.email.value.trim()}`); B.reload(); return; }
        B.showAccessLink(out.link, f.email.value.trim(), out.error);
      };
    };
    el.querySelector('#add').onclick = () => edit(null);
    el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => edit(list[b.dataset.edit])));
  };
})();
