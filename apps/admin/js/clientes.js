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

  B.views.clientes = async (el, args, me) => {
    if (args[0] === 'funder' || args[0] === 'sign') return detail(el, args[0], args[1], me);
    const { rows, mrr } = await rpc('bo_customers');
    const FILTERS = [['all', 'Todos'], ['partners', 'Partners'], ['sign', 'Sign'], ['active', 'Pagantes'], ['trial', 'Teste / gratuito'], ['overdue', 'Inadimplentes'], ['red', 'Saúde ruim'], ['cancelled', 'Cancelados']];
    let f = FILTERS.some(([k]) => k === args[0]) ? args[0] : 'all', q = '';
    const match = (c) => ({ all: c.status !== 'cancelled', partners: c.kind === 'funder' && c.status !== 'cancelled', sign: c.kind === 'sign' && c.status !== 'cancelled',
      active: Number(c.mrr) > 0, trial: c.status === 'trial', overdue: c.status === 'overdue', red: c.health === 'red', cancelled: c.status === 'cancelled' })[f];
    const cnt = (k) => { const o = f; f = k; const n = rows.filter(match).length; f = o; return n; };
    el.innerHTML = `
      ${head('Clientes', 'Quem paga a Lottus, quanto e como está cada um.', '<button class="btn ghost" id="csv">Exportar CSV</button>')}
      <div class="kpi4">
        <div class="tile main"><span class="kpi-label">MRR</span><span class="tile-value">${brl(mrr.mrr)}</span><span class="small muted">${nf(mrr.customers)} pagantes</span></div>
        <div class="tile"><span class="kpi-label">Partners</span><span class="tile-value">${brl(mrr.partners)}</span><span class="small muted">${cnt('partners')} veículos</span></div>
        <div class="tile"><span class="kpi-label">Sign</span><span class="tile-value">${brl(mrr.sign)}</span><span class="small muted">${cnt('sign')} contas</span></div>
        <div class="tile ${cnt('red') ? 'danger' : ''}"><span class="kpi-label">Saúde ruim</span><span class="tile-value">${cnt('red')}</span><span class="small muted">atraso ou sem acesso há 45 dias</span></div>
      </div>
      <div class="row u-mb16" style="gap:12px;flex-wrap:wrap;justify-content:space-between">
        ${tabs(FILTERS.map(([k, l]) => [k, `${l}${k !== 'all' && cnt(k) ? ` (${cnt(k)})` : ''}`]), f)}
        <input class="input search" id="q" type="search" placeholder="Buscar nome, CNPJ ou e-mail" aria-label="Buscar cliente">
      </div>
      <div class="card flush"><div class="table-wrap" id="list"></div></div>`;
    const paint = () => {
      const t = q.toLowerCase(), d = q.replace(/\D/g, '');
      const list = rows.filter(match).filter((c) => !t || `${c.name} ${c.legal_name} ${c.email || ''}`.toLowerCase().includes(t) || (d.length > 3 && String(c.doc || '').includes(d)));
      el.querySelector('#list').innerHTML = !list.length ? empty('Nenhum cliente aqui.') : `<table>
        <thead><tr><th>Cliente</th><th>Produto e plano</th><th class="num">Mensal</th><th>Uso</th><th>Último acesso</th><th>Situação</th><th>Saúde</th></tr></thead>
        <tbody>${list.map((c) => `<tr class="link" data-k="${c.kind}" data-id="${esc(c.id)}">
          <td><b>${esc(c.name)}</b><div class="small muted">${esc(B.cnpj ? B.cnpj(c.doc || '') : c.doc || '')}${c.owner_name ? ' · ' + esc(c.owner_name) : ''}</div></td>
          <td>${esc(c.product)}<div class="small muted">${esc(c.plan)}${c.plan_requested ? ' · pediu ' + esc(c.plan_requested) : ''}</div></td>
          <td class="num"><b>${brl(c.mrr)}</b></td><td class="small">${usage(c)}</td>
          <td class="small muted">${c.last_access ? ago(c.last_access) : 'nunca'}</td><td>${statusTag(c.status)}</td><td>${health(c.health)}</td></tr>`).join('')}</tbody></table>`;
      el.querySelectorAll('#list tr[data-id]').forEach((r) => (r.onclick = () => (location.hash = `#/clientes/${r.dataset.k}/${r.dataset.id}`)));
    };
    paint();
    onTabs(el, (k) => { f = k; el.querySelectorAll('.page-head ~ .row [data-tab], .row [data-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.tab === k); b.setAttribute('aria-selected', String(b.dataset.tab === k)); }); paint(); });
    el.querySelector('#q').oninput = (e) => { q = e.target.value.trim(); paint(); };
    el.querySelector('#csv').onclick = () => {
      const out = [['Cliente', 'Razão social', 'CNPJ/CPF', 'E-mail', 'Produto', 'Plano', 'Mensal', 'Cliente desde', 'Último acesso', 'Situação', 'Saúde']].concat(
        rows.map((c) => [c.name, c.legal_name, c.doc, c.email, c.product, c.plan, String(c.mrr).replace('.', ','), String(c.since || '').slice(0, 10), String(c.last_access || '').slice(0, 10), (STATUS[c.status] || [c.status])[0], (HEALTH[c.health] || ['—'])[0]]));
      B.downloadCsv ? B.downloadCsv('clientes', out) : null;
    };
  };

  B.downloadCsv = (name, rows) => {
    const blob = new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}-${B.today()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  /* ------------------------------------------------------------ ficha */
  async function detail(el, kind, id, me) {
    const [c, staff] = await Promise.all([rpc('bo_customer', { p_kind: kind, p_id: id }), rpc('bo_staff_names').catch(() => [])]);
    const mayWrite = can(me, 'approver');
    const TABS = [['resumo', 'Resumo'], ['faturas', `Faturas (${c.invoices.length})`], ['pessoas', 'Pessoas'], ['historico', 'Histórico']];
    let tab = 'resumo';
    el.innerHTML = `
      <a class="small" href="#/clientes">‹ Clientes</a>
      ${head(esc(c.name), `${esc(c.product)} · ${esc(c.plan)} · cliente desde ${date(c.since)}`,
        mayWrite ? `<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn secondary" id="note">Registrar nota</button><button class="btn secondary" id="task">Marcar tarefa</button><button class="btn" id="inv">Nova fatura</button></div>` : '')}
      <div class="kpi4">
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
          ${mayWrite ? `<div class="row" style="gap:8px;margin-top:8px"><button class="btn secondary sm" id="savenotes">Salvar anotações</button><span class="grow"></span>${c.cancelled_at ? '<button class="btn secondary sm" id="react">Reativar</button>' : '<button class="btn danger sm" id="cancel">Marcar como cancelado</button>'}</div>` : ''}
          ${c.kind === 'funder' ? `<p class="small" style="margin-top:12px"><a href="#/parceiros/${esc(c.id)}">Abrir na gestão dos fundos ›</a></p>` : `<p class="small" style="margin-top:12px"><a href="#/planos/sign">Trocar plano ou isentar em Preços e planos ›</a></p>`}</div></div>`;
        B.columnChart(box.querySelector('#ch'), c.revenue.map((r) => { const [y, m] = r.month.split('-'); return { label: `${m}/${y.slice(2)}`, value: Number(r.paid), detail: `faturado ${brl(r.billed)}` }; }), { name: 'Recebido' });
        const o = box.querySelector('#owner');
        if (o) o.onchange = () => run(null, () => rpc('bo_customer_set', { p_kind: kind, p_id: id, p: { action: 'owner', owner_id: o.value } }), 'Responsável salvo').catch(() => {});
        const sn = box.querySelector('#savenotes');
        if (sn) sn.onclick = () => run(sn, () => rpc('bo_customer_set', { p_kind: kind, p_id: id, p: { action: 'notes', text: box.querySelector('#notes').value } }), 'Anotações salvas').catch(() => {});
        const cb = box.querySelector('#cancel');
        if (cb) cb.onclick = async () => {
          const r = await confirmAction({ title: 'Marcar como cancelado', text: 'O cliente sai do MRR. Isso não apaga a conta nem bloqueia o acesso; para isso use a gestão do produto.', confirmLabel: 'Cancelar cliente', danger: true, note: true, noteLabel: 'Motivo' });
          if (r == null) return;
          run(cb, () => rpc('bo_customer_set', { p_kind: kind, p_id: id, p: { action: 'cancel', reason: r } }), 'Cliente cancelado').then(B.reload).catch(() => {});
        };
        const rb = box.querySelector('#react');
        if (rb) rb.onclick = () => run(rb, () => rpc('bo_customer_set', { p_kind: kind, p_id: id, p: { action: 'reactivate' } }), 'Cliente reativado').then(B.reload).catch(() => {});
      } else if (tab === 'faturas') {
        const PH = { open: ['A vencer', 'brand'], overdue: ['Em atraso', 'danger'], paid: ['Paga', 'success'], cancelled: ['Cancelada', ''] };
        box.innerHTML = `<div class="card flush">${c.invoices.length ? `<div class="table-wrap"><table><thead><tr><th>Fatura</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th></tr></thead><tbody>${c.invoices.map((i) => `<tr class="link" data-go="#/faturas/all"><td><b>${esc(i.number)}</b><div class="small muted">${esc(i.description)}</div></td><td>${date(i.due_date)}</td><td class="num">${brl(i.amount)}</td><td><span class="tag ${(PH[i.phase] || ['', ''])[1]}">${esc((PH[i.phase] || [i.phase])[0])}</span>${i.paid_at ? ` <span class="small muted">${date(i.paid_at)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('Nenhuma fatura ainda.')}</div>`;
        box.querySelectorAll('[data-go]').forEach((r) => (r.onclick = () => (location.hash = r.dataset.go)));
      } else if (tab === 'pessoas') {
        box.innerHTML = `<div class="card flush">${c.people.length ? `<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Papel</th><th>E-mail</th><th>Último acesso</th></tr></thead><tbody>${c.people.map((p) => `<tr><td><b>${esc(p.name || '—')}</b>${p.phone ? `<div class="small muted">${esc(p.phone)}</div>` : ''}</td><td>${esc(p.role)}</td><td>${esc(p.email || '')}</td><td class="small muted">${p.last_access ? ago(p.last_access) : 'nunca'}</td></tr>`).join('')}</tbody></table></div>` : empty('Ninguém cadastrado.')}</div>
          ${c.emails.length ? `<div class="card" style="margin-top:16px"><h2>E-mails enviados</h2><div class="table-wrap"><table><tbody>${c.emails.map((m) => `<tr><td class="nowrap small">${dateTime(m.at)}</td><td>${esc(m.subject || '')}</td><td class="small muted">${esc(m.status || '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
      } else {
        box.innerHTML = `<div class="card">${c.events.length ? `<ol class="timeline">${c.events.map((e) => `<li><span class="tl-when small muted">${dateTime(e.at)}</span><b>${esc(EVENT[e.event] || e.event)}</b> ${esc(e.text || '')}${e.mrr_before != null && e.mrr_after != null && Number(e.mrr_before) !== Number(e.mrr_after) ? ` <span class="small muted">(${brl(e.mrr_before)} → ${brl(e.mrr_after)})</span>` : ''}${e.by_name ? ` <span class="small muted">· ${esc(e.by_name)}</span>` : ''}</li>`).join('')}</ol>` : empty('Sem histórico.')}</div>`;
      }
    };
    paint();
    onTabs(el.querySelector('.u-mb16'), (k) => { tab = k; el.querySelectorAll('.u-mb16 [data-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.tab === k); b.setAttribute('aria-selected', String(b.dataset.tab === k)); }); paint(); });
    if (!mayWrite) return;
    el.querySelector('#note').onclick = async () => {
      const r = await confirmAction({ title: 'Registrar nota', text: 'Fica no histórico do cliente.', confirmLabel: 'Salvar', note: true, noteLabel: 'Nota', noteRequired: true });
      if (r) run(null, () => rpc('bo_customer_set', { p_kind: kind, p_id: id, p: { action: 'note', text: r } }), 'Nota registrada').then(B.reload).catch(() => {});
    };
    el.querySelector('#task').onclick = () => B.openTask && B.openTask({ customer_kind: kind, customer_id: id, title: `Falar com ${c.name}` });
    el.querySelector('#inv').onclick = () => B.newInvoice && B.newInvoice({ customer_kind: kind, funder_id: kind === 'funder' ? id : null, sign_account_id: kind === 'sign' ? id : null, customer_name: c.legal_name || c.name, customer_doc: c.doc, customer_email: c.email });
  }

  /* ----------------------------------------------------------- assinaturas */
  B.views.assinaturas = async (el, _a, me) => {
    const s = await rpc('bo_subscriptions', { p_month: null });
    const mv = s.moves, net = Number(mv.new) + Number(mv.expansion) + Number(mv.contraction) + Number(mv.churn);
    const sign = (v) => `${Number(v) > 0 ? '+' : ''}${brl(v)}`;
    el.innerHTML = `
      ${head('Assinaturas', 'Quem está em cada plano e o que mudou o MRR neste mês.')}
      <div class="kpi4">
        <div class="tile main"><span class="kpi-label">MRR</span><span class="tile-value">${brl(s.mrr.mrr)}</span><span class="small muted">${sign(net)} no mês</span></div>
        <div class="tile"><span class="kpi-label">Novos</span><span class="tile-value">${sign(mv.new)}</span><span class="small muted">${mv.new_count} cliente(s)</span></div>
        <div class="tile"><span class="kpi-label">Upgrades e downgrades</span><span class="tile-value">${sign(Number(mv.expansion) + Number(mv.contraction))}</span><span class="small muted">${brl(mv.expansion)} a mais · ${brl(-mv.contraction)} a menos</span></div>
        <div class="tile ${Number(mv.churn) ? 'danger' : ''}"><span class="kpi-label">Cancelamentos</span><span class="tile-value">${sign(mv.churn)}</span><span class="small muted">${mv.churn_count} cliente(s)</span></div>
      </div>
      ${s.requests.length ? `<div class="card today dash-row"><h2>Pedidos de troca de plano</h2><div class="queue">${s.requests.map((r) => `<a class="queue-row" href="#/planos/sign"><span class="queue-label"><b>${esc(r.name)}</b><br><span class="small muted">${esc(r.plan)} → ${esc(r.plan_requested)} · ${ago(r.requested_at)}</span></span><span class="btn secondary sm">Responder</span></a>`).join('')}</div></div>` : ''}
      <div class="grid-2 dash-row">
        <div class="card flush"><div class="card-head" style="padding:16px 20px 0"><h2>Por plano</h2></div><div class="table-wrap"><table><thead><tr><th>Produto</th><th>Plano</th><th class="num">Clientes</th><th class="num">MRR</th></tr></thead><tbody>
          ${s.plans.map((p) => `<tr><td>${esc(p.product)}</td><td>${esc(p.plan)}</td><td class="num">${nf(p.count)}</td><td class="num"><b>${brl(p.mrr)}</b></td></tr>`).join('')}</tbody></table></div></div>
        <div class="card"><h2>Mudanças do mês</h2>${s.events.length ? `<ol class="timeline">${s.events.map((e) => `<li><a href="#/clientes/${e.kind}/${esc(e.id)}"><b>${esc(e.name || 'Cliente')}</b></a> · ${esc(EVENT[e.event] || e.event)}${e.mrr_before != null && e.mrr_after != null && Number(e.mrr_before) !== Number(e.mrr_after) ? ` <span class="small muted">${brl(e.mrr_before)} → ${brl(e.mrr_after)}</span>` : ''}<div class="small muted">${dateTime(e.at)}</div></li>`).join('')}</ol>` : empty('Nada mudou neste mês.')}</div>
      </div>`;
  };
})();
