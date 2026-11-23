/* Lottus Partners — operações do fundo: aprovar, recusar e pagar */
(function () {
  'use strict';
  const B = window.BO;
  const { sb, rpc, esc, brl, pct, date, dateTime, cnpj, cpf, toast, run, confirmAction, modal, closeModal } = B;
  const { head, tabs, onTabs, empty, can, skipEmpty } = B.ui;
  const icon = (n) => B.icon(n);

  const TONE = (t) => (['AAA', 'AA', 'A'].includes(t) ? 'success' : ['BBB', 'BB', 'B'].includes(t) ? 'brand' : ['CCC', 'CC', 'C'].includes(t) ? 'warning' : 'danger');
  B.tierTag = (t) => (t ? `<span class="tag ${TONE(t)}">${esc(t)}</span>` : '');

  /* ===================================================== Lottus Partners */
  const P_TABS = [['pending', 'Para aprovar'], ['to_pay', 'A pagar'], ['paid', 'Pagas'], ['all', 'Todas']];
  const PAYOUT = { processing: ['Pagamento em processamento', 'warning'], done: ['Pago', 'success'], failed: ['Pagamento falhou', 'danger'], pending: ['Aguardando pagamento', 'warning'] };
  const DOCK = { contract: 'Contrato social', power_of_attorney: 'Procuração', revenue: 'Faturamento 12 meses', address: 'Comprovante de endereço', financials: 'Balanço e DRE', other: 'Outro' };
  const tierTagP = (t) => (B.tierTag ? B.tierTag(t) : t ? `<span class="tag">${esc(t)}</span>` : '');
  const debtorTone = (r) => ({ A: 'success', B: 'success', C: 'warning', D: 'danger', E: 'danger' })[r] || '';

  async function runPayout(id, btn) {
    const { data, error } = await sb.functions.invoke('charges', { body: { action: 'payout', operation_id: id } });
    if (error) {
      let j = {}; try { j = await error.context.json(); } catch { /* sem corpo */ }
      const e = new Error(j.error || 'unavailable'); e.detail = j.detail || null; throw e;
    }
    return data;
  }
  /** Saldo disponível na Conta Lottus do fundo (null se não deu para ler) */
  async function trioBalance() {
    try { const { data } = await sb.functions.invoke('charges', { body: { action: 'trio_balance' } }); return data && data.available != null ? Number(data.available) : null; }
    catch { return null; }
  }

  /** Texto de contrato com a marcação simples dos modelos ("# ", "## ") */
  B.contractHtml = B.contractHtml || ((text) => `<div class="contract">${String(text || '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
    .map((b) => (b.startsWith('# ') ? `<h3 class="contract-title">${esc(b.slice(2))}</h3>` : b.startsWith('## ') ? `<h4>${esc(b.slice(3))}</h4>`
      : `<p>${esc(b).replace(/\n/g, '<br>')}</p>`)).join('')}</div>`);

  // Abas calculadas aqui, com a lista completa: a troca de aba é instantânea
  const IN_TAB = {
    pending: (o) => !o.signed_at && !o.declined_at && ['requested', 'in_review'].includes(o.status),
    to_pay: (o) => o.status === 'approved',
    paid: (o) => ['paid', 'settled'].includes(o.status),
    all: () => true,
  };
  const stateOf = (o) => o.declined_at ? ['Recusada', 'danger']
    : ['paid', 'settled'].includes(o.status) ? ['Paga', 'success']
    : o.status === 'approved' ? (o.payout === 'failed' ? ['Pagamento falhou', 'danger'] : o.payout === 'processing' ? ['Pagando', 'brand'] : ['A pagar', 'warning'])
    : ['rejected', 'cancelled'].includes(o.status) ? ['Encerrada', ''] : ['Para aprovar', 'brand'];
  const stateTag = (o) => { const [l, t] = stateOf(o); return `<span class="tag ${t}">${esc(l)}</span>`; };
  const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const daysTo = (iso) => (iso ? Math.round((new Date(iso + 'T12:00:00') - new Date(todayIso() + 'T12:00:00')) / 86400000) : null);
  const dueText = (iso) => { const n = daysTo(iso); return n == null ? '' : n < 0 ? `vencida há ${-n} dias` : n === 0 ? 'vence hoje' : `em ${n} dias`; };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* Etapas da operação: a mesma régua do app, do Partners e do Admin */
  const STAGES = [
    ['solicitacao', 'Solicitação', 'Chegou para o fundo'],
    ['analise', 'Análise', 'O fundo está analisando'],
    ['pagamento', 'Pagamento', 'Aprovada: pagar o cedente'],
    ['ativo', 'Ativo', 'Paga, a receber dos sacados'],
    ['vencido', 'Vencido', 'Duplicata vencida sem pagamento'],
    ['liquidado', 'Liquidado', 'Tudo recebido'],
    ['reprovado', 'Reprovado', 'Recusada ou cancelada'],
  ];
  B.STAGES = STAGES;
  const STAGE_TONE = { solicitacao: 'brand', analise: 'warning', pagamento: 'warning', ativo: 'success', vencido: 'danger', liquidado: '', reprovado: 'danger' };
  const stageTag = (st) => `<span class="tag ${STAGE_TONE[st] || ''}" id="stage-tag">${esc((STAGES.find(([k]) => k === st) || [, st || '—'])[1])}</span>`;
  // Para onde dá para arrastar, e o que acontece
  const MOVES = {
    solicitacao: { analise: 'start', pagamento: 'aprovar', reprovado: 'recusar' },
    analise: { pagamento: 'aprovar', reprovado: 'recusar' },
    pagamento: { ativo: 'pagar' },
    ativo: { liquidado: 'receber' },
    vencido: { liquidado: 'receber' },
  };

  B.views.assinar = async (el, [rawIn, act], me) => {
    let raw = rawIn;
    const LEGACY = { pending: 'solicitacao', to_pay: 'pagamento', paid: 'ativo', signed: 'pagamento', all: null };
    if (raw && !(raw in LEGACY) && !STAGES.some(([k]) => k === raw)) return partnerDetail(el, raw, me, act);
    if (raw in LEGACY) raw = LEGACY[raw];
    const all = await rpc('partner_operations', { p_tab: 'all' });
    el.innerHTML = `
      ${head('Operações', null, '<button class="btn ghost sm" id="csv">Exportar</button>')}
      <div class="ops-bar">
        <input class="input search" id="q" type="search" placeholder="Buscar cedente ou CNPJ" aria-label="Buscar cedente ou CNPJ">
        <span class="small muted grow">Arraste o cartão para a próxima etapa, ou abra a operação.</span>
      </div>
      <div class="board" id="board" role="list"></div>`;
    let shown = [];
    const card = (o) => `<article class="kcard ${o.mine === false ? 'ghost' : ''}" role="listitem" ${o.mine === false ? '' : `draggable="true" tabindex="0" data-id="${esc(o.id)}"`} data-stage="${esc(o.stage)}">
        <div class="kc-top"><b>${esc(o.legal_name)}</b>${tierTagP(o.tier)}</div>
        <div class="kc-amt">${brl(o.gross)}${o.net != null && ['solicitacao', 'analise', 'pagamento'].includes(o.stage) ? `<span class="small muted"> · você paga ${brl(o.net)}</span>` : ''}</div>
        <div class="small muted">${o.stage === 'vencido' ? `<span style="color:var(--danger)">${brl(o.overdue)} vencido</span>`
          : ['ativo'].includes(o.stage) ? `${brl(o.open)} a receber${o.first_due ? ` · 1º venc. ${date(o.first_due)}` : ''}`
          : o.stage === 'liquidado' ? `Liquidada ${o.settled_at ? date(o.settled_at) : ''}`
          : o.stage === 'reprovado' ? esc(o.mine === false ? 'Recusada por você · seguiu para outro fundo' : (o.note || 'Recusada'))
          : `${o.items} ${Number(o.items) === 1 ? 'título' : 'títulos'} · ${B.ago ? B.ago(o.created_at) : date(o.created_at)}`}</div>
      </article>`;
    const paint = () => {
      const q = norm(el.querySelector('#q').value).replace(/[.\-/]/g, '');
      shown = all.filter((o) => !q || norm(o.legal_name).includes(q) || String(o.cnpj || '').includes(q));
      el.querySelector('#board').innerHTML = STAGES.map(([k, l, hint]) => {
        const list = shown.filter((o) => o.stage === k);
        const total = list.reduce((t, o) => t + Number(o.gross || 0), 0);
        const LIMIT = 30;
        return `<section class="kcol" data-col="${k}" aria-label="${esc(l)}">
          <header class="kcol-h"><b>${esc(l)}</b><span class="small muted">${list.length ? brlK(total) : ''}</span></header>
          <div class="kcol-hint small muted">${esc(hint)}</div>
          <div class="kcol-b">${list.slice(0, LIMIT).map(card).join('') || '<div class="kempty small muted">Nada aqui</div>'}
            ${list.length > LIMIT ? `<div class="small muted" style="text-align:center;padding:6px">+ ${list.length - LIMIT} (use a busca)</div>` : ''}</div>
        </section>`;
      }).join('');
      wire();
    };
    const go = (id, action) => (location.hash = `#/assinar/${id}${action ? `/${action}` : ''}`);
    const move = async (id, from, to) => {
      const action = (MOVES[from] || {})[to];
      if (!action) {
        toast(to === 'vencido' || from === 'vencido' ? 'Vencido muda sozinho, pela data das duplicatas.' : 'Essa mudança não dá para fazer daqui.', true);
        return;
      }
      if (action === 'start') {
        try { await rpc('partner_start_analysis', { p_id: id }); const o = all.find((x) => x.id === id); if (o) o.stage = 'analise'; paint(); toast('Em análise'); }
        catch (e) { toast(B.message(e), true); }
        return;
      }
      go(id, action);
    };
    function wire() {
      el.querySelectorAll('.kcard[data-id]').forEach((c) => {
        c.onclick = () => go(c.dataset.id);
        c.onkeydown = (e) => { if (e.key === 'Enter') go(c.dataset.id); };
        c.ondragstart = (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ id: c.dataset.id, from: c.dataset.stage })); e.dataTransfer.effectAllowed = 'move'; c.classList.add('drag'); el.querySelector('#board').classList.add('dragging'); };
        c.ondragend = () => { c.classList.remove('drag'); el.querySelector('#board').classList.remove('dragging'); el.querySelectorAll('.kcol').forEach((k) => k.classList.remove('over', 'ok')); };
      });
      el.querySelectorAll('.kcol').forEach((col) => {
        col.ondragover = (e) => { e.preventDefault(); col.classList.add('over'); };
        col.ondragleave = () => col.classList.remove('over');
        col.ondrop = (e) => {
          e.preventDefault(); col.classList.remove('over');
          let d; try { d = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
          if (d && d.from !== col.dataset.col) move(d.id, d.from, col.dataset.col);
        };
      });
    }
    el.querySelector('#q').oninput = paint;
    el.querySelector('#csv').onclick = () => B.operationsCsv(shown.filter((o) => o.mine !== false).map((o) => ({ ...o, _state: (STAGES.find(([k]) => k === o.stage) || [, o.stage])[1] })), `operacoes-${todayIso()}.csv`);
    paint();
    if (raw && STAGES.some(([k]) => k === raw)) { const c = el.querySelector(`[data-col="${raw}"]`); if (c) c.scrollIntoView({ inline: 'start', block: 'nearest' }); }
  };
  const brlK = (v) => { const n = Number(v || 0); return n >= 1e6 ? `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : n >= 1e3 ? `R$ ${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : brl(n); };

  /** Recusa com motivos rápidos */
  const REASONS = ['Sacado fora da política', 'Cedente fora da política', 'Sem limite disponível', 'Prazo acima do aceito', 'Documentação insuficiente'];
  function askDecline() {
    return new Promise((resolve) => {
      const box = modal({
        title: 'Recusar a operação',
        subtitle: 'Ela segue para o próximo fundo da fila.',
        body: `<div class="stack"><div class="chips" role="group" aria-label="Motivo">${REASONS.map((r, i) => `<button type="button" class="chip" data-r="${i}">${esc(r)}</button>`).join('')}</div>
          <div class="field"><label for="dn">Motivo</label><textarea id="dn" class="input" placeholder="Escolha acima ou escreva"></textarea></div>
          <div class="error-box" id="de" hidden></div></div>`,
        foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn danger" data-act="ok">Recusar</button>',
      });
      const ta = box.querySelector('#dn');
      box.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => {
        box.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
        ta.value = REASONS[b.dataset.r]; ta.focus();
      }));
      box.querySelector('[data-act=cancel]').onclick = () => { closeModal(); resolve(null); };
      box.querySelector('[data-act=ok]').onclick = () => {
        const v = ta.value.trim();
        if (!v) { const e = box.querySelector('#de'); e.hidden = false; e.textContent = 'Escolha ou escreva o motivo.'; return; }
        closeModal(); resolve(v);
      };
    });
  }

  async function partnerDetail(el, id, me, act) {
    const [d, x, queue] = await Promise.all([
      rpc('partner_operation', { p_id: id }), rpc('partner_operation_details', { p_id: id }),
      rpc('partner_operations', { p_tab: 'pending' }).catch(() => []),
    ]);
    const o = d.operation, c = d.company, a = x.assignor || {}, bh = a.behavior || {};
    // Abrir a operação que chegou = começar a análise
    if (o.stage === 'solicitacao' && d.can_sign) rpc('partner_start_analysis', { p_id: id }).then((st) => { o.stage = st; const t = el.querySelector('#stage-tag'); if (t) t.outerHTML = stageTag(st); }).catch(() => null);
    const isPending = !o.signed_at && !o.declined_at && ['requested', 'in_review'].includes(x.status || o.status);
    const canApprove = d.can_sign && isPending;
    const missing = (x.checks || []).filter((k) => k.required && !k.ok && k.key !== 'funder_acceptance');
    const pay = x.payout ? PAYOUT[x.payout.status] : null;
    const noAccount = me.trio_required && !me.trio_ready;
    let saldo = null;
    const pc = (v) => (v == null ? '—' : `${Math.round(Number(v) * 100)}%`);
    const xmls = (x.invoices || []).filter((i) => i.xml_path);
    const debtors = x.debtors || [];
    const byCnpj = Object.fromEntries(debtors.map((s) => [s.cnpj, s]));
    const RANK = { A: 1, B: 2, C: 3, D: 4, E: 5 };
    const worst = debtors.map((s) => s.rating).filter(Boolean).sort((p, q) => (RANK[q] || 9) - (RANK[p] || 9))[0];
    const items = d.items.map((i, n) => ({ ...i, n, net: Number(i.amount) - Number(i.discount || 0) - Number(i.iof || 0) }));
    const groups = [];
    items.forEach((i) => { let g = groups.find((x) => x.cnpj === i.debtor_cnpj); if (!g) groups.push(g = { cnpj: i.debtor_cnpj, name: i.debtor_name, items: [] }); g.items.push(i); });
    const pos = queue.findIndex((q) => q.id === id);
    const prev = pos > 0 ? queue[pos - 1].id : null, next = pos >= 0 && pos < queue.length - 1 ? queue[pos + 1].id : null;
    const afterDecision = () => { const n = queue.filter((q) => q.id !== id)[0]; location.hash = n ? `#/assinar/${n.id}` : '#/assinar'; };
    const status = o.declined_at ? '<span class="tag danger" id="stage-tag">Recusada por você</span>' : stageTag(o.stage);
    const openItems = items.filter((i) => !i.charge || i.charge.status === 'open');
    const xmlOf = (i) => (x.invoices || []).find((v) => v.xml_path && (v.access_key === i.nfe_key || String(v.number) === String(i.nfe_number)));
    const check = (ok, title, text) => `<li class="${ok === true ? 'ok' : ok === false ? 'no' : 'info'}"><span class="ci" aria-hidden="true">${ok === true ? '✓' : ok === false ? '!' : '·'}</span>
      <span><b>${title}</b><span class="small muted">${text}</span></span></li>`;
    const selectable = canApprove && items.length > 1;

    el.innerHTML = `
      <div class="page-head"><div><a class="back" href="#/assinar">‹ Operações</a>
        <h1>${esc(c.legal_name)} ${tierTagP(a.tier)}</h1><div class="page-sub">${esc(cnpj(c.cnpj))} · pedida ${B.ago ? B.ago(o.created_at) : dateTime(o.created_at)}${o.parent_id ? ' · parte de outro pedido' : ''}</div></div>
        ${pos >= 0 && queue.length > 1 ? `<div class="pager"><span class="small muted">${pos + 1} de ${queue.length}</span>
          <a class="btn ghost sm ${prev ? '' : 'disabled'}" ${prev ? `href="#/assinar/${esc(prev)}"` : 'aria-disabled="true"'} aria-label="Anterior">‹</a>
          <a class="btn ghost sm ${next ? '' : 'disabled'}" ${next ? `href="#/assinar/${esc(next)}"` : 'aria-disabled="true"'} aria-label="Próxima">›</a></div>` : ''}</div>
      <div class="detail">
        <aside class="rail"><div class="card rail-card">
          ${status}
          <div class="rail-amount" id="sel-gross">${brl(o.gross)}</div><div class="rail-amount-label" id="sel-label">${items.length === 1 ? '1 título' : `${items.length} títulos`}</div>
          <dl class="lines">
            <dt>Você paga</dt><dd><b id="sel-net">${brl(o.net)}</b></dd>
            <dt>Taxa</dt><dd>${pct(o.monthly_rate)} a.m.</dd>
          </dl>
          ${isPending ? `<ul class="decide">
            ${check(!missing.length, 'Documentos', missing.length ? `Falta: ${esc(missing.map((m) => m.label).join(', '))}` : 'Tudo assinado')}
            ${check(a.tier ? !['CCC', 'CC', 'C', 'DDD', 'DD', 'D'].includes(a.tier) : null, 'Cedente', a.tier ? `Nota ${esc(a.tier)}${bh.ops_total ? ` · ${esc(bh.ops_total)} operações na Lottus` : ''}` : 'Sem nota')}
            ${check(worst ? !['D', 'E'].includes(worst) : null, debtors.length === 1 ? 'Sacado' : `${debtors.length} sacados`, worst ? `Pior nota ${esc(worst)}` : 'Sem nota')}
          </ul>` : ''}
          ${canApprove && noAccount ? `<div class="note-box small">Para aprovar, o fundo precisa da Conta Lottus ativa (o Pix ao cedente sai dela). <a href="#/config/banco">Ver o andamento</a></div>` : ''}
          ${canApprove ? `<div class="rail-actions" id="acts"><p class="small muted" id="bal-note" style="margin:0 0 8px" hidden></p><p class="small" id="limit-note" hidden style="margin:0 0 8px;color:var(--danger)"></p><button class="btn block lg" id="approve" ${missing.length ? 'disabled' : ''}>Aprovar</button>
            <button class="btn danger block" id="decline">Recusar</button></div>` : ''}
          ${o.decline_note ? `<div class="note-box">${esc(o.decline_note)}</div>` : ''}
          ${x.status === 'approved' || x.payout ? `<div class="stack-sm pay-box">
            <div class="row between"><b>Pagamento ao cedente</b> ${pay ? `<span class="tag ${pay[1]}">${esc(pay[0])}</span>` : ''}</div>
            ${x.payout && x.payout.error ? `<div class="small" style="color:var(--danger)">${esc(x.payout.error)}</div>` : ''}
            ${x.payout && x.payout.receipt_url ? `<a class="small" href="${esc(x.payout.receipt_url)}" target="_blank" rel="noopener">Ver comprovante</a>` : ''}
            ${x.status === 'approved' && x.bank ? `<dl class="lines small">
                <dt>Valor</dt><dd><b>${brl(o.net)}</b></dd>
                <dt>Banco</dt><dd>${esc(x.bank.bank_code)} ${esc(x.bank.bank_name || '')}</dd>
                <dt>Agência · conta</dt><dd>${esc(x.bank.branch)} · ${esc(x.bank.account)}</dd>
                <dt>Titular</dt><dd>${esc(cnpj(x.bank.holder_document))}</dd></dl>
              ${me.trio_required ? `<p class="small muted" style="margin:0">Pix pela Conta Lottus do fundo, para a chave CNPJ do cedente.</p>
                ${me.can_sign !== false && (!x.payout || x.payout.status === 'failed') ? '<button class="btn block" id="payapi">Tentar o Pix de novo</button>' : ''}`
              : `<p class="small muted" style="margin:0">Pague pelo banco do fundo e registre aqui. As duplicatas viram cobranças Pix na chave do fundo, enviadas aos sacados.</p>
                ${me.can_sign !== false ? '<button class="btn block" id="paymanual">Registrar pagamento</button>' : ''}`}` : ''}
          </div>` : ''}
          ${['ativo', 'vencido'].includes(o.stage) && me.can_sign !== false && openItems.length ? `<div class="stack-sm pay-box"><div class="row between"><b>Recebimento dos sacados</b>${stageTag(o.stage)}</div>
            <p class="small muted" style="margin:0">${openItems.length} de ${items.length} em aberto. Confira o Pix na conta do fundo e registre.</p>
            <button class="btn block" id="receive">Registrar recebimento</button></div>` : ''}
        </div></aside>
        <div class="stack">
          <div class="card titles">
            <div class="card-head"><h2>Títulos</h2>${selectable ? '<label class="small check-all"><input type="checkbox" id="all" checked> Todos</label>' : ''}</div>
            ${groups.map((g) => { const s = byCnpj[g.cnpj] || {}; return `<div class="t-group">
              <div class="t-head"><b>${esc(s.name || g.name || cnpj(g.cnpj))}</b> <span class="tag ${debtorTone(s.rating)}">${esc(s.rating || '—')}</span>${s.blocked ? ' <span class="tag danger">Bloqueado</span>' : ''}
                <span class="small muted">${s.paid_history && s.paid_history.count ? `${esc(s.paid_history.count)} pagas, ${esc(s.paid_history.late)} com atraso` : 'sem histórico'}${Number(s.exposure_funder) ? ` · ${brl(s.exposure_funder)} já com você` : ''}</span></div>
              ${g.items.map((i) => `<label class="t-row ${selectable ? 'sel' : ''}">
                ${selectable ? `<input type="checkbox" data-it="${i.n}" checked aria-label="Escolher NF-e ${esc(i.nfe_number || '')}/${esc(i.installment)}">` : ''}
                <span class="grow">${xmlOf(i) ? `<button type="button" class="nf-link" data-nfxml="${i.n}" title="Baixar o XML da NF-e">NF-e ${esc(i.nfe_number || '—')}/${esc(i.installment)}</button>` : `<b>NF-e ${esc(i.nfe_number || '—')}/${esc(i.installment)}</b>`}<span class="small muted">${date(i.due_date)} · ${i.charge && i.charge.status === 'paid' ? `<span style="color:var(--success)">recebida ${date(i.charge.paid_at)}</span>` : dueText(i.due_date)}${i.charge && i.charge.pdf_url ? ` · <a href="${esc(i.charge.pdf_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">cobrança Pix</a>` : ''}</span></span>
                <span class="num"><b>${brl(i.amount)}</b></span></label>`).join('')}
            </div>`; }).join('')}
          </div>

          <div class="card cedente-card"><div class="row between" style="align-items:flex-start;gap:12px;flex-wrap:wrap">
              <div><h2>Cedente</h2><div class="small muted" style="margin-top:4px">${a.tier ? `Nota ${esc(a.tier)}${a.score != null ? ` · ${Math.round(a.score)} pontos` : ''}` : 'Sem nota'} · ${esc(bh.ops_total || 0)} operações${bh.on_time_ratio != null ? ` · ${pc(bh.on_time_ratio)} em dia` : ''}${Number(bh.overdue_open) ? ` · <span style="color:var(--danger)">${brl(bh.overdue_open)} em atraso</span>` : ''}</div></div>
            </div>
            ${(x.documents || []).length || xmls.length ? `<div class="row" style="flex-wrap:wrap;gap:6px;justify-content:flex-start;margin-top:12px">
              ${(x.documents || []).map((f, i) => `<button class="btn secondary sm" data-doc="${i}">${esc(DOCK[f.kind] || f.kind)}</button>`).join('')}
              ${xmls.map((i, n) => `<button class="btn ghost sm" data-xml="${n}">XML ${esc(i.number || '—')}</button>`).join('')}</div>` : ''}
          </div>

          <details class="card"><summary><b>Termo de cessão e assinaturas</b></summary>
            <div class="stack-sm" style="margin-top:12px">
              <div><button class="btn secondary sm" type="button" id="contract-pdf">Baixar o contrato de cessão (PDF)</button></div>
              ${(x.checks || []).map((k) => `<div class="small">${k.ok ? '✓' : '·'} ${esc(k.label)} <span class="muted">${k.ok ? dateTime(k.signed_at) : k.key === 'funder_acceptance' ? 'assinado ao aprovar' : 'não assinado'}</span></div>`).join('')}
              ${d.contract_text ? `<details style="margin-top:8px"><summary class="small"><b>Ler o termo assinado pelo cedente</b></summary>
                <div class="contract-box" style="margin-top:8px">${B.contractHtml(d.contract_text)}</div></details>` : ''}
            </div></details>
        </div>
      </div>
      ${canApprove ? `<div class="decision-bar"><button class="btn danger" data-dec>Recusar</button><button class="btn" data-ap ${missing.length ? 'disabled' : ''}>Aprovar</button></div>` : ''}`;

    el.querySelectorAll('[data-doc]').forEach((b) => (b.onclick = () => B.openFile('company-docs', x.documents[b.dataset.doc].path)));
    el.querySelectorAll('[data-xml]').forEach((b) => (b.onclick = () => B.downloadFile('invoices', xmls[b.dataset.xml].xml_path, `NF-e ${xmls[b.dataset.xml].number || ''}.xml`)));
    el.querySelectorAll('[data-nfxml]').forEach((b) => (b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const it = items[b.dataset.nfxml], v = xmlOf(it);
      if (v) B.downloadFile('invoices', v.xml_path, `NF-e ${it.nfe_number || ''}.xml`);
    }));
    const cp = el.querySelector('#contract-pdf');
    if (cp) cp.onclick = () => contractPdf(d, x, me);
    const rv = el.querySelector('#receive');
    if (rv) rv.onclick = () => markReceived(id, items, openItems);

    // Seleção de títulos: valores e botão acompanham o que está marcado
    const boxes = [...el.querySelectorAll('[data-it]')];
    const chosen = () => (boxes.length ? items.filter((i) => boxes[i.n] && boxes[i.n].checked) : items);
    const totals = () => {
      const sel = chosen();
      const gross = sel.reduce((s, i) => s + Number(i.amount), 0);
      const fee = Math.round(Number(o.fee || 0) * (gross / Number(o.gross || 1)) * 100) / 100;
      const bonus = Number(o.net) - (Number(o.gross) - items.reduce((s, i) => s + Number(i.discount || 0) + Number(i.iof || 0), 0) - Number(o.fee || 0));
      const net = sel.reduce((s, i) => s + i.net, 0) - fee + (sel.length ? Math.max(0, Math.round(bonus * 100) / 100) : 0);
      return { sel, gross, net };
    };
    const over = (t) => me.approval_limit != null && t.gross > Number(me.approval_limit);
    const low = (t) => saldo != null && (t.sel.length === items.length ? Number(o.net) : t.net) > saldo + 0.004;
    const refresh = () => {
      const t = totals(), partial = t.sel.length < items.length;
      el.querySelector('#sel-gross').textContent = brl(t.gross);
      el.querySelector('#sel-label').textContent = partial ? `${t.sel.length} de ${items.length} títulos` : items.length === 1 ? '1 título' : `${items.length} títulos`;
      el.querySelector('#sel-net').textContent = brl(t.sel.length === items.length ? o.net : t.net);
      el.querySelectorAll('#approve, [data-ap]').forEach((b) => {
        b.textContent = partial ? `Aprovar ${t.sel.length} de ${items.length}` : 'Aprovar';
        b.disabled = !!missing.length || !t.sel.length || over(t) || noAccount || low(t);
      });
      const bn = el.querySelector('#bal-note');
      if (bn && saldo != null) {
        bn.hidden = false;
        bn.innerHTML = low(t) ? `<span style="color:var(--danger)">Saldo na Conta Lottus: ${brl(saldo)}. Faltam ${brl(t.net - saldo)} para pagar o cedente.</span>` : `Saldo na Conta Lottus: ${brl(saldo)}`;
      }
      const lim = el.querySelector('#limit-note');
      if (lim) { lim.hidden = !over(t); lim.textContent = `Acima da sua alçada (${brl(me.approval_limit)}). Desmarque títulos ou peça a um aprovador com alçada maior.`; }
      const all = el.querySelector('#all');
      if (all) { all.checked = t.sel.length === items.length; all.indeterminate = t.sel.length > 0 && partial; }
    };
    boxes.forEach((b) => (b.onchange = refresh));
    const all = el.querySelector('#all');
    if (all) all.onchange = () => { boxes.forEach((b) => (b.checked = all.checked)); refresh(); };
    if (el.querySelector('#sel-gross')) refresh();
    if (canApprove && me.trio_required && !noAccount) trioBalance().then((v) => { saldo = v; if (el.isConnected && el.querySelector('#sel-gross')) refresh(); });

    const approve = async (btn) => {
      const t = totals(), partial = t.sel.length < items.length;
      const ok = await confirmAction({ title: partial ? 'Aprovar parte dos títulos' : 'Aprovar a operação', confirmLabel: 'Aprovar e assinar',
        text: `<dl class="lines" style="margin:0 0 12px"><dt>Cedente</dt><dd><b>${esc(c.legal_name)}</b></dd>
          <dt>Títulos</dt><dd><b>${partial ? `${t.sel.length} de ${items.length}` : items.length}</b></dd>
          <dt>Valor de face</dt><dd><b>${brl(partial ? t.gross : o.gross)}</b></dd>
          <dt>Você paga</dt><dd><b>${brl(partial ? t.net : o.net)}</b></dd></dl>
          ${partial ? `<p class="small" style="margin:0 0 10px">Os outros ${brl(Number(o.gross) - t.gross)} seguem para o próximo fundo da fila.</p>` : ''}
          <span class="small muted">${esc(d.statement)}</span>` });
      if (ok == null) return;
      const r = await run(btn, () => rpc('partner_approve', { p_id: id, p_items: partial ? t.sel.map((i) => i.installment_id) : null }),
        partial ? 'Títulos aprovados e aceite assinado' : 'Operação aprovada e aceite assinado').catch(() => null);
      if (!r) return;
      if (r.payout_mode && r.payout_mode !== 'manual') await run(null, () => runPayout(id), 'Pix enviado ao cedente').catch(() => null);
      afterDecision();
    };
    const decline = async (btn) => {
      const note = await askDecline();
      if (note == null) return;
      const r = await run(btn, () => rpc('partner_decline', { p_id: id, p_note: note }), 'Operação recusada').catch(() => null);
      if (r) afterDecision();
    };
    el.querySelectorAll('#approve, [data-ap]').forEach((b) => (b.onclick = () => approve(b)));
    el.querySelectorAll('#decline, [data-dec]').forEach((b) => (b.onclick = () => decline(b)));
    const pm = el.querySelector('#paymanual');
    if (pm) pm.onclick = () => registerPayment(id, o, c, items, me);
    // Vindo do quadro: já abre a ação da etapa escolhida
    if (act) {
      history.replaceState(null, '', `#/assinar/${id}`);
      setTimeout(() => {
        const t = act === 'aprovar' ? el.querySelector('#approve') : act === 'recusar' ? el.querySelector('#decline') : act === 'pagar' ? el.querySelector('#paymanual') || el.querySelector('#payapi') : act === 'receber' ? el.querySelector('#receive') : null;
        if (t && !t.disabled) t.click();
        else if (act) toast(act === 'aprovar' ? 'Esta operação ainda não pode ser aprovada. Veja o que falta ao lado.' : 'Esta ação não está disponível agora.', true);
      }, 150);
    }
    const pa = el.querySelector('#payapi');
    if (pa) pa.onclick = () => run(pa, () => runPayout(id), 'Pix enviado ao cedente').then(B.reload).catch(() => null);
  }
  /**
   * Pagamento feito pelo banco do fundo: só o comprovante. As duplicatas viram cobranças Pix
   * (QR Code estático na chave do fundo) e os sacados recebem a notificação com o Pix e o PDF.
   */
  function registerPayment(id, o, c, items, me) {
    const box = modal({
      title: 'Registrar pagamento ao cedente',
      subtitle: `Pix ou TED de <b>${brl(o.net)}</b> para ${esc(c.legal_name)}`,
      body: `<form class="stack" id="rp" novalidate>
        <div class="field"><label>Identificação do pagamento</label><input class="input" name="ref" placeholder="Id do Pix (E2E) ou número da TED" autocomplete="off"></div>
        <div class="note-box small">Ao registrar, cada duplicata (${items.length}) vira uma cobrança Pix na chave do fundo, com QR Code e PDF da Lottus, e os sacados recebem a notificação de cessão com o Pix. Os Pix caem na conta do fundo; registre o recebimento aqui.</div>
        <div class="error-box" id="rp-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Registrar pagamento</button>',
    });
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      const btn = ev.currentTarget, err = box.querySelector('#rp-err');
      const ref = box.querySelector('[name=ref]').value.trim();
      if (!ref) { err.hidden = false; err.textContent = 'Informe a identificação do pagamento.'; return; }
      btn.disabled = true;
      try {
        await rpc('partner_register_payment', { p_id: id, p: { reference: ref } });
        closeModal(); toast('Pagamento registrado. Cobranças Pix enviadas aos sacados.'); B.reload();
      } catch (e) {
        err.hidden = false;
        err.innerHTML = String(e.message).includes('pix_key_required')
          ? `Cadastre a chave Pix e a cidade do fundo em <a href="#/config/banco">Configurações → Banco</a>: elas vão nas cobranças Pix.`
          : esc(B.message(e));
        btn.disabled = false;
      }
    };
  }

  /** O fundo confere o Pix na conta e registra o recebimento das duplicatas */
  function markReceived(id, items, open) {
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const box = modal({
      title: 'Registrar recebimento',
      subtitle: 'Marque as duplicatas que os sacados já pagaram.',
      body: `<form class="stack" id="rr" novalidate>
        <div class="list">${open.map((i) => `<label class="list-row check-row" style="padding:10px 0"><input type="checkbox" data-r="${esc(i.installment_id)}" checked>
          <span class="grow"><b>NF-e ${esc(i.nfe_number || '—')}/${esc(i.installment)}</b><span class="small muted" style="display:block">${esc(i.debtor_name || cnpj(i.debtor_cnpj))} · vence ${date(i.due_date)}</span></span>
          <b class="num">${brl(i.amount)}</b></label>`).join('')}</div>
        <div class="field" style="max-width:220px"><label>Recebido em</label><input class="input" type="date" name="day" value="${today}" max="${today}"></div>
        <div class="error-box" id="rr-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Registrar</button>',
    });
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      const btn = ev.currentTarget, err = box.querySelector('#rr-err');
      const sel = [...box.querySelectorAll('[data-r]:checked')].map((x) => x.dataset.r);
      if (!sel.length) { err.hidden = false; err.textContent = 'Marque pelo menos uma duplicata.'; return; }
      btn.disabled = true;
      try {
        const st = await rpc('partner_mark_received', { p_id: id, p_items: sel, p_paid_on: box.querySelector('[name=day]').value || null });
        closeModal(); toast(st === 'liquidado' ? 'Tudo recebido: operação liquidada' : 'Recebimento registrado'); B.reload();
      } catch (e) { err.hidden = false; err.textContent = B.message(e); btn.disabled = false; }
    };
  }

  /** Contrato de cessão (termo assinado pelo cedente) com o registro das assinaturas, em PDF */
  async function contractPdf(d, x, me) {
    const w = window.open('', '_blank');
    if (!w) { toast('Permita janelas deste site para baixar o contrato.', true); return; }
    w.document.write('<p style="font-family:sans-serif;padding:24px">Montando o contrato…</p>');
    const logo = await fetch('img/logo-rosa.png').then((r) => r.blob()).then((b) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); })).catch(() => null);
    const o = d.operation, c = d.company, fund = me.funder || {};
    const sigs = [...(d.assignor_signatures || []).map((s) => ({ who: s.signer_name, role: s.kind === 'anticipation_request' ? 'Pedido da antecipação (cedente)' : 'Cessão das duplicatas (cedente)', at: s.signed_at, hash: s.document_hash })),
      ...(d.my_signature ? [{ who: d.my_signature.signer_name, role: `Aceite da cessão (${fund.legal_name || 'cessionária'})`, at: d.my_signature.signed_at, hash: d.my_signature.document_hash }] : [])];
    const text = d.contract_text ? B.contractHtml(d.contract_text) : '<p class="muted">O texto do termo não está disponível para esta operação.</p>';
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Contrato de cessão · ${esc(c.legal_name)} · ${esc(String(o.id).slice(0, 8))}</title>
      <style>
        @page { size: A4; margin: 16mm 16mm 18mm; }
        body { font-family: Inter, Helvetica, Arial, sans-serif; color: #2b2321; font-size: 10.5px; line-height: 1.55; margin: 0; }
        .top { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2dfd8; padding-bottom: 10px; margin-bottom: 14px; }
        .top img { height: 22px; } .tag { font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #c73053; }
        h1 { font-size: 18px; margin: 0 0 4px; letter-spacing: -.01em; } .muted { color: #6b605a; }
        .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0 16px; }
        .box { background: #f5f2eb; border-radius: 10px; padding: 10px 12px; } .box b { display: block; }
        .contract h3, .contract-title { font-size: 14px; margin: 14px 0 6px; } .contract h4 { font-size: 11.5px; margin: 12px 0 4px; } .contract p { margin: 0 0 8px; text-align: justify; }
        table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; } th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #ece8e1; font-size: 9.5px; }
        th { color: #6b605a; font-weight: 600; background: #f7f5f1; } .num { text-align: right; white-space: nowrap; }
        h2 { font-size: 12.5px; margin: 18px 0 6px; } .sig { page-break-inside: avoid; border: 1px solid #ece8e1; border-radius: 10px; padding: 9px 12px; margin-bottom: 8px; }
        .mono { font-family: 'Courier New', monospace; font-size: 9px; word-break: break-all; } .foot { margin-top: 16px; font-size: 8.5px; color: #6b605a; }
      </style></head><body>
      <div class="top">${logo ? `<img src="${logo}" alt="Lottus">` : '<b style="color:#c73053">Lottus</b>'}<span class="tag">Contrato de cessão de crédito</span></div>
      <h1>Termo de cessão · ${esc(c.legal_name)}</h1>
      <div class="muted">Operação ${esc(String(o.id).slice(0, 8).toUpperCase())} · pedida em ${dateTime(o.created_at)} · valor de face ${brl(o.gross)}</div>
      <div class="parties">
        <div class="box"><span class="muted">Cedente</span><b>${esc(c.legal_name)}</b>CNPJ ${esc(cnpj(c.cnpj))}</div>
        <div class="box"><span class="muted">Cessionária</span><b>${esc(fund.legal_name || '')}</b>CNPJ ${esc(cnpj(fund.cnpj || ''))}</div>
      </div>
      <h2>Duplicatas cedidas</h2>
      <table><thead><tr><th>NF-e</th><th>Sacado</th><th>Vencimento</th><th class="num">Valor</th></tr></thead><tbody>
        ${(d.items || []).map((i) => `<tr><td>${esc(i.nfe_number || '—')}/${esc(i.installment)}</td><td>${esc(i.debtor_name || '')} · ${esc(cnpj(i.debtor_cnpj))}</td><td>${date(i.due_date)}</td><td class="num">${brl(i.amount)}</td></tr>`).join('')}
      </tbody></table>
      ${text}
      <h2>Registro das assinaturas eletrônicas</h2>
      ${sigs.length ? sigs.map((s) => `<div class="sig"><b>${esc(s.role)}</b><div>${esc(s.who || '')} · ${dateTime(s.at)}</div><div class="mono">Código do documento: ${esc(s.hash || '')}</div></div>`).join('') : '<p class="muted">Sem assinaturas registradas.</p>'}
      <div class="foot">Documento assinado eletronicamente na plataforma Lottus, com validade jurídica nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001. A integridade pode ser conferida pelo código de cada assinatura. Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.</div>
      </body></html>`;
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* janela fechada */ } }, 500);
  }
})();
