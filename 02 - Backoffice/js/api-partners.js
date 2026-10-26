/* Lottus · Backoffice — plataformas parceiras (API): chaves, webhook, divisão de receita e uso */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, dateTime, cnpj, toast, run, modal, closeModal, confirmAction } = B;
  const { head, empty, can } = B.ui;

  Object.assign(B.ACTION_LABEL || {}, {
    api_partner_saved: 'alterou uma plataforma da API', api_key_created: 'criou uma chave da API', api_key_revoked: 'revogou uma chave da API',
    api_webhook_secret: 'gerou um segredo de webhook',
  });

  const KIND = { erp: 'ERP / gestão', marketplace: 'Marketplace', contabilidade: 'Contabilidade', outro: 'Outro' };
  const pctTxt = (v) => `${String(v).replace('.', ',')}%`;
  const tiersTxt = (t) => (t || []).map((x) => (x.up_to == null ? `acima: ${pctTxt(x.pct)}` : `até ${brl(x.up_to)}: ${pctTxt(x.pct)}`)).join(' · ');
  const num = (v) => { const s = String(v ?? '').trim(); if (!s) return null; const n = Number(s.replace(/\s|R\$|%/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

  /** Mostra um segredo uma vez só, com botão de copiar */
  function showOnce(title, value, note) {
    const el = modal({
      title,
      body: `<div class="stack"><p style="margin:0">${note}</p>
        <div class="mono" style="padding:12px;background:var(--bg-soft, #f5f2eb);border-radius:10px;word-break:break-all">${esc(value)}</div></div>`,
      foot: '<button class="btn secondary" data-act="copy">Copiar</button><button class="btn" data-act="ok">Já guardei</button>',
    });
    el.querySelector('[data-act=copy]').onclick = () => B.copy(value);
    el.querySelector('[data-act=ok]').onclick = () => { closeModal(); B.reload(); };
  }

  /* ------------------------------------------------------------- formulário */
  function partnerForm(p, onSaved) {
    p = p || { revenue_tiers: [{ up_to: 1000000, pct: 20 }, { up_to: null, pct: 30 }], kind: 'erp', rate_limit: 300 };
    const tierRow = (t, i) => `<div class="row" style="gap:8px" data-tier="${i}">
        <input class="input" name="up_to" placeholder="sem teto" value="${t.up_to == null ? '' : esc(Number(t.up_to).toLocaleString('pt-BR'))}" inputmode="decimal" aria-label="Volume do mês até (R$)">
        <input class="input" name="pct" value="${esc(String(t.pct).replace('.', ','))}" inputmode="decimal" style="max-width:90px" aria-label="Fatia (%)"><span class="small muted">%</span></div>`;
    const el = modal({
      title: p.id ? `Editar ${p.name}` : 'Nova plataforma', wide: true,
      body: `<form id="pf" class="stack" novalidate>
        <div class="grid-3">
          <div class="field"><label>Nome</label><input class="input" name="name" value="${esc(p.name || '')}" required></div>
          <div class="field"><label>Razão social</label><input class="input" name="legal_name" value="${esc(p.legal_name || '')}"></div>
          <div class="field"><label>CNPJ</label><input class="input" name="cnpj" value="${esc(p.cnpj || '')}" inputmode="numeric"></div>
          <div class="field"><label>Tipo</label><select class="input" name="kind">${Object.entries(KIND).map(([k, l]) => `<option value="${k}" ${p.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>E-mail técnico</label><input class="input" name="contact_email" type="email" value="${esc(p.contact_email || '')}"></div>
          <div class="field"><label>Endereço do webhook (https)</label><input class="input" name="webhook_url" value="${esc(p.webhook_url || '')}" placeholder="https://"></div>
          <div class="field"><label>Taxa da Lottus ao fundo (% a.m.)</label><input class="input" name="fee_monthly" inputmode="decimal" placeholder="padrão" value="${p.fee_monthly == null ? '' : esc(String(Math.round(p.fee_monthly * 10000) / 100).replace('.', ','))}"></div>
          <div class="field"><label>Limite de chamadas por minuto</label><input class="input" name="rate_limit" inputmode="numeric" value="${esc(p.rate_limit || 300)}"></div>
          ${p.id ? `<div class="field"><label>Situação</label><select class="input" name="status"><option value="active" ${p.status === 'active' ? 'selected' : ''}>Ativa</option><option value="suspended" ${p.status === 'suspended' ? 'selected' : ''}>Suspensa</option></select></div>` : ''}
        </div>
        <div><h3 class="section-title">Divisão de receita</h3>
          <p class="small muted" style="margin:0 0 8px">Fatia da receita da Lottus (taxa ao fundo) que vai para a plataforma, pela faixa de volume pago no mês. Deixe o teto vazio na última faixa.</p>
          <div class="stack-sm" id="tiers">${p.revenue_tiers.map(tierRow).join('')}</div>
          <button class="btn ghost sm" type="button" id="add-tier" style="margin-top:6px">+ Faixa</button></div>
        <div class="field"><label>Anotações</label><textarea class="input" name="notes">${esc(p.notes || '')}</textarea></div>
        <div class="error-box" id="pf-err" hidden></div>
      </form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar</button>',
    });
    el.querySelector('#add-tier').onclick = () => {
      const box = el.querySelector('#tiers');
      box.insertAdjacentHTML('beforeend', tierRow({ up_to: null, pct: 30 }, box.children.length));
    };
    el.querySelector('[data-act=cancel]').onclick = closeModal;
    el.querySelector('[data-act=ok]').onclick = async (ev) => {
      const f = el.querySelector('#pf');
      const tiers = [...f.querySelectorAll('[data-tier]')].map((r) => ({ up_to: num(r.querySelector('[name=up_to]').value), pct: num(r.querySelector('[name=pct]').value) }))
        .filter((t) => t.pct != null).sort((a, b) => (a.up_to ?? Infinity) - (b.up_to ?? Infinity));
      const fee = num(f.elements.fee_monthly.value);
      const body = {
        id: p.id || null, name: f.elements.name.value, legal_name: f.elements.legal_name.value, cnpj: f.elements.cnpj.value, kind: f.elements.kind.value,
        contact_email: f.elements.contact_email.value, webhook_url: f.elements.webhook_url.value.trim(), fee_monthly: fee == null ? null : fee / 100,
        rate_limit: num(f.elements.rate_limit.value), notes: f.elements.notes.value, revenue_tiers: tiers,
        status: f.elements.status ? f.elements.status.value : undefined,
      };
      const id = await run(ev.currentTarget, () => rpc('bo_save_api_partner', { p: body }), 'Plataforma salva');
      if (id) { closeModal(); onSaved(id); }
    };
  }

  /* ------------------------------------------------------------------ lista */
  B.views.plataformas = async (el, [id], me) => {
    if (id) return detail(el, id, me);
    const d = await rpc('bo_api_partners');
    const admin = can(me, 'admin');
    el.innerHTML = `
      ${head('Plataformas (API)', `Sistemas que oferecem a antecipação da Lottus dentro do produto deles · ambiente: ${d.env === 'sandbox' ? 'sandbox (chaves lt_test_)' : 'produção (chaves lt_live_)'}`,
        admin ? '<button class="btn" id="new">Nova plataforma</button>' : '')}
      <div class="card flush"><div class="table-wrap">${d.partners.length ? `<table>
        <thead><tr><th>Plataforma</th><th class="num">Cedentes</th><th class="num">Chamadas 24 h</th><th class="num">Volume no mês</th><th class="num">Receita Lottus</th><th class="num">Fatia da plataforma</th></tr></thead>
        <tbody>${d.partners.map((p) => `<tr class="link" data-id="${esc(p.id)}">
          <td><b>${esc(p.name)}</b> ${p.status === 'suspended' ? '<span class="tag danger">Suspensa</span>' : ''}<div class="small muted">${esc(KIND[p.kind] || p.kind)} · ${esc(p.keys)} chave(s)</div></td>
          <td class="num">${esc(p.companies)}</td>
          <td class="num">${esc(p.requests_24h)}${Number(p.errors_24h) ? ` <span class="small" style="color:var(--danger)">${esc(p.errors_24h)} erros</span>` : ''}</td>
          <td class="num">${brl(p.month.volume)}</td><td class="num">${brl(p.month.lottus_revenue)}</td>
          <td class="num"><b>${brl(p.month.partner_share)}</b><div class="small muted">${pctTxt(p.month.share_pct)}</div></td></tr>`).join('')}</tbody></table>`
        : empty('Nenhuma plataforma ainda.')}</div></div>
      <p class="small muted" style="margin-top:12px">A documentação para os desenvolvedores das plataformas fica em lottusfinance.com.br/desenvolvedores.html.</p>`;
    const nb = el.querySelector('#new');
    if (nb) nb.onclick = () => partnerForm(null, (nid) => (location.hash = `#/plataformas/${nid}`));
    el.querySelectorAll('[data-id]').forEach((r) => (r.onclick = () => (location.hash = `#/plataformas/${r.dataset.id}`)));
  };

  /* ---------------------------------------------------------------- detalhe */
  async function detail(el, id, me) {
    const d = await rpc('bo_api_partner', { p_id: id });
    const p = d.partner, admin = can(me, 'admin');
    const active = d.keys.filter((k) => !k.revoked_at);
    const r0 = d.reports[0] || {};
    el.innerHTML = `
      <div class="page-head"><div><a class="back" href="#/plataformas">‹ Plataformas</a>
        <h1>${esc(p.name)} ${p.status === 'suspended' ? '<span class="tag danger">Suspensa</span>' : '<span class="tag success">Ativa</span>'}</h1>
        <div class="page-sub">${esc(KIND[p.kind] || p.kind)}${p.cnpj ? ' · ' + esc(cnpj(p.cnpj)) : ''}${p.contact_email ? ' · ' + esc(p.contact_email) : ''}</div></div>
        ${admin ? '<button class="btn secondary" id="edit">Editar</button>' : ''}</div>

      <div class="kpis">
        <div class="kpi"><span class="kpi-label">Cedentes</span><span class="kpi-value">${esc(d.companies.length)}</span></div>
        <div class="kpi"><span class="kpi-label">Volume pago no mês</span><span class="kpi-value">${brl(r0.volume)}</span><span class="small muted">${esc(r0.operations || 0)} operações</span></div>
        <div class="kpi"><span class="kpi-label">Receita Lottus no mês</span><span class="kpi-value">${brl(r0.lottus_revenue)}</span><span class="small muted">taxa ${pctTxt(Math.round((r0.fee_monthly || 0) * 10000) / 100)} a.m. ao fundo</span></div>
        <div class="kpi"><span class="kpi-label">Fatia da plataforma</span><span class="kpi-value">${brl(r0.partner_share)}</span><span class="small muted">${pctTxt(r0.share_pct || 0)} · ${esc(tiersTxt(p.revenue_tiers))}</span></div>
      </div>

      <div class="grid-2" style="margin-top:16px">
        <div class="card"><div class="card-head"><h2>Chaves da API</h2>
            ${admin ? '<div class="row" style="gap:6px"><button class="btn secondary sm" data-newkey="live">Chave de produção</button><button class="btn ghost sm" data-newkey="test">Chave de teste</button></div>' : ''}</div>
          ${d.keys.length ? `<div class="list">${d.keys.map((k) => `<div class="list-row"><div class="grow"><b>lt_${esc(k.env)}_…${esc(k.last4)}</b> ${k.name ? `<span class="small muted">${esc(k.name)}</span>` : ''}
              <div class="small muted">criada ${date(k.created_at)}${k.last_used_at ? ` · usada ${dateTime(k.last_used_at)}` : ' · nunca usada'}${k.revoked_at ? ` · revogada ${date(k.revoked_at)}` : ''}</div></div>
              ${k.revoked_at ? '<span class="tag">Revogada</span>' : admin ? `<button class="btn ghost sm" data-revoke="${esc(k.id)}">Revogar</button>` : ''}</div>`).join('')}</div>`
            : '<p class="muted">Nenhuma chave ainda.</p>'}
          <p class="small muted" style="margin:10px 0 0">A chave aparece uma vez só. Chave de teste (lt_test_) só funciona no projeto de sandbox.</p></div>

        <div class="card"><div class="card-head"><h2>Webhook</h2>${admin ? '<button class="btn secondary sm" id="secret">Gerar segredo</button>' : ''}</div>
          <dl class="kv"><dt>Endereço</dt><dd>${p.webhook_url ? esc(p.webhook_url) : '<span class="muted">não cadastrado</span>'}</dd>
            <dt>Segredo</dt><dd>${p.has_secret ? 'cadastrado' : '<span style="color:var(--danger)">falta gerar</span>'}</dd>
            <dt>Avisos</dt><dd>${esc(d.events.pending)} na fila${Number(d.events.failed) ? ` · <span style="color:var(--danger)">${esc(d.events.failed)} desistidos</span>` : ''}
              ${admin && (Number(d.events.pending) || Number(d.events.failed)) ? ' · <a href="#" id="retry">reenviar</a>' : ''}</dd></dl>
          ${d.events.recent.length ? `<details style="margin-top:8px"><summary class="small">Últimos avisos</summary><div class="list" style="margin-top:6px">${d.events.recent.map((e) => `<div class="list-row"><div class="grow small"><b>${esc(e.type)}</b> · ${dateTime(e.created_at)}${e.last_error ? ` · <span style="color:var(--danger)">${esc(e.last_error)}</span>` : ''}</div>
              <span class="tag ${e.delivered_at ? 'success' : ''}">${e.delivered_at ? 'entregue' : `${esc(e.attempts)} tentativa(s)`}</span></div>`).join('')}</div></details>` : ''}</div>
      </div>

      <div class="card flush" style="margin-top:16px"><div class="card-pad-head"><h2>Divisão de receita (6 meses)</h2><span class="small muted">operações pagas no mês · taxa ao fundo pelos dias de cada duplicata</span></div>
        <div class="table-wrap"><table><thead><tr><th>Mês</th><th class="num">Operações</th><th class="num">Volume</th><th class="num">Receita Lottus</th><th class="num">Fatia</th><th class="num">A pagar à plataforma</th></tr></thead>
        <tbody>${d.reports.map((r) => `<tr><td>${esc(r.month)}</td><td class="num">${esc(r.operations)}</td><td class="num">${brl(r.volume)}</td><td class="num">${brl(r.lottus_revenue)}</td>
          <td class="num">${pctTxt(r.share_pct)}</td><td class="num"><b>${brl(r.partner_share)}</b></td></tr>`).join('')}</tbody></table></div></div>

      <div class="card flush" style="margin-top:16px"><div class="card-pad-head"><h2>Cedentes</h2><span class="small muted">${esc(d.companies.length)}</span></div>
        <div class="table-wrap">${d.companies.length ? `<table><thead><tr><th>Empresa</th><th>Código na plataforma</th><th>Crédito</th><th class="num">Operações</th><th>Desde</th></tr></thead>
          <tbody>${d.companies.map((c) => `<tr><td><a href="#/empresas/${esc(c.id)}">${esc(c.legal_name)}</a><div class="small muted">${esc(cnpj(c.cnpj))}</div></td>
            <td>${esc(c.external_id || '—')}</td><td>${c.credit ? B.tag('credit', c.credit) : '—'}</td><td class="num">${esc(c.operations)}</td><td>${date(c.created_at)}</td></tr>`).join('')}</tbody></table>`
          : empty('Nenhum cedente trazido por esta plataforma ainda.')}</div></div>

      <div class="card flush" style="margin-top:16px"><div class="card-pad-head"><h2>Chamadas recentes</h2></div>
        <div class="table-wrap">${d.requests.length ? `<table><thead><tr><th>Quando</th><th>Chamada</th><th class="num">Resposta</th><th class="num">Tempo</th><th>Erro</th></tr></thead>
          <tbody>${d.requests.map((r) => `<tr><td class="nowrap">${dateTime(r.created_at)}</td><td class="mono small">${esc(r.method)} ${esc(r.path)}</td>
            <td class="num"><span class="tag ${r.status >= 500 ? 'danger' : r.status >= 400 ? 'warning' : 'success'}">${esc(r.status)}</span></td>
            <td class="num small">${esc(r.ms)} ms</td><td class="small muted">${esc(r.error || '')}</td></tr>`).join('')}</tbody></table>` : empty('Nenhuma chamada ainda.')}</div></div>`;

    const eb = el.querySelector('#edit');
    if (eb) eb.onclick = () => partnerForm(p, () => B.reload());
    el.querySelectorAll('[data-newkey]').forEach((b) => (b.onclick = async () => {
      const env = b.dataset.newkey;
      const r = await confirmAction({ title: env === 'live' ? 'Nova chave de produção' : 'Nova chave de teste', text: 'Dê um nome para lembrar onde a chave será usada.',
        note: true, noteLabel: 'Nome', notePlaceholder: 'ex.: servidor de produção', confirmLabel: 'Criar chave' });
      if (r == null) return;
      const k = await run(null, () => rpc('bo_api_create_key', { p_partner: id, p_env: env, p_name: r }));
      if (k) showOnce('Chave criada', k.key, 'Copie e envie à plataforma por um canal seguro. <b>Ela não aparece de novo</b>: se perder, revogue e crie outra.');
    }));
    el.querySelectorAll('[data-revoke]').forEach((b) => (b.onclick = async () => {
      const ok = await confirmAction({ title: 'Revogar chave', text: 'A plataforma perde o acesso com esta chave na hora.', confirmLabel: 'Revogar', danger: true });
      if (ok == null) return;
      run(null, () => rpc('bo_api_revoke_key', { p_id: b.dataset.revoke }), 'Chave revogada').then(B.reload);
    }));
    const sb = el.querySelector('#secret');
    if (sb) sb.onclick = async () => {
      const ok = await confirmAction({ title: 'Gerar segredo do webhook', text: p.has_secret ? 'O segredo atual deixa de valer: a plataforma precisa trocar para o novo.' : 'A plataforma usa o segredo para conferir a assinatura dos avisos.', confirmLabel: 'Gerar' });
      if (ok == null) return;
      const s = await run(null, () => rpc('bo_api_webhook_secret', { p_partner: id }));
      if (s) showOnce('Segredo do webhook', s, 'Envie à plataforma por um canal seguro. <b>Ele não aparece de novo.</b>');
    };
    const rt = el.querySelector('#retry');
    if (rt) rt.onclick = (ev) => { ev.preventDefault(); run(null, () => rpc('bo_api_retry_events', { p_partner: id }), 'Avisos voltaram para a fila').then(B.reload); };
  }
})();
