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
  B.nfeRows = (list, manual) => list.map((n) => `<div class="list-row"><div class="grow"><b>NF ${esc(n.number || '—')}</b> <span class="small muted">· ${esc(n.recipient || '')}</span>
      <div class="small muted">${n.checked_at ? `conferida ${dateTime(n.checked_at)}${n.provider && String(n.provider).startsWith('manual') ? ` · ${esc(n.provider.replace('manual:', 'à mão por'))}` : ''}` : 'ainda não conferida'}${n.error ? ` · ${esc(n.error)}` : ''}</div></div>
      <div style="text-align:right">${nfeState(n)}${manual && (!n.kind || n.kind === 'nfe') ? `<div><button class="btn ghost sm" data-manual="${esc(n.invoice_id)}" data-key="${esc(n.access_key || '')}" data-num="${esc(n.number || '')}">Conferi na SEFAZ</button></div>` : ''}</div></div>`).join('');

  /** Conferência manual no portal da NF-e (enquanto a consulta automática não estiver contratada) */
  const manualCheck = (invoiceId, key, num, done) => {
    const el = B.modal({
      title: `Conferir a NF ${num || ''} na SEFAZ`,
      body: `<div class="stack">
        <p style="margin:0">Abra o portal da NF-e, cole a chave de acesso e confira a situação da nota e os eventos (cancelamento, manifestação do destinatário).</p>
        <div class="copy-row"><code style="word-break:break-all">${esc(key)}</code><button class="btn ghost sm" type="button" data-copy>Copiar chave</button></div>
        <a class="btn secondary sm" href="https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ+gAVw2g=" target="_blank" rel="noopener">Abrir o portal da NF-e</a>
        <div class="field"><label for="nm-st">O que o portal mostrou</label><select class="input" id="nm-st">
          <option value="authorized">Autorizada, sem cancelamento nem desconhecimento</option>
          <option value="cancelled">Cancelada (ou com evento de desconhecimento)</option>
          <option value="not_found">Não encontrada</option></select></div>
        <div class="field"><label for="nm-note">Anotação (obrigatória)</label><textarea class="input" id="nm-note" placeholder="Ex.: conferida no portal em 28/10, protocolo 135..."></textarea></div>
        <div class="error-box" id="nm-err" hidden></div></div>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Registrar</button>',
    });
    el.querySelector('[data-copy]').onclick = () => B.copy(key);
    el.querySelector('[data-act=cancel]').onclick = B.closeModal;
    el.querySelector('[data-act=ok]').onclick = async (ev) => {
      let ok = false;
      await B.run(ev.currentTarget, async () => { await rpc('bo_nfe_manual_check', { p_invoice: invoiceId, p_status: el.querySelector('#nm-st').value, p_note: el.querySelector('#nm-note').value }); ok = true; }, 'Conferência registrada').catch(() => null);
      if (ok) { B.closeModal(); done(); }
    };
  };

  B.nfeCard = async (host, opId, opStatus) => {
    if (!host) return;
    const paint = (d) => {
      const list = d.invoices || [], bad = d.blocking || [];
      host.innerHTML = `<div class="card-head"><div><h2>Notas na SEFAZ</h2><div class="small muted">Cancelamento e manifestação do cliente (desconhecimento, operação não realizada, confirmação)</div></div>
          <button class="btn secondary sm" id="nfe-now">Conferir agora</button></div>
        ${bad.length ? `<div class="note-box" style="border-color:var(--danger);margin-bottom:10px"><b>${['paid', 'settled'].includes(opStatus) ? 'Operação já paga com nota com problema — cobrar a recompra do cedente:' : 'Pagamento ao cedente travado:'}</b> ${bad.map((b) => `NF ${esc(b.number || '—')} ${esc(b.problem)}`).join('; ')}</div>` : ''}
        ${list.length ? `<div class="list">${B.nfeRows(list, !['paid', 'settled', 'rejected', 'cancelled'].includes(opStatus))}</div>` : '<p class="muted">Sem notas nesta operação.</p>'}`;
      host.querySelectorAll('[data-manual]').forEach((b) => (b.onclick = () => manualCheck(b.dataset.manual, b.dataset.key, b.dataset.num,
        async () => paint(await rpc('bo_operation_nfe', { p_op: opId })))));
      host.querySelector('#nfe-now').onclick = (e) => busy(e.currentTarget, async () => {
        const r = await call({ action: 'operation', operation_id: opId });
        if (!r) return;
        if (r.robot) toast(r.queued ? 'Pedimos a consulta ao robô da SEFAZ. O resultado aparece aqui em alguns minutos.' : 'As notas foram consultadas há pouco.');
        else if (!r.checked) toast('A consulta de notas não está configurada (robô da SEFAZ ou chave da NFE.io).', true);
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
    ['nfe_provider', 'Consulta das notas', 'provider'], ['sefaz_repo', 'Repositório do robô da SEFAZ (usuário/repositório no GitHub)', 'text'],
    ['recheck_days', 'Nova consulta de CNPJ a cada (dias)', 'int'],
    ['nfe_open_days', 'Nova consulta das notas em operação aberta a cada (dias)', 'int'], ['nfe_payout_hours', 'Antes de pagar o cedente, consulta das notas com até (horas)', 'int'],
  ];

  // Situação do robô da SEFAZ (última rodada, erros, validade do certificado)
  function robotBox(cfg) {
    const s = cfg.settings || {};
    if (s.nfe_provider !== 'sefaz') return '';
    const r = s.sefaz_robot;
    if (!r || !r.seen_at) return `<div class="note-box" style="margin:12px 0"><b>Robô da SEFAZ ainda não rodou.</b> Siga o passo a passo da pasta <code>sefaz-robo</code> (certificado A1 da Lottus e GitHub). Enquanto isso, as operações só passam com a conferência manual.</div>`;
    const ageMin = Math.round((Date.now() - new Date(r.seen_at).getTime()) / 60000);
    const late = ageMin > 90;
    const days = r.cert && r.cert.not_after ? Math.floor((new Date(r.cert.not_after).getTime() - Date.now()) / 86400000) : null;
    const warn = r.fatal || late || (days != null && days < 30) || (r.errors && r.errors >= (r.checked || 0) && r.checked);
    return `<div class="note-box" style="margin:12px 0;${warn ? 'border-color:var(--danger)' : ''}">
      <b>Robô da SEFAZ:</b> última rodada ${dateTime(r.seen_at)} (${ageMin < 60 ? `há ${ageMin} min` : `há ${Math.round(ageMin / 60)} h`})${late ? ' <b style="color:var(--danger)">— parado?</b>' : ''}
      ${r.fatal ? `<div style="color:var(--danger)"><b>Não rodou:</b> ${esc(r.fatal)}</div>` : `<div>${esc(r.checked || 0)} consultada(s), ${esc(r.authorized || 0)} autorizada(s), ${esc(r.problems || 0)} com problema, ${esc(r.errors || 0)} erro(s)${r.last_error ? ` · último erro: ${esc(r.last_error)}` : ''}</div>`}
      ${r.cert ? `<div class="small ${days != null && days < 30 ? '' : 'muted'}" ${days != null && days < 30 ? 'style="color:var(--danger)"' : ''}>Certificado ${esc(r.cert.subject || '')} vale até ${esc(B.date(r.cert.not_after))}${days != null ? ` (${days} dias)` : ''}</div>` : ''}
      ${!cfg.gh_token ? '<div class="small muted">Sem o token do GitHub no Vault: o "conferir agora" espera a próxima rodada (a cada 30 min).</div>' : ''}</div>`;
  }

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
      ${robotBox(d.config)}
      ${!d.config.cgu_key || (s.nfe_provider === 'nfeio' && !d.config.nfe_key) || s.nfe_provider === 'off' ? `<div class="note-box" style="margin:12px 0">
        ${!d.config.cgu_key ? '<div><b>Sanções e PEP desligados:</b> falta a chave do Portal da Transparência no Vault (<code>transparencia_api_key</code>). A situação na Receita já roda sem chave.</div>' : ''}
        ${s.nfe_provider === 'nfeio' && !d.config.nfe_key ? '<div><b>Consulta das notas desligada:</b> falta a chave da NFE.io no Vault (<code>nfe_api_key</code>). Ou escolha o robô da SEFAZ (grátis) nos Ajustes.</div>' : ''}
        ${s.nfe_provider === 'off' ? '<div><b>Consulta das notas desligada nos Ajustes.</b> As operações só passam com a conferência manual.</div>' : ''}</div>` : ''}
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
            : t === 'provider' ? `<div class="field"><label>${esc(label)}</label><select class="input" name="${k}" ${admin ? '' : 'disabled'}>
                <option value="sefaz" ${s[k] === 'sefaz' ? 'selected' : ''}>Robô da SEFAZ (grátis, certificado A1 da Lottus)</option>
                <option value="nfeio" ${!s[k] || s[k] === 'nfeio' ? 'selected' : ''}>NFE.io (paga)</option>
                <option value="off" ${s[k] === 'off' ? 'selected' : ''}>Desligada (só conferência manual)</option></select></div>`
            : t === 'text' ? `<div class="field"><label>${esc(label)}</label><input class="input mono" name="${k}" value="${esc(s[k] ?? '')}" placeholder="ex.: lottus/lottus-backup" ${admin ? '' : 'disabled'}><div class="help">Com o token <code>github_dispatch_token</code> no Vault, o botão "conferir agora" chama o robô na hora. Sem ele, o robô roda a cada 30 min.</div></div>`
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
      SETTINGS.forEach(([k, , t]) => { const x = f.elements[k]; p[k] = t === 'bool' ? x.checked : t === 'int' ? Number(x.value) : String(x.value).trim(); });
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
