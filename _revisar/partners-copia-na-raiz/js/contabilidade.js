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

  /* ---------------- contraparte: CNPJ do extrato -> nome ---------------- */
  const cnpjOk = (d) => {
    if (!/^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
    const dv = (n) => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +d[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return dv(12) === +d[12] && dv(13) === +d[13];
  };
  const cnpjOf = (t) => { const m = String(t || '').match(/(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/g) || []; for (const x of m) { const d = x.replace(/\D/g, ''); if (cnpjOk(d)) return d; } return ''; };
  const nameMem = {}, nameMiss = new Set();
  /** {cnpj: nome} das linhas: primeiro nos cadastros do fundo, depois na Receita (BrasilAPI), guardando o resultado */
  async function counterparties(lines) {
    const docs = [...new Set(lines.map((l) => cnpjOf(l.description)).filter(Boolean))].filter((d) => !nameMem[d]);
    if (docs.length) {
      try { Object.assign(nameMem, await rpc('partner_cnpj_names', { p_cnpjs: docs })); } catch (_) { /* segue sem nomes */ }
      const miss = docs.filter((d) => !nameMem[d] && !nameMiss.has(d)).slice(0, 25), got = {};
      await Promise.all(miss.map(async (d) => {
        try { const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000); const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`, { signal: ctl.signal }); clearTimeout(t);
          const j = r.ok ? await r.json() : null, n = j && (j.razao_social || j.nome_fantasia); if (n) { got[d] = String(n).slice(0, 200); nameMem[d] = got[d]; } else nameMiss.add(d); } catch (_) { nameMiss.add(d); }
      }));
      if (Object.keys(got).length) rpc('partner_cnpj_name_save', { p_names: got }).catch(() => {});
    }
    return (l) => nameMem[cnpjOf(l.description)] || '';
  }
  /* tipo da transação: sem o "de/para <contraparte>" (ex.: "Pix Recebido de FULANO" → "Pix Recebido") */
  const kindOf = (d) => { const s = String(d || '').split(' · ')[0].trim(); return s.replace(/^(.*?(?:recebid[oa]s?|enviad[oa]s?|transf\.?(?:erência)?(?:\s+interna)?))\s+(?:de|da|do|para|a favor de)\s+\S.*$/i, '$1').trim() || s; };
  /* documento da linha do extrato, já formatado: CNPJ completo ou CPF mascarado (Pix enviado, recebido e tarifa) */
  const restOf = (d) => { const p = String(d || '').split(' · '); return p.length > 1 && !/^(cpf|cnpj|isp|ag )/i.test(p[1]) ? p[1] : String(d || ''); };
  const docLabel = (d) => { const c = cnpjOf(d); if (c) return 'CNPJ ' + c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'); const cpf = (/CPF\s+([\d*.\-]+)/i.exec(d || '') || [])[1]; return cpf ? 'CPF ' + cpf : ''; };
  const bankOf = (d) => { const m = /Ag\s+(\S+)\s+CC\s+(\S+)/i.exec(d || ''); return m ? `Ag ${m[1]} · CC ${m[2]}` : ''; };

  /* ---------------- Conciliação bancária: lançamentos da Lottus × extrato, vários de cada lado ---------------- */
  const cst = { acc: '', view: 'pending', selL: new Set(), selR: new Set(), f: { q: '', type: '', dir: '', from: '', to: '' } };
  const KINDL = { pagamento: 'Pagamento', operacao: 'Operação', tranche: 'Pagamento da operação', avulso: 'Avulso', tarifa: 'Tarifa', integralizacao: 'Integralização', parcela: 'Parcela', resgate: 'Resgate', devolucao: 'Devolução' };
  const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const recFields = (types) => [{ k: 'q', label: 'Nome ou descrição', type: 'text' }, { k: 'type', label: 'Tipo', type: 'select', all: 'Todos os tipos', options: types },
    { k: 'dir', label: 'Entrada ou saída', type: 'select', all: 'Entradas e saídas', options: [['in', 'Entradas'], ['out', 'Saídas']] }, { k: 'rg', label: 'Data', type: 'range', from: 'from', to: 'to' }];
  const ikey = (i) => `${i.kind}|${i.ref}`;
  async function conciliacao(host, me) {
    await post();
    const accounts = await rpc('partner_bank_accounts').catch(() => []);
    if (!accounts.length) { host.innerHTML = `<div class="card">${empty('Cadastre uma conta em Configurações › Banco para conciliar o extrato.')}</div>`; return; }
    if (!accounts.some((a) => a.id === cst.acc)) { cst.acc = accounts[0].id; cst.selL.clear(); cst.selR.clear(); }
    const w = canSign(me), again = () => conciliacao(host, me);
    const pendingView = cst.view === 'pending';
    if (cst.view === 'pending' && w) { try { await rpc('partner_bank_auto_classify', { p_account: cst.acc }); } catch (_) { /* sem regras */ } }
    const [rec, events, done] = await Promise.all([pendingView ? rpc('partner_bank_recon', { p_account: cst.acc }) : null, pendingView ? rpc('partner_acct_events') : [], pendingView ? null : rpc('partner_bank_lines', { p_account: cst.acc, p_status: 'reconciled' })]);
    const lines = pendingView ? rec.lines : done.lines;
    const items = pendingView ? rec.items : [];
    const nameOf = await counterparties(lines);
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
    if (!pendingView) return doneList(body, done.lines, w, again, nameOf);

    // ids que sumiram (conciliados) saem da seleção
    const idsR = new Set(lines.map((l) => l.id)), idsL = new Set(items.map(ikey));
    [...cst.selR].forEach((k) => { if (!idsR.has(k)) cst.selR.delete(k); }); [...cst.selL].forEach((k) => { if (!idsL.has(k)) cst.selL.delete(k); });
    const typeL = (i) => KINDL[i.kind] || (i.kind ? i.kind[0].toUpperCase() + i.kind.slice(1) : 'Lançamento');
    const typeR = (l) => kindOf(l.description) || (num(l.amount) < 0 ? 'Saída' : 'Entrada');
    const allTypes = [...new Set([...items.map(typeL), ...lines.map(typeR)])].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((t) => [t, t]);
    const FIELDS = recFields(allTypes);
    body.innerHTML = B.ui.filters.html('rec', FIELDS, cst.f) + '<div id="rec-main"></div>';
    const main = body.querySelector('#rec-main');
    const okF = (txt, type, amount, dt) => {
      const f = cst.f, q = fold(f.q);
      return (!q || fold(txt).includes(q)) && (!f.type || type === f.type) && (!f.dir || (f.dir === 'in' ? num(amount) >= 0 : num(amount) < 0)) && (!f.from || String(dt) >= f.from) && (!f.to || String(dt) <= f.to);
    };
    const paint = () => {
      const fItems = items.filter((i) => okF(`${i.who} ${i.label}`, typeL(i), i.amount, i.date)), fLines = lines.filter((l) => okF(`${nameOf(l)} ${l.description}`, typeR(l), l.amount, l.date));
      const pl = B.ui.pager('rec-l' + cst.acc, fItems, { unit: fItems.length === 1 ? 'lançamento' : 'lançamentos', sig: JSON.stringify(cst.f), cols: [null, (i) => i.date, typeL, (i) => i.who || i.label, (i) => num(i.amount)] });
      const pr = B.ui.pager('rec-r' + cst.acc, fLines, { unit: fLines.length === 1 ? 'linha' : 'linhas', sig: JSON.stringify(cst.f), cols: [null, (l) => l.date, typeR, (l) => nameOf(l) || restOf(l.description), (l) => num(l.amount)] });
      const sumL = items.filter((i) => cst.selL.has(ikey(i))).reduce((t, i) => t + num(i.amount), 0), sumR = lines.filter((l) => cst.selR.has(l.id)).reduce((t, l) => t + num(l.amount), 0);
      const diff = Math.round((sumL - sumR) * 100) / 100, ready = w && cst.selL.size > 0 && cst.selR.size > 0 && Math.abs(diff) < 0.005;
      const one = lines.length && cst.selR.size === 1 ? lines.find((l) => cst.selR.has(l.id)) : null;
      const col = (v) => (num(v) < 0 ? 'var(--danger)' : 'var(--success)');
      const nL = fItems.filter((i) => cst.selL.has(ikey(i))).length, nR = fLines.filter((l) => cst.selR.has(l.id)).length;
      const chk = (n, tot) => `<th style="width:34px"><input type="checkbox" data-all="__" aria-label="Selecionar todos" ${tot && n === tot ? 'checked' : ''} ${tot ? '' : 'disabled'}></th>`;
      main.innerHTML = `<div class="rec-grid">
          <div class="u-p0 card"><div class="rec-head"><b>Lançado na Lottus</b><span class="small muted">${fItems.length}${fItems.length !== items.length ? ` de ${items.length}` : ''}</span></div>
            ${fItems.length ? `<table class="rec-t"><thead><tr>${chk(nL, fItems.length).replace('__', 'L')}<th>Data</th><th>Tipo</th><th>Nome</th><th class="num">Valor</th></tr></thead><tbody>${pl.rows.map((i) => `<tr class="rec-row ${cst.selL.has(ikey(i)) ? 'on' : ''}" data-rowl="${esc(ikey(i))}"><td><input type="checkbox" data-l="${esc(ikey(i))}" ${cst.selL.has(ikey(i)) ? 'checked' : ''} aria-label="Selecionar"></td>
              <td class="nowrap">${esc(date(i.date))}</td><td>${esc(typeL(i))}</td>
              <td><b>${esc(i.who || i.label)}</b><div class="small muted">${esc(i.who ? i.label : '')}${i.state === 'pending' ? `${i.who ? ' · ' : ''}<span class="tag warning">A pagar</span>` : ''}${one && Math.abs(num(i.amount) - num(one.amount)) < 0.005 ? ' · <span class="tag success">mesmo valor</span>' : ''}${w && i.state === 'pending' && num(i.amount) < 0 && i.kind !== 'avulso' ? ` · <a href="#" class="linkbtn" data-pay="${esc(ikey(i))}">Pagar</a>` : ''}</div></td>
              <td class="num nowrap"><b style="color:${col(i.amount)}">${brl(i.amount)}</b></td></tr>`).join('')}</tbody></table>` : empty(items.length ? 'Nada com esses filtros.' : 'Nenhum lançamento a conciliar.')}
            ${pl.bar}</div>
          <div class="u-p0 card"><div class="rec-head"><b>Extrato do banco</b><span class="u-g10c row"><span class="small muted">${fLines.length}${fLines.length !== lines.length ? ` de ${lines.length}` : ''}</span>${w && cst.selR.size ? `<button class="btn ghost sm" type="button" id="del-r">Excluir (${cst.selR.size})</button>` : ''}</span></div>
            ${fLines.length ? `<table class="rec-t"><thead><tr>${chk(nR, fLines.length).replace('__', 'R')}<th>Data</th><th>Tipo</th><th>Nome</th><th class="num">Valor</th></tr></thead><tbody>${pr.rows.map((l) => `<tr class="rec-row ${cst.selR.has(l.id) ? 'on' : ''}" data-rowr="${esc(l.id)}"><td><input type="checkbox" data-r="${esc(l.id)}" ${cst.selR.has(l.id) ? 'checked' : ''} aria-label="Selecionar"></td>
              <td class="nowrap">${esc(date(l.date))}</td><td>${esc(typeR(l))}</td>
              <td><b>${esc(nameOf(l) || docLabel(l.description) || restOf(l.description))}</b>${nameOf(l) ? `<div class="small muted">${esc(docLabel(l.description))}${bankOf(l.description) ? ' · ' + esc(bankOf(l.description)) : ''}</div>` : (bankOf(l.description) ? `<div class="small muted">${esc(bankOf(l.description))}</div>` : '')}</td>
              <td class="num nowrap"><b style="color:${col(l.amount)}">${brl(l.amount)}</b></td></tr>`).join('')}</tbody></table>` : empty(lines.length ? 'Nada com esses filtros.' : 'Nenhuma linha no extrato. Use “Importar extrato (OFX)” ou arraste o arquivo para cá.')}
            ${pr.bar}</div></div>
        <div class="u-mt14 card rec-foot"><span class="small">Lottus <b>${brl(sumL)}</b> · Extrato <b>${brl(sumR)}</b> · ${cst.selL.size || cst.selR.size ? (Math.abs(diff) < 0.005 ? '<span class="u-success">valores iguais ✓</span>' : `diferença <b class="u-danger">${brl(Math.abs(diff))}</b>`) : '<span class="muted">selecione os dois lados</span>'}</span>
          ${w ? `<button class="btn" id="go" ${ready ? '' : 'disabled'}>Conciliar selecionados</button>` : ''}</div>`;
      const cards = main.querySelectorAll('.rec-grid > .card');
      B.ui.pagerBind(cards[0], 'rec-l' + cst.acc, paint);
      B.ui.pagerBind(cards[1], 'rec-r' + cst.acc, paint);
      main.querySelectorAll('[data-l]').forEach((c) => (c.onchange = () => { c.checked ? cst.selL.add(c.dataset.l) : cst.selL.delete(c.dataset.l); paint(); }));
      main.querySelectorAll('[data-r]').forEach((c) => (c.onchange = () => { c.checked ? cst.selR.add(c.dataset.r) : cst.selR.delete(c.dataset.r); paint(); }));
      main.querySelectorAll('tr[data-rowl], tr[data-rowr]').forEach((tr) => (tr.onclick = (e) => { if (e.target.closest('a, button, input')) return; const c = tr.querySelector('input[type=checkbox]'); c.checked = !c.checked; c.dispatchEvent(new Event('change')); }));
      // "selecionar todos": todos os itens do filtro, não só a página
      main.querySelectorAll('[data-all]').forEach((c) => (c.onchange = () => {
        const L = c.dataset.all === 'L', keys = L ? fItems.map(ikey) : fLines.map((l) => l.id), set = L ? cst.selL : cst.selR;
        keys.forEach((k) => (c.checked ? set.add(k) : set.delete(k))); paint();
      }));
      main.querySelectorAll('[data-pay]').forEach((a) => (a.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const it = items.find((i) => ikey(i) === a.dataset.pay); if (!it) return;
        B.payItem(it.kind, it.ref, me, again);
      }));
      main.querySelectorAll('[data-fix]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); e.stopPropagation(); fixDrawer(lines.find((l) => l.id === a.dataset.fix), events, again); }));
      // Lançado na Lottus não se exclui daqui: só as linhas do extrato do banco
      const dr = main.querySelector('#del-r');
      if (dr) dr.onclick = async () => {
        const ok = await B.confirmAction({ title: 'Excluir do extrato', text: `${cst.selR.size} ${cst.selR.size === 1 ? 'linha é apagada' : 'linhas são apagadas'} do extrato importado. Importar o arquivo de novo traz as linhas de volta.`, confirmLabel: 'Excluir', danger: true });
        if (ok == null) return;
        try { await run(dr, () => rpc('partner_bank_lines_delete', { p_lines: [...cst.selR] }), 'Linhas excluídas'); cst.selR.clear(); again(); } catch (_) { /* já avisado */ }
      };
      const go = main.querySelector('#go');
      if (go) go.onclick = async () => {
        try {
          await run(go, () => rpc('partner_bank_reconcile', { p_account: cst.acc, p_lines: [...cst.selR], p_items: items.filter((i) => cst.selL.has(ikey(i))).flatMap((i) => (i.members || [i]).map((x) => ({ kind: x.kind, ref: x.ref }))) }), 'Conciliado');
          cst.selL.clear(); cst.selR.clear(); again();
        } catch (_) { /* já avisado */ }
      };
    };
    B.ui.filters.bind(body, 'rec', FIELDS, cst.f, paint);
    paint();
  }

  /* Conciliadas: lista com "Desfazer" */

  /* ---------------- Movimentações: todas as movimentações contábeis, com contraparte e contas movimentadas ---------------- */
  const mst = { f: { q: '', type: '', acct: '', val: '', from: '', to: '' } };
  async function movimentacoes(host, me) {
    await post();
    const movs = await rpc('partner_acct_movements');
    const nameOf = await counterparties(movs.filter((m) => m.bank_desc).map((m) => ({ description: m.bank_desc })));
    const fmtDoc = (d) => { const x = String(d || '').replace(/\D/g, ''); return x.length === 14 ? x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : x.length === 11 ? x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : String(d || ''); };
    // contraparte de cada movimentação: cadastro (nome e documento) ou, no extrato, CNPJ/CPF da descrição
    const who = (m) => {
      const ps = m.parties || [];
      if (ps.length === 1) return { name: ps[0].name || '', doc: fmtDoc(ps[0].doc) };
      if (ps.length > 1) return { name: `${ps.length} contrapartes: ${ps.slice(0, 2).map((p) => p.name).join(', ')}${ps.length > 2 ? '…' : ''}`, doc: '' };
      const bd = m.bank_desc || '', c = cnpjOf(bd), cpf = (/CPF\s+([\d*.\-]+)/i.exec(bd) || [])[1] || '';
      const l = { description: bd };
      return { name: nameOf(l) || '', doc: c ? fmtDoc(c) : cpf };
    };
    const tipoOf = (m) => (m.bank_desc ? kindOf(m.bank_desc) : '') || m.kind || '';
    const kinds = [...new Set(movs.map(tipoOf))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR')).map((k) => [k, k]);
    const accts = new Map(); movs.forEach((m) => (m.lines || []).forEach((l) => accts.set(l.code, `${l.code} · ${l.name}`)));
    const FIELDS = [{ k: 'q', label: 'Nome, documento ou descrição', type: 'text' }, { k: 'type', label: 'Tipo', type: 'select', all: 'Todos os tipos', options: kinds },
      { k: 'acct', label: 'Conta', type: 'select', all: 'Todas as contas', options: [...accts].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })) },
      { k: 'val', label: 'Valor', type: 'number', placeholder: 'Ex.: 1.000.000,00' }, { k: 'rg', label: 'Data', type: 'range', from: 'from', to: 'to' }];
    host.innerHTML = B.ui.filters.html('mov', FIELDS, mst.f) + '<div id="ml"></div>';
    const list = host.querySelector('#ml'), open = new Set();
    const paint = () => {
      const f = mst.f, q = fold(f.q), v = parseNum(f.val), vd = String(f.val || '').replace(/\D/g, '');
      const shown = movs.filter((m) => {
        const w = who(m);
        if (q && !fold(`${m.description} ${w.name} ${w.doc} ${(m.parties || []).map((p) => `${p.name} ${p.doc}`).join(' ')} ${m.bank_desc || ''}`).includes(q) && !String(w.doc).replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')) return false;
        if (f.type && tipoOf(m) !== f.type) return false;
        if (f.acct && !(m.lines || []).some((l) => l.code === f.acct)) return false;
        if (f.val && !(Number.isFinite(v) ? (m.lines || []).some((l) => Math.abs(num(l.debit) + num(l.credit) - Math.abs(v)) < 0.005) || Math.abs(num(m.amount) - Math.abs(v)) < 0.005 : String(num(m.amount).toFixed(2)).replace(/\D/g, '').includes(vd))) return false;
        return (!f.from || String(m.date) >= f.from) && (!f.to || String(m.date) <= f.to);
      });
      const pg = B.ui.pager('mov-ac', shown, { unit: shown.length === 1 ? 'movimentação' : 'movimentações', sig: JSON.stringify(f), cols: [(m) => m.date, (m) => m.description, (m) => num(m.amount)] });
      const body = (m) => `<table class="mov-t"><thead><tr><th>Código da Conta</th><th>Conta</th><th>Natureza</th><th class="num">Valor</th></tr></thead><tbody>${(m.lines || []).map((l) => `<tr><td class="mono small nowrap">${esc(l.code)}</td><td>${esc(l.name)}</td><td>${num(l.debit) > 0 ? 'Débito' : 'Crédito'}</td><td class="num">${brl(num(l.debit) > 0 ? l.debit : l.credit)}</td></tr>`).join('')}</tbody></table>
        ${m.bank_desc ? `<div class="small muted" style="margin-top:8px">Extrato: ${esc(m.bank_desc)}${m.bank_lines > 1 ? ` (+${m.bank_lines - 1} ${m.bank_lines === 2 ? 'linha' : 'linhas'})` : ''}</div>` : ''}`;
      list.innerHTML = shown.length ? `<div class="card" style="padding:0">${pg.rows.map((m) => { const w = who(m), on = open.has(m.key); return `<div class="mov" style="border-bottom:1px solid var(--line)">
          <button type="button" data-mv="${esc(m.key)}" aria-expanded="${on}" style="display:grid;grid-template-columns:96px 128px 1fr auto 20px;gap:12px;align-items:center;width:100%;padding:12px 16px;background:none;border:0;text-align:left;cursor:pointer;font:inherit;color:inherit">
            <span class="nowrap small">${esc(date(m.date))}</span>
            <span class="small"><span class="tag">${esc(tipoOf(m))}</span></span>
            <span><b>${esc(m.description)}</b><div class="small muted">${[w.name, w.doc].filter(Boolean).map(esc).join(' · ')}</div></span>
            <b class="nowrap">${brl(m.amount)}</b><span aria-hidden="true">${on ? '▾' : '▸'}</span></button>
          <div ${on ? '' : 'hidden'} style="padding:0 16px 14px 252px">${body(m)}</div></div>`; }).join('')}${pg.bar}</div>` : `<div class="card">${empty(movs.length ? 'Nada com esses filtros.' : 'Nenhuma movimentação contábil ainda.')}</div>`;
      B.ui.pagerBind(list, 'mov-ac', paint);
      list.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = () => { open.has(b.dataset.mv) ? open.delete(b.dataset.mv) : open.add(b.dataset.mv); paint(); }));
    };
    B.ui.filters.bind(host, 'mov', FIELDS, mst.f, paint);
    paint();
  }

  function doneList(body, lines, w, again, nameOf) {
    const key = 'rec-d' + cst.view + cst.acc;
    const typeR = (l) => kindOf(l.description) || (num(l.amount) < 0 ? 'Saída' : 'Entrada');
    const fmtD = (d) => { const x = String(d || '').replace(/\D/g, ''); return x.length === 14 ? x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : x.length === 11 ? x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : String(d || ''); };
    const whoL = (l) => {
      const ps = l.parties || [];
      if (ps.length === 1) return { name: ps[0].name || '', doc: fmtD(ps[0].doc) };
      if (ps.length > 1) return { name: `${ps.length} contrapartes`, doc: '' };
      const c = cnpjOf(l.description), cpf = (/CPF\s+([\d*.\-]+)/i.exec(l.description || '') || [])[1] || '';
      return { name: nameOf(l) || '', doc: c ? fmtD(c) : cpf };
    };
    const cnpjFmt = (l) => whoL(l).doc || '—';
    const FIELDS = recFields([...new Set(lines.map(typeR))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((t) => [t, t]));
    body.innerHTML = B.ui.filters.html('recd', FIELDS, cst.f) + '<div id="dl"></div>';
    const host = body.querySelector('#dl');
    const paint = () => {
      const f = cst.f, q = fold(f.q);
      const shown = lines.filter((l) => (!q || fold(`${nameOf(l)} ${l.description} ${whoL(l).name} ${whoL(l).doc}`).includes(q)) && (!f.type || typeR(l) === f.type) && (!f.dir || (f.dir === 'in' ? num(l.amount) >= 0 : num(l.amount) < 0)) && (!f.from || String(l.date) >= f.from) && (!f.to || String(l.date) <= f.to));
      const pg = B.ui.pager(key, shown, { unit: shown.length === 1 ? 'linha' : 'linhas', sig: JSON.stringify(f), cols: [(l) => l.date, typeR, (l) => nameOf(l) || restOf(l.description), (l) => num(l.amount)] });
      host.innerHTML = shown.length ? `<div class="card"><table><thead><tr><th>Data</th><th>CNPJ da contraparte</th><th>Descrição</th><th class="num">Valor</th><th></th></tr></thead><tbody>
        ${pg.rows.map((l) => `<tr><td class="nowrap">${esc(date(l.date))}</td><td class="nowrap">${esc(cnpjFmt(l))}${whoL(l).name ? `<div class="small muted">${esc(whoL(l).name)}</div>` : ''}</td><td>${esc(typeR(l))}</td>
          <td class="num" style="color:${num(l.amount) < 0 ? 'var(--danger)' : 'var(--success)'}"><b>${brl(l.amount)}</b></td>
          <td class="num">${w ? `<button class="btn ghost sm" data-undo="${esc(l.id)}">Desfazer</button>` : ''}</td></tr>`).join('')}</tbody></table>${pg.bar}</div>` : `<div class="card">${empty(lines.length ? 'Nada com esses filtros.' : 'Nenhuma linha ainda.')}</div>`;
      B.ui.pagerBind(host, key, paint);
      host.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = async () => {
        const ok = await B.confirmAction({ title: 'Desfazer a conciliação', text: 'O que foi gerado por ela é desfeito e a linha (e as outras conciliadas junto) volta para "A conciliar".', confirmLabel: 'Desfazer' });
        if (ok == null) return;
        try { await run(b, () => rpc('partner_bank_line_undo', { p_line: b.dataset.undo }), 'Conciliação desfeita'); again(); } catch (_) { /* já avisado */ }
      }));
    };
    B.ui.filters.bind(body, 'recd', FIELDS, cst.f, paint);
    paint();
  }

  async function fixDrawer(l, events, done) {
    const out = num(l.amount) < 0;
    const cands = out ? await rpc('partner_bank_line_candidates', { p_line: l.id }).catch(() => []) : [];
    const evs = events.filter((e) => e.active && e.has_bank && e.kind === (out ? 'pagamento' : 'recebimento'));
    const parties = await rpc('partner_counterparties').catch(() => []);
    const cd = cnpjOf(l.description), cpHit = cd ? parties.find((p) => String(p.document || '').replace(/\D/g, '') === cd) : null;
    const box = B.drawer({ title: out ? 'Conciliar saída' : 'Conciliar entrada', subtitle: `${esc(date(l.date))} · ${esc(l.description)} · <b>${brl(l.amount)}</b>`,
      body: `${cands.length ? `<div class="fsec"><h3>É um pagamento da Tesouraria?</h3><div class="u-p0 card">${cands.map((c, i) => `<div class="row between" style="gap:12px;padding:10px 14px;${i ? 'border-top:1px solid var(--line)' : ''}"><span><b>${esc(c.who)}</b><br><span class="small muted">${esc(c.label)}</span></span>${c.kind === 'operacao' ? '<span class="small muted">Pague pela operação</span>' : `<button class="btn sm" data-m="${esc(c.kind)}|${esc(c.ref_id)}">É este</button>`}</div>`).join('')}</div></div>` : ''}
        <div class="fsec"><h3>${cands.length ? 'Ou lance na aba Pagamentos' : out ? 'Lançar este pagamento' : 'Lançar este recebimento'}</h3>
          <p class="small muted" style="margin:0 0 10px">O lançamento fica em “Lançado na Lottus” para você conciliar com esta linha.</p>
          <div class="field"><label>Contraparte</label><select class="input" id="cp"><option value="">${cpHit ? '' : 'Pela descrição do extrato'}</option>${parties.map((p) => `<option value="${esc(p.key)}" ${cpHit && cpHit.key === p.key ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Evento contábil</label><select class="input" id="ce">${evs.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Observação <span class="small muted">(opcional)</span></label><input class="input" id="ch" maxlength="140" autocomplete="off"></div>
          <button class="btn" id="cls">${out ? 'Lançar pagamento' : 'Lançar recebimento'}</button></div>
        <div class="row" style="gap:8px;margin-top:6px"><button class="btn ghost sm" id="ign">Ignorar linha</button><button class="btn ghost sm" id="del">Excluir linha</button></div>
        <div class="error-box" id="fe" hidden></div>`, foot: '' });
    const err = box.querySelector('#fe');
    const go = async (btn, fn, ok) => { try { await run(btn, fn, ok); closeModal(); done(); } catch (e) { err.hidden = false; err.textContent = msg(e); } };
    box.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { const [k, r] = b.dataset.m.split('|'); go(b, () => rpc('partner_bank_line_match', { p_line: l.id, p_kind: k, p_ref: r }), 'Conciliada'); }));
    box.querySelector('#cls').onclick = (e) => {
      const ev = box.querySelector('#ce').value; if (!ev) { err.hidden = false; err.textContent = 'Cadastre um evento contábil com “Banco” para lançar.'; return; }
      const p = parties.find((x) => x.key === box.querySelector('#cp').value);
      go(e.currentTarget, () => rpc('partner_bank_line_launch', { p_line: l.id, p_event: ev, p: { who: p ? p.name : null, document: p ? p.document : null, party_kind: p ? p.kind : null, note: box.querySelector('#ch').value } }), out ? 'Pagamento lançado em Pagamentos' : 'Recebimento lançado em Pagamentos');
    };
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
          @page { size: A4 landscape; margin: 12mm 12mm 16mm; @bottom-right { content: "Pág. " counter(page) " de " counter(pages); font: 8pt Inter, Arial, sans-serif; color: #6b605a; } }
          .bt { text-align: center; margin: 4px 0 10px; } .bt h1 { font-size: 15pt; margin: 0; letter-spacing: -.01em; } .bt div { font-size: 9.5pt; color: #4a403b; }
          .co { font-size: 8.5pt; color: #4a403b; padding: 6px 0 8px; border-bottom: 1px solid #ece8e1; margin-bottom: 8px; }
          table.bal { font-size: 7.6pt; margin: 0 0 14px; width: 100%; } table.bal th, table.bal td { padding: 3px 5px; border-bottom: 1px solid #f0ece5; line-height: 1.35; white-space: nowrap; }
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
        ${ok ? '' : `<div class="stat">Atenção: diferença de ${brl(Math.abs(T.d - T.c))} entre débitos e créditos.</div>`}
        <div class="foot">Gerado pela plataforma Lottus em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Saldos mostrados na natureza de cada conta (D = devedora, C = credora).</div>
        </body></html>`;
      w.document.open(); w.document.write(html); w.document.close();
      setTimeout(() => { try { w.focus(); w.print(); } catch { /* janela fechada */ } }, 600);
    } catch (e) {
      if (w) w.close();
      toast(B.message(e), true);
    }
  }


  /* Regras: qual evento contábil cada tipo de lançamento da Lottus e cada tipo de transação do extrato usa */
  const LOTTUS_TYPES = [
    ['integralizacao', 'Integralização recebida', 'valor integralizado'], ['comissao_integralizacao', 'Comissão de originação (integralização)', 'comissão provisionada'],
    ['comissao_operacao', 'Comissão de originação (operação)', 'comissão provisionada'], ['escrituracao', 'Custo de escrituração', 'custo provisionado'],
    ['operacao', 'Operação paga ao cedente', 'valor de face'], ['resgate', 'Resgate de debêntures', 'valor bruto do resgate'], ['valorizacao', 'Valorização de debêntures', 'valorização positiva do mês'],
    ['pg_comissao_integralizacao', 'Pagamento de comissão (integralização)', 'valor pago'], ['pg_comissao_operacao', 'Pagamento de comissão (operação)', 'valor pago'],
    ['pg_resgate', 'Pagamento de resgate', 'valor pago'], ['pg_escrituracao', 'Pagamento de escrituração', 'valor pago'], ['pg_avulso', 'Movimentação avulsa sem evento', 'valor da movimentação'],
  ];
  async function rulesPane(pane, adm) {
    const [events, data] = await Promise.all([rpc('partner_acct_events'), rpc('partner_acct_rules')]);
    const evs = events.filter((e) => e.active);
    const cur = { lottus: {}, extrato: {} };
    data.rules.forEach((r) => { cur[r.scope][r.tx_type] = r.event_id; });
    const seen = [...new Set(['Entrada', 'Saída', ...data.seen, ...Object.keys(cur.extrato)])];
    const ro = adm ? '' : 'disabled';
    const sel = (scope, key) => `<select class="input" data-scope="${scope}" data-k="${esc(key)}" ${ro}><option value="">Padrão do sistema</option>${evs.map((e) => `<option value="${esc(e.id)}" ${cur[scope][key] === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>`;
    pane.innerHTML = `<div class="u-g6mb14 row">${SUBS.map(([k, l]) => B.pill('data-csub', k, l, 'regras')).join('')}</div>
      <form class="card stack" id="rf" novalidate>
        <div><h2 class="u-m0">Lançamentos da Lottus</h2><p class="u-m4t small muted">Escolha o evento contábil de cada tipo de lançamento. O evento decide as contas movimentadas, com percentuais sobre o valor-base indicado; “Banco” usa a conta bancária do lançamento. Sem escolha, vale o lançamento padrão do sistema.</p></div>
        <div class="table-wrap"><table class="pol"><thead><tr><th>Tipo de lançamento</th><th>Valor-base</th><th>Evento contábil</th></tr></thead><tbody>
          ${LOTTUS_TYPES.map(([k, l, b]) => `<tr><td><b>${esc(l)}</b></td><td class="small muted">${esc(b)}</td><td>${sel('lottus', k)}</td></tr>`).join('')}</tbody></table></div>
        ${adm ? '<div class="save-bar"><button class="btn" type="submit">Salvar regras</button></div>' : ''}
      </form>`;
    pane.querySelectorAll('[data-csub]').forEach((b) => (b.onclick = () => { location.hash = `#/config/contabilidade/${b.dataset.csub}`; }));
    if (!adm) return;
    pane.querySelector('#rf').onsubmit = (e) => {
      e.preventDefault();
      const rules = [...pane.querySelectorAll('select[data-scope]')].filter((x) => x.value).map((x) => ({ scope: x.dataset.scope, tx_type: x.dataset.k, event_id: x.value })).concat(Object.entries(cur.extrato || {}).filter(([, v]) => v).map(([k, v]) => ({ scope: 'extrato', tx_type: k, event_id: v })));
      run(e.submitter || pane.querySelector('[type=submit]'), () => rpc('partner_acct_rules_save', { p: { rules } }), 'Regras salvas').catch(() => null);
    };
  }

  /* ---------------- Configurações › Contabilidade: eventos contábeis e plano de contas ---------------- */
  const SUBS = [['eventos', 'Eventos Contábeis'], ['regras', 'Regras de Lançamento'], ['plano', 'Plano de Contas']];
  async function settingsPane(pane, adm, rawSub) {
    const sub = rawSub === 'plano' ? 'plano' : rawSub === 'regras' ? 'regras' : 'eventos';
    await post();
    if (sub === 'regras') return rulesPane(pane, adm);
    const [events, chart] = await Promise.all([rpc('partner_acct_events'), rpc('partner_acct_chart')]);
    const analytic = chart.accounts.filter((a) => a.kind === 'analitica' && a.active && !a.bank_account_id);
    const again = () => settingsPane(pane, adm, sub);
    const pills = `<div class="u-g6mb14 row">${SUBS.map(([k, l]) => B.pill('data-csub', k, l, sub)).join('')}</div>`;
    const head = (title, text, btn) => `<div class="row between" style="gap:12px;flex-wrap:wrap;margin-bottom:12px"><div><h2 class="u-m0">${title}</h2><p class="u-m4t small muted">${text}</p></div>${btn}</div>`;
    if (sub === 'eventos') {
      const codeOf = (l) => (l.account_id ? (chart.accounts.find((x) => x.id === l.account_id) || {}).code : '') || (l.code || '—');
      const sum = (e) => e.lines.map((l) => `${l.side === 'D' ? 'D' : 'C'} ${esc(l.account)}${num(l.pct) < 100 ? ` (${num(l.pct)}%)` : ''}`).join(' · ');
      const list = events.filter((e) => e.active);
      pane.innerHTML = `${pills}<div class="card">${head('Eventos contábeis', 'Cada movimentação avulsa escolhe um evento, que decide quais contas são movimentadas. “Banco” usa a conta bancária escolhida na movimentação.', adm ? '<button class="btn" id="newev">Novo evento</button>' : '')}
        <table><thead><tr><th>Evento</th><th>Tipo</th><th>Código da Conta</th><th>Contas movimentadas</th><th></th></tr></thead><tbody>
        ${list.map((e) => `<tr><td><b>${esc(e.name)}</b></td><td>${e.kind === 'pagamento' ? 'Pagamento' : 'Recebimento'}</td><td class="small mono">${e.lines.map((l) => `<div>${esc(codeOf(l))}</div>`).join('')}</td><td class="small muted">${e.lines.map((l) => `<div>${l.side === 'D' ? 'D' : 'C'} ${esc(l.account)}${num(l.pct) < 100 ? ` (${num(l.pct)}%)` : ''}</div>`).join('')}</td><td class="num">${adm ? `<button class="btn ghost sm" data-ev="${esc(e.id)}">Editar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
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

  B.acct = { conciliacao, movimentacoes, balanceteExport, settingsPane };
})();
