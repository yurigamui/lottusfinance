/* Lottus Partners — configurações: Conta Trio (chaves da API), política de crédito com as regras de cobrança por nota, e equipe */
(function () {
  'use strict';
  const B = window.BO;
  const { sb, rpc, esc, brl, toast, run, copy, modal, closeModal, confirmAction, dateTime } = B;
  const { head, tabs, onTabs } = B.ui;

  const TABS = [['banco', 'Banco'], ['contabilidade', 'Contabilidade'], ['politica', 'Política de crédito'], ['modelos', 'Modelos'], ['notificacoes', 'Notificações'], ['equipe', 'Equipe']];
  const pctIn = (v) => (v == null || v === '' ? '' : (Number(v) * 100).toFixed(2).replace('.', ','));
  const pctOut = (s) => { const t = String(s || '').replace(/\./g, '').replace(',', '.').trim(); return t === '' ? null : Number(t) / 100; };
  const numIn = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
  const numOut = (s) => { const t = String(s || '').replace(/[^\d,]/g, '').replace(',', '.'); return t === '' ? null : Number(t); };
  const decIn = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));
  const decOut = (s) => { const t = String(s ?? '').trim().replace(',', '.'); return t === '' ? null : Number(t); };
  const intOut = (s) => { const t = String(s ?? '').replace(/\D/g, ''); return t === '' ? null : Number(t); };
  const sw = (name, on, label, help, disabled) => `<label class="switch-row"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="switch" aria-hidden="true"></span>
    <span><b>${label}</b>${help ? `<small>${help}</small>` : ''}</span></label>`;
  const ACCESS = { admin: ['Administrador', 'Tudo, mais a equipe e as configurações'], approver: ['Aprovador', 'Aprova e paga operações'], viewer: ['Consulta', 'Só vê'] };
  const accessOf = (m) => (m.is_admin ? 'admin' : m.can_sign ? 'approver' : 'viewer');
  const fail = (e) => toast(B.message(e), true);

  B.views.config = async (el, [raw, sub], me) => {
    const tab = TABS.some(([k]) => k === raw) ? raw : 'banco';
    const [s, fresh] = await Promise.all([rpc('partner_settings'), rpc('partner_me').catch(() => me)]);
    s.me.account = (fresh && fresh.account) || {};
    if (me && fresh && fresh.account) me.account = fresh.account;
    const adm = s.me.is_admin;
    el.innerHTML = `${head('Configurações', adm ? null : 'Só administradores do fundo alteram estas configurações.')}${tabs(TABS, tab)}<div id="pane"></div>`;
    onTabs(el, (t) => (location.hash = `#/config/${t}`));
    const pane = el.querySelector('#pane');
    if (tab === 'politica') policy(pane, s, adm);
    else if (tab === 'banco') bank(pane, s, adm);
    else if (tab === 'contabilidade') B.acct.settingsPane(pane, adm, sub).catch(fail);
    else if (tab === 'modelos') modelos(pane, adm, sub).catch(fail);
    else if (tab === 'notificacoes') B.notif.pane(pane, adm).catch(fail);
    else team(pane, s, adm);
  };


  /* -------------------------------------------------- modelos: contratos, e-mails e relatórios */
  const MSUBS = [['contratos', 'Contratos'], ['emails', 'E-mails'], ['relatorios', 'Relatórios']];
  async function modelos(pane, adm, rawSub) {
    const sub = MSUBS.some(([k]) => k === rawSub) ? rawSub : 'contratos';
    pane.innerHTML = `<div class="u-g6mb14 row">${MSUBS.map(([k, l]) => B.pill('data-msub', k, l, sub)).join('')}</div><div id="mpane"></div>`;
    pane.querySelectorAll('[data-msub]').forEach((b) => (b.onclick = () => { location.hash = `#/config/modelos/${b.dataset.msub}`; }));
    const box = pane.querySelector('#mpane');
    if (sub === 'contratos') await B.contractTemplates(box, adm);
    else await B.notif.templates(box, adm, sub === 'emails' ? 'email' : 'relatorio');
  }

  /* -------------------------------------------------- lembretes por e-mail ao sacado */
  const REM_KIND = { lembrete: 'Lembrete', vencimento: 'Vence hoje', cobranca: 'Cobrança', urgente: 'Aviso final' };
  const REM_HELP = { lembrete: 'Tom amigável: avisa que a parcela vai vencer.', vencimento: 'Avisa que a parcela vence hoje.', cobranca: 'Informa que o pagamento ainda não foi identificado.', urgente: 'Último aviso, pede contato para regularizar.' };
  const kindFor = (d) => (d < 0 ? 'lembrete' : d === 0 ? 'vencimento' : d >= 10 ? 'urgente' : 'cobranca');
  const remWhen = (d) => (d === 0 ? 'No dia do vencimento' : d < 0 ? `${-d} ${d === -1 ? 'dia' : 'dias'} antes do vencimento` : `${d} ${d === 1 ? 'dia' : 'dias'} depois do vencimento`);
  async function reminders(pane, can, plain) {
    const cfg = await rpc('partner_reminder_rules').catch(() => null);
    if (!cfg) return;
    let rules = cfg.rules.map((r) => ({ days: r.days, kind: r.kind })).sort((a, b) => a.days - b.days);
    pane.insertAdjacentHTML('beforeend', plain ? '<div class="stack" id="rem" style="margin-top:20px;padding-top:20px;border-top:1px solid var(--line)"></div>' : '<div class="u-mt16 card stack" id="rem"></div>');
    const host = pane.querySelector('#rem');
    const save = (next, msg) => run(null, () => rpc('partner_reminder_rules_save', { p: { enabled: true, rules: next.slice().sort((a, b) => a.days - b.days) } }), msg)
      .then((r) => { cfg.custom = true; rules = (r.rules || next).map((x) => ({ days: x.days, kind: x.kind })); closeModal(); draw(); }).catch(() => null);
    const form = (i) => {
      const cur = i == null ? { days: -3, kind: 'lembrete' } : rules[i];
      const when = cur.days < 0 ? 'before' : cur.days === 0 ? 'on' : 'after';
      const m = modal({ title: i == null ? 'Novo lembrete' : 'Lembrete', subtitle: 'E-mail enviado ao sacado em parcelas em aberto.',
        body: `<form class="stack" id="lf" novalidate>
          <div class="grid-2"><div class="field"><label>Quando</label><select class="input" name="when"><option value="before" ${when === 'before' ? 'selected' : ''}>Dias antes do vencimento</option><option value="on" ${when === 'on' ? 'selected' : ''}>No dia do vencimento</option><option value="after" ${when === 'after' ? 'selected' : ''}>Dias depois do vencimento</option></select></div>
            <div class="field" id="dw"><label>Quantos dias</label><input class="input" name="n" inputmode="numeric" maxlength="2" value="${Math.abs(cur.days) || 1}"></div></div>
          <div class="field"><label>Tipo de e-mail</label><select class="input" name="kind">${Object.entries(REM_KIND).map(([k, l]) => `<option value="${k}" ${cur.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select><div class="help" id="kh"></div></div>
          <div class="error-box" id="le" hidden></div></form>`,
        foot: `${i != null && can ? '<button class="btn danger ghost" data-act="del">Excluir</button>' : ''}<button class="btn secondary" data-act="cancel">${can ? 'Cancelar' : 'Fechar'}</button>${can ? '<button class="btn" data-act="ok">Salvar</button>' : ''}` });
      const f = m.querySelector('#lf');
      const sync = () => { m.querySelector('#dw').hidden = f.when.value === 'on'; m.querySelector('#kh').textContent = REM_HELP[f.kind.value]; };
      f.when.onchange = () => { sync(); if (f.when.value === 'on') f.kind.value = 'vencimento'; else f.kind.value = kindFor(f.when.value === 'before' ? -1 : Number(f.n.value) || 1); sync(); };
      f.kind.onchange = sync; sync();
      if (!can) f.querySelectorAll('input,select').forEach((x) => (x.disabled = true));
      m.querySelector('[data-act=cancel]').onclick = () => closeModal();
      const del = m.querySelector('[data-act=del]'); if (del) del.onclick = () => save(rules.filter((_, k) => k !== i), 'Lembrete excluído');
      const ok = m.querySelector('[data-act=ok]');
      if (ok) ok.onclick = () => {
        const n = Math.min(90, Math.max(1, Number(String(f.n.value).replace(/\D/g, '')) || 1));
        const days = f.when.value === 'on' ? 0 : f.when.value === 'before' ? -n : n;
        if (rules.some((r, k) => r.days === days && k !== i)) { const e = m.querySelector('#le'); e.hidden = false; e.textContent = 'Já existe um lembrete neste dia.'; return; }
        const next = rules.slice(); const item = { days, kind: f.kind.value };
        if (i == null) next.push(item); else next[i] = item;
        save(next, 'Lembrete salvo');
      };
    };
    const draw = () => {
      host.innerHTML = `<div class="u-top-wrap row between"><div><h3 class="u-m0">Lembretes de parcela ao sacado</h3><p class="u-lead small muted">Enviados automaticamente nas parcelas em aberto que não têm Pix da duplicata. ${cfg.custom ? '' : 'Hoje vale o padrão da Lottus; ao salvar, a sua lista passa a valer.'}</p></div>
        ${can ? '<button class="btn sm" data-add>Novo lembrete</button>' : ''}</div>
        ${rules.length ? `<div class="stack-sm">${rules.map((r, i) => `<div class="list-row" style="align-items:center;gap:12px"><div class="grow"><b>${esc(remWhen(r.days))}</b><div class="small muted">E-mail de ${esc(REM_KIND[r.kind].toLowerCase())} · ${esc(REM_HELP[r.kind])}</div></div>
          <button class="btn ghost sm" data-ed="${i}">${can ? 'Editar' : 'Ver'}</button></div>`).join('')}</div>` : '<p class="u-m0 small muted">Nenhum lembrete. Adicione o primeiro.</p>'}`;
      const add = host.querySelector('[data-add]'); if (add) add.onclick = () => form(null);
      host.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => form(Number(b.dataset.ed))));
    };
    draw();
  }

  B.reminders = reminders;

  /* -------------------------------------------------- política de crédito */
  function policy(pane, s, can) {
    const p = s.policy, def = p.defaults || {};
    const ro = can ? '' : 'disabled';
    const tone = (r) => (['AAA', 'AA', 'A'].includes(r) ? 'success' : ['BBB', 'BB', 'B'].includes(r) ? 'brand' : ['CCC', 'CC', 'C'].includes(r) ? 'warning' : 'danger');
    pane.innerHTML = `
      <form class="card stack" id="pf" novalidate>
        <div><h2>Cedentes</h2><p class="u-m4t small muted">A nota vem da análise da Lottus. Para cada nota, você decide se aceita, a taxa e o limite do fundo e as regras de cobrança.</p></div>
        <div class="table-wrap"><table class="pol ced">
          <thead>
            <tr><th rowspan="2">Nota</th><th rowspan="2">Aceita</th><th colspan="2" class="grp">Crédito</th><th colspan="3" class="grp">Cobrança</th></tr>
            <tr><th>Taxa</th><th>Limite por cedente (R$)</th><th>Multa (%)</th><th>Juros de mora (% a.m.)</th><th>Recompra após (dias)</th></tr>
          </thead>
          <tbody>${p.cedente.map((r) => `<tr data-ced="${esc(r.rating)}">
            <td><span class="tag ${tone(r.rating)}">${esc(r.rating)}</span></td>
            <td><label class="mini-switch"><input type="checkbox" name="acc" ${r.accepts ? 'checked' : ''} ${ro}><span aria-hidden="true"></span><span class="sr">Aceita nota ${esc(r.rating)}</span></label></td>
            <td>${B.affix(`<input class="input sm" name="rate" inputmode="decimal" value="${pctIn(r.monthly_rate)}" placeholder="${pctIn(def.monthly_rate != null ? def.monthly_rate : r.tier_rate)}" ${ro}>`, { suf: '% a.m.' })}</td>
            <td><input class="input sm" name="lim" inputmode="decimal" value="${numIn(r.limit_amount)}" placeholder="${def.limit_per_company != null ? numIn(def.limit_per_company) : 'sem limite'}" ${ro}></td>
            <td><input class="input sm xs" name="fine" inputmode="decimal" value="${decIn(r.fine_percent)}" placeholder="${decIn(Number(def.fine_percent).toFixed(2))}" ${ro}></td>
            <td><input class="input sm xs" name="int" inputmode="decimal" value="${decIn(r.interest_monthly_percent)}" placeholder="${decIn(Number(def.interest_monthly_percent).toFixed(2))}" ${ro}></td>
            <td><input class="input sm xs" name="bb" inputmode="numeric" value="${r.buyback_days ?? ''}" placeholder="${def.buyback_days}" ${ro}></td>
          </tr>`).join('')}</tbody></table></div>


        ${can ? '<div class="save-bar" style="gap:12px"><button class="btn" type="submit">Salvar política</button></div>' : ''}
      </form>`;
    const f = pane.querySelector('#pf');
    f.querySelectorAll('[data-ced] [name=rate]').forEach((inp) => {
      B.rateUnit(inp);
      const ph = inp.placeholder;
      inp.addEventListener('change', () => { const m = Number(String(ph).replace(',', '.')) / 100; inp.placeholder = inp.dataset.unit === 'aa' && m ? ((Math.pow(1 + m, 12) - 1) * 100).toFixed(2).replace('.', ',') : ph; });
    });
    f.onsubmit = (e) => {
      e.preventDefault();
      const ced = [...f.querySelectorAll('[data-ced]')].map((tr) => ({ rating: tr.dataset.ced, accepts: tr.querySelector('[name=acc]').checked,
        monthly_rate: tr.querySelector('[name=rate]').value.trim() === '' ? null : B.rateMonthly(tr.querySelector('[name=rate]')), limit_amount: numOut(tr.querySelector('[name=lim]').value),
        fine_percent: decOut(tr.querySelector('[name=fine]').value), interest_monthly_percent: decOut(tr.querySelector('[name=int]').value),
        buyback_days: intOut(tr.querySelector('[name=bb]').value) }));
      if (ced.some((r) => r.monthly_rate != null && (Number.isNaN(r.monthly_rate) || r.monthly_rate > 0.2))) return toast('Confira as taxas (até 20% a.m.).', true);
      const bad = ced.find((r) => (r.fine_percent != null && (Number.isNaN(r.fine_percent) || r.fine_percent > 2)) || (r.interest_monthly_percent != null && (Number.isNaN(r.interest_monthly_percent) || r.interest_monthly_percent > 1))
        || (r.buyback_days != null && (r.buyback_days < 1 || r.buyback_days > 90)));
      if (bad) return toast(`Nota ${bad.rating}: multa até 2%, juros até 1% a.m. e recompra entre 1 e 90 dias.`, true);
      run(f.querySelector('[type=submit]'), () => rpc('partner_save_policy', { p: { cedente: ced, reminders_on: (pane.querySelector('#rem [name=reminders_on]') || { checked: p.reminders_on !== false }).checked } }), 'Política salva').catch(() => null);
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

  /* -------------------------------------------------- outras contas bancárias (dados da conta + API) */
  const ACC_BANKS = [['001', 'Banco do Brasil'], ['033', 'Santander'], ['104', 'Caixa'], ['208', 'BTG Pactual'], ['237', 'Bradesco'], ['341', 'Itaú'], ['260', 'Nubank'], ['077', 'Inter'], ['336', 'C6 Bank'], ['756', 'Sicoob'], ['748', 'Sicredi'], ['422', 'Safra'], ['197', 'Stone']];
  const PROV_BANK = { inter: '077', itau: '341', bradesco: '237', santander: '033', btg: '208', sicoob: '756' };
  let banksLoaded = false;
  async function loadBanks() {
    if (banksLoaded) return;
    banksLoaded = true;
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3000);
      const r = await fetch('https://brasilapi.com.br/api/banks/v1', { signal: ctl.signal }); clearTimeout(t);
      if (!r.ok) return;
      const j = await r.json();
      const list = j.filter((b) => b.code != null && b.name).map((b) => [String(b.code).padStart(3, '0'), String(b.name).replace(/\s*-\s*.*$/, '').replace(/ S\.?A\.?$/i, '').trim()]);
      if (list.length > 20) { const top = new Set(ACC_BANKS.map(([c]) => c)); ACC_BANKS.splice(0, ACC_BANKS.length, ...ACC_BANKS, ...list.filter(([c]) => !top.has(c)).sort((x, y) => x[1].localeCompare(y[1], 'pt-BR'))); }
    } catch (_) { /* fica com a lista padrão */ }
  }

  async function accounts(host, adm, hook) {
    const [list0, provs] = await Promise.all([rpc('partner_bank_accounts'), rpc('partner_account_providers')]);
    const list = list0.slice();
    if (hook && hook.connected && !list.some((a) => a.provider === 'trio')) list.unshift({ id: '__trio', label: 'Conta Trio', provider: 'trio', provider_name: 'Trio', hint: { client_secret: '•' }, synthetic: true });
    host.innerHTML = `<div class="card stack"><div class="u-top-wrap row between"><div><h2>Contas do fundo</h2></div>
      ${adm ? '<button class="btn" type="button" id="addacc">Adicionar conta</button>' : ''}</div>
      ${list.length ? list.map((a, i) => `<div class="acc card"><div><div class="acc-h"><b>${esc(a.label)}</b><span class="tag">${esc(a.provider_name)}</span>${a.env === 'sandbox' ? '<span class="tag warning">Testes</span>' : ''}${Object.keys(a.hint || {}).length ? '<span class="tag success">API conectada</span>' : ''}</div>
        <div class="small muted">${[a.bank_name, a.branch && `ag. ${a.branch}`, a.account && `conta ${a.account}`, a.pix_key && `Pix ${a.pix_key}`].filter(Boolean).map(esc).join(' · ') || 'Sem dados bancários'}</div></div>
        ${adm ? `<div><button class="btn ghost sm" data-ea="${i}">Editar</button> <button class="btn ghost sm" data-da="${i}">Excluir</button></div>` : ''}</div>`).join('') : '<p class="u-m0 small muted">Nenhuma conta bancária cadastrada.</p>'}</div>`;
    const open = (a) => (a && a.synthetic ? hook.open(true) : accountForm(a, provs, () => accounts(host, adm, hook).catch(fail), hook));
    const add = host.querySelector('#addacc'); if (add) add.onclick = () => open(null);
    host.querySelectorAll('[data-ea]').forEach((b) => (b.onclick = () => open(list[b.dataset.ea])));
    host.querySelectorAll('[data-da]').forEach((b) => (b.onclick = async () => {
      const a = list[b.dataset.da];
      const ok = await confirmAction({ title: 'Excluir conta', text: `Remover <b>${esc(a.label)}</b> e apagar as credenciais guardadas?`, confirmLabel: 'Excluir', danger: true });
      if (ok == null) return;
      try {
        if (!a.synthetic) await run(b, () => rpc('partner_bank_account_delete', { p_id: a.id }), 'Conta excluída');
        if (a.provider === 'trio') { await run(b, () => rpc('partner_trio_disconnect'), 'Conta Trio desconectada'); B.reload(); return; }
        accounts(host, adm, hook).catch(fail);
      } catch (_) { /* já avisado */ }
    }));
  }

  async function accountForm(a, provs, done, hook) {
    await loadBanks();
    const pick = provs.filter((p) => p.id !== 'custom' || (a && a.provider === 'custom'));
    let prov = a ? provs.find((p) => p.id === a.provider) : null;
    const box = B.drawer({ title: a ? 'Editar conta' : 'Adicionar conta', subtitle: 'Dados da conta e credenciais da API. As credenciais ficam cifradas e não aparecem de novo.', body: '<div id="acc-body"></div>',
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Salvar conta</button>' });
    const body = box.querySelector('#acc-body'), okBtn = box.querySelector('[data-act=ok]');
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    const draw = () => {
      if (!prov) {
        okBtn.hidden = true;
        body.innerHTML = `<div class="fsec"><h3>Qual é o banco ou a integração?</h3><div class="prov-grid">${pick.map((p) => `<button type="button" class="prov" data-p="${esc(p.id)}"><b>${esc(p.name)}</b><span>${esc(p.description || '')}</span></button>`).join('')}</div></div>`;
        body.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { prov = provs.find((p) => p.id === b.dataset.p); draw(); }));
        return;
      }
      okBtn.hidden = false;
      const v = a || {}, bc = v.bank_code || PROV_BANK[prov.id] || '', known = ACC_BANKS.some(([c]) => c === bc);
      const hint = v.hint || {}, cfg = v.config || {};
      body.innerHTML = `<form id="af" novalidate>
        <div class="fsec"><h3>Conta</h3>
          <div class="field"><label>Nome da conta</label><input class="input" name="label" maxlength="60" placeholder="Ex.: Conta de recebimentos" value="${esc(v.label || '')}"></div>
          <div class="field"><label>Banco</label><select class="input" name="bank_code"><option value="">Selecione…</option>${ACC_BANKS.map(([c, n]) => `<option value="${c}" ${c === bc ? 'selected' : ''}>${c} · ${n}</option>`).join('')}${bc && !known ? `<option value="${esc(bc)}" selected>${esc(bc)} · ${esc(v.bank_name || '')}</option>` : ''}</select></div>
          <div class="grid-2"><div class="field"><label>Agência</label><input class="input" name="branch" inputmode="numeric" maxlength="5" value="${esc(v.branch || '')}"></div>
            <div class="field"><label>Conta</label><div class="row" style="gap:8px"><input class="input" name="account" inputmode="numeric" maxlength="13" aria-label="Número da conta" value="${esc(String(v.account || '').split('-')[0])}" style="flex:1"><input class="input" name="account_digit" maxlength="1" aria-label="Dígito" placeholder="Díg." value="${esc(String(v.account || '').split('-')[1] || '')}" style="width:68px;text-align:center"></div></div></div>
          <div class="grid-2"><div class="field"><label>Tipo</label><select class="input" name="account_type"><option value="">—</option><option value="checking" ${v.account_type === 'checking' ? 'selected' : ''}>Conta corrente</option><option value="payment" ${v.account_type === 'payment' ? 'selected' : ''}>Conta de pagamento</option></select></div>
            <div class="field"><label>Chave Pix (opcional)</label><input class="input" name="pix_key" maxlength="80" value="${esc(v.pix_key || '')}"></div></div></div>
        ${prov.fields.length ? `<div class="fsec"><h3>Integração · ${esc(prov.name)}</h3>
          ${prov.fields.map((fl) => fl.kind === 'text' ? `<div class="field"><label>${esc(fl.label)}</label><input class="input" data-cfg="${esc(fl.key)}" autocomplete="off" spellcheck="false" value="${esc(cfg[fl.key] || '')}"></div>`
            : fl.kind === 'pem' ? `<div class="field"><label>${esc(fl.label)}</label><textarea class="input" rows="3" data-sec="${esc(fl.key)}" spellcheck="false" placeholder="${hint[fl.key] ? 'Já carregado. Cole outro para substituir.' : '-----BEGIN …-----'}"></textarea></div>`
            : `<div class="field"><label>${esc(fl.label)}</label><input class="input" type="password" data-sec="${esc(fl.key)}" autocomplete="new-password" spellcheck="false" placeholder="${hint[fl.key] ? `${esc(hint[fl.key])} · deixe em branco para manter` : ''}"></div>`).join('')}
          ${prov.envs ? `<div class="field"><label>Ambiente</label><div class="choices"><label class="choice"><input type="radio" name="env" value="production" ${v.env !== 'sandbox' ? 'checked' : ''}><span><b>Produção</b></span></label><label class="choice"><input type="radio" name="env" value="sandbox" ${v.env === 'sandbox' ? 'checked' : ''}><span><b>Testes</b></span></label></div></div>` : ''}</div>` : ''}
        <div class="fsec"><h3>Tarifas padrão</h3><div class="u-mb8 small muted">Valor cobrado pelo banco em cada tipo de pagamento. Aparece preenchido ao pagar e pode ser alterado na hora.</div>
          <div class="grid-2">${B.FEE_TYPES.map(([k, l]) => `<div class="field"><label>${l}</label>${B.affix(`<input class="input" data-fee="${k}" data-mask="money" placeholder="0,00" inputmode="decimal" value="${(v.fees || {})[k] ? esc(B.mask.fmtMoney(v.fees[k])) : ''}">`, { pre: 'R$' })}</div>`).join('')}</div></div>
        <div class="error-box" id="af-err" hidden></div></form>`;
      B.mask.attach(body);
      B.banks.enhanceAll(body);
    };
    draw();
    okBtn.onclick = async (ev) => {
      const f = body.querySelector('#af'), err = body.querySelector('#af-err'); if (!f) return;
      const sel = f.bank_code, secrets = {}, config = {};
      f.querySelectorAll('[data-sec]').forEach((i) => { if (i.value.trim()) secrets[i.dataset.sec] = i.value.trim(); });
      f.querySelectorAll('[data-cfg]').forEach((i) => { if (i.value.trim()) config[i.dataset.cfg] = i.value.trim(); });
      const p = { id: a && a.id, label: f.label.value.trim(), provider: prov.id, bank_code: sel.value, bank_name: sel.value ? sel.options[sel.selectedIndex].textContent.split('·').slice(1).join('·').trim() : '', branch: f.branch.value.trim(), account: f.account.value.replace(/\D/g, '') + (f.account_digit.value.trim() ? '-' + f.account_digit.value.trim().toUpperCase() : ''), account_type: f.account_type.value, pix_key: f.pix_key.value.trim(), secrets, config };
      const env = f.querySelector('[name=env]:checked'); if (env) p.env = env.value;
      const fees = {}; f.querySelectorAll('[data-fee]').forEach((i) => { const n = B.mask.parse(i.value); if (n > 0) fees[i.dataset.fee] = n; });
      const saveFees = (r) => (r && r.id ? rpc('partner_bank_account_fees', { p_id: r.id, p_fees: fees }) : null);
      if (!p.label) { err.hidden = false; err.textContent = 'Dê um nome para a conta.'; return; }
      if (prov.id === 'trio') {
        const cid = (secrets.client_id || config.client_id || '').trim(), csec = (secrets.client_secret || '').trim();
        p.secrets = {}; p.config = {};
        if ((cid || csec) && !(cid && csec)) { err.hidden = false; err.textContent = 'Cole o Client ID e a Secret Key.'; return; }
        try {
          await saveFees(await run(ev.currentTarget, () => rpc('partner_bank_account_save', { p })));
          if (cid && csec) {
            await rpc('partner_trio_keys', { p: { client_id: cid, client_secret: csec, env: p.env || 'production' } });
            const r = await trioCall({ action: 'trio_refresh' }).catch(() => null); const st = r && r.trio && r.trio.status;
            toast(st === 'active' ? 'Conta Trio conectada' : st === 'error' ? 'As chaves não conectaram. Veja o motivo na tela.' : 'Conta salva. Conferindo com a Trio.', st === 'error');
          } else toast('Conta salva');
          closeModal(); B.reload();
        } catch (e) { err.hidden = false; err.textContent = (e && e.detail) || B.message(e); }
        return;
      }
      try { await saveFees(await run(ev.currentTarget, () => rpc('partner_bank_account_save', { p }), 'Conta salva')); closeModal(); done(); } catch (e) { err.hidden = false; err.textContent = B.message(e); }
    };
  }

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
        <p class="u-m0 small muted">As chaves ficam guardadas cifradas e não aparecem de novo nesta tela. A Lottus usa a conta só para pagar os cedentes das operações que você aprovar, gerar o Pix das duplicatas e devolver pagamentos em duplicidade.</p>
        <div class="error-box" data-err hidden></div>
        <div class="u-end8 row">${again ? '<button class="btn secondary" type="button" data-act="cancel">Cancelar</button>' : ''}<button class="btn" type="submit">Conectar conta</button></div>
      </form>`;

    const status = () => {
      if (!t.has_keys) return '';
      if (t.status === 'active') {
        return `<dl class="u-m0 lines">
            ${a.number ? `<dt>Agência · conta</dt><dd><b>${esc(a.branch || '')} · ${esc(a.number)}${a.digit ? `-${esc(a.digit)}` : ''}</b></dd>` : ''}
            <dt>Titular</dt><dd>${esc(s.funder.legal_name)}</dd>
            <dt>Saldo disponível</dt><dd><b id="trio-bal"><span class="muted">…</span></b></dd>
            <dt>Aviso de pagamento</dt><dd>${t.webhook_ok ? 'Cadastrado na Trio' : `<span class="u-danger">Não cadastrado</span>${t.webhook_error ? ` · ${esc(t.webhook_error)}` : ''}`}</dd>
            <dt>Chave</dt><dd>Client ID terminado em ${esc(t.key_hint || '—')}${t.connected_by ? ` · por ${esc(t.connected_by)}, ${dateTime(t.connected_at)}` : ''}</dd></dl>
          ${t.reason ? `<div class="note-box small">${esc(t.reason)}</div>` : ''}
          <p class="u-m0 small muted">Ao aprovar, o Pix ao cedente sai na hora desta conta. Cada duplicata ganha um Pix próprio, e a baixa é automática. Mantenha saldo para as aprovações.</p>`;
      }
      if (t.status === 'error') return `<div class="error-box">${esc(t.reason || 'As chaves não conectaram.')}</div>`;
      return `<p class="u-m0">${esc(t.reason || 'Conferindo as chaves com a Trio…')}</p>`;
    };

    pane.innerHTML = `${t.has_keys ? `
      <div class="card stack" id="trio">
        <div class="u-top-wrap row between">
          <div><h2>Conta Trio</h2><p class="u-m4t small muted">A conta do fundo de onde saem os Pix aos cedentes e onde caem os pagamentos das duplicatas.</p></div>
          <div class="u-g6 row">${t.has_keys && t.env === 'sandbox' ? '<span class="tag">Testes</span>' : ''}<span class="tag ${stTone}">${esc(stLabel)}</span></div>
        </div>
        <div id="trio-status" class="stack">${status()}</div>
        ${t.has_keys && adm ? `<div class="u-g8w row" id="trio-actions">
          <button class="btn secondary sm" type="button" data-act="test">Testar de novo</button>
          <button class="btn ghost sm" type="button" data-act="swap">Trocar chaves</button>
          <button class="btn ghost sm danger-text" type="button" data-act="off">Desconectar</button></div>` : ''}
      </div>` : ''}`;

    pane.insertAdjacentHTML('beforeend', '<div id="accs" class="u-mt16 stack"></div>');
    const trioDrawer = (again) => {
      const box = B.drawer({ title: again ? 'Trocar chaves da Conta Trio' : 'Conectar a Conta Trio', subtitle: 'A conta do fundo de onde saem os Pix aos cedentes e onde caem os pagamentos das duplicatas.', body: keysForm(again), foot: '' });
      wireForm(box, again);
    };
    accounts(pane.querySelector('#accs'), adm, { connected: !!t.has_keys, open: trioDrawer }).catch(fail);

    if (t.status === 'active') {
      trioCall({ action: 'trio_balance' }).then((d) => {
        const el = pane.querySelector('#trio-bal');
        if (el) el.textContent = d && d.available != null ? brl(d.available) : 'Não deu para ler agora';
      }).catch(() => { const el = pane.querySelector('#trio-bal'); if (el) el.textContent = 'Não deu para ler agora'; });
    }

    function wireForm(root, again) {
      const f = root.querySelector('#tk');
      if (!f) return;
      const err = f.querySelector('[data-err]');
      const cancel = f.querySelector('[data-act=cancel]');
      if (cancel) cancel.onclick = () => closeModal();
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
          closeModal(); B.reload();
        } catch (ex) {
          err.hidden = false; err.textContent = (ex && ex.detail) || B.message(ex);
          btn.disabled = false; btn.textContent = 'Conectar conta';
        }
      };
    }

    const act = (k) => pane.querySelector(`#trio-actions [data-act=${k}]`);
    if (act('test')) act('test').onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'Testando…';
      try { const r = await trioCall({ action: 'trio_refresh' }); toast(r && r.trio && r.trio.status === 'active' ? 'Conta Trio conectada' : 'Veja a situação na tela', !(r && r.trio && r.trio.status === 'active')); B.reload(); }
      catch (e) { fail(e); b.disabled = false; b.textContent = 'Testar de novo'; }
    };
    if (act('swap')) act('swap').onclick = () => {
      trioDrawer(true);
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
        <div class="u-mt4 list">${list.map((m, i) => `<div class="list-row member ${m.active ? '' : 'off'}">
          <div class="grow"><b>${esc(m.name)}</b>${m.id === s.me.id ? ' <span class="small muted">(você)</span>' : ''}
            <div class="small muted">${esc(m.email || '')}${!m.active ? ' · sem acesso' : !m.confirmed ? ' · convite pendente' : ''}</div></div>
          <span class="tag ${m.is_admin ? 'brand' : ''}">${esc(label(m))}</span>
          ${adm ? `<div class="row" style="gap:4px">${m.active && !m.confirmed ? `<button class="btn ghost sm" data-resend="${i}">Reenviar</button>` : ''}<button class="btn ghost sm" data-edit="${i}">Editar</button></div>` : ''}
        </div>`).join('')}</div>
      </div>
    `;
    const inv = pane.querySelector('#invite');
    if (inv) inv.onclick = () => memberForm(null);
    pane.querySelectorAll('[data-edit]').forEach((x) => (x.onclick = () => memberForm(list[x.dataset.edit])));
    pane.querySelectorAll('[data-resend]').forEach((x) => (x.onclick = () => invite(x, { email: list[x.dataset.resend].email }, 'partner_resend')));
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
      else if (!data.link) {
        modal({ title: 'O e-mail não saiu', body: '<p class="u-m0">Esta pessoa já tem conta na Lottus. Peça para ela entrar no Lottus Partners e usar <b>Esqueci minha senha</b>.</p>' });
      } else {
        modal({ title: 'O e-mail não saiu', body: `<div class="stack"><p class="u-m0">Mande este link para a pessoa por outro canal. Ele vale por 7 dias.</p>
          <div class="copy-row"><code>${esc(data.link)}</code><button class="btn ghost sm" data-copy>Copiar</button></div></div>` })
          .querySelector('[data-copy]').onclick = () => copy(data.link);
      }
      B.reload();
    } finally { btn.disabled = false; }
  }
})();
