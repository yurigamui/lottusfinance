/* Lottus · Backoffice — Cobranças (vencimentos) e Jurídico (documentos assinados) */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, dateTime, cnpj, run, toast, modal, confirmAction } = B;
  const { head, tabs, onTabs, empty, can, skipEmpty } = B.ui;

  const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ------------------------------------------------ contrato em PDF (impressão) */
  function contractPage(c, logo) {
    const body = B.contractHtml(c.text);
    const sigs = (c.signatures || []).map((s) => `<tr><td>${esc(s.kind === 'funder_acceptance' ? 'Aceite da cessionária' : s.kind === 'scheduled_withdrawal' ? 'Cedente (agendamento)' : 'Cedente')}</td>
      <td>${esc(s.signer_name)}</td><td>${esc(dateTime(s.signed_at))}</td><td class="mono">${esc(String(s.record_hash || '').slice(0, 24))}…</td></tr>`).join('');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(c.title)}</title>
<style>${B.DOC_CSS}</style></head><body>
  ${B.docHead(logo, c.title || 'Documento assinado')}
  <div class="muted">${esc(c.company || '')} · CNPJ ${esc(cnpj(c.cnpj || ''))}${c.version ? ` · versão ${esc(c.version)}` : ''}</div>
  ${body}
  <h2 class="box-title">Assinaturas eletrônicas</h2>
  <div class="sig">
    <table><thead><tr><th>Parte</th><th>Assinado por</th><th>Quando</th><th>Registro</th></tr></thead><tbody>${sigs ||
      `<tr><td>Cedente</td><td>${esc(c.signer_name)}</td><td>${esc(dateTime(c.signed_at))}</td><td class="mono">${esc(String(c.record_hash || '').slice(0, 24))}…</td></tr>`}</tbody></table>
    <p class="muted" style="margin:8px 0 0;font-size:8.5pt">Código do documento (SHA-256): <span class="mono">${esc(c.sha256 || c.document_hash || '')}</span></p>
  </div>
  <div class="foot">Assinatura eletrônica nos termos da MP 2.200-2/2001 e da Lei 14.063/2020. A trilha completa está no comprovante da operação. Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.</div>
</body></html>`;
  }
  function printHtml(html, title) {
    const w = window.open('', '_blank');
    if (!w) { toast('Permita pop-ups para abrir o documento.', true); return null; }
    w.document.open(); w.document.write(html); w.document.close(); w.document.title = title;
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* fechada */ } }, 400);
    return w;
  }

  /** "Baixar Contrato" da operação: o termo de cessão exatamente como foi assinado */
  B.openContract = async (opId, btn) => {
    const w = window.open('', '_blank');
    if (!w) return toast('Permita pop-ups para abrir o contrato.', true);
    w.document.write('<p style="font-family:Inter,sans-serif;padding:24px">Gerando contrato…</p>');
    try {
      if (btn) btn.disabled = true;
      const c = await rpc('bo_operation_contract', { p_id: opId });
      const logo = await B.logoData();
      w.document.open(); w.document.write(contractPage(c, logo)); w.document.close();
      w.document.title = `Contrato ${String(opId).slice(0, 8)}`;
      setTimeout(() => { try { w.focus(); w.print(); } catch { /* fechada */ } }, 400);
    } catch (e) {
      w.close(); toast(B.message(e), true);
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  /** Um documento assinado: texto integral e prova da assinatura */
  B.showLegalDocument = async (id) => {
    const d = await rpc('bo_legal_document', { p_id: id }).catch((e) => { toast(B.message(e), true); return null; });
    if (!d) return;
    const ev = d.evidence || {};
    const box = modal({
      title: d.title, wide: true,
      subtitle: `${esc(d.company)} · assinado por ${esc(d.signer_name)} em ${esc(dateTime(d.signed_at))}`,
      body: `<div class="stack">
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${d.intact === false ? '<span class="tag danger">Registro alterado</span>' : d.intact ? '<span class="tag success">Registro íntegro</span>' : ''}
          <span class="tag">${esc(d.label)}</span>${d.version ? `<span class="tag">versão ${esc(d.version)}</span>` : ''}</div>
        <dl class="kv">
          <dt>Signatário</dt><dd>${esc(d.signer_name)} · CPF ${esc(d.signer_cpf)}${d.signer_access ? ' · ' + esc(B.ACCESS[d.signer_access] || d.signer_access) : ''}</dd>
          <dt>IP</dt><dd>${esc(d.ip || '—')}</dd>
          ${ev.device ? `<dt>Aparelho</dt><dd>${esc(ev.device)}</dd>` : ''}
          ${ev.confirmation ? `<dt>Confirmação</dt><dd>${esc(ev.confirmation)}</dd>` : ''}
          <dt>Hash do documento</dt><dd class="mono">${esc(d.document_hash)}</dd>
          <dt>Hash do registro</dt><dd class="mono">${esc(d.record_hash)}</dd>
        </dl>
        ${d.text ? `<div class="contract-scroll">${B.contractHtml(d.text)}</div>` : '<p class="muted">Este registro é anterior à versão que guarda o texto integral. A prova da assinatura (hashes, IP e aparelho) continua válida.</p>'}
      </div>`,
      foot: `${d.text ? '<button class="btn secondary" id="pdf">Baixar PDF</button>' : ''}<button class="btn" data-close-btn>Fechar</button>`,
    });
    const pdf = box.querySelector('#pdf');
    if (pdf) pdf.onclick = async () => printHtml(contractPage({ ...d, sha256: d.document_hash, signatures: [] }, await B.logoData()), d.title);
    box.querySelector('[data-close-btn]').onclick = () => B.closeModal();
  };

  /* ============================================================ Cobranças */
  // Só acompanhamento: a baixa, as devoluções e os repasses são automáticos pela Conta Trio
  const RECV_TABS = [['open', 'Em aberto'], ['overdue', 'Vencidas'], ['paid', 'Encerradas'], ['recompras', 'Recompras'], ['excecoes', 'Exceções']];
  const RECV_TAG = {
    open: ['A vencer', ''], today: ['Vence hoje', 'warning'], overdue: ['Vencida', 'danger'], paid: ['Paga', 'success'], cancelled: ['Encerrada', ''],
  };
  const CLOSED = { sacado: 'paga pelo sacado', cedente: 'paga pelo cedente', repasse: 'repassada pelo cedente', settlement: 'quitada pelo cedente', buyback: 'recomprada pelo cedente', manual: 'baixa manual do fundo' };
  const CASE_KIND = { paid_to_assignor: 'Sacado pagou ao cedente', duplicate: 'Pagamento em duplicidade', overpaid: 'Pagamento a mais', after_close: 'Pago depois de encerrada' };
  const CASE_DIR = { to_fund: 'cedente repassa ao fundo', to_payer: 'fundo devolve a quem pagou', to_assignor: 'fundo repassa ao cedente' };
  const when = (r) => r.status === 'paid' || r.status === 'cancelled' ? (r.paid_at ? `${CLOSED[r.closed_reason] || 'encerrada'} ${date(r.paid_at)}` : CLOSED[r.closed_reason] || 'encerrada')
    : r.days === 0 ? 'hoje' : r.days > 0 ? `em ${r.days} dia${r.days > 1 ? 's' : ''}` : `há ${-r.days} dia${r.days < -1 ? 's' : ''}`;

  B.views.cobrancas = async (el, [arg], me) => {
    const LEG = { ocorrencias: 'excecoes', naoident: 'excecoes', next7: 'open', next30: 'open', all: 'open' };
    const view = RECV_TABS.some(([k]) => k === arg) ? arg : LEG[arg] || 'open';
    const special = ['recompras', 'excecoes'].includes(view);
    const d = await rpc('bo_receivables', { p_view: special ? 'open' : view, p_limit: special ? 1 : 300 });

    const t = d.totals || {}, col = d.collections || {};
    const kpi = (label, value, href, alert) => `<a class="kpi ${alert && Number(value) > 0 ? 'alert' : ''}" href="#/cobrancas/${href}"><span class="kpi-label">${esc(label)}</span><span class="kpi-value">${brl(value)}</span></a>`;
    const kn = (label, value, href, alert) => `<a class="kpi ${alert && Number(value) > 0 ? 'alert' : ''}" href="#/cobrancas/${href}"><span class="kpi-label">${esc(label)}</span><span class="kpi-value">${esc(value || 0)}</span></a>`;
    el.innerHTML = `
      ${head('Cobranças', 'Vencimentos das duplicatas cedidas. A baixa é automática pela Conta Trio dos fundos.', special ? '' : `<input class="input search" id="q" type="search" placeholder="Buscar sacado, cedente ou fundo" aria-label="Buscar">`)}
      <div class="kpis">
        ${kpi('Em aberto', t.open, 'open')}
        ${kpi(`Vencido${t.overdue_count ? ` (${t.overdue_count})` : ''}`, t.overdue, 'overdue', true)}
        ${kn(`Recompras${col.buybacks_late ? ` · ${col.buybacks_late} vencidas` : ''}`, col.buybacks, 'recompras', col.buybacks_late)}
        ${kn('Exceções', Number(col.cases || 0) + Number(col.unidentified || 0), 'excecoes', true)}
      </div>
      <div class="row between" style="margin-bottom:12px">${tabs(RECV_TABS, view)}</div>
      <div class="card flush"><div class="table-wrap" id="list"><div class="spinner" aria-label="Carregando"></div></div></div>`;
    onTabs(el, (k) => (location.hash = `#/cobrancas/${k}`));
    const box = el.querySelector('#list');

    if (view === 'recompras') {
      const list = await rpc('bo_collections', { p_kind: 'buybacks' });
      box.innerHTML = list.length === 0 ? empty('Nenhuma recompra.') : `<table>
        <thead><tr><th>Cedente</th><th>Fundo</th><th>Duplicata</th><th>Prazo</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
        <tbody>${list.map((b) => `<tr><td><a href="#/empresas/${esc(b.company_id)}"><b>${esc(b.company)}</b></a></td><td>${esc(b.funder || '—')}</td>
          <td>NF-e ${esc(b.nfe || '—')}<div class="small muted">${esc(b.payer_name || '')} · venceu ${date(b.due_date)}</div></td>
          <td class="nowrap">${date(b.deadline)}${b.late ? ' <span class="tag danger">vencido</span>' : ''}</td>
          <td class="num"><b>${brl(b.amount)}</b></td>
          <td>${b.status === 'open' ? '<span class="tag warning">Em aberto</span>' : b.status === 'paid' ? `<span class="tag success">Paga ${date(b.paid_at)}</span>` : '<span class="tag">Encerrada</span>'}</td>
          <td class="num"><a class="btn ghost sm" href="#/operacoes/${esc(b.operation_id)}">Operação</a></td></tr>`).join('')}</tbody></table>`;
      return;
    }
    if (view === 'excecoes') {
      const [cases, pays] = await Promise.all([rpc('bo_collections', { p_kind: 'cases' }), rpc('bo_collections', { p_kind: 'payments' })]);
      const AUTO = { pending: ['Em andamento', 'warning'], done: ['Feito', 'success'], failed: ['Falhou · a rotina tenta de novo', 'danger'] };
      box.innerHTML = cases.length === 0 && pays.length === 0 ? empty('Nenhuma exceção. Pagamentos em dobro, a mais ou depois de encerrada aparecem aqui, já com a devolução ou o repasse automático.') : `
        ${cases.length ? `<table>
        <thead><tr><th>Quando</th><th>O que houve</th><th>Cedente</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
        <tbody>${cases.map((k) => `<tr><td class="nowrap">${dateTime(k.created_at)}</td>
          <td><b>${esc(CASE_KIND[k.kind] || k.kind)}</b><div class="small muted">${esc(CASE_DIR[k.direction] || '')}${k.nfe ? ` · NF-e ${esc(k.nfe)}` : ''}${k.funder ? ` · ${esc(k.funder)}` : ''}</div></td>
          <td>${esc(k.company)}</td><td class="num"><b>${brl(k.amount)}</b></td>
          <td>${k.status === 'resolved' ? '<span class="tag success">Resolvida</span>' : k.status === 'cancelled' ? '<span class="tag">Cancelada</span>' : k.auto_status ? `<span class="tag ${AUTO[k.auto_status][1]}">${AUTO[k.auto_status][0]}</span>` : '<span class="tag warning">Em aberto</span>'}${k.auto_error ? `<div class="small" style="color:var(--danger)">${esc(k.auto_error)}</div>` : ''}</td>
          <td class="num">${k.operation_id ? `<a class="btn ghost sm" href="#/operacoes/${esc(k.operation_id)}">Operação</a>` : ''}</td></tr>`).join('')}</tbody></table>` : ''}
        ${pays.length ? `<div class="card-head" style="padding:16px 20px 0"><h3 style="margin:0">Pix sem cobrança</h3></div><table>
        <thead><tr><th>Data</th><th>Fundo</th><th class="num">Valor</th><th>De quem</th></tr></thead>
        <tbody>${pays.map((p) => `<tr><td class="nowrap">${date(p.received_on)}</td><td>${esc(p.funder || '—')}</td><td class="num"><b>${brl(p.amount)}</b></td>
          <td><div class="small">${esc(p.payer_name || '—')}</div>${p.payer_doc ? `<div class="small muted">${esc(cnpj(p.payer_doc))}</div>` : ''}</td></tr>`).join('')}</tbody></table>` : ''}`;
      return;
    }

    const paint = () => {
      const q = el.querySelector('#q').value.trim().toLowerCase();
      const rows = d.items.filter((r) => !q || `${r.debtor_name} ${r.debtor_cnpj} ${r.company} ${r.funder || ''}`.toLowerCase().includes(q));
      box.innerHTML = rows.length === 0 ? empty('Nenhum vencimento aqui.') : `<table>
        <thead><tr><th>Vencimento</th><th>Sacado</th><th>Cedente</th><th>Duplicata</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
        <tbody>${rows.map((r) => { const [l, tone] = RECV_TAG[r.status] || [r.status, '']; return `<tr>
          <td class="nowrap"><b>${date(r.due_date)}</b><div class="small muted">${esc(when(r))}</div></td>
          <td><b>${esc(r.debtor_name || cnpj(r.debtor_cnpj))}</b><div class="small muted">${esc(cnpj(r.debtor_cnpj))}</div></td>
          <td><a href="#/empresas/${esc(r.company_id)}">${esc(r.company)}</a>${r.funder ? `<div class="small muted">${esc(r.funder)}</div>` : ''}</td>
          <td>NF-e ${esc(r.nfe_number || '—')} · parc. ${esc(r.installment)}<div class="small muted">${r.charge === 'pix' ? 'Cobrança Pix' : r.charge === 'boleto' ? 'Boleto' : r.charge_error ? `<span style="color:var(--danger)">${esc(r.charge_error)}</span>` : 'Sem cobrança emitida'}</div></td>
          <td class="num"><b>${brl(r.amount)}</b></td>
          <td><span class="tag ${tone}">${esc(l)}</span>${r.buyback === 'open' ? '<div class="small" style="color:var(--danger)">recompra aberta</div>' : ''}${r.cases ? `<div class="small" style="color:var(--warning)">${r.cases} ocorrência${r.cases === 1 ? '' : 's'}</div>` : ''}</td>
          <td class="num"><a class="btn ghost sm" href="#/operacoes/${esc(r.operation_id)}">Operação</a></td>
        </tr>`; }).join('')}</tbody></table>`;
    };
    paint();
    el.querySelector('#q').addEventListener('input', debounce(paint, 150));
  };

  /* ============================================================== Jurídico */
  const KINDS = [
    ['', 'Todos os documentos'], ['master_agreement', 'Contratos-mãe'], ['anticipation', 'Termos de cessão'],
    ['scheduled_withdrawal', 'Termos de agendamento'], ['anticipation_request', 'Pedidos de antecipação'],
    ['funder_acceptance', 'Aceites da cessionária'], ['delegation', 'Termos de alçada'],
  ];

  B.views.juridico = async (el) => {
    const pend = await rpc('bo_legal_pending').catch(() => null);
    el.innerHTML = `
      ${head('Jurídico', 'Todos os documentos assinados na Lottus')}
      <div class="stack">
        ${pend ? `<div class="card"><div class="card-head"><div><h2>Verificação</h2>
            <div class="muted small">Feita automaticamente a cada operação e sempre que esta tela abre.</div></div>
            ${pend.operations.length || (pend.chain_problems || []).length ? '<span class="tag danger">Com pendências</span>' : '<span class="tag success">Tudo em ordem</span>'}</div>
          <div class="doc-checks">
            <div class="doc-check ${(pend.chain_problems || []).length ? 'no' : 'ok'}"><span class="doc-ico">${(pend.chain_problems || []).length ? '!' : '✓'}</span>
              <div class="grow"><b>Cadeia de assinaturas</b><div class="small muted">${pend.chain_problems == null ? 'Não foi possível verificar agora'
                : pend.chain_problems.length ? `${pend.chain_problems.length} registro(s) com problema: ${pend.chain_problems.map((p) => '#' + esc(p.id)).join(', ')}`
                : `${esc(pend.records)} registros íntegros, nenhum alterado`}</div></div></div>
            <div class="doc-check ${pend.operations.length ? 'no' : 'ok'}"><span class="doc-ico">${pend.operations.length ? '!' : '✓'}</span>
              <div class="grow"><b>Operações em andamento</b><div class="small muted">${pend.operations.length ? `${pend.operations.length} com documento faltando` : 'Todas com os documentos assinados'}</div></div></div>
          </div>
          ${pend.operations.length ? `<div class="list" style="margin-top:8px">${pend.operations.map((o) => `<a class="list-row" href="#/operacoes/${esc(o.id)}">
            <div class="grow"><div class="row" style="gap:8px;justify-content:flex-start"><b>${esc(o.company)}</b>${B.tag('op', o.status)}</div><div class="small" style="color:var(--danger)">Falta: ${esc(o.missing.join(', '))}</div></div>
            <span class="num">${brl(o.net)}</span></a>`).join('')}</div>` : ''}
        </div>` : ''}

        <div class="card">
          <div class="form-row legal-filters">
            <div class="field"><label for="k">Tipo</label><select class="input" id="k">${KINDS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
            <div class="field grow"><label for="p">Parte</label><input class="input" id="p" type="search" placeholder="Cedente, fundo ou signatário (nome, CNPJ ou CPF)"></div>
            <div class="field"><label for="d1">De</label><input class="input" id="d1" type="date"></div>
            <div class="field"><label for="d2">Até</label><input class="input" id="d2" type="date"></div>
          </div>
        </div>
        <div class="card flush"><div class="table-wrap" id="list"><div class="spinner"></div></div></div>
        <div class="card flush" id="notices-sec"></div>
      </div>`;
    if (B.noticesSection) B.noticesSection(el.querySelector('#notices-sec'));

    const f = { k: el.querySelector('#k'), p: el.querySelector('#p'), d1: el.querySelector('#d1'), d2: el.querySelector('#d2') };
    let seq = 0;
    const load = async () => {
      const my = ++seq;
      const d = await rpc('bo_legal_documents', { p_kind: f.k.value || null, p_party: f.p.value.trim() || null,
        p_from: f.d1.value || null, p_to: f.d2.value || null }).catch((e) => { toast(B.message(e), true); return null; });
      if (!d || my !== seq) return;
      const c = d.counts || {};
      f.k.querySelectorAll('option').forEach((o) => {
        const base = KINDS.find(([v]) => v === o.value)[1];
        const n = o.value ? c[o.value] || 0 : Object.values(c).reduce((a, b) => a + Number(b), 0);
        o.textContent = `${base} (${n})`;
      });
      el.querySelector('#list').innerHTML = d.items.length === 0 ? empty('Nenhum documento com estes filtros.') : `<table>
        <thead><tr><th>Assinado em</th><th>Documento</th><th>Partes</th><th>Signatário</th><th></th></tr></thead>
        <tbody>${d.items.map((x) => `<tr>
          <td class="nowrap">${dateTime(x.signed_at)}</td>
          <td><b>${esc(x.label)}</b>${x.version ? `<div class="small muted">versão ${esc(x.version)}</div>` : ''}${x.has_text ? '' : '<div class="small muted">sem texto integral</div>'}</td>
          <td><a href="#/empresas/${esc(x.company_id)}">${esc(x.company)}</a><div class="small muted">${esc(cnpj(x.cnpj))}${x.funder ? ' · ' + esc(x.funder) : ''}</div></td>
          <td>${esc(x.signer_name)}<div class="small muted">CPF ${esc(x.signer_cpf)}${x.signer_access ? ' · ' + esc(B.ACCESS[x.signer_access] || x.signer_access) : ''}</div></td>
          <td class="num"><div class="row" style="justify-content:flex-end">
            ${x.operation_id ? `<a class="btn ghost sm" href="#/operacoes/${esc(x.operation_id)}">Operação</a>` : ''}
            <button class="btn secondary sm" data-view="${esc(x.id)}">Ver</button></div></td>
        </tr>`).join('')}</tbody></table>`;
      el.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => B.showLegalDocument(Number(b.dataset.view))));
    };
    f.k.onchange = load; f.d1.onchange = load; f.d2.onchange = load;
    f.p.addEventListener('input', debounce(load, 300));
    load();
  };
})();
