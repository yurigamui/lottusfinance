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
