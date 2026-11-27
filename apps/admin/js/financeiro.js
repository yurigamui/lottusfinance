/* Lottus Admin — Financeiro: contas a pagar, fluxo de caixa (com a conta da Lottus na Trio) e resultado */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, dateTime, ago, toast, run, modal, closeModal, confirmAction, sb } = B;
  const { head, tabs, onTabs, empty, can } = B.ui;

  const CAT = { pessoal: 'Pessoal', tecnologia: 'Tecnologia', marketing: 'Marketing', juridico: 'Jurídico', contabil: 'Contabilidade', impostos: 'Impostos', escritorio: 'Escritório', financeiro: 'Tarifas e juros', outros: 'Outros' };
  const REC = { none: 'Não se repete', monthly: 'Todo mês', yearly: 'Todo ano' };
  const PH = { open: ['A vencer', 'brand'], soon: ['Vence em 7 dias', 'warning'], overdue: ['Vencida', 'danger'], paid: ['Paga', 'success'], cancelled: ['Cancelada', ''] };
  const today = () => B.today();
  const num = (v) => { const n = Number(String(v || '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const opts = (map, v) => Object.entries(map).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const phase = (p) => { const [l, c] = PH[p] || [p, '']; return `<span class="tag ${c}">${esc(l)}</span>`; };
  const MONTH = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  /* --------------------------------------------------------------- a pagar */
  B.views.pagar = async (el, [arg], me) => {
    const mayWrite = can(me, 'approver');
    const [all, acc] = await Promise.all([rpc('bo_fin_payables', { p_status: 'all' }), rpc('bo_fin_accounts').catch(() => ({ rows: [] }))]);
    const F = [['open', 'Em aberto'], ['paid', 'Pagas'], ['all', 'Todas']];
    let f = 'open', q = '', cat = '';
    const sum = (fn) => all.filter(fn).reduce((t, x) => t + Number(x.amount), 0);
    const m0 = today().slice(0, 7);
    el.innerHTML = `
      ${head('A pagar', 'As despesas da Lottus: fornecedores, salários, impostos, ferramentas.', `<div class="row" style="gap:8px">${mayWrite ? '<button class="btn" id="new">Nova conta</button>' : ''}<button class="btn ghost" id="csv">Exportar CSV</button></div>`)}
      <div class="kpi4">
        <div class="tile ${all.some((x) => x.phase === 'overdue') ? 'danger' : ''}"><span class="kpi-label">Vencidas</span><span class="tile-value">${brl(sum((x) => x.phase === 'overdue'))}</span><span class="small muted">${all.filter((x) => x.phase === 'overdue').length} conta(s)</span></div>
        <div class="tile main"><span class="kpi-label">Próximos 7 dias</span><span class="tile-value">${brl(sum((x) => x.phase === 'soon'))}</span><span class="small muted">${all.filter((x) => x.phase === 'soon').length} conta(s)</span></div>
        <div class="tile"><span class="kpi-label">Pago no mês</span><span class="tile-value">${brl(sum((x) => x.status === 'paid' && String(x.paid_at || '').slice(0, 7) === m0))}</span><span class="small muted">despesas pagas</span></div>
        <div class="tile"><span class="kpi-label">Recorrentes</span><span class="tile-value">${brl(sum((x) => x.status === 'open' && x.recurring === 'monthly'))}</span><span class="small muted">por mês em aberto</span></div>
      </div>
      <div class="row u-mb16" style="gap:12px;flex-wrap:wrap;justify-content:space-between">${tabs(F, f)}
        <div class="row" style="gap:8px"><select class="input" id="cat" style="width:auto"><option value="">Todas as categorias</option>${opts(CAT, '')}</select><input class="input search" id="q" type="search" placeholder="Buscar fornecedor" aria-label="Buscar"></div></div>
      <div class="card flush"><div class="table-wrap" id="list"></div></div>`;
    const paint = () => {
      const t = q.toLowerCase();
      const list = all.filter((x) => (f === 'all' || (f === 'open' ? x.status === 'open' : x.status === f)) && (!cat || x.category === cat) && (!t || `${x.supplier} ${x.description || ''}`.toLowerCase().includes(t)));
      el.querySelector('#list').innerHTML = !list.length ? empty(f === 'open' ? 'Nenhuma conta em aberto. Cadastre as despesas da Lottus para enxergar o caixa.' : 'Nada aqui.') : `<table class="stack-m">
        <thead><tr><th>Fornecedor</th><th>Categoria</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
        <tbody>${list.map((x) => `<tr class="link" data-id="${esc(x.id)}"><td class="st-title"><b>${esc(x.supplier)}</b><div class="small muted">${esc(x.description || '')}${x.recurring !== 'none' ? ' · ' + esc(REC[x.recurring]) : ''}</div></td>
          <td data-label="Categoria">${esc(CAT[x.category] || x.category)}</td><td class="nowrap" data-label="Vencimento">${date(x.due_date)}</td><td class="num" data-label="Valor"><b>${brl(x.amount)}</b></td>
          <td data-label="Situação">${phase(x.phase)}${x.paid_at ? ` <span class="small muted">${date(x.paid_at)}${x.account ? ' · ' + esc(x.account) : ''}</span>` : ''}</td>
          <td class="num st-actions">${mayWrite && x.status === 'open' ? `<button class="btn secondary sm" data-pay="${esc(x.id)}">Pagar</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
      el.querySelectorAll('#list tr[data-id]').forEach((r) => (r.onclick = (e) => { if (!e.target.closest('button')) open(all.find((x) => x.id === r.dataset.id)); }));
      el.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => pay(all.find((x) => x.id === b.dataset.pay))));
    };
    paint();
    onTabs(el, (k) => { f = k; el.querySelectorAll('.row [data-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.tab === k); b.setAttribute('aria-selected', String(b.dataset.tab === k)); }); paint(); });
    el.querySelector('#q').oninput = (e) => { q = e.target.value.trim(); paint(); };
    el.querySelector('#cat').onchange = (e) => { cat = e.target.value; paint(); };
    el.querySelector('#csv').onclick = () => B.downloadCsv('contas-a-pagar', [['Fornecedor', 'Categoria', 'Descrição', 'Vencimento', 'Valor', 'Situação', 'Pago em', 'Conta', 'Recorrência']].concat(
      all.map((x) => [x.supplier, CAT[x.category], x.description, x.due_date, String(x.amount).replace('.', ','), (PH[x.phase] || [x.phase])[0], x.paid_at, x.account, REC[x.recurring]])));
    if (mayWrite) { el.querySelector('#new').onclick = () => edit(null); if (arg === 'new') edit(null); }

    function pay(x) {
      const box = modal({ title: 'Registrar pagamento', subtitle: `${esc(x.supplier)} · ${brl(x.amount)}`,
        body: `<div class="stack"><div class="field"><label>Pago em</label><input class="input" type="date" id="pd" value="${today()}"></div>
          <div class="field"><label>Saiu da conta</label><select class="input" id="pa"><option value="">Não informar</option>${acc.rows.map((a) => `<option value="${esc(a.id)}" ${a.id === x.account_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
          ${x.recurring !== 'none' ? `<p class="small muted">Conta recorrente: a próxima (${esc(REC[x.recurring].toLowerCase())}) é criada sozinha.</p>` : ''}</div>`,
        foot: '<button class="btn secondary" data-close>Cancelar</button><button class="btn" id="pk">Confirmar</button>' });
      box.querySelector('[data-close]').onclick = closeModal;
      box.querySelector('#pk').onclick = (e) => run(e.target, () => rpc('bo_fin_payable_pay', { p_id: x.id, p_paid_at: box.querySelector('#pd').value || null, p_account: box.querySelector('#pa').value || null }), 'Pagamento registrado').then(() => { closeModal(); B.reload(); }).catch(() => {});
    }
    function open(x) {
      const box = modal({ title: x.supplier, subtitle: `${esc(CAT[x.category])} · ${phase(x.phase)}`,
        body: `<dl class="kv"><dt>Descrição</dt><dd>${esc(x.description || '—')}</dd><dt>Valor</dt><dd><b>${brl(x.amount)}</b></dd><dt>Vencimento</dt><dd>${date(x.due_date)}</dd>
          <dt>Recorrência</dt><dd>${esc(REC[x.recurring])}</dd>${x.paid_at ? `<dt>Pago em</dt><dd>${date(x.paid_at)}${x.account ? ' · ' + esc(x.account) : ''}</dd>` : ''}
          ${x.doc_url ? `<dt>Comprovante / boleto</dt><dd><a href="${esc(B.safeUrl ? B.safeUrl(x.doc_url) : x.doc_url)}" target="_blank" rel="noopener">abrir</a></dd>` : ''}${x.notes ? `<dt>Observações</dt><dd>${esc(x.notes)}</dd>` : ''}</dl>`,
        foot: mayWrite ? (x.status === 'open' ? '<button class="btn danger" data-a="cancel">Cancelar conta</button><span class="grow"></span><button class="btn secondary" data-a="edit">Editar</button>' : '<button class="btn secondary" data-a="reopen">Reabrir</button>') : '' });
      box.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => {
        if (b.dataset.a === 'edit') { closeModal(); return edit(x); }
        if (b.dataset.a === 'cancel' && (await confirmAction({ title: 'Cancelar conta', text: 'A conta sai do fluxo de caixa.', confirmLabel: 'Cancelar conta', danger: true })) == null) return;
        run(b, () => rpc('bo_fin_payable_status', { p_id: x.id, p_action: b.dataset.a }), 'Feito').then(() => { closeModal(); B.reload(); }).catch(() => {});
      }));
    }
    function edit(x) {
      const v = x || { due_date: today(), category: 'outros', recurring: 'none' };
      const box = modal({ title: x ? 'Editar conta' : 'Nova conta a pagar', body: `<div class="stack">
        <div class="grid-2"><div class="field"><label>Fornecedor</label><input class="input" id="e-s" value="${esc(v.supplier || '')}" placeholder="Ex.: AWS, contador, aluguel"></div>
          <div class="field"><label>Categoria</label><select class="input" id="e-c">${opts(CAT, v.category)}</select></div></div>
        <div class="field"><label>Descrição</label><input class="input" id="e-d" value="${esc(v.description || '')}"></div>
        <div class="grid-3"><div class="field"><label>Valor (R$)</label><input class="input" id="e-a" inputmode="decimal" value="${v.amount ? String(v.amount).replace('.', ',') : ''}"></div>
          <div class="field"><label>Vencimento</label><input class="input" type="date" id="e-due" value="${esc(v.due_date)}"></div>
          <div class="field"><label>Repete</label><select class="input" id="e-r">${opts(REC, v.recurring)}</select></div></div>
        <div class="grid-2"><div class="field"><label>Conta que paga</label><select class="input" id="e-acc"><option value="">Não informar</option>${acc.rows.map((a) => `<option value="${esc(a.id)}" ${a.id === v.account_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Link do boleto ou comprovante</label><input class="input" id="e-u" type="url" value="${esc(v.doc_url || '')}" placeholder="https://"></div></div>
        <div class="field"><label>Observações</label><textarea class="input" id="e-n" rows="2">${esc(v.notes || '')}</textarea></div><div class="error-box" id="e-err" hidden></div></div>`,
        foot: '<button class="btn secondary" data-close>Cancelar</button><button class="btn" id="e-ok">Salvar</button>' });
      box.querySelector('[data-close]').onclick = closeModal;
      box.querySelector('#e-ok').onclick = async (e) => {
        const g = (s) => box.querySelector(s).value, err = box.querySelector('#e-err');
        if (!g('#e-s').trim() || !num(g('#e-a')) || !g('#e-due')) { err.hidden = false; err.textContent = 'Preencha fornecedor, valor e vencimento.'; return; }
        try { await run(e.target, () => rpc('bo_fin_payable_save', { p: { id: x && x.id, supplier: g('#e-s'), category: g('#e-c'), description: g('#e-d'), amount: num(g('#e-a')), due_date: g('#e-due'), recurring: g('#e-r'), account_id: g('#e-acc'), doc_url: g('#e-u'), notes: g('#e-n') } }), 'Conta salva'); closeModal(); B.reload(); } catch { /* aviso mostrado */ }
      };
    }
  };

  /* -------------------------------------------------------- fluxo de caixa */
  B.views.caixa = async (el, _a, me) => {
    const admin = can(me, 'admin');
    const [acc, cf] = await Promise.all([rpc('bo_fin_accounts'), rpc('bo_fin_cashflow', { p_days: 90 })]);
    // saldo projetado dia a dia
    let bal = Number(cf.balance), low = null;
    const byDay = new Map();
    cf.items.forEach((x) => { const d = String(x.day).slice(0, 10); byDay.set(d, (byDay.get(d) || 0) + (x.kind === 'in' ? 1 : -1) * Number(x.amount)); });
    const weeks = [];
    for (let i = 0; i < 13; i++) {
      const s = B.addDays(B.today(), i * 7);
      for (let k = 0; k < 7; k++) { const d = B.addDays(s, k); bal += byDay.get(d) || 0; if (low == null || bal < low.v) low = { v: bal, d }; }
      weeks.push({ label: `${Number(s.slice(8))}/${MONTH[Number(s.slice(5, 7)) - 1]}`, long: `semana de ${date(s)}`, value: Math.round(bal * 100) / 100 });
    }
    const ins = cf.items.filter((x) => x.kind === 'in').reduce((t, x) => t + Number(x.amount), 0), outs = cf.items.filter((x) => x.kind === 'out').reduce((t, x) => t + Number(x.amount), 0);
    const min = Number(cf.cash_min || 0);
    const status = (a) => a.kind === 'manual' ? `<span class="small muted">lançado à mão${a.balance_at ? ' · ' + ago(a.balance_at) : ''}</span>`
      : a.trio_status === 'connected' ? `<span class="tag success">Trio conectada</span> <span class="small muted">${a.balance_at ? 'lido ' + ago(a.balance_at) : ''}</span>`
      : a.trio_status === 'error' ? `<span class="tag danger">Não conectou</span> <span class="small muted">${esc(a.trio_reason || '')}</span>` : '<span class="tag warning">Conectando…</span>';
    el.innerHTML = `
      ${head('Fluxo de caixa', 'Quanto a Lottus tem hoje e como o saldo fica nos próximos 90 dias.', `<div class="row" style="gap:8px">${acc.rows.some((a) => a.kind === 'trio') && can(me, 'approver') ? '<button class="btn secondary" id="sync">Atualizar agora</button>' : ''}${admin ? '<button class="btn" id="addacc">Adicionar conta</button>' : ''}</div>`)}
      <div class="kpi4">
        <div class="tile main ${min && Number(acc.total) < min ? 'danger' : ''}"><span class="kpi-label">Saldo hoje</span><span class="tile-value">${brl(acc.total)}</span><span class="small muted">${acc.rows.length} conta(s)${min ? ' · mínimo ' + brl(min) : ''}</span></div>
        <div class="tile"><span class="kpi-label">Entradas em 90 dias</span><span class="tile-value">${brl(ins)}</span><span class="small muted">faturas e receita recorrente prevista</span></div>
        <div class="tile"><span class="kpi-label">Saídas em 90 dias</span><span class="tile-value">${brl(outs)}</span><span class="small muted">contas a pagar e recorrentes</span></div>
        <div class="tile ${low && (low.v < 0 || (min && low.v < min)) ? 'danger' : ''}"><span class="kpi-label">Menor saldo previsto</span><span class="tile-value">${low ? brl(low.v) : '—'}</span><span class="small muted">${low ? 'em ' + date(low.d) : ''}${low && min && low.v < min ? ' · abaixo do mínimo' : ''}</span></div>
      </div>
      <div class="card dash-row"><h2>Saldo previsto por semana</h2><div id="ch"></div></div>
      <div class="grid-2 dash-row">
        <div class="card"><div class="card-head"><h2>Contas</h2></div>
          ${acc.rows.length ? acc.rows.map((a) => `<div class="list-row"><div class="grow"><b>${esc(a.name)}</b> <span class="small muted">${esc(a.bank || (a.kind === 'trio' ? 'Trio' : ''))}</span><div>${status(a)}</div></div><b class="amt" title="${esc(brl(a.balance))}">${brl(a.balance)}</b>${admin ? `<button class="btn ghost sm" data-acc="${esc(a.id)}">Editar</button>` : ''}</div>`).join('')
            : empty('Cadastre a conta da Lottus na Trio para o saldo entrar sozinho, ou lance outra conta à mão.')}
          ${(acc.egress_ips || []).length ? `<p class="small muted" style="margin-top:10px">Na chave da Trio, libere os IPs: ${esc(acc.egress_ips.join(', '))}</p>` : ''}</div>
        <div class="card"><h2>Próximos 30 dias</h2>${cf.items.filter((x) => String(x.day) <= B.addDays(B.today(), 30)).slice(0, 14).map((x) =>
          `<div class="list-row"><span class="small muted nowrap" style="width:64px">${date(x.day).slice(0, 5)}</span><span class="grow small">${esc(x.label)}${x.late ? ' <span class="tag danger">atrasada</span>' : ''}${x.ref === 'forecast' ? ' <span class="tag">previsão</span>' : ''}</span><b class="amt ${x.kind === 'in' ? 'pos' : 'neg'}">${x.kind === 'in' ? '+' : '−'}${brl(x.amount)}</b></div>`).join('') || empty('Nada previsto.')}</div>
      </div>`;
    B.columnChart(el.querySelector('#ch'), weeks, { name: 'Saldo previsto' });
    const sy = el.querySelector('#sync');
    if (sy) sy.onclick = () => run(sy, async () => {
      const { data, error } = await sb.functions.invoke('lottus-bank', { body: { action: 'sync' } });
      if (error) throw error;
      const bad = (data.accounts || []).find((a) => !a.ok);
      if (bad) throw new Error(bad.reason);
      const m = (data.accounts || []).reduce((t, a) => t + (a.matched || 0), 0);
      toast(m ? `Saldo atualizado e ${m} fatura(s) baixada(s) pelo Pix` : 'Saldo atualizado');
    }).then(B.reload).catch(() => B.reload());
    const add = el.querySelector('#addacc');
    if (add) add.onclick = () => editAcc(null);
    el.querySelectorAll('[data-acc]').forEach((b) => (b.onclick = () => editAcc(acc.rows.find((a) => a.id === b.dataset.acc))));

    function editAcc(a) {
      const v = a || { kind: 'trio' };
      const box = modal({ title: a ? `Conta ${a.name}` : 'Adicionar conta', body: `<div class="stack">
        ${a ? '' : `<div class="seg" role="radiogroup"><label><input type="radio" name="k" value="trio" checked> Conta na Trio (saldo automático)</label><label><input type="radio" name="k" value="manual"> Outra conta (saldo à mão)</label></div>`}
        <div class="grid-2"><div class="field"><label>Nome</label><input class="input" id="a-n" value="${esc(v.name || (v.kind === 'trio' ? 'Conta Lottus (Trio)' : ''))}"></div>
          <div class="field"><label>Banco</label><input class="input" id="a-b" value="${esc(v.bank || (v.kind === 'trio' ? 'Trio' : ''))}"></div></div>
        <div id="a-man" ${v.kind === 'trio' ? 'hidden' : ''}><div class="field"><label>Saldo de hoje (R$)</label><input class="input" id="a-bal" inputmode="decimal" value="${v.balance != null ? String(v.balance).replace('.', ',') : ''}"></div></div>
        <div id="a-trio" ${v.kind === 'trio' ? '' : 'hidden'}>
          <p class="small muted">Na Trio, crie uma chave de API "Leitura e escrita" da conta da Lottus e cole aqui. A chave fica guardada no cofre e só o final aparece.${a && a.trio_key_hint ? ` Chave atual termina em <b>${esc(a.trio_key_hint)}</b>; deixe em branco para manter.` : ''}</p>
          <div class="grid-2"><div class="field"><label>Client ID</label><input class="input" id="a-ci" autocomplete="off"></div><div class="field"><label>Secret Key</label><input class="input" id="a-cs" type="password" autocomplete="new-password"></div></div>
          <div class="field"><label>Ambiente</label><select class="input" id="a-env"><option value="production" ${v.trio_env !== 'sandbox' ? 'selected' : ''}>Produção</option><option value="sandbox" ${v.trio_env === 'sandbox' ? 'selected' : ''}>Testes (sandbox)</option></select></div>
          <p class="small muted">O CNPJ da Lottus vem de Configurações › Empresa. Pix recebidos com o mesmo CNPJ e valor de uma fatura em aberto dão baixa sozinhos.</p></div>
        <div class="error-box" id="a-err" hidden></div></div>`,
        foot: `${a ? '<button class="btn danger" id="a-del">Remover</button><span class="grow"></span>' : ''}<button class="btn secondary" data-close>Cancelar</button><button class="btn" id="a-ok">Salvar</button>` });
      let kind = v.kind;
      box.querySelectorAll('input[name=k]').forEach((r) => (r.onchange = () => { kind = r.value; box.querySelector('#a-trio').hidden = kind !== 'trio'; box.querySelector('#a-man').hidden = kind === 'trio'; }));
      box.querySelector('[data-close]').onclick = closeModal;
      const del = box.querySelector('#a-del');
      if (del) del.onclick = async () => { if ((await confirmAction({ title: 'Remover conta', text: 'A conta sai do saldo. O histórico fica guardado.', confirmLabel: 'Remover', danger: true })) == null) return; run(del, () => rpc('bo_fin_account_delete', { p_id: a.id }), 'Conta removida').then(() => { closeModal(); B.reload(); }).catch(() => {}); };
      box.querySelector('#a-ok').onclick = async (e) => {
        const g = (s) => box.querySelector(s).value, err = box.querySelector('#a-err');
        if (!g('#a-n').trim()) { err.hidden = false; err.textContent = 'Dê um nome à conta.'; return; }
        if (!a && kind === 'trio' && (!g('#a-ci').trim() || !g('#a-cs').trim())) { err.hidden = false; err.textContent = 'Cole o Client ID e a Secret Key.'; return; }
        const p = { id: a && a.id, name: g('#a-n'), bank: g('#a-b'), kind, env: g('#a-env'), client_id: g('#a-ci'), client_secret: g('#a-cs') };
        if (kind === 'manual') p.balance = num(g('#a-bal'));
        try {
          await run(e.target, async () => {
            await rpc('bo_fin_account_save', { p });
            if (kind === 'trio' && g('#a-ci').trim()) { const { data } = await sb.functions.invoke('lottus-bank', { body: { action: 'sync' } }); const bad = data && (data.accounts || []).find((x) => !x.ok); if (bad) toast(`A conta foi salva, mas não conectou: ${bad.reason}`, true); }
          }, 'Conta salva');
          closeModal(); B.reload();
        } catch { /* aviso mostrado */ }
      };
    }
  };

  /* -------------------------------------------------------------- resultado */
  B.views.resultado = async (el, [y]) => {
    const nowYear = Number(B.today().slice(0, 4)), year = Number(y) || nowYear;
    const r = await rpc('bo_fin_result', { p_year: year });
    const ms = r.months, mt = r.metrics;
    const tot = (k) => shownRef.reduce((t, m) => t + Number(m[k] || 0), 0);
    let shownRef = [];
    const cats = [...new Set(ms.flatMap((m) => Object.keys(m.expenses || {})))];
    const cur = Number(B.today().slice(5, 7)) - 1, shown = year === nowYear ? ms.slice(0, cur + 1) : ms;
    shownRef = shown;
    const cell = (v, neg) => `<td class="num ${neg && v < 0 ? 'neg' : ''}">${v ? brl(v) : '<span class="muted">—</span>'}</td>`;
    const rev = (m) => Number(m.rev_partners) + Number(m.rev_sign) + Number(m.rev_other);
    // tabela do resultado: recebe os meses a mostrar; o Total é sempre o do período inteiro
    const dre = (cols) => `<div class="table-wrap dre"><table>
        <thead><tr><th></th>${cols.map((m) => `<th class="num">${MONTH[Number(m.month.slice(5)) - 1]}</th>`).join('')}<th class="num">Total</th></tr></thead>
        <tbody>
          <tr class="grp"><td>Receita</td>${cols.map((m) => cell(rev(m))).join('')}${cell(shown.reduce((t, m) => t + rev(m), 0))}</tr>
          <tr><td class="sub">Lottus Partners</td>${cols.map((m) => cell(Number(m.rev_partners))).join('')}${cell(shown.reduce((t, m) => t + Number(m.rev_partners), 0))}</tr>
          <tr><td class="sub">Lottus Sign</td>${cols.map((m) => cell(Number(m.rev_sign))).join('')}${cell(shown.reduce((t, m) => t + Number(m.rev_sign), 0))}</tr>
          <tr><td class="sub">Outras</td>${cols.map((m) => cell(Number(m.rev_other))).join('')}${cell(shown.reduce((t, m) => t + Number(m.rev_other), 0))}</tr>
          <tr class="grp"><td>Despesas</td>${cols.map((m) => cell(-Number(m.exp_total), true)).join('')}${cell(-shown.reduce((t, m) => t + Number(m.exp_total), 0), true)}</tr>
          ${cats.map((c) => `<tr><td class="sub">${esc(CAT[c] || c)}</td>${cols.map((m) => cell(-Number((m.expenses || {})[c] || 0), true)).join('')}${cell(-shown.reduce((t, m) => t + Number((m.expenses || {})[c] || 0), 0), true)}</tr>`).join('')}
          <tr class="grp total"><td>Resultado</td>${cols.map((m) => cell(rev(m) - Number(m.exp_total), true)).join('')}${cell(shown.reduce((t, m) => t + rev(m) - Number(m.exp_total), 0), true)}</tr>
          <tr><td class="sub">MRR no fim do mês</td>${cols.map((m) => `<td class="num small muted">${m.mrr != null ? brl(m.mrr) : '—'}</td>`).join('')}<td></td></tr>
        </tbody></table></div>`;
    el.innerHTML = `
      ${B.ui.pageHead({ title: 'Resultado', sub: 'Receita, despesas e o que sobrou, mês a mês (regime de caixa: quando o dinheiro entrou ou saiu).', more: [{ id: 'csv', label: 'Exportar para o contador' }] })}
      <div class="u-mb16" id="ytabs">${tabs([[String(year - 1), String(year - 1)], [String(year), String(year)]], String(year))}</div>
      <div class="kpi4 kpi4-c">
        <div class="tile main"><span class="kpi-label">Resultado no ano</span><span class="tile-value ${tot('exp_total') > rev({ rev_partners: tot('rev_partners'), rev_sign: tot('rev_sign'), rev_other: tot('rev_other') }) ? 'neg' : ''}">${brl(tot('rev_partners') + tot('rev_sign') + tot('rev_other') - tot('exp_total'))}</span><span class="small muted">receita ${brl(tot('rev_partners') + tot('rev_sign') + tot('rev_other'))} · despesas ${brl(tot('exp_total'))}</span></div>
        <div class="tile"><span class="kpi-label">Receita média por cliente</span><span class="tile-value">${brl(mt.arpa)}</span><span class="small muted">MRR ${brl(mt.mrr)} · ${mt.customers} cliente(s)</span></div>
        <div class="tile"><span class="kpi-label">Churn mensal</span><span class="tile-value">${String(mt.churn_rate).replace('.', ',')}%</span><span class="small muted">${mt.ltv ? 'LTV ' + brl(mt.ltv) : 'LTV aparece com o primeiro cancelamento'}</span></div>
        <div class="tile"><span class="kpi-label">Custo por cliente (CAC)</span><span class="tile-value">${mt.cac == null ? '—' : brl(mt.cac)}</span><span class="small muted">${mt.new_90d} novo(s) em 90 dias · ${brl(mt.spend_90d)} em marketing</span></div>
      </div>
      <div class="card flush">${dre(shown.slice(-3))}</div>
      ${shown.length > 3 ? `<div class="u-m16t">${B.ui.more('Ver todos os meses', `<div class="card flush">${dre(shown)}</div>`)}</div>` : ''}`;
    onTabs(el.querySelector('#ytabs'), (k) => (location.hash = `#/resultado/${k}`));
    const exportCsv = () => B.downloadCsv(`resultado-${year}`, [['Mês', 'Receita Partners', 'Receita Sign', 'Outras receitas', 'Despesas'].concat(cats.map((c) => CAT[c] || c), ['Resultado'])].concat(
      ms.map((m) => [m.month, m.rev_partners, m.rev_sign, m.rev_other, m.exp_total].concat(cats.map((c) => (m.expenses || {})[c] || 0), [rev(m) - Number(m.exp_total)]).map((v) => String(v).replace('.', ',')))));
    B.ui.onPage(el, { csv: exportCsv });
  };
})();
