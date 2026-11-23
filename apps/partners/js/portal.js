/* Lottus Partners — operações do fundo: aprovar, recusar e pagar */
(function () {
  'use strict';
  const B = window.BO;
  const { sb, rpc, esc, brl, pct, date, dateTime, cnpj, toast, run, confirmAction, modal, closeModal } = B;
  const { head, tabs, onTabs, empty } = B.ui;

  const TONE = (t) => (['AAA', 'AA', 'A'].includes(t) ? 'success' : ['BBB', 'BB', 'B'].includes(t) ? 'brand' : ['CCC', 'CC', 'C'].includes(t) ? 'warning' : 'danger');
  B.tierTag = (t) => (t ? `<span class="tag ${TONE(t)}">${esc(t)}</span>` : '');

  /* ===================================================== Lottus Partners */
  const PAYOUT = { processing: ['Pagamento em processamento', 'warning'], done: ['Pago', 'success'], failed: ['Pagamento falhou', 'danger'], pending: ['Aguardando pagamento', 'warning'] };
  const LT = { pending: ['A pagar', 'warning'], processing: ['Enviando', 'warning'], done: ['Pago', 'success'], failed: ['Falhou', 'danger'], informed: ['Pagamento informado', 'warning'], waived: ['Dispensado', ''] };
  const DOCK = { contract: 'Contrato social', power_of_attorney: 'Procuração', revenue: 'Faturamento 12 meses', address: 'Comprovante de endereço', financials: 'Balanço e DRE', other: 'Outro' };
  const gauge = (score, tier) => {
    if (score == null || isNaN(Number(score))) return '';
    const v = Math.max(0, Math.min(1000, Number(score))), f = v / 1000, cx = 60, cy = 58, R = 48;
    const pt = (fr, r) => [cx - r * Math.cos(Math.PI * fr), cy - r * Math.sin(Math.PI * fr)];
    const [ex, ey] = pt(f, R), [nx, ny] = pt(f, 38);
    const tone = TONE(tier), col = { success: '#16794c', brand: '#2563eb', warning: '#b7791f', danger: '#b42318' }[tone] || '#2563eb';
    return `<svg viewBox="0 0 120 68" width="132" height="75" role="img" aria-label="Score ${Math.round(v)} de 1000" style="flex:none">
      <path d="M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}" fill="none" stroke="var(--line)" stroke-width="9" stroke-linecap="round"/>
      ${f > 0.004 ? `<path d="M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round"/>` : ''}
      <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(2)}" y2="${ny.toFixed(2)}" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="4" fill="currentColor"/>
      <text x="${cx - R}" y="67" font-size="7" fill="var(--faint)" text-anchor="middle">0</text><text x="${cx + R}" y="67" font-size="7" fill="var(--faint)" text-anchor="middle">1000</text></svg>`;
  };
  B.gauge = gauge;
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
  /** Texto de contrato com a marcação simples dos modelos ("# ", "## ") */
  B.contractHtml = B.contractHtml || ((text) => `<div class="contract">${String(text || '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
    .map((b) => (b.startsWith('# ') ? `<h3 class="contract-title">${esc(b.slice(2))}</h3>` : b.startsWith('## ') ? `<h4>${esc(b.slice(3))}</h4>`
      : `<p>${esc(b).replace(/\n/g, '<br>')}</p>`)).join('')}</div>`);

  const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const daysTo = (iso) => (iso ? Math.round((new Date(iso + 'T12:00:00') - new Date(todayIso() + 'T12:00:00')) / 86400000) : null);
  const dueText = (iso) => { const n = daysTo(iso); return n == null ? '' : n < 0 ? `vencida há ${-n} dias` : n === 0 ? 'vence hoje' : `em ${n} dias`; };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* Etapas da operação: a mesma régua do app, do Partners e do Admin */
  const STAGES = [
    ['analise', 'Análise', 'Chegou para o fundo e está em análise'],
    ['assinatura', 'Assinatura', 'Aprovada pelo fundo: faltam as assinaturas'],
    ['pagamento', 'Pagamento', 'Aprovada: falta pagar o cedente (Tesouraria)'],
    ['ativo', 'Ativo', 'Paga, a receber dos sacados'],
    ['liquidado', 'Liquidado', 'Tudo recebido'],
    ['reprovado', 'Reprovado', 'Recusada ou cancelada'],
  ];
  B.STAGES = STAGES;
  const STAGE_TONE = { assinatura: 'warning', analise: 'warning', pagamento: 'warning', ativo: 'success', vencido: 'danger', liquidado: '', reprovado: 'danger' };
  const stageTag = (st) => `<span class="tag ${STAGE_TONE[st] || ''}" id="stage-tag">${esc((STAGES.find(([k]) => k === st) || [, st || '—'])[1])}</span>`;
  // Etapas em que o fundo age; as outras mudam sozinhas
  const ACT = { analise: 'Decidir', assinatura: 'Assinaturas', pagamento: 'Pagar' };
const MANUAL_DOC = /^(NO|CC|CE)-[0-9a-f]{8}$/i;
  // A operação fica em Pagamento até o pagamento ao cedente ser registrado (feito pela Tesouraria)

  B.views.assinar = async (el, [rawIn, act], me) => {
    let raw = rawIn;
    const LEGACY = { pending: 'analise', to_pay: 'pagamento', paid: 'ativo', signed: 'pagamento', all: null };
    if (raw && !(raw in LEGACY) && !STAGES.some(([k]) => k === raw)) return partnerDetail(el, raw, me, act);
    if (raw in LEGACY) raw = LEGACY[raw];
    const all = await rpc('partner_operations', { p_tab: 'all' });
    // Operação manual aprovada pelo fundo e esperando as assinaturas fica na aba Assinatura
    // Não existe mais a fase Solicitação: o pedido chega direto na Análise
    all.forEach((o) => {
      if (o.stage === 'vencido') o.stage = 'ativo'; // parcelas vencidas ficam na Cobrança
      if (o.stage === 'solicitacao') o.stage = 'analise';
      if (o.sig && o.sig.ready && !(o.sig.master && o.sig.term) && o.stage === 'analise') o.stage = 'assinatura';
    });
    const count = (k) => all.filter((o) => o.stage === k).length;
    // sem fase na URL: abre na primeira fase em que o fundo precisa agir (ou na que tiver operações)
    const stage = STAGES.some(([k]) => k === raw) ? raw : (STAGES.find(([k]) => ACT[k] && all.some((o) => o.stage === k && o.mine !== false)) || STAGES.find(([k]) => count(k)) || STAGES[0])[0];
    const TABS = STAGES.map(([k, l]) => [k, count(k) ? `${l} (${count(k)})` : l]);
    el.innerHTML = `
      ${head('Operações', 'Do pedido ao recebimento', `<div class="u-g8 row"><button class="btn ghost sm" id="csv">Exportar</button><button class="btn ghost sm" id="newxml">Enviar XML em lote</button>${me.is_admin !== false ? '' : ''}<button class="btn sm" id="newop">Nova operação</button></div>`)}
      <div class="ops-bar">${tabs(TABS, stage)}<input class="input search" id="q" type="search" placeholder="Buscar cedente ou CNPJ" aria-label="Buscar cedente ou CNPJ"></div>
      <div id="stage-list"></div>`;
    const nb = el.querySelector('#newop'); if (nb) nb.onclick = () => B.newOperation((r) => { location.hash = `#/assinar/${r.id}`; });
    const xb = el.querySelector('#newxml'); if (xb) xb.onclick = () => B.batchXml(() => { location.hash = '#/assinar/analise'; B.views.assinar(el, ['analise'], me); });
        onTabs(el, (k) => { location.hash = `#/assinar/${k}`; });
    let shown = [];
    const go = (id, action) => (location.hash = `#/assinar/${id}${action ? `/${action}` : ''}`);
    const paint = () => {
      const q = norm(el.querySelector('#q').value).replace(/[.\-/]/g, '');
      shown = all.filter((o) => o.stage === stage && (!q || norm(o.legal_name).includes(q) || String(o.cnpj || '').includes(q)));
      const pg = B.ui.pager('ops', shown, { unit: shown.length === 1 ? 'operação' : 'operações', sig: stage + '|' + q, cols: [(o) => o.legal_name, (o) => o.start_date || '', (o) => (o.instrument === 'fluxo_futuro' ? '' : o.end_date || ''), (o) => Number(o.gross || 0), (o) => (o.net == null ? null : Number(o.net))], sum: shown.reduce((t, o) => t + Number(o.gross || 0), 0) });
      el.querySelector('#stage-list').innerHTML = shown.length ? `
        <div class="card"><table><thead><tr><th>Cedente</th><th>Início</th><th>Término</th><th class="num">Valor</th><th class="num">Líquido</th><th></th></tr></thead><tbody>
        ${pg.rows.map((o) => `<tr class="${o.mine === false ? 'ghost' : 'row-link'}" ${o.mine === false ? '' : `data-id="${esc(o.id)}" tabindex="0"`}>
          <td><b>${esc(o.legal_name)}</b> ${tierTagP(o.tier)}${o.instrument ? `<div class="small muted">${({ cessao: 'Cessão', nota_comercial: 'Nota comercial', ccb: 'CCB', confissao_divida: 'Confissão de dívida', fluxo_futuro: 'Fluxo futuro' })[o.instrument] || ''}</div>` : ''}</td>
          <td>${o.start_date ? date(o.start_date) : '—'}</td><td>${o.end_date && o.instrument !== 'fluxo_futuro' && o.end_date < '2099' ? date(o.end_date) : '—'}</td>
          <td class="num"><b>${brl(o.gross)}</b></td>
          <td class="num">${o.net != null ? brl(o.net) : '—'}</td>
          <td class="num">${o.mine === false ? '' : '<span class="kc-go">Abrir ›</span>'}</td></tr>`).join('')}
        </tbody></table>${pg.bar}</div>` : `<div class="card">${empty(all.some((o) => o.stage === stage) ? 'Nada encontrado para essa busca.' : stage === 'assinatura' ? 'Nenhuma operação aguardando assinatura.' : 'Nenhuma operação nesta fase.')}</div>`;
      B.ui.pagerBind(el, 'ops', paint);
      el.querySelectorAll('tr[data-id]').forEach((r) => { r.onclick = () => go(r.dataset.id); r.onkeydown = (e) => { if (e.key === 'Enter') go(r.dataset.id); }; });
    };
    el.querySelector('#q').oninput = paint;
    el.querySelector('#csv').onclick = () => B.operationsCsv(all.filter((o) => o.mine !== false).map((o) => ({ ...o, _state: (STAGES.find(([k]) => k === o.stage) || [, o.stage])[1] })), `operacoes-${todayIso()}.csv`);
    paint();
  };

  /** Recusa com motivos rápidos */
  const REASONS = ['Cedente fora da política', 'Sem limite disponível', 'Prazo acima do aceito', 'Documentação insuficiente'];
  function askDecline() {
    return new Promise((resolve) => {
      const box = modal({
        title: 'Recusar a operação',
        subtitle: 'A operação vai para Reprovado e as notas voltam para o cedente.',
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

  /** Anexa PDFs em lote. O nome do arquivo diz a operação: "CÓDIGO - tipo - título.pdf" (tipo: nota, aditivo, retificacao ou outro). Ex.: "PADRAO-03 - aditivo - 1º Aditivo.pdf" */
  async function notePdfBatch() {
    const box = modal({ title: 'Anexar PDFs de notas', subtitle: 'O nome de cada arquivo identifica a operação: CÓDIGO - tipo - título.pdf',
      body: `<div class="stack"><div class="field"><label for="np-f">Arquivos PDF (até 5 MB cada)</label><input class="input" id="np-f" type="file" accept="application/pdf,.pdf" multiple></div>
        <p class="small muted u-m0">Tipo: nota (documento original), aditivo, retificacao ou outro. Exemplo: <b>SCHON-01 - aditivo - Primeiro Aditivo.pdf</b>. Arquivos que já foram anexados são ignorados.</p>
        <div id="np-log" class="small" style="max-height:220px;overflow:auto"></div></div>`,
      foot: '<button class="btn secondary" data-act="cancel">Fechar</button><button class="btn" data-act="ok">Anexar</button>' });
    const log = box.querySelector('#np-log'), add = (t, ok) => { log.insertAdjacentHTML('beforeend', `<div class="${ok ? 'u-success' : 'u-danger'}">${esc(t)}</div>`); };
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      const files = [...box.querySelector('#np-f').files]; if (!files.length) return add('Escolha os arquivos.', false);
      const btn = ev.currentTarget; btn.disabled = true; log.innerHTML = '';
      try {
        const [me2, ops] = await Promise.all([rpc('partner_me'), rpc('partner_note_ops')]);
        const byCode = Object.fromEntries(ops.map((o) => [String(o.code).toUpperCase(), o]));
        let n = 0;
        for (const f of files) {
          const m = f.name.replace(/\.pdf$/i, '').split(/\s+-\s+/);
          const code = (m[0] || '').trim().toUpperCase(), kind = (m[1] || '').trim().toLowerCase(), title = m.slice(2).join(' - ').trim() || f.name.replace(/\.pdf$/i, '');
          const op = byCode[code];
          if (!op) { add(`${f.name}: operação "${code}" não encontrada`, false); continue; }
          if (!['nota', 'aditivo', 'retificacao', 'outro'].includes(kind)) { add(`${f.name}: tipo "${kind}" inválido`, false); continue; }
          if (f.size > 5 * 1024 * 1024) { add(`${f.name}: passa de 5 MB`, false); continue; }
          if ((op.files || []).some((x) => x.title === title && x.kind === kind)) { add(`${f.name}: já anexado`, true); continue; }
          const path = `${me2.funder.id}/operacao/${op.operation_id}/${Date.now()}-${n++}.pdf`;
          const up = await B.sb.storage.from('boletos').upload(path, f, { contentType: 'application/pdf', upsert: false });
          if (up.error) { add(`${f.name}: ${up.error.message}`, false); continue; }
          try { await rpc('partner_op_file_add', { p_op: op.operation_id, p: { kind, title, path, name: f.name, size: f.size } }); add(`${f.name}: anexado a ${code}`, true); op.files = (op.files || []).concat([{ title, kind }]); }
          catch (e) { add(`${f.name}: ${B.message(e)}`, false); }
        }
        toast('Concluído');
      } catch (e) { add(B.message(e), false); }
      btn.disabled = false;
    };
  }

  async function partnerDetail(el, id, me, act) {
    const [d, x, queue] = await Promise.all([
      rpc('partner_operation', { p_id: id }), rpc('partner_operation_details', { p_id: id }),
      rpc('partner_operations', { p_tab: 'pending' }).catch(() => []),
    ]);
    const note = await rpc('partner_operation_note', { p_id: id }).catch(() => null);
    const o = d.operation, c = d.company, a = x.assignor || {}, bh = a.behavior || {};
    const ff = o.instrument === 'fluxo_futuro' ? await rpc('partner_ff_status', { p_op: id }).catch(() => null) : null;
    // Confere a chave de acesso da NF-e (44 dígitos, dígito verificador módulo 11)
    const keyOk = (k) => {
      const d = String(k || '').replace(/\D/g, ''); if (d.length !== 44) return false;
      let w = 2, sum = 0; for (let n = 42; n >= 0; n--) { sum += Number(d[n]) * w; w = w === 9 ? 2 : w + 1; }
      const r = sum % 11; return Number(d[43]) === (r < 2 ? 0 : 11 - r);
    };
    const keyTag = (i) => (!i.nfe_key || loanDoc(i) ? '' : keyOk(i.nfe_key) ? ' · <span title="Dígito verificador da chave de acesso conferido" class="u-success">chave da NF-e válida</span>' : ' · <b title="A chave de acesso não passa na conferência do dígito verificador" class="u-danger">chave da NF-e inválida</b>');
    const loanDoc = (i) => MANUAL_DOC.test(String(i.nfe_number || ''));
    const nfLabel = (i) => (loanDoc(i) ? (d.items.length > 1 ? `Parcela ${esc(i.installment)}` : 'Título') : `NF-e ${esc(i.nfe_number || '—')}/${esc(i.installment)}`);
    // Abrir a operação que chegou = começar a análise
    if (o.stage === 'solicitacao' && d.can_sign) rpc('partner_start_analysis', { p_id: id }).then((st) => { o.stage = st; const t = el.querySelector('#stage-tag'); if (t) t.outerHTML = stageTag(st); }).catch(() => null);
    if (o.stage === 'vencido') o.stage = 'ativo';
    if (o.stage === 'solicitacao') o.stage = 'analise';
    if (o.stage === 'analise' && !o.declined_at) {
      // Operação manual com os documentos já enviados: a etapa é Assinatura (o servidor ainda a mostra como Análise)
      const pr = await rpc('partner_op_prepare', { p_op: id }).catch(() => null);
      if (pr && pr.manual && pr.docs && pr.docs.ready) o.stage = 'assinatura';
    }
    const isPending = !o.signed_at && !o.declined_at && ['requested', 'in_review'].includes(x.status || o.status);
    const canApprove = d.can_sign && isPending;
    const missing = (x.checks || []).filter((k) => k.required && !k.ok && k.key !== 'funder_acceptance');
    const pay = x.payout ? PAYOUT[x.payout.status] : null;
    const pc = (v) => (v == null ? '—' : `${Math.round(Number(v) * 100)}%`);
    const xmls = (x.invoices || []).filter((i) => i.xml_path);
    const debtors = x.debtors || [];
    const byCnpj = Object.fromEntries(debtors.map((s) => [s.cnpj, s]));
    const items = d.items.map((i, n) => ({ ...i, n, net: Number(i.amount) - Number(i.discount || 0) - Number(i.iof || 0) }));
    const groups = [];
    items.forEach((i) => { let g = groups.find((x) => x.cnpj === i.debtor_cnpj); if (!g) groups.push(g = { cnpj: i.debtor_cnpj, name: i.debtor_name, items: [] }); g.items.push(i); });
    const pos = queue.findIndex((q) => q.id === id);
    const prev = pos > 0 ? queue[pos - 1].id : null, next = pos >= 0 && pos < queue.length - 1 ? queue[pos + 1].id : null;
    const afterDecision = () => { const n = queue.filter((q) => q.id !== id)[0]; location.hash = n ? `#/assinar/${n.id}` : '#/assinar'; };
    const status = o.declined_at ? '<span class="tag danger" id="stage-tag">Recusada por você</span>' : stageTag(o.stage);
    const openItems = items.filter((i) => !i.charge || i.charge.status === 'open');
    const xmlOf = (i) => (x.invoices || []).find((v) => v.xml_path && (v.access_key === i.nfe_key || String(v.number) === String(i.nfe_number)));
    const selectable = canApprove && items.length > 1;
    const REASON_TXT = { settlement: 'quitada pelo cedente', repasse: 'repassada pelo cedente', cedente: 'paga pelo cedente', buyback: 'recomprada pelo cedente' };
    const itemState = (i) => {
      const ch = i.charge || {}, bb = i.buyback;
      const rem = '';
      if (ch.status === 'paid' || ch.status === 'cancelled') return `<span class="u-success">${esc(REASON_TXT[ch.closed_reason] || 'recebida')} ${date(ch.paid_at || (bb && bb.paid_at))}</span>`;
      if (bb && bb.status === 'open') return `<span class="u-danger">recompra até ${date(bb.deadline)}</span>${rem}`;
      return dueText(i.due_date);
    };

    /* Etapas da operação: fluxo fixo, cada etapa abre para mostrar o que fazer ou o que aconteceu */
    const IDX = { analise: 0, assinatura: 1, pagamento: 2, ativo: 3, vencido: 3, liquidado: 4 };
    const cur = IDX[o.stage] ?? 0;
    const isManual = items.length > 0 && items.every(loanDoc);
    const canBaixa = me.can_sign !== false;
    const payInner = `            ${pay ? `<div><span class="tag ${pay[1]}">${esc(pay[0])}</span></div>` : ''}
            ${x.payout && x.payout.error ? `<div class="u-danger small">${esc(x.payout.error)}</div>` : ''}
            ${x.payout && x.payout.receipt_url ? `<a class="small" href="${esc(B.safeUrl(x.payout.receipt_url))}" target="_blank" rel="noopener">Ver comprovante</a>` : ''}
            ${x.status === 'approved' ? `${x.bank ? `<dl class="lines small">
                <dt>Valor</dt><dd><b>${brl(o.net)}</b></dd>
                <dt>Banco</dt><dd>${esc(x.bank.bank_code)} ${esc(x.bank.bank_name || '')}</dd>
                <dt>Agência · conta</dt><dd>${esc(x.bank.branch)} · ${esc(x.bank.account)}</dd>
                <dt>Titular</dt><dd>${esc(cnpj(x.bank.holder_document))}</dd></dl>` : '<p class="small muted">Cedente sem conta bancária cadastrada na operação. Pague pelo banco e registre o pagamento abaixo.</p>'}
              ${me.trio_ready ? `<p class="u-m0 small muted">Pix pela conta do fundo, para a chave CNPJ do cedente.</p>
                ${me.can_sign !== false && (!x.payout || x.payout.status === 'failed') ? '<button class="btn block" id="payapi">Tentar o Pix de novo</button>' : ''}`
              : `<div id="payout-pix"></div>
                ${me.can_sign !== false ? '<button class="btn block" id="paymanual">Registrar pagamento</button>' : ''}`}` : ''}
            ${x.status === 'paid' && me.can_sign !== false ? '<button class="btn secondary sm" id="payundo">Estornar pagamento</button>' : ''}
            ${x.lottus_transfer ? `<div class="stack-sm" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
              <div class="row between"><b>Parte da Lottus</b> <span class="tag ${LT[x.lottus_transfer.status]?.[1] || ''}">${esc(LT[x.lottus_transfer.status]?.[0] || x.lottus_transfer.status)}</span></div>
              <dl class="lines small"><dt>Valor</dt><dd><b>${brl(x.lottus_transfer.amount)}</b></dd></dl>
              ${x.lottus_transfer.error && x.lottus_transfer.status === 'failed' ? `<div class="u-danger small">${esc(x.lottus_transfer.error)}</div>` : ''}
              ${x.lottus_transfer.receipt_url ? `<a class="small" href="${esc(B.safeUrl(x.lottus_transfer.receipt_url))}" target="_blank" rel="noopener">Ver comprovante</a>` : ''}
              ${me.trio_required
                ? '<p class="u-m0 small muted">Sai da conta do fundo logo depois do Pix ao cedente. Se falhar, tentamos de novo sozinhos.</p>'
                : ['pending', 'failed'].includes(x.lottus_transfer.status) ? `<div id="lottus-pix"></div>${me.can_sign !== false ? '<button class="btn secondary block" id="paylottus">Registrar pagamento à Lottus</button>' : ''}` : ''}
            </div>` : ''}
`;
    const approveHtml = canApprove ? `<div id="manual-box" class="manual-box" hidden></div>
      ${isPending && missing.length ? `<div class="note-box small" id="miss-note">Para aprovar falta: ${esc(missing.map((m) => m.label).join(', '))}.</div>` : ''}
      <div class="u-m0b10 field" id="series-box" hidden><label for="series-sel">Série (lastro)</label><select class="input" id="series-sel"></select><div class="help" id="series-help"></div></div>
      <div class="rail-actions" id="acts"><p class="small" id="limit-note" hidden style="margin:0 0 8px;color:var(--danger)"></p><button class="btn block" id="approve" ${missing.length ? 'disabled' : ''}>Aprovar</button>
        <button class="btn danger block" id="decline">Recusar</button></div>` : '<p class="u-m0 small muted">Decisão registrada.</p>';
    const recvRows = items.map((i) => { const ch = i.charge || {}, open = !ch.status || ch.status === 'open';
      return `<div class="row between rv-row" style="gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--line)"><div><b>${nfLabel(i)}</b><div class="small muted">${date(i.due_date)} · ${itemState(i)}</div></div>
        <div class="u-g8c row"><b>${brl(i.amount)}</b>${open && canBaixa && ['ativo', 'vencido'].includes(o.stage) ? `<button class="btn ghost sm" data-baixa="${esc(i.installment_id)}">Dar baixa</button>` : ''}</div></div>`; }).join('');
    const doneN = items.length - openItems.length;
    const STEPS = [
      { t: 'Análise', sum: cur === 0 ? 'Aguardando a decisão do fundo' : 'Aprovada pelo fundo', body: cur === 0 ? approveHtml : '<p class="u-m0 small muted">Aprovada pelo fundo.</p>', boxHost: cur === 0 },
      { t: 'Assinatura', sum: cur < 1 ? 'Depois da aprovação' : cur === 1 ? 'Aguardando assinaturas' : isManual ? 'Documentos assinados' : 'Assinado pelo cedente no app',
        body: cur === 1 ? '<div id="manual-box" class="manual-box" hidden></div>' : cur > 1 ? (isManual ? '<div id="sig-done"></div>' : '<p class="u-m0 small muted">O cedente assinou o contrato e o termo no app.</p>') : '<p class="u-m0 small muted">Quando o fundo aprova, os documentos seguem para assinatura. Com todas as assinaturas, a operação vai sozinha para Pagamento.</p>' },
      { t: 'Pagamento ao cedente', sum: cur < 2 ? 'Depois das assinaturas' : cur === 2 ? `A pagar · ${brl(o.net)}` : x.payout && x.payout.status === 'done' ? 'Pago' : 'Pago ao cedente',
        body: cur >= 2 ? (payInner.trim() ? `<div class="stack-sm">${payInner}</div>` : '<p class="u-m0 small muted">Pagamento registrado.</p>') : '<p class="u-m0 small muted">Aprovada e assinada, o valor líquido é pago ao cedente pela Tesouraria.</p>' },
      { t: 'Recebimento', sum: cur < 3 ? 'Depois do pagamento' : cur === 3 ? `${doneN} de ${items.length} ${items.length === 1 ? 'duplicata recebida' : 'duplicatas recebidas'}` : 'Tudo recebido',
        body: ff ? '<p class="u-m0 small muted">Os recebimentos do fluxo futuro são registrados no cartão “Fluxo futuro”, pelo extrato do banco.</p>' : cur >= 3 ? `<div class="meter" aria-hidden="true"><span style="width:${Math.round(100 * doneN / Math.max(items.length, 1))}%"></span></div>${recvRows}
          ${cur === 3 && openItems.length > 1 && canBaixa ? '<button class="u-mt10 btn secondary sm" id="baixa-all">Dar baixa em todas</button>' : ''}
          ${cur === 3 ? '<p class="u-m10t small muted">A baixa é automática quando o Pix é identificado na conta. Use “Dar baixa” se recebeu por outro caminho.</p>' : ''}` : '<p class="u-m0 small muted">Depois do pagamento, cada duplicata é recebida do sacado e baixada aqui.</p>' },
      { t: 'Liquidada', sum: cur === 4 ? `Encerrada${o.settled_at ? ' em ' + date(o.settled_at) : ''}` : 'Quando tudo for recebido', body: cur === 4 ? '<p class="u-m0 small muted">Todas as duplicatas foram recebidas.</p>' : '<p class="u-m0 small muted">A operação é encerrada quando todas as duplicatas forem recebidas.</p>' },
    ];
    /* Nota comercial: condições, liberação em tranches (parcelamento do pagamento), cronograma e resgates */
    const noteHtml = !note ? '' : (() => {
      const t = note.terms || {}, trs = note.tranches || [], sch = note.schedule || [], rds = note.redemptions || [];
      const paidSum = trs.filter((r) => r.status === 'paid').reduce((n, r) => n + Number(r.amount), 0);
      const TS = { paid: ['Paga', 'success'], pending: ['A pagar', 'warning'], cancelled: ['Cancelada', ''] };
      const SS = { paid: ['Paga', 'success'], pending: ['A pagar', ''] };
      const terms = [['Código', t.code], ['Nº da nota', t.nc_number], ['Emissão', t.issue_date && date(t.issue_date)], ['Vencimento', t.maturity_date && date(t.maturity_date)],
        ['Prazo', t.term_months && `${t.term_months} meses`], ['Taxa', t.monthly_rate != null && `${pct(t.monthly_rate)} a.m.`], ['Pagamento de juros', t.interest_freq],
        ['Amortização', t.amortization], ['Correção', t.indexer], ['Garantias', t.guarantees], ['Conta de pagamento', t.payment_account]].filter(([, v]) => v);
      const trRows = trs.map((r) => `<tr><td>${esc(r.seq)}ª</td><td>${date(r.release_date)}</td><td class="num"><b>${brl(r.amount)}</b></td><td><span class="tag ${(TS[r.status] || [])[1] || ''}">${esc((TS[r.status] || [r.status])[0])}</span>${r.paid_at ? ` <span class="small muted">${date(r.paid_at)}</span>` : ''}</td>
        <td class="num">${note.can_edit && r.status === 'pending' ? `<button class="btn secondary sm" data-tpay="${esc(r.id)}">Marcar como paga</button>` : ''}</td></tr>`).join('');
      const schRows = sch.map((r) => `<tr><td>${esc(r.seq)}</td>${sch.some((q) => q.tranche_seq) ? `<td>${r.tranche_seq ? `${esc(r.tranche_seq)}ª` : '—'}</td>` : ''}<td>${date(r.due_date)}</td><td class="num">${brl(r.opening)}</td><td class="num">${brl(r.interest)}</td><td class="num">${Number(r.installment) ? `<b>${brl(r.installment)}</b>` : '—'}</td><td class="num">${brl(r.closing)}</td>
        <td>${r.status === 'accrual' ? '<span class="small muted">provisão</span>' : `<span class="tag ${(SS[r.status] || [])[1] || ''}">${esc((SS[r.status] || [r.status])[0])}</span>`}</td></tr>`).join('');
      const rdRows = rds.map((r) => `<tr><td>${date(r.date)}</td><td>${esc(r.investor)}</td><td class="num">${brl(r.principal)}</td><td class="num">${brl(r.interest)}</td><td class="num">${brl(r.ir)}</td><td class="num"><b>${brl(r.net)}</b></td></tr>`).join('');
      return '';
    })();
    const ffHtml = !ff ? '' : `<div class="card" id="ff-card"><div class="card-head"><h2>Fluxo futuro</h2>${ff.can_receive ? '<button class="btn sm" id="ff-recv">Registrar recebimento</button>' : ''}</div>
      <dl class="kv"><dt>Valor inicial</dt><dd>${brl(ff.initial)}</dd><dt>Taxa</dt><dd>${ff.rate_kind === 'pos' ? `${ff.rate_index === 'ipca' ? 'IPCA' : 'CDI'} + ${pct(ff.rate)} a.m. · pós-fixada` : `${pct(ff.rate)} a.m. · pré-fixada`} · juros compostos por dia</dd><dt>Início</dt><dd>${date(ff.start_date)}</dd>
        <dt>Principal em aberto</dt><dd>${brl(ff.principal)}</dd><dt>Juros acumulados</dt><dd>${brl(ff.interest)}</dd><dt>Saldo atualizado em ${date(ff.as_of)}</dt><dd><b>${brl(ff.balance)}</b></dd></dl>
      ${ff.payments.length ? `<table class="mini"><thead><tr><th>Recebido em</th><th class="num">Valor</th><th class="num">Juros</th><th class="num">Principal</th></tr></thead><tbody>${ff.payments.map((q) => `<tr><td>${date(q.date)}</td><td class="num"><b>${brl(q.amount)}</b></td><td class="num">${brl(q.interest)}</td><td class="num">${brl(q.principal)}</td></tr>`).join('')}</tbody></table>` : ''}</div>`;
    const stepHtml = (n, st) => { const state = n < cur || cur === 4 ? 'done' : n === cur ? 'cur' : 'todo';
      return `<div class="step ${state}"><button type="button" class="step-h" data-step aria-expanded="false"><span class="step-ico" aria-hidden="true">${state === 'done' ? '✓' : n + 1}</span><span class="grow"><b>${st.t}</b><small>${st.sum}</small></span><span class="step-caret" aria-hidden="true">▾</span></button><div class="step-b">${st.body}</div></div>`; };
    const editOpen = items.filter((i) => !i.charge || !i.charge.status || i.charge.status === 'open');
    const canCond = !!(note && note.can_edit), canParc = canBaixa && ['ativo', 'vencido'].includes(o.stage) && editOpen.length > 0;
    const editMenuHtml = canCond || canParc ? '<button type="button" class="btn secondary sm" id="op-edit">Editar</button>' : '';
    el.innerHTML = `
      <div class="page-head"><div><a class="back" href="#/assinar">‹ Operações</a>
        <h1>${esc(c.legal_name)} ${tierTagP(a.tier)}</h1><div class="page-sub">${esc(cnpj(c.cnpj))} · pedida ${B.ago ? B.ago(o.created_at) : dateTime(o.created_at)}${o.parent_id ? ' · parte de outro pedido' : ''}</div></div>
        <div style="display:flex;gap:12px;align-items:center">${editMenuHtml}${pos >= 0 && queue.length > 1 ? `<div class="pager"><span class="small muted">${pos + 1} de ${queue.length}</span>
          <a class="btn ghost sm ${prev ? '' : 'disabled'}" ${prev ? `href="#/assinar/${esc(prev)}"` : 'aria-disabled="true"'} aria-label="Anterior">‹</a>
          <a class="btn ghost sm ${next ? '' : 'disabled'}" ${next ? `href="#/assinar/${esc(next)}"` : 'aria-disabled="true"'} aria-label="Próxima">›</a></div>` : ''}</div></div>
      <div class="detail">
        <aside class="rail"><div class="card rail-card">
          ${status}
          <div class="rail-amount" id="sel-gross">${brl(o.gross)}</div><div class="rail-amount-label" id="sel-label">${note && !items.length ? `Nota comercial · ${(note.tranches || []).length} ${(note.tranches || []).length === 1 ? 'tranche' : 'tranches'}` : items.length === 1 ? '1 título' : `${items.length} títulos`}</div>
          <dl class="lines">
            <dt>Você paga</dt><dd><b id="sel-net">${brl(o.net)}</b></dd>
            ${x.lottus_amount != null && Number(x.lottus_amount) > 0 ? `<dt title="Remuneração da Lottus nesta operação (spread e tarifa), paga junto com o Pix ao cedente">Parte da Lottus</dt><dd id="sel-lottus">${brl(x.lottus_amount)}</dd>` : ''}
            <dt>Taxa</dt><dd>${pct(o.monthly_rate)} a.m.</dd>
            ${o.start_date ? `<dt>Início</dt><dd>${date(o.start_date)}</dd>` : ''}${o.end_date && o.end_date < '2099' ? `<dt>Término</dt><dd>${date(o.end_date)}</dd>` : ''}
          </dl>
          ${o.stage === 'reprovado' ? (o.decline_note ? `<div class="note-box">${esc(o.decline_note)}</div>` : '') : `<div class="steps">${STEPS.map((st, n) => stepHtml(n, st)).join('')}</div>`}
        </div></aside>
        <div class="stack">
          ${ffHtml}
          ${noteHtml}
          ${ff || (note && !items.length) ? '' : `<div class="card titles">
            <div class="card-head"><h2>Títulos</h2>${selectable ? '<label class="small check-all"><input type="checkbox" id="all" checked> Todos</label>' : ''}</div>
            ${groups.map((g) => { const s = byCnpj[g.cnpj] || {}; return `<div class="t-group">
              ${g.cnpj === c.cnpj ? '' : `<div class="t-head"><b>${esc(s.name || g.name || cnpj(g.cnpj))}</b> <span class="tag ${debtorTone(s.rating)}">${esc(s.rating || '—')}</span>${s.blocked ? ' <span class="tag danger">Bloqueado</span>' : ''}
                <span class="small muted">${s.paid_history && s.paid_history.count ? `${esc(s.paid_history.count)} pagas, ${esc(s.paid_history.late)} com atraso` : 'sem histórico'}${Number(s.exposure_funder) ? ` · ${brl(s.exposure_funder)} já com você` : ''}</span></div>`}
              ${g.items.map((i) => `<label class="t-row ${selectable ? 'sel' : ''}">
                ${selectable ? `<input type="checkbox" data-it="${i.n}" checked aria-label="Escolher ${nfLabel(i)}">` : ''}
                <span class="grow">${xmlOf(i) ? `<button type="button" class="nf-link" data-nfxml="${i.n}" title="Baixar o XML da NF-e">${nfLabel(i)}</button>` : `<b>${nfLabel(i)}</b>`}<span class="small muted">${date(i.due_date)} · ${itemState(i)}${keyTag(i)}${i.charge && i.charge.pdf_url ? ` · <a href="${esc(B.safeUrl(i.charge.pdf_url))}" target="_blank" rel="noopener" data-stop>cobrança Pix</a>` : ''}</span></span>
                <span class="num"><b>${brl(i.amount)}</b></span></label>`).join('')}
            </div>`; }).join('')}
          </div>`}

          <div id="op-docs" hidden ${note && note.can_edit ? 'data-always="1"' : ''}></div>
          <div id="op-amend"></div>

          <div class="card cedente-card"><div class="u-top-wrap row between">
              <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><div><h2>Cedente</h2><div class="u-mt4 small muted">${esc(bh.ops_total || 0)} operações${bh.on_time_ratio != null ? ` · ${pc(bh.on_time_ratio)} em dia` : ''}${Number(bh.overdue_open) ? ` · <span class="u-danger">${brl(bh.overdue_open)} em atraso</span>` : ''}</div></div>
                ${a.score != null || a.tier ? `<div style="display:flex;gap:12px;align-items:center;margin-left:auto">${gauge(a.score, a.tier)}<div><div class="small muted">Score de crédito</div><div style="font-size:28px;font-weight:700;line-height:1.1">${a.score != null ? Math.round(a.score) : '—'}</div><div style="margin-top:4px">${a.tier ? `<span class="small muted">Tier</span> ${tierTagP(a.tier)}` : '<span class="small muted">Sem nota</span>'}</div></div></div>` : '<span class="small muted" style="margin-left:auto">Sem nota</span>'}</div>
            </div>
            ${(x.documents || []).length || xmls.length ? `<div class="row" style="flex-wrap:wrap;gap:6px;justify-content:flex-start;margin-top:12px">
              ${(x.documents || []).map((f, i) => `<button class="btn secondary sm" data-doc="${i}">${esc(DOCK[f.kind] || f.kind)}</button>`).join('')}
              ${xmls.map((i, n) => `<button class="btn ghost sm" data-xml="${n}">XML ${esc(i.number || '—')}</button>`).join('')}</div>` : ''}
            <div id="ced-docs" class="u-mt14"></div>
            <div id="ced-pdf" hidden class="u-mt14"><button class="btn secondary sm" type="button" id="contract-pdf">Contrato de cessão</button></div>
          </div>
        </div>
      </div>
      ${canApprove ? `<div class="decision-bar"><button class="btn danger" data-dec>Recusar</button><button class="btn" data-ap ${missing.length ? 'disabled' : ''}>Aprovar</button></div>` : ''}`;

    el.querySelectorAll('[data-step]').forEach((b) => (b.onclick = () => { const st = b.closest('.step'); const on = st.classList.toggle('open'); b.setAttribute('aria-expanded', on); }));
    const fb = el.querySelector('#ff-recv'); if (fb) fb.onclick = () => B.ffReceive(ff, B.reload);
    el.querySelectorAll('[data-tpay]').forEach((b) => (b.onclick = async () => {
      const r = (note.tranches || []).find((q) => String(q.id) === b.dataset.tpay); if (!r) return;
      const ok = await confirmAction({ title: 'Marcar tranche como paga', text: `Liberação de <b>${brl(r.amount)}</b> prevista para ${date(r.release_date)}. Registra o pagamento com a data de hoje.`, confirmLabel: 'Marcar como paga' });
      if (ok == null || ok === false) return;
      run(b, () => rpc('partner_op_tranche_pay', { p_id: r.id, p_date: null }), 'Tranche registrada como paga').then(B.reload).catch(() => null);
    }));
    const wireTr = () => { const te = el.querySelector('#tr-edit'); if (!te) return; te.onclick = () => {
      const pend = (note.tranches || []).filter((r) => r.status === 'pending');
      const paid = (note.tranches || []).filter((r) => r.status === 'paid').reduce((n, r) => n + Number(r.amount), 0);
      const remain = Math.round((Number(note.net) - paid) * 100) / 100;
      const rowHtml = (r) => `<div class="row tr-line" style="gap:8px;margin-bottom:8px"><input class="input" type="date" data-d value="${esc(r.release_date || '')}" aria-label="Data"><input class="input" data-v inputmode="decimal" aria-label="Valor" value="${esc(r.amount != null ? B.mask.fmtMoney(Number(r.amount), 2, 2) : '')}"><button type="button" class="btn ghost sm" data-rm aria-label="Remover">✕</button></div>`;
      const box = modal({ title: 'Editar liberações', subtitle: `Parcelamento do pagamento da nota. Falta distribuir ${brl(remain)} (as já pagas ficam).`,
        body: `<div class="stack"><div id="tr-lines">${(pend.length ? pend : [{}]).map(rowHtml).join('')}</div><div class="row between"><button type="button" class="btn secondary sm" id="tr-add">+ Tranche</button><span class="small" id="tr-sum"></span></div><div class="error-box" id="tr-err" hidden></div></div>`,
        foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar</button>' });
      const lines = box.querySelector('#tr-lines');
      const bind = () => lines.querySelectorAll('[data-v]').forEach((i) => { if (!i._m) { i._m = 1; B.mask.money(i, 2); i.addEventListener('input', sum); } });
      const vals = () => [...lines.querySelectorAll('.tr-line')].map((l) => ({ release_date: l.querySelector('[data-d]').value, amount: B.mask.parse(l.querySelector('[data-v]').value) || 0 }));
      const sum = () => { const t = vals().reduce((n, v) => n + v.amount, 0); const diff = Math.round((remain - t) * 100) / 100; box.querySelector('#tr-sum').innerHTML = diff === 0 ? '<span class="u-success">Soma confere</span>' : `<span class="u-danger">${diff > 0 ? 'Falta' : 'Passou'} ${brl(Math.abs(diff))}</span>`; };
      const rm = () => lines.querySelectorAll('[data-rm]').forEach((x) => (x.onclick = () => { if (lines.children.length > 1) { x.closest('.tr-line').remove(); sum(); } }));
      bind(); rm(); sum();
      box.querySelector('#tr-add').onclick = () => { lines.insertAdjacentHTML('beforeend', rowHtml({})); bind(); rm(); sum(); };
      box.querySelector('[data-act=cancel]').onclick = () => closeModal();
      box.querySelector('[data-act=ok]').onclick = (ev) => {
        const v = vals(), er = box.querySelector('#tr-err');
        if (v.some((q) => !q.release_date || q.amount <= 0)) { er.hidden = false; er.textContent = 'Informe data e valor em todas as tranches.'; return; }
        if (Math.abs(v.reduce((n, q) => n + q.amount, 0) - remain) > 0.01) { er.hidden = false; er.textContent = `A soma precisa ser ${brl(remain)}.`; return; }
        run(ev.currentTarget, () => rpc('partner_op_tranches_set', { p_op: id, p_tranches: v }), 'Liberações salvas').then(() => { closeModal(); B.reload(); }).catch(() => null);
      };
    }; };
    const baixaOf = (list) => list.map((i) => ({ installment_id: i.installment_id, operation_id: id, sacado: i.debtor_name, cedente: c.legal_name, parcela: i.installment, due_date: i.due_date, amount: i.amount }));
    el.querySelectorAll('[data-baixa]').forEach((b) => (b.onclick = () => B.baixaParcelas(baixaOf(items.filter((i) => i.installment_id === b.dataset.baixa)), B.reload)));
    const ba = el.querySelector('#baixa-all'); if (ba) ba.onclick = () => B.baixaParcelas(baixaOf(openItems), B.reload);
    const sd = el.querySelector('#sig-done'); if (sd && B.docsBox) B.docsBox(sd, id, () => null);
    el.querySelectorAll('[data-doc]').forEach((b) => (b.onclick = () => B.openFile('company-docs', x.documents[b.dataset.doc].path)));
    el.querySelectorAll('[data-xml]').forEach((b) => (b.onclick = () => B.downloadFile('invoices', xmls[b.dataset.xml].xml_path, `NF-e ${xmls[b.dataset.xml].number || ''}.xml`)));
    el.querySelectorAll('[data-nfxml]').forEach((b) => (b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const it = items[b.dataset.nfxml], v = xmlOf(it);
      if (v) B.downloadFile('invoices', v.xml_path, `NF-e ${it.nfe_number || ''}.xml`);
    }));
    const cd = el.querySelector('#ced-docs');
    const od = el.querySelector('#op-docs'); if (od) od.dataset.summary = `${({ cessao: 'Cessão', nota_comercial: 'Nota comercial', ccb: 'CCB', confissao_divida: 'Confissão de dívida', fluxo_futuro: 'Fluxo futuro' })[o.instrument] || 'Operação'} · ${items.length ? items.length + (items.length === 1 ? ' título' : ' títulos') + ' · ' : ''}${brl(o.gross)}`;
    if (od && B.docsBox) B.docsBox(od, id, null, 'op');
    const am = el.querySelector('#op-amend');
    {
      const FREQL = { mensal: 'Mensal', bimestral: 'Bimestral', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual', vencimento: 'No vencimento' };
      const AMORT = ['Bullet', 'Price', 'SAC', 'Personalizada'];
      const BASES = ['Juros compostos mensais, base exponencial 360 dias corridos', 'Juros compostos, base exponencial 252 dias úteis', 'Juros simples, base 360 dias corridos'];
      const GTYPES = ['Aval', 'Fiança', 'Cessão fiduciária de recebíveis', 'Alienação fiduciária de imóvel', 'Alienação fiduciária de veículo', 'Penhor', 'Garantia real', 'Outra'];
      const RT = { pre: 'Pré-fixado', pos: 'Pós-fixado', misto: 'Misto' };
      const open = items.filter((i) => !i.charge || !i.charge.status || i.charge.status === 'open');
      let vr = { versions: [], can_edit: false };
      const toBrl = (v) => brl(Number(v) || 0);
      const popup = (title, body, okLabel, onOk) => {
        const w = document.createElement('div'); w.className = 'modal-backdrop'; w.style.zIndex = '9999';
        w.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:420px"><div class="modal-head"><div><h2>${esc(title)}</h2></div></div><div class="modal-body">${body}<div class="error-box" id="pp-err" hidden></div></div><div class="modal-foot"><button class="btn secondary" data-x>Cancelar</button><button class="btn" data-ok>${esc(okLabel)}</button></div></div>`;
        document.body.appendChild(w); B.formInit && B.formInit(w); B.mask.attach(w);
        const kill = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        const close = () => { document.removeEventListener('keydown', kill, true); w.remove(); };
        document.addEventListener('keydown', kill, true);
        w.querySelector('[data-x]').onclick = close;
        w.querySelector('[data-ok]').onclick = () => { const bad = onOk(w); if (bad) { const e = w.querySelector('#pp-err'); e.hidden = false; e.textContent = bad; } else close(); };
        return w;
      };
      /* tranches (liberações pendentes) dentro do editor */
      const trancheSection = (box) => {
        const trs = (note && note.tranches) || [];
        if (!note || !trs.length) return { get: () => null };
        const pend = trs.filter((r) => r.status === 'pending'), paid = trs.filter((r) => r.status === 'paid').reduce((n, r) => n + Number(r.amount), 0);
        const remain = Math.round((Number(note.net) - paid) * 100) / 100;
        const host = box.querySelector('#tr-host');
        let dirty = false;
        const line = (r) => `<div class="tr-line" style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-bottom:8px;align-items:center"><input class="input" type="date" data-d value="${esc(r.release_date || '')}" aria-label="Data"><div>${B.affix(`<input class="input" data-v data-mask="money" inputmode="decimal" value="${r.amount ? esc(B.mask.fmtMoney(r.amount)) : ''}" aria-label="Valor">`, { pre: 'R$' })}</div><button type="button" class="btn ghost sm" data-rm aria-label="Remover">✕</button></div>`;
        host.innerHTML = `<div class="fsec"><h3>Liberação em tranches</h3><div class="small muted" style="margin-bottom:8px">Falta distribuir ${brl(remain)} ${paid ? `(já pagas: ${brl(paid)})` : ''}</div><div id="tl">${(pend.length ? pend : [{}]).map(line).join('')}</div><div class="row between"><button type="button" class="btn secondary sm" id="tl-add">+ Tranche</button><span class="small muted" id="tl-sum"></span></div></div>`;
        const tl = host.querySelector('#tl');
        const vals = () => [...tl.querySelectorAll('.tr-line')].map((l) => ({ release_date: l.querySelector('[data-d]').value, amount: B.mask.parse(l.querySelector('[data-v]').value) || 0 }));
        const sum = () => { const t = vals().reduce((n, q) => n + q.amount, 0); host.querySelector('#tl-sum').textContent = `Soma ${brl(t)}${Math.abs(t - remain) > 0.01 ? ` · diferença ${brl(remain - t)}` : ''}`; };
        const wire = () => { B.mask.attach(host); tl.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { if (tl.querySelectorAll('.tr-line').length > 1) { b.closest('.tr-line').remove(); dirty = true; sum(); } })); tl.querySelectorAll('input').forEach((i) => { i.oninput = () => { dirty = true; sum(); }; i.onchange = () => { dirty = true; sum(); }; }); };
        host.querySelector('#tl-add').onclick = () => { tl.insertAdjacentHTML('beforeend', line({})); wire(); dirty = true; sum(); };
        wire(); sum();
        return { get: () => { if (!dirty) return null; const v = vals(); if (v.some((q) => !q.release_date || q.amount <= 0)) return { error: 'Informe data e valor de cada tranche.' }; if (Math.abs(v.reduce((n, q) => n + q.amount, 0) - remain) > 0.01) return { error: `As tranches precisam somar ${brl(remain)}.` }; return { list: v }; } };
      };
      const loadAm = async () => {
        const [v2, list] = await Promise.all([rpc('partner_op_versions', { p_op: id }).catch(() => ({ versions: [], can_edit: false })), rpc('partner_op_amendments', { p_op: id }).catch(() => [])]);
        vr = v2; const vs = vr.versions || [];
        if (vs.length < 2) { am.innerHTML = ''; return; }
        const lab = (v) => (v.version === 0 ? 'Original' : `${v.version}º Aditivo`);
        const st = (v) => (v.status === 'awaiting_signature' ? '<span class="tag warning">Aguardando assinatura</span>' : `<span class="tag success">${v.version === 0 ? 'Vigente na origem' : 'Assinado'}</span>${v.signed_at && v.version ? ` <span class="small muted">${esc(date(v.signed_at))}</span>` : ''}`);
        const rows = vs.map((v) => { const sn = v.snapshot || {}, t = sn.terms || {}, ins = sn.installments || [];
          return `<tr><td><b>${lab(v)}</b></td><td>${esc(date(v.created_at))}</td><td>${esc(v.reason || '—')}</td><td>${t.maturity_date ? esc(date(t.maturity_date)) : ins.length ? esc(date(ins[ins.length - 1].due_date)) : '—'}</td><td>${t.monthly_rate != null ? pct(t.monthly_rate) + ' a.m.' : '—'}</td><td>${esc(FREQL[String(t.interest_freq || '').toLowerCase()] || t.interest_freq || '—')}</td><td class="num">${sn.total != null ? brl(sn.total) : '—'}</td><td>${st(v)}</td>
            <td class="num">${vr.can_edit && v.status === 'awaiting_signature' ? `<button class="btn secondary sm" data-vsign="${esc(v.id)}">Marcar como assinado</button>` : ''}</td></tr>`; }).join('');
        am.innerHTML = `<div class="card"><div class="card-head"><h2>Versões da Operação</h2></div><div style="overflow:auto"><table><thead><tr><th>Versão</th><th>Data</th><th>Motivo</th><th>Vencimento</th><th>Taxa</th><th>Pagto. de juros</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
          ${list.length ? `<details class="u-mt14"><summary><b>Alterações de parcelas</b> <span class="small muted">${list.length}</span></summary>${list.map((a2) => `<div style="padding:8px 0;border-top:1px solid var(--line)"><div class="row between"><b>${esc(date(a2.created_at))}</b><span class="small muted">${brl(a2.total_before)} → ${brl(a2.total_after)}</span></div>
            ${(a2.changes || []).map((c) => `<div class="small">${c.kind === 'incluida' ? `Parcela ${esc(c.number)} incluída: ${esc(date(c.due_to))} · ${brl(c.amount_to)}` : `Parcela ${esc(c.number)}: ${esc(date(c.due_from))} → ${esc(date(c.due_to))} · ${brl(c.amount_from)} → ${brl(c.amount_to)}`}</div>`).join('')}</div>`).join('')}</details>` : ''}</div>`;
        am.querySelectorAll('[data-vsign]').forEach((b) => (b.onclick = async () => { try { await run(b, () => rpc('partner_op_version_sign', { p_id: b.dataset.vsign, p_date: null }), 'Aditivo marcado como assinado'); loadAm(); } catch (_) { /* já avisado */ } }));
      };
      const aditivoQ = () => `<div class="fsec"><h3>Gerar aditivo?</h3>${B.seg('adt', [['1', 'Sim'], ['0', 'Não']], '1')}<div class="help">Sim: vira uma nova versão e fica aguardando assinatura.</div></div>`;
      /* ---------- editar (condições + parcelas + tranches num só pop-up) ---------- */
      const editDrawer = async () => {
        const t = (note && note.terms) || {}, V = (k) => esc(t[k] == null ? '' : t[k]);
        const parties = canCond ? await rpc('partner_parties_list', { p_kind: 'cedente' }).catch(() => []) : [];
        const ced = parties.find((q) => String(q.cnpj).replace(/\D/g, '') === String(c.cnpj).replace(/\D/g, ''));
        const bk = ced && ced.bank && ced.bank.account_number ? ced.bank : null;
        const accLabel = bk ? `${bk.bank_name || bk.bank_code || 'Banco'} · Ag ${bk.branch || '—'} · Conta ${bk.account_number}${bk.account_digit ? '-' + bk.account_digit : ''}` : '';
        const accOpts = [...(accLabel ? [accLabel] : []), ...(t.payment_account && t.payment_account !== accLabel ? [t.payment_account] : [])];
        let rt = t.rate_type === 'misto' ? 'pos' : (t.rate_type || 'pre'), gl = Array.isArray(t.guarantees_list) ? t.guarantees_list.map((g) => ({ ...g })) : [];
        const opt = (list, cur) => list.map((x) => `<option value="${esc(Array.isArray(x) ? x[0] : x)}" ${String(cur || '').toLowerCase() === String(Array.isArray(x) ? x[0] : x).toLowerCase() ? 'selected' : ''}>${esc(Array.isArray(x) ? x[1] : x)}</option>`).join('');
        const instRows = open.map((i) => `<tr data-inst="${esc(i.installment_id)}" data-d0="${esc(i.due_date)}" data-a0="${esc(Number(i.amount))}"><td><b>${nfLabel(i)}</b></td><td><input class="input" name="d" data-mask="date" value="${esc(B.mask.toBr(i.due_date))}"></td><td>${B.affix(`<input class="input" name="a" data-mask="money" inputmode="decimal" value="${esc(B.mask.fmtMoney(i.amount))}">`, { pre: 'R$' })}</td></tr>`).join('');
        const condHtml = !canCond ? '' : `
            <div class="fsec"><h3>Prazo</h3><div class="grid-2"><div class="field"><label>Emissão</label><input class="input" name="issue_date" data-mask="date" value="${t.issue_date ? esc(B.mask.toBr(t.issue_date)) : ''}"></div><div class="field"><label>Vencimento</label><input class="input" name="maturity_date" data-mask="date" value="${t.maturity_date ? esc(B.mask.toBr(t.maturity_date)) : ''}"></div></div>
              <div class="field"><label>Prazo (meses inteiros)</label><input class="input" name="term_months" data-mask="int" inputmode="numeric" value="${V('term_months')}"></div></div>
            <div class="fsec"><h3>Remuneração</h3><div class="field"><label>Tipo de taxa</label>${B.seg('rt', [['pre', 'Pré-fixado'], ['pos', 'Pós-fixado']], rt)}</div>
              <div class="field" id="ik-f"><label>Indexador</label>${B.seg('ik', [['ipca', 'IPCA +'], ['cdi', 'CDI +']], t.indexer_kind || 'ipca')}</div>
              <div class="field"><label id="rate-l">Taxa</label>${B.affix(`<input class="input" name="rate" data-mask="rate" inputmode="decimal" value="${t.monthly_rate != null ? esc(B.mask.fmtMoney(Number(t.monthly_rate) * 100)) : ''}">`, { suf: '% a.m.' })}</div>
              <div class="grid-2"><div class="field"><label>Pagamento de juros</label><select class="input" name="interest_freq">${opt(Object.entries(FREQL), t.interest_freq)}</select></div>
              <div class="field"><label>Amortização</label><select class="input" name="amortization">${opt(AMORT, String(t.amortization || '').split(' ')[0])}</select></div></div></div>
            <div class="fsec"><h3>Garantias</h3><div id="g-list"></div><button type="button" class="btn secondary sm" id="g-add">+ Adicionar garantia</button></div>
            <div class="fsec"><h3>Conta de pagamento</h3><select class="input" name="payment_account"><option value="">Selecione…</option>${opt(accOpts, t.payment_account)}</select><a class="linkbtn" href="#/cadastros/cedente" id="acc-add">+ Adicionar conta</a>${bk ? '' : '<div class="help">O cedente ainda não tem conta cadastrada.</div>'}</div>`;
        const parcHtml = !canParc ? '' : `<div class="fsec"><h3>Parcelas em aberto</h3><table class="mini"><thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th></tr></thead><tbody>${instRows}</tbody></table><div id="am-adds" style="margin-top:8px"></div><button class="btn ghost sm" type="button" id="am-add">+ Incluir parcela</button><div class="help">Parcelas já pagas não podem ser alteradas. Boletos já emitidos precisam ser reemitidos.</div></div>`;
        const box = B.drawer({ title: 'Editar operação', subtitle: 'Condições, parcelas e liberações num só lugar. Nada precisa ser digitado além de números e datas.',
          body: `<form id="tf" novalidate>${condHtml}${parcHtml}<div id="tr-host"></div>${aditivoQ()}<div class="error-box" id="tf-err" hidden></div></form>`,
          foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar</button>' });
        B.formInit(box); B.mask.attach(box);
        const f = box.querySelector('#tf'), tr = trancheSection(box);
        if (canCond) {
          const paintG = () => { box.querySelector('#g-list').innerHTML = gl.length ? gl.map((g, i) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span><b>${esc(g.type)}</b>${Number(g.value) ? ` · ${toBrl(g.value)}` : ''}</span><button type="button" class="btn ghost sm" data-gr="${i}" aria-label="Remover">✕</button></div>`).join('') : '<div class="small muted" style="margin-bottom:6px">Nenhuma garantia.</div>';
            box.querySelectorAll('[data-gr]').forEach((b) => (b.onclick = () => { gl.splice(+b.dataset.gr, 1); paintG(); })); };
          paintG();
          box.querySelector('#g-add').onclick = () => popup('Adicionar garantia', `<div class="field"><label>Tipo</label><select class="input" id="g-t">${GTYPES.map((x) => `<option>${esc(x)}</option>`).join('')}</select></div><div class="field"><label>Valor da garantia</label>${B.affix('<input class="input" id="g-v" data-mask="money" inputmode="decimal" placeholder="0,00">', { pre: 'R$' })}</div>`, 'Adicionar', (w) => {
            const v = B.mask.parse(w.querySelector('#g-v').value) || 0; if (!(v > 0)) return 'Informe o valor da garantia.';
            gl.push({ type: w.querySelector('#g-t').value, value: v }); paintG(); return null; });
          const syncRt = () => { rt = f.rt.value; box.querySelector('#ik-f').hidden = rt === 'pre'; box.querySelector('#rate-l').textContent = rt === 'pre' ? 'Taxa' : 'Spread sobre o indexador'; };
          B.rateUnit(f.rate);
          f.rt.addEventListener('change', syncRt); syncRt();
          const months = () => { const a2 = B.mask.iso(f.issue_date), b2 = B.mask.iso(f.maturity_date); if (!a2 || !b2 || b2 <= a2) return; const d1 = new Date(a2 + 'T12:00:00'), d2 = new Date(b2 + 'T12:00:00'); f.term_months.value = String(Math.max(1, (d2.getFullYear() - d1.getFullYear()) * 12 + d2.getMonth() - d1.getMonth() + (d2.getDate() > d1.getDate() + 15 ? 1 : 0))); };
          ['issue_date', 'maturity_date'].forEach((k) => { f[k].addEventListener('change', months); f[k].addEventListener('blur', months); });
          f.term_months.addEventListener('input', () => { f.term_months.value = f.term_months.value.replace(/\D/g, ''); });
          box.querySelector('#acc-add').onclick = () => B.closeModal();
        }
        if (canParc) {
          const addHost = box.querySelector('#am-adds');
          box.querySelector('#am-add').onclick = () => { addHost.insertAdjacentHTML('beforeend', `<div class="grid-2 am-new" style="margin-bottom:6px"><input class="input" name="nd" data-mask="date" placeholder="Vencimento"><div>${B.affix('<input class="input" name="na" data-mask="money" inputmode="decimal" placeholder="0,00">', { pre: 'R$' })}</div></div>`); B.mask.attach(addHost); };
        }
        box.querySelector('[data-act=cancel]').onclick = () => B.closeModal();
        box.querySelector('[data-act=ok]').onclick = async (ev) => {
          const err = box.querySelector('#tf-err'), bad = (m2) => { err.hidden = false; err.textContent = m2; }; err.hidden = true;
          const aditivo = f.adt.value === '1', reasons = [];
          let terms = null, changes = [], adds = [];
          if (canCond) {
            const dt = (el2) => (el2.value.trim() ? B.mask.iso(el2) : null);
            const iss = dt(f.issue_date), mat = dt(f.maturity_date); if ((f.issue_date.value.trim() && !iss) || (f.maturity_date.value.trim() && !mat)) return bad('Confira as datas.');
            if (iss && mat && mat <= iss) return bad('O vencimento deve ser depois da emissão.');
            const tm = f.term_months.value.trim(); if (tm && !/^\d+$/.test(tm)) return bad('O prazo deve ser em meses inteiros.');
            const rate = f.rate.value.trim() ? B.rateMonthly(f.rate) : null;
            const ikv = rt === 'pre' ? null : f.ik.value;
            const indexer = rt === 'pre' ? 'Sem correção monetária' : rt === 'pos' ? `${ikv === 'cdi' ? 'CDI' : 'IPCA'} + spread` : `${ikv === 'cdi' ? 'CDI' : 'IPCA'} + taxa prefixada`;
            terms = { issue_date: iss, maturity_date: mat, term_months: tm || null, monthly_rate: rate, rate_type: rt, indexer_kind: ikv, indexer, interest_base: t.interest_base || null, interest_freq: f.interest_freq.value, amortization: f.amortization.value, payment_account: f.payment_account.value || null,
              guarantees_list: gl, guarantees: gl.map((g) => `${g.type}${Number(g.value) ? ' (' + toBrl(g.value) + ')' : ''}`).join(' + ') || null };
            const L = { issue_date: 'Emissão', maturity_date: 'Vencimento', term_months: 'Prazo', monthly_rate: 'Taxa', rate_type: 'Tipo de taxa', indexer_kind: 'Indexador', interest_freq: 'Pagamento de juros', amortization: 'Amortização', payment_account: 'Conta de pagamento', guarantees: 'Garantias' };
            const ch = Object.keys(L).filter((k) => String(t[k] == null ? '' : t[k]) !== String(terms[k] == null ? '' : terms[k]));
            if (ch.length) reasons.push(...ch.map((k) => L[k])); else terms = null;
          }
          if (canParc) {
            for (const trw of box.querySelectorAll('tr[data-inst]')) {
              const d = B.mask.iso(trw.querySelector('[name=d]')), a2 = B.mask.parse(trw.querySelector('[name=a]').value);
              if (!d || !(a2 > 0)) return bad('Confira as datas e os valores das parcelas.');
              if (d !== trw.dataset.d0 || Math.abs(a2 - Number(trw.dataset.a0)) > 0.004) changes.push({ installment_id: trw.dataset.inst, due_date: d, amount: a2 });
            }
            for (const r of box.querySelectorAll('.am-new')) {
              const d = B.mask.iso(r.querySelector('[name=nd]')), a2 = B.mask.parse(r.querySelector('[name=na]').value);
              if (!d || !(a2 > 0)) return bad('Preencha data e valor de cada parcela incluída.');
              adds.push({ due_date: d, amount: a2 });
            }
            if (changes.length || adds.length) reasons.push('Parcelas');
          }
          const trr = tr.get(); if (trr && trr.error) return bad(trr.error);
          if (trr && trr.list) reasons.push('Liberações');
          if (!reasons.length) { B.closeModal(); return; }
          const reason = 'Alteração de: ' + reasons.join(', ');
          const doParc = changes.length || adds.length;
          try {
            const r = await run(ev.currentTarget, async () => {
              let out = null;
              if (terms || (trr && trr.list)) await rpc('partner_op_note_update', { p_op: id, p: { terms: terms || {}, aditivo: aditivo && !doParc, reason, tranches: trr && trr.list ? trr.list : undefined } });
              if (doParc) out = await rpc('partner_op_amend', { p_op: id, p: { reason, aditivo, changes, adds } });
              return out;
            }, aditivo ? 'Aditivo gerado' : 'Alterações salvas');
            B.closeModal(); if (r && r.reissue) toast && toast(`${r.reissue} boleto(s) já emitido(s) precisam ser reemitidos.`); B.reload();
          } catch (e) { bad(B.message(e)); }
        };
      };
      const eb = el.querySelector('#op-edit'); if (eb) eb.onclick = () => editDrawer();
      if (am) loadAm();
    }
    if (cd && B.docsBox) B.docsBox(cd, id, () => null, 'cedente').then(() => { if (cd.hidden && cd.dataset.na) el.querySelector('#ced-pdf').hidden = false; }); else if (el.querySelector('#ced-pdf')) el.querySelector('#ced-pdf').hidden = false;
    const cp = el.querySelector('#contract-pdf');
    if (cp) cp.onclick = () => contractPdf(d, x, me);
    // Parte da Lottus (split payment): Pix para a chave da Lottus quando o fundo paga por fora da conta integrada
    const lpx = el.querySelector('#lottus-pix');
    if (lpx) rpc('partner_lottus_transfer', { p_op: id }).then((t) => {
      if (!t || !t.pix_copy_paste) return;
      lpx.innerHTML = `<div class="pix-box"><div class="pix-qr">${B.qrSvg(t.pix_copy_paste)}</div>
        <div class="small"><b>Pix de ${brl(t.amount)} para a Lottus</b>${t.legal_name ? ` · ${esc(t.legal_name)}` : ''}</div>
        <div class="small muted">Chave ${esc(t.pix_key)}. Confira o nome antes de confirmar.</div>
        <button class="btn secondary sm" type="button" id="copy-lottus">Copiar Pix copia e cola</button></div>`;
      lpx.querySelector('#copy-lottus').onclick = () => B.copy(t.pix_copy_paste);
    }).catch(() => null);
    const pl = el.querySelector('#paylottus');
    if (pl) pl.onclick = async () => {
      const ref = await confirmAction({ title: 'Registrar pagamento à Lottus', text: `Pix de <b>${brl(x.lottus_transfer.amount)}</b> para a Lottus. Informe o ID do Pix (E2E) que está no comprovante.`,
                                        note: true, noteLabel: 'ID do Pix', noteRequired: true, confirmLabel: 'Registrar' });
      if (ref == null) return;
      run(pl, () => rpc('partner_lottus_transfer_informed', { p_op: id, p_reference: String(ref).replace(/\s/g, '') }), 'Pagamento à Lottus registrado').then(B.reload).catch(() => null);
    };

    // Pix para pagar o cedente (QR na tela do fundo)
    const ppx = el.querySelector('#payout-pix');
    if (ppx) rpc('partner_payout_pix', { p_id: id }).then((px) => {
      if (!px || !px.pix) return;
      ppx.innerHTML = `<div class="pix-box"><div class="pix-qr">${B.qrSvg(px.pix)}</div>
        <div class="small"><b>Pague com Pix</b> pelo app do banco do fundo: QR Code ou copia e cola.</div>
        <div class="small muted">Chave CNPJ do cedente: ${esc(cnpj(px.key))} · ${esc(px.name)}. Confira o nome antes de confirmar.</div>
        <button class="btn secondary sm" type="button" id="copy-payout">Copiar Pix copia e cola</button></div>`;
      ppx.querySelector('#copy-payout').onclick = () => B.copy(px.pix);
    }).catch(() => null);

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
    const refresh = () => {
      const t = totals(), partial = t.sel.length < items.length;
      el.querySelector('#sel-gross').textContent = brl(t.gross);
      el.querySelector('#sel-label').textContent = partial ? `${t.sel.length} de ${items.length} títulos` : items.length === 1 ? '1 título' : `${items.length} títulos`;
      el.querySelector('#sel-net').textContent = brl(t.sel.length === items.length ? o.net : t.net);
      el.querySelectorAll('#approve, [data-ap]').forEach((b) => {
        b.textContent = partial ? `Aprovar ${t.sel.length} de ${items.length}` : 'Aprovar';
        b.disabled = !!missing.length || !t.sel.length || over(t);
      });
      const lim = el.querySelector('#limit-note');
      if (lim) { lim.hidden = !over(t); lim.textContent = `Acima da sua alçada (${brl(me.approval_limit)}). Desmarque títulos ou peça a um aprovador com alçada maior.`; }
      const all = el.querySelector('#all');
      if (all) { all.checked = t.sel.length === items.length; all.indeterminate = t.sel.length > 0 && partial; }
    };
    boxes.forEach((b) => (b.onchange = refresh));
    const all = el.querySelector('#all');
    if (all) all.onchange = () => { boxes.forEach((b) => (b.checked = all.checked)); refresh(); };
    if (el.querySelector('#sel-gross')) refresh();

    const approve = async (btn) => {
      const t = totals(), partial = t.sel.length < items.length;
      const ok = await confirmAction({ title: partial ? 'Aprovar parte dos títulos' : 'Aprovar a operação', confirmLabel: 'Aprovar e assinar',
        text: `<dl class="lines" style="margin:0 0 12px"><dt>Cedente</dt><dd><b>${esc(c.legal_name)}</b></dd>
          <dt>Títulos</dt><dd><b>${partial ? `${t.sel.length} de ${items.length}` : items.length}</b></dd>
          <dt>Valor de face</dt><dd><b>${brl(partial ? t.gross : o.gross)}</b></dd>
          <dt>Você paga</dt><dd><b>${brl(partial ? t.net : o.net)}</b></dd></dl>
          ${partial ? `<p class="u-m0b10 small">Os outros ${brl(Number(o.gross) - t.gross)} voltam para o cedente (não são oferecidos a outro fundo).</p>` : ''}
          <span class="small muted">${esc(d.statement)}</span>` });
      if (ok == null) return;
      if (window.__ensureSeries && !(await window.__ensureSeries())) return;
      const r = await run(btn, () => rpc('partner_approve', { p_id: id, p_items: partial ? t.sel.map((i) => i.installment_id) : null }),
        partial ? 'Títulos aprovados e aceite assinado' : 'Operação aprovada e aceite assinado').catch(() => null);
      if (!r) return;
      if (r.payout_mode && r.payout_mode !== 'manual' && me.trio_ready) await run(null, () => runPayout(id), 'Pix enviado ao cedente').catch(() => null);
      afterDecision();
    };
    const decline = async (btn) => {
      const note = await askDecline();
      if (note == null) return;
      const r = await run(btn, () => rpc('partner_decline', { p_id: id, p_note: note }), 'Operação recusada').catch(() => null);
      if (r) afterDecision();
    };
    /* Lastro: série de debênture vinculada à operação (sugerida pelo sistema, editável) */
    let seriesCur = null;
    const seriesSel = el.querySelector('#series-sel');
    if (seriesSel) {
      rpc('partner_operation_series', { p_id: id }).then((sv) => {
        if (!sv.series.length) return;
        seriesCur = sv.current || null;
        const pick = sv.current || sv.suggested || '';
        seriesSel.innerHTML = '<option value="">Escolha a série…</option>' + sv.series.map((x) =>
          `<option value="${esc(x.id)}" ${x.id === pick ? 'selected' : ''} ${!x.fits && x.id !== sv.current ? 'disabled' : ''}>${esc(x.label)} · livre ${brl(x.available)}${x.fits ? '' : ' (não comporta)'}</option>`).join('');
        el.querySelector('#series-help').textContent = sv.current ? '' : sv.suggested ? 'Sugerida pelo sistema; você pode trocar.' : 'Nenhuma série comporta esta operação.';
        el.querySelector('#series-box').hidden = false;
      }).catch(() => null);
    }
    window.__ensureSeries = async () => {
      if (!seriesSel || el.querySelector('#series-box').hidden) return true;
      if (!seriesSel.value) { toast('Escolha a série (lastro) da operação.', true); return false; }
      if (seriesSel.value === seriesCur) return true;
      try { await rpc('partner_set_operation_series', { p_id: id, p_series: seriesSel.value }); seriesCur = seriesSel.value; return true; }
      catch (e) { toast(B.message ? B.message(e) : e.message, true); return false; }
    };
    el.querySelectorAll('#approve, [data-ap]').forEach((b) => (b.onclick = () => approve(b)));
    /* Operação manual: quadro do que falta e "Aprovar e enviar para assinatura" (os documentos são gerados sozinhos) */
    const mbox = el.querySelector('#manual-box');
    if (mbox && B.opManualPanel) B.opManualPanel(mbox, { opId: id, before: () => (window.__ensureSeries ? window.__ensureSeries() : true), onSent: () => B.reload(), onFix: () => B.reload() })
      .then((ck) => {
        if (!ck || !ck.manual) { mbox.remove(); return; }
        mbox.hidden = false;
        el.querySelectorAll('#miss-note, #approve, [data-ap], .check-all').forEach((x) => x.remove());
        el.querySelectorAll('[data-it]').forEach((x) => x.remove());
        const tag = el.querySelector('#stage-tag');
        if (tag && ck.docs.ready) tag.outerHTML = stageTag('assinatura');
      }).catch(() => mbox.remove());
    el.querySelectorAll('#decline, [data-dec]').forEach((b) => (b.onclick = () => decline(b)));
    const pu = el.querySelector('#payundo');
    if (pu) pu.onclick = async () => {
      const ok = await B.confirmAction({ title: 'Estornar pagamento', text: 'A operação volta para "Aprovada" e o lançamento contábil do pagamento é removido. Depois você pode registrar o pagamento de novo, com a data correta. Só é possível se ainda não houver recebimentos.', confirmLabel: 'Estornar' });
      if (!ok) return;
      try { await rpc('partner_operation_undo_payment', { p_op: id }); toast('Pagamento estornado.'); B.reload(); } catch (e) { toast(B.message(e), true); }
    };
    const pm = el.querySelector('#paymanual');
    if (pm) pm.onclick = () => registerPayment(id, o, c, items, me);
    // Vindo do quadro: já abre a ação da etapa escolhida
    if (act) {
      history.replaceState(null, '', `#/assinar/${id}`);
      setTimeout(() => {
        const t = act === 'aprovar' ? el.querySelector('#approve') : act === 'recusar' ? el.querySelector('#decline') : act === 'pagar' ? el.querySelector('#paymanual') || el.querySelector('#payapi') : null;
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
      subtitle: `Pix de <b>${brl(o.net)}</b> para ${esc(c.legal_name)}`,
      body: `<form class="stack" id="rp" novalidate>
        <div class="field"><label>ID do Pix (E2E)</label><input class="input mono" name="ref" placeholder="E60701190202610161850…" autocomplete="off" maxlength="40">
          <div class="help">Está no comprovante do Pix, em "ID da transação" ou "Código de autenticação": começa com E e tem 32 caracteres. Conferimos o formato, o banco que pagou e a data, e o cedente vê o mesmo ID no app para achar no extrato.</div></div>
        <div class="field"><label>Data do pagamento</label><input class="input" name="on" data-mask="date" value="${esc(B.mask.toBr(todayIso()))}"><div class="help">Se o pagamento foi feito antes, informe a data real.</div></div>
        <label class="check-row"><input type="checkbox" name="other"><span class="small">Paguei por TED ou de outro jeito (informe o número do comprovante acima)</span></label>
        <label class="check-row" id="oa" hidden><input type="checkbox" name="other_account"><span class="small">Paguei de outra conta do fundo (o banco do ID é diferente do cadastrado)</span></label>
        <div class="field"><label>Tarifa do banco <span class="small muted">(opcional)</span></label>${B.affix('<input class="input" name="fee" data-mask="money" placeholder="0,00" inputmode="decimal">', { pre: 'R$' })}</div>
        <div class="note-box small">Ao registrar, cada duplicata (${items.length}) vira uma cobrança Pix na chave do fundo, com QR Code e PDF da Lottus, e os sacados recebem a notificação de cessão com o Pix.</div>
        <div class="error-box" id="rp-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Registrar pagamento</button>',
    });
    B.mask.attach(box);
    let accs = [];
    const feeFill = () => { const a = accs[0] || {}, v = Number((a.fees || {})[box.querySelector('[name=other]').checked ? 'ted' : 'pix'] || 0), fi = box.querySelector('[name=fee]'); if (fi && !fi.dataset.touched) fi.value = v ? B.mask.fmtMoney(v) : ''; };
    rpc('partner_bank_accounts').then((l) => { accs = l || []; feeFill(); }).catch(() => null);
    box.querySelector('[name=fee]').addEventListener('input', (e) => { e.target.dataset.touched = '1'; });
    box.querySelector('[name=other]').addEventListener('change', feeFill);
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      const btn = ev.currentTarget, err = box.querySelector('#rp-err'), f = box.querySelector('#rp');
      const ref = f.ref.value.replace(/\s/g, '').toUpperCase();
      const other = f.other.checked;
      if (!ref) { err.hidden = false; err.textContent = other ? 'Informe o número do comprovante.' : 'Informe o ID do Pix.'; return; }
      if (!other && !/^E[0-9]{20}[A-Z0-9]{11}$/.test(ref)) { err.hidden = false; err.textContent = 'O ID do Pix começa com E e tem 32 caracteres. Confira no comprovante.'; return; }
      btn.disabled = true;
      try {
        await rpc('partner_register_payment', { p_id: id, p: { reference: ref, kind: other ? 'other' : 'pix', other_account: f.other_account.checked, date: B.mask.iso(f.on) || null } });
        const fee = B.mask.parse(f.fee.value) || 0;
        if (fee > 0) await rpc('partner_payment_fee_set', { p_kind: 'operacao', p_ref: id, p_account: (accs[0] || {}).id || null, p_method: other ? 'ted' : 'pix', p_fee: fee, p_who: c.legal_name }).catch(() => null);
        closeModal(); toast('Pagamento registrado. Cobranças Pix enviadas aos sacados.'); B.reload();
      } catch (e) {
        const code = String(e.message);
        err.hidden = false;
        if (code.includes('e2e_other_bank')) { box.querySelector('#oa').hidden = false; err.textContent = 'Este Pix saiu de outro banco, não do banco cadastrado do fundo. Se pagou de outra conta do fundo, marque a opção acima.'; }
        else if (code.includes('pix_key_required')) err.innerHTML = 'Cadastre a chave Pix e a cidade do fundo em <a href="#/config/banco">Configurações → Banco</a>: elas vão nas cobranças Pix.';
        else err.textContent = B.message(e);
        btn.disabled = false;
      }
    };
  }

  /** O fundo confere o Pix na conta e registra o recebimento das duplicatas */
  async function contractPdf(d, x, me) {
    const w = window.open('', '_blank');
    if (!w) { toast('Permita janelas deste site para baixar o contrato.', true); return; }
    w.document.write('<p style="font-family:sans-serif;padding:24px">Montando o contrato…</p>');
    const logo = await B.logoData();
    const o = d.operation, c = d.company, fund = me.funder || {};
    const sigs = [...(d.assignor_signatures || []).map((s) => ({ who: s.signer_name, role: s.kind === 'anticipation_request' ? 'Pedido da antecipação (cedente)' : 'Cessão das duplicatas (cedente)', at: s.signed_at, hash: s.document_hash })),
      ...(d.my_signature ? [{ who: d.my_signature.signer_name, role: `Aceite da cessão (${fund.legal_name || 'cessionária'})`, at: d.my_signature.signed_at, hash: d.my_signature.document_hash }] : [])];
    const text = d.contract_text ? B.contractHtml(d.contract_text) : '<p class="muted">O texto do termo não está disponível para esta operação.</p>';
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Contrato de cessão · ${esc(c.legal_name)} · ${esc(String(o.id).slice(0, 8))}</title>
      <style>${B.DOC_CSS}
        h1.op { font-size: 16pt; margin: 0 0 4px; letter-spacing: -.01em; }
      </style></head><body>
      ${B.docHead(logo, 'Contrato de cessão de crédito')}
      <h1 class="op">Termo de cessão · ${esc(c.legal_name)}</h1>
      <div class="muted">Operação ${esc(String(o.id).slice(0, 8).toUpperCase())} · pedida em ${dateTime(o.created_at)} · valor de face ${brl(o.gross)}</div>
      <div class="parties">
        <div class="box"><span class="muted">Cedente</span><b>${esc(c.legal_name)}</b>CNPJ ${esc(cnpj(c.cnpj))}</div>
        <div class="box"><span class="muted">Cessionária</span><b>${esc(fund.legal_name || '')}</b>CNPJ ${esc(cnpj(fund.cnpj || ''))}</div>
      </div>
      <h2 class="box-title">Duplicatas cedidas</h2>
      <table><thead><tr><th>Título</th><th>Sacado</th><th>Vencimento</th><th class="num">Valor</th></tr></thead><tbody>
        ${(d.items || []).map((i) => `<tr><td>${MANUAL_DOC.test(String(i.nfe_number || '')) ? `Parcela ${esc(i.installment)}` : `${esc(i.nfe_number || '—')}/${esc(i.installment)}`}</td><td>${esc(i.debtor_name || '')} · ${esc(cnpj(i.debtor_cnpj))}</td><td>${date(i.due_date)}</td><td class="num">${brl(i.amount)}</td></tr>`).join('')}
      </tbody></table>
      ${text}
      <h2 class="box-title">Registro das assinaturas eletrônicas</h2>
      ${sigs.length ? sigs.map((s) => `<div class="sig"><b>${esc(s.role)}</b><div>${esc(s.who || '')} · ${dateTime(s.at)}</div><div class="mono">Código do documento: ${esc(s.hash || '')}</div></div>`).join('') : '<p class="muted">Sem assinaturas registradas.</p>'}
      <div class="foot">Documento assinado eletronicamente na plataforma Lottus, com validade jurídica nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001. A integridade pode ser conferida pelo código de cada assinatura. Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.</div>
      </body></html>`;
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* janela fechada */ } }, 500);
  }
})();
