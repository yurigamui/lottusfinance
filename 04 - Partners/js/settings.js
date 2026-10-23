/* Lottus Partners — configurações: Conta Trio (chaves da API), política de crédito com as regras de cobrança por nota, e equipe */
(function () {
  'use strict';
  const B = window.BO;
  const { sb, rpc, esc, brl, pct, toast, run, copy, modal, closeModal, confirmAction, dateTime } = B;
  const { head, tabs, onTabs } = B.ui;

  const TABS = [['banco', 'Banco'], ['politica', 'Política de crédito'], ['equipe', 'Equipe']];
  const pctIn = (v) => (v == null || v === '' ? '' : (Number(v) * 100).toFixed(2).replace('.', ','));
  const pctOut = (s) => { const t = String(s || '').replace(/\./g, '').replace(',', '.').trim(); return t === '' ? null : Number(t) / 100; };
  const numIn = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
  const numOut = (s) => { const t = String(s || '').replace(/[^\d,]/g, '').replace(',', '.'); return t === '' ? null : Number(t); };
  const decIn = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));
  const decOut = (s) => { const t = String(s ?? '').trim().replace(',', '.'); return t === '' ? null : Number(t); };
  const intOut = (s) => { const t = String(s ?? '').replace(/\D/g, ''); return t === '' ? null : Number(t); };
  const sw = (name, on, label, help, disabled) => `<label class="switch-row"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="switch" aria-hidden="true"></span>
    <span><b>${label}</b>${help ? `<small>${help}</small>` : ''}</span></label>`;
  const cnpjFmt = (v) => (B.cnpj ? B.cnpj(v) : v);
  const ACCESS = { admin: ['Administrador', 'Tudo, mais a equipe e as configurações'], approver: ['Aprovador', 'Aprova e paga operações'], viewer: ['Consulta', 'Só vê'] };
  const accessOf = (m) => (m.is_admin ? 'admin' : m.can_sign ? 'approver' : 'viewer');
  const fail = (e) => toast(B.message(e), true);

  B.views.config = async (el, [raw], me) => {
    const tab = TABS.some(([k]) => k === raw) ? raw : 'banco';
    const [s, fresh] = await Promise.all([rpc('partner_settings'), rpc('partner_me').catch(() => me)]);
    s.me.account = (fresh && fresh.account) || {};
    if (me && fresh && fresh.account) me.account = fresh.account;
    const adm = s.me.is_admin;
    el.innerHTML = `${head('Configurações', adm ? null : 'Só administradores do fundo alteram estas configurações.', tabs(TABS, tab))}<div id="pane"></div>`;
    onTabs(el, (t) => (location.hash = `#/config/${t}`));
    const pane = el.querySelector('#pane');
    if (tab === 'politica') policy(pane, s, adm);
    else if (tab === 'banco') bank(pane, s, adm);
    else team(pane, s, adm);
  };

  /* -------------------------------------------------- política de crédito */
  const steps = (v) => (v || [-3, 0, 1, 5]).map((d) => (d < 0 ? `${-d} dia${d === -1 ? '' : 's'} antes` : d === 0 ? 'no dia' : `${d} dia${d === 1 ? '' : 's'} depois`)).join(', ').replace(/, ([^,]*)$/, ' e $1');
  function policy(pane, s, can) {
    const p = s.policy, def = p.defaults || {};
    const ro = can ? '' : 'disabled';
    const tone = (r) => (['AAA', 'AA', 'A'].includes(r) ? 'success' : ['BBB', 'BB', 'B'].includes(r) ? 'brand' : ['CCC', 'CC', 'C'].includes(r) ? 'warning' : 'danger');
    pane.innerHTML = `
      <form class="card stack" id="pf" novalidate>
        <div><h2>Cedentes</h2><p class="small muted" style="margin:4px 0 0">A nota vem da análise da Lottus. Para cada nota, você decide se aceita, a taxa e o limite do fundo e as regras de cobrança, que entram no termo de cessão que o cedente assina. Em branco vale o padrão.</p></div>
        <div class="table-wrap"><table class="pol ced">
          <thead>
            <tr><th rowspan="2">Nota</th><th rowspan="2">Aceita</th><th colspan="2" class="grp">Crédito</th><th colspan="3" class="grp">Cobrança</th></tr>
            <tr><th>Taxa (% a.m.)</th><th>Limite por cedente (R$)</th><th>Multa (%)</th><th>Juros de mora (% a.m.)</th><th>Recompra após (dias)</th></tr>
          </thead>
          <tbody>${p.cedente.map((r) => `<tr data-ced="${esc(r.rating)}">
            <td><span class="tag ${tone(r.rating)}">${esc(r.rating)}</span></td>
            <td><label class="mini-switch"><input type="checkbox" name="acc" ${r.accepts ? 'checked' : ''} ${ro}><span aria-hidden="true"></span><span class="sr">Aceita nota ${esc(r.rating)}</span></label></td>
            <td><input class="input sm" name="rate" inputmode="decimal" value="${pctIn(r.monthly_rate)}" placeholder="${def.monthly_rate != null ? pctIn(def.monthly_rate) : 'padrão'}" ${ro}></td>
            <td><input class="input sm" name="lim" inputmode="decimal" value="${numIn(r.limit_amount)}" placeholder="${def.limit_per_company != null ? numIn(def.limit_per_company) : 'sem limite'}" ${ro}></td>
            <td><input class="input sm xs" name="fine" inputmode="decimal" value="${decIn(r.fine_percent)}" placeholder="${decIn(Number(def.fine_percent).toFixed(2))}" ${ro}></td>
            <td><input class="input sm xs" name="int" inputmode="decimal" value="${decIn(r.interest_monthly_percent)}" placeholder="${decIn(Number(def.interest_monthly_percent).toFixed(2))}" ${ro}></td>
            <td><input class="input sm xs" name="bb" inputmode="numeric" value="${r.buyback_days ?? ''}" placeholder="${def.buyback_days}" ${ro}></td>
          </tr>`).join('')}</tbody></table></div>
        <p class="small muted" id="cr-preview" style="margin:0"></p>

        <div style="margin-top:8px"><h2>Sacados</h2><p class="small muted" style="margin:4px 0 0">Nota de risco do sacado, também da Lottus. Você decide se aceita e o limite por sacado.</p></div>
        <div class="table-wrap"><table class="pol">
          <thead><tr><th>Nota</th><th>Aceita</th><th>Limite por sacado (R$)</th><th></th></tr></thead>
          <tbody>${p.sacado.map((r) => `<tr data-sac="${esc(r.rating)}">
            <td><span class="tag ${['A', 'B'].includes(r.rating) ? 'success' : r.rating === 'C' ? 'warning' : 'danger'}">${esc(r.rating)}</span></td>
            <td><label class="mini-switch"><input type="checkbox" name="acc" ${r.accepts ? 'checked' : ''} ${ro}><span aria-hidden="true"></span><span class="sr">Aceita nota ${esc(r.rating)}</span></label></td>
            <td><input class="input sm" name="lim" inputmode="decimal" value="${numIn(r.limit_amount)}" placeholder="${def.limit_per_debtor != null ? numIn(def.limit_per_debtor) : 'sem limite'}" ${ro}></td><td></td>
          </tr>`).join('')}</tbody></table></div>

        <div style="margin-top:8px">${sw('reminders_on', p.reminders_on !== false, 'Lembretes por e-mail ao sacado', `Com o Pix da duplicata: ${steps(p.reminder_steps)}.`, !can)}</div>
        ${can ? '<div class="save-bar" style="gap:12px"><span class="small muted">Vale para os próximos pedidos. Operações já pedidas seguem o termo assinado.</span><button class="btn" type="submit">Salvar política</button></div>' : ''}
      </form>`;
    const f = pane.querySelector('#pf');
    // Exemplo com a primeira nota aceita
    const prev = () => {
      const tr = [...f.querySelectorAll('[data-ced]')].find((x) => x.querySelector('[name=acc]').checked) || f.querySelector('[data-ced]');
      if (!tr) return;
      const v = (n, d) => { const x = decOut(tr.querySelector(`[name=${n}]`).value); return x == null || Number.isNaN(x) ? Number(d) : x; };
      const fine = v('fine', def.fine_percent), int = v('int', def.interest_monthly_percent), bb = intOut(tr.querySelector('[name=bb]').value) || def.buyback_days;
      pane.querySelector('#cr-preview').textContent = `Exemplo, nota ${tr.dataset.ced}: numa duplicata de ${brl(1000)} paga com 3 dias de atraso, o cedente paga ${brl(10 * fine + ((10 * int) / 30) * 3)} de encargos. Sem pagamento ${bb} dias depois do vencimento, abre a recompra, e o cedente tem 2 dias úteis para pagar. O sacado paga sempre o valor da duplicata.`;
    };
    f.querySelectorAll('[data-ced] input').forEach((x) => x.addEventListener('input', prev));
    f.querySelectorAll('[data-ced] [name=acc]').forEach((x) => x.addEventListener('change', prev));
    prev();
    f.onsubmit = (e) => {
      e.preventDefault();
      const ced = [...f.querySelectorAll('[data-ced]')].map((tr) => ({ rating: tr.dataset.ced, accepts: tr.querySelector('[name=acc]').checked,
        monthly_rate: pctOut(tr.querySelector('[name=rate]').value), limit_amount: numOut(tr.querySelector('[name=lim]').value),
        fine_percent: decOut(tr.querySelector('[name=fine]').value), interest_monthly_percent: decOut(tr.querySelector('[name=int]').value),
        buyback_days: intOut(tr.querySelector('[name=bb]').value) }));
      const sac = [...f.querySelectorAll('[data-sac]')].map((tr) => ({ rating: tr.dataset.sac, accepts: tr.querySelector('[name=acc]').checked,
        limit_amount: numOut(tr.querySelector('[name=lim]').value) }));
      if (ced.some((r) => r.monthly_rate != null && (Number.isNaN(r.monthly_rate) || r.monthly_rate > 0.2))) return toast('Confira as taxas (até 20% a.m.).', true);
      const bad = ced.find((r) => (r.fine_percent != null && (Number.isNaN(r.fine_percent) || r.fine_percent > 2)) || (r.interest_monthly_percent != null && (Number.isNaN(r.interest_monthly_percent) || r.interest_monthly_percent > 1))
        || (r.buyback_days != null && (r.buyback_days < 1 || r.buyback_days > 90)));
      if (bad) return toast(`Nota ${bad.rating}: multa até 2%, juros até 1% a.m. e recompra entre 1 e 90 dias.`, true);
      run(f.querySelector('[type=submit]'), () => rpc('partner_save_policy', { p: { cedente: ced, sacado: sac, reminders_on: f.reminders_on.checked } }), 'Política salva').catch(() => null);
    };
  }

  /* ---------------------------------------------------- Conta Trio do fundo */
  const TRIO_STEP = {
    none: ['Não conectada', ''], linking: ['Conectando', 'brand'], active: ['Conectada', 'success'], error: ['Não conectou', 'danger'],
    opening: ['Não conectada', ''], in_validation: ['Não conectada', ''], in_review: ['Não conectada', ''], approved: ['Conectando', 'brand'], rejected: ['Não conectada', ''],
  };
  async function trioCall(body) {
    const { data, error } = await sb.functions.invoke('charges', { body });
    if (error) {
      let j = {}; try { j = await error.context.json(); } catch { /* sem corpo */ }
      const e = new Error(j.error || 'unavailable'); e.detail = j.detail || null; throw e;
    }
    if (data && data.error) { const e = new Error(data.error); e.detail = data.detail || null; throw e; }
    return data;
  }
  B.askAccountConsent = () => {}; // a conta não é mais aberta pela Lottus

  function bank(pane, s, adm) {
    const t = s.trio || { status: 'none' };
    const [stLabel, stTone] = TRIO_STEP[t.status] || TRIO_STEP.none;
    const a = t.account || {};
    const ips = t.egress_ips ? t.egress_ips.split(/[\s,;]+/).filter(Boolean) : [];
    const keysForm = (again) => `
      <form class="stack" id="tk" novalidate>
        ${again ? '' : `<ol class="howto small">
          <li>Abra a conta do fundo na Trio. Por enquanto, o cadastro é feito direto com a Trio: <a href="https://www.trio.com.br" target="_blank" rel="noopener">trio.com.br</a>.</li>
          <li>No app da Trio, vá em Configurações → Chaves de API → Criar chave. Escolha <b>Leitura e escrita</b>${ips.length ? ` e libere estes IPs: ${ips.map((x) => `<code>${esc(x)}</code>`).join(' ')}` : ' e libere os IPs que a Lottus informar'}.</li>
          <li>Cole abaixo o Client ID e a Secret Key. A Secret Key aparece uma vez só na Trio.</li>
        </ol>`}
        <div class="grid-2">
          <div class="field"><label>Client ID</label><input class="input" name="client_id" autocomplete="off" spellcheck="false" placeholder="${t.key_hint ? `termina em ${esc(t.key_hint)}` : ''}"></div>
          <div class="field"><label>Secret Key</label><input class="input" name="client_secret" type="password" autocomplete="new-password" spellcheck="false"></div>
        </div>
        <div class="field"><label>Ambiente</label><div class="choices">
          <label class="choice"><input type="radio" name="env" value="production" ${t.env !== 'sandbox' || !t.has_keys ? 'checked' : ''}><span><b>Produção</b><small>Dinheiro de verdade</small></span></label>
          <label class="choice"><input type="radio" name="env" value="sandbox" ${t.env === 'sandbox' && t.has_keys ? 'checked' : ''}><span><b>Testes</b><small>Sandbox da Trio</small></span></label></div></div>
        <p class="small muted" style="margin:0">As chaves ficam guardadas cifradas e não aparecem de novo nesta tela. A Lottus usa a conta só para pagar os cedentes das operações que você aprovar, gerar o Pix das duplicatas e devolver pagamentos em duplicidade.</p>
        <div class="error-box" data-err hidden></div>
        <div class="row" style="justify-content:flex-end;gap:8px">${again ? '<button class="btn secondary" type="button" data-act="cancel">Cancelar</button>' : ''}<button class="btn" type="submit">Conectar conta</button></div>
      </form>`;

    const status = () => {
      if (!t.has_keys) return '';
      if (t.status === 'active') {
        return `<dl class="lines" style="margin:0">
            ${a.number ? `<dt>Agência · conta</dt><dd><b>${esc(a.branch || '')} · ${esc(a.number)}${a.digit ? `-${esc(a.digit)}` : ''}</b></dd>` : ''}
            <dt>Titular</dt><dd>${esc(s.funder.legal_name)}</dd>
            <dt>Saldo disponível</dt><dd><b id="trio-bal"><span class="muted">…</span></b></dd>
            <dt>Aviso de pagamento</dt><dd>${t.webhook_ok ? 'Cadastrado na Trio' : `<span style="color:var(--danger)">Não cadastrado</span>${t.webhook_error ? ` · ${esc(t.webhook_error)}` : ''}`}</dd>
            <dt>Chave</dt><dd>Client ID terminado em ${esc(t.key_hint || '—')}${t.connected_by ? ` · por ${esc(t.connected_by)}, ${dateTime(t.connected_at)}` : ''}</dd></dl>
          ${t.reason ? `<div class="note-box small">${esc(t.reason)}</div>` : ''}
          <p class="small muted" style="margin:0">Ao aprovar, o Pix ao cedente sai na hora desta conta. Cada duplicata ganha um Pix próprio, e a baixa é automática. Mantenha saldo para as aprovações.</p>`;
      }
      if (t.status === 'error') return `<div class="error-box">${esc(t.reason || 'As chaves não conectaram.')}</div>`;
      return `<p style="margin:0">${esc(t.reason || 'Conferindo as chaves com a Trio…')}</p>`;
    };

    pane.innerHTML = `
      <div class="card stack" id="trio">
        <div class="row between" style="align-items:flex-start;gap:12px;flex-wrap:wrap">
          <div><h2>Conta Trio</h2><p class="small muted" style="margin:4px 0 0">A conta do fundo de onde saem os Pix aos cedentes e onde caem os pagamentos das duplicatas.</p></div>
          <div class="row" style="gap:6px">${t.has_keys && t.env === 'sandbox' ? '<span class="tag">Testes</span>' : ''}<span class="tag ${stTone}">${esc(stLabel)}</span></div>
        </div>
        <div id="trio-status" class="stack">${status()}</div>
        <div id="trio-form">${!t.has_keys ? (adm ? keysForm(false) : '<p class="small muted" style="margin:0">Um administrador do fundo conecta a conta.</p>') : ''}</div>
        ${t.has_keys && adm ? `<div class="row" id="trio-actions" style="gap:8px;flex-wrap:wrap">
          <button class="btn secondary sm" type="button" data-act="test">Testar de novo</button>
          <button class="btn ghost sm" type="button" data-act="swap">Trocar chaves</button>
          <button class="btn ghost sm danger-text" type="button" data-act="off">Desconectar</button></div>` : ''}
      </div>`;

    if (t.status === 'active') {
      trioCall({ action: 'trio_balance' }).then((d) => {
        const el = pane.querySelector('#trio-bal');
        if (el) el.textContent = d && d.available != null ? brl(d.available) : 'Não deu para ler agora';
      }).catch(() => { const el = pane.querySelector('#trio-bal'); if (el) el.textContent = 'Não deu para ler agora'; });
    }

    const wireForm = (again) => {
      const f = pane.querySelector('#tk');
      if (!f) return;
      const err = f.querySelector('[data-err]');
      const cancel = f.querySelector('[data-act=cancel]');
      if (cancel) cancel.onclick = () => { pane.querySelector('#trio-form').innerHTML = ''; pane.querySelector('#trio-actions').hidden = false; };
      f.onsubmit = async (e) => {
        e.preventDefault();
        const p = { client_id: f.client_id.value.trim(), client_secret: f.client_secret.value.trim(), env: f.querySelector('[name=env]:checked').value };
        if (!p.client_id || !p.client_secret) { err.hidden = false; err.textContent = 'Cole o Client ID e a Secret Key.'; return; }
        const btn = f.querySelector('[type=submit]');
        btn.disabled = true; btn.textContent = 'Conectando…'; err.hidden = true;
        try {
          await rpc('partner_trio_keys', { p });
          f.client_secret.value = '';
          const r = await trioCall({ action: 'trio_refresh' }).catch(() => null);
          const st = r && r.trio && r.trio.status;
          if (st === 'active') toast('Conta Trio conectada');
          else if (st === 'error') toast('As chaves não conectaram. Veja o motivo na tela.', true);
          else toast('Chaves salvas. Conferindo a conta com a Trio.');
          B.reload();
        } catch (ex) {
          err.hidden = false; err.textContent = (ex && ex.detail) || B.message(ex);
          btn.disabled = false; btn.textContent = 'Conectar conta';
        }
      };
    };
    wireForm(false);

    const act = (k) => pane.querySelector(`#trio-actions [data-act=${k}]`);
    if (act('test')) act('test').onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'Testando…';
      try { const r = await trioCall({ action: 'trio_refresh' }); toast(r && r.trio && r.trio.status === 'active' ? 'Conta Trio conectada' : 'Veja a situação na tela', !(r && r.trio && r.trio.status === 'active')); B.reload(); }
      catch (e) { fail(e); b.disabled = false; b.textContent = 'Testar de novo'; }
    };
    if (act('swap')) act('swap').onclick = () => {
      pane.querySelector('#trio-form').innerHTML = keysForm(true);
      pane.querySelector('#trio-actions').hidden = true;
      wireForm(true);
      pane.querySelector('#tk [name=client_id]').focus();
    };
    if (act('off')) act('off').onclick = async (ev) => {
      const ok = await confirmAction({ title: 'Desconectar a Conta Trio?', confirmLabel: 'Desconectar', danger: true,
        text: 'As chaves são apagadas. Sem a conta conectada, o fundo não aprova novas operações. As duplicatas já cedidas continuam com o Pix que receberam.' });
      if (ok == null) return;
      run(ev.currentTarget, () => rpc('partner_trio_disconnect'), 'Conta Trio desconectada').then(() => B.reload()).catch(() => null);
    };
  }

  /* ---------------------------------------------------------------- equipe */
  async function team(pane, s, adm) {
    const list = s.team || [];
    const label = (m) => { const a = accessOf(m); return a === 'approver' && m.approval_limit ? `Aprovador até ${brl(m.approval_limit)}` : ACCESS[a][0]; };
    pane.innerHTML = `
      <div class="card">
        <div class="card-head"><h2>Equipe</h2>${adm ? '<button class="btn sm" id="invite">Convidar pessoa</button>' : ''}</div>
        <div class="list" style="margin-top:4px">${list.map((m, i) => `<div class="list-row member ${m.active ? '' : 'off'}">
          <div class="grow"><b>${esc(m.name)}</b>${m.id === s.me.id ? ' <span class="small muted">(você)</span>' : ''}
            <div class="small muted">${esc(m.email || '')}${m.role ? ` · ${esc(m.role)}` : ''}${!m.active ? ' · sem acesso' : !m.confirmed ? ' · convite pendente' : m.last_sign_in_at ? ` · entrou ${dateTime(m.last_sign_in_at)}` : ''}</div></div>
          <span class="tag ${m.is_admin ? 'brand' : ''}">${esc(label(m))}</span>
          ${adm ? `<div class="row" style="gap:4px">${m.active && !m.confirmed ? `<button class="btn ghost sm" data-resend="${i}">Reenviar</button>` : ''}<button class="btn ghost sm" data-edit="${i}">Editar</button></div>` : ''}
        </div>`).join('')}</div>
      </div>
      <div class="card stack" style="margin-top:16px">
        <div><h2>Alertas por e-mail</h2></div>
        ${sw('alerts', s.me.alerts, 'Receber alertas da carteira', 'Uma vez por dia, só quando há novidade: duplicata vencida sem pagamento ou sacado que piorou de nota.')}
      </div>
      ${adm ? '<div class="card" style="margin-top:16px"><h2>Histórico de alterações</h2><div id="changes" class="list" style="margin-top:8px"><div class="spinner"></div></div></div>' : ''}`;
    const al = pane.querySelector('[name=alerts]');
    al.onchange = () => run(null, () => rpc('partner_set_alerts', { p_on: al.checked }), al.checked ? 'Alertas ligados' : 'Alertas desligados').catch(() => { al.checked = !al.checked; });
    const inv = pane.querySelector('#invite');
    if (inv) inv.onclick = () => memberForm(null);
    pane.querySelectorAll('[data-edit]').forEach((x) => (x.onclick = () => memberForm(list[x.dataset.edit])));
    pane.querySelectorAll('[data-resend]').forEach((x) => (x.onclick = () => invite(x, { email: list[x.dataset.resend].email }, 'partner_resend')));
    if (adm) {
      const CH = { member_saved: 'alterou a equipe', bank_saved: 'alterou o banco', policy_saved: 'alterou a política de crédito', api_key_set: 'salvou uma chave', api_key_removed: 'removeu uma chave', webhook_rotated: 'gerou novo token do aviso', boleto_rules_saved: 'alterou as regras dos boletos', collection_rules_saved: 'alterou as regras de cobrança', trio_keys_saved: 'salvou as chaves da Conta Trio', trio_disconnected: 'desconectou a Conta Trio', trio_status: 'Conta Trio' };
      const ch = await rpc('partner_changes', { p_limit: 20 }).catch(() => []);
      pane.querySelector('#changes').innerHTML = ch.length ? ch.map((c) => `<div class="list-row"><div class="grow"><b>${esc(c.by || 'Lottus')}</b> ${esc(CH[c.action] || c.action)}
        ${c.details && c.details.email ? `<span class="muted">· ${esc(c.details.email)}</span>` : ''}${c.details && c.details.to ? `<span class="muted">· ${esc((TRIO_STEP[c.details.to] || [c.details.to])[0])}</span>` : ''}${c.details && c.details.provider ? `<span class="muted">· ${esc(((s.providers || []).find((x) => x.id === c.details.provider) || { name: c.details.provider }).name)}</span>` : ''}</div><span class="small muted">${dateTime(c.at)}</span></div>`).join('')
        : '<p class="small muted" style="margin:0">Nada por aqui ainda.</p>';
    }

    function memberForm(m) {
      const a = m ? accessOf(m) : 'approver';
      const box = modal({
        title: m ? 'Editar acesso' : 'Convidar pessoa',
        subtitle: m ? esc(m.email) : 'A pessoa recebe um e-mail para criar a senha e ativar o segundo fator.',
        body: `<form class="stack" id="mf" novalidate>
          <div class="grid-2">
            <div class="field"><label>Nome</label><input class="input" name="name" value="${esc(m ? m.name : '')}" autocomplete="off"></div>
            <div class="field"><label>E-mail</label><input class="input" name="email" type="email" value="${esc(m ? m.email : '')}" ${m ? 'readonly' : ''} autocomplete="off"></div>
            <div class="field"><label>CPF</label><input class="input" name="cpf" inputmode="numeric" value="${esc(m ? m.cpf || '' : '')}" placeholder="Só números"></div>
            <div class="field"><label>Cargo</label><input class="input" name="role" value="${esc(m ? m.role || '' : '')}" placeholder="Ex.: Diretor de crédito"></div>
          </div>
          <div class="field"><label>Acesso</label><div class="choices">${Object.entries(ACCESS).map(([k, [l, d]]) => `<label class="choice"><input type="radio" name="access" value="${k}" ${k === a ? 'checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}</div></div>
          <div class="field" id="limf"><label>Alçada: aprova operações até (R$)</label><input class="input" name="limit" inputmode="decimal" value="${m && m.approval_limit ? numIn(m.approval_limit) : ''}" placeholder="Sem limite"></div>
          ${m && m.id !== s.me.id ? sw('active', m.active, 'Com acesso', 'Desligado, a pessoa deixa de entrar no Partners.') : ''}
          <div class="error-box" id="me" hidden></div></form>`,
        foot: `<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">${m ? 'Salvar' : 'Enviar convite'}</button>`,
      });
      const mf = box.querySelector('#mf');
      const syncLim = () => { box.querySelector('#limf').hidden = mf.querySelector('[name=access]:checked').value === 'viewer'; };
      mf.querySelectorAll('[name=access]').forEach((x) => (x.onchange = syncLim)); syncLim();
      box.querySelector('[data-act=cancel]').onclick = () => closeModal();
      box.querySelector('[data-act=ok]').onclick = async (ev) => {
        const err = box.querySelector('#me');
        const p = { email: mf.email.value.trim().toLowerCase(), name: mf.name.value.trim(), cpf: mf.cpf.value.replace(/\D/g, ''), role: mf.role.value.trim(),
          access: mf.querySelector('[name=access]:checked').value, approval_limit: numOut(mf.limit.value), active: mf.active ? mf.active.checked : true };
        if (!p.name || p.cpf.length !== 11 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email)) { err.hidden = false; err.textContent = 'Confira nome, e-mail e CPF (11 números).'; return; }
        if (p.access === 'viewer') p.approval_limit = null;
        if (m) {
          ev.currentTarget.disabled = true;
          try { await rpc('partner_save_member', { p }); closeModal(); toast('Acesso salvo'); B.reload(); }
          catch (e) { fail(e); ev.currentTarget.disabled = false; }
        } else {
          await invite(ev.currentTarget, p, 'partner_invite');
        }
      };
      setTimeout(() => mf.name.focus(), 50);
    }
  }

  /** Convite pelo administrador do fundo: o e-mail sai pela Lottus */
  async function invite(btn, p, action) {
    btn.disabled = true;
    try {
      const { data, error } = await sb.functions.invoke('backoffice-access', { body: { action, ...p, redirect_to: location.origin + location.pathname } });
      let code = data && data.error;
      if (error) { try { code = (await error.context.json()).error; } catch { code = 'unavailable'; } }
      if (code) { fail(new Error(code)); return; }
      closeModal();
      if (data.sent) toast(action === 'partner_resend' ? 'Convite reenviado' : 'Convite enviado');
      else {
        modal({ title: 'O e-mail não saiu', body: `<div class="stack"><p style="margin:0">Mande este link para a pessoa por outro canal. Ele vale por 7 dias.</p>
          <div class="copy-row"><code>${esc(data.link)}</code><button class="btn ghost sm" data-copy>Copiar</button></div></div>` })
          .querySelector('[data-copy]').onclick = () => copy(data.link);
      }
      B.reload();
    } finally { btn.disabled = false; }
  }
})();
