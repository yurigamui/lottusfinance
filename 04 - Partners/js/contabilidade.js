/* Lottus Partners — Contabilidade da Tesouraria.
   O usuário só vê a Conciliação bancária (na Tesouraria). Eventos contábeis e plano de contas ficam em Configurações,
   e o balancete é extraído em Início › Relatórios. Os movimentos do sistema viram lançamentos sozinhos (partner_acct_post). */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, toast, run, closeModal } = B;
  const { empty } = B.ui;
  const num = (v) => Number(v || 0);
  const canSign = (me) => me.can_sign !== false;
  const post = async () => { try { await rpc('partner_acct_post'); } catch (_) { /* sem lançamentos automáticos agora */ } };
  const depth = (code) => code.split('.').length - 1;
  const csvNum = (v) => num(v).toFixed(2).replace('.', ',');
  const msg = (e) => (e && e.message === 'duplicate_code' ? 'Já existe um cadastro com este nome ou código.' : e && e.message === 'in_use' ? 'Esta conta tem lançamentos, subcontas ou é do sistema. Desative em vez de excluir.' : e && e.message === 'has_entries' ? 'Conta com lançamentos não pode virar sintética.' : e && e.message === 'system_account' ? 'Conta do sistema: só o nome pode mudar.' : B.message(e));

  /* ---------------- extrato: OFX e CSV ---------------- */
  const parseNum = (t) => {
    let s = String(t || '').trim().replace(/[R$\s]/g, ''); if (!s) return NaN;
    let neg = false; if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
    const v = parseFloat(s); return neg ? -v : v;
  };
  const parseDate = (t) => {
    const s = String(t || '').trim(); let m;
    if ((m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s))) return `${m[3]}-${m[2]}-${m[1]}`;
    if ((m = /^(\d{2})-(\d{2})-(\d{4})/.exec(s))) return `${m[3]}-${m[2]}-${m[1]}`;
    return null;
  };
  /* OFX da Trio: cada Pix gera duas linhas com o mesmo FITID (o valor "IN"/"OUT" e a tarifa "FEE"), então a chave é FITID + tipo.
     O memo vem como "IN CNPJ 1694… ISPB 8146… AG 730 CC 41099-6 E… EXTERNAL ID …". */
  const fmtDoc = (t, d) => (t === 'CNPJ' && /^\d{14}$/.test(d) ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d);
  function ofxMemo(memo) {
    const m = /^(IN|OUT|FEE)\s+(CNPJ|CPF)\s+(\S+)(?:\s+ISPB\s+(\S+))?(?:\s+AG\s+(\S+))?(?:\s+CC\s+(\S+))?/i.exec(memo || '');
    if (!m) return { type: '', text: String(memo || '').trim() };
    const type = m[1].toUpperCase(), what = type === 'IN' ? 'Pix recebido' : type === 'OUT' ? 'Pix enviado' : 'Tarifa Pix';
    const bank = [m[5] ? `Ag ${m[5]}` : '', m[6] ? `CC ${m[6]}` : ''].filter(Boolean).join(' ');
    return { type, text: `${what} · ${m[2].toUpperCase()} ${fmtDoc(m[2].toUpperCase(), m[3])}${m[4] ? ` · ISPB ${m[4]}` : ''}${bank ? ` · ${bank}` : ''}` };
  }
  function parseOfx(txt) {
    const g1 = (src, tag) => { const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(src); return m ? m[1].trim() : ''; };
    const rows = [], seen = {};
    (txt.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi) || []).forEach((b) => {
      const d = parseDate(g1(b, 'DTPOSTED')), v = parseNum(g1(b, 'TRNAMT'));
      if (!d || !isFinite(v) || v === 0) return;
      const memo = g1(b, 'MEMO') || g1(b, 'NAME'), mm = ofxMemo(memo), fit = g1(b, 'FITID');
      const key = fit ? `${fit}:${mm.type || g1(b, 'TRNTYPE') || 'X'}` : undefined;
      if (key) { seen[key] = (seen[key] || 0) + 1; }
      rows.push({ date: d, amount: v, description: (mm.text || memo).slice(0, 200), fitid: key && seen[key] > 1 ? `${key}#${seen[key]}` : key });
    });
    const bal = /<LEDGERBAL>[\s\S]*?<\/LEDGERBAL>/i.exec(txt);
    rows.meta = { account: g1(txt, 'ACCTID'), bank: g1(txt, 'BANKID'), from: parseDate(g1(txt, 'DTSTART')), to: parseDate(g1(txt, 'DTEND')), balance: bal ? parseNum(g1(bal[0], 'BALAMT')) : NaN };
    return rows;
  }
  function parseCsv(txt) {
    const lines = txt.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const delim = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length && lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
    const split = (l) => { const r = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === delim && !q) { r.push(cur); cur = ''; } else cur += ch; } r.push(cur); return r.map((c) => c.trim()); };
    const rows = lines.map(split);
    const hd = rows[0].map((c) => c.toLowerCase());
    const hasHead = hd.some((c) => /data|date|valor|amount|hist|descri/.test(c)) && !parseDate(rows[0][0]);
    const idx = (re, d) => { const i = hd.findIndex((c) => re.test(c)); return hasHead && i >= 0 ? i : d; };
    const iD = idx(/data|date/, 0), iV = idx(/valor|amount|value/, 2), iT = idx(/hist|descri|memo|lan[cç]/, 1), iC = hasHead ? hd.findIndex((c) => /cr[eé]dito/.test(c)) : -1, iDb = hasHead ? hd.findIndex((c) => /d[eé]bito/.test(c)) : -1;
    const out = [];
    rows.slice(hasHead ? 1 : 0).forEach((r) => {
      const d = parseDate(r[iD]); if (!d) return;
      const v = iC >= 0 && iDb >= 0 ? (parseNum(r[iC]) || 0) - Math.abs(parseNum(r[iDb]) || 0) : parseNum(r[iV]);
      if (!isFinite(v) || v === 0) return;
      out.push({ date: d, amount: v, description: String(r[iT] || '').slice(0, 200) });
    });
    return out;
  }

  /* ---------------- Conciliação bancária: lançamentos da Lottus × extrato, vários de cada lado ---------------- */
  const cst = { acc: '', view: 'pending', selL: new Set(), selR: new Set() };
  const ikey = (i) => `${i.kind}|${i.ref}`;
  async function conciliacao(host, me) {
    await post();
    const accounts = await rpc('partner_bank_accounts').catch(() => []);
    if (!accounts.length) { host.innerHTML = `<div class="card">${empty('Cadastre uma conta em Configurações › Banco para conciliar o extrato.')}</div>`; return; }
    if (!accounts.some((a) => a.id === cst.acc)) { cst.acc = accounts[0].id; cst.selL.clear(); cst.selR.clear(); }
    const w = canSign(me), again = () => conciliacao(host, me);
    const pendingView = cst.view === 'pending';
    const [rec, events, done] = await Promise.all([pendingView ? rpc('partner_bank_recon', { p_account: cst.acc }) : null, pendingView ? rpc('partner_acct_events') : [], pendingView ? null : rpc('partner_bank_lines', { p_account: cst.acc, p_status: cst.view })]);
    const lines = pendingView ? rec.lines : done.lines, items = pendingView ? rec.items : [];
    const nPend = pendingView ? lines.length : done.summary.pending;
    host.innerHTML = `<div class="row" style="gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
        <select class="input" id="acc" style="max-width:280px" aria-label="Conta bancária">${accounts.map((a) => `<option value="${esc(a.id)}" ${a.id === cst.acc ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select>
        <div class="u-g6 row">${B.pill('data-v', 'pending', `A conciliar${nPend ? ' ' + nPend : ''}`, cst.view)}${B.pill('data-v', 'reconciled', 'Conciliadas', cst.view)}</div>
        <span style="margin-left:auto"></span>${w ? '<button class="btn" id="imp">Importar extrato (OFX)</button>' : ''}<input type="file" id="file" accept=".ofx,.ofc,.csv,.txt" hidden></div>
      <div id="body"></div>`;
    const sel = host.querySelector('#acc'); sel.onchange = (e) => { cst.acc = e.target.value; cst.selL.clear(); cst.selR.clear(); again(); };
    host.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { cst.view = b.dataset.v; again(); }));
    if (w) {
      const file = host.querySelector('#file');
      host.querySelector('#imp').onclick = () => file.click();
      const take = async (f) => {
        if (!f) return;
        const txt = await f.text();
        const isOfx = /<STMTTRN>/i.test(txt), rows = isOfx ? parseOfx(txt) : parseCsv(txt);
        if (!rows.length) return toast('Não encontrei lançamentos neste arquivo. Use OFX ou CSV com data, descrição e valor.', true);
        // O arquivo traz o número da conta: se bater com uma conta cadastrada, já seleciona ela
        const acct = isOfx && rows.meta ? String(rows.meta.account || '').replace(/\D/g, '') : '';
        const hit = acct ? accounts.filter((a) => String(a.label).replace(/\D/g, '').includes(acct)) : [];
        const target = hit.length === 1 ? hit[0].id : cst.acc;
        try { const r = await rpc('partner_bank_lines_import', { p_account: target, p_lines: rows.map((x) => ({ date: x.date, amount: x.amount, description: x.description, fitid: x.fitid })) });
          cst.acc = target; cst.view = 'pending'; toast(`${r.imported} linhas importadas${r.matched ? `, ${r.matched} conciliadas sozinhas` : ''}${rows.length - r.imported > 0 ? ` · ${rows.length - r.imported} já estavam no sistema` : ''}`); again(); } catch (e) { toast(msg(e), true); }
      };
      file.onchange = () => { const f = file.files[0]; file.value = ''; take(f); };
      host.ondragover = (e) => e.preventDefault();
      host.ondrop = (e) => { e.preventDefault(); take(e.dataTransfer && e.dataTransfer.files[0]); };
    }
    const body = host.querySelector('#body');
    if (!pendingView) return doneList(body, done.lines, w, again);

    // ids que sumiram (conciliados) saem da seleção
    const idsR = new Set(lines.map((l) => l.id)), idsL = new Set(items.map(ikey));
    [...cst.selR].forEach((k) => { if (!idsR.has(k)) cst.selR.delete(k); }); [...cst.selL].forEach((k) => { if (!idsL.has(k)) cst.selL.delete(k); });
    const paint = () => {
      const pl = B.ui.pager('rec-l' + cst.acc, items, { unit: items.length === 1 ? 'lançamento' : 'lançamentos' });
      const pr = B.ui.pager('rec-r' + cst.acc, lines, { unit: lines.length === 1 ? 'linha' : 'linhas' });
      const sumL = items.filter((i) => cst.selL.has(ikey(i))).reduce((t, i) => t + num(i.amount), 0), sumR = lines.filter((l) => cst.selR.has(l.id)).reduce((t, l) => t + num(l.amount), 0);
      const diff = Math.round((sumL - sumR) * 100) / 100, ready = w && cst.selL.size > 0 && cst.selR.size > 0 && Math.abs(diff) < 0.005;
      const one = lines.length && cst.selR.size === 1 ? lines.find((l) => cst.selR.has(l.id)) : null;
      const col = (v) => (num(v) < 0 ? 'var(--danger)' : 'var(--success)');
      body.innerHTML = `<div class="rec-grid">
          <div class="u-p0 card"><div class="rec-head"><b>Lançado na Lottus</b><span class="u-g10c row">${w && cst.selL.size ? `<button class="btn ghost sm" type="button" id="dis-l">Remover (${cst.selL.size})</button>` : ''}<label class="small muted"><input type="checkbox" data-all="L" ${pl.rows.length && pl.rows.every((i) => cst.selL.has(ikey(i))) ? 'checked' : ''}> Página</label></span></div>
            ${pl.rows.length ? pl.rows.map((i) => `<label class="rec-row ${cst.selL.has(ikey(i)) ? 'on' : ''}"><input type="checkbox" data-l="${esc(ikey(i))}" ${cst.selL.has(ikey(i)) ? 'checked' : ''}>
              <span class="grow"><b>${esc(i.who || i.label)}</b><span class="small muted" style="display:block">${esc(i.who ? i.label : '')}${i.who ? ' · ' : ''}${esc(date(i.date))}${i.state === 'pending' ? ' · <span class="tag warning">A pagar</span>' : ''}${one && Math.abs(num(i.amount) - num(one.amount)) < 0.005 ? ' · <span class="tag success">mesmo valor</span>' : ''}</span></span>
              ${w && i.state === 'pending' && num(i.amount) < 0 && i.kind !== 'avulso' ? `<a href="#" class="linkbtn" data-pay="${esc(ikey(i))}">Pagar</a>` : ''}<b style="color:${col(i.amount)}">${brl(i.amount)}</b></label>`).join('') : empty('Nenhum lançamento a conciliar.')}
            ${pl.bar}</div>
          <div class="u-p0 card"><div class="rec-head"><b>Extrato do banco</b><span class="u-g10c row">${w && cst.selR.size ? `<button class="btn ghost sm" type="button" id="del-r">Excluir (${cst.selR.size})</button>` : ''}<label class="small muted"><input type="checkbox" data-all="R" ${pr.rows.length && pr.rows.every((l) => cst.selR.has(l.id)) ? 'checked' : ''}> Página</label></span></div>
            ${pr.rows.length ? pr.rows.map((l) => `<label class="rec-row ${cst.selR.has(l.id) ? 'on' : ''}"><input type="checkbox" data-r="${esc(l.id)}" ${cst.selR.has(l.id) ? 'checked' : ''}>
              <span class="grow"><b>${esc(l.description)}</b><span class="small muted" style="display:block">${esc(date(l.date))}${w ? ` · <a href="#" class="linkbtn" data-fix="${esc(l.id)}">Classificar</a>` : ''}</span></span>
              <b style="color:${col(l.amount)}">${brl(l.amount)}</b></label>`).join('') : empty('Nenhuma linha no extrato. Use “Importar extrato (OFX)” ou arraste o arquivo para cá.')}
            ${pr.bar}</div></div>
        <div class="u-mt14 card rec-foot"><span class="small">Lottus <b>${brl(sumL)}</b> · Extrato <b>${brl(sumR)}</b> · ${cst.selL.size || cst.selR.size ? (Math.abs(diff) < 0.005 ? '<span class="u-success">valores iguais ✓</span>' : `diferença <b class="u-danger">${brl(Math.abs(diff))}</b>`) : '<span class="muted">selecione os dois lados</span>'}</span>
          ${w ? `<button class="btn" id="go" ${ready ? '' : 'disabled'}>Conciliar selecionados</button>` : ''}</div>`;
      B.ui.pagerBind(body.querySelectorAll('.rec-grid > .card')[0], 'rec-l' + cst.acc, paint);
      B.ui.pagerBind(body.querySelectorAll('.rec-grid > .card')[1], 'rec-r' + cst.acc, paint);
      body.querySelectorAll('[data-l]').forEach((c) => (c.onchange = () => { c.checked ? cst.selL.add(c.dataset.l) : cst.selL.delete(c.dataset.l); paint(); }));
      body.querySelectorAll('[data-r]').forEach((c) => (c.onchange = () => { c.checked ? cst.selR.add(c.dataset.r) : cst.selR.delete(c.dataset.r); paint(); }));
      body.querySelectorAll('[data-all]').forEach((c) => (c.onchange = () => {
        const L = c.dataset.all === 'L';
        (L ? pl.rows.map(ikey) : pr.rows.map((l) => l.id)).forEach((k) => (c.checked ? (L ? cst.selL : cst.selR).add(k) : (L ? cst.selL : cst.selR).delete(k))); paint();
      }));
      body.querySelectorAll('[data-pay]').forEach((a) => (a.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const it = items.find((i) => ikey(i) === a.dataset.pay); if (!it) return;
        if (it.kind === 'operacao') { location.hash = `#/assinar/${it.ref}/pagar`; return; }
        B.payItem(it.kind, it.ref, me, again);
      }));
      body.querySelectorAll('[data-fix]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); e.stopPropagation(); fixDrawer(lines.find((l) => l.id === a.dataset.fix), events, again); }));
      const dl = body.querySelector('#dis-l');
      if (dl) dl.onclick = async () => {
        const ok = await B.confirmAction({ title: 'Remover da conciliação', text: `${cst.selL.size} ${cst.selL.size === 1 ? 'lançamento sai' : 'lançamentos saem'} desta lista. O registro original (pagamento, integralização, parcela) não é alterado.`, confirmLabel: 'Remover' });
        if (ok == null) return;
        try { await run(dl, () => rpc('partner_bank_recon_dismiss', { p_items: items.filter((i) => cst.selL.has(ikey(i))).map((i) => ({ kind: i.kind, ref: i.ref })) }), 'Removido da lista'); cst.selL.clear(); again(); } catch (_) { /* já avisado */ }
      };
      const dr = body.querySelector('#del-r');
      if (dr) dr.onclick = async () => {
        const ok = await B.confirmAction({ title: 'Excluir do extrato', text: `${cst.selR.size} ${cst.selR.size === 1 ? 'linha é apagada' : 'linhas são apagadas'} do extrato importado. Importar o arquivo de novo traz as linhas de volta.`, confirmLabel: 'Excluir', danger: true });
        if (ok == null) return;
        try { await run(dr, () => rpc('partner_bank_lines_delete', { p_lines: [...cst.selR] }), 'Linhas excluídas'); cst.selR.clear(); again(); } catch (_) { /* já avisado */ }
      };
      const go = body.querySelector('#go');
      if (go) go.onclick = async () => {
        try {
          await run(go, () => rpc('partner_bank_reconcile', { p_account: cst.acc, p_lines: [...cst.selR], p_items: items.filter((i) => cst.selL.has(ikey(i))).map((i) => ({ kind: i.kind, ref: i.ref })) }), 'Conciliado');
          cst.selL.clear(); cst.selR.clear(); again();
        } catch (_) { /* já avisado */ }
      };
    };
    paint();
  }

  /* Conciliadas: lista com "Desfazer" */
  function doneList(body, lines, w, again) {
    const key = 'rec-d' + cst.view + cst.acc;
    const paint = () => {
      const pg = B.ui.pager(key, lines, { unit: lines.length === 1 ? 'linha' : 'linhas' });
      body.innerHTML = lines.length ? `<div class="card"><table><thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th><th></th></tr></thead><tbody>
        ${pg.rows.map((l) => `<tr><td>${esc(date(l.date))}</td><td>${esc(l.description)}${l.status === 'reconciled' ? `<div class="small muted">${l.match_kind === 'conta' ? esc(l.entry || 'Classificada') : l.match_kind === 'lote' ? 'Conciliada com lançamentos da Lottus' : 'Conciliada com um pagamento da Tesouraria'}</div>` : ''}</td>
          <td class="num" style="color:${num(l.amount) < 0 ? 'var(--danger)' : 'var(--success)'}"><b>${brl(l.amount)}</b></td>
          <td class="num">${w ? `<button class="btn ghost sm" data-undo="${esc(l.id)}">Desfazer</button>` : ''}</td></tr>`).join('')}</tbody></table>${pg.bar}</div>` : `<div class="card">${empty('Nenhuma linha ainda.')}</div>`;
      B.ui.pagerBind(body, key, paint);
      body.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = async () => {
        const ok = await B.confirmAction({ title: 'Desfazer a conciliação', text: 'O que foi gerado por ela é desfeito e a linha (e as outras conciliadas junto) volta para "A conciliar".', confirmLabel: 'Desfazer' });
        if (ok == null) return;
        try { await run(b, () => rpc('partner_bank_line_undo', { p_line: b.dataset.undo }), 'Conciliação desfeita'); again(); } catch (_) { /* já avisado */ }
      }));
    };
    paint();
  }

  async function fixDrawer(l, events, done) {
    const out = num(l.amount) < 0;
    const cands = out ? await rpc('partner_bank_line_candidates', { p_line: l.id }).catch(() => []) : [];
    const evs = events.filter((e) => e.active && e.has_bank && e.kind === (out ? 'pagamento' : 'recebimento'));
    const box = B.drawer({ title: out ? 'Conciliar saída' : 'Conciliar entrada', subtitle: `${esc(date(l.date))} · ${esc(l.description)} · <b>${brl(l.amount)}</b>`,
      body: `${cands.length ? `<div class="fsec"><h3>É um pagamento da Tesouraria?</h3><div class="u-p0 card">${cands.map((c, i) => `<div class="row between" style="gap:12px;padding:10px 14px;${i ? 'border-top:1px solid var(--line)' : ''}"><span><b>${esc(c.who)}</b><br><span class="small muted">${esc(c.label)}</span></span>${c.kind === 'operacao' ? '<span class="small muted">Pague pela operação</span>' : `<button class="btn sm" data-m="${esc(c.kind)}|${esc(c.ref_id)}">É este</button>`}</div>`).join('')}</div></div>` : ''}
        <div class="fsec"><h3>${cands.length ? 'Ou classifique' : 'O que foi esta movimentação?'}</h3>
          <div class="field"><label>Evento contábil</label><select class="input" id="ce">${evs.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Observação <span class="small muted">(opcional)</span></label><input class="input" id="ch" value="${esc(l.description)}"></div>
          <button class="btn" id="cls">Conciliar</button></div>
        <div class="row" style="gap:8px;margin-top:6px"><button class="btn ghost sm" id="ign">Ignorar linha</button><button class="btn ghost sm" id="del">Excluir linha</button></div>
        <div class="error-box" id="fe" hidden></div>`, foot: '' });
    const err = box.querySelector('#fe');
    const go = async (btn, fn, ok) => { try { await run(btn, fn, ok); closeModal(); done(); } catch (e) { err.hidden = false; err.textContent = msg(e); } };
    box.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { const [k, r] = b.dataset.m.split('|'); go(b, () => rpc('partner_bank_line_match', { p_line: l.id, p_kind: k, p_ref: r }), 'Conciliada'); }));
    box.querySelector('#cls').onclick = (e) => go(e.currentTarget, () => rpc('partner_bank_line_classify_event', { p_line: l.id, p_event: box.querySelector('#ce').value, p_history: box.querySelector('#ch').value }), 'Conciliada');
    box.querySelector('#ign').onclick = (e) => go(e.currentTarget, () => rpc('partner_bank_line_ignore', { p_line: l.id }), 'Linha ignorada');
    box.querySelector('#del').onclick = (e) => go(e.currentTarget, () => rpc('partner_bank_line_delete', { p_line: l.id }), 'Linha excluída');
  }

  /* ---------------- Balancete de verificação: extraído em Início › Relatórios ---------------- */
  function build(accounts) {
    const an = accounts.filter((a) => a.kind === 'analitica');
    return accounts.map((a) => {
      const src = a.kind === 'analitica' ? [a] : an.filter((x) => x.code.startsWith(a.code + '.'));
      const s = (k) => src.reduce((t, x) => t + num(x[k]), 0);
      const prev = s('prev'), d = s('debit'), c = s('credit');
      return { ...a, prev, d, c, cur: prev + d - c };
    });
  }
  /** Gera o balancete do período em 'csv' ou 'pdf' (só contas com saldo ou movimento) */
  async function balanceteExport(from, to, fmt, me) {
    // A janela do PDF abre já no clique, antes de buscar os dados (senão o navegador bloqueia)
    const w = fmt === 'pdf' ? window.open('', '_blank') : null;
    if (fmt === 'pdf') {
      if (!w) { toast('Permita janelas deste site para gerar o balancete.', true); return; }
      w.document.write('<p style="font-family:sans-serif;padding:24px">Montando o balancete…</p>');
    }
    try {
      await post();
      const data = await rpc('partner_acct_balancete', { p_from: from, p_to: to });
      const rows = build(data.accounts).filter((r) => Math.abs(r.prev) + r.d + r.c > 0.004 || Math.abs(r.cur) > 0.004);
      if (!rows.length) { if (w) w.close(); toast('Sem movimento contábil neste período.'); return; }
      const an = rows.filter((r) => r.kind === 'analitica');
      const T = { prev: 0, d: 0, c: 0, cur: 0 }; an.forEach((r) => { T.prev += r.prev; T.d += r.d; T.c += r.c; T.cur += r.cur; });
      if (fmt === 'csv') {
        B.csvFile(`balancete-${from}-${to}`, ['Código', 'Conta', 'D/C', 'Saldo anterior', 'Débito', 'Crédito', 'Saldo atual'],
          [...rows.map((r) => { const n = r.nature === 'C' ? -1 : 1; return [r.code, r.name, r.nature, csvNum(r.prev * n), csvNum(r.d), csvNum(r.c), csvNum(r.cur * n)]; }), ['', 'Totais', '', '', csvNum(T.d), csvNum(T.c), '']]);
        return;
      }
      /* PDF no padrão Lottus: cabeçalho, contas agrupadas (sintéticas em destaque), saldos na natureza da conta e resumo no fim */
      const f2 = (v) => (Math.abs(v) < 0.005 ? '0,00' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      const logo = await B.logoData();
      const fund = (me && me.funder) || {};
      const line = (r) => {
        const n = r.nature === 'C' ? -1 : 1, lvl = depth(r.code);
        return `<tr class="${r.kind === 'sintetica' ? `syn l${Math.min(lvl, 3)}` : ''}"><td class="code">${esc(r.code)}</td><td style="padding-left:${lvl * 3}px">${esc(r.name)}</td><td class="c">${esc(r.nature)}</td>
          <td class="num">${f2(r.prev * n)}</td><td class="num">${f2(r.d)}</td><td class="num">${f2(r.c)}</td><td class="num">${f2(r.cur * n)}</td></tr>`;
      };
      // Resumo: grupos de 1º nível e totais das contas devedoras e credoras
      const tops = rows.filter((r) => depth(r.code) === 0);
      const side2 = (nat) => an.filter((r) => r.nature === nat).reduce((t, r) => { const n = nat === 'C' ? -1 : 1; t.prev += r.prev * n; t.d += r.d; t.c += r.c; t.cur += r.cur * n; return t; }, { prev: 0, d: 0, c: 0, cur: 0 });
      const dv = side2('D'), cr = side2('C');
      const sum = (label, nat, v, cls) => `<tr class="${cls || ''}"><td>${esc(label)}</td><td class="c">${nat}</td><td class="num">${f2(v.prev)}</td><td class="num">${f2(v.d)}</td><td class="num">${f2(v.c)}</td><td class="num">${f2(v.cur)}</td></tr>`;
      const diff = { prev: dv.prev - cr.prev, d: dv.d - cr.d, c: dv.c - cr.c, cur: dv.cur - cr.cur };
      const ok = Math.abs(T.d - T.c) < 0.005;
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Balancete de verificação · ${esc(date(from))} a ${esc(date(to))}</title>
        <style>${B.DOC_CSS}
          @page { size: A4; margin: 12mm 12mm 16mm; @bottom-right { content: "Pág. " counter(page) " de " counter(pages); font: 8pt Inter, Arial, sans-serif; color: #6b605a; } }
          .bt { text-align: center; margin: 4px 0 10px; } .bt h1 { font-size: 15pt; margin: 0; letter-spacing: -.01em; } .bt div { font-size: 9.5pt; color: #4a403b; }
          .co { font-size: 8.5pt; color: #4a403b; padding: 6px 0 8px; border-bottom: 1px solid #ece8e1; margin-bottom: 8px; }
          table.bal { font-size: 7.6pt; margin: 0 0 14px; } table.bal th, table.bal td { padding: 3px 5px; border-bottom: 1px solid #f0ece5; line-height: 1.35; }
          table.bal th { background: #f7f5f1; color: #4a403b; font-size: 7.4pt; text-transform: none; border-bottom: 1.5px solid #c73053; }
          table.bal tr { break-inside: avoid; } table.bal td.code { white-space: nowrap; font-variant-numeric: tabular-nums; }
          table.bal td.c, table.bal th.c { text-align: center; width: 9mm; } table.bal td.num, table.bal th.num { font-variant-numeric: tabular-nums; }
          tr.syn td { font-weight: 700; background: #faf8f4; } tr.syn.l0 td { background: #f6dfe5; color: #8f1f3b; font-size: 8.2pt; } tr.syn.l1 td { background: #f5f2eb; }
          h2.rs { font-size: 10pt; letter-spacing: .05em; text-transform: uppercase; text-align: center; margin: 18px 0 6px; color: #231c1a; break-after: avoid; }
          table.res tr.tot td { font-weight: 700; border-top: 1.5px solid #231c1a; } table.res tr.dif td { font-weight: 700; background: #f6dfe5; }
          .stat { font-size: 8.5pt; margin: 6px 0; font-weight: 600; color: ${ok ? '#1f7a4d' : '#b3261e'}; }
        </style></head><body>
        ${B.docHead(logo, 'Contabilidade')}
        <div class="bt"><h1>Balancete de Verificação</h1><div>Período de ${esc(date(from))} a ${esc(date(to))}</div></div>
        <div class="co">${fund.cnpj ? `CNPJ: ${esc(B.cnpj(fund.cnpj))} · ` : ''}Empresa: ${esc(fund.legal_name || '')}</div>
        <table class="bal"><thead><tr><th>Código</th><th>Conta</th><th class="c">D/C</th><th class="num">Saldo anterior</th><th class="num">Débitos</th><th class="num">Créditos</th><th class="num">Saldo atual</th></tr></thead>
          <tbody>${rows.map(line).join('')}</tbody></table>
        <h2 class="rs">Resumo do balancete</h2>
        <table class="bal res"><thead><tr><th>Descrição</th><th class="c">D/C</th><th class="num">Saldo anterior</th><th class="num">Débitos</th><th class="num">Créditos</th><th class="num">Saldo atual</th></tr></thead><tbody>
          ${tops.map((r) => { const n = r.nature === 'C' ? -1 : 1; return sum(r.name, r.nature, { prev: r.prev * n, d: r.d, c: r.c, cur: r.cur * n }); }).join('')}
          ${sum('Contas devedoras', 'D', dv, 'tot')}${sum('Contas credoras', 'C', cr)}${sum('Diferença', '', diff, 'dif')}
        </tbody></table>
        <div class="stat">${ok ? 'O balancete fecha: o total de débitos é igual ao total de créditos.' : `Atenção: diferença de ${brl(Math.abs(T.d - T.c))} entre débitos e créditos.`}</div>
        <div class="foot">Gerado pela plataforma Lottus em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Saldos mostrados na natureza de cada conta (D = devedora, C = credora).</div>
        </body></html>`;
      w.document.open(); w.document.write(html); w.document.close();
      setTimeout(() => { try { w.focus(); w.print(); } catch { /* janela fechada */ } }, 600);
    } catch (e) {
      if (w) w.close();
      toast(B.message(e), true);
    }
  }

  /* ---------------- Configurações › Contabilidade: eventos contábeis e plano de contas ---------------- */
  const SUBS = [['eventos', 'Eventos Contábeis'], ['plano', 'Plano de Contas']];
  async function settingsPane(pane, adm, rawSub) {
    const sub = rawSub === 'plano' ? 'plano' : 'eventos';
    await post();
    const [events, chart] = await Promise.all([rpc('partner_acct_events'), rpc('partner_acct_chart')]);
    const analytic = chart.accounts.filter((a) => a.kind === 'analitica' && a.active && !a.bank_account_id);
    const again = () => settingsPane(pane, adm, sub);
    const pills = `<div class="u-g6mb14 row">${SUBS.map(([k, l]) => B.pill('data-csub', k, l, sub)).join('')}</div>`;
    const head = (title, text, btn) => `<div class="row between" style="gap:12px;flex-wrap:wrap;margin-bottom:12px"><div><h2 class="u-m0">${title}</h2><p class="u-m4t small muted">${text}</p></div>${btn}</div>`;
    if (sub === 'eventos') {
      const sum = (e) => e.lines.map((l) => `${l.side === 'D' ? 'D' : 'C'} ${esc(l.account)}${num(l.pct) < 100 ? ` (${num(l.pct)}%)` : ''}`).join(' · ');
      const list = events.filter((e) => e.active);
      pane.innerHTML = `${pills}<div class="card">${head('Eventos contábeis', 'Cada movimentação avulsa escolhe um evento, que decide quais contas são movimentadas. “Banco” usa a conta bancária escolhida na movimentação.', adm ? '<button class="btn" id="newev">Novo evento</button>' : '')}
        <table><thead><tr><th>Evento</th><th>Tipo</th><th>Contas movimentadas</th><th></th></tr></thead><tbody>
        ${list.map((e) => `<tr><td><b>${esc(e.name)}</b></td><td>${e.kind === 'pagamento' ? 'Pagamento' : 'Recebimento'}</td><td class="small muted">${sum(e)}</td><td class="num">${adm ? `<button class="btn ghost sm" data-ev="${esc(e.id)}">Editar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    } else {
      pane.innerHTML = `${pills}<div class="card">${head('Plano de contas', `${chart.accounts.length} contas · contabilidade desde ${esc(date(chart.start))}`, adm ? '<span class="u-g8 row"><button class="btn secondary" id="st">Data de início</button><button class="btn" id="newacc">Nova conta</button></span>' : '')}
        <table><thead><tr><th>Código</th><th>Conta</th><th>Natureza</th><th></th></tr></thead><tbody>
        ${chart.accounts.map((a) => `<tr class="${a.kind === 'sintetica' ? 'grp' : ''}${a.active ? '' : ' off'}"><td class="mono small">${esc(a.code)}</td><td style="padding-left:${8 + depth(a.code) * 14}px">${esc(a.name)}${a.bank_account_id ? ' <span class="tag">banco</span>' : ''}</td><td>${a.nature === 'D' ? 'Devedora' : 'Credora'}</td>
          <td class="num">${adm ? `<button class="btn ghost sm" data-acc="${esc(a.id)}">Editar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    }
    pane.querySelectorAll('[data-csub]').forEach((b) => (b.onclick = () => { location.hash = `#/config/contabilidade/${b.dataset.csub}`; }));
    if (!adm) return;
    const q = (s) => pane.querySelector(s);
    if (q('#newev')) q('#newev').onclick = () => eventModal(null, analytic, again);
    pane.querySelectorAll('[data-ev]').forEach((b) => (b.onclick = () => eventModal(events.find((e) => e.id === b.dataset.ev), analytic, again)));
    if (q('#newacc')) q('#newacc').onclick = () => accModal(null, again);
    if (q('#st')) q('#st').onclick = () => startModal(chart, again);
    pane.querySelectorAll('[data-acc]').forEach((b) => (b.onclick = () => accModal(chart.accounts.find((a) => a.id === b.dataset.acc), again)));
  }

  function eventModal(e, analytic, done) {
    const opts = (sel) => `<option value="">Banco</option>${analytic.map((a) => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(a.code)} · ${esc(a.name)}</option>`).join('')}`;
    const start = e ? e.lines : [{ account_id: analytic[0] ? analytic[0].id : '', side: 'D', pct: 100 }, { account_id: '', side: 'C', pct: 100 }];
    const box = B.modal({ title: e ? 'Editar evento' : 'Novo evento contábil', wide: true,
      body: `<form id="ef" novalidate>
        <div class="field"><label>Nome</label><input class="input" name="name" value="${esc(e ? e.name : '')}" placeholder="Ex.: Honorários contábeis" autocomplete="off"></div>
        ${e ? `<input type="hidden" name="kind" value="${esc(e.kind)}">` : `<div class="field"><label>Tipo</label>${B.seg('kind', [['pagamento', 'Pagamento'], ['recebimento', 'Recebimento']], 'pagamento')}</div>`}
        <div class="field"><label>Contas movimentadas</label><div id="ln"></div>
          <button class="u-mt6 btn ghost sm" type="button" id="addl">+ Adicionar conta</button>
          <div class="help" id="eh"></div></div><div class="error-box" id="ee" hidden></div></form>`,
      foot: `${e && !e.used ? '<button class="u-mr-auto btn ghost" data-act="del">Excluir</button>' : ''}<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar</button>` });
    const f = box.querySelector('#ef'), err = box.querySelector('#ee'), help = box.querySelector('#eh'), ln = box.querySelector('#ln');
    B.formInit(box);
    let lines = start.map((l) => ({ account_id: l.account_id || '', side: l.side, pct: num(l.pct) || 100 }));
    const draw = () => {
      ln.innerHTML = lines.map((l, i) => `<div class="row" style="gap:6px;margin-bottom:6px;align-items:center">
        <select class="input" data-i="${i}" data-k="side" style="max-width:110px" aria-label="Débito ou crédito"><option value="D" ${l.side === 'D' ? 'selected' : ''}>Débito</option><option value="C" ${l.side === 'C' ? 'selected' : ''}>Crédito</option></select>
        <select class="u-flex1 input" data-i="${i}" data-k="account_id" aria-label="Conta">${opts(l.account_id)}</select>
        <input class="input" data-i="${i}" data-k="pct" value="${l.pct}" inputmode="decimal" style="max-width:76px" aria-label="Percentual do valor"><span class="small muted">%</span>
        ${lines.length > 2 ? `<button class="btn ghost sm" type="button" data-rm="${i}" aria-label="Remover">×</button>` : ''}</div>`).join('');
      ln.querySelectorAll('[data-k]').forEach((x) => (x.onchange = () => { const L = lines[+x.dataset.i]; L[x.dataset.k] = x.dataset.k === 'pct' ? num(String(x.value).replace(',', '.')) : x.value; check(); }));
      ln.querySelectorAll('[data-rm]').forEach((x) => (x.onclick = () => { lines.splice(+x.dataset.rm, 1); draw(); }));
      check();
    };
    const check = () => {
      const d = lines.filter((l) => l.side === 'D').reduce((t, l) => t + num(l.pct), 0), c = lines.filter((l) => l.side === 'C').reduce((t, l) => t + num(l.pct), 0);
      help.textContent = Math.abs(d - c) < 0.0001 && d > 0 ? 'Débitos e créditos batem. Cada percentual é sobre o valor da movimentação.' : `Débitos somam ${d}% e créditos ${c}%: precisam ser iguais.`;
      help.style.color = Math.abs(d - c) < 0.0001 && d > 0 ? '' : 'var(--danger)';
    };
    box.querySelector('#addl').onclick = () => { lines.push({ account_id: analytic[0] ? analytic[0].id : '', side: 'D', pct: 100 }); draw(); };
    draw();
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    const del = box.querySelector('[data-act=del]');
    if (del) del.onclick = async (ev) => { try { await run(ev.currentTarget, () => rpc('partner_acct_event_delete', { p_id: e.id }), 'Evento removido'); closeModal(); done(); } catch (x) { err.hidden = false; err.textContent = msg(x); } };
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      if (!f.name.value.trim()) { err.hidden = false; err.textContent = 'Dê um nome ao evento.'; return; }
      const kind = f.kind.value || (f.querySelector('[name=kind]:checked') || {}).value;
      try {
        await run(ev.currentTarget, () => rpc('partner_acct_event_save', { p: { id: e ? e.id : null, name: f.name.value.trim(), kind, lines: lines.map((l) => ({ account_id: l.account_id || null, side: l.side, pct: l.pct })) } }), 'Evento salvo');
        closeModal(); done();
      } catch (x) { err.hidden = false; err.textContent = /unbalanced/.test(String(x && (x.message || x))) ? 'Débitos e créditos precisam somar o mesmo percentual, com no máximo uma linha “Banco”.' : msg(x); }
    };
  }

  function startModal(chart, done) {
    const box = B.modal({ title: 'Início da contabilidade', subtitle: 'Só movimentos a partir desta data geram lançamentos automáticos.',
      body: `<div class="field"><label>Data</label><input class="input" id="sd" data-mask="date" value="${esc(B.mask.toBr(chart.start))}"></div>`, foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar</button>' });
    B.mask.attach(box);
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=ok]').onclick = async (ev) => { try { await run(ev.currentTarget, () => rpc('partner_acct_start_set', { p_date: B.mask.iso(box.querySelector('#sd')) }), 'Data salva'); closeModal(); done(); } catch (e) { toast(msg(e), true); } };
  }

  function accModal(a, done) {
    const sys = a && (a.system_key || a.bank_account_id);
    const box = B.modal({ title: a ? 'Editar conta' : 'Nova conta',
      body: `<form id="cf" novalidate><div class="grid-2"><div class="field"><label>Código</label><input class="input" name="code" placeholder="5.1.03.003" value="${esc(a ? a.code : '')}" ${sys ? 'disabled' : ''}></div>
        <div class="field"><label>Tipo</label><select class="input" name="kind" ${sys ? 'disabled' : ''}><option value="analitica" ${a && a.kind === 'analitica' ? 'selected' : ''}>Analítica (recebe lançamentos)</option><option value="sintetica" ${a && a.kind === 'sintetica' ? 'selected' : ''}>Sintética (agrupa contas)</option></select></div></div>
        <div class="field"><label>Nome</label><input class="input" name="name" value="${esc(a ? a.name : '')}" autocomplete="off"></div>
        <div class="grid-2"><div class="field"><label>Natureza</label><select class="input" name="nature"><option value="D" ${a && a.nature === 'D' ? 'selected' : ''}>Devedora</option><option value="C" ${a && a.nature === 'C' ? 'selected' : ''}>Credora</option></select></div>
        <div class="field"><label>Situação</label><select class="input" name="active"><option value="1">Ativa</option><option value="0" ${a && !a.active ? 'selected' : ''}>Inativa</option></select></div></div>
        <div class="error-box" id="ce" hidden></div></form>`,
      foot: `${a && !sys && !a.used ? '<button class="u-mr-auto btn ghost" data-act="del">Excluir</button>' : ''}<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar</button>` });
    const f = box.querySelector('#cf'), err = box.querySelector('#ce');
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    const del = box.querySelector('[data-act=del]');
    if (del) del.onclick = async (ev) => { try { await run(ev.currentTarget, () => rpc('partner_acct_account_delete', { p_id: a.id }), 'Conta excluída'); closeModal(); done(); } catch (e) { err.hidden = false; err.textContent = msg(e); } };
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      const code = sys ? a.code : f.code.value.trim(), kind = sys ? a.kind : f.kind.value;
      if (!/^\d+(\.\d+)*$/.test(code) || !f.name.value.trim()) { err.hidden = false; err.textContent = 'Informe um código numérico (ex.: 5.1.03.003) e o nome.'; return; }
      try { await run(ev.currentTarget, () => rpc('partner_acct_account_save', { p: { id: a ? a.id : null, code, name: f.name.value.trim(), kind, nature: f.nature.value, active: f.active.value === '1' } }), 'Conta salva'); closeModal(); done(); } catch (e) { err.hidden = false; err.textContent = msg(e); }
    };
  }

  B.acct = { conciliacao, balanceteExport, settingsPane };
})();
