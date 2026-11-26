/* Lottus · Admin — Planos e cobrança: faixa de cada fundo (Lottus Partners), uso mensal de cada conta (Lottus Sign) e tabelas de preço */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, dateTime, cnpj, toast, run, modal, closeModal, confirmAction } = B;
  const { head, tabs, onTabs, empty, can, fieldError } = B.ui;
  const fail = (e) => toast(B.message(e), true);
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
    const tab = ['partners', 'sign', 'tabelas'].includes(raw) ? raw : 'partners';
    const admin = can(me, 'admin');
    el.innerHTML = head('Planos e cobrança', 'Em que faixa cada fundo está e quanto cada conta do Lottus Sign usou no mês.') +
      `<div class="u-mb16">${tabs([['partners', 'Lottus Partners'], ['sign', 'Lottus Sign'], ['tabelas', 'Tabelas de preço']], tab)}</div><div id="pl-body"><div class="spinner" aria-label="Carregando"></div></div>`;
    onTabs(el, (k) => { location.hash = `#/planos/${k}`; });
    const host = el.querySelector('#pl-body');
    try {
      if (tab === 'partners') await partnersTab(host, admin);
      else if (tab === 'sign') await signTab(host, admin, /^\d{4}-\d{2}/.test(sub || '') ? sub.slice(0, 7) + '-01' : null);
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
    host.innerHTML = `<div class="kpis">${kpi('Receita mensal (faixas)', brl(mrr))}${kpi('Em teste grátis', count('trial'))}${kpi('Pagando', count('active'))}${kpi('Passou da faixa grátis, sem cartão', count('card_required'), count('card_required') ? 'alert' : '')}${kpi('Contrato / convite', count('contract') + count('exempt'))}</div>
      <div class="card stack">
        <div class="row between" style="flex-wrap:wrap;gap:12px"><div><h2>Fundos e faixas</h2><p class="muted small u-m4t">Teste grátis até R$ ${mi(S.free_pl_limit)} de patrimônio; depois, ${S.tiers.map((t, i) => t.up_to == null ? `${(Number(t.rate_aa) * 100).toFixed(2).replace('.', ',')}% a.a. (mín. ${brl(t.min)})` : `${brl(t.monthly)} até R$ ${mi(t.up_to)}`).join(' · ')}. Prazo para cadastrar o cartão: ${S.grace_days} dias. ${S.card_enabled ? '' : 'Cobrança no cartão ainda desligada.'}</p></div>
          <div class="row" style="gap:8px"><input class="input search" id="pq" placeholder="Buscar fundo" style="width:220px"><select class="input" id="ps" style="width:auto"><option value="">Todas as situações</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></div></div>
        <div id="plist"></div></div>`;
    const paint = () => {
      const q = host.querySelector('#pq').value.trim().toLowerCase(), s = host.querySelector('#ps').value;
      const list = rows.filter((r) => (!s || r.status === s) && (!q || `${r.name} ${r.cnpj}`.toLowerCase().includes(q)));
      host.querySelector('#plist').innerHTML = list.length ? `<div class="table-wrap"><table><thead><tr><th>Fundo</th><th>Origem</th><th class="num">Patrimônio (PL)</th><th>Faixa</th><th class="num">Mensalidade</th><th>Situação</th><th>Cartão</th><th></th></tr></thead><tbody>${list.map((r) => {
        const st = STATUS[r.status] || [r.status, ''];
        return `<tr><td><a href="#/parceiros/${esc(r.funder_id)}"><b>${esc(r.name)}</b></a><div class="small muted">${esc(KIND[r.kind] || r.kind)} · ${esc(cnpj(r.cnpj))}${r.active ? '' : ' · inativo'}</div></td>
          <td>${r.origin === 'self' ? 'Cadastro aberto' : 'Convite'}<div class="small muted">${date(r.created_at)}</div></td>
          <td class="num"><b>${brl(r.pl)}</b>${r.pl_declared ? `<div class="small muted">declarou ${brl(r.pl_declared)}</div>` : ''}</td>
          <td>${r.origin === 'self' ? esc(tierLabel(S, r.tier)) : '<span class="muted">Condições contratadas</span>'}</td>
          <td class="num">${r.fee_now == null ? '—' : `<b>${brl(r.fee_now)}</b>`}</td>
          <td><span class="tag ${st[1]}">${esc(st[0])}</span>${r.over_limit_since ? `<div class="small muted">acima da faixa grátis desde ${date(r.over_limit_since)}</div>` : ''}</td>
          <td>${r.card ? `${esc(r.card.brand || 'Cartão')} •••• ${esc(r.card.last4 || '')}` : '<span class="muted">—</span>'}</td>
          <td class="num">${admin ? `<button class="btn secondary sm" data-ex="${esc(r.funder_id)}" data-on="${r.exempt ? 0 : 1}">${r.exempt ? 'Passar a cobrar' : 'Isentar'}</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>` : empty('Nenhum fundo encontrado.');
      host.querySelectorAll('[data-ex]').forEach((b) => (b.onclick = async () => {
        const f = rows.find((x) => x.funder_id === b.dataset.ex) || {}, on = b.dataset.on === '1';
        const ok = await confirmAction({ title: on ? 'Isentar fundo' : 'Passar a cobrar',
          text: on ? `<b>${esc(f.name || 'Este fundo')}</b> deixa de pagar a mensalidade enquanto estiver isento. Confirma?` : `<b>${esc(f.name || 'Este fundo')}</b> volta a pagar a mensalidade da faixa. Confirma?`,
          confirmLabel: on ? 'Isentar' : 'Passar a cobrar', danger: on });
        if (ok == null) return;
        try { const r = await run(b, () => rpc('bo_billing_funder_set', { p_funder: b.dataset.ex, p: { exempt: b.dataset.on === '1' } }), b.dataset.on === '1' ? 'Fundo isento' : 'Cobrança retomada'); rows = r.rows; paint(); } catch (e) { /* já avisado */ }
      }));
    };
    host.querySelector('#pq').oninput = paint; host.querySelector('#ps').onchange = paint; paint();
  }

  /* ------------------------------------------------------------ Lottus Sign */
  async function signTab(host, admin, month) {
    const d = await rpc('bo_sign_accounts', { p_month: month });
    const m = String(d.month).slice(0, 10); let rows = d.rows; const plans = d.plans;
    const used = rows.reduce((t, r) => t + r.used, 0), rev = rows.reduce((t, r) => t + Number(r.total || 0), 0);
    const reqs = rows.filter((r) => r.plan_requested).length;
    const kpi = (l, v, cls) => `<div class="kpi${cls ? ' ' + cls : ''}"><span class="kpi-label">${l}</span><span class="kpi-value">${v}</span></div>`;
    const thisMonth = B.today().slice(0, 7) === m.slice(0, 7);
    host.innerHTML = `<div class="kpis">${kpi('Documentos no mês', used)}${kpi('Receita do mês', brl(rev))}${kpi('Contas ativas no mês', rows.filter((r) => r.used > 0).length)}${kpi('Pedidos de plano', reqs, reqs ? 'alert' : '')}</div>
      <div class="card stack">
        <div class="row between" style="flex-wrap:wrap;gap:12px"><div class="row" style="gap:8px;align-items:center"><button class="btn secondary sm" id="mprev" aria-label="Mês anterior">‹</button><h2 style="margin:0;min-width:170px;text-align:center">${esc(monthLabel(m))}</h2><button class="btn secondary sm" id="mnext" aria-label="Próximo mês" ${thisMonth ? 'disabled' : ''}>›</button></div>
          <div class="row" style="gap:8px"><input class="input search" id="sq" placeholder="Buscar conta" style="width:200px"><button class="btn secondary" id="scsv">Baixar planilha</button></div></div>
        <p class="muted small u-m4t" style="margin:0">Cada documento enviado para assinatura conta no mês em que foi enviado. Cancelado antes de alguém abrir, não conta. ${thisMonth ? 'Mês em andamento: o valor pode mudar.' : ''}</p>
        <div id="slist"></div></div>`;
    const go = (mm) => { location.hash = `#/planos/sign/${mm.slice(0, 7)}`; };
    host.querySelector('#mprev').onclick = () => go(shiftMonth(m, -1));
    host.querySelector('#mnext').onclick = () => go(shiftMonth(m, 1));
    host.querySelector('#scsv').onclick = () => csv(`lottus-sign-${m.slice(0, 7)}.csv`, [['Conta', 'E-mail', 'Documento', 'Plano', 'Ciclo', 'Documentos usados', 'Incluídos', 'Excedentes', 'Mensalidade', 'Valor excedente', 'Total', 'Situação']]
      .concat(rows.map((r) => [r.name, r.email, r.doc || '', r.plan_name, r.cycle === 'annual' ? 'Anual' : 'Mensal', r.used, r.included, r.overage_docs, Number(r.plan_fee), Number(r.overage_fee), Number(r.total), r.status === 'suspended' ? 'Suspensa' : r.exempt ? 'Isenta' : 'Ativa'])));
    const paint = () => {
      const q = host.querySelector('#sq').value.trim().toLowerCase();
      const list = rows.filter((r) => !q || `${r.name} ${r.email} ${r.doc || ''}`.toLowerCase().includes(q));
      host.querySelector('#slist').innerHTML = list.length ? `<div class="table-wrap"><table><thead><tr><th>Conta</th><th>Plano</th><th>Uso no mês</th><th class="num">Excedente</th><th class="num">Total a cobrar</th><th>Último envio</th><th></th></tr></thead><tbody>${list.map((r) => {
        const pctUse = r.included ? Math.min(100, Math.round((r.used / r.included) * 100)) : 100;
        return `<tr><td><b>${esc(r.name || '—')}</b>${r.plan_requested ? ` <span class="tag brand">Pediu ${esc((plans.find((p) => p.code === r.plan_requested) || {}).name || r.plan_requested)}</span>` : ''}${r.status === 'suspended' ? ' <span class="tag danger">Suspensa</span>' : ''}${r.exempt ? ' <span class="tag">Isenta</span>' : ''}
          <div class="small muted">${esc(r.email)}${r.doc ? ' · ' + esc(r.doc.length === 14 ? cnpj(r.doc) : r.doc) : ''}</div></td>
          <td>${esc(r.plan_name)}${r.cycle === 'annual' ? '<div class="small muted">anual</div>' : ''}${r.custom_price != null ? '<div class="small muted">preço combinado</div>' : ''}</td>
          <td style="min-width:150px"><b>${r.used}</b> de ${r.included}${r.blocked && r.hard_limit ? ' <span class="tag danger">Limite</span>' : ''}<div class="pbar${pctUse >= 100 ? ' full' : pctUse >= 80 ? ' high' : ''}"><i style="width:${pctUse}%"></i></div></td>
          <td class="num">${r.overage_docs ? `${r.overage_docs} doc. · ${brl(r.overage_fee)}` : '—'}</td>
          <td class="num"><b>${brl(r.total)}</b>${Number(r.plan_fee) ? `<div class="small muted">plano ${brl(r.plan_fee)}</div>` : ''}</td>
          <td>${r.last_doc_at ? dateTime(r.last_doc_at) : '<span class="muted">Nunca</span>'}</td>
          <td class="num">${admin ? `<button class="btn secondary sm" data-ed="${esc(r.id)}">Editar</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>` : empty('Nenhuma conta do Lottus Sign ainda.');
      host.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => editAccount(rows.find((r) => r.id === b.dataset.ed), plans, (nr) => { rows = nr.rows; paint(); })));
    };
    host.querySelector('#sq').oninput = paint; paint();
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

  /* ------------------------------------------------------------ tabelas de preço */
  async function tablesTab(host, admin) {
    const [bp, sg] = await Promise.all([rpc('bo_billing_partners'), rpc('bo_sign_accounts', { p_month: null })]);
    const S = bp.settings; const plans = sg.plans;
    const ro = admin ? '' : 'readonly disabled';
    host.innerHTML = `<div class="stack">
      <form class="card stack" id="tf" novalidate><div><h2>Lottus Partners · faixas por patrimônio</h2><p class="muted small u-m4t">Vale para os fundos de cadastro aberto, medido no fim de cada mês. Quem entrou por convite segue as condições contratadas. A página pública de preços (lottusfinance.com.br/precos.html) é texto fixo: se mudar os valores aqui, atualize lá também.</p></div>
        <div class="grid-2"><div class="field"><label>Teste grátis até (R$ de PL)</label><input class="input" name="free" inputmode="decimal" value="${esc(num(S.free_pl_limit))}" ${ro}></div>
          <div class="field"><label>Prazo para cadastrar o cartão (dias)</label><input class="input" name="grace" inputmode="numeric" value="${esc(S.grace_days)}" ${ro}></div></div>
        ${S.tiers.map((t, i) => t.up_to == null
          ? `<div class="grid-2"><div class="field"><label>Faixa ${i + 1}: acima da anterior · taxa (% ao ano sobre o PL)</label><input class="input" name="rate" inputmode="decimal" value="${esc(num((Number(t.rate_aa) * 100).toFixed(2)))}" ${ro}></div><div class="field"><label>Mensalidade mínima (R$)</label><input class="input" name="min" inputmode="decimal" value="${esc(num(t.min))}" ${ro}></div></div>`
          : `<div class="grid-2"><div class="field"><label>Faixa ${i + 1}: vai até (R$ de PL)</label><input class="input" name="up${i}" inputmode="decimal" value="${esc(num(t.up_to))}" ${ro}></div><div class="field"><label>Mensalidade (R$)</label><input class="input" name="mo${i}" inputmode="decimal" value="${esc(num(t.monthly))}" ${ro}></div></div>`).join('')}
        <div class="error-box" id="te" hidden></div>${admin ? '<div><button class="btn" type="submit">Salvar faixas</button></div>' : ''}</form>
      <div class="card stack"><div><h2>Lottus Sign · planos</h2><p class="muted small u-m4t">Documento = um envio para assinatura (até 10 assinantes). O plano Grátis para no limite; os pagos continuam enviando e cobram o excedente. Anual = 2 meses grátis.</p></div>
        ${plans.map((p) => `<form class="list-row stack" data-plan="${esc(p.code)}" novalidate style="gap:10px"><div class="grid-2" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
          <div class="field"><label>Plano</label><input class="input" name="name" value="${esc(p.name)}" ${ro}></div>
          <div class="field"><label>R$ por mês</label><input class="input" name="price" inputmode="decimal" value="${esc(num(p.price_month))}" ${ro}></div>
          <div class="field"><label>Documentos incluídos</label><input class="input" name="docs" inputmode="numeric" value="${esc(p.docs_included)}" ${ro}></div>
          <div class="field"><label>R$ por doc. extra</label><input class="input" name="extra" inputmode="decimal" value="${esc(num(p.extra_doc_price))}" placeholder="vazio = bloqueia" ${ro}></div></div>
          <div class="row" style="gap:12px;align-items:center;flex-wrap:wrap"><label class="switch-row" style="margin:0"><input type="checkbox" name="active" ${p.active ? 'checked' : ''} ${ro}><span class="switch" aria-hidden="true"></span><span><b>Disponível para contratar</b></span></label>${admin ? '<button class="btn secondary sm" type="submit">Salvar</button>' : ''}</div></form>`).join('')}
        <div class="error-box" id="pe" hidden></div></div></div>`;
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
      if (first) { first.focus(); return; }
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
        if (first) { first.focus(); return; }
        try { await run(f.querySelector('[type=submit]'), () => rpc('bo_sign_plan_save', { p: { code: f.dataset.plan, name: f.name.value, price_month: String(price), docs_included: String(docs), extra_doc_price: extra == null ? '' : String(extra), active: f.active.checked } }), 'Plano salvo'); }
        catch (x) { err.hidden = false; err.textContent = B.message(x); }
      };
    });
  }
})();
