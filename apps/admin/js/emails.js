/* Lottus · Backoffice — envio de e-mails (Controle → E-mails) */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, dateTime, run, toast } = B;
  const { head, empty } = B.ui;

  Object.assign(B.ACTION_LABEL || {}, { email_settings_saved: 'atualizou os remetentes de e-mail' });

  const KIND = {
    convite_parceiro: 'Convite · fundo', convite_equipe: 'Convite · equipe', acesso: 'Link de acesso', nova_senha: 'Nova senha',
    assinatura: 'Confirmação de assinatura', teste: 'Teste', app: 'Código do app', notificacao_cessao: 'Notificação de cessão',
  };
  const STATUS = {
    queued: ['Na fila', ''], sent: ['Enviado', 'brand'], delivered: ['Entregue', 'success'], opened: ['Aberto', 'success'],
    bounced: ['Devolvido', 'danger'], complaint: ['Marcado como spam', 'danger'], failed: ['Erro', 'danger'], not_configured: ['Envio desligado', 'warning'],
  };
  const stTag = (s) => { const [l, t] = STATUS[s] || [s, '']; return `<span class="tag ${t}">${esc(l)}</span>`; };
  B.emailTag = stTag;

  /** Convite que não saiu por e-mail: mostra o link para enviar por outro canal. */
  B.showAccessLink = (link, email, error) => {
    const off = !error || error === 'not_configured';
    const box = B.modal({ title: 'Envie o link manualmente',
      subtitle: off ? 'O envio automático de e-mails está desligado.' : `O Postmark não aceitou o e-mail: ${esc(error)}`,
      body: `<p>Mande este link para <b>${esc(email)}</b> por um canal seguro. Ele vale por 7 dias.</p>
        <div class="copy-row"><code>${esc(link)}</code><button class="btn secondary sm" type="button" id="cl">Copiar</button></div>
        <p class="small muted">${off ? 'Para os convites saírem sozinhos, cadastre o token do Postmark (veja Controle → E-mails).' : 'Confira o remetente e o domínio em Controle → E-mails.'}</p>`,
      foot: '<button class="btn" data-close-btn>Pronto</button>' });
    box.querySelector('#cl').onclick = () => B.copy(link);
    box.querySelector('[data-close-btn]').onclick = () => { B.closeModal(); B.reload(); };
  };

  B.views.emails = async (el, _p, me) => {
    const [d, pv] = await Promise.all([rpc('bo_emails', { p_limit: 80 }), rpc('bo_debtor_notice_preview').catch(() => null)]);
    const admin = B.ui.can(me, 'admin');
    const hook = `${window.LOTTUS_CONFIG.supabaseUrl}/functions/v1/email-events?token=${d.webhook_token || ''}`;
    const st = d.stats || {};
    el.innerHTML = `
      ${head('E-mails', 'Convites, novas senhas e confirmações de assinatura')}
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><h2>${d.configured ? 'Envio ligado' : 'Envio desligado'}</h2>
            <div class="muted small">${d.configured
              ? 'Os e-mails saem sozinhos pelo Postmark. Nos últimos 7 dias:'
              : 'Falta cadastrar o token do Postmark no Vault do Supabase com o nome <b>postmark_server_token</b>. Enquanto isso, os convites mostram o link para você enviar por outro canal.'}</div></div>
            ${d.configured ? '<span class="tag success">Postmark</span>' : '<span class="tag warning">Sem token</span>'}</div>
          ${d.configured ? `<div class="stat-row" style="margin-top:12px">
            <div><div class="kpi-label">Enviados</div><div class="kpi-value">${esc(st.sent_7d ?? 0)}</div></div>
            <div><div class="kpi-label">Com problema</div><div class="kpi-value" ${st.failed_7d ? 'style="color:var(--danger)"' : ''}>${esc(st.failed_7d ?? 0)}</div></div>
          </div>` : ''}
          <div class="row" style="margin-top:14px"><button class="btn secondary" id="test" ${d.configured ? '' : 'disabled'}>Enviar e-mail de teste para mim</button></div>
        </div>

        <div class="card"><h2>Remetentes</h2>
          <p class="muted small">Os endereços precisam ser do domínio verificado no Postmark (lottusfinance.com.br).</p>
          <form class="stack" id="f" style="margin-top:12px">
            <div class="grid-3">
              <div class="field"><label>Convites e senhas</label><input class="input" name="from" type="email" value="${esc(d.from || '')}" required></div>
              <div class="field"><label>Confirmações de assinatura</label><input class="input" name="signature_from" type="email" value="${esc(d.signature_from || '')}" required></div>
              <div class="field"><label>Respostas vão para</label><input class="input" name="reply_to" type="email" value="${esc(d.reply_to || '')}" required></div>
            </div>
            <div class="row" style="justify-content:flex-end"><button class="btn" type="submit">Salvar</button></div>
          </form>
        </div>

        <div class="card"><div class="card-head"><div><h2>Notificação de cessão aos sacados</h2>
            <div class="small muted">Sai sozinha quando a operação é paga, com lembrete depois de 3 dias sem ciência.</div></div>
            ${pv ? '<button class="btn secondary sm" id="npv">Ver exemplo</button>' : ''}</div>
          <label class="switch-row" style="margin-top:8px"><input type="checkbox" id="nmkt" ${!pv || pv.marketing ? 'checked' : ''} ${admin ? '' : 'disabled'}><span class="switch" aria-hidden="true"></span>
            <span><b>Apresentação da Lottus no fim do e-mail</b><small>"Sua empresa também vende a prazo? Saiba como funciona", com link para o site.</small></span></label>
        </div>

        <div class="card"><h2>Situação da entrega</h2>
          <p class="muted small">Para saber se cada e-mail chegou, cadastre esta URL no Postmark (seu servidor → Webhooks) marcando <b>Delivery</b>, <b>Bounce</b> e <b>Spam complaint</b>.</p>
          <div class="copy-row" style="margin-top:10px"><span>URL</span><code>${esc(hook)}</code><button class="btn ghost sm" type="button" data-copy="${esc(hook)}">Copiar</button></div>
        </div>

        <div><h2 class="section-title">Últimos envios</h2>
          <div class="card flush"><div class="table-wrap">${d.items.length ? `<table>
            <thead><tr><th>Quando</th><th>Para</th><th>Tipo</th><th>Situação</th></tr></thead>
            <tbody>${d.items.map((m) => `<tr>
              <td class="nowrap">${dateTime(m.created_at)}</td>
              <td>${esc(m.recipient)}${m.subject ? `<div class="small muted">${esc(m.subject)}</div>` : ''}</td>
              <td>${esc(KIND[m.kind] || m.kind)}</td>
              <td>${stTag(m.status)}${m.error ? `<div class="small" style="color:var(--danger)">${esc(m.error)}</div>` : ''}</td>
            </tr>`).join('')}</tbody></table>` : empty('Nenhum e-mail enviado ainda.')}</div></div>
        </div>
      </div>`;

    el.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => B.copy(b.dataset.copy)));
    const nm = el.querySelector('#nmkt');
    if (nm) nm.onchange = () => run(null, () => rpc('bo_set_notice_marketing', { p_on: nm.checked }), nm.checked ? 'Apresentação ligada' : 'Apresentação desligada');
    const npv = el.querySelector('#npv');
    if (npv) npv.onclick = async () => {
      const x = await rpc('bo_debtor_notice_preview').catch(() => pv);
      const box = B.modal({ title: 'Exemplo da notificação', wide: true, subtitle: 'Com os dados da operação mais recente',
        body: '<iframe class="notice-frame" sandbox="" title="Exemplo"></iframe>', foot: '<button class="btn" data-close-btn>Fechar</button>' });
      box.querySelector('.notice-frame').srcdoc = x.html;
      box.querySelector('[data-close-btn]').onclick = () => B.closeModal();
    };
    const f = el.querySelector('#f');
    f.onsubmit = (e) => {
      e.preventDefault();
      run(f.querySelector('[type=submit]'), () => rpc('bo_save_email_settings', { p: { from: f.from.value, reply_to: f.reply_to.value, signature_from: f.signature_from.value } }), 'Remetentes salvos');
    };
    el.querySelector('#test').onclick = async (e) => {
      const btn = e.currentTarget; btn.disabled = true; btn.classList.add('loading');
      const { data, error } = await B.sb.functions.invoke('backoffice-access', { body: { action: 'test' } });
      btn.disabled = false; btn.classList.remove('loading');
      if (error || !data || !data.sent) toast(`Não foi enviado: ${(data && data.error) || 'tente de novo'}`, 'error');
      else toast(`Enviado para ${data.to}. Confira a caixa de entrada.`);
      B.reload();
    };
  };
})();
