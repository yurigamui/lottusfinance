/* Lottus Admin — Comercial: funil em colunas (arrastar muda a etapa) e tarefas */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, dateTime, toast, run, modal, closeModal, confirmAction } = B;
  const { head, tabs, onTabs, empty, can } = B.ui;
  const STAGES = [['lead', 'Lead'], ['contato', 'Em contato'], ['proposta', 'Proposta'], ['teste', 'Teste grátis'], ['cliente', 'Cliente'], ['perdido', 'Perdido']];
  const OPEN = ['lead', 'contato', 'proposta', 'teste'];
  const PROD = { partners: 'Lottus Partners', sign: 'Lottus Sign', ambos: 'Partners + Sign' };
  const KINDS = [['', 'Não informado'], ['securitizadora', 'Securitizadora'], ['fidc', 'FIDC'], ['gestora', 'Gestora'], ['bancarizador', 'Bancarizador'], ['empresa', 'Empresa'], ['escritorio', 'Escritório'], ['pessoa', 'Pessoa física'], ['outro', 'Outro']];
  const TKIND = [['ligar', 'Ligar'], ['email', 'E-mail'], ['reuniao', 'Reunião'], ['proposta', 'Enviar proposta'], ['retorno', 'Retorno'], ['outro', 'Outro']];
  const opt = (arr, v) => arr.map(([k, l]) => `<option value="${esc(k)}" ${k === (v || '') ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const today = () => B.today();
  const days = (a, b = new Date()) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 864e5));
  const num = (v) => { const n = Number(String(v || '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  let staffCache = null, campCache = null;
  const staff = async () => (staffCache = staffCache || (await rpc('bo_staff_names').catch(() => [])));
  const camps = async () => (campCache = campCache || (await rpc('bo_mkt_campaigns').catch(() => [])));

  /* ------------------------------------------------------------------ funil */
  B.views.funil = async (el, [arg], me) => {
    const admin = can(me, 'admin');
    let leads = await rpc('bo_crm_list');
    let fProd = '', fQ = '', fOwner = '';
    const people = await staff();
    el.innerHTML = head('Funil', 'Quem pode virar cliente e qual é o próximo passo com cada um.', '<button class="btn" id="cnew">Novo lead</button>') +
      `<div class="kpi4" id="fsum"></div>
       <div class="row u-mb16" style="gap:8px;flex-wrap:wrap"><input class="input search" id="cq" placeholder="Buscar nome, e-mail ou CNPJ" aria-label="Buscar lead">
         <select class="input" id="cp" style="width:auto"><option value="">Todos os produtos</option>${Object.entries(PROD).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
         <select class="input" id="co" style="width:auto"><option value="">Todos os responsáveis</option>${people.map((p) => `<option value="${esc(p.user_id)}">${esc(p.name)}</option>`).join('')}</select>
         <span class="muted small" id="ccount"></span></div>
       <div class="kanban k6" id="kb"></div>`;
    const summary = () => {
      const open = leads.filter((l) => OPEN.includes(l.stage)), won = leads.filter((l) => l.stage === 'cliente'), lost = leads.filter((l) => l.stage === 'perdido');
      const closed = won.length + lost.length, conv = closed ? Math.round((won.length / closed) * 100) : 0;
      const cycle = won.length ? Math.round(won.reduce((t, l) => t + days(l.created_at, l.stage_changed_at), 0) / won.length) : null;
      el.querySelector('#fsum').innerHTML = [
        ['No funil', open.length, `${brl(open.reduce((t, l) => t + Number(l.value_monthly || 0), 0))}/mês estimado`, 'main'],
        ['Propostas', leads.filter((l) => l.stage === 'proposta').length, 'aguardando resposta', ''],
        ['Conversão', `${conv}%`, `${won.length} ganhos de ${closed} fechados`, ''],
        ['Tempo até fechar', cycle == null ? '—' : `${cycle} d`, 'média dos clientes ganhos', ''],
      ].map(([l, v, s, c]) => `<div class="tile ${c}"><span class="kpi-label">${l}</span><span class="tile-value">${v}</span><span class="small muted">${s}</span></div>`).join('');
    };
    const paint = () => {
      summary();
      const q = fQ.toLowerCase();
      const list = leads.filter((l) => (!fProd || l.product === fProd) && (!fOwner || l.owner_id === fOwner) && (!q || `${l.name} ${l.email || ''} ${l.doc || ''} ${l.contact_name || ''}`.toLowerCase().includes(q)));
      el.querySelector('#ccount').textContent = `${list.length} ${list.length === 1 ? 'registro' : 'registros'}`;
      el.querySelector('#kb').innerHTML = STAGES.map(([k, label]) => {
        const col = list.filter((l) => l.stage === k);
        const val = col.reduce((t, l) => t + Number(l.value_monthly || 0), 0);
        return `<section class="kcol" data-stage="${k}" aria-label="${esc(label)}"><header><b>${esc(label)}</b><span class="tag">${col.length}</span>${val ? `<span class="small muted">${B.brlCompact(val)}</span>` : ''}</header>
          ${col.length ? col.map((l) => `<button class="kcard${l.attention ? ' attn' : ''}" data-id="${esc(l.id)}" draggable="true"><b>${esc(l.name)}</b>
            <span class="small muted">${esc(PROD[l.product] || l.product)}${l.value_monthly ? ' · ' + brl(l.value_monthly) + '/mês' : ''}</span>
            ${l.attention ? '<span class="tag brand">Pediu upgrade</span>' : ''}${l.funder_id || l.sign_account_id ? '<span class="tag success">Tem conta</span>' : ''}
            ${l.next_action_at ? `<span class="small ${l.next_action_at < today() ? 'late' : 'muted'}">Próximo passo: ${date(l.next_action_at)}</span>` : (OPEN.includes(k) ? '<span class="small late">Sem próximo passo</span>' : '')}
            <span class="small muted">${days(l.stage_changed_at || l.created_at)} d nesta etapa${l.owner_name ? ' · ' + esc(l.owner_name.split(' ')[0]) : ''}</span></button>`).join('') : '<p class="small muted kempty">Arraste para cá</p>'}</section>`;
      }).join('');
      el.querySelectorAll('.kcard').forEach((b) => {
        b.onclick = () => openLead(b.dataset.id);
        b.ondragstart = (e) => { e.dataTransfer.setData('text/plain', b.dataset.id); b.classList.add('dragging'); };
        b.ondragend = () => b.classList.remove('dragging');
      });
      el.querySelectorAll('.kcol').forEach((c) => {
        c.ondragover = (e) => { e.preventDefault(); c.classList.add('over'); };
        c.ondragleave = () => c.classList.remove('over');
        c.ondrop = async (e) => {
          e.preventDefault(); c.classList.remove('over');
          const id = e.dataTransfer.getData('text/plain'), l = leads.find((x) => x.id === id), to = c.dataset.stage;
          if (!l || l.stage === to) return;
          let note = '';
          if (to === 'perdido') {
            const r = await confirmAction({ title: 'Marcar como perdido', text: 'Conte rapidamente por quê.', confirmLabel: 'Marcar como perdido', note: true, noteLabel: 'Motivo', notePlaceholder: 'Ex.: achou caro, já usa outra ferramenta' });
            if (r === null) return; note = r;
          }
          try { await run(null, () => rpc('bo_crm_stage', { p_id: id, p_stage: to, p_note: note }), `Movido para ${STAGES.find((s) => s[0] === to)[1]}`); await refresh(); } catch { /* aviso mostrado */ }
        };
      });
    };
    const refresh = async () => { leads = await rpc('bo_crm_list'); paint(); };
    el.querySelector('#cq').oninput = (e) => { fQ = e.target.value.trim(); paint(); };
    el.querySelector('#cp').onchange = (e) => { fProd = e.target.value; paint(); };
    el.querySelector('#co').onchange = (e) => { fOwner = e.target.value; paint(); };
    el.querySelector('#cnew').onclick = () => leadForm(null, refresh);
    paint();
    if (arg === 'new') leadForm(null, refresh);
    else if (arg && leads.some((l) => l.id === arg)) openLead(arg);

    async function openLead(id) {
      let l;
      try { [l] = await Promise.all([rpc('bo_crm_get', { p_id: id })]); } catch (e) { toast(B.message(e), true); return; }
      const tasks = (await rpc('bo_tasks', { p_scope: 'all' }).catch(() => [])).filter((t) => t.lead_id === id);
      const cs = await camps();
      const m = modal({ title: l.name, subtitle: `${esc(PROD[l.product] || l.product)} · criado em ${date(l.created_at)}${l.source ? ' · ' + esc(l.source) : ''}`, wide: true, body: `<div class="stack">
        ${l.attention ? '<div class="note-box small">Este cliente pediu um plano pago. Responda em Clientes › Assinaturas.</div>' : ''}
        <div class="grid-2"><div class="stack-sm">
          <div class="small"><span class="muted">Contato</span><br>${esc(l.contact_name || '—')}</div>
          <div class="small"><span class="muted">E-mail</span><br>${l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : '—'}</div>
          <div class="small"><span class="muted">Telefone</span><br>${l.phone ? `${esc(l.phone)} · <a href="https://wa.me/${esc(String(l.phone).replace(/\D/g, '').replace(/^(?!55)/, '55'))}" target="_blank" rel="noopener">WhatsApp</a>` : '—'}</div>
          <div class="small"><span class="muted">CNPJ/CPF</span><br>${esc(l.doc || '—')}</div>
          ${l.message ? `<div class="small"><span class="muted">Mensagem pelo site</span><br>${esc(l.message).replace(/\n/g, '<br>')}</div>` : ''}
          ${l.funder_id ? `<div class="small"><a href="#/clientes/funder/${esc(l.funder_id)}" data-close>Ver ficha do cliente</a></div>` : ''}
          ${l.sign_account_id ? `<div class="small"><a href="#/clientes/sign/${esc(l.sign_account_id)}" data-close>Ver ficha do cliente</a></div>` : ''}
          ${l.notes ? `<div class="small"><span class="muted">Observações</span><br>${esc(l.notes).replace(/\n/g, '<br>')}</div>` : ''}
          ${l.lost_reason ? `<div class="small"><span class="muted">Motivo da perda</span><br>${esc(l.lost_reason)}</div>` : ''}</div>
        <div class="stack-sm">
          <div class="grid-2"><div class="field"><label>Etapa</label><select class="input" id="lst">${opt(STAGES, l.stage)}</select></div>
            <div class="field"><label>Valor mensal estimado</label><input class="input" id="lval" inputmode="decimal" value="${l.value_monthly ? String(l.value_monthly).replace('.', ',') : ''}" placeholder="R$"></div></div>
          <div class="grid-2"><div class="field"><label>Responsável</label><select class="input" id="lown"><option value="">Ninguém</option>${(await staff()).map((p) => `<option value="${esc(p.user_id)}" ${p.user_id === l.owner_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
            <div class="field"><label>Campanha de origem</label><select class="input" id="lcamp"><option value="">Nenhuma</option>${cs.map((c) => `<option value="${esc(c.id)}" ${c.id === l.campaign_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div></div>
          <div class="field"><label>Nova anotação</label><textarea class="input" id="lnote" rows="2" maxlength="2000" placeholder="Ligou, mandou proposta, pediu retorno…"></textarea></div>
          <div class="row" style="gap:8px"><button class="btn secondary sm" id="ladd">Adicionar anotação</button><button class="btn secondary sm" id="ltask">Marcar tarefa</button></div></div></div>
        <div><h3 style="margin:0 0 8px">Tarefas</h3>${tasks.length ? tasks.map((t) => `<div class="list-row"><div class="grow"><div class="small ${t.done_at ? 'muted' : ''}">${t.done_at ? '✓ ' : ''}${esc(t.title)}</div><div class="small muted">${date(t.due_on)}${t.owner_name ? ' · ' + esc(t.owner_name) : ''}${t.result ? ' · ' + esc(t.result) : ''}</div></div></div>`).join('') : '<p class="small muted">Nenhuma tarefa.</p>'}</div>
        <div><h3 style="margin:0 0 8px">Histórico</h3>${l.activities.length ? l.activities.map((a) => `<div class="list-row"><div class="grow"><div class="small">${esc(a.text).replace(/\n/g, '<br>')}</div><div class="small muted">${esc(a.by || 'Sistema')} · ${dateTime(a.at)}</div></div></div>`).join('') : '<p class="small muted">Sem registros.</p>'}</div></div>`,
        foot: `${admin ? '<button class="btn secondary" id="ldel" style="margin-right:auto">Excluir</button>' : ''}<button class="btn secondary" id="ledit">Editar dados</button><button class="btn" id="lsave">Salvar e fechar</button>` });
      m.querySelectorAll('[data-close]').forEach((a) => a.addEventListener('click', closeModal));
      m.querySelector('#ledit').onclick = () => { closeModal(); leadForm(l, async () => { await refresh(); openLead(l.id); }); };
      m.querySelector('#ltask').onclick = () => { closeModal(); B.openTask({ lead_id: l.id, title: `Falar com ${l.name}` }, refresh); };
      const del = m.querySelector('#ldel');
      if (del) del.onclick = async () => {
        if ((await confirmAction({ title: 'Excluir lead', text: 'Isso apaga o lead e o histórico dele. Não dá para desfazer.', confirmLabel: 'Excluir', danger: true })) === null) return;
        try { await run(null, () => rpc('bo_crm_delete', { p_id: l.id }), 'Lead excluído'); closeModal(); refresh(); } catch { /* aviso mostrado */ }
      };
      m.querySelector('#ladd').onclick = async (ev) => {
        const t = m.querySelector('#lnote').value.trim(); if (!t) return;
        try { await run(ev.currentTarget, () => rpc('bo_crm_note', { p_id: l.id, p_text: t }), 'Anotação salva'); closeModal(); openLead(l.id); } catch { /* aviso mostrado */ }
      };
      m.querySelector('#lsave').onclick = async (ev) => {
        const to = m.querySelector('#lst').value; let note = '';
        if (to !== l.stage && to === 'perdido') {
          const r = await confirmAction({ title: 'Marcar como perdido', text: 'Conte rapidamente por quê.', confirmLabel: 'Marcar como perdido', note: true, noteLabel: 'Motivo' });
          if (r === null) return; note = r;
        }
        try {
          await run(ev.currentTarget, async () => {
            await rpc('bo_crm_extra', { p_id: l.id, p: { value_monthly: num(m.querySelector('#lval').value) || '', owner_id: m.querySelector('#lown').value, campaign_id: m.querySelector('#lcamp').value } });
            if (to !== l.stage) await rpc('bo_crm_stage', { p_id: l.id, p_stage: to, p_note: note });
          }, 'Lead salvo');
          closeModal(); refresh();
        } catch { /* aviso mostrado */ }
      };
    }

    function leadForm(l, done) {
      const m = modal({ title: l ? 'Editar lead' : 'Novo lead', body: `<form id="lf" class="stack" novalidate>
        <div class="grid-2"><div class="field"><label>Nome da empresa ou pessoa</label><input class="input" name="name" maxlength="160" value="${esc(l ? l.name : '')}"></div>
          <div class="field"><label>Produto</label><select class="input" name="product">${opt(Object.entries(PROD), l ? l.product : 'partners')}</select></div></div>
        <div class="grid-2"><div class="field"><label>Tipo</label><select class="input" name="kind">${opt(KINDS, l && l.kind)}</select></div>
          ${l ? '' : `<div class="field"><label>Etapa</label><select class="input" name="stage">${opt(STAGES.filter((s) => s[0] !== 'perdido'), 'lead')}</select></div>`}</div>
        <div class="grid-2"><div class="field"><label>Pessoa de contato</label><input class="input" name="contact_name" maxlength="120" value="${esc(l ? l.contact_name || '' : '')}"></div>
          <div class="field"><label>Telefone / WhatsApp</label><input class="input" name="phone" maxlength="40" value="${esc(l ? l.phone || '' : '')}"></div></div>
        <div class="grid-2"><div class="field"><label>E-mail</label><input class="input" name="email" type="email" value="${esc(l ? l.email || '' : '')}"></div>
          <div class="field"><label>CNPJ ou CPF</label><input class="input" name="doc" value="${esc(l ? l.doc || '' : '')}"></div></div>
        <div class="field"><label>Como chegou</label><input class="input" name="source" maxlength="80" value="${esc(l ? l.source || '' : '')}" placeholder="Indicação, Instagram, evento…"></div>
        <div class="field"><label>Observações</label><textarea class="input" name="notes" rows="3" maxlength="4000">${esc(l ? l.notes || '' : '')}</textarea></div>
        <div class="error-box" id="le" hidden></div></form>`,
        foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar</button>' });
      m.querySelector('[data-act=cancel]').onclick = closeModal;
      m.querySelector('[data-act=ok]').onclick = async (ev) => {
        const f = m.querySelector('#lf'), err = m.querySelector('#le'); err.hidden = true;
        if (f.name.value.trim().length < 2) { err.hidden = false; err.textContent = 'Informe o nome.'; return; }
        if (f.email.value.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.value.trim())) { err.hidden = false; err.textContent = 'E-mail inválido.'; return; }
        const p = { id: l ? l.id : '', name: f.name.value, product: f.product.value, kind: f.kind.value, contact_name: f.contact_name.value, phone: f.phone.value, email: f.email.value, doc: f.doc.value, source: f.source.value, next_action_at: l ? l.next_action_at || '' : '', notes: f.notes.value };
        if (!l) p.stage = f.stage.value;
        try { const r = await run(ev.currentTarget, () => rpc('bo_crm_save', { p }), 'Lead salvo'); closeModal(); done(r); } catch { /* aviso mostrado */ }
      };
    }
  };
  B.views.crm = B.views.funil;

  /* ----------------------------------------------------------------- tarefas */
  B.openTask = async (pre = {}, done) => {
    const people = await staff();
    const m = modal({ title: pre.id ? 'Editar tarefa' : 'Nova tarefa', body: `<div class="stack">
      <div class="field"><label>O que fazer</label><input class="input" id="t-title" value="${esc(pre.title || '')}" maxlength="200"></div>
      <div class="grid-3"><div class="field"><label>Tipo</label><select class="input" id="t-kind">${opt(TKIND, pre.kind || 'retorno')}</select></div>
        <div class="field"><label>Dia</label><input class="input" type="date" id="t-day" value="${esc(pre.due_on || today())}"></div>
        <div class="field"><label>Hora (opcional)</label><input class="input" type="time" id="t-time" value="${esc(pre.due_time ? String(pre.due_time).slice(0, 5) : '')}"></div></div>
      <div class="field"><label>Responsável</label><select class="input" id="t-own">${people.map((p) => `<option value="${esc(p.user_id)}" ${p.user_id === pre.owner_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <p class="small muted">O responsável recebe um e-mail no dia com as tarefas pendentes.</p><div class="error-box" id="t-err" hidden></div></div>`,
      foot: '<button class="btn secondary" data-close>Cancelar</button><button class="btn" id="t-ok">Salvar</button>' });
    const own = m.querySelector('#t-own'); if (!pre.owner_id && B.me) own.value = B.me.id;
    m.querySelector('[data-close]').onclick = closeModal;
    m.querySelector('#t-ok').onclick = async (e) => {
      const g = (s) => m.querySelector(s).value;
      if (!g('#t-title').trim()) { const er = m.querySelector('#t-err'); er.hidden = false; er.textContent = 'Descreva a tarefa.'; return; }
      try {
        await run(e.target, () => rpc('bo_task_save', { p: { id: pre.id, lead_id: pre.lead_id, customer_kind: pre.customer_kind, customer_id: pre.customer_id, title: g('#t-title'), kind: g('#t-kind'), due_on: g('#t-day'), due_time: g('#t-time'), owner_id: g('#t-own') } }), 'Tarefa salva');
        closeModal(); if (done) done(); else B.reload();
      } catch { /* aviso mostrado */ }
    };
  };

  B.views.tarefas = async (el, [arg], me) => {
    const SC = [['open', 'Pendentes'], ['mine', 'Minhas'], ['done', 'Feitas (30 dias)']];
    let scope = 'open';
    el.innerHTML = `${head('Tarefas', 'O que fazer hoje e nesta semana com cada lead e cliente.', '<button class="btn" id="tnew">Nova tarefa</button>')}
      <div class="u-mb16">${tabs(SC, scope)}</div><div id="tl"></div>`;
    const paint = async () => {
      const list = await rpc('bo_tasks', { p_scope: scope });
      const t0 = today(), wk = B.addDays(t0, 7);
      const groups = scope === 'done' ? [['Feitas', list]] : [
        ['Atrasadas', list.filter((t) => t.due_on < t0)], ['Hoje', list.filter((t) => t.due_on === t0)],
        ['Próximos 7 dias', list.filter((t) => t.due_on > t0 && t.due_on <= wk)], ['Depois', list.filter((t) => t.due_on > wk)]];
      const row = (t) => `<div class="list-row task ${t.due_on < t0 && !t.done_at ? 'late-row' : ''}">
        ${t.done_at ? `<button class="chk on" data-undo="${esc(t.id)}" aria-label="Desfazer">✓</button>` : `<button class="chk" data-done="${esc(t.id)}" aria-label="Concluir"></button>`}
        <div class="grow"><div><b>${esc(t.title)}</b> <span class="tag">${esc((TKIND.find((k) => k[0] === t.kind) || [0, t.kind])[1])}</span></div>
          <div class="small muted">${date(t.due_on)}${t.due_time ? ' · ' + String(t.due_time).slice(0, 5) : ''}${t.owner_name ? ' · ' + esc(t.owner_name) : ''}
          ${t.lead_name ? ` · <a href="#/funil/${esc(t.lead_id)}">${esc(t.lead_name)}</a>` : ''}${t.customer_name ? ` · <a href="#/clientes/${esc(t.customer_kind)}/${esc(t.customer_id)}">${esc(t.customer_name)}</a>` : ''}${t.result ? ' · ' + esc(t.result) : ''}</div></div>
        ${t.done_at ? '' : `<button class="btn ghost sm" data-edit="${esc(t.id)}">Editar</button>`}<button class="btn ghost sm" data-del="${esc(t.id)}" aria-label="Apagar">✕</button></div>`;
      el.querySelector('#tl').innerHTML = list.length ? groups.filter(([, g]) => g.length).map(([n, g]) => `<div class="card dash-row"><h2>${n} <span class="tag">${g.length}</span></h2>${g.map(row).join('')}</div>`).join('') : `<div class="card">${empty(scope === 'done' ? 'Nada feito nos últimos 30 dias.' : 'Nenhuma tarefa pendente. Marque o próximo passo de cada lead.')}</div>`;
      el.querySelectorAll('[data-done]').forEach((b) => (b.onclick = async () => {
        const r = await confirmAction({ title: 'Concluir tarefa', text: 'Quer registrar o que aconteceu? (opcional)', confirmLabel: 'Concluir', note: true, noteLabel: 'Resultado' });
        if (r === null) return;
        run(b, () => rpc('bo_task_done', { p_id: b.dataset.done, p_result: r, p_undo: false }), 'Tarefa concluída').then(() => { paint(); B.refreshCounts && B.refreshCounts(); }).catch(() => {});
      }));
      el.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = () => run(b, () => rpc('bo_task_done', { p_id: b.dataset.undo, p_result: null, p_undo: true })).then(paint).catch(() => {})));
      el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => run(b, () => rpc('bo_task_delete', { p_id: b.dataset.del }), 'Tarefa apagada').then(paint).catch(() => {})));
      el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => B.openTask(list.find((t) => t.id === b.dataset.edit), paint)));
    };
    await paint();
    onTabs(el.querySelector('.u-mb16'), (k) => { scope = k; el.querySelectorAll('.u-mb16 [data-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.tab === k); b.setAttribute('aria-selected', String(b.dataset.tab === k)); }); paint(); });
    el.querySelector('#tnew').onclick = () => B.openTask({}, paint);
    if (arg === 'new') B.openTask({}, paint);
  };
})();
