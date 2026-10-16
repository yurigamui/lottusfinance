/* Lottus · Backoffice — representantes (pessoas) e contratos */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, date, dateTime, cnpj, cpf, run, modal, closeModal } = B;
  const { head, empty, can } = B.ui;

  Object.assign(B.ACTION_LABEL, { contract_settings_saved: 'atualizou os dados dos contratos' });

  /** Texto de contrato com a marcação simples dos modelos ("# ", "## ", "• "). */
  function contractHtml(text) {
    return `<div class="contract">${String(text || '')
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean)
      .map((b) => (b.startsWith('# ') ? `<h3 class="contract-title">${esc(b.slice(2))}</h3>`
        : b.startsWith('## ') ? `<h4>${esc(b.slice(3))}</h4>`
        : `<p>${esc(b).replace(/\{\{(\w+)\}\}/g, '<mark>{{$1}}</mark>').replace(/\n/g, '<br>')}</p>`))
      .join('')}</div>`;
  }
  B.contractHtml = contractHtml;

  const ACCESS = { admin: 'Administrador', finance: 'Financeiro', viewer: 'Consulta' };
  const ROLE = { partner: 'Sócio', attorney: 'Procurador', employee: 'Colaborador' };
  const IDENTITY = { approved: ['success', 'Identidade aprovada'], in_review: ['warning', 'Identidade em análise'], rejected: ['danger', 'Identidade recusada'], pending: ['', 'Identidade pendente'] };

  /* ======================================================= Representantes */
  B.views.representantes = async (el) => {
    el.innerHTML = `${head('Representantes', 'Pessoas que acessam o app em nome dos cedentes', `<input class="input search" id="q" type="search" placeholder="Buscar por nome, CPF, e-mail ou empresa" aria-label="Buscar representante">`)}
      <div class="card flush"><div class="table-wrap" id="list"><div class="spinner"></div></div></div>`;
    const q = el.querySelector('#q');
    const load = async () => {
      const list = await rpc('bo_representatives', { p_search: q.value || null });
      const box = el.querySelector('#list');
      if (!box) return;
      box.innerHTML = list.length === 0 ? empty('Ninguém encontrado.') : `<table>
        <thead><tr><th>Pessoa</th><th>Contato</th><th>Empresas</th><th>Situação</th><th>Último acesso</th></tr></thead>
        <tbody>${list.map((p) => {
          const [tone, label] = IDENTITY[p.identity] || IDENTITY.pending;
          return `<tr>
          <td><b>${esc(p.name || '—')}</b><div class="small muted">CPF ${esc(cpf(p.cpf))}</div></td>
          <td>${esc(p.email || '—')}<div class="small muted">${esc(p.phone || '')}</div></td>
          <td>${p.companies.length === 0 ? '<span class="muted">—</span>' : p.companies.map((c) => `<div><a href="#/empresas/${esc(c.id)}">${esc(c.legal_name)}</a>
            <div class="small muted">${esc(cnpj(c.cnpj))} · ${esc(ACCESS[c.access] || c.access || '')}${c.role ? ' · ' + esc(ROLE[c.role] || c.role) : ''}</div></div>`).join('')}</td>
          <td><span class="tag ${tone}">${label}</span>${p.guarantor ? '<div style="margin-top:6px"><span class="tag brand">Devedor solidário</span></div>' : ''}</td>
          <td class="nowrap">${p.last_sign_in_at ? dateTime(p.last_sign_in_at) : '<span class="muted">nunca</span>'}<div class="small muted">desde ${date(p.created_at)}</div></td>
        </tr>`;
        }).join('')}</tbody></table>`;
    };
    let t; q.oninput = () => { clearTimeout(t); t = setTimeout(load, 300); };
    await load();
  };

  /* ============================================================ Contratos */
  const KIND = {
    terms: 'Termos de uso e privacidade', master_agreement: 'Contrato normativo (contrato-mãe)', assignment_terms: 'Termo de cessão',
    request_terms: 'Pedido de antecipação', schedule_terms: 'Cessão agendada', delegation_terms: 'Delegação de alçada',
    debtor_notice: 'Notificação de cessão ao sacado',
  };
  B.views.contratos = async (el, _p, me) => {
    const d = await rpc('bo_contract_settings');
    const admin = can(me, 'admin');
    const missing = !d.lottus_cnpj || !d.lottus_address || !d.contract_forum;
    el.innerHTML = `
      ${head('Contratos', 'Dados da Lottus que entram em todos os contratos e os modelos em uso')}
      <div class="stack">
        ${missing ? '<div class="note-box">Faltam dados da Lottus. Enquanto não forem preenchidos, os contratos mostram “[a preencher]” nesses campos.</div>' : ''}
        <div class="card"><h2>Dados da Lottus</h2>
          <form class="stack" id="f" style="margin-top:14px">
            <div class="form-row">
              <div class="field"><label>Razão social</label><input class="input" name="lottus_legal_name" value="${esc(d.lottus_legal_name || '')}" ${admin ? '' : 'disabled'}></div>
              <div class="field"><label>CNPJ</label><input class="input" name="lottus_cnpj" inputmode="numeric" value="${esc(d.lottus_cnpj ? cnpj(d.lottus_cnpj) : '')}" ${admin ? '' : 'disabled'}></div>
            </div>
            <div class="field"><label>Endereço completo da sede</label><input class="input" name="lottus_address" placeholder="Rua, número, bairro, cidade/UF, CEP" value="${esc(d.lottus_address || '')}" ${admin ? '' : 'disabled'}></div>
            <div class="form-row">
              <div class="field"><label>Foro (comarca)</label><input class="input" name="contract_forum" placeholder="Ex.: São Paulo/SP" value="${esc(d.contract_forum || '')}" ${admin ? '' : 'disabled'}></div>
              <div class="field"><label>E-mail de privacidade (LGPD)</label><input class="input" name="lottus_privacy_email" type="email" value="${esc(d.lottus_privacy_email || '')}" ${admin ? '' : 'disabled'}></div>
            </div>
            ${admin ? '<div><button class="btn" id="save" type="button">Salvar</button></div>' : '<p class="small muted">Só administradores alteram estes dados.</p>'}
          </form></div>
        <div class="card"><h2>Modelos</h2><p class="small muted" style="margin:4px 0 14px">Clique para ler o texto. Cada assinatura guarda o texto exato que a pessoa leu.</p>
          <div class="list">${(d.templates || []).map((t, i) => `<button class="list-row" data-t="${i}">
            <div class="grow"><b>${esc(KIND[t.kind] || t.title)}</b><div class="small muted">${esc(t.title)}</div></div>
            <div class="small muted">versão ${esc(t.version)}</div>
            ${t.active ? '<span class="tag success">Em uso</span>' : '<span class="tag">Arquivado</span>'}</button>`).join('') || empty('Nenhum modelo.')}</div></div>
      </div>`;
    const save = el.querySelector('#save');
    if (save) save.onclick = () => {
      const f = el.querySelector('#f');
      const p = Object.fromEntries(['lottus_legal_name', 'lottus_cnpj', 'lottus_address', 'contract_forum', 'lottus_privacy_email'].map((k) => [k, f[k].value]));
      run(save, () => rpc('bo_save_contract_settings', { p }), 'Dados salvos').then(B.reload);
    };
    el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = async () => {
      const t = d.templates[b.dataset.t];
      const box = modal({ title: KIND[t.kind] || t.title, subtitle: `Versão ${esc(t.version)} · os campos entre chaves são preenchidos na hora da assinatura`,
        body: '<div class="spinner"></div>', foot: '<button class="btn secondary" data-close-btn>Fechar</button>', wide: true });
      box.querySelector('[data-close-btn]').onclick = closeModal;
      try {
        const full = await rpc('bo_contract_template', { p_kind: t.kind, p_version: t.version });
        box.querySelector('.modal-body').innerHTML = `<div class="contract-box">${contractHtml(full.body)}</div>`;
      } catch (e) { box.querySelector('.modal-body').innerHTML = `<div class="note-box">${esc(e.message)}</div>`; }
    }));
  };
})();
