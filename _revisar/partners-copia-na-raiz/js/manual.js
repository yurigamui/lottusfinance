/* Lottus Partners — Nova operação manual: Contrato de Cessão, Nota Comercial ou CCB */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, run, closeModal } = B;
  const KIND = { cessao: 'Contrato de Cessão', nota_comercial: 'Nota Comercial', ccb: 'CCB', fluxo_futuro: 'Fluxo Futuro', confissao_divida: 'Confissão de dívida' };
  const num = B.mask.parse;
  const fmtCnpj = (c) => String(c || '').replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');

  /* XML da NF-e: lê valores e vencimentos e confere, sem mostrar detalhes, se a nota é autêntica (chave, protocolo e hash) */
  function nfeKeyOk(k) {
    if (!/^\d{44}$/.test(k)) return false;
    let s = 0, w = 2;
    for (let i = 42; i >= 0; i--) { s += +k[i] * w; w = w === 9 ? 2 : w + 1; }
    const d = 11 - (s % 11);
    return (d >= 10 ? 0 : d) === +k[43];
  }
  function parseNfe(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) return null;
    const q = (root, tag) => { const e = root.getElementsByTagNameNS('*', tag)[0]; return e ? e.textContent.trim() : ''; };
    const inf = doc.getElementsByTagNameNS('*', 'infNFe')[0];
    if (!inf) return null;
    const key = (inf.getAttribute('Id') || '').replace(/^NFe/, '');
    const prot = doc.getElementsByTagNameNS('*', 'infProt')[0];
    const emit = inf.getElementsByTagNameNS('*', 'emit')[0], dest = inf.getElementsByTagNameNS('*', 'dest')[0];
    const digest = (doc.getElementsByTagNameNS('*', 'DigestValue')[0] || {}).textContent;
    const emitDoc = emit ? q(emit, 'CNPJ') || q(emit, 'CPF') : '';
    let ok = nfeKeyOk(key) && !!prot && key === q(prot, 'chNFe') && ['100', '150'].includes(q(prot, 'cStat')) && !!digest && digest.trim() === q(prot, 'digVal') && emitDoc === key.slice(6, 20);
    const ide = inf.getElementsByTagNameNS('*', 'ide')[0];
    const dups = [...inf.getElementsByTagNameNS('*', 'dup')].map((d, i) => ({ number: q(d, 'nDup') || String(i + 1).padStart(3, '0'), due_date: q(d, 'dVenc'), amount: parseFloat(q(d, 'vDup')) }));
    const total = parseFloat(q(inf.getElementsByTagNameNS('*', 'ICMSTot')[0] || inf, 'vNF'));
    if (dups.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d.due_date) || !(d.amount > 0))) ok = false;
    return { ok, key, number: ide ? q(ide, 'nNF') : '', issued_at: ide ? (q(ide, 'dhEmi') || q(ide, 'dEmi')) : '', total, dups, emit: { doc: emitDoc, name: emit ? q(emit, 'xNome') : '' }, dest: { doc: dest ? q(dest, 'CNPJ') || q(dest, 'CPF') : '', name: dest ? q(dest, 'xNome') : '' } };
  }

  B.newOperation = async function (onDone, preset) {
    const [series, ceds, sacs, escs, origs] = await Promise.all([rpc('partner_series_list').catch(() => []), Promise.all([rpc('partner_parties_list', { p_kind: 'cedente' }).catch(() => []), rpc('partner_app_cedentes').catch(() => [])]).then(([a, b]) => [...a, ...b]), rpc('partner_parties_list', { p_kind: 'sacado' }).catch(() => []),
      rpc('partner_parties_list', { p_kind: 'escriturador' }).catch(() => []), rpc('partner_originators_list').catch(() => [])]);
    const open = series.filter((s) => s.status === 'open');
    const partyOpts = (list) => `<option value="">Selecione…</option>` + list.map((x, i) => `<option value="${i}">${esc(x.legal_name || x.cnpj)} · ${esc(fmtCnpj(x.cnpj))}${x.source === 'app' ? ' · do app' : ''}</option>`).join('');
    const box = B.drawer({ title: 'Nova operação', subtitle: 'Escolha as partes; o sistema calcula as parcelas.',
      body: `<form id="nf" novalidate>
        <div class="fsec"><h3>Tipo</h3>${B.seg('instrument', Object.entries(KIND), KIND[preset] ? preset : 'cessao')}</div>
        <div class="fsec"><h3>Partes</h3>
          <div class="field"><label>Cedente</label><select class="input" name="ced">${partyOpts(ceds)}</select>
            <button type="button" class="linkbtn" data-new="cedente">+ Cadastrar nova empresa</button></div>
          <div class="field" id="sac-row"><label>Sacado</label><select class="input" name="sac">${partyOpts(sacs)}</select>
            <button type="button" class="linkbtn" data-new="sacado">+ Cadastrar nova empresa</button></div></div>
        <div class="fsec" id="cf-sec" style="display:none"><h3>Operações incluídas</h3><div id="cf-ops" class="small muted">Escolha o cedente.</div>
          <div class="grid-2 u-mt10"><div class="field"><label>Encargos (multa/juros) <span class="small muted">somados</span></label>${B.affix('<input class="input" name="charges" data-mask="money" inputmode="decimal" value="0,00">', { pre: 'R$' })}</div>
            <div class="field"><label>Desconto <span class="small muted">subtraído</span></label>${B.affix('<input class="input" name="discount" data-mask="money" inputmode="decimal" value="0,00">', { pre: 'R$' })}</div></div>
          <div id="cf-prev" class="note-box small u-mt10" hidden></div></div>
        <div class="fsec" id="esc-row" style="display:none"><h3>Escriturador</h3><select class="input" name="esc"><option value="">Selecione…</option>${escs.map((e) => `<option value="${esc(e.id)}">${esc(e.legal_name)}</option>`).join('')}</select>
          <button type="button" class="linkbtn" data-new="escriturador">+ Cadastrar novo escriturador</button>
          <div class="u-mt10 field"><label>Custo de escrituração</label>${B.affix('<input class="input" name="esc_cost" data-mask="money" placeholder="0,00">', { pre: 'R$' })}<div class="help">Valor que deve ser repassado ao escriturador. Vai para a Tesouraria.</div></div></div>
        <div class="fsec" id="xml-row"><h3>Nota fiscal (opcional)</h3><label class="filebox"><input type="file" id="xml-file" accept=".xml,text/xml,application/xml" hidden><span class="btn secondary sm">Importar XML da NF-e</span><span class="fname" id="xml-name">Preenche valores e vencimentos</span></label></div>
        <div class="fsec"><h3>Valores</h3><div class="fgrid">
          <div class="field full"><label id="amt-l">Valor de face</label>${B.affix('<input class="input" name="amount" data-mask="money" placeholder="0,00">', { pre: 'R$' })}</div>
          <div class="field" id="rk-row" style="display:none"><label>Tipo de taxa</label>${B.seg('rk', [['pre', 'Pré-fixada'], ['pos', 'Pós-fixada']], 'pre')}</div>
          <div class="field" id="ri-row" style="display:none"><label>Indexador</label>${B.seg('ri', [['cdi', 'CDI +'], ['ipca', 'IPCA +']], 'cdi')}</div>
          <div class="field"><label id="rate-l">Taxa</label>${B.affix('<input class="input" name="rate" data-mask="rate" placeholder="0,00">', { suf: '% a.m.' })}</div>
          <div class="field"><label>Parcelas</label><input class="input" name="n" data-mask="int" value="1"></div>
          <div class="field"><label>Periodicidade</label><select class="input" name="period"><option value="1">Mensal</option><option value="2">Bimestral</option><option value="3">Trimestral</option><option value="6">Semestral</option><option value="12">Anual</option></select></div>
          <div class="field"><label>Data inicial</label><input class="input" name="start_date" data-mask="date" value="${B.mask.toBr(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10))}"></div>
          <div class="field"><label>1º vencimento</label><input class="input" name="first_due" data-mask="date"></div>
          <div class="field"><label>Série (lastro)</label><select class="input" name="series">${open.length ? open.map((s) => `<option value="${esc(s.id)}">${esc(B.serie(s.emission, s.series))} · livre ${brl(s.available)}</option>`).join('') : '<option value="">Nenhuma série aberta</option>'}</select></div></div></div>
        <div class="fsec" id="sched" style="display:none"></div>
        ${B.commission.html(origs)}
        <div class="error-box" id="nf-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Criar operação</button>' });
    const f = box.querySelector('#nf'), err = box.querySelector('#nf-err'), sched = box.querySelector('#sched');
    B.rateUnit(f.rate);
    let manual = null, tmr = null;
    const isFf = () => f.instrument.value === 'fluxo_futuro';
    const party = (list, sel) => (sel.value === '' ? null : list[+sel.value]);
    const payload = () => { const c = party(ceds, f.ced), s = party(sacs, f.sac);
      return { instrument: f.instrument.value, rate_kind: isFf() ? f.rk.value : 'pre', rate_index: isFf() && f.rk.value === 'pos' ? f.ri.value : null, amount: num(f.amount.value), monthly_rate: B.rateMonthly(f.rate), n: isFf() ? 1 : parseInt(f.n.value, 10) || 1, period_months: isFf() ? 1 : parseInt(f.period.value, 10) || 1, first_due: isFf() ? B.mask.iso(f.start_date) : B.mask.iso(f.first_due), start_date: B.mask.iso(f.start_date),
        installments: manual, series_id: f.series.value || null,
        cedente: { cnpj: c ? c.cnpj : '', legal_name: c ? c.legal_name : '' }, sacado: { cnpj: s ? s.cnpj : '', legal_name: s ? s.legal_name : '' } }; };
    const showErr = (m) => { err.hidden = !m; err.textContent = m || ''; };
    const isCf = () => f.instrument.value === 'confissao_divida';
    const periodHtml = f.period.innerHTML;
    let recv = null;
    const cfOps = () => {
      const c = party(ceds, f.ced), host = box.querySelector('#cf-ops');
      if (!recv) { host.textContent = 'Carregando…'; return; }
      const by = {}; recv.filter((x) => x.status !== 'paid' && x.status !== 'cancelled' && c && x.cedente === c.legal_name).forEach((x) => { const o = (by[x.operation_id] = by[x.operation_id] || { id: x.operation_id, doc: x.document, n: 0, sum: 0, first: x.due_date, over: 0 }); o.n++; o.sum += Number(x.amount); if (String(x.due_date) < o.first) o.first = x.due_date; if (x.status === 'overdue') o.over++; });
      const ops = Object.values(by).sort((a, b) => String(a.first).localeCompare(String(b.first)));
      host.innerHTML = !c ? 'Escolha o cedente.' : ops.length ? ops.map((o) => `<label style="display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--line)"><input type="checkbox" data-cop="${esc(o.id)}" checked><span style="flex:1"><b>${esc(o.doc || 'Operação')}</b><span class="small muted"> · ${o.n} parcela(s) em aberto · 1º venc. ${esc(B.date(o.first))}${o.over ? ' · em atraso' : ''}</span></span><b>${brl(o.sum)}</b></label>`).join('') : 'Este cedente não tem parcelas em aberto.';
      box.querySelectorAll('[data-cop]').forEach((k) => (k.onchange = cfRefresh)); cfRefresh();
    };
    const cfPayload = () => ({ op_ids: [...box.querySelectorAll('[data-cop]:checked')].map((k) => k.dataset.cop), installments: parseInt(f.n.value, 10) || 0, frequency: f.period.value === 'w' ? 'weekly' : 'monthly', first_due: B.mask.iso(f.first_due) || '', monthly_rate: (num(f.rate.value) || 0) / 100, charges: num(f.charges.value) || 0, discount: num(f.discount.value) || 0 });
    let ctm; const cfRefresh = () => { clearTimeout(ctm); ctm = setTimeout(async () => {
      const prev = box.querySelector('#cf-prev'), p = cfPayload(); if (!p.op_ids.length) { prev.hidden = true; return; }
      try { const r = await rpc('partner_confissao_preview', { p }); prev.hidden = false;
        prev.innerHTML = `Saldo em aberto: <b>${brl(r.saldo)}</b> · Valor inicial da confissão: <b>${brl(r.principal)}</b>${(r.schedule || []).length ? `<div style="margin-top:6px">${r.schedule.map((x) => `${x.n}ª · ${esc(B.date(x.due_date))} · <b>${brl(x.amount)}</b>`).join('<br>')}</div>` : ''}`; } catch (e) { prev.hidden = false; prev.textContent = B.message(e); } }, 300); };
    const sync = () => {
      const cfm = isCf();
      box.querySelector('#cf-sec').style.display = cfm ? '' : 'none';
      [f.amount, f.start_date, f.series].forEach((i) => { i.closest('.field').style.display = cfm ? 'none' : ''; });
      const want = cfm ? '<option value="1">Mensal</option><option value="w">Semanal</option>' : periodHtml;
      if (f.period.dataset.m !== (cfm ? '1' : '0')) { f.period.innerHTML = want; f.period.dataset.m = cfm ? '1' : '0'; }
      if (cfm && !recv) { recv = false; rpc('partner_receivables', { p_view: 'open' }).then((d) => { recv = d.items || []; cfOps(); }).catch(() => { recv = []; cfOps(); }); }
      if (cfm && recv) cfOps();
      const loan = f.instrument.value !== 'cessao';
      box.querySelector('#sac-row').style.display = loan ? 'none' : '';
      box.querySelector('#amt-l').textContent = loan ? 'Valor liberado ao cedente' : 'Valor de face';
      box.querySelector('#esc-row').style.display = (f.instrument.value === 'nota_comercial' || f.instrument.value === 'ccb') ? '' : 'none';
      box.querySelector('#amt-l').textContent = loan ? 'Valor liberado ao cedente' : 'Valor de face';
      box.querySelector('#xml-row').style.display = loan ? 'none' : '';
      [f.n, f.period, f.first_due].forEach((i) => { i.closest('.field').style.display = isFf() ? 'none' : ''; });
      if (isFf()) box.querySelector('#amt-l').textContent = 'Valor inicial liberado';
      const pos = isFf() && f.rk.value === 'pos';
      box.querySelector('#rk-row').style.display = isFf() ? '' : 'none'; box.querySelector('#ri-row').style.display = pos ? '' : 'none';
      box.querySelector('#rate-l').textContent = pos ? 'Spread (acima do ' + (f.ri.value === 'ipca' ? 'IPCA' : 'CDI') + ')' : 'Taxa';
    };
    let nfe = null;
    box.querySelector('#xml-file').onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      nfe = null;
      if (file.size > 2 * 1024 * 1024) { showErr('Arquivo muito grande.'); return; }
      const r = parseNfe(await file.text());
      if (!r || !r.ok || !(r.total > 0)) { box.querySelector('#xml-name').textContent = 'Nenhum arquivo escolhido'; e.target.value = ''; showErr('Nota fiscal inválida. Confira o XML e tente de novo.'); return; }
      nfe = r; showErr('');
      box.querySelector('#xml-name').textContent = file.name;
      const ci = ceds.findIndex((c) => c.cnpj === r.emit.doc), si = sacs.findIndex((c) => c.cnpj === r.dest.doc);
      if (ci >= 0) f.ced.value = String(ci);
      if (si >= 0) f.sac.value = String(si);
      const items = r.dups.length ? r.dups : [{ number: '001', due_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), amount: r.total }];
      manual = items.map((d, k) => ({ number: d.number || String(k + 1).padStart(3, '0'), due_date: d.due_date, amount: d.amount }));
      f.amount.value = B.mask.fmtMoney(items.reduce((a, d) => a + d.amount, 0)); f.n.value = String(items.length); f.first_due.value = B.mask.toBr(items[0].due_date);
      draw();
      if (ci < 0 || si < 0) showErr('O cedente ou o sacado da nota ainda não está cadastrado. Cadastre e selecione para continuar.');
    };
    B.commission.bind(f, origs);
    const draw = async () => {
      if (isCf()) { sched.style.display = 'none'; sched.innerHTML = ''; return cfRefresh(); }
      if (isFf()) { const a0 = num(f.amount.value), r0 = B.rateMonthly(f.rate); sched.style.display = a0 > 0 ? '' : 'none';
        sched.innerHTML = a0 > 0 ? `<h3>Resumo</h3><div class="sumcard"><span class="lbl">Você paga ao cedente</span><span class="big">${brl(a0)}</span><div class="sub"><span>${f.rk.value === 'pos' ? `Juros compostos de <b>${f.ri.value === 'ipca' ? 'IPCA' : 'CDI'} + ${(r0 * 100).toFixed(2).replace('.', ',')}% a.m.</b> (spread equivalente a ${((Math.pow(1 + r0, 12) - 1) * 100).toFixed(2).replace('.', ',')}% a.a.), apurados por dia a partir da data inicial` : `Juros compostos de <b>${(r0 * 100).toFixed(2).replace('.', ',')}% a.m.</b> correndo por dia, a partir da data inicial`}</span></div></div><div class="help">Sem data de vencimento: a operação só encerra quando os recebimentos (pelo extrato) cobrirem o valor atualizado.</div>` : ''; return; }
      const p = payload();
      if (!(p.amount > 0) || !p.first_due) { sched.style.display = 'none'; sched.innerHTML = ''; return; }
      const keepOpen = !!(sched.querySelector('details') && sched.querySelector('details').open);
      try {
        const r = await rpc('partner_manual_preview', { p });
        showErr('');
        sched.style.display = '';
        sched.innerHTML = `<h3>Resumo</h3><div class="sumcard"><span class="lbl">Você paga ao cedente</span><span class="big">${brl(r.net)}</span>
          <div class="sub"><span>Valor de face <b>${brl(r.gross)}</b></span><span>Deságio <b>${brl(r.discount)}</b></span></div></div>
          <details class="inst"><summary>Parcelas (${r.items.length}) · editar datas e valores</summary>${r.items.map((i, k) => `<div class="inst-row"><span class="n">${esc(i.number)}</span>
          <input class="input" data-mask="date" data-k="${k}" data-f="due_date" value="${esc(B.mask.toBr(i.due_date))}"><input class="u-right input" data-mask="money" data-k="${k}" data-f="amount" value="${B.mask.fmtMoney(i.amount)}"></div>`).join('')}</details>`;
        if (keepOpen) sched.querySelector('details').open = true;
        B.mask.attach(sched);
        sched.querySelectorAll('[data-k]').forEach((inp) => (inp.onchange = () => {
          const it = (manual || (manual = r.items.map((i) => ({ number: i.number, due_date: i.due_date, amount: i.amount }))))[inp.dataset.k];
          if (inp.dataset.f === 'amount') it.amount = num(inp.value); else { const iso = B.mask.iso(inp); if (!iso) return; it.due_date = iso; }
          draw();
        }));
      } catch (e) { showErr(B.message(e)); }
    };
    ['rk', 'ri'].forEach((k) => f[k].addEventListener('change', () => redo(false)));
    const redo = (reset) => { if (reset) manual = null; sync(); clearTimeout(tmr); tmr = setTimeout(draw, 250); };
    ['charges', 'discount'].forEach((k) => { f[k].addEventListener('input', cfRefresh); f[k].addEventListener('change', cfRefresh); });
    f.ced.addEventListener('change', () => { if (isCf()) cfOps(); });
    ['instrument', 'amount', 'rate', 'n', 'period', 'first_due', 'start_date'].forEach((k) => { const h = () => { if (k === 'start_date') return redo(false); if (nfe && k !== 'rate' && k !== 'instrument') return; redo(true); }; f[k].addEventListener('input', h); f[k].addEventListener('change', h); });
    sync();
    box.querySelectorAll('[data-new]').forEach((b) => (b.onclick = () => { closeModal(); location.hash = `#/cadastros/${b.dataset.new}/novo`; }));
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      if (isCf()) {
        const cp = cfPayload();
        if (!party(ceds, f.ced)) return showErr('Selecione o cedente.');
        if (!cp.op_ids.length) return showErr('Selecione ao menos uma operação.');
        if (cp.installments < 1 || cp.installments > 120) return showErr('Informe o número de parcelas (1 a 120).');
        if (!cp.first_due || cp.first_due < new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)) return showErr('O 1º vencimento deve ser hoje ou depois.');
        const okc = await B.confirmAction({ title: 'Gerar confissão de dívida', text: 'As parcelas em aberto das operações selecionadas serão baixadas por novação e a nova operação será criada. Isso não pode ser desfeito por aqui.', confirmLabel: 'Gerar confissão' });
        if (okc == null) return;
        try { await run(ev.currentTarget, () => rpc('partner_confissao_create', { p: cp }), 'Confissão de dívida criada'); closeModal(); onDone && onDone(); } catch (e) { showErr(B.message(e)); }
        return;
      }
      const p = payload();
      if (!p.cedente.cnpj) return showErr('Selecione o cedente.');
      if (p.instrument === 'cessao' && !p.sacado.cnpj) return showErr('Selecione o sacado.');
      if (!(p.amount > 0) || !p.first_due) return showErr('Informe valor, parcelas e o primeiro vencimento.');
      if (!p.start_date) return showErr('Informe a data inicial.');
      if (p.instrument === 'fluxo_futuro' && !(p.monthly_rate > 0)) return showErr('Informe a taxa.');
      if (open.length && !p.series_id) return showErr('Escolha a série (lastro).');
      if (p.instrument === 'nota_comercial' && !f.esc.value) return showErr('Selecione ou cadastre o escriturador.');
      try {
        const r = await run(ev.currentTarget, () => rpc('partner_manual_create', { p }), 'Operação criada');
        if (p.instrument === 'cessao' && nfe) {
          let bad = false;
          try {
            await rpc('partner_op_attach_nfe', { p_op: r.id, p: { access_key: nfe.key, number: nfe.number, issued_at: nfe.issued_at } });
          } catch (e2) { bad = /nfe_invalid|nfe_duplicate/.test(String(e2 && e2.message)); }
          if (bad) { try { await rpc('partner_manual_discard', { p_op: r.id }); } catch (_) { /* segue */ } return showErr('Nota fiscal inválida. A operação não foi criada.'); }
        }
        const c = B.commission.read(f);
        if (c.originator_id || f.esc.value) { try { await rpc('partner_op_set_meta', { p_op: r.id, p: { escriturador_id: f.esc.value || null, ...c } }); } catch (_) { /* a operação já foi criada */ } }
        const ec = f.esc_cost ? B.mask.parse(f.esc_cost.value) : 0;
        if (ec > 0 && f.esc.value) { try { await rpc('partner_op_set_escrituracao', { p_op: r.id, p_amount: ec }); } catch (_) { /* a operação já foi criada */ } }
        closeModal(); onDone && onDone(r);
      } catch (e) { showErr(B.message(e)); }
    };
  };
  /* XML em lote: cada NF-e vira uma operação "em análise"; cedente (emitente) e sacado (destinatário) são cadastrados com os dados do XML */
  B.batchXml = async function (onDone) {
    const series = (await rpc('partner_series_list').catch(() => [])).filter((s) => s.status === 'open');
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const box = B.drawer({ title: 'Enviar XML em lote', subtitle: 'Cada nota vira uma operação em análise. Cedente e sacado são cadastrados com os dados do XML.',
      body: `<form id="bf" novalidate>
        <div class="fsec"><h3>Condições</h3><div class="fgrid">
          <div class="field"><label>Taxa</label>${B.affix('<input class="input" name="rate" data-mask="rate" placeholder="0,00">', { suf: '% a.m.' })}</div>
          <div class="field"><label>Data inicial</label><input class="input" name="start_date" data-mask="date" value="${B.mask.toBr(today)}"></div>
          <div class="field full"><label>Série (lastro)</label><select class="input" name="series">${series.length ? series.map((s) => `<option value="${esc(s.id)}">${esc(B.serie(s.emission, s.series))} · livre ${brl(s.available)}</option>`).join('') : '<option value="">Nenhuma série aberta</option>'}</select></div></div></div>
        <div class="fsec"><h3>Notas fiscais</h3><label class="filebox"><input type="file" id="bx" accept=".xml,text/xml,application/xml" multiple hidden><span class="btn secondary sm">Escolher XMLs</span><span class="fname" id="bx-n">Você pode escolher vários arquivos</span></label>
          <div id="bx-list" class="u-mt10"></div></div>
        <div class="error-box" id="bf-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Fechar</button><button class="btn" data-act="ok" disabled>Criar operações</button>' });
    const f = box.querySelector('#bf'), err = box.querySelector('#bf-err'), list = box.querySelector('#bx-list'), ok = box.querySelector('[data-act=ok]');
    B.rateUnit(f.rate);
    const showErr = (m) => { err.hidden = !m; err.textContent = m || ''; };
    let rows = [], busy = false;
    const draw = () => {
      list.innerHTML = rows.map((r) => `<div class="small" style="display:flex;gap:8px;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line,#eee)"><span><b>${esc(r.nfe ? (r.nfe.emit.name || r.name) : r.name)}</b><span class="muted" style="display:block">${r.nfe ? `NF ${esc(r.nfe.number)} → ${esc(r.nfe.dest.name)} · ${brl(r.nfe.total)}` : ''}</span></span>
        <span style="text-align:right;color:${r.state === 'err' ? 'var(--danger)' : r.state === 'done' ? 'var(--success)' : 'inherit'}">${esc(r.msg)}</span></div>`).join('');
      const n = rows.filter((r) => r.state === 'ready').length;
      ok.disabled = busy || !n; ok.textContent = n ? `Criar ${n} ${n === 1 ? 'operação' : 'operações'}` : 'Criar operações';
    };
    const MSG = { nfe_duplicate: 'Nota já está no sistema', nfe_invalid: 'Nota fiscal inválida', series_full: 'Série sem saldo suficiente', invalid_input: 'Dados da nota incompletos' };
    box.querySelector('#bx').onchange = async (e) => {
      const files = [...e.target.files].slice(0, 100); e.target.value = '';
      if (!files.length) return;
      box.querySelector('#bx-n').textContent = `${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'}`;
      rows = [];
      for (const file of files) {
        const row = { name: file.name, state: 'err', msg: '', nfe: null };
        rows.push(row);
        if (file.size > 2 * 1024 * 1024) { row.msg = 'Arquivo muito grande'; continue; }
        const r = parseNfe(await file.text());
        if (!r || !r.ok || !(r.total > 0)) { row.msg = 'XML inválido ou nota não autorizada'; continue; }
        if (!r.emit.doc || r.emit.doc.length !== 14) { row.msg = 'Emitente precisa ter CNPJ'; continue; }
        if (!r.dest.doc || !r.dest.name) { row.msg = 'Nota sem destinatário'; continue; }
        if (rows.some((x) => x !== row && x.nfe && x.nfe.key === r.key)) { row.msg = 'Arquivo repetido'; continue; }
        row.nfe = r; row.state = 'ready'; row.msg = 'Pronta';
      }
      try {
        const dup = await rpc('partner_nfe_keys_exist', { p_keys: rows.filter((r) => r.nfe).map((r) => r.nfe.key) });
        rows.forEach((r) => { if (r.nfe && dup.includes(r.nfe.key)) { r.state = 'err'; r.msg = 'Nota já está no sistema'; } });
      } catch (_) { /* o servidor confere de novo ao criar */ }
      draw();
    };
    box.querySelector('[data-act=cancel]').onclick = () => { closeModal(); if (done) onDone && onDone(); };
    let done = 0;
    ok.onclick = async () => {
      const rate = B.rateMonthly(f.rate), start = B.mask.iso(f.start_date);
      if (!(rate > 0)) return showErr('Informe a taxa.');
      if (!start) return showErr('Informe a data inicial.');
      if (series.length && !f.series.value) return showErr('Escolha a série (lastro).');
      showErr(''); busy = true; ok.disabled = true;
      let newC = 0, newS = 0;
      for (const r of rows.filter((x) => x.state === 'ready')) {
        r.msg = 'Criando…'; draw();
        const n = r.nfe, items = (n.dups.length ? n.dups : [{ number: '001', due_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), amount: n.total }])
          .map((d, k) => ({ number: d.number || String(k + 1).padStart(3, '0'), due_date: d.due_date, amount: d.amount }));
        try {
          const res = await rpc('partner_xml_import', { p: { monthly_rate: rate, start_date: start, series_id: f.series.value || null, installments: items,
            nfe: { key: n.key, number: n.number, issued_at: n.issued_at }, cedente: { cnpj: n.emit.doc, legal_name: n.emit.name }, sacado: { cnpj: n.dest.doc, legal_name: n.dest.name } } });
          r.state = 'done'; done++; r.msg = 'Em análise ✓'; if (res.cedente_new) newC++; if (res.sacado_new) newS++;
        } catch (e) { r.state = 'err'; r.msg = MSG[String(e && e.message).replace(/^.*?(nfe_duplicate|nfe_invalid|series_full|invalid_input).*$/, '$1')] || B.message(e); }
      }
      busy = false; draw();
      B.toast(`${done} ${done === 1 ? 'operação criada' : 'operações criadas'}${newC ? ` · ${newC} ${newC === 1 ? 'cedente cadastrado' : 'cedentes cadastrados'}` : ''}${newS ? ` · ${newS} ${newS === 1 ? 'sacado cadastrado' : 'sacados cadastrados'}` : ''}`);
      if (rows.every((x) => x.state === 'done')) { closeModal(); onDone && onDone(); }
    };
    B.mask.attach(box);
  };
})();
