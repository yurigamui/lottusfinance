/* Lottus · Admin — Preços e planos: faixa de cada fundo (Lottus Partners), uso mensal de cada conta (Lottus Sign) e tabelas de preço */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, dateTime, cnpj, toast, run, modal, closeModal, confirmAction } = B;
  const { head, tabs, onTabs, empty, can, fieldError } = B.ui;
  const fail = (e) => toast(B.message(e), true);
  const rowMore = (pairs) => `<details class="row-more"><summary>Ver mais</summary><dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl></details>`;
  const KIND = { securitizadora: 'Securitizadora', fidc: 'FIDC', bancarizador: 'Bancarizador', outro: 'Outro' };
  const STATUS = {
    trial: ['Teste grátis', 'success'], active: ['Pagando', 'brand'], card_required: ['Falta cartão', 'warning'],
    exempt: ['Isento', ''], contract: ['Contrato', ''],
  };
  const num = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));
  const parse = (s) => B.parseMoney(s);
  /** Lê um campo numérico com validação. Mostra o erro ao lado do campo e devolve undefined se inválido; null se vazio e opcional. */
  function readNum(inp, { required = true, int = false, min = 0, max = 1e12, what = 'o valor' } = {}) {
    const t = inp.value.trim();
    fieldError(inp, '');
    if (t === '') { if (required) { fieldError(inp, `Informe ${what}.`); return undefined; } return null; }
    const n = int ? (/^\d+$/.test(t.replace(/\./g, '')) ? Number(t.replace(/\./g, '')) : NaN) : parse(t);
    if (n == null || !Number.isFinite(n)) { fieldError(inp, int ? 'Use só números inteiros, como 50.' : 'Use só números, como 1.234,56.'); return undefined; }
    if (n < min) { fieldError(inp, min === 0 ? 'Não pode ser negativo.' : `Precisa ser pelo menos ${min}.`); return undefined; }
    if (n > max) { fieldError(inp, 'Valor alto demais. Confira os zeros.'); return undefined; }
    return n;
  }
  /** Depois de salvar uma linha, a lista é refeita; volta à página em que a pessoa estava (a busca já é mantida) e devolve o foco ao botão. */
  const pageOf = (box) => { const m = /Mostrando (\d+) a/.exec((box.querySelector('.lt-count') || {}).textContent || ''); return m ? Math.floor((Number(m[1]) - 1) / 25) : 0; };
  function restorePage(box, n, focusSel) {
    const c = document.querySelector('.content'), y = window.scrollY, t = c ? c.scrollTop : 0;
    for (let i = 0; i < n; i++) { const nx = box.querySelector('[data-lt-next]'); if (!nx || nx.disabled) break; nx.click(); }
    window.scrollTo(0, y); if (c) c.scrollTop = t;
    const b = focusSel && box.querySelector(focusSel); if (b) b.focus({ preventScroll: true });
  }
  const mi = (n) => (n >= 1e6 ? (n / 1e6).toString().replace('.', ',') + ' mi' : n >= 1e3 ? (n / 1e3).toString().replace('.', ',') + ' mil' : String(n));
  const monthLabel = (m) => { const d = new Date(String(m).slice(0, 10) + 'T12:00:00'); const t = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const shiftMonth = (m, n) => B.addMonths(m, n);
  const csv = (name, rows) => {
    const cell = (v) => { const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  /* Faixa em palavras, a partir da tabela cadastrada */
  function tierLabel(settings, idx) {
    if (idx == null) return '—';
    if (idx === 0) return `Grátis (até R$ ${mi(settings.free_pl_limit)})`;
    const t = settings.tiers[idx - 1]; if (!t) return '—';
    const from = idx === 1 ? settings.free_pl_limit : settings.tiers[idx - 2].up_to;
    return t.up_to == null ? `Acima de R$ ${mi(from)}` : `R$ ${mi(from)} a ${mi(t.up_to)}`;
  }

  B.views.planos = async (el, [raw, sub], me) => {
    const tab = ['partners', 'sign', 'tabelas', 'catalogo', 'precos'].includes(raw) ? raw : 'partners';
    const admin = can(me, 'admin');
    el.innerHTML = head('Preços e planos', 'Em que faixa cada fundo está, quanto cada conta do Lottus Sign usou no mês, o catálogo de planos e os preços personalizados.') +
      `<div class="u-mb16">${tabs([['partners', 'Lottus Partners'], ['sign', 'Lottus Sign'], ['tabelas', 'Tabelas de preço'], ['catalogo', 'Catálogo'], ['precos', 'Preços personalizados']], tab)}</div><div id="pl-body"><div class="spinner" aria-label="Carregando"></div></div>`;
    onTabs(el, (k) => { location.hash = `#/planos/${k}`; });
    const host = el.querySelector('#pl-body');
    try {
      if (tab === 'partners') await partnersTab(host, admin);
      else if (tab === 'sign') await signTab(host, admin, /^\d{4}-\d{2}/.test(sub || '') ? sub.slice(0, 7) + '-01' : null);
      else if (tab === 'catalogo') await catalogTab(host);
      else if (tab === 'precos') await overridesTab(host);
      else await tablesTab(host, admin);
    } catch (e) { host.innerHTML = B.ui.errorCard(B.message(e)); }
  };

  /* ------------------------------------------------------------ Lottus Partners */
  async function partnersTab(host, admin) {
    const d = await rpc('bo_billing_partners');
    const S = d.settings; let rows = d.rows;
    const self = rows.filter((r) => r.origin === 'self');
    const mrr = self.reduce((t, r) => t + Number(r.fee_now || 0), 0);
    const count = (s) => rows.filter((r) => r.status === s).length;
    const kpi = (l, v, cls) => `<div class="kpi${cls ? ' ' + cls : ''}"><span class="kpi-label">${l}</span><span class="kpi-value">${v}</span></div>`;
    host.innerHTML = `<div class="kpis kpis-2">${kpi('Receita mensal (faixas)', brl(mrr))}${kpi('Passou da faixa grátis, sem cartão', count('card_required'), count('card_required') ? 'alert' : '')}</div>
      <div class="u-mb16">${B.ui.more('Ver mais indicadores', `<div class="kpis">${kpi('Em teste grátis', count('trial'))}${kpi('Pagando', count('active'))}${kpi('Contrato / convite', count('contract') + count('exempt'))}</div>`)}</div>
      <div class="card stack">
        <div class="row between" style="flex-wrap:wrap;gap:12px"><div class="td-wrap"><h2>Fundos e faixas</h2><p class="muted small u-m4t">Teste grátis até R$ ${mi(S.free_pl_limit)} de patrimônio; depois, ${S.tiers.map((t, i) => t.up_to == null ? `${(Number(t.rate_aa) * 100).toFixed(2).replace('.', ',')}% a.a. (mín. ${brl(t.min)})` : `${brl(t.monthly)} até R$ ${mi(t.up_to)}`).join(' · ')}. Prazo para cadastrar o cartão: ${S.grace_days} dias. ${S.card_enabled ? '' : 'Cobrança no cartão ainda desligada.'}</p></div>
          <div class="field filter-sel"><label for="ps">Situação</label><select class="input" id="ps"><option value="">Todas as situações</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></div></div>
        <div id="plist"></div></div>`;
    const plist = host.querySelector('#plist');
    const paint = () => {
      const s = host.querySelector('#ps').value;
      const list = rows.filter((r) => !s || r.status === s);
      const keep = plist.querySelector('.lt-search input');
      plist.innerHTML = B.ui.table({
        rows: list, pageSize: 25, q: keep ? keep.value : '', cardTitle: 'name', searchLabel: 'Buscar fundo ou CNPJ', emptyText: 'Nenhum fundo encontrado.',
        rowHref: (r) => `#/parceiros/${r.funder_id}`,
        columns: [
          { key: 'name', label: 'Fundo', searchText: (r) => `${r.name} ${r.cnpj}`, render: (r) => `<b>${esc(r.name)}</b><div class="small muted">${esc(KIND[r.kind] || r.kind)} · ${esc(cnpj(r.cnpj))}${r.active ? '' : ' · inativo'}</div>${rowMore([['Origem', `${r.origin === 'self' ? 'Cadastro aberto' : 'Convite'} · ${esc(date(r.created_at))}`], ['Cartão', r.card ? `${esc(r.card.brand || 'Cartão')} •••• ${esc(r.card.last4 || '')}` : '—']])}` },
          { key: 'pl', label: 'Patrimônio (PL)', num: true, searchText: () => '', render: (r) => `<b>${brl(r.pl)}</b>${r.pl_declared ? `<div class="small muted">declarou ${brl(r.pl_declared)}</div>` : ''}` },
          { key: 'tier', label: 'Faixa', searchText: () => '', render: (r) => (r.origin === 'self' ? esc(tierLabel(S, r.tier)) : '<span class="muted">Condições contratadas</span>') },
          { key: 'fee_now', label: 'Mensalidade', num: true, searchText: () => '', render: (r) => (r.fee_now == null ? '—' : `<b>${brl(r.fee_now)}</b>`) },
          { key: 'status', label: 'Situação', searchText: (r) => (STATUS[r.status] || [r.status])[0], render: (r) => { const st = STATUS[r.status] || [r.status, '']; return `<span class="tag ${st[1]}">${esc(st[0])}</span>${r.over_limit_since ? `<div class="small muted">acima da faixa grátis desde ${date(r.over_limit_since)}</div>` : ''}`; } },
          { key: 'funder_id', label: 'Ações', searchText: () => '', render: (r) => (admin ? `<button type="button" class="btn secondary sm" data-ex="${esc(r.funder_id)}" data-on="${r.exempt ? 0 : 1}">${r.exempt ? 'Passar a cobrar' : 'Isentar'}</button>` : '') },
        ],
      });
      B.ui.onTable(plist);
    };
    plist.onclick = async (e) => {
      const b = e.target.closest('[data-ex]');
      if (!b || !plist.contains(b)) return;
      const f = rows.find((x) => x.funder_id === b.dataset.ex) || {}, on = b.dataset.on === '1';
      const ok = await confirmAction({ title: on ? 'Isentar fundo' : 'Passar a cobrar',
        text: on ? `<b>${esc(f.name || 'Este fundo')}</b> deixa de pagar a mensalidade enquanto estiver isento. Confirma?` : `<b>${esc(f.name || 'Este fundo')}</b> volta a pagar a mensalidade da faixa. Confirma?`,
        confirmLabel: on ? 'Isentar' : 'Passar a cobrar', danger: on });
      if (ok == null) return;
      try { const r = await run(b, () => rpc('bo_billing_funder_set', { p_funder: b.dataset.ex, p: { exempt: on } }), on ? 'Fundo isento' : 'Cobrança retomada'); rows = r.rows; const pg = pageOf(plist); paint(); restorePage(plist, pg, `[data-ex="${b.dataset.ex}"]`); } catch (x) { /* já avisado */ }
    };
    host.querySelector('#ps').onchange = paint; paint();
  }

  /* ------------------------------------------------------------ Lottus Sign */
  async function signTab(host, admin, month) {
    const d = await rpc('bo_sign_accounts', { p_month: month });
    const m = String(d.month).slice(0, 10); let rows = d.rows; const plans = d.plans;
    const used = rows.reduce((t, r) => t + r.used, 0), rev = rows.reduce((t, r) => t + Number(r.total || 0), 0);
    const reqs = rows.filter((r) => r.plan_requested).length;
    const kpi = (l, v, cls) => `<div class="kpi${cls ? ' ' + cls : ''}"><span class="kpi-label">${l}</span><span class="kpi-value">${v}</span></div>`;
    const thisMonth = B.today().slice(0, 7) === m.slice(0, 7);
    host.innerHTML = `<div class="kpis kpis-2">${kpi('Receita do mês', brl(rev))}${kpi('Pedidos de plano', reqs, reqs ? 'alert' : '')}</div>
      <div class="u-mb16">${B.ui.more('Ver mais indicadores', `<div class="kpis">${kpi('Documentos no mês', used)}${kpi('Contas ativas no mês', rows.filter((r) => r.used > 0).length)}</div>`)}</div>
      <div class="card stack">
        <div class="row between" style="flex-wrap:wrap;gap:12px"><div class="row" style="gap:8px;align-items:center"><button class="btn secondary sm" id="mprev" aria-label="Mês anterior">‹</button><h2 class="month-h">${esc(monthLabel(m))}</h2><button class="btn secondary sm" id="mnext" aria-label="Próximo mês" ${thisMonth ? 'disabled' : ''}>›</button></div>
          <div class="row" style="gap:8px"><button class="btn secondary" id="scsv">Baixar planilha</button></div></div>
        <p class="muted small u-m4t" style="margin:0">Cada documento enviado para assinatura conta no mês em que foi enviado. Cancelado antes de alguém abrir, não conta. ${thisMonth ? 'Mês em andamento: o valor pode mudar.' : ''}</p>
        <div id="slist"></div></div>`;
    const go = (mm) => { location.hash = `#/planos/sign/${mm.slice(0, 7)}`; };
    host.querySelector('#mprev').onclick = () => go(shiftMonth(m, -1));
    host.querySelector('#mnext').onclick = () => go(shiftMonth(m, 1));
    host.querySelector('#scsv').onclick = () => csv(`lottus-sign-${m.slice(0, 7)}.csv`, [['Conta', 'E-mail', 'Documento', 'Plano', 'Ciclo', 'Documentos usados', 'Incluídos', 'Excedentes', 'Mensalidade', 'Valor excedente', 'Total', 'Situação']]
      .concat(rows.map((r) => [r.name, r.email, r.doc || '', r.plan_name, r.cycle === 'annual' ? 'Anual' : 'Mensal', r.used, r.included, r.overage_docs, Number(r.plan_fee), Number(r.overage_fee), Number(r.total), r.status === 'suspended' ? 'Suspensa' : r.exempt ? 'Isenta' : 'Ativa'])));
    const slist = host.querySelector('#slist');
    const paint = () => {
      const keep = slist.querySelector('.lt-search input');
      slist.innerHTML = B.ui.table({
        rows, pageSize: 25, q: keep ? keep.value : '', cardTitle: 'name', searchLabel: 'Buscar conta, e-mail ou documento', emptyText: 'Nenhuma conta do Lottus Sign ainda.',
        columns: [
          { key: 'name', label: 'Conta', searchText: (r) => `${r.name} ${r.email} ${r.doc || ''}`, render: (r) => `<b>${esc(r.name || '—')}</b>${r.plan_requested ? ` <span class="tag brand">Pediu ${esc((plans.find((p) => p.code === r.plan_requested) || {}).name || r.plan_requested)}</span>` : ''}${r.status === 'suspended' ? ' <span class="tag danger">Suspensa</span>' : ''}${r.exempt ? ' <span class="tag">Isenta</span>' : ''}
            <div class="small muted">${esc(r.email)}${r.doc ? ' · ' + esc(r.doc.length === 14 ? cnpj(r.doc) : r.doc) : ''}</div>` },
          { key: 'plan_name', label: 'Plano', searchText: (r) => r.plan_name, render: (r) => `${esc(r.plan_name)}${r.cycle === 'annual' ? '<div class="small muted">anual</div>' : ''}${r.custom_price != null ? '<div class="small muted">preço combinado</div>' : ''}` },
          { key: 'used', label: 'Uso no mês', searchText: () => '', render: (r) => {
            const pctUse = r.included ? Math.min(100, Math.round((r.used / r.included) * 100)) : 100;
            return `<b>${r.used}</b> de ${r.included}${r.blocked && r.hard_limit ? ' <span class="tag danger">Limite</span>' : ''}<div class="pbar${pctUse >= 100 ? ' full' : pctUse >= 80 ? ' high' : ''}"><i style="width:${pctUse}%"></i></div>${rowMore([['Excedente', r.overage_docs ? `${r.overage_docs} doc. · ${brl(r.overage_fee)}` : '—'], ['Último envio', r.last_doc_at ? esc(dateTime(r.last_doc_at)) : 'Nunca']])}`; } },
          { key: 'total', label: 'Total a cobrar', num: true, searchText: () => '', render: (r) => `<b>${brl(r.total)}</b>${Number(r.plan_fee) ? `<div class="small muted">plano ${brl(r.plan_fee)}</div>` : ''}` },
          { key: 'id', label: 'Ações', searchText: () => '', render: (r) => (admin ? `<button type="button" class="btn secondary sm" data-ed="${esc(r.id)}" aria-label="Editar ${esc(r.name || r.email)}">Editar</button>` : '') },
        ],
      });
      B.ui.onTable(slist);
    };
    slist.onclick = (e) => { const b = e.target.closest('[data-ed]'); if (b && slist.contains(b)) editAccount(rows.find((r) => r.id === b.dataset.ed), plans, (nr) => { rows = nr.rows; const pg = pageOf(slist), id = b.dataset.ed; paint(); restorePage(slist, pg, `[data-ed="${id}"]`); }); };
    paint();
  }

  function editAccount(r, plans, done) {
    const el = modal({ title: r.name || r.email, subtitle: esc(r.email), wide: true, body: `<form id="af" class="stack" novalidate>
      ${r.plan_requested ? `<div class="note-box small">O cliente pediu o plano <b>${esc((plans.find((p) => p.code === r.plan_requested) || {}).name || r.plan_requested)}</b>${r.requested_at ? ' em ' + dateTime(r.requested_at) : ''}. Ao escolher esse plano abaixo e salvar, o pedido é atendido.</div>` : ''}
      <div class="grid-2"><div class="field"><label>Nome da conta / empresa</label><input class="input" name="name" value="${esc(r.name || '')}" maxlength="140"></div>
        <div class="field"><label>Plano</label><select class="input" name="plan">${plans.map((p) => `<option value="${esc(p.code)}" ${p.code === r.plan ? 'selected' : ''}>${esc(p.name)} · ${brl(p.price_month)}/mês · ${p.docs_included} docs${p.extra_doc_price == null ? ' (sem excedente)' : ''}</option>`).join('')}</select></div></div>
      <div class="grid-2"><div class="field"><label>Ciclo</label><select class="input" name="cycle"><option value="monthly" ${r.cycle === 'monthly' ? 'selected' : ''}>Mensal</option><option value="annual" ${r.cycle === 'annual' ? 'selected' : ''}>Anual (2 meses grátis)</option></select></div>
        <div class="field"><label>Situação</label><select class="input" name="status"><option value="active" ${r.status === 'active' ? 'selected' : ''}>Ativa</option><option value="suspended" ${r.status === 'suspended' ? 'selected' : ''}>Suspensa (não envia documentos)</option></select></div></div>
      <div class="grid-2"><div class="field"><label>Preço combinado (R$/mês) <span class="muted">opcional</span></label><input class="input" name="custom_price" inputmode="decimal" value="${esc(num(r.custom_price))}" placeholder="Deixe vazio para usar a tabela"></div>
        <div class="field"><label>Documentos incluídos <span class="muted">opcional</span></label><input class="input" name="custom_docs" inputmode="numeric" value="${esc(r.custom_docs ?? '')}" placeholder="Deixe vazio para usar o plano"></div></div>
      <label class="switch-row"><input type="checkbox" name="exempt" ${r.exempt ? 'checked' : ''}><span class="switch" aria-hidden="true"></span><span><b>Isenta (cortesia)</b><small>Não cobra nada e não limita o envio.</small></span></label>
      <div class="field"><label>Observações internas</label><textarea class="input" name="notes" rows="3">${esc(r.notes || '')}</textarea></div>
      <div class="error-box" id="ae" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar</button>' });
    el.querySelector('[data-act=cancel]').onclick = closeModal;
    el.querySelector('[data-act=ok]').onclick = async (ev) => {
      const f = el.querySelector('#af'); const err = el.querySelector('#ae'); err.hidden = true;
      const cp = parse(f.custom_price.value), cd = f.custom_docs.value.trim() === '' ? null : Number(f.custom_docs.value);
      if ((cp != null && (isNaN(cp) || cp < 0)) || (cd != null && (!Number.isInteger(cd) || cd < 0))) { err.hidden = false; err.textContent = 'Confira o preço combinado e os documentos incluídos.'; return; }
      try {
        const nr = await run(ev.currentTarget, () => rpc('bo_sign_account_set', { p_id: r.id, p: { name: f.name.value, plan: f.plan.value, cycle: f.cycle.value, status: f.status.value, custom_price: cp == null ? '' : String(cp), custom_docs: cd == null ? '' : String(cd), exempt: f.exempt.checked, notes: f.notes.value } }), 'Conta atualizada');
        closeModal(); done(nr);
      } catch (e) { err.hidden = false; err.textContent = B.message(e); }
    };
  }


  /* ------------------------------------------------------------ catálogo (somente leitura) */
  const WEALTH = { gratis: 'Grátis', pro: 'Pro', fund: 'Fundo' };
  /** Caixa de aviso quando a RPC ainda não existe no banco (migração não aplicada) ou falha. */
  const planoErr = (e) => `<div class="card"><div class="${B.plan.isMissing(e) ? 'note-box' : 'error-box'}" role="${B.plan.isMissing(e) ? 'status' : 'alert'}">${esc(B.plan.errorMessage(e))}</div>${B.plan.isMissing(e) ? '' : '<div class="err-actions"><button type="button" class="btn secondary" data-pl-retry>Tentar de novo</button></div>'}</div>`;
  async function catalogTab(host) {
    let cat;
    try { cat = await B.plan.catalog(); } catch (e) { host.innerHTML = planoErr(e); const r = host.querySelector('[data-pl-retry]'); if (r) r.onclick = () => catalogTab(host); return; }
    const S = cat.partners || {}, sign = cat.sign || [], wealth = cat.wealth || [];
    const tiers = (S.tiers || []).map((t) => (t.up_to == null ? `acima disso, ${(Number(t.rate_aa) * 100).toFixed(2).replace('.', ',')}% ao ano sobre o patrimônio (mínimo de ${brl(t.min)} por mês)` : `até R$ ${mi(Number(t.up_to))}: ${brl(t.monthly)} por mês`));
    host.innerHTML = `<p class="muted small u-mb16">Visão única, só para consulta, dos preços de tabela dos três produtos. Para alterar, use as outras abas; o preço de cada cliente fica na ficha dele, em Plano e preço.</p>
      <div class="stack">
        <div class="card"><h2>Lottus Sign</h2>${B.ui.table({ rows: sign, pageSize: 25, search: false, cardTitle: 'name', emptyText: 'Nenhum plano ativo.', columns: [
          { key: 'name', label: 'Plano', render: (p) => `<b>${esc(p.name)}</b>` },
          { key: 'price_month', label: 'Por mês', num: true, render: (p) => brl(p.price_month) },
          { key: 'docs_included', label: 'Documentos incluídos', num: true, render: (p) => esc(p.docs_included) },
          { key: 'extra_doc_price', label: 'Documento extra', num: true, render: (p) => (p.extra_doc_price == null ? 'Sem excedente (bloqueia)' : brl(p.extra_doc_price)) },
        ] })}</div>
        <div class="card"><h2>Lottus Partners</h2><dl class="kv">
          <dt>Teste grátis até</dt><dd>R$ ${esc(mi(Number(S.free_pl_limit || 0)))} de patrimônio</dd>
          <dt>Faixas</dt><dd>${tiers.length ? tiers.map((t) => `<div>${esc(t)}</div>`).join('') : '—'}</dd>
          <dt>Prazo para cadastrar o cartão</dt><dd>${esc(S.grace_days)} dias</dd>
          <dt>Vencimento das faturas</dt><dd>dia ${esc(S.due_day)} do mês seguinte</dd></dl></div>
        <div class="card"><h2>Lottus Wealth</h2>${B.ui.table({ rows: wealth, pageSize: 25, search: false, cardTitle: 'code', emptyText: 'Nenhum plano.', columns: [
          { key: 'code', label: 'Plano', render: (p) => `<b>${esc(WEALTH[p.code] || p.code)}</b>` },
          { key: 'price_month', label: 'Por mês', num: true, render: (p) => brl(p.price_month) },
        ] })}</div></div>`;
    B.ui.onTable(host);
  }

  /* ------------------------------------------------------------ preços personalizados */
  // A RPC bo_price_override_list pede um cliente (produto + id): não existe listagem global. Esta aba leva à ficha de cada cliente.
  async function overridesTab(host) {
    let d;
    try { d = await rpc('bo_customers'); } catch (e) { host.innerHTML = B.ui.errorCard(B.message(e)); return; }
    const rows = (d.rows || []).filter((c) => c.status !== 'cancelled');
    host.innerHTML = `<div class="card"><h2>Preços personalizados</h2>
      <p class="muted small">O preço personalizado de cada cliente (tipo, valor, validade, motivo e quem definiu) fica na ficha dele, na aba Plano e preço, onde também se define ou se revoga. Escolha o cliente abaixo.</p>
      <div id="po-list"></div></div>`;
    host.querySelector('#po-list').innerHTML = B.ui.table({
      rows, pageSize: 25, cardTitle: 'name', searchLabel: 'Buscar cliente', emptyText: 'Nenhum cliente ainda.',
      rowHref: (c) => `#/clientes/${c.kind}/${c.id}`,
      columns: [
        { key: 'name', label: 'Cliente', searchText: (c) => `${c.name} ${c.doc || ''} ${c.email || ''}`, render: (c) => `<b>${esc(c.name)}</b><div class="small muted">${esc(cnpj(c.doc || ''))}</div>` },
        { key: 'plan', label: 'Plano', searchText: (c) => `${c.product} ${c.plan}`, render: (c) => `${esc(c.product)}<div class="small muted">${esc(c.plan)}</div>` },
        { key: 'mrr', label: 'Mensal', num: true, searchText: () => '', render: (c) => `<b>${brl(c.mrr)}</b>` },
        { key: 'kind', label: 'Ver', card: false, searchText: () => '', render: (c) => `<a class="btn secondary sm" data-plano-link href="#/clientes/${esc(c.kind)}/${esc(c.id)}">Plano e preço</a>` },
      ],
    });
    B.ui.onTable(host);
    // o link abre a ficha já na aba Plano e preço
    host.querySelector('#po-list').addEventListener('click', (e) => { if (e.target.closest('a, tr[data-ri]')) B._fichaTab = 'plano'; });
  }

  /* ------------------------------------------------------------ tabelas de preço */
  // campo com erro dentro de uma seção recolhida: abre a seção antes de focar
  const openFor = (inp) => { const d = inp.closest('details'); if (d) d.open = true; inp.focus(); };
  async function tablesTab(host, admin) {
    const [bp, sg] = await Promise.all([rpc('bo_billing_partners'), rpc('bo_sign_accounts', { p_month: null })]);
    const S = bp.settings; const plans = sg.plans;
    const ro = admin ? '' : 'readonly disabled';
    host.innerHTML = `<div class="stack">
      ${B.ui.more('Lottus Partners · faixas por patrimônio', `<form class="stack" id="tf" novalidate><div><p class="muted small u-m4t">Vale para os fundos de cadastro aberto, medido no fim de cada mês. Quem entrou por convite segue as condições contratadas. A página pública de preços (lottusfinance.com.br/precos.html) é texto fixo: se mudar os valores aqui, atualize lá também.</p></div>
        <div class="grid-2"><div class="field"><label>Teste grátis até (R$ de PL)</label><input class="input" name="free" inputmode="decimal" value="${esc(num(S.free_pl_limit))}" ${ro}></div>
          <div class="field"><label>Prazo para cadastrar o cartão (dias)</label><input class="input" name="grace" inputmode="numeric" value="${esc(S.grace_days)}" ${ro}></div></div>
        ${S.tiers.map((t, i) => t.up_to == null
          ? `<div class="grid-2"><div class="field"><label>Faixa ${i + 1}: acima da anterior · taxa (% ao ano sobre o PL)</label><input class="input" name="rate" inputmode="decimal" value="${esc(num((Number(t.rate_aa) * 100).toFixed(2)))}" ${ro}></div><div class="field"><label>Mensalidade mínima (R$)</label><input class="input" name="min" inputmode="decimal" value="${esc(num(t.min))}" ${ro}></div></div>`
          : `<div class="grid-2"><div class="field"><label>Faixa ${i + 1}: vai até (R$ de PL)</label><input class="input" name="up${i}" inputmode="decimal" value="${esc(num(t.up_to))}" ${ro}></div><div class="field"><label>Mensalidade (R$)</label><input class="input" name="mo${i}" inputmode="decimal" value="${esc(num(t.monthly))}" ${ro}></div></div>`).join('')}
        <div class="error-box" id="te" hidden></div>${admin ? '<div><button class="btn" type="submit">Salvar faixas</button></div>' : ''}</form>`)}
      ${B.ui.more('Lottus Sign · planos', `<div class="stack"><div><p class="muted small u-m4t">Documento = um envio para assinatura (até 10 assinantes). O plano Grátis para no limite; os pagos continuam enviando e cobram o excedente. Anual = 2 meses grátis.</p></div>
        ${plans.map((p) => `<form class="list-row stack" data-plan="${esc(p.code)}" novalidate style="gap:10px"><div class="grid-2" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
          <div class="field"><label>Plano</label><input class="input" name="name" value="${esc(p.name)}" ${ro}></div>
          <div class="field"><label>R$ por mês</label><input class="input" name="price" inputmode="decimal" value="${esc(num(p.price_month))}" ${ro}></div>
          <div class="field"><label>Documentos incluídos</label><input class="input" name="docs" inputmode="numeric" value="${esc(p.docs_included)}" ${ro}></div>
          <div class="field"><label>R$ por doc. extra</label><input class="input" name="extra" inputmode="decimal" value="${esc(num(p.extra_doc_price))}" placeholder="vazio = bloqueia" ${ro}></div></div>
          <div class="row" style="gap:12px;align-items:center;flex-wrap:wrap"><label class="switch-row" style="margin:0"><input type="checkbox" name="active" ${p.active ? 'checked' : ''} ${ro}><span class="switch" aria-hidden="true"></span><span><b>Disponível para contratar</b></span></label>${admin ? '<button class="btn secondary sm" type="submit">Salvar</button>' : ''}</div></form>`).join('')}
        <div class="error-box" id="pe" hidden></div></div>`)}</div>`;
    const tf = host.querySelector('#tf');
    tf.querySelectorAll('input').forEach((x) => x.addEventListener('input', () => fieldError(x, '')));
    tf.onsubmit = async (e) => {
      e.preventDefault(); const err = host.querySelector('#te'); err.hidden = true;
      let first = null; const keep = (inp, v) => { if (v === undefined && !first) first = inp; return v; };
      const free = keep(tf.free, readNum(tf.free, { what: 'o limite do teste grátis' }));
      const grace = keep(tf.grace, readNum(tf.grace, { int: true, max: 365, what: 'o prazo em dias' }));
      let prev = free;
      const tiers = S.tiers.map((t, i) => {
        if (t.up_to == null) {
          const rate = keep(tf.rate, readNum(tf.rate, { max: 100, what: 'a taxa' }));
          const min = keep(tf.min, readNum(tf.min, { what: 'a mensalidade mínima' }));
          return { up_to: null, rate_aa: rate === undefined ? 0 : rate / 100, min: min === undefined ? 0 : min };
        }
        const up = keep(tf['up' + i], readNum(tf['up' + i], { what: 'o limite da faixa' }));
        const mo = keep(tf['mo' + i], readNum(tf['mo' + i], { what: 'a mensalidade' }));
        if (up !== undefined && prev !== undefined && up <= prev) { fieldError(tf['up' + i], 'A faixa precisa terminar acima da anterior.'); if (!first) first = tf['up' + i]; }
        if (up !== undefined) prev = up;
        return { up_to: up, monthly: mo };
      });
      if (first) { openFor(first); return; }
      try { await run(tf.querySelector('[type=submit]'), () => rpc('bo_billing_settings_save', { p: { free_pl_limit: free, grace_days: grace, tiers } }), 'Faixas salvas'); B.views.planos(host.parentNode, ['tabelas'], { level: 'admin' }); }
      catch (x) { err.hidden = false; err.textContent = /invalid/.test(String(x.message)) ? 'Confira os valores: cada faixa precisa terminar acima da anterior.' : B.message(x); }
    };
    host.querySelectorAll('[data-plan]').forEach((f) => {
      f.querySelectorAll('input').forEach((x) => x.addEventListener('input', () => fieldError(x, '')));
      f.onsubmit = async (e) => {
        e.preventDefault(); const err = host.querySelector('#pe'); err.hidden = true;
        let first = null; const keep = (inp, v) => { if (v === undefined && !first) first = inp; return v; };
        fieldError(f.name, '');
        if (!f.name.value.trim()) { fieldError(f.name, 'Informe o nome do plano.'); first = f.name; }
        const price = keep(f.price, readNum(f.price, { what: 'o preço por mês' }));
        const docs = keep(f.docs, readNum(f.docs, { int: true, what: 'os documentos incluídos' }));
        const extra = keep(f.extra, readNum(f.extra, { required: false, what: 'o preço do documento extra' }));
        if (first) { openFor(first); return; }
        try { await run(f.querySelector('[type=submit]'), () => rpc('bo_sign_plan_save', { p: { code: f.dataset.plan, name: f.name.value, price_month: String(price), docs_included: String(docs), extra_doc_price: extra == null ? '' : String(extra), active: f.active.checked } }), 'Plano salvo'); }
        catch (x) { err.hidden = false; err.textContent = B.message(x); }
      };
    });
  }
})();
