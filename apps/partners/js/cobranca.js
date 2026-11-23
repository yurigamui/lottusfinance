/* Lottus Partners — Cobrança: parcelas a receber do fundo, baixa e lembretes */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, run, closeModal } = B;
  const { head, tabs, onTabs, empty } = B.ui;
  const TABS = [['all', 'Tudo'], ['open', 'Em aberto'], ['overdue', 'Vencidas'], ['next7', 'Próximos 7 dias'], ['paid', 'Pagas']];
  const INSTR = { cessao: 'Cessão', nota_comercial: 'Nota comercial', ccb: 'CCB', confissao_divida: 'Confissão de dívida' };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const { today } = B;

  /* Baixa: parcelas em aberto + créditos do extrato do banco (data da transação; diferença vira juros recebidos ou desconto concedido) */
  function baixa(items, done) {
    const total = items.reduce((t, x) => t + Number(x.amount), 0);
    const box = B.drawer({ title: 'Dar baixa', subtitle: `${items.length} ${items.length === 1 ? 'parcela' : 'parcelas'} · ${brl(total)}`,
      body: `<form id="bf" novalidate>
        <div class="fsec"><h3>Parcelas</h3><table class="mini"><tbody>${items.map((x) => `<tr><td><b>${esc(x.sacado)}</b><div class="small muted">${esc(x.cedente)} · parcela ${esc(x.parcela)} · vence ${esc(date(x.due_date))}</div></td><td class="num"><b>${brl(x.amount)}</b></td></tr>`).join('')}</tbody></table></div>
        <div class="fsec"><h3>Extrato do banco</h3>
          <div class="small muted" style="margin-bottom:8px">Selecione os créditos recebidos. A baixa é feita na data da transação.</div>
          <label class="small" style="display:flex;gap:6px;align-items:center;margin-bottom:8px"><input type="checkbox" id="bx-all"> Mostrar todos os créditos pendentes (não só os do CNPJ/nome do sacado e cedente)</label>
          <div id="bx-list" class="small muted">Carregando extrato…</div>
          <div id="bx-sum" class="note-box small" style="margin-top:10px" hidden></div></div>
        <div class="fsec" id="bx-manual"><h3>Sem extrato (baixa manual)</h3><div class="small muted" style="margin-bottom:6px">Use só se o crédito não estiver no extrato. Informe a data do recebimento.</div><input class="input" name="paid_on" data-mask="date" value="${esc(B.mask.toBr(today()))}"></div>
        <div class="error-box" id="bf-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Confirmar baixa</button>' });
    const lines = []; const sel = new Set(); let showAll = false, excess = 'juros';
    const listEl = box.querySelector('#bx-list'), sumEl = box.querySelector('#bx-sum'), manualEl = box.querySelector('#bx-manual'), okBtn = box.querySelector('[data-act=ok]');
    const diffInfo = () => {
      const rec = lines.filter((l) => sel.has(l.id)).reduce((t, l) => t + Number(l.amount), 0), diff = Math.round((rec - total) * 100) / 100;
      return { rec, diff };
    };
    function paint() {
      const rows = lines.filter((l) => showAll || l.match);
      listEl.innerHTML = rows.length ? `<table class="mini"><tbody>${rows.map((l) => `<tr><td style="width:28px"><input type="checkbox" data-bx="${esc(l.id)}" ${sel.has(l.id) ? 'checked' : ''}></td><td>${esc(l.description)}<div class="small muted">${esc(date(l.date))}${l.match ? ' · CNPJ/nome confere' : ''}</div></td><td class="num"><b>${brl(l.amount)}</b></td></tr>`).join('')}</tbody></table>`
        : '<div class="small muted">Nenhum crédito pendente encontrado para este CNPJ/nome. Marque "Mostrar todos" ou use a baixa manual.</div>';
      listEl.querySelectorAll('[data-bx]').forEach((c) => (c.onchange = () => { c.checked ? sel.add(c.dataset.bx) : sel.delete(c.dataset.bx); paint(); }));
      const has = sel.size > 0; manualEl.hidden = has; sumEl.hidden = !has;
      okBtn.textContent = has ? 'Dar baixa com o extrato' : 'Confirmar baixa manual';
      if (has) {
        const { rec, diff } = diffInfo();
        sumEl.innerHTML = bars([{ l: 'Parcelas', segs: [{ v: total, c: 'ink', n: 'Parcelas' }], t: brl(total) }, { l: 'Extrato', segs: [{ v: Math.min(rec, total), c: 'ok', n: 'Recebido' }, { v: Math.max(0, rec - total), c: 'rosa', n: 'Excedente' }], t: brl(rec) }]) + (diff === 0 ? '<div class="cmp-n ok">Valores conferem.</div>' : diff > 0 ? `Excedente de <b>${brl(diff)}</b>. Destino: <label style="display:block;margin-top:4px"><input type="radio" name="ex" value="juros" ${excess === 'juros' ? 'checked' : ''}> <b>Juros recebidos</b> (Rendimentos de direitos creditórios)</label><label style="display:block"><input type="radio" name="ex" value="devolver" ${excess === 'devolver' ? 'checked' : ''}> <b>A devolver ao sacado</b> (fica em Valores a devolver até o estorno)</label>` : `Faltam <b>${brl(-diff)}</b> → lançado em <b>(-) Descontos concedidos</b>.`);
        sumEl.querySelectorAll('[name=ex]').forEach((x) => (x.onchange = () => { excess = x.value; }));
      }
    }
    rpc('partner_baixa_lines', { p_installments: items.map((x) => x.installment_id) }).then((r) => {
      lines.push(...(r || []));
      // pré-seleciona o crédito único que bate exatamente com o total
      const ex = lines.filter((l) => l.match && Math.abs(Number(l.amount) - total) < 0.005);
      if (ex.length === 1) sel.add(ex[0].id);
      paint();
    }).catch((e) => { listEl.textContent = B.message(e); });
    box.querySelector('#bx-all').onchange = (ev) => { showAll = ev.target.checked; paint(); };
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    okBtn.onclick = async (ev) => {
      const f = box.querySelector('#bf'), err = box.querySelector('#bf-err');
      err.hidden = true;
      try {
        if (sel.size) {
          const payload = items.map((x) => ({ operation_id: x.operation_id, installment_id: x.installment_id }));
          await run(ev.currentTarget, () => rpc('partner_baixa_extrato_v2', { p_items: payload, p_lines: [...sel], p_excess: diffInfo().diff > 0 ? excess : 'juros' }), 'Baixa registrada');
        } else {
          const d = B.mask.iso(f.paid_on);
          if (!d || d > today()) { B.fieldError(f.paid_on, 'Use uma data até hoje'); return; }
          const byOp = {}; items.forEach((x) => { (byOp[x.operation_id] = byOp[x.operation_id] || []).push(x.installment_id); });
          await run(ev.currentTarget, async () => { for (const [op, ids] of Object.entries(byOp)) await rpc('partner_mark_received', { p_id: op, p_items: ids, p_paid_on: d }); }, 'Baixa registrada');
        }
        closeModal(); done();
      } catch (e) { err.hidden = false; err.textContent = B.message(e); }
    };
  }

  /* Confissão de dívida: reúne parcelas em aberto de um cedente numa nova operação */
  async function confissao(done) {
    const d = await rpc('partner_receivables', { p_view: 'open' });
    const open = d.items.filter((x) => x.status !== 'paid' && x.status !== 'cancelled');
    const byCed = {}; open.forEach((x) => { (byCed[x.cedente] = byCed[x.cedente] || {}); const o = (byCed[x.cedente][x.operation_id] = byCed[x.cedente][x.operation_id] || { id: x.operation_id, doc: x.document, n: 0, sum: 0, first: x.due_date, over: 0 }); o.n++; o.sum += Number(x.amount); if (String(x.due_date) < o.first) o.first = x.due_date; if (x.status === 'overdue') o.over++; });
    const ceds = Object.keys(byCed).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const box = B.drawer({ title: 'Confissão de dívida', subtitle: 'Reúne parcelas em aberto de um cedente numa nova operação. As parcelas originais são baixadas por novação.',
      body: `<form id="cf" novalidate>
        <div class="field"><label>Cedente</label><select class="input" name="ced"><option value="">Selecione…</option>${ceds.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div>
        <div class="fsec"><h3>Operações incluídas</h3><div id="cf-ops" class="small muted">Escolha o cedente.</div></div>
        <div class="fsec"><h3>Valores</h3><div class="grid-2"><div class="field"><label>Encargos (multa/juros) <span class="small muted">somados</span></label>${B.affix('<input class="input" name="charges" data-mask="money" inputmode="decimal" value="0,00">', { pre: 'R$' })}</div>
          <div class="field"><label>Desconto <span class="small muted">subtraído</span></label>${B.affix('<input class="input" name="discount" data-mask="money" inputmode="decimal" value="0,00">', { pre: 'R$' })}</div></div></div>
        <div class="fsec"><h3>Pagamento da confissão</h3><div class="grid-2"><div class="field"><label>Nº de parcelas</label><input class="input" name="n" inputmode="numeric" value="6"></div>
          <div class="field"><label>Periodicidade</label><select class="input" name="freq"><option value="monthly">Mensal</option><option value="weekly">Semanal</option></select></div></div>
          <div class="grid-2"><div class="field"><label>1º vencimento</label><input class="input" name="first" data-mask="date" value="${esc(B.mask.toBr(new Date(Date.parse(today() + 'T12:00:00') + 30 * 864e5).toISOString().slice(0, 10)))}"></div>
          <div class="field"><label>Juros ao mês (%)</label><input class="input" name="rate" inputmode="decimal" value="0"></div></div></div>
        <div class="field"><label>Observação <span class="small muted">(opcional)</span></label><input class="input" name="note" maxlength="200" autocomplete="off"></div>
        <div id="cf-prev" class="note-box small" hidden></div><div class="error-box" id="cf-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Gerar confissão</button>' });
    B.formInit(box); B.mask.attach(box);
    const f = box.querySelector('#cf'), err = box.querySelector('#cf-err'), prev = box.querySelector('#cf-prev');
    const picked = () => [...box.querySelectorAll('[data-cop]:checked')].map((c) => c.dataset.cop);
    const payload = () => ({ op_ids: picked(), installments: parseInt(f.n.value, 10) || 0, frequency: f.freq.value, first_due: B.mask.iso(f.first) || '', monthly_rate: (parseFloat(String(f.rate.value).replace(',', '.')) || 0) / 100, charges: B.mask.parse(f.charges.value) || 0, discount: B.mask.parse(f.discount.value) || 0, note: f.note.value.trim() });
    let tm; const refresh = () => { clearTimeout(tm); tm = setTimeout(async () => {
      const p = payload(); if (!p.op_ids.length) { prev.hidden = true; return; }
      try { const r = await rpc('partner_confissao_preview', { p }); prev.hidden = false;
        prev.innerHTML = `Saldo em aberto: <b>${brl(r.saldo)}</b> · Valor da confissão: <b>${brl(r.principal)}</b>${(r.schedule || []).length ? `<div style="margin-top:6px">${r.schedule.map((s) => `${s.n}ª · ${esc(date(s.due_date))} · <b>${brl(s.amount)}</b>`).join('<br>')}</div>` : ''}`; } catch (e) { prev.hidden = false; prev.textContent = B.message(e); } }, 300); };
    f.ced.onchange = () => {
      const ops = Object.values(byCed[f.ced.value] || {}).sort((a, b2) => String(a.first).localeCompare(String(b2.first)));
      box.querySelector('#cf-ops').innerHTML = ops.length ? ops.map((o) => `<label style="display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--line)"><input type="checkbox" data-cop="${esc(o.id)}" checked><span class="grow"><b>${esc(o.doc || 'Operação')}</b><span class="small muted"> · ${o.n} parcela(s) em aberto · 1º venc. ${esc(date(o.first))}${o.over ? ` · <span style="color:var(--danger)">${o.over} vencida(s)</span>` : ''}</span></span><b>${brl(o.sum)}</b></label>`).join('') : '<span class="small muted">Escolha o cedente.</span>';
      box.querySelectorAll('[data-cop]').forEach((c) => (c.onchange = refresh)); refresh();
    };
    ['charges', 'discount', 'n', 'freq', 'first', 'rate'].forEach((k) => { f[k].addEventListener('input', refresh); f[k].addEventListener('change', refresh); });
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      err.hidden = true; const p = payload(), bad = (t) => { err.hidden = false; err.textContent = t; };
      if (!p.op_ids.length) return bad('Selecione ao menos uma operação.');
      if (p.installments < 1 || p.installments > 120) return bad('Informe o número de parcelas (1 a 120).');
      if (!p.first_due || p.first_due < today()) return bad('O 1º vencimento deve ser hoje ou depois.');
      const ok = await B.confirmAction({ title: 'Gerar confissão de dívida', text: 'As parcelas em aberto das operações selecionadas serão baixadas por novação e a nova operação será criada. Isso não pode ser desfeito por aqui.', confirmLabel: 'Gerar confissão' });
      if (ok == null) return;
      try { await run(ev.currentTarget, () => rpc('partner_confissao_create', { p }), 'Confissão de dívida criada'); closeModal(); done(); } catch (e) { bad(B.message(e)); }
    };
  }

  /* Barras comparativas (substitui textos de resumo): rows = [{ l, segs:[{ v, c, n }], t }] */
  const bars = (rows) => { const mx = Math.max(1, ...rows.map((r) => r.segs.reduce((t, x) => t + Math.max(0, x.v), 0)));
    return `<div class="cmp">${rows.map((r) => `<div class="cmp-row"><div class="cmp-l">${esc(r.l)}</div><div class="cmp-b">${r.segs.map((x) => (x.v > 0 ? `<i class="c-${x.c}" style="width:${(x.v / mx * 100).toFixed(2)}%" title="${esc(x.n || '')}"></i>` : '')).join('')}</div><div class="cmp-t">${r.t}</div></div>`).join('')}
      <div class="cmp-lg">${[...new Map(rows.flatMap((r) => r.segs).filter((x) => x.n && x.v > 0).map((x) => [x.n, x])).values()].map((x) => `<span><i class="c-${x.c}"></i>${esc(x.n)}</span>`).join('')}</div></div>`; };
  B.bars = bars;

  B.baixaParcelas = baixa;

  /* Fluxo futuro: recebimento pelo extrato (cada crédito = um pagamento na data da transação) */
  B.ffReceive = (ff, done) => {
    const box = B.drawer({ title: 'Registrar recebimento', subtitle: `Saldo atualizado hoje: ${brl(ff.balance)}`,
      body: `<form id="fr" novalidate><div class="fsec"><h3>Extrato do banco</h3><div class="small muted" style="margin-bottom:8px">Selecione os créditos recebidos. Cada um vale como pagamento na data da transação; abate juros e depois principal.</div>
        <label class="small" style="display:flex;gap:6px;align-items:center;margin-bottom:8px"><input type="checkbox" id="fr-all"> Mostrar todos os créditos pendentes</label>
        <div id="fr-list" class="small muted">Carregando extrato…</div><div id="fr-sum" class="note-box small" style="margin-top:10px" hidden></div></div>
        <div class="error-box" id="fr-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok" disabled>Registrar recebimento</button>' });
    const lines = [], sel = new Set(); let showAll = false, qt = null, restMode = 'aberto';
    const listEl = box.querySelector('#fr-list'), sumEl = box.querySelector('#fr-sum'), okBtn = box.querySelector('[data-act=ok]'), err = box.querySelector('#fr-err');
    const paint = () => {
      const rows = lines.filter((l) => showAll || l.match);
      listEl.innerHTML = rows.length ? `<table class="mini"><tbody>${rows.map((l) => `<tr><td style="width:28px"><input type="checkbox" data-fr="${esc(l.id)}" ${sel.has(l.id) ? 'checked' : ''}></td><td>${esc(l.description)}<div class="small muted">${esc(date(l.date))}${l.match ? ' · CNPJ/nome confere' : ''}</div></td><td class="num"><b>${brl(l.amount)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="small muted">Nenhum crédito pendente para este cedente. Marque "Mostrar todos".</div>';
      listEl.querySelectorAll('[data-fr]').forEach((k) => (k.onchange = () => { k.checked ? sel.add(k.dataset.fr) : sel.delete(k.dataset.fr); paint(); }));
      okBtn.disabled = !sel.size; sumEl.hidden = !sel.size; err.hidden = true;
      if (!sel.size) return;
      const picked = lines.filter((l) => sel.has(l.id)), tot = picked.reduce((t, l) => t + Number(l.amount), 0), last = picked.map((l) => l.date).sort().pop();
      sumEl.textContent = 'Calculando…'; clearTimeout(qt);
      qt = setTimeout(async () => { try {
        const q = await rpc('partner_ff_quote', { p_op: ff.operation_id, p_on: last });
        const rest = Math.round((q.balance - tot) * 100) / 100, gone = tot > q.balance ? q.balance : tot;
        sumEl.innerHTML = bars([{ l: `Saldo em ${date(last)}`, segs: [{ v: Number(q.principal), c: 'ink', n: 'Principal' }, { v: Number(q.interest), c: 'warn', n: 'Juros' }], t: brl(q.balance) }, { l: 'Recebido', segs: [{ v: gone, c: 'ok', n: 'Recebido' }, { v: Math.max(0, -rest), c: 'rosa', n: 'Excedente' }], t: brl(tot) }, ...(rest > 0.01 ? [{ l: 'Restante', segs: [{ v: rest, c: 'bad', n: 'Restante' }], t: brl(rest) }] : [])])
          + (rest < -0.01 ? '<div class="cmp-n bad">O valor passa do saldo atualizado.</div>' : Math.abs(rest) <= 0.01 ? '<div class="cmp-n ok">Quita a operação.</div>' : `<div class="cmp-n">Saldo remanescente de <b>${brl(rest)}</b>:<label style="display:block;margin-top:4px"><input type="radio" name="fr-rest" value="aberto" ${restMode === 'aberto' ? 'checked' : ''}> <b>Fica em aberto</b> (continua rendendo juros)</label><label style="display:block"><input type="radio" name="fr-rest" value="desconto" ${restMode === 'desconto' ? 'checked' : ''}> <b>Desconto concedido</b> (baixa o restante e quita a operação)</label></div>`);
        sumEl.querySelectorAll('[name=fr-rest]').forEach((x) => (x.onchange = () => { restMode = x.value; }));
      } catch (e) { sumEl.textContent = B.message(e); } }, 200);
    };
    rpc('partner_baixa_lines', { p_installments: [ff.installment_id] }).then((r) => { lines.push(...(r || [])); paint(); }).catch((e) => { listEl.textContent = B.message(e); });
    box.querySelector('#fr-all').onchange = (ev) => { showAll = ev.target.checked; paint(); };
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    okBtn.onclick = async (ev) => {
      try { await run(ev.currentTarget, () => rpc('partner_ff_receive_v2', { p_op: ff.operation_id, p_lines: [...sel], p_rest: restMode }), 'Recebimento registrado'); closeModal(); done(); }
      catch (e) { err.hidden = false; err.textContent = B.message(e); }
    };
  };
  const cf = { cedente: '', sacado: '', instrument: '', series: '', from: '', to: '' };

  B.views.cobranca = async (el, [rawTab], me) => {
    const tab = TABS.some(([k]) => k === rawTab) ? rawTab : 'all';
    const canBaixa = me.can_sign !== false;
    const d = await rpc('partner_receivables', { p_view: tab });
    const t = d.totals || {};
    const kpi = (l, v, sub, bad) => `<div class="card kpi${bad && Number(v) > 0 ? ' alert' : ''}"><span class="lbl">${l}</span><span class="big">${brl(v)}</span>${sub ? `<span class="small muted">${sub}</span>` : ''}</div>`;
    el.innerHTML = head('Cobrança', 'Parcelas a receber das operações pagas pelo fundo') + `<div class="kpis">${kpi('A receber', t.open, `${t.open_count} ${t.open_count === 1 ? 'parcela' : 'parcelas'}`)}${kpi('Vencido', t.overdue, `${t.overdue_count} ${t.overdue_count === 1 ? 'parcela' : 'parcelas'}`, true)}${kpi('Vence em 7 dias', t.next7)}${kpi('Recebido em 30 dias', t.received30)}</div>`
      + '<div class="ops-bar" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:12px">' + tabs(TABS, tab) + '<input class="input search" style="flex:0 1 320px;width:auto;min-width:160px" id="q" type="search" placeholder="Buscar sacado, cedente ou CNPJ" aria-label="Buscar"><span id="sel" class="small muted"></span><button class="btn sm" id="bulk" hidden>Dar baixa nas selecionadas</button>' + '</div><div id="list"></div>';
    const uniq = (k) => [...new Set(d.items.map((x) => x[k]).filter(Boolean))].sort((a, b2) => String(a).localeCompare(String(b2), 'pt-BR')).map((v) => [v, k === 'instrument' ? (INSTR[v] || v) : v]);
    const FIELDS = [{ k: 'cedente', label: 'Cedente', type: 'select', all: 'Todos os cedentes', options: uniq('cedente') }, { k: 'sacado', label: 'Sacado', type: 'select', all: 'Todos os sacados', options: uniq('sacado') },
      { k: 'instrument', label: 'Tipo de operação', type: 'select', all: 'Todos os tipos', options: uniq('instrument') }, { k: 'series', label: 'Série', type: 'select', all: 'Todas as séries', options: uniq('series') },
      { k: 'due', label: 'Vencimento', type: 'range', future: true }];
    el.querySelector('#list').insertAdjacentHTML('beforebegin', B.ui.filters.html('cobr', FIELDS, cf));
    onTabs(el, (k) => { location.hash = `#/cobranca/${k}`; });
    const reload = () => B.views.cobranca(el, [tab], me);
    const picked = new Set();
    const paint = () => {
      const q = norm(el.querySelector('#q').value), qd = q.replace(/\D/g, '');
      const rows = d.items.filter((x) => (!q || norm(x.sacado).includes(q) || norm(x.cedente).includes(q) || (qd && (String(x.sacado_cnpj).includes(qd) || String(x.cedente_cnpj).includes(qd))))
        && (!cf.cedente || x.cedente === cf.cedente) && (!cf.sacado || x.sacado === cf.sacado) && (!cf.instrument || x.instrument === cf.instrument) && (!cf.series || x.series === cf.series)
        && (!cf.from || String(x.due_date) >= cf.from) && (!cf.to || String(x.due_date) <= cf.to));
      const openRow = (x) => x.status !== 'paid' && x.status !== 'cancelled';
      const pg = B.ui.pager('cobr:' + tab, rows, { unit: rows.length === 1 ? 'cobrança' : 'cobranças', sig: tab + '|' + q + '|' + JSON.stringify(cf), cols: [...(canBaixa ? [null] : []), (x) => x.due_date, (x) => x.sacado, (x) => x.cedente, (x) => Number(x.amount || 0)], sum: rows.reduce((t, x) => t + Number(x.amount || 0), 0) });
      el.querySelector('#list').innerHTML = rows.length ? `<div class="card"><table><thead><tr>${canBaixa ? '<th style="width:32px"></th>' : ''}<th>Vencimento</th><th>Sacado</th><th>Cedente</th><th class="num">Valor</th><th></th></tr></thead><tbody>
        ${pg.rows.map((x) => `<tr>${canBaixa ? `<td>${openRow(x) ? `<input type="checkbox" data-pick="${esc(x.installment_id)}" ${picked.has(x.installment_id) ? 'checked' : ''} aria-label="Selecionar">` : ''}</td>` : ''}
          <td><b>${esc(date(x.due_date))}</b></td>
          <td><b>${esc(x.sacado)}</b><div class="small muted">${esc(x.document || '')} · parcela ${esc(x.parcela)}${x.series ? ' · ' + esc(x.series) : ''}</div></td>
          <td>${esc(x.cedente)}${x.instrument ? `<div class="small muted">${INSTR[x.instrument] || ''}</div>` : ''}</td>
          <td class="num"><b>${brl(x.amount)}</b></td>
          <td class="num">${openRow(x) ? `${canBaixa ? `<button class="btn sm" data-one="${esc(x.installment_id)}">Dar baixa</button>` : ''}` : ''}</td></tr>`).join('')}
        </tbody></table>${pg.bar}</div>` : `<div class="card">${empty(d.items.length ? 'Nada encontrado com esses filtros.' : 'Nenhuma parcela nesta lista.')}</div>`;
      B.ui.pagerBind(el, 'cobr:' + tab, paint);
      el.querySelectorAll('[data-pick]').forEach((c) => (c.onchange = () => { c.checked ? picked.add(c.dataset.pick) : picked.delete(c.dataset.pick); sync(); }));
      el.querySelectorAll('[data-one]').forEach((b) => (b.onclick = () => baixa(d.items.filter((x) => x.installment_id === b.dataset.one), reload)));
      sync();
    };
    const sync = () => {
      const n = picked.size, bk = el.querySelector('#bulk');
      bk.hidden = !n; el.querySelector('#sel').textContent = n ? `${n} selecionada(s)` : '';
    };
    el.querySelector('#bulk').onclick = () => baixa(d.items.filter((x) => picked.has(x.installment_id)), reload);
    el.querySelector('#q').oninput = paint;
    B.ui.filters.bind(el, 'cobr', FIELDS, cf, paint);
    paint();
  };
})();
