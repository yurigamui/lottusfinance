/* Lottus Admin — Produtos (uso do Partners e do Sign) e Configurações (Empresa, Integrações) */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, dateTime, ago, toast, run, modal, closeModal, confirmAction, sb } = B;
  const { head, empty, can } = B.ui;
  const n = (v) => Number(v || 0).toLocaleString('pt-BR');
  const MONTH = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const TRIO = { connected: ['Conta conectada', 'success'], linking: ['Conectando', 'warning'], error: ['Não conectou', 'danger'] };

  /* --------------------------------------------------------------- Partners */
  B.views.partners = async (el) => {
    const d = (await rpc('bo_products')).partners;
    const rows = d.rows, free = Number(d.free_limit);
    const stale = (r) => !r.last_access || new Date(r.last_access) < new Date(Date.now() - 30 * 864e5);
    const pending = rows.filter((r) => r.origin === 'self' && !r.routing && r.active);
    el.innerHTML = `
      ${head('Partners', 'Os veículos que usam o Lottus Partners, o PL de cada um e quem está parado.', '<a class="btn secondary" href="#/parceiros">Gestão dos fundos</a>')}
      <div class="kpi4">
        <div class="tile main"><span class="kpi-label">Veículos ativos</span><span class="tile-value">${rows.filter((r) => r.active).length}</span><span class="small muted">${rows.length} cadastrados</span></div>
        <div class="tile"><span class="kpi-label">PL total</span><span class="tile-value">${B.brlCompact(rows.reduce((t, r) => t + Number(r.pl || 0), 0))}</span><span class="small muted">limite grátis ${brl(free)} por veículo</span></div>
        <div class="tile ${pending.length ? 'warning-tile' : ''}"><span class="kpi-label">Cadastros a liberar</span><span class="tile-value">${pending.length}</span><span class="small muted">pelo cadastro aberto</span></div>
        <div class="tile ${rows.filter((r) => r.active && stale(r)).length ? 'danger' : ''}"><span class="kpi-label">Sem acesso há 30 dias</span><span class="tile-value">${rows.filter((r) => r.active && stale(r)).length}</span><span class="small muted">risco de cancelar</span></div>
      </div>
      <div class="card flush"><div class="table-wrap">${rows.length ? `<table><thead><tr><th>Veículo</th><th class="num">PL</th><th>Uso do limite grátis</th><th>Pessoas</th><th>Conta Trio</th><th>Último acesso</th><th></th></tr></thead><tbody>
        ${rows.map((r) => { const share = free ? Math.min(100, (Number(r.pl) / free) * 100) : 0; const t = TRIO[r.trio_status];
          return `<tr><td><b>${esc(r.name)}</b><div class="small muted">${r.kind === 'fidc' ? 'FIDC' : 'Securitizadora'} · ${r.origin === 'self' ? 'cadastro aberto' : 'convite'}${!r.active ? ' · inativo' : ''}${r.origin === 'self' && !r.routing ? ' · <b>aguarda liberação</b>' : ''}</div></td>
            <td class="num">${B.brlCompact(r.pl)}</td><td style="min-width:140px">${r.origin === 'self' ? `<div class="meter" role="img" aria-label="${share.toFixed(0)}% do limite"><span style="width:${Math.max(2, share).toFixed(0)}%"></span></div><span class="small muted">${Number(r.pl) > free ? 'acima do grátis' : share.toFixed(0) + '% do grátis'}</span>` : '<span class="small muted">contrato</span>'}</td>
            <td>${n(r.members)}</td><td>${t ? `<span class="tag ${t[1]}">${t[0]}</span>` : '<span class="small muted">não usa</span>'}</td>
            <td class="small ${stale(r) ? 'late' : 'muted'}">${r.last_access ? ago(r.last_access) : 'nunca'}</td>
            <td class="num nowrap"><a class="btn ghost sm" href="#/clientes/funder/${esc(r.id)}">Ficha</a> <a class="btn secondary sm" href="#/parceiros/${esc(r.id)}">Gerenciar</a></td></tr>`; }).join('')}</tbody></table>` : empty('Nenhum veículo cadastrado.')}</div></div>`;
  };

  /* ------------------------------------------------------------------- Sign */
  B.views.sign = async (el) => {
    const d = (await rpc('bo_products')).sign;
    const last = d.months.at(-1) || { docs: 0 }, prev = d.months.at(-2) || { docs: 0 };
    el.innerHTML = `
      ${head('Sign', 'Quanto o Lottus Sign está sendo usado e quem está perto do limite do plano.', '<a class="btn secondary" href="#/planos/sign">Planos e contas</a>')}
      <div class="kpi4">
        <div class="tile main"><span class="kpi-label">Documentos no mês</span><span class="tile-value">${n(last.docs)}</span><span class="small muted">${n(prev.docs)} no mês anterior · ${n(last.completed)} concluídos</span></div>
        <div class="tile"><span class="kpi-label">Contas</span><span class="tile-value">${n(d.plans.reduce((t, p) => t + Number(p.count), 0))}</span><span class="small muted">${d.plans.map((p) => `${esc(p.plan)} ${p.count}`).join(' · ')}</span></div>
        <div class="tile ${d.near_limit.length ? 'warning-tile' : ''}"><span class="kpi-label">Perto do limite</span><span class="tile-value">${d.near_limit.length}</span><span class="small muted">80% ou mais do plano · chance de upgrade</span></div>
        <div class="tile ${Number(d.failures.total) ? 'danger' : ''}"><span class="kpi-label">Falhas de envio (30 d)</span><span class="tile-value">${n(d.failures.total)}</span><span class="small muted">${n(d.failures.email)} do Sign</span></div>
      </div>
      <div class="card dash-row"><h2>Documentos enviados por mês</h2><div id="ch"></div></div>
      <div class="card"><h2>Perto do limite do plano</h2>${d.near_limit.length ? d.near_limit.map((a) => `<div class="list-row"><div class="grow"><b>${esc(a.name)}</b> <span class="small muted">${esc(a.plan)}</span>
        <div class="meter" style="max-width:320px"><span style="width:${Math.min(100, (a.used / a.included) * 100).toFixed(0)}%"></span></div><span class="small muted">${n(a.used)} de ${n(a.included)} documentos</span></div>
        <a class="btn secondary sm" href="#/clientes/sign/${esc(a.id)}">Ficha</a> <button class="btn sm" data-task="${esc(a.id)}" data-name="${esc(a.name)}">Oferecer upgrade</button></div>`).join('') : empty('Ninguém perto do limite.')}</div>`;
    B.columnChart(el.querySelector('#ch'), d.months.map((m, i) => { const [y, mo] = m.month.split('-').map(Number); return { label: MONTH[mo - 1] + (mo === 1 || i === 0 ? '/' + String(y).slice(2) : ''), value: m.docs, detail: `${n(m.completed)} concluídos` }; }), { name: 'Documentos', format: n });
    el.querySelectorAll('[data-task]').forEach((b) => (b.onclick = () => B.openTask({ customer_kind: 'sign', customer_id: b.dataset.task, kind: 'ligar', title: `Oferecer upgrade de plano a ${b.dataset.name}` })));
  };

  /* --------------------------------------------------------------- Empresa */
  B.views.empresa = async (el, _a, me) => {
    const admin = can(me, 'admin');
    const c = await rpc('bo_company_settings', { p: null });
    const f = (id, label, v, extra = '') => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" value="${esc(v || '')}" ${admin ? '' : 'disabled'} ${extra}></div>`;
    el.innerHTML = `
      ${head('Empresa', 'Os dados da Lottus que aparecem nas faturas, nos e-mails e no cálculo do caixa.')}
      <div class="grid-2 dash-row">
        <div class="card"><h2>Cadastro</h2><div class="stack">
          ${f('c-ln', 'Razão social', c.legal_name)}${f('c-tn', 'Nome fantasia', c.trade_name)}
          <div class="grid-2">${f('c-cnpj', 'CNPJ', c.cnpj ? B.cnpj(c.cnpj) : '', 'inputmode="numeric"')}${f('c-ph', 'Telefone', c.phone)}</div>
          ${f('c-ad', 'Endereço', c.address)}
          <div class="grid-2">${f('c-em', 'E-mail da empresa', c.email, 'type="email"')}${f('c-site', 'Site', c.site_url, 'type="url"')}</div>
          <p class="small muted">O e-mail da empresa recebe os avisos de contas a pagar.</p></div></div>
        <div class="card"><h2>Cobrança e caixa</h2><div class="stack">
          ${f('c-pix', 'Chave Pix (aparece nas faturas)', c.pix_key)}
          ${f('c-min', 'Saldo mínimo de caixa (R$)', c.cash_min ? String(c.cash_min).replace('.', ',') : '', 'inputmode="decimal"')}
          <p class="small muted">Abaixo do mínimo, o Início e o Fluxo de caixa avisam em vermelho.</p>
          <div class="field"><label for="c-sig">Assinatura dos e-mails</label><textarea class="input" id="c-sig" rows="4" ${admin ? '' : 'disabled'}>${esc(c.email_signature || '')}</textarea></div>
        </div></div>
      </div>
      ${admin ? '<button class="btn" id="save">Salvar</button>' : '<p class="small muted">Só administradores alteram.</p>'}`;
    const s = el.querySelector('#save');
    if (s) s.onclick = () => {
      const g = (id) => el.querySelector(id).value;
      run(s, () => rpc('bo_company_settings', { p: { legal_name: g('#c-ln'), trade_name: g('#c-tn'), cnpj: g('#c-cnpj'), phone: g('#c-ph'), address: g('#c-ad'), email: g('#c-em'), site_url: g('#c-site'),
        pix_key: g('#c-pix'), cash_min: String(g('#c-min')).replace(/\./g, '').replace(',', '.') || '0', email_signature: g('#c-sig') } }), 'Dados da empresa salvos').catch(() => {});
    };
  };

  /* ------------------------------------------------------------ Integrações */
  B.views.integracoes = async (el, _a, me) => {
    const admin = can(me, 'admin');
    const i = await rpc('bo_integrations');
    const soc = i.social || {};
    const st = (ok, txt) => `<span class="tag ${ok === true ? 'success' : ok === 'warn' ? 'warning' : ok === 'err' ? 'danger' : ''}">${txt}</span>`;
    const sstat = (k) => { const s = soc[k]; if (!s || s.status === 'off') return st(false, 'Não conectado'); if (s.status === 'connected') return st(true, 'Conectado'); if (s.status === 'error') return st('err', 'Erro'); return st('warn', 'Conectando'); };
    const row = (name, what, status, detail, action = '') => `<div class="list-row integ"><div class="grow"><b>${name}</b> ${status}<div class="small muted">${what}</div>${detail ? `<div class="small">${detail}</div>` : ''}</div>${action}</div>`;
    el.innerHTML = `
      ${head('Integrações', 'Os serviços ligados ao Admin, se estão funcionando e o que falta.', admin && (soc.instagram || soc.linkedin) ? '<button class="btn secondary" id="ssync">Atualizar redes agora</button>' : '')}
      <div class="card">
        ${row('Postmark (e-mail)', 'Envia cobranças, campanhas e avisos', st(i.email.ok, i.email.ok ? 'Conectado' : 'Falta o token'), i.email.ok ? `Remetente ${esc(i.email.from || '')} · ${i.email.webhook ? 'avisos de entrega ligados' : 'falta o aviso de entrega (webhook)'}` : 'Cadastre o token em Configurações › E-mails.', admin ? '<a class="btn ghost sm" href="#/emails">Abrir</a>' : '')}
        ${row('Trio (conta da Lottus)', 'Lê o saldo e dá baixa nas faturas pagas por Pix', st(i.trio.count ? (i.trio.ok ? true : 'err') : false, i.trio.count ? (i.trio.ok ? 'Conectada' : 'Com erro') : 'Não conectada'), i.trio.error ? esc(i.trio.error) : '', '<a class="btn ghost sm" href="#/caixa">Abrir</a>')}
        ${row('Instagram', 'Alcance por dia e seguidores do perfil da Lottus', sstat('instagram'), soc.instagram ? `${esc(soc.instagram.account_name || '')}${soc.instagram.last_sync_at ? ' · atualizado ' + ago(soc.instagram.last_sync_at) : ''}${soc.instagram.last_error ? ' · ' + esc(soc.instagram.last_error) : ''}` : '', admin ? '<button class="btn secondary sm" data-con="instagram">Configurar</button>' : '')}
        ${row('LinkedIn', 'Impressões, alcance, cliques e seguidores da página', sstat('linkedin'), soc.linkedin ? `${esc(soc.linkedin.account_name || '')}${soc.linkedin.last_sync_at ? ' · atualizado ' + ago(soc.linkedin.last_sync_at) : ''}${soc.linkedin.last_error ? ' · ' + esc(soc.linkedin.last_error) : ''}` : '', admin ? '<button class="btn secondary sm" data-con="linkedin">Configurar</button>' : '')}
        ${row('SMS (TextBee)', 'Códigos e avisos do Sign por SMS', st(i.sms ? true : 'warn', i.sms ? 'Configurado' : 'Não detectado'), '', admin ? '<a class="btn ghost sm" href="#/mensageria">Abrir</a>' : '')}
        ${row('WhatsApp', 'Mensagens do Sign pelo WhatsApp', st(i.whatsapp ? true : false, i.whatsapp ? 'Configurado' : 'Desligado'), '', admin ? '<a class="btn ghost sm" href="#/mensageria">Abrir</a>' : '')}
        ${row('Cartão de crédito', 'Cobrança automática das mensalidades', st(i.card ? true : false, i.card ? 'Configurado' : 'Não contratado'), i.card ? '' : 'Hoje as faturas são pagas por Pix e baixadas pela Trio ou à mão.')}
        ${row('Formulário do site', 'Quem preenche vira lead no Funil e contato com consentimento', st(true, 'Pronto'), 'Use o link da campanha (utm_campaign) para saber de onde veio.')}
      </div>`;
    const ss = el.querySelector('#ssync');
    if (ss) ss.onclick = () => run(ss, async () => { const { data, error } = await sb.functions.invoke('social-sync', { body: { action: 'sync' } }); if (error) throw error; const bad = (data.results || []).find((r) => !r.ok); if (bad) throw new Error(`${bad.provider}: ${bad.error}`); }, 'Redes atualizadas').then(B.reload).catch(() => B.reload());
    el.querySelectorAll('[data-con]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.con, s = soc[k] || {}, ig = k === 'instagram';
      const box = modal({ title: ig ? 'Conectar o Instagram' : 'Conectar o LinkedIn', body: `<div class="stack">
        <p class="small">${ig ? 'Precisa de um perfil profissional ligado a uma página do Facebook e de um app na Meta com as permissões <b>instagram_basic</b> e <b>instagram_manage_insights</b>. Gere um token de longa duração (60 dias) no Explorador da API do Graph.' : 'Precisa de um app no LinkedIn Developers com o produto <b>Community Management API</b> aprovado e um token com <b>r_organization_social</b> e <b>rw_organization_admin</b> de um administrador da página.'}</p>
        <div class="field"><label>${ig ? 'ID da conta do Instagram (ig-user-id)' : 'ID da página da empresa (número)'}</label><input class="input" id="i-id" value="${esc(s.account_id || '')}"></div>
        <div class="field"><label>Token de acesso</label><input class="input" id="i-tok" type="password" autocomplete="new-password" placeholder="${s.account_id ? 'Em branco: mantém o atual' : ''}"></div>
        <div class="field"><label>Versão da API (opcional)</label><input class="input" id="i-v" value="${esc((s.settings || {}).version || '')}" placeholder="${ig ? 'v21.0' : '202601'}"></div>
        <p class="small muted">O token fica guardado no cofre. Os números são lidos todo dia às 6h35 e aparecem em Marketing › Resultados.</p><div class="error-box" id="i-err" hidden></div></div>`,
        foot: `${s.status && s.status !== 'off' ? '<button class="btn danger" id="i-off">Desligar</button><span class="grow"></span>' : ''}<button class="btn secondary" data-close>Cancelar</button><button class="btn" id="i-ok">Salvar e testar</button>` });
      box.querySelector('[data-close]').onclick = closeModal;
      const off = box.querySelector('#i-off');
      if (off) off.onclick = () => run(off, () => rpc('bo_integration_save', { p_provider: k, p: { action: 'disconnect' } }), 'Desligado').then(() => { closeModal(); B.reload(); }).catch(() => {});
      box.querySelector('#i-ok').onclick = async (e) => {
        const g = (q) => box.querySelector(q).value;
        if (!g('#i-id').trim()) { const er = box.querySelector('#i-err'); er.hidden = false; er.textContent = 'Informe o ID da conta.'; return; }
        try {
          await run(e.target, async () => {
            await rpc('bo_integration_save', { p_provider: k, p: { account_id: g('#i-id'), token: g('#i-tok'), version: g('#i-v') } });
            const { data } = await sb.functions.invoke('social-sync', { body: { action: 'sync' } });
            const r = (data && data.results || []).find((x) => x.provider === k);
            if (r && !r.ok) toast(`Salvo, mas a leitura falhou: ${r.error}`, true);
          }, 'Integração salva');
          closeModal(); B.reload();
        } catch { /* aviso mostrado */ }
      };
    }));
  };
})();
