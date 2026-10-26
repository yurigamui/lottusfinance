/* Lottus · Backoffice — verificações automáticas: sanções da CGU, Receita, PEP e notas na SEFAZ */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, date, dateTime, cnpj, toast, confirmAction } = B;

  Object.assign(B.ACTION_LABEL || {}, {
    verify_alert_resolved: 'resolveu um alerta de verificação', verify_settings_saved: 'alterou as verificações automáticas',
  });

  const KIND = {
    sanction_cedente: 'Sanção · cedente', sanction_sacado: 'Sanção · sacado', receita_cedente: 'Receita · cedente', pep: 'Sócio PEP',
    nfe_cancelled: 'Nota cancelada', nfe_disputed: 'Nota não reconhecida', nfe_not_found: 'Nota não encontrada',
  };
  const SRC = { cgu: 'Sanções da CGU', receita: 'Receita Federal', pep: 'Sócios PEP' };
  const ST = { clear: ['Nada consta', 'success'], hit: ['Bloqueia', 'danger'], alert: ['Atenção', 'warning'], error: ['Não consultou', ''] };
  const stTag = (s) => `<span class="tag ${(ST[s] || ['', ''])[1]}">${esc((ST[s] || [s])[0])}</span>`;

  /** Chama a função "verify" e devolve os dados (ou mostra o erro) */
  async function call(body) {
    const { data, error } = await B.sb.functions.invoke('verify', { body });
    if (error) {
      let code = 'unavailable', detail = '';
      try { const j = await error.context.json(); code = j.error || code; detail = j.detail || ''; } catch { /* sem corpo */ }
      toast(detail && code === 'not_configured' ? detail : B.message(code) + (detail && code !== 'not_configured' ? `: ${detail}` : ''), true);
      return null;
    }
    return data;
  }
  B.verifyCall = call;
  const busy = async (btn, fn) => {
    const t = btn.textContent; btn.disabled = true; btn.textContent = 'Consultando…';
    try { return await fn(); } finally { btn.disabled = false; btn.textContent = t; }
  };

  /* ---------------------------------------------- notas da operação (SEFAZ) */
  const nfeState = (n) => {
    if (n.kind && n.kind !== 'nfe') return '<span class="tag">NFS-e · sem consulta</span>';
    if (!n.checked_at) return '<span class="tag">Não consultada</span>';
    if (n.cancelled || n.status === 'cancelled') return '<span class="tag danger">Cancelada</span>';
    if (n.status === 'denied') return '<span class="tag danger">Denegada</span>';
    if (n.disputed) return '<span class="tag danger">Cliente não reconhece</span>';
    if (n.status === 'not_found') return '<span class="tag warning">Não encontrada</span>';
    if (n.status === 'error' || n.status === 'unknown') return '<span class="tag">Sem resposta</span>';
    return `<span class="tag success">Autorizada</span>${n.confirmed ? ' <span class="tag success">Cliente confirmou</span>' : n.acknowledged ? ' <span class="tag">Cliente deu ciência</span>' : ''}${n.cce_count ? ` <span class="tag">${n.cce_count} carta(s) de correção</span>` : ''}`;
  };
  B.nfeRows = (list) => list.map((n) => `<div class="list-row"><div class="grow"><b>NF ${esc(n.number || '—')}</b> <span class="small muted">· ${esc(n.recipient || '')}</span>
      <div class="small muted">${n.checked_at ? `conferida ${dateTime(n.checked_at)}` : 'ainda não conferida'}${n.error ? ` · ${esc(n.error)}` : ''}</div></div>
      <div style="text-align:right">${nfeState(n)}</div></div>`).join('');

  B.nfeCard = async (host, opId, opStatus) => {
    if (!host) return;
    const paint = (d) => {
      const list = d.invoices || [], bad = d.blocking || [];
      host.innerHTML = `<div class="card-head"><div><h2>Notas na SEFAZ</h2><div class="small muted">Cancelamento e manifestação do cliente (desconhecimento, operação não realizada, confirmação)</div></div>
          <button class="btn secondary sm" id="nfe-now">Conferir agora</button></div>
        ${bad.length ? `<div class="note-box" style="border-color:var(--danger);margin-bottom:10px"><b>${['paid', 'settled'].includes(opStatus) ? 'Operação já paga com nota com problema — cobrar a recompra do cedente:' : 'Pagamento ao cedente travado:'}</b> ${bad.map((b) => `NF ${esc(b.number || '—')} ${esc(b.problem)}`).join('; ')}</div>` : ''}
        ${list.length ? `<div class="list">${B.nfeRows(list)}</div>` : '<p class="muted">Sem notas nesta operação.</p>'}`;
      host.querySelector('#nfe-now').onclick = (e) => busy(e.currentTarget, async () => {
        const r = await call({ action: 'operation', operation_id: opId });
        if (!r) return;
        if (!r.checked) toast('A consulta de notas não está configurada (chave da NFE.io no Vault).', true);
        else toast(r.blocking.length ? 'Há nota com problema: o pagamento fica travado' : 'Notas conferidas', r.blocking.length > 0);
        paint(r.nfe || d);
      });
    };
    host.innerHTML = '<div class="spinner"></div>';
    try { paint(await rpc('bo_operation_nfe', { p_op: opId })); } catch { host.innerHTML = '<p class="muted">Verificação de notas indisponível (rode a migração 20261024000000).</p>'; }
  };

  /* ------------------------------------------------ cedente (motor de crédito) */
  B.companyVerifyCard = async (host, companyId) => {
    if (!host) return;
    const paint = (d) => {
      const by = Object.fromEntries((d.screenings || []).map((s) => [s.source, s]));
      const row = (src) => {
        const s = by[src];
        return `<div class="list-row"><div class="grow"><b>${esc(SRC[src])}</b>
          <div class="small ${s && s.status === 'hit' ? '' : 'muted'}" ${s && s.status === 'hit' ? 'style="color:var(--danger)"' : ''}>${s ? esc(s.summary || s.error || '') : 'Ainda não consultado'}</div>
          ${s && s.status !== 'error' && s.error ? `<div class="small muted">Última tentativa falhou: ${esc(s.error)}</div>` : ''}</div>
          <div style="text-align:right">${s ? stTag(s.status) : '<span class="tag">—</span>'}<div class="small muted">${s ? date(s.checked_at) : ''}</div></div></div>`;
      };
      const debt = d.debtors || [];
      const badDebt = debt.filter((x) => x.status === 'hit' || x.status === 'alert');
      host.innerHTML = `<div class="card-head"><div><h2>Verificações</h2><div class="small muted">Consultas automáticas no cadastro e todo mês${d.queued ? ' · na fila agora' : ''}</div></div>
          <button class="btn secondary sm" id="v-now">Verificar agora</button></div>
        <div class="list">${['cgu', 'receita', 'pep'].map(row).join('')}</div>
        <h3 class="section-title" style="margin-top:14px">Sacados deste cedente</h3>
        <p class="small muted" style="margin:0 0 6px">${debt.length} com nota disponível ou em operação · ${debt.filter((x) => x.status).length} já consultados${badDebt.length ? '' : ' · nenhum com sanção'}</p>
        ${badDebt.length ? `<div class="list">${badDebt.map((x) => `<div class="list-row"><div class="grow"><b>${esc(x.name || cnpj(x.cnpj))}</b><div class="small muted">${esc(x.summary || '')}</div></div>${stTag(x.status)}</div>`).join('')}</div>` : ''}
        <h3 class="section-title" style="margin-top:14px">Notas (12 meses)</h3>
        <p class="small muted" style="margin:0">${d.nfe.checked} conferidas na SEFAZ · ${d.nfe.confirmed} confirmadas pelo cliente${d.nfe.problems ? ` · <span style="color:var(--danger)">${d.nfe.problems} com problema</span>` : ''}</p>
        ${(d.events || []).length ? `<details style="margin-top:10px"><summary class="small">Histórico</summary><div class="list" style="margin-top:6px">${d.events.map((e) => `<div class="list-row"><div class="grow small">${esc(SRC[e.source] || e.source)}: ${esc(e.summary || '')}</div><span class="small muted">${dateTime(e.created_at)}</span></div>`).join('')}</div></details>` : ''}`;
      host.querySelector('#v-now').onclick = (e) => busy(e.currentTarget, async () => {
        const r = await call({ action: 'company', company_id: companyId });
        if (!r) return;
        if (!r.cgu_key) toast('Receita consultada. Sanções e PEP precisam da chave do Portal da Transparência no Vault.', true);
        else toast('Verificação concluída');
        paint(await rpc('bo_company_verify', { p_company: companyId }));
      });
    };
    host.innerHTML = '<div class="spinner"></div>';
    try { paint(await rpc('bo_company_verify', { p_company: companyId })); } catch { host.innerHTML = '<p class="muted">Verificações indisponíveis (rode a migração 20261024000000).</p>'; }
  };

  /* ======================================================= página Verificações */
  const SETTINGS = [
    ['cgu', 'Sanções da CGU (cedentes e sacados)', 'bool'], ['receita', 'Situação do cedente na Receita', 'bool'], ['pep', 'Sócios PEP (alerta)', 'bool'],
    ['nfe_provider', 'Consulta das notas', 'provider'], ['recheck_days', 'Nova consulta de CNPJ a cada (dias)', 'int'],
    ['nfe_open_days', 'Nova consulta das notas em operação aberta a cada (dias)', 'int'], ['nfe_payout_hours', 'Antes de pagar o cedente, consulta das notas com até (horas)', 'int'],
  ];

  B.views.verificacoes = async (el, [tabIn], me) => {
    const tab = tabIn === 'resolvidos' ? 'resolved' : 'open';
    const d = await rpc('bo_verify_overview', { p_tab: tab });
    const admin = B.ui.can(me, 'admin');
    const s = d.config.settings || {};
    const link = (a) => a.invoice_id && a.operation_id ? `#/operacoes/${a.operation_id}` : a.company_id ? `#/empresas/${a.company_id}/credito` : null;
    const who = (a) => a.company || a.debtor || (a.cnpj ? cnpj(a.cnpj) : '');
    el.innerHTML = `
      ${B.ui.head('Verificações', 'Sanções da CGU, Receita, sócios PEP e notas na SEFAZ — consultas automáticas')}
      <div class="kpis">
        <div class="kpi"><span class="kpi-label">Alertas abertos</span><span class="kpi-value">${esc(d.counts.open)}</span><span class="small muted">${esc(d.counts.block)} bloqueando</span></div>
        <div class="kpi"><span class="kpi-label">CNPJs consultados (30 dias)</span><span class="kpi-value">${esc(d.checked.cnpj)}</span><span class="small muted">${d.last.cnpj ? 'último ' + dateTime(d.last.cnpj) : 'nenhum ainda'}</span></div>
        <div class="kpi"><span class="kpi-label">Notas conferidas (30 dias)</span><span class="kpi-value">${esc(d.checked.nfe)}</span><span class="small muted">${d.last.nfe ? 'última ' + dateTime(d.last.nfe) : 'nenhuma ainda'}</span></div>
        <div class="kpi"><span class="kpi-label">Na fila</span><span class="kpi-value">${esc(d.queue.cnpj + d.queue.nfe)}</span><span class="small muted">${esc(d.queue.cnpj)} CNPJs · ${esc(d.queue.nfe)} notas</span></div>
      </div>
      ${!d.config.cgu_key || !d.config.nfe_key ? `<div class="note-box" style="margin:12px 0">
        ${!d.config.cgu_key ? '<div><b>Sanções e PEP desligados:</b> falta a chave do Portal da Transparência no Vault (<code>transparencia_api_key</code>). A situação na Receita já roda sem chave.</div>' : ''}
        ${!d.config.nfe_key ? '<div><b>Consulta das notas desligada:</b> falta a chave da NFE.io no Vault (<code>nfe_api_key</code>).</div>' : ''}</div>` : ''}
      <div style="margin-top:12px">${B.ui.tabs([['open', 'Abertos'], ['resolved', 'Resolvidos']], tab)}</div>
      <div class="card flush"><div class="table-wrap">${d.alerts.length ? `<table><thead><tr><th>Alerta</th><th>Quem</th><th>O que aconteceu</th><th>Quando</th><th></th></tr></thead><tbody>
        ${d.alerts.map((a) => `<tr><td><span class="tag ${a.severity === 'block' ? 'danger' : 'warning'}">${esc(KIND[a.kind] || a.kind)}</span></td>
          <td>${link(a) ? `<a href="${esc(link(a))}">${esc(who(a))}</a>` : esc(who(a))}${a.cnpj && !String(a.kind).startsWith('nfe') ? `<div class="small muted">${esc(cnpj(a.cnpj))}</div>` : ''}</td>
          <td style="max-width:460px">${esc(a.message)}${a.resolved_at ? `<div class="small muted">Resolvido por ${esc(a.resolved_by_name || 'rotina')} em ${dateTime(a.resolved_at)}: ${esc(a.resolution || '')}</div>` : ''}</td>
          <td class="nowrap">${dateTime(a.created_at)}</td>
          <td>${a.resolved_at ? '' : `<button class="btn ghost sm" data-resolve="${esc(a.id)}">Resolver</button>`}</td></tr>`).join('')}</tbody></table>`
        : B.ui.empty(tab === 'open' ? 'Nenhum alerta aberto.' : 'Nenhum alerta resolvido ainda.')}</div></div>
      <div class="grid-2" style="margin-top:16px">
        <form class="card" id="vs"><h2>Ajustes</h2>
          <div class="stack-sm" style="margin-top:10px">${SETTINGS.map(([k, label, t]) => t === 'bool'
            ? `<label class="switch-row"><input type="checkbox" name="${k}" ${s[k] !== false ? 'checked' : ''} ${admin ? '' : 'disabled'}><span class="switch" aria-hidden="true"></span><span><b>${esc(label)}</b></span></label>`
            : t === 'provider' ? `<div class="field"><label>${esc(label)}</label><select class="input" name="${k}" ${admin ? '' : 'disabled'}><option value="nfeio" ${s[k] !== 'off' ? 'selected' : ''}>NFE.io</option><option value="off" ${s[k] === 'off' ? 'selected' : ''}>Desligada</option></select></div>`
            : `<div class="field"><label>${esc(label)}</label><input class="input" name="${k}" inputmode="numeric" value="${esc(s[k] ?? '')}" ${admin ? '' : 'disabled'}></div>`).join('')}</div>
          ${admin ? '<div class="save-bar"><span class="small muted">Valem na próxima rodada.</span><button class="btn" type="submit">Salvar</button></div>' : ''}</form>
        <div class="card"><h2>Como funciona</h2>
          <ul class="small" style="margin:8px 0 0 18px;line-height:1.6">
            <li><b>Sanção vigente</b> (CEIS, CNEP, CEPIM) no sacado: as notas dele saem do saldo. No cedente: não abre operação nova.</li>
            <li><b>CNPJ do cedente inativo</b> na Receita: não abre operação nova.</li>
            <li><b>Sócio PEP</b> ou acordo de leniência: só alerta, para a análise decidir.</li>
            <li><b>Nota cancelada ou não reconhecida pelo cliente</b>: sai do saldo; em operação ainda não paga, o Pix ao cedente trava; já paga, vira alerta para cobrar a recompra.</li>
            <li>Consulta no cadastro, na primeira nota de cada sacado e na importação de cada nota; repete todo mês (CNPJs) e a cada semana (notas em operação aberta).</li>
          </ul>
          ${admin ? `<h3 class="section-title" style="margin-top:14px">Homologar a API da CGU</h3>
            <div class="row" style="gap:8px"><input class="input" id="dg-cnpj" placeholder="CNPJ com sanção conhecida" inputmode="numeric"><button class="btn secondary" id="dg">Testar</button></div>
            <pre class="mono small" id="dg-out" style="white-space:pre-wrap;max-height:260px;overflow:auto;margin-top:8px" hidden></pre>` : ''}
        </div>
      </div>`;

    B.ui.onTabs(el, (t) => (location.hash = t === 'resolved' ? '#/verificacoes/resolvidos' : '#/verificacoes'));
    el.querySelectorAll('[data-resolve]').forEach((b) => (b.onclick = async () => {
      const r = await confirmAction({ title: 'Resolver alerta', text: 'Conte o que foi feito (fica no histórico).', note: true, noteLabel: 'O que foi feito', noteRequired: true, confirmLabel: 'Resolver' });
      if (r == null) return;
      B.run(null, () => rpc('bo_resolve_verify_alert', { p_id: Number(b.dataset.resolve), p_note: r }), 'Alerta resolvido').then(() => { B.reload(); B.refreshCounts && B.refreshCounts(); });
    }));
    const f = el.querySelector('#vs');
    f.onsubmit = (ev) => {
      ev.preventDefault();
      const p = {};
      SETTINGS.forEach(([k, , t]) => { const x = f.elements[k]; p[k] = t === 'bool' ? x.checked : t === 'int' ? Number(x.value) : x.value; });
      B.run(f.querySelector('[type=submit]'), () => rpc('bo_save_verify_settings', { p }), 'Ajustes salvos');
    };
    const dg = el.querySelector('#dg');
    if (dg) dg.onclick = (e) => busy(e.currentTarget, async () => {
      const v = el.querySelector('#dg-cnpj').value.toUpperCase().replace(/[^0-9A-Z]/g, '');
      if (v.length !== 14) { toast('Informe um CNPJ com 14 caracteres', true); return; }
      const r = await call({ action: 'diagnose', cnpj: v });
      const out = el.querySelector('#dg-out');
      out.hidden = false; out.textContent = r ? JSON.stringify(r, null, 2) : 'Sem resposta';
    });
  };
})();
