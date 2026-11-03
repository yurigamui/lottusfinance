/* Lottus Partners — Nova operação manual: Contrato de Cessão, Nota Comercial ou CCB */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, run, closeModal } = B;
  const KIND = { cessao: 'Contrato de Cessão', nota_comercial: 'Nota Comercial', ccb: 'CCB' };
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

  B.newOperation = async function (onDone) {
    const [series, ceds, sacs, escs, origs] = await Promise.all([rpc('partner_series_list').catch(() => []), Promise.all([rpc('partner_parties_list', { p_kind: 'cedente' }).catch(() => []), rpc('partner_app_cedentes').catch(() => [])]).then(([a, b]) => [...a, ...b]), rpc('partner_parties_list', { p_kind: 'sacado' }).catch(() => []),
      rpc('partner_parties_list', { p_kind: 'escriturador' }).catch(() => []), rpc('partner_originators_list').catch(() => [])]);
    const open = series.filter((s) => s.status === 'open');
    const partyOpts = (list) => `<option value="">Selecione…</option>` + list.map((x, i) => `<option value="${i}">${esc(x.legal_name || x.cnpj)} · ${esc(fmtCnpj(x.cnpj))}${x.source === 'app' ? ' · do app' : ''}</option>`).join('');
    const box = B.drawer({ title: 'Nova operação', subtitle: 'Escolha as partes; o sistema calcula as parcelas.',
      body: `<form id="nf" novalidate>
        <div class="fsec"><h3>Tipo</h3>${B.seg('instrument', Object.entries(KIND), 'cessao')}</div>
        <div class="fsec"><h3>Partes</h3>
          <div class="field"><label>Cedente</label><select class="input" name="ced">${partyOpts(ceds)}</select>
            <button type="button" class="linkbtn" data-new="cedente">${ceds.length ? '+ Cadastrar nova empresa' : 'Nenhum cedente ainda: cadastrar empresa'}</button></div>
          <div class="field" id="sac-row"><label>Sacado</label><select class="input" name="sac">${partyOpts(sacs)}</select>
            <button type="button" class="linkbtn" data-new="sacado">+ Cadastrar nova empresa</button></div></div>
        <div class="fsec" id="esc-row" style="display:none"><h3>Escriturador</h3><select class="input" name="esc"><option value="">Selecione…</option>${escs.map((e) => `<option value="${esc(e.id)}">${esc(e.legal_name)}</option>`).join('')}</select>
          <button type="button" class="linkbtn" data-new="escriturador">${escs.length ? '+ Cadastrar novo escriturador' : 'Nenhum escriturador ainda: cadastrar'}</button>
          <div class="u-mt10 field"><label>Custo de escrituração</label>${B.affix('<input class="input" name="esc_cost" data-mask="money" placeholder="0,00">', { pre: 'R$' })}<div class="help">Valor que deve ser repassado ao escriturador. Vai para a Tesouraria.</div></div></div>
        <div class="fsec" id="xml-row"><h3>Nota fiscal (opcional)</h3><label class="filebox"><input type="file" id="xml-file" accept=".xml,text/xml,application/xml" hidden><span class="btn secondary sm">Importar XML da NF-e</span><span class="fname" id="xml-name">Preenche valores e vencimentos</span></label></div>
        <div class="fsec"><h3>Valores</h3><div class="fgrid">
          <div class="field full"><label id="amt-l">Valor de face</label>${B.affix('<input class="input" name="amount" data-mask="money" placeholder="0,00">', { pre: 'R$' })}</div>
          <div class="field"><label>Taxa</label>${B.affix('<input class="input" name="rate" data-mask="rate" placeholder="0,00">', { suf: '% a.m.' })}</div>
          <div class="field"><label>Parcelas</label><input class="input" name="n" data-mask="int" value="1"></div>
          <div class="field"><label>1º vencimento</label><input class="input" name="first_due" data-mask="date"></div>
          <div class="field"><label>Série (lastro)</label><select class="input" name="series">${open.length ? open.map((s) => `<option value="${esc(s.id)}">${esc(s.emission)} · ${esc(s.series)} · livre ${brl(s.available)}</option>`).join('') : '<option value="">Nenhuma série aberta</option>'}</select></div></div></div>
        <div class="fsec" id="sched" style="display:none"></div>
        ${B.commission.html(origs)}
        <div class="error-box" id="nf-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Criar operação</button>' });
    const f = box.querySelector('#nf'), err = box.querySelector('#nf-err'), sched = box.querySelector('#sched');
    let manual = null, tmr = null;
    const party = (list, sel) => (sel.value === '' ? null : list[+sel.value]);
    const payload = () => { const c = party(ceds, f.ced), s = party(sacs, f.sac);
      return { instrument: f.instrument.value, amount: num(f.amount.value), monthly_rate: num(f.rate.value) / 100, n: parseInt(f.n.value, 10) || 1, first_due: B.mask.iso(f.first_due),
        installments: manual, series_id: f.series.value || null,
        cedente: { cnpj: c ? c.cnpj : '', legal_name: c ? c.legal_name : '' }, sacado: { cnpj: s ? s.cnpj : '', legal_name: s ? s.legal_name : '' } }; };
    const showErr = (m) => { err.hidden = !m; err.textContent = m || ''; };
    const sync = () => {
      const loan = f.instrument.value !== 'cessao';
      box.querySelector('#sac-row').style.display = loan ? 'none' : '';
      box.querySelector('#amt-l').textContent = loan ? 'Valor liberado ao cedente' : 'Valor de face';
      box.querySelector('#esc-row').style.display = (f.instrument.value === 'nota_comercial' || f.instrument.value === 'ccb') ? '' : 'none';
      box.querySelector('#xml-row').style.display = loan ? 'none' : '';
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
    const redo = (reset) => { if (reset) manual = null; sync(); clearTimeout(tmr); tmr = setTimeout(draw, 250); };
    ['instrument', 'amount', 'rate', 'n', 'first_due'].forEach((k) => { f[k].addEventListener('input', () => { if (nfe && k !== 'rate' && k !== 'instrument') return; redo(true); }); f[k].addEventListener('change', () => { if (nfe && k !== 'rate' && k !== 'instrument') return; redo(true); }); });
    sync();
    box.querySelectorAll('[data-new]').forEach((b) => (b.onclick = () => { closeModal(); location.hash = `#/cadastros/${b.dataset.new}/novo`; }));
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      const p = payload();
      if (!p.cedente.cnpj) return showErr('Selecione o cedente.');
      if (p.instrument === 'cessao' && !p.sacado.cnpj) return showErr('Selecione o sacado.');
      if (!(p.amount > 0) || !p.first_due) return showErr('Informe valor, parcelas e o primeiro vencimento.');
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
})();
