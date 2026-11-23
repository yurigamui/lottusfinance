/* Lottus · Backoffice — notificação de cessão aos sacados */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, dateTime, cnpj, run, toast, modal } = B;

  Object.assign(B.ACTION_LABEL || {}, { debtor_notice_sent: 'enviou a notificação de cessão ao sacado' });

  const STATE = {
    acknowledged: ['Ciente', 'success'], opened: ['Aberta', 'brand'], delivered: ['Entregue', 'brand'], sent: ['Enviada', ''],
    pending: ['Aguardando envio', 'warning'], no_email: ['Sem e-mail', 'danger'], bounced: ['E-mail devolvido', 'danger'],
    complaint: ['Marcada como spam', 'danger'], failed: ['Erro no envio', 'danger'], not_configured: ['E-mail desligado', 'warning'],
  };
  const stateTag = (s) => { const [l, t] = STATE[s] || [s, '']; return `<span class="tag ${t}">${esc(l)}</span>`; };
  B.noticeTag = stateTag;
  const needsEmail = (n) => ['no_email', 'bounced', 'complaint', 'failed'].includes(n.state);

  function timeline(n) {
    const parts = [];
    if (n.sent_at) parts.push(`enviada ${dateTime(n.sent_at)}`);
    if (n.delivered_at) parts.push(`entregue ${dateTime(n.delivered_at)}`);
    if (n.reminder_at) parts.push(`lembrete ${dateTime(n.reminder_at)}`);
    if (n.acknowledged_at) parts.push(`ciente ${dateTime(n.acknowledged_at)}${n.ack_name ? ' por ' + esc(n.ack_name) : ''}${n.ack_ip ? ' · IP ' + esc(n.ack_ip) : ''}`);
    return parts.join(' · ');
  }

  /** Enviar/reenviar, pedindo o e-mail quando não há ou voltou */
  async function send(opId, debtor, current, askEmail) {
    if (!askEmail) return run(null, () => rpc('bo_send_debtor_notice', { p_operation: opId, p_debtor: debtor.debtor_cnpj }), 'Notificação enviada').then((x) => x && B.reload());
    const box = modal({
      title: 'E-mail do financeiro do sacado',
      subtitle: `${esc(debtor.debtor_name || cnpj(debtor.debtor_cnpj))} · ${esc(cnpj(debtor.debtor_cnpj))}`,
      body: `<form class="stack" id="nf" novalidate><div class="field"><label for="ne">E-mail</label>
        <input class="input" id="ne" type="email" value="${esc(current || '')}" placeholder="financeiro@empresa.com.br" autocomplete="off"></div>
        <p class="small muted">Fica salvo como contato de cobrança deste sacado para o cedente.</p></form>`,
      foot: '<button class="btn secondary" data-close-btn>Cancelar</button><button class="btn" id="ns">Enviar notificação</button>',
    });
    box.querySelector('[data-close-btn]').onclick = () => B.closeModal();
    const go = () => {
      const email = box.querySelector('#ne').value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Confira o e-mail.', true);
      run(box.querySelector('#ns'), () => rpc('bo_send_debtor_notice', { p_operation: opId, p_debtor: debtor.debtor_cnpj, p_email: email }), 'Notificação enviada')
        .then((x) => { if (x) { B.closeModal(); B.reload(); } });
    };
    box.querySelector('#ns').onclick = go;
    box.querySelector('#nf').onsubmit = (e) => { e.preventDefault(); go(); };
    setTimeout(() => box.querySelector('#ne').focus(), 50);
  }

  /** Mostra o e-mail exatamente como o sacado recebeu */
  B.showNotice = async (id) => {
    const d = await rpc('bo_debtor_notice', { p_id: id }).catch((e) => { toast(B.message(e), true); return null; });
    if (!d) return;
    const box = modal({
      title: 'Notificação de cessão', wide: true,
      subtitle: `${esc(d.debtor_name || cnpj(d.debtor_cnpj))} · ${esc(d.email || 'sem e-mail')}`,
      body: `<div class="stack">
        <div class="row" style="gap:8px;justify-content:flex-start">${stateTag(d.state)}<span class="small muted">${timeline(d)}</span></div>
        <iframe class="notice-frame" sandbox="" title="E-mail enviado ao sacado"></iframe>
        <dl class="kv"><dt>Hash do documento</dt><dd class="mono">${esc(d.document_hash)}</dd>
          <dt>Modelo</dt><dd>versão ${esc(d.template_version || '—')}</dd>
          ${d.ack_user_agent ? `<dt>Aparelho da ciência</dt><dd class="small">${esc(d.ack_user_agent)}</dd>` : ''}</dl></div>`,
      foot: '<button class="btn" data-close-btn>Fechar</button>',
    });
    box.querySelector('.notice-frame').srcdoc = d.html;
    box.querySelector('[data-close-btn]').onclick = () => B.closeModal();
  };

  /** Card na tela da operação */
  B.noticesCard = async (host, opId) => {
    if (!host) return;
    const d = await rpc('bo_operation_notices', { p_id: opId }).catch(() => null);
    if (!d || (!['paid', 'settled'].includes(d.status) && !d.notices.length)) { host.remove(); return; }
    const rows = d.notices.concat(d.waiting.map((w) => ({ ...w, state: 'pending', waiting: true })));
    const ok = rows.filter((n) => n.state === 'acknowledged').length;
    host.innerHTML = `<div class="card-head"><h2>Notificação aos sacados</h2>
        <span class="tag ${ok === rows.length ? 'success' : ''}">${ok}/${rows.length} cientes</span></div>
      <div class="list">${rows.map((n, i) => `<div class="list-row">
        <div class="grow"><b>${esc(n.debtor_name || cnpj(n.debtor_cnpj))}</b> ${stateTag(n.state)}
          <div class="small muted">${esc(cnpj(n.debtor_cnpj))}${n.email ? ' · ' + esc(n.email) : ''}${n.total ? ' · ' + brl(n.total) : ''}</div>
          ${timeline(n) ? `<div class="small muted">${timeline(n)}</div>` : ''}
          ${n.email_error ? `<div class="small" style="color:var(--danger)">${esc(n.email_error)}</div>` : ''}</div>
        <div class="row" style="gap:6px">
          ${n.id ? `<button class="btn ghost sm" data-nview="${i}">Ver</button>` : ''}
          ${n.state !== 'acknowledged' && ['paid', 'settled'].includes(d.status) ? `<button class="btn ${needsEmail(n) ? '' : 'secondary '}sm" data-nsend="${i}">${needsEmail(n) ? 'Informar e-mail' : n.sent_at ? 'Reenviar' : 'Enviar'}</button>` : ''}
        </div></div>`).join('')}</div>`;
    host.querySelectorAll('[data-nview]').forEach((b) => (b.onclick = () => B.showNotice(rows[b.dataset.nview].id)));
    host.querySelectorAll('[data-nsend]').forEach((b) => (b.onclick = () => { const n = rows[b.dataset.nsend]; send(opId, n, n.email, needsEmail(n) || !n.email); }));
  };

  /** Seção no Jurídico */
  B.noticesSection = async (host) => {
    if (!host) return;
    const paint = async (filter) => {
      const list = await rpc('bo_debtor_notices', { p_filter: filter }).catch(() => []);
      host.querySelector('#nlist').innerHTML = list.length === 0 ? `<div class="empty">${filter === 'problems' ? 'Nenhuma notificação com pendência.' : 'Nada por aqui.'}</div>` : `<table>
        <thead><tr><th>Sacado</th><th>Cedente</th><th>Situação</th><th class="num">Valor</th><th></th></tr></thead>
        <tbody>${list.map((n) => `<tr>
          <td><b>${esc(n.debtor_name || cnpj(n.debtor_cnpj))}</b><div class="small muted">${esc(n.email || 'sem e-mail')}</div></td>
          <td>${esc(n.company)}<div class="small muted">${timeline(n) || '—'}</div></td>
          <td>${stateTag(n.state)}</td><td class="num">${brl(n.total)}</td>
          <td class="num"><div class="row" style="justify-content:flex-end"><a class="btn ghost sm" href="#/operacoes/${esc(n.operation_id)}">Operação</a>
            <button class="btn secondary sm" data-nv="${esc(n.id)}">Ver</button></div></td></tr>`).join('')}</tbody></table>`;
      host.querySelectorAll('[data-nv]').forEach((b) => (b.onclick = () => B.showNotice(b.dataset.nv)));
    };
    host.innerHTML = `<div class="card-pad-head" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h2>Notificações de cessão</h2>
        <select class="input" id="nfilter" style="max-width:220px"><option value="problems">Com pendência</option><option value="acknowledged">Cientes</option><option value="all">Todas</option></select></div>
      <div class="table-wrap" id="nlist"><div class="spinner"></div></div>`;
    host.querySelector('#nfilter').onchange = (e) => paint(e.target.value);
    paint('problems');
  };
})();
