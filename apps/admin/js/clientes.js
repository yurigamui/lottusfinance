/* Lottus Admin — Clientes: lista única (Partners + Sign), ficha do cliente e assinaturas */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, dateTime, ago, toast, run, modal, closeModal, confirmAction } = B;
  const { head, tabs, onTabs, empty, can } = B.ui;

  const nf = (v) => Number(v || 0).toLocaleString('pt-BR');
  const STATUS = { active: ['Ativo', 'success'], trial: ['Teste / gratuito', 'brand'], overdue: ['Inadimplente', 'danger'], exempt: ['Isento', ''], cancelled: ['Cancelado', ''] };
  const HEALTH = { green: ['Boa', 'h-green'], yellow: ['Atenção', 'h-yellow'], red: ['Ruim', 'h-red'], none: ['—', ''] };
  const EVENT = { new: 'Entrou', upgrade: 'Upgrade', downgrade: 'Downgrade', cancel: 'Cancelou', reactivate: 'Voltou', change: 'Mudança', note: 'Nota' };
  const statusTag = (s) => { const [l, c] = STATUS[s] || [s, '']; return `<span class="tag ${c}">${esc(l)}</span>`; };
  const health = (h) => { const [l, c] = HEALTH[h] || ['—', '']; return `<span class="health ${c}" title="Saúde: ${esc(l)}"><i></i>${esc(l)}</span>`; };
  const usage = (c) => (c.kind === 'funder' ? `PL ${B.brlCompact(c.usage)}` : `${nf(c.usage)}${c.included ? ' de ' + nf(c.included) : ''} docs no mês`);
  const csvCell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  B.customerHealth = health;

  /** "Ver mais" dentro de uma linha/cartão: o que não decide a ação fica recolhido. */
  const rowMore = (pairs) => `<details class="row-more"><summary>Ver mais</summary><dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl></details>`;
  /** Lista que mostra N itens e libera mais N a cada clique em "Ver mais". item(x) devolve o HTML já escapado de cada item. */
  function showMore(host, items, item, { size = 10, wrap = ['<ol class="timeline">', '</ol>'], label = 'Ver mais', all = false } = {}) {
    let n = size;
    const paint = (focusAt) => {
      host.innerHTML = `${wrap[0]}${items.slice(0, n).map(item).join('')}${wrap[1]}${n < items.length ? `<div class="u-m4t"><button type="button" class="btn secondary" data-more>${esc(label)} (${items.length - n} restantes)</button></div>` : ''}`;
      const b = host.querySelector('[data-more]');
      if (b) b.onclick = () => { const prev = n; n = all ? items.length : n + size; paint(prev); };
      if (focusAt != null && host.firstElementChild) { const li = host.firstElementChild.children[focusAt]; if (li) { li.setAttribute('tabindex', '-1'); li.focus(); } }
    };
    paint();
  }

  B.showMore = showMore;

  B.views.clientes = async (el, args, me) => {
    if (args[0] === 'funder' || args[0] === 'sign') return detail(el, args[0], args[1], me);
    const { rows, mrr } = await rpc('bo_customers');
    const PRODUCTS = [['all', 'Todos'], ['partners', 'Partners'], ['sign', 'Sign']];
    const SITUATIONS = [['any', 'Qualquer situação'], ['active', 'Pagantes'], ['trial', 'Teste / gratuito'], ['overdue', 'Inadimplentes'], ['red', 'Saúde ruim'], ['cancelled', 'Cancelados']];
    // o endereço #/clientes/<filtro> continua valendo (o Início aponta para #/clientes/red)
    let prod = PRODUCTS.some(([k]) => k === args[0]) ? args[0] : 'all';
    let sit = SITUATIONS.some(([k]) => k === args[0]) ? args[0] : 'any';
    const isProd = (c, p) => (p === 'partners' ? c.kind === 'funder' : p === 'sign' ? c.kind === 'sign' : true);
    const isSit = (c, t) => ({ any: c.status !== 'cancelled', active: Number(c.mrr) > 0, trial: c.status === 'trial', overdue: c.status === 'overdue', red: c.health === 'red', cancelled: c.status === 'cancelled' })[t];
    const count = (p, t) => rows.filter((c) => isProd(c, p) && isSit(c, t)).length;
    const nRed = rows.filter((c) => c.health === 'red').length;
    el.innerHTML = `
      ${B.ui.pageHead({ title: 'Clientes', sub: 'Quem paga a Lottus, quanto e como está cada um.', more: [{ id: 'csv', label: 'Exportar CSV' }] })}
      <div class="kpi4 kpi4-c">
        <div class="tile main"><span class="kpi-label">MRR</span><span class="tile-value">${brl(mrr.mrr)}</span><span class="small muted">${nf(mrr.customers)} pagantes</span></div>
        <div class="tile"><span class="kpi-label">Partners</span><span class="tile-value">${brl(mrr.partners)}</span><span class="small muted">${count('partners', 'any')} veículos</span></div>
        <div class="tile"><span class="kpi-label">Sign</span><span class="tile-value">${brl(mrr.sign)}</span><span class="small muted">${count('sign', 'any')} contas</span></div>
        <div class="tile ${nRed ? 'danger' : ''}"><span class="kpi-label">Saúde ruim</span><span class="tile-value">${nRed}</span><span class="small muted">atraso ou sem acesso há 45 dias</span></div>
      </div>
      <div class="filter-line u-mb16">
        <div id="ptabs">${tabs(PRODUCTS.map(([k, l]) => [k, `${l}${k !== 'all' ? ` (${count(k, 'any')})` : ''}`]), prod)}</div>
        <div class="field filter-sel"><label for="sit">Situação</label><select class="input" id="sit">${SITUATIONS.map(([k, l]) => `<option value="${k}" ${k === sit ? 'selected' : ''}>${esc(l)}${k !== 'any' && count('all', k) ? ` (${count('all', k)})` : ''}</option>`).join('')}</select></div>
      </div>
      <div id="list"></div>`;
    const keepQ = () => { const i = el.querySelector('#list .lt-search input'); return i ? i.value : ''; };
    const paint = () => {
      const list = rows.filter((c) => isProd(c, prod) && isSit(c, sit));
      const host = el.querySelector('#list');
      host.innerHTML = B.ui.table({
        rows: list, pageSize: 25, q: keepQ(), searchLabel: 'Buscar por nome, CNPJ ou e-mail', cardTitle: 'name', emptyText: 'Nenhum cliente aqui.',
        rowHref: (c) => `#/clientes/${c.kind}/${c.id}`,
        columns: [
          { key: 'name', label: 'Cliente', searchText: (c) => `${c.name} ${c.legal_name || ''} ${c.email || ''} ${c.doc || ''} ${B.cnpj(c.doc || '')}`, render: (c) => `<b>${esc(c.name)}</b><div class="small muted">${esc(B.cnpj(c.doc || ''))}${c.owner_name ? ' · ' + esc(c.owner_name) : ''}</div>` },
          { key: 'plan', label: 'Plano', searchText: (c) => `${c.product} ${c.plan}`, render: (c) => `${esc(c.product)}<div class="small muted">${esc(c.plan)}${c.plan_requested && c.plan_requested !== c.plan ? ' · pediu ' + esc(c.plan_requested) : ''}</div>` },
          { key: 'mrr', label: 'Mensal', num: true, searchText: () => '', render: (c) => `<b>${brl(c.mrr)}</b>` },
          { key: 'status', label: 'Situação', searchText: (c) => (STATUS[c.status] || [c.status])[0], render: (c) => `${statusTag(c.status)}${rowMore([['Uso', esc(usage(c))], ['Último acesso', esc(c.last_access ? ago(c.last_access) : 'nunca')], ['Saúde', health(c.health)]])}` },
        ],
      });
      B.ui.onTable(host);
      const qi = host.querySelector('.lt-search input');
      if (qi) { qi.id = 'q'; const lb = host.querySelector('.lt-search label'); if (lb) lb.htmlFor = 'q'; }
    };
    paint();
    onTabs(el.querySelector('#ptabs'), (k) => { prod = k; el.querySelectorAll('#ptabs [data-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.tab === k); b.setAttribute('aria-selected', String(b.dataset.tab === k)); b.tabIndex = b.dataset.tab === k ? 0 : -1; }); paint(); });
    el.querySelector('#sit').onchange = (e) => { sit = e.target.value; paint(); };
    B.ui.onPage(el, { csv: () => {
      const out = [['Cliente', 'Razão social', 'CNPJ/CPF', 'E-mail', 'Produto', 'Plano', 'Mensal', 'Cliente desde', 'Último acesso', 'Situação', 'Saúde']].concat(
        rows.map((c) => [c.name, c.legal_name, c.doc, c.email, c.product, c.plan, String(c.mrr).replace('.', ','), String(c.since || '').slice(0, 10), String(c.last_access || '').slice(0, 10), (STATUS[c.status] || [c.status])[0], (HEALTH[c.health] || ['—'])[0]]));
      B.downloadCsv ? B.downloadCsv('clientes', out) : null;
    } });
  };

  B.downloadCsv = (name, rows) => {
    const blob = new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}-${B.today()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  /* ------------------------------------------------------------ ficha */
  async function detail(el, kind, id, me) {
    const [c, staff] = await Promise.all([rpc('bo_customer', { p_kind: kind, p_id: id }), rpc('bo_staff_names').catch(() => [])]);
    const mayWrite = can(me, 'approver');
    const TABS = [['resumo', 'Resumo'], ['faturas', `Faturas (${c.invoices.length})`], ['pessoas', 'Pessoas'], ['historico', 'Histórico'], ['plano', 'Plano e preço']];
    let tab = B._fichaTab === 'plano' ? 'plano' : 'resumo'; // depois de trocar plano/preço, a ficha volta nesta aba
    B._fichaTab = null;
    const moreActs = mayWrite ? [{ id: 'note', label: 'Registrar nota' }, { id: 'task', label: 'Marcar tarefa' }, c.cancelled_at ? { id: 'react', label: 'Reativar cliente' } : { id: 'cancel', label: 'Marcar como cancelado', danger: true }] : [];
    el.innerHTML = `
      <a class="small tap" href="#/clientes">‹ Clientes</a>
      ${B.ui.pageHead({ title: c.name, sub: `${c.product} · ${c.plan} · cliente desde ${date(c.since)}`, primary: mayWrite ? { id: 'inv', label: 'Nova fatura' } : null, more: moreActs })}
      <div class="kpi4 kpi4-c">
        <div class="tile main"><span class="kpi-label">Mensal</span><span class="tile-value">${brl(c.mrr)}</span><span class="small muted">${statusTag(c.status)}</span></div>
        <div class="tile"><span class="kpi-label">Uso</span><span class="tile-value">${c.kind === 'funder' ? B.brlCompact(c.usage) : nf(c.usage)}</span><span class="small muted">${c.kind === 'funder' ? 'PL do veículo' : 'documentos no mês' + (c.included ? ' de ' + nf(c.included) : '')}</span></div>
        <div class="tile ${Number(c.open_amount) && c.overdue ? 'danger' : ''}"><span class="kpi-label">Em aberto</span><span class="tile-value">${brl(c.open_amount)}</span><span class="small muted">${c.overdue ? c.overdue + ' vencida(s)' : 'nada vencido'}</span></div>
        <div class="tile"><span class="kpi-label">Saúde</span><span class="tile-value">${health(c.health)}</span><span class="small muted">último acesso ${c.last_access ? ago(c.last_access) : 'nunca'}</span></div>
      </div>
      <div class="u-mb16">${tabs(TABS, tab)}</div>
      <div id="tab"></div>`;
    const paint = () => {
      const box = el.querySelector('#tab');
      if (tab === 'resumo') {
        box.innerHTML = `<div class="grid-2 dash-row"><div class="card"><h2>Receita mês a mês</h2><div id="ch"></div></div>
          <div class="card"><h2>Dados</h2><dl class="kv">
            <dt>Razão social</dt><dd>${esc(c.legal_name || c.name)}</dd><dt>CNPJ/CPF</dt><dd>${esc(B.cnpj ? B.cnpj(c.doc || '') : c.doc || '—')}</dd>
            <dt>E-mail</dt><dd>${esc(c.email || '—')}</dd>${c.phone ? `<dt>Telefone</dt><dd>${esc(c.phone)}</dd>` : ''}
            <dt>Responsável na Lottus</dt><dd>${mayWrite ? `<select class="input" id="owner" style="max-width:240px"><option value="">Ninguém</option>${staff.map((s) => `<option value="${esc(s.user_id)}" ${s.name === c.owner_name ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : esc(c.owner_name || '—')}</dd>
            ${c.terms && c.terms.accepted_at ? `<dt>Termos aceitos</dt><dd>versão ${esc(c.terms.version || '')} em ${dateTime(c.terms.accepted_at)}</dd>` : ''}
            ${c.cancelled_at ? `<dt>Cancelado em</dt><dd>${date(c.cancelled_at)}${c.cancel_reason ? ' · ' + esc(c.cancel_reason) : ''}</dd>` : ''}
          </dl>
          <div class="field" style="margin-top:12px"><label>Anotações fixas</label><textarea class="input" id="notes" rows="3" ${mayWrite ? '' : 'disabled'}>${esc(c.notes || '')}</textarea></div>
          ${mayWrite ? `<div class="row" style="gap:8px;margin-top:8px"><button class="btn secondary sm" id="savenotes">Salvar anotações</button></div>` : ''}
          ${c.kind === 'funder' ? `<p class="small" style="margin-top:12px"><a class="tap" href="#/parceiros/${esc(c.id)}">Abrir na gestão dos fundos ›</a></p>` : `<p class="small" style="margin-top:12px"><a class="tap" href="#/planos/sign">Trocar plano ou isentar em Preços e planos ›</a></p>`}</div></div>`;
        B.columnChart(box.querySelector('#ch'), c.revenue.map((r) => { const [y, m] = r.month.split('-'); return { label: `${m}/${y.slice(2)}`, value: Number(r.paid), detail: `faturado ${brl(r.billed)}` }; }), { name: 'Recebido' });
        const o = box.querySelector('#owner');
        if (o) o.onchange = () => run(null, () => rpc('bo_customer_set', { p_kind: kind, p_id: id, p: { action: 'owner', owner_id: o.value } }), 'Responsável salvo').catch(() => {});
        const sn = box.querySelector('#savenotes');
        if (sn) sn.onclick = () => run(sn, () => rpc('bo_customer_set', { p_kind: kind, p_id: id, p: { action: 'notes', text: box.querySelector('#notes').value } }), 'Anotações salvas').catch(() => {});
      } else if (tab === 'faturas') {
        const PH = { open: ['A vencer', 'brand'], overdue: ['Em atraso', 'danger'], paid: ['Paga', 'success'], cancelled: ['Cancelada', ''] };
        box.innerHTML = `<p class="small muted u-mb16">Toque numa fatura para ver a lista de faturas filtrada por este cliente.</p>${B.ui.table({
          rows: c.invoices, pageSize: 25, cardTitle: 'number', emptyText: 'Nenhuma fatura ainda.', searchLabel: 'Buscar fatura',
          onRow: () => { B._gq = { v: 'faturas', q: c.legal_name || c.name, t: Date.now() }; location.hash = '#/faturas/all'; },
          columns: [
            { key: 'number', label: 'Fatura', render: (i) => `<b>${esc(i.number)}</b><div class="small muted">${esc(i.description)}</div>` },
            { key: 'due_date', label: 'Vencimento', searchText: () => '', render: (i) => date(i.due_date) },
            { key: 'amount', label: 'Valor', num: true, searchText: () => '', render: (i) => brl(i.amount) },
            { key: 'phase', label: 'Situação', searchText: (i) => (PH[i.phase] || [i.phase])[0], render: (i) => `<span class="tag ${(PH[i.phase] || ['', ''])[1]}">${esc((PH[i.phase] || [i.phase])[0])}</span>${i.paid_at ? ` <span class="small muted">${date(i.paid_at)}</span>` : ''}` },
          ],
        })}`;
        B.ui.onTable(box);
      } else if (tab === 'pessoas') {
        box.innerHTML = `${B.ui.table({
          rows: c.people, pageSize: 25, cardTitle: 'name', emptyText: 'Ninguém cadastrado.', searchLabel: 'Buscar pessoa',
          columns: [
            { key: 'name', label: 'Nome', render: (p) => `<b>${esc(p.name || '—')}</b>${p.phone ? `<div class="small muted">${esc(p.phone)}</div>` : ''}` },
            { key: 'role', label: 'Papel' },
            { key: 'email', label: 'E-mail', render: (p) => esc(p.email || '') },
            { key: 'last_access', label: 'Último acesso', searchText: () => '', render: (p) => `<span class="small muted">${p.last_access ? esc(ago(p.last_access)) : 'nunca'}</span>` },
          ],
        })}
          ${c.emails.length ? `<div class="card u-m16t"><h2>E-mails enviados</h2><div class="table-wrap"><table class="stack-m"><tbody>${c.emails.map((m) => `<tr><td class="nowrap small" data-label="Quando">${dateTime(m.at)}</td><td data-label="Assunto">${esc(m.subject || '')}</td><td class="small muted" data-label="Situação">${esc(m.status || '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
        B.ui.onTable(box);
      } else if (tab === 'historico') {
        box.innerHTML = `<div class="card">${c.events.length ? `<ol class="timeline">${c.events.map((e) => `<li><span class="tl-when small muted">${dateTime(e.at)}</span><b>${esc(EVENT[e.event] || e.event)}</b> ${esc(e.text || '')}${e.mrr_before != null && e.mrr_after != null && Number(e.mrr_before) !== Number(e.mrr_after) ? ` <span class="small muted">(${brl(e.mrr_before)} → ${brl(e.mrr_after)})</span>` : ''}${e.by_name ? ` <span class="small muted">· ${esc(e.by_name)}</span>` : ''}</li>`).join('')}</ol>` : empty('Sem histórico.')}</div>`;
      } else {
        // Plano, preço de tabela, preço personalizado e troca de plano: plano-ficha.js (bo_customer_plan)
        B.planoFicha.render(box, { c, kind, id, me, fallbackHref: c.kind === 'funder' ? `#/parceiros/${c.id}` : '#/planos/sign' });
      }
    };
    paint();
    onTabs(el.querySelector('.u-mb16'), (k) => { tab = k; el.querySelectorAll('.u-mb16 [data-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.tab === k); b.setAttribute('aria-selected', String(b.dataset.tab === k)); }); paint(); });
    if (!mayWrite) return;
    B.ui.onPage(el, {
      note: async () => {
      const r = await confirmAction({ title: 'Registrar nota', text: 'Fica no histórico do cliente.', confirmLabel: 'Salvar', note: true, noteLabel: 'Nota', noteRequired: true });
      if (r) run(null, () => rpc('bo_customer_set', { p_kind: kind, p_id: id, p: { action: 'note', text: r } }), 'Nota registrada').then(B.reload).catch(() => {});
      },
      task: () => B.openTask && B.openTask({ customer_kind: kind, customer_id: id, title: `Falar com ${c.name}` }),
      inv: () => { B._invReturn = `#/clientes/${kind}/${id}`; return B.newInvoice && B.newInvoice({ customer_kind: kind, funder_id: kind === 'funder' ? id : null, sign_account_id: kind === 'sign' ? id : null, customer_name: c.legal_name || c.name, customer_doc: c.doc, customer_email: c.email }); },
      cancel: async () => {
        const r = await confirmAction({ title: 'Marcar como cancelado', text: 'O cliente sai do MRR. Isso não apaga a conta nem bloqueia o acesso; para isso use a gestão do produto.', confirmLabel: 'Cancelar cliente', danger: true, note: true, noteLabel: 'Motivo' });
        if (r == null) return;
        run(null, () => rpc('bo_customer_set', { p_kind: kind, p_id: id, p: { action: 'cancel', reason: r } }), 'Cliente cancelado').then(B.reload).catch(() => {});
      },
      react: async () => {
        if ((await confirmAction({ title: 'Reativar cliente', text: `<b>${esc(c.name)}</b> volta a contar no MRR e sai da lista de cancelados. Confirma?`, confirmLabel: 'Reativar cliente' })) == null) return;
        return run(null, () => rpc('bo_customer_set', { p_kind: kind, p_id: id, p: { action: 'reactivate' } }), 'Cliente reativado').then(B.reload).catch(() => {});
      },
    });
  }

  /* ----------------------------------------------------------- assinaturas */
  B.views.assinaturas = async (el, _a, me) => {
    const s = await rpc('bo_subscriptions', { p_month: null });
    const mv = s.moves, net = Number(mv.new) + Number(mv.expansion) + Number(mv.contraction) + Number(mv.churn);
    const sign = (v) => `${Number(v) > 0 ? '+' : ''}${brl(v)}`;
    const TABS = [['planos', `Por plano (${s.plans.length})`], ['mudancas', `Mudanças do mês (${s.events.length})`]];
    let tab = 'planos';
    el.innerHTML = `
      ${B.ui.pageHead({ title: 'Assinaturas', sub: 'Quem está em cada plano e o que mudou o MRR neste mês.' })}
      <div class="card today dash-row"><h2>Pedidos de troca de plano${s.requests.length ? ` (${s.requests.length})` : ''}</h2><div id="req"></div></div>
      <div class="kpi4 kpi4-c">
        <div class="tile main"><span class="kpi-label">MRR</span><span class="tile-value">${brl(s.mrr.mrr)}</span><span class="small muted">${sign(net)} no mês</span></div>
        <div class="tile"><span class="kpi-label">Novos</span><span class="tile-value">${sign(mv.new)}</span><span class="small muted">${mv.new_count} cliente(s)</span></div>
        <div class="tile"><span class="kpi-label">Upgrades e downgrades</span><span class="tile-value">${sign(Number(mv.expansion) + Number(mv.contraction))}</span><span class="small muted">${brl(mv.expansion)} a mais · ${brl(-mv.contraction)} a menos</span></div>
        <div class="tile ${Number(mv.churn) ? 'danger' : ''}"><span class="kpi-label">Cancelamentos</span><span class="tile-value">${sign(mv.churn)}</span><span class="small muted">${mv.churn_count} cliente(s)</span></div>
      </div>
      <div class="u-mb16" id="atabs">${tabs(TABS, tab)}</div>
      <div id="atab"></div>`;
    // pedidos: sempre no topo; 5 à vista e o resto sob demanda
    const req = el.querySelector('#req');
    if (!s.requests.length) req.innerHTML = empty('Nenhum pedido de troca de plano.');
    else showMore(req, s.requests, (r) => `<li class="req-row"><a class="queue-row" href="#/planos/sign"><span class="queue-label td-wrap"><b>${esc(r.name)}</b><br><span class="small muted">${esc(r.plan)} → ${esc(r.plan_requested)} · ${esc(ago(r.requested_at))}</span></span><span class="btn secondary sm">Responder</span></a></li>`, { size: 5, wrap: ['<ul class="queue req-list">', '</ul>'], label: 'Ver mais pedidos' });
    const paint = () => {
      const box = el.querySelector('#atab');
      if (tab === 'planos') {
        box.innerHTML = B.ui.table({
          rows: s.plans, pageSize: 25, cardTitle: 'plan', search: s.plans.length > 10, searchLabel: 'Buscar plano', emptyText: 'Nenhum plano com clientes.',
          columns: [
            { key: 'product', label: 'Produto' }, { key: 'plan', label: 'Plano' },
            { key: 'count', label: 'Clientes', num: true, render: (p) => nf(p.count) },
            { key: 'mrr', label: 'MRR', num: true, render: (p) => `<b>${brl(p.mrr)}</b>` },
          ],
        });
        B.ui.onTable(box);
      } else {
        box.innerHTML = '<div class="card"><h2>Mudanças do mês</h2><div id="ev"></div></div>';
        const ev = box.querySelector('#ev');
        if (!s.events.length) ev.innerHTML = empty('Nada mudou neste mês.');
        else showMore(ev, s.events, (e) => `<li><a href="#/clientes/${esc(e.kind)}/${esc(e.id)}"><b>${esc(e.name || 'Cliente')}</b></a> · ${esc(EVENT[e.event] || e.event)}${e.mrr_before != null && e.mrr_after != null && Number(e.mrr_before) !== Number(e.mrr_after) ? ` <span class="small muted">${brl(e.mrr_before)} → ${brl(e.mrr_after)}</span>` : ''}<div class="small muted">${dateTime(e.at)}</div></li>`, { size: 10 });
      }
    };
    paint();
    onTabs(el.querySelector('#atabs'), (k) => { tab = k; el.querySelectorAll('#atabs [data-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.tab === k); b.setAttribute('aria-selected', String(b.dataset.tab === k)); b.tabIndex = b.dataset.tab === k ? 0 : -1; }); paint(); });
  };
})();
