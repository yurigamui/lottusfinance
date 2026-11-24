/* Lottus · Admin — CRM comercial: funis de Lottus Partners e Lottus Sign */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, date, dateTime, toast, run, modal, closeModal, confirmAction } = B;
  const { head, can } = B.ui;
  const STAGES = [['lead', 'Lead'], ['contato', 'Contato'], ['gratuito', 'Plano gratuito'], ['usuario', 'Usuário'], ['perdido', 'Perdido']];
  const SNAME = Object.fromEntries(STAGES);
  const PROD = { partners: 'Lottus Partners', sign: 'Lottus Sign', ambos: 'Partners + Sign' };
  const KINDS = [['', 'Não informado'], ['securitizadora', 'Securitizadora'], ['fidc', 'FIDC'], ['bancarizador', 'Bancarizador'], ['empresa', 'Empresa'], ['pessoa', 'Pessoa física'], ['outro', 'Outro']];
  const opt = (arr, v) => arr.map(([k, l]) => `<option value="${esc(k)}" ${k === (v || '') ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const today = () => new Date().toISOString().slice(0, 10);

  B.views.crm = async (el, args, me) => {
    const admin = can(me, 'admin');
    let leads = await rpc('bo_crm_list');
    let fProd = '', fQ = '';
    el.innerHTML = head('CRM', 'Quem chegou, quem está em conversa e quem já usa o Lottus.',
      '<button class="btn" id="cnew">Novo lead</button>') +
      `<div class="row u-mb16" style="gap:8px;flex-wrap:wrap"><input class="input search" id="cq" placeholder="Buscar nome, e-mail ou CNPJ"><select class="input" id="cp" style="width:auto"><option value="">Todos os produtos</option>${Object.entries(PROD).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><span class="muted small" id="ccount"></span></div>
       <div class="kanban" id="kb"></div>`;
    const paint = () => {
      const q = fQ.toLowerCase();
      const list = leads.filter((l) => (!fProd || l.product === fProd) && (!q || `${l.name} ${l.email || ''} ${l.doc || ''} ${l.contact_name || ''}`.toLowerCase().includes(q)));
      el.querySelector('#ccount').textContent = `${list.length} ${list.length === 1 ? 'registro' : 'registros'}`;
      el.querySelector('#kb').innerHTML = STAGES.map(([k, label]) => {
        const col = list.filter((l) => l.stage === k);
        return `<section class="kcol" aria-label="${esc(label)}"><header><b>${esc(label)}</b><span class="tag">${col.length}</span></header>
          ${col.length ? col.map((l) => `<button class="kcard${l.attention ? ' attn' : ''}" data-id="${esc(l.id)}"><b>${esc(l.name)}</b>
            <span class="small muted">${esc(PROD[l.product] || l.product)}${l.kind ? ' · ' + esc((KINDS.find((x) => x[0] === l.kind) || [0, l.kind])[1]) : ''}</span>
            ${l.attention ? '<span class="tag brand">Pediu upgrade</span>' : ''}
            ${l.funder_id || l.sign_account_id ? '<span class="tag success">Tem conta</span>' : ''}
            ${l.next_action_at ? `<span class="small ${l.next_action_at < today() ? 'late' : 'muted'}">Próximo passo: ${date(l.next_action_at)}</span>` : ''}
            <span class="small muted">${l.last_activity_at ? 'Movimento ' + date(l.last_activity_at) : date(l.created_at)}</span></button>`).join('') : '<p class="small muted kempty">Vazio</p>'}</section>`;
      }).join('');
      el.querySelectorAll('.kcard').forEach((b) => (b.onclick = () => openLead(b.dataset.id)));
    };
    const refresh = async () => { leads = await rpc('bo_crm_list'); paint(); };
    el.querySelector('#cq').oninput = (e) => { fQ = e.target.value.trim(); paint(); };
    el.querySelector('#cp').onchange = (e) => { fProd = e.target.value; paint(); };
    el.querySelector('#cnew').onclick = () => leadForm(null, async () => { await refresh(); });
    paint();

    async function openLead(id) {
      let l;
      try { l = await rpc('bo_crm_get', { p_id: id }); } catch (e) { toast(B.message(e), true); return; }
      const draw = () => {
        const m = modal({ title: l.name, subtitle: `${esc(PROD[l.product] || l.product)} · criado em ${date(l.created_at)}`, wide: true, body: `<div class="stack">
          ${l.attention ? '<div class="note-box small">Este cliente pediu um plano pago. Atenda em Planos e cobrança › Lottus Sign.</div>' : ''}
          <div class="grid-2"><div class="stack-sm">
            <div class="small"><span class="muted">Contato</span><br>${esc(l.contact_name || '—')}</div>
            <div class="small"><span class="muted">E-mail</span><br>${l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : '—'}</div>
            <div class="small"><span class="muted">Telefone</span><br>${esc(l.phone || '—')}</div>
            <div class="small"><span class="muted">CNPJ/CPF</span><br>${esc(l.doc || '—')}</div>
            <div class="small"><span class="muted">Origem</span><br>${esc(l.source || '—')}</div>
            ${l.funder_id ? `<div class="small"><a href="#/parceiros/${esc(l.funder_id)}" id="gof">Ver fundo no Admin</a></div>` : ''}
            ${l.sign_account_id ? '<div class="small"><a href="#/planos/sign" id="gos">Ver conta no Lottus Sign</a></div>' : ''}
            ${l.notes ? `<div class="small"><span class="muted">Observações</span><br>${esc(l.notes).replace(/\n/g, '<br>')}</div>` : ''}
            ${l.lost_reason ? `<div class="small"><span class="muted">Motivo da perda</span><br>${esc(l.lost_reason)}</div>` : ''}</div>
          <div class="stack-sm"><div class="field"><label>Fase</label><select class="input" id="lst">${STAGES.map(([k, t]) => `<option value="${k}" ${k === l.stage ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
            ${l.funder_id || l.sign_account_id ? '<p class="small muted u-m0">Esta pessoa já tem conta: a fase acompanha o uso real (grátis ou pagante) automaticamente.</p>' : ''}
            <div class="field"><label>Nova anotação</label><textarea class="input" id="lnote" rows="3" maxlength="2000" placeholder="Ligou, mandou proposta, pediu retorno…"></textarea></div>
            <div><button class="btn secondary sm" id="ladd">Adicionar anotação</button></div></div></div>
          <div><h3 style="margin:0 0 8px">Histórico</h3>${l.activities.length ? l.activities.map((a) => `<div class="list-row"><div class="grow"><div class="small">${esc(a.text).replace(/\n/g, '<br>')}</div><div class="small muted">${esc(a.by || 'Sistema')} · ${dateTime(a.at)}${a.kind === 'stage' ? ' · mudança de fase' : ''}</div></div></div>`).join('') : '<p class="small muted">Sem registros.</p>'}</div></div>`,
          foot: `${admin ? '<button class="btn secondary" id="ldel" style="margin-right:auto">Excluir</button>' : ''}<button class="btn secondary" id="ledit">Editar dados</button><button class="btn" data-act="ok">Fechar</button>` });
        m.querySelector('[data-act=ok]').onclick = closeModal;
        m.querySelectorAll('#gof,#gos').forEach((a) => a.addEventListener('click', closeModal));
        m.querySelector('#ledit').onclick = () => { closeModal(); leadForm(l, async (nl) => { await refresh(); openLead(nl.id); }); };
        const del = m.querySelector('#ldel');
        if (del) del.onclick = async () => {
          const ok = await confirmAction({ title: 'Excluir lead', text: 'Isso apaga o lead e o histórico dele. Não dá para desfazer.', confirmLabel: 'Excluir', danger: true });
          if (ok === null) return;
          try { await run(null, () => rpc('bo_crm_delete', { p_id: l.id }), 'Lead excluído'); closeModal(); refresh(); } catch (e) { /* já avisado */ }
        };
        m.querySelector('#ladd').onclick = async (ev) => {
          const t = m.querySelector('#lnote').value.trim(); if (!t) return;
          try { l = await run(ev.currentTarget, () => rpc('bo_crm_note', { p_id: l.id, p_text: t }), 'Anotação salva'); closeModal(); draw(); refresh(); } catch (e) { /* já avisado */ }
        };
        m.querySelector('#lst').onchange = async (ev) => {
          const to = ev.target.value; let note = '';
          if (to === 'perdido') {
            const r = await confirmAction({ title: 'Marcar como perdido', text: 'Conte rapidamente por quê (ajuda a melhorar o produto).', confirmLabel: 'Marcar como perdido', note: true, noteLabel: 'Motivo', notePlaceholder: 'Ex.: achou caro, já usa outra ferramenta' });
            if (r === null) { ev.target.value = l.stage; return; } note = r;
          }
          try { l = await run(null, () => rpc('bo_crm_stage', { p_id: l.id, p_stage: to, p_note: note }), 'Fase atualizada'); closeModal(); draw(); refresh(); } catch (e) { ev.target.value = l.stage; }
        };
      };
      draw();
    }

    function leadForm(l, done) {
      const m = modal({ title: l ? 'Editar lead' : 'Novo lead', body: `<form id="lf" class="stack" novalidate>
        <div class="grid-2"><div class="field"><label>Nome da empresa ou pessoa</label><input class="input" name="name" maxlength="160" value="${esc(l ? l.name : '')}"></div>
          <div class="field"><label>Produto</label><select class="input" name="product">${opt(Object.entries(PROD), l ? l.product : 'partners')}</select></div></div>
        <div class="grid-2"><div class="field"><label>Tipo</label><select class="input" name="kind">${opt(KINDS, l && l.kind)}</select></div>
          ${l ? '' : `<div class="field"><label>Fase</label><select class="input" name="stage">${opt(STAGES.filter((s) => s[0] !== 'perdido'), 'lead')}</select></div>`}</div>
        <div class="grid-2"><div class="field"><label>Pessoa de contato</label><input class="input" name="contact_name" maxlength="120" value="${esc(l ? l.contact_name || '' : '')}"></div>
          <div class="field"><label>Telefone / WhatsApp</label><input class="input" name="phone" maxlength="40" value="${esc(l ? l.phone || '' : '')}"></div></div>
        <div class="grid-2"><div class="field"><label>E-mail</label><input class="input" name="email" type="email" value="${esc(l ? l.email || '' : '')}"></div>
          <div class="field"><label>CNPJ ou CPF</label><input class="input" name="doc" value="${esc(l ? l.doc || '' : '')}"></div></div>
        <div class="grid-2"><div class="field"><label>Como chegou</label><input class="input" name="source" maxlength="80" value="${esc(l ? l.source || '' : '')}" placeholder="Indicação, Instagram, evento…"></div>
          <div class="field"><label>Próximo passo em</label><input class="input" type="date" name="next_action_at" value="${esc(l && l.next_action_at ? String(l.next_action_at).slice(0, 10) : '')}"></div></div>
        <div class="field"><label>Observações</label><textarea class="input" name="notes" rows="3" maxlength="4000">${esc(l ? l.notes || '' : '')}</textarea></div>
        <div class="error-box" id="le" hidden></div></form>`,
        foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar</button>' });
      m.querySelector('[data-act=cancel]').onclick = closeModal;
      m.querySelector('[data-act=ok]').onclick = async (ev) => {
        const f = m.querySelector('#lf'), err = m.querySelector('#le'); err.hidden = true;
        if (f.name.value.trim().length < 2) { err.hidden = false; err.textContent = 'Informe o nome.'; return; }
        if (f.email.value.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.value.trim())) { err.hidden = false; err.textContent = 'E-mail inválido.'; return; }
        const p = { id: l ? l.id : '', name: f.name.value, product: f.product.value, kind: f.kind.value, contact_name: f.contact_name.value, phone: f.phone.value, email: f.email.value, doc: f.doc.value, source: f.source.value, next_action_at: f.next_action_at.value, notes: f.notes.value };
        if (!l) p.stage = f.stage.value;
        try { const r = await run(ev.currentTarget, () => rpc('bo_crm_save', { p }), 'Lead salvo'); closeModal(); done(r); } catch (e) { /* já avisado */ }
      };
    }
  };
})();
