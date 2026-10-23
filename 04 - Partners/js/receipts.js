/* Lottus Partners — recebimentos: baixa pelo extrato ou pelo identificador do Pix, ocorrências e recompras */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, dateTime, cnpj, toast, run, modal, closeModal, confirmAction } = B;
  const { head, tabs, onTabs, empty } = B.ui;

  const TABS = [['conciliar', 'Dar baixa'], ['pendentes', 'Não identificados'], ['ocorrencias', 'Ocorrências'], ['recompras', 'Recompras'], ['historico', 'Histórico']];
  const KIND = { charge: 'Duplicata', late_fee: 'Encargos', settlement: 'Quitação', buyback: 'Recompra', case: 'Repasse' };
  const STATUS = {
    match: ['Encontrada', 'success'], suggest: ['Confira', 'warning'], over: ['Valor a mais', 'warning'], short: ['Valor a menos', 'danger'],
    duplicate: ['Já paga', 'danger'], unidentified: ['Sem cobrança', ''], imported: ['Já importado', ''], debit: ['Saída', ''], invalid: ['Ilegível', ''],
  };
  const CASE_KIND = {
    paid_to_assignor: 'Sacado pagou ao cedente', duplicate: 'Pagamento em duplicidade', overpaid: 'Pagamento a mais', after_close: 'Pago depois de encerrada',
  };
  const CASE_DIR = { to_fund: 'O cedente repassa ao fundo', to_payer: 'O fundo devolve a quem pagou', to_assignor: 'O fundo repassa ao cedente' };
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const fail = (e) => toast(B.message(e), true);
  const can = (me) => me.can_sign !== false;

  B.views.recebimentos = async (el, [raw], me) => {
    const tab = TABS.some(([k]) => k === raw) ? raw : 'conciliar';
    const sum = await rpc('partner_receipts_summary').catch(() => ({}));
    const label = (k, l) => {
      const n = k === 'pendentes' ? sum.unidentified : k === 'ocorrencias' ? sum.cases : k === 'recompras' ? sum.buybacks : 0;
      return n ? `${l} (${n})` : l;
    };
    el.innerHTML = `${head('Recebimentos', 'Baixa dos Pix recebidos na conta do fundo, pelo identificador de cada cobrança.', tabs(TABS.map(([k, l]) => [k, label(k, l)]), tab))}<div id="pane"></div>`;
    onTabs(el, (t) => (location.hash = `#/recebimentos/${t}`));
    const pane = el.querySelector('#pane');
    if (tab === 'pendentes') return pending(pane, me);
    if (tab === 'ocorrencias') return cases(pane, me);
    if (tab === 'recompras') return buybacks(pane, me);
    if (tab === 'historico') return history(pane);
    return reconcile(pane, me, sum);
  };

  /* --------------------------------------------------------- extrato */
  const num = (s) => {
    let t = String(s == null ? '' : s).trim();
    if (!t) return NaN;
    const neg = /^\s*-|^\s*\(|-\s*$|\bD\s*$/i.test(t);
    t = t.replace(/R\$|\s|\(|\)|[CD]$/gi, '').replace(/^-|-$/g, '');
    if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if (t.includes(',')) t = t.replace(',', '.');
    const v = Number(t);
    return Number.isFinite(v) ? (neg ? -v : v) : NaN;
  };
  const day = (s) => {
    const t = String(s || '').trim();
    let m = t.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    return null;
  };
  // Mesma linha repetida no arquivo continua sendo dois lançamentos (o n-ésimo igual ganha um número)
  const stamp = (rows, prefix) => {
    const seen = {};
    return rows.map((r) => {
      if (r.fp) return r;
      const base = `${r.date}|${r.amount}|${(r.memo || '').toUpperCase().replace(/\s+/g, ' ')}|${r.doc || ''}`;
      seen[base] = (seen[base] || 0) + 1;
      return { ...r, fp: `${prefix}:${base}#${seen[base]}`.slice(0, 400) };
    });
  };

  function parseOfx(text) {
    const out = [];
    const tag = (blk, t) => { const m = blk.match(new RegExp(`<${t}>([^<\\r\\n]*)`, 'i')); return m ? m[1].trim() : ''; };
    for (const blk of text.split(/<STMTTRN>/i).slice(1)) {
      const fitid = tag(blk, 'FITID');
      out.push({ date: day(tag(blk, 'DTPOSTED')), amount: num(tag(blk, 'TRNAMT').replace(',', '.')), name: tag(blk, 'NAME'), memo: [tag(blk, 'MEMO'), tag(blk, 'NAME')].filter(Boolean).join(' · '),
        fp: fitid ? `ofx:${fitid}|${day(tag(blk, 'DTPOSTED'))}|${tag(blk, 'TRNAMT')}` : null });
    }
    return stamp(out, 'ofx');
  }

  function splitCsv(line, d) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === d && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  }
  function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const sample = lines.slice(0, 5).join('\n');
    const d = ['\t', ';', ','].sort((a, b) => sample.split(b).length - sample.split(a).length)[0];
    const rows = lines.map((l) => splitCsv(l, d));
    const hIdx = rows.findIndex((r) => r.some((c) => /^data/i.test(c)));
    let col = { date: -1, amount: -1, credit: -1, debit: -1, memo: [], doc: -1, name: -1 };
    if (hIdx >= 0) {
      rows[hIdx].forEach((h, i) => {
        const x = h.toLowerCase();
        if (/^data/.test(x) && col.date < 0) col.date = i;
        else if (/cr[eé]dito|entrada/.test(x)) col.credit = i;
        else if (/d[eé]bito|sa[ií]da/.test(x)) col.debit = i;
        else if (/valor|montante|quantia/.test(x) && col.amount < 0) col.amount = i;
        else if (/cpf|cnpj|documento/.test(x)) col.doc = i;
        else if (/nome|pagador|remetente|origem/.test(x)) { col.name = i; col.memo.push(i); }
        else if (/hist|descr|lan[cç]amento|detalh|memo|identifica|txid|observa/.test(x)) col.memo.push(i);
      });
    }
    const body = rows.slice(hIdx + 1);
    if (col.date < 0) col.date = (body[0] || []).findIndex((c) => day(c));
    if (col.amount < 0 && col.credit < 0) {
      const first = body[0] || [];
      for (let i = first.length - 1; i >= 0; i--) if (i !== col.date && Number.isFinite(num(first[i])) && /\d[.,]\d{2}\s*[CD]?$/.test(first[i])) { col.amount = i; break; }
    }
    if (!col.memo.length) (body[0] || []).forEach((c, i) => { if (i !== col.date && i !== col.amount && !Number.isFinite(num(c))) col.memo.push(i); });
    const out = body.map((r) => {
      let amount = col.credit >= 0 && r[col.credit] ? num(r[col.credit]) : col.amount >= 0 ? num(r[col.amount]) : NaN;
      if (col.credit >= 0 && !r[col.credit] && col.debit >= 0 && r[col.debit]) amount = -Math.abs(num(r[col.debit]));
      return { date: day(r[col.date]), amount, memo: col.memo.map((i) => r[i]).filter(Boolean).join(' · '), doc: col.doc >= 0 ? r[col.doc] : '', name: col.name >= 0 ? r[col.name] : '' };
    }).filter((r) => r.date || Number.isFinite(r.amount));
    return stamp(out, 'csv');
  }
  const parse = (text) => (/<OFX>|<STMTTRN>/i.test(text) ? parseOfx(text) : parseCsv(text));

  /* ------------------------------------------------------- dar baixa */
  async function reconcile(pane, me, sum) {
    pane.innerHTML = `
      <div class="stack">
        <div class="card stack">
          <div class="row between" style="align-items:flex-start;gap:12px;flex-wrap:wrap">
            <div><h2>Importar o extrato</h2><p class="small muted" style="margin:4px 0 0">Exporte do banco do fundo em OFX (Money) ou CSV, ou cole as linhas. Cada cobrança da Lottus tem um identificador de Pix (começa com LT, EN, LR ou LS); quando o banco mostra o identificador, a baixa é certa. Sem ele, o sistema casa pelo CNPJ de quem pagou e pelo valor, e você confere.</p></div>
            ${sum.last_import ? `<span class="small muted">Última importação ${dateTime(sum.last_import)}</span>` : ''}
          </div>
          <div class="drop" id="drop" tabindex="0" role="button" aria-label="Escolher arquivo do extrato">
            <input type="file" id="file" accept=".ofx,.csv,.txt,text/csv" hidden>
            <b>Arraste o arquivo aqui ou clique para escolher</b><span class="small muted">OFX, CSV ou TXT · lançamentos de até 400 dias</span>
          </div>
          <details><summary class="small"><b>Ou cole os lançamentos</b></summary>
            <textarea class="input" id="paste" rows="5" style="margin-top:8px" placeholder="Data;Descrição;Valor&#10;16/10/2026;PIX RECEBIDO LT51DDD9F1D8F3403597609E2 CLIENTE SA;1.000,00"></textarea>
            <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn secondary sm" id="go-paste" type="button">Conferir</button></div>
          </details>
          <div id="preview"></div>
        </div>
        <div class="card stack">
          <div><h2>Baixa por identificador</h2><p class="small muted" style="margin:4px 0 0">Recebeu um Pix e quer dar baixa sem o extrato? Busque pelo identificador do Pix, pela NF-e, pelo sacado ou pelo cedente.</p></div>
          <form class="row" id="find" style="gap:8px"><input class="input" name="q" placeholder="Ex.: LT51DDD9F1D8F3403597609E2, NF-e 1043, nome do sacado" style="flex:1">
            <button class="btn secondary" type="submit">Buscar</button></form>
          <div id="found"></div>
        </div>
      </div>`;
    let targets = null;
    const loadTargets = async () => (targets = targets || (await rpc('partner_find_targets', { p_q: '' }).catch(() => [])));

    const show = async (lines) => {
      const box = pane.querySelector('#preview');
      if (!lines.length) { box.innerHTML = '<div class="error-box">Não achamos lançamentos neste arquivo. Confira se é o extrato da conta, em OFX ou CSV.</div>'; return; }
      box.innerHTML = '<div class="spinner" aria-label="Conferindo"></div>';
      let res;
      try { [res] = await Promise.all([rpc('partner_reconcile_preview', { p_lines: lines }), loadTargets()]); } catch (e) { box.innerHTML = ''; return fail(e); }
      const work = res.filter((r) => !['imported', 'debit', 'invalid'].includes(r.status));
      const skipped = res.length - work.length;
      const optList = (r) => {
        const opts = targets.slice();
        if (r.target && !opts.some((t) => t.kind === r.target.kind && t.id === r.target.id)) opts.unshift(r.target);
        const sel = r.target ? `${r.target.kind}:${r.target.id}` : '';
        return `<option value="">Escolha a cobrança…</option>${opts.map((t) => `<option value="${esc(t.kind)}:${esc(t.id)}" ${`${t.kind}:${t.id}` === sel ? 'selected' : ''}>${esc(KIND[t.kind])} · ${esc(t.label)} · ${esc(t.company || '')} · ${brl(t.expected)}${t.open === false ? ' (encerrada)' : ''}</option>`).join('')}`;
      };
      const defAction = (r) => (['match', 'over', 'duplicate'].includes(r.status) ? 'apply' : r.status === 'suggest' ? 'apply' : 'unidentified');
      const hint = (r) => r.status === 'over' ? `Recebido ${brl(r.amount - r.target.expected)} a mais: a diferença vira devolução.`
        : r.status === 'short' ? `Esperado ${brl(r.target.expected)}. Valor menor fica sem baixa.`
        : r.status === 'duplicate' ? 'Esta cobrança já estava paga ou encerrada: vira ocorrência de devolução.'
        : r.status === 'suggest' ? (r.target && r.target.how === 'doc_many' ? 'Mais de uma cobrança com este CNPJ e valor. Confira qual é.' : 'Casou só pelo valor. Confira.') : '';
      box.innerHTML = `
        <div class="row between" style="margin-top:4px;flex-wrap:wrap;gap:8px"><b>${work.length} lançamento${work.length === 1 ? '' : 's'} de entrada para conferir</b>
          <span class="small muted">${skipped ? `${skipped} ignorado${skipped === 1 ? '' : 's'} (saídas, já importados ou ilegíveis)` : ''}</span></div>
        ${work.length ? `<div class="table-wrap"><table class="recon">
          <thead><tr><th>Data</th><th class="num">Valor</th><th>Lançamento</th><th>Cobrança</th><th>O que fazer</th></tr></thead>
          <tbody>${work.map((r, i) => `<tr data-row="${i}">
            <td class="nowrap">${date(r.date)}</td><td class="num nowrap"><b>${brl(r.amount)}</b></td>
            <td><div class="small" style="max-width:280px;word-break:break-word">${esc(r.memo || r.name || '—')}</div>${r.doc ? `<div class="small muted">${esc(cnpj(r.doc))}</div>` : ''}${r.txid && !String(r.memo || '').toUpperCase().includes(r.txid) ? `<div class="small mono">${esc(r.txid)}</div>` : ''}</td>
            <td><span class="tag ${STATUS[r.status][1]}">${esc(STATUS[r.status][0])}</span>
              <select class="input sm" data-target style="margin-top:6px;max-width:320px">${optList(r)}</select>
              ${hint(r) ? `<div class="small muted" style="margin-top:4px">${esc(hint(r))}</div>` : ''}</td>
            <td><select class="input sm" data-action style="min-width:180px">
              <option value="apply" ${defAction(r) === 'apply' ? 'selected' : ''}>Dar baixa</option>
              <option value="unidentified" ${defAction(r) === 'unidentified' ? 'selected' : ''}>Guardar para depois</option>
              <option value="ignore">Não é de duplicata</option></select></td></tr>`).join('')}</tbody></table></div>
          <div class="row" style="justify-content:flex-end;gap:8px">${can(me) ? '<button class="btn" id="apply">Confirmar</button>' : '<span class="small muted">Só aprovadores dão baixa.</span>'}</div>` : ''}`;
      const ab = box.querySelector('#apply');
      if (!ab) return;
      const count = () => {
        const n = [...box.querySelectorAll('[data-row]')].filter((tr) => tr.querySelector('[data-action]').value === 'apply' && tr.querySelector('[data-target]').value).length;
        ab.textContent = n ? `Dar baixa em ${n}` : 'Guardar';
      };
      box.querySelectorAll('select').forEach((s) => (s.onchange = count));
      count();
      ab.onclick = () => {
        const payload = [...box.querySelectorAll('[data-row]')].map((tr) => {
          const r = work[tr.dataset.row];
          const [kind, id] = (tr.querySelector('[data-target]').value || ':').split(':');
          let action = tr.querySelector('[data-action]').value;
          if (action === 'apply' && !kind) action = 'unidentified';
          return { date: r.date, amount: r.amount, memo: r.memo, name: r.name, doc: r.doc, e2e: r.e2e, txid: r.txid, fp: r.fp, action, target_kind: kind || null, target_id: id || null };
        });
        run(ab, () => rpc('partner_reconcile_apply', { p_lines: payload }), null).then((s) => {
          toast(`${s.applied} baixa${s.applied === 1 ? '' : 's'}${s.cases ? ` · ${s.cases} ocorrência${s.cases === 1 ? '' : 's'} de devolução` : ''}${s.unidentified + s.short ? ` · ${s.unidentified + s.short} para conferir depois` : ''}`);
          if (B.refreshCounts) B.refreshCounts();
          B.reload();
        }).catch(() => null);
      };
    };

    const drop = pane.querySelector('#drop'), file = pane.querySelector('#file');
    const readFile = (f) => {
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) return toast('O arquivo passa de 5 MB. Exporte um período menor.', true);
      const fr = new FileReader();
      fr.onload = () => {
        let text = String(fr.result || '');
        if (/�/.test(text)) { const fr2 = new FileReader(); fr2.onload = () => show(parse(String(fr2.result || ''))); fr2.readAsText(f, 'windows-1252'); return; }
        show(parse(text));
      };
      fr.readAsText(f, 'utf-8');
    };
    drop.onclick = () => file.click();
    drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
    file.onchange = () => readFile(file.files[0]);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); readFile(e.dataTransfer.files[0]); };
    pane.querySelector('#go-paste').onclick = () => show(parse(pane.querySelector('#paste').value));

    const ff = pane.querySelector('#find');
    ff.onsubmit = async (e) => {
      e.preventDefault();
      const out = pane.querySelector('#found');
      out.innerHTML = '<div class="spinner" aria-label="Buscando"></div>';
      let list;
      try { list = await rpc('partner_find_targets', { p_q: ff.q.value }); } catch (err) { out.innerHTML = ''; return fail(err); }
      out.innerHTML = list.length ? `<div class="list">${list.slice(0, 30).map((t, i) => `<div class="list-row">
          <div class="grow"><b>${esc(KIND[t.kind])} · ${esc(t.label)}</b><div class="small muted">${esc(t.company || '')}${t.due_date ? ` · vence ${date(t.due_date)}` : ''} · <span class="mono">${esc(t.txid || '')}</span></div></div>
          <b class="num">${brl(t.expected)}</b>
          ${t.open === false ? '<span class="tag">Encerrada</span>' : can(me) ? `<button class="btn sm" data-pay="${i}">Registrar recebido</button>` : ''}</div>`).join('')}</div>`
        : empty('Nada em aberto com isso.');
      out.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => manual(list[b.dataset.pay])));
    };
  }

  /** Registro à mão de um Pix recebido, ligado à cobrança */
  function manual(t) {
    const box = modal({
      title: 'Registrar recebido',
      subtitle: `${esc(KIND[t.kind])} · ${esc(t.label)} · ${esc(t.company || '')}`,
      body: `<form class="stack" id="mf" novalidate>
        <div class="grid-2">
          <div class="field"><label>Data em que caiu na conta</label><input class="input" name="date" type="date" value="${today()}" max="${today()}"></div>
          <div class="field"><label>Valor recebido (R$)</label><input class="input" name="amount" inputmode="decimal" value="${String(t.expected).replace('.', ',')}"></div>
        </div>
        <div class="field"><label>ID do Pix (E2E), opcional</label><input class="input mono" name="e2e" placeholder="E…" maxlength="32"><div class="help">Fica guardado e impede baixar o mesmo Pix duas vezes.</div></div>
        <div class="error-box" data-err hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Dar baixa</button>',
    });
    box.querySelector('[data-act=cancel]').onclick = closeModal;
    box.querySelector('[data-act=ok]').onclick = (ev) => {
      const f = box.querySelector('#mf'), err = box.querySelector('[data-err]');
      const amount = num(f.amount.value), e2e = f.e2e.value.trim().toUpperCase();
      const bad = !f.date.value ? 'Informe a data.' : !(amount > 0) ? 'Informe o valor.' : e2e && !/^E\d{20}[A-Z0-9]{11}$/.test(e2e) ? B.message(new Error('invalid_e2e')) : '';
      if (bad) { err.hidden = false; err.textContent = bad; return; }
      const line = { date: f.date.value, amount, memo: 'Registro manual', txid: t.txid, e2e: e2e || null, fp: `manual:${t.kind}:${t.id}:${f.date.value}:${amount}:${e2e || Date.now()}`,
        action: 'apply', target_kind: t.kind, target_id: t.id };
      run(ev.currentTarget, () => rpc('partner_reconcile_apply', { p_lines: [line], p_source: 'manual' }), null).then((s) => {
        closeModal();
        toast(s.applied ? 'Baixa registrada' : s.short ? 'Valor menor que o esperado: ficou em Não identificados' : s.cases ? 'Já estava encerrada: virou ocorrência de devolução' : 'Este Pix já tinha sido registrado');
        if (B.refreshCounts) B.refreshCounts();
        B.reload();
      }).catch(() => null);
    };
  }

  /* ---------------------------------------------- não identificados */
  async function pending(pane, me) {
    const [list, targets] = await Promise.all([rpc('partner_payments', { p_status: 'unidentified' }), rpc('partner_find_targets', { p_q: '' }).catch(() => [])]);
    pane.innerHTML = `<div class="card flush"><div class="table-wrap">${list.length === 0 ? empty('Nenhum lançamento esperando. Tudo o que entrou foi ligado a uma cobrança.') : `<table>
      <thead><tr><th>Data</th><th class="num">Valor</th><th>Lançamento</th><th>Ligar a</th><th></th></tr></thead>
      <tbody>${list.map((p, i) => `<tr>
        <td class="nowrap">${date(p.received_on)}</td><td class="num"><b>${brl(p.amount)}</b></td>
        <td><div class="small" style="max-width:300px;word-break:break-word">${esc(p.memo || p.payer_name || '—')}</div>${p.payer_doc ? `<div class="small muted">${esc(cnpj(p.payer_doc))}</div>` : ''}${p.note ? `<div class="small" style="color:var(--danger)">${esc(p.note)}</div>` : ''}</td>
        <td><select class="input sm" data-t="${i}" style="max-width:320px"><option value="">Escolha a cobrança…</option>${targets.map((t) => `<option value="${esc(t.kind)}:${esc(t.id)}">${esc(KIND[t.kind])} · ${esc(t.label)} · ${esc(t.company || '')} · ${brl(t.expected)}</option>`).join('')}</select></td>
        <td class="num"><div class="row" style="justify-content:flex-end;gap:6px">${can(me) ? `<button class="btn sm" data-link="${i}">Dar baixa</button><button class="btn ghost sm" data-ign="${i}">Não é de duplicata</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`}</div></div>`;
    pane.querySelectorAll('[data-link]').forEach((b) => (b.onclick = () => {
      const v = pane.querySelector(`[data-t="${b.dataset.link}"]`).value;
      if (!v) return toast('Escolha a cobrança.', true);
      const [kind, id] = v.split(':');
      run(b, () => rpc('partner_link_payment', { p_payment: list[b.dataset.link].id, p_kind: kind, p_target: id }), null).then((r) => {
        toast(r.result === 'short' ? `Valor menor que o esperado (${brl(r.expected)}). Continua aqui.` : r.result === 'case' ? 'Já estava encerrada: virou ocorrência de devolução' : 'Baixa registrada');
        if (B.refreshCounts) B.refreshCounts();
        B.reload();
      }).catch(() => null);
    }));
    pane.querySelectorAll('[data-ign]').forEach((b) => (b.onclick = async () => {
      const note = await confirmAction({ title: 'Não é de duplicata', text: 'O lançamento sai desta lista e fica no histórico.', confirmLabel: 'Tirar da lista', note: true, noteLabel: 'Do que é (opcional)' });
      if (note == null) return;
      run(b, () => rpc('partner_ignore_payment', { p_payment: list[b.dataset.ign].id, p_note: note }), 'Tirado da lista').then(B.reload).catch(() => null);
    }));
  }

  /* ---------------------------------------------------- ocorrências */
  async function cases(pane, me) {
    const list = await rpc('partner_cases', { p_status: 'all' });
    const open = list.filter((k) => k.status === 'open'), done = list.filter((k) => k.status !== 'open');
    const row = (k) => `<div class="case ${k.status}">
      <div class="row between" style="align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div><b>${esc(CASE_KIND[k.kind])}</b> · ${esc(k.company)}${k.nfe ? ` · NF-e ${esc(k.nfe)}` : ''}
          <div class="small muted">${esc(CASE_DIR[k.direction])} · aberta ${dateTime(k.created_at)}${k.status === 'open' ? ` · prazo ${date(k.deadline)}` : ''}${k.note ? ` · ${esc(k.note)}` : ''}</div></div>
        <div style="text-align:right"><b>${brl(k.amount)}</b><div>${k.status === 'open' ? '<span class="tag warning">Em aberto</span>' : k.status === 'resolved' ? '<span class="tag success">Resolvida</span>' : '<span class="tag">Cancelada</span>'}</div></div>
      </div>
      ${k.status === 'open' && k.direction !== 'to_fund' && k.pix ? `<div class="pix-box" style="margin-top:10px"><div class="pix-qr">${B.qrSvg(k.pix)}</div>
        <div class="small"><b>Devolva com Pix</b> pelo banco do fundo: chave CNPJ ${esc(cnpj(k.pix_key))} · ${esc(k.pix_name || '')}. Confira o nome antes de confirmar; se a chave não for aceita, peça outra chave a quem recebe.</div>
        <button class="btn secondary sm" type="button" data-copy="${esc(k.id)}">Copiar Pix copia e cola</button></div>` : ''}
      ${k.status === 'open' && k.direction !== 'to_fund' && !k.pix ? '<p class="small muted" style="margin:8px 0 0">Sem CNPJ de quem pagou: combine a chave Pix para a devolução.</p>' : ''}
      ${k.status === 'open' && k.direction === 'to_fund' ? `<p class="small muted" style="margin:8px 0 0">O cedente paga pelo app, com o identificador <span class="mono">${esc(k.txid)}</span>. Quando cair, a baixa sai pela importação do extrato, ou registre aqui.</p>` : ''}
      ${k.reference ? `<div class="small" style="margin-top:6px">ID do Pix: <span class="mono">${esc(k.reference)}</span></div>` : ''}
      ${k.status === 'open' && can(me) ? `<div class="row" style="justify-content:flex-end;gap:6px;margin-top:10px">
        <button class="btn ghost sm" data-cancel="${esc(k.id)}">Cancelar</button>
        <button class="btn sm" data-resolve="${esc(k.id)}">${k.direction === 'to_fund' ? 'Repasse recebido' : 'Já devolvi'}</button></div>` : ''}
    </div>`;
    pane.innerHTML = `<div class="stack">
      ${can(me) ? `<div class="card"><div class="row between" style="gap:12px;flex-wrap:wrap"><div><h2>Pagamento fora do lugar</h2><p class="small muted" style="margin:4px 0 0">O sacado pagou ao cedente? Abra a ocorrência na operação (botão "Registrar ocorrência"): o cedente recebe o link para repassar, e os lembretes ao sacado param.</p></div>
        <a class="btn secondary sm" href="#/assinar/ativo">Ver operações ativas</a></div></div>` : ''}
      <div class="card stack"><h2>Em aberto</h2>${open.length ? open.map(row).join('') : empty('Nenhuma ocorrência em aberto.')}</div>
      ${done.length ? `<details class="card"><summary><b>Resolvidas e canceladas (${done.length})</b></summary><div class="stack" style="margin-top:12px">${done.map(row).join('')}</div></details>` : ''}
    </div>`;
    pane.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => B.copy(list.find((k) => k.id === b.dataset.copy).pix)));
    pane.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = async () => {
      const note = await confirmAction({ title: 'Cancelar ocorrência', text: 'Use quando foi aberta por engano ou resolvida fora do sistema.', confirmLabel: 'Cancelar ocorrência', danger: true, note: true, noteRequired: true, noteLabel: 'Motivo' });
      if (note == null) return;
      run(b, () => rpc('partner_case_cancel', { p_id: b.dataset.cancel, p_note: note }), 'Ocorrência cancelada').then(B.reload).catch(() => null);
    }));
    pane.querySelectorAll('[data-resolve]').forEach((b) => (b.onclick = () => resolveCase(list.find((k) => k.id === b.dataset.resolve), b)));
  }

  function resolveCase(k, btn) {
    if (k.direction === 'to_fund') {
      confirmAction({ title: 'Repasse recebido', text: `Confira na conta do fundo o Pix de <b>${brl(k.amount)}</b> de ${esc(k.company)}. A duplicata fica paga.`, confirmLabel: 'Registrar' }).then((ok) => {
        if (ok == null) return;
        run(btn, () => rpc('partner_case_resolve', { p_id: k.id, p: {} }), 'Repasse registrado').then(B.reload).catch(() => null);
      });
      return;
    }
    const box = modal({
      title: 'Devolução feita',
      subtitle: `${brl(k.amount)} · ${esc(CASE_DIR[k.direction])}`,
      body: `<form class="stack" id="rf" novalidate>
        <div class="field"><label>ID do Pix (E2E) do comprovante</label><input class="input mono" name="ref" placeholder="E…" maxlength="40"></div>
        <label class="check-row"><input type="checkbox" name="other"><span class="small">Paguei de outra conta do fundo</span></label>
        <label class="check-row"><input type="checkbox" name="ted"><span class="small">Não foi Pix (TED ou outro meio): vou informar a identificação</span></label>
        <div class="error-box" data-err hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Registrar</button>',
    });
    box.querySelector('[data-act=cancel]').onclick = closeModal;
    box.querySelector('[data-act=ok]').onclick = (ev) => {
      const f = box.querySelector('#rf'), err = box.querySelector('[data-err]');
      const ref = f.ref.value.trim();
      if (!ref) { err.hidden = false; err.textContent = 'Informe o ID do Pix ou a identificação da transferência.'; return; }
      run(ev.currentTarget, () => rpc('partner_case_resolve', { p_id: k.id, p: { reference: ref, other_account: f.other.checked, kind: f.ted.checked ? 'other' : 'pix' } }), 'Devolução registrada')
        .then(() => { closeModal(); B.reload(); }).catch((e) => { err.hidden = false; err.textContent = B.message(e); });
    };
  }

  /* ------------------------------------------------------- recompras */
  async function buybacks(pane, me) {
    const list = await rpc('partner_buybacks', { p_status: 'all' });
    const open = list.filter((b) => b.status === 'open');
    const REASON = { overdue: 'prazo de atraso', voluntary: 'pedida pelo cedente', fund: 'pedida pelo fundo' };
    pane.innerHTML = `<div class="stack">
      <div class="card"><p class="small muted" style="margin:0">Quando o sacado não paga até o prazo do fundo, o cedente recompra a duplicata pelo valor de face com multa e juros do dia, em até 2 dias úteis. Com a recompra vencida, o cedente não faz novas antecipações. O prazo e as taxas ficam em Configurações → Banco.</p></div>
      <div class="card flush"><div class="table-wrap">${list.length === 0 ? empty('Nenhuma recompra.') : `<table>
        <thead><tr><th>Cedente</th><th>Duplicata</th><th>Prazo</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
        <tbody>${list.map((b, i) => `<tr>
          <td><b>${esc(b.company)}</b><div class="small muted">${esc(REASON[b.reason] || '')}</div></td>
          <td>NF-e ${esc(b.nfe || '—')}<div class="small muted">${esc(b.payer_name || '')} · venceu ${date(b.due_date)}</div><div class="small mono">${esc(b.txid)}</div></td>
          <td class="nowrap">${date(b.deadline)}${b.late ? ' <span class="tag danger">vencido</span>' : ''}</td>
          <td class="num"><b>${brl(b.amount)}</b>${b.status === 'open' ? '<div class="small muted">valor de hoje</div>' : ''}</td>
          <td>${b.status === 'open' ? '<span class="tag warning">Em aberto</span>' : b.status === 'paid' ? `<span class="tag success">Paga ${date(b.paid_at)}</span>` : '<span class="tag">Encerrada</span>'}</td>
          <td class="num"><div class="row" style="justify-content:flex-end;gap:6px"><a class="btn ghost sm" href="#/assinar/${esc(b.operation_id)}">Operação</a>
            ${b.status === 'open' && can(me) ? `<button class="btn sm" data-paid="${i}">Recebida</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`}</div></div>
      ${open.length ? `<p class="small muted">Em aberto: ${open.length} · ${brl(open.reduce((t, b) => t + Number(b.amount), 0))} hoje.</p>` : ''}
    </div>`;
    pane.querySelectorAll('[data-paid]').forEach((b) => (b.onclick = async () => {
      const x = list[b.dataset.paid];
      const r = await confirmAction({ title: 'Recompra recebida', text: `Confira na conta do fundo o Pix de ${esc(x.company)} (identificador <span class="mono">${esc(x.txid)}</span>). O valor é calculado até a data do recebimento.`,
        confirmLabel: 'Registrar', extra: `<div class="field"><label>Data em que caiu na conta</label><input class="input" type="date" data-field="day" value="${today()}" max="${today()}"></div>` });
      if (r == null) return;
      run(b, () => rpc('partner_buyback_received', { p_installment: x.installment_id, p_paid_on: r.values.day || null }), 'Recompra registrada').then(() => { if (B.refreshCounts) B.refreshCounts(); B.reload(); }).catch(() => null);
    }));
  }

  /* ------------------------------------------------------- histórico */
  async function history(pane) {
    const list = await rpc('partner_payments', { p_status: 'all' });
    const ST = { applied: ['Baixado', 'success'], unidentified: ['Sem cobrança', 'warning'], ignored: ['Fora', ''] };
    pane.innerHTML = `<div class="card flush"><div class="table-wrap">${list.length === 0 ? empty('Nenhum lançamento registrado ainda.') : `<table>
      <thead><tr><th>Data</th><th class="num">Valor</th><th>Lançamento</th><th>Baixa</th><th>Origem</th></tr></thead>
      <tbody>${list.map((p) => `<tr>
        <td class="nowrap">${date(p.received_on)}</td><td class="num"><b>${brl(p.amount)}</b></td>
        <td><div class="small" style="max-width:300px;word-break:break-word">${esc(p.memo || p.payer_name || '—')}</div>${p.e2e ? `<div class="small mono">${esc(p.e2e)}</div>` : ''}</td>
        <td><span class="tag ${ST[p.status][1]}">${esc(ST[p.status][0])}</span>${p.target_kind ? ` <span class="small">${esc(KIND[p.target_kind] || '')}${p.company ? ` · ${esc(p.company)}` : ''}</span>` : ''}${p.note ? `<div class="small muted">${esc(p.note)}</div>` : ''}
          ${p.operation_id ? `<div><a class="small" href="#/assinar/${esc(p.operation_id)}">Ver operação</a></div>` : ''}</td>
        <td class="small muted">${p.source === 'manual' ? 'À mão' : 'Extrato'}<div>${dateTime(p.created_at)}</div></td></tr>`).join('')}</tbody></table>`}</div></div>`;
  }

  B.receipts = { manual, parse };
})();
