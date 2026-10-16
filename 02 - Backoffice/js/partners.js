/* Lottus · Admin — fundos parceiros (cadastro, condições, roteamento) e fundo na operação */
(function () {
  'use strict';
  const B = window.BO;
  const { sb, rpc, esc, brl, pct, date, dateTime, cnpj, cpf, toast, run, confirmAction, modal, closeModal } = B;
  const { head, tabs, onTabs, empty, can, skipEmpty } = B.ui;
  const icon = (n) => B.icon(n);

  const KIND = { securitizadora: 'Securitizadora', fidc: 'FIDC', bancarizador: 'Bancarizador', outro: 'Outro' };
  const MODE = { manual: 'Manual', asaas: 'Asaas', http: 'API do fundo' };
  B.FUNDER_KIND = KIND;

  Object.assign(B.ACTION_LABEL, {
    funder_created: 'cadastrou um parceiro', funder_updated: 'alterou um parceiro', funder_api_key_set: 'salvou a chave da API de um parceiro',
    funder_api_key_removed: 'removeu a chave da API de um parceiro', funder_webhook_rotated: 'gerou um novo token de aviso de um parceiro',
    funder_default_set: 'mudou o parceiro padrão', funder_member_saved: 'salvou um representante de parceiro',
    funder_member_removed: 'removeu um representante de parceiro', operation_funder_set: 'escolheu o parceiro da operação',
  });

  // % a.m. digitado ("1,5") <-> fração (0.015)
  const pctIn = (v) => (v == null || v === '' ? '' : (Number(v) * 100).toFixed(2).replace('.', ','));
  const pctOut = (s) => { const t = String(s || '').replace(/\./g, '').replace(',', '.').trim(); return t === '' ? '' : String(Number(t) / 100); };
  const numIn = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));
  const numOut = (s) => String(s || '').replace(/\./g, '').replace(',', '.').trim();
  const webhookUrl = (id) => `${window.LOTTUS_CONFIG.supabaseUrl}/functions/v1/charges?webhook=${id}`;

  /* ============================================================== Fundos */
  // O que um fundo precisa para operar. Cada item leva à aba onde se resolve.
  function readiness(f) {
    const items = [
      { tab: 'cadastro', label: 'Cadastro completo', ok: !!(f.legal_name && f.cnpj && f.address), hint: 'CNPJ, razão social e endereço (entram no termo de cessão)' },
      { tab: 'condicoes', label: 'Custo do dinheiro', ok: f.funding_monthly_rate != null, hint: 'Taxa ao mês que o fundo cobra' },
      { tab: 'acesso', label: 'Quem assina o aceite', ok: !f.require_signature || (f.signers ?? (f.members || []).filter((m) => m.active && m.can_sign).length) > 0,
        hint: f.require_signature ? 'Pelo menos um representante que assina' : 'Aceite não exigido' },
      { tab: 'cobranca', label: 'Cobrança', ok: f.billing_mode === 'manual' || f.api_key_set, hint: f.billing_mode === 'manual' ? 'Boletos emitidos pelo fundo' : f.api_key_set ? `${MODE[f.billing_mode]} · chave configurada` : 'Falta a chave da API' },
    ];
    return { items, ok: items.every((i) => i.ok), missing: items.filter((i) => !i.ok) };
  }

  B.views.parceiros = async (el, [arg, tab], me) => {
    if (arg === 'novo') return createFunder(el, me);
    if (arg) return funderDetail(el, arg, tab, me);
    const list = await rpc('bo_funders');
    const admin = can(me, 'admin');
    el.innerHTML = `
      ${head('Fundos', 'Quem compra os créditos originados pela Lottus', admin ? '<a class="btn" href="#/parceiros/novo">Novo fundo</a>' : '')}
      ${list.length === 0 ? `<div class="card">${empty('Nenhum fundo cadastrado. Cadastre o primeiro para poder aprovar operações.')}</div>` : `
      <div class="fund-grid">${list.map((f) => {
        const r = readiness(f);
        return `<a class="card fund-card" href="#/parceiros/${esc(f.id)}">
          <div class="fund-top"><div class="fund-mark">${esc((f.trade_name || f.legal_name || '?').trim()[0].toUpperCase())}</div>
            <div class="grow"><b>${esc(f.trade_name || f.legal_name)}</b><div class="small muted">${esc(KIND[f.kind] || f.kind)} · ${esc(cnpj(f.cnpj))}</div></div>
            ${f.is_default ? '<span class="tag brand">Padrão</span>' : ''}</div>
          <div class="fund-stats">
            <div><span>Em carteira</span><b>${brl(f.exposure.open_gross)}</b></div>
            <div><span>Custo</span><b>${f.funding_monthly_rate != null ? pct(f.funding_monthly_rate) + ' a.m.' : '—'}</b></div>
            <div><span>Limite</span><b>${f.limit_total ? brl(f.limit_total) : 'Sem limite'}</b></div>
          </div>
          <div class="fund-foot">${!f.active ? '<span class="tag">Inativo</span>'
            : r.ok ? '<span class="tag success">Pronto para operar</span>'
            : `<span class="tag warning">Falta: ${esc(r.missing.map((m) => m.label.toLowerCase()).join(', '))}</span>`}</div>
        </a>`;
      }).join('')}</div>`}`;
  };

  // Formatação de CNPJ enquanto digita
  const maskCnpj = (input) => input.addEventListener('input', () => {
    const d = input.value.replace(/\D/g, '').slice(0, 14);
    input.value = d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  });

  /** Novo fundo: só o essencial. O resto se completa na ficha. */
  async function createFunder(el, me) {
    if (!can(me, 'admin')) { el.innerHTML = `<div class="card">${empty('Só administradores cadastram fundos.')}</div>`; return; }
    el.innerHTML = `
      <div class="page-head"><div><a class="back" href="#/parceiros">‹ Fundos</a><h1>Novo fundo</h1>
        <div class="page-sub">Digite o CNPJ: buscamos razão social e endereço na Receita.</div></div></div>
      <form class="card stack narrow" id="nf" novalidate>
        <div class="grid-2">
          <div class="field"><label for="n-cnpj">CNPJ</label><input class="input" id="n-cnpj" name="cnpj" inputmode="numeric" placeholder="00.000.000/0000-00" autocomplete="off">
            <div class="help" id="n-status"></div></div>
          <div class="field"><label for="n-kind">Tipo</label><select class="input" id="n-kind" name="kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label for="n-legal">Razão social</label><input class="input" id="n-legal" name="legal_name"></div>
        <div class="grid-2">
          <div class="field"><label for="n-trade">Nome fantasia</label><input class="input" id="n-trade" name="trade_name" placeholder="Como aparece para a equipe"></div>
          <div class="field"><label for="n-email">E-mail de operações</label><input class="input" id="n-email" name="email" type="email"></div>
        </div>
        <div class="field"><label for="n-addr">Endereço da sede</label><input class="input" id="n-addr" name="address" placeholder="Rua, número, sala, bairro, cidade - UF, CEP"></div>
        <div class="row"><button class="btn" type="submit">Cadastrar e continuar</button><a class="btn ghost" href="#/parceiros">Cancelar</a></div>
      </form>`;
    const f = el.querySelector('#nf');
    maskCnpj(f.cnpj);
    let looked = '';
    f.cnpj.addEventListener('input', async () => {
      const d = f.cnpj.value.replace(/\D/g, '');
      if (d.length !== 14 || d === looked) return;
      looked = d;
      const st = el.querySelector('#n-status');
      st.textContent = 'Buscando na Receita…';
      try {
        const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`);
        if (!r.ok) throw new Error();
        const j = await r.json();
        if (!f.legal_name.value) f.legal_name.value = j.razao_social || '';
        if (!f.trade_name.value) f.trade_name.value = j.nome_fantasia || '';
        if (!f.email.value && j.email) f.email.value = String(j.email).toLowerCase();
        if (!f.address.value) {
          const cep = String(j.cep || '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
          f.address.value = [[j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' ') + (j.numero ? `, nº ${j.numero}` : ''),
            j.complemento, j.bairro, `${j.municipio || ''}${j.uf ? ' - ' + j.uf : ''}`, cep ? `CEP ${cep}` : ''].filter((x) => x && String(x).trim()).join(', ');
        }
        if (/securitiz/i.test(j.razao_social || '')) f.kind.value = 'securitizadora';
        else if (/fundo de investimento|fidc/i.test(j.razao_social || '')) f.kind.value = 'fidc';
        st.textContent = j.descricao_situacao_cadastral && j.descricao_situacao_cadastral !== 'ATIVA' ? `Atenção: situação na Receita é ${j.descricao_situacao_cadastral}.` : 'Dados preenchidos pela Receita. Confira antes de salvar.';
      } catch { st.textContent = 'Não foi possível buscar agora. Preencha manualmente.'; }
    });
    f.cnpj.focus();
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (f.cnpj.value.replace(/\D/g, '').length !== 14 || !f.legal_name.value.trim()) return toast('Informe o CNPJ e a razão social.', true);
      const id = await run(f.querySelector('[type=submit]'), async () => {
        const nid = await rpc('bo_save_funder', { p: { kind: f.kind.value, cnpj: f.cnpj.value, legal_name: f.legal_name.value, trade_name: f.trade_name.value, email: f.email.value, require_signature: 'true', billing_mode: 'manual', active: 'true' } });
        await rpc('bo_save_funder_address', { p_id: nid, p_address: f.address.value });
        return nid;
      }, 'Fundo cadastrado').catch(() => null);
      if (id) location.hash = `#/parceiros/${id}/condicoes`;
    };
  }

  const TABS = [['cadastro', 'Cadastro'], ['condicoes', 'Condições'], ['cobranca', 'Cobrança'], ['acesso', 'Acesso'], ['operacoes', 'Operações']];

  async function funderDetail(el, id, tab, me) {
    const f = await rpc('bo_funder', { p_id: id });
    const admin = can(me, 'admin');
    const r = readiness(f);
    if (!TABS.some(([k]) => k === tab)) tab = r.ok ? 'operacoes' : r.missing[0].tab;
    const go = (t) => (location.hash = `#/parceiros/${id}/${t}`);

    el.innerHTML = `
      <div class="page-head"><div><a class="back" href="#/parceiros">‹ Fundos</a>
        <h1>${esc(f.trade_name || f.legal_name)}</h1>
        <div class="page-sub">${esc(KIND[f.kind])} · ${esc(cnpj(f.cnpj))}</div></div>
        <div class="row">
          ${f.active ? (f.is_default ? '<span class="tag brand">Fundo padrão</span>' : admin ? '<button class="btn secondary" id="default">Tornar padrão</button>' : '') : '<span class="tag">Inativo</span>'}
          ${admin ? `<button class="btn ghost" id="toggle">${f.active ? 'Desativar' : 'Ativar'}</button>` : ''}
        </div>
      </div>
      <div class="ready ${r.ok ? 'ok' : ''}">
        <div class="ready-head"><b>${r.ok ? 'Pronto para operar' : 'Para operar, falta:'}</b>
          <span class="small muted">${r.ok ? (f.is_default ? 'As novas cessões já vão para este fundo.' : 'Torne padrão para as novas cessões virem para cá.') : 'Clique em um item para resolver.'}</span></div>
        <div class="ready-steps">${r.items.map((i) => `<button class="ready-step ${i.ok ? 'done' : ''}" data-go="${i.tab}">
          <span class="ready-dot">${i.ok ? '✓' : ''}</span><span><b>${esc(i.label)}</b><small>${esc(i.hint)}</small></span></button>`).join('')}</div>
      </div>
      <div class="tabs" role="tablist" style="margin:20px 0 16px">${TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" class="${k === tab ? 'active' : ''}" aria-selected="${k === tab}">${esc(l)}${k === 'acesso' && f.members.length ? ` · ${f.members.length}` : ''}</button>`).join('')}</div>
      <div id="tab"></div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => go(b.dataset.tab)));
    el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));
    const on = (sel, fn) => { const x = el.querySelector(sel); if (x) x.onclick = () => fn(x); };
    on('#default', (b) => run(b, () => rpc('bo_set_default_funder', { p_id: id }), 'Fundo padrão definido').then(B.reload));
    on('#toggle', async (b) => {
      if (f.active) {
        const ok = await confirmAction({ title: 'Desativar o fundo', confirmLabel: 'Desativar', danger: true, text: 'Ele deixa de receber novas cessões e os representantes perdem o acesso ao portal. As operações em andamento continuam.' });
        if (ok == null) return;
      }
      run(b, () => rpc('bo_save_funder', { p: { id, active: String(!f.active) } }), f.active ? 'Fundo desativado' : 'Fundo ativado').then(B.reload);
    });

    const host = el.querySelector('#tab');
    const ro = admin ? '' : 'disabled';
    const inp = (name, label, value, extra = '', help = '') =>
      `<div class="field"><label for="f-${name}">${esc(label)}</label><input class="input" id="f-${name}" name="${name}" value="${esc(value == null ? '' : value)}" ${ro} ${extra}>${help ? `<div class="help">${help}</div>` : ''}</div>`;
    const toggle = (name, label, help, value) =>
      `<label class="switch-row"><input type="checkbox" name="${name}" ${value ? 'checked' : ''} ${ro}><span class="switch" aria-hidden="true"></span><span><b>${esc(label)}</b><small>${esc(help)}</small></span></label>`;
    const saveBar = admin ? '<div class="save-bar"><button class="btn" type="submit">Salvar</button></div>' : '';
    const bindSave = (formEl, build, after) => {
      if (!admin) return;
      formEl.onsubmit = async (e) => {
        e.preventDefault();
        const p = build(formEl);
        if (!p) return;
        try {
          await run(formEl.querySelector('[type=submit]'), async () => { await rpc('bo_save_funder', { p: { id, ...p } }); if (after) await after(formEl); }, 'Salvo');
          B.reload();
        } catch { /* já avisado */ }
      };
    };

    if (tab === 'cadastro') {
      host.innerHTML = `<form class="card stack" id="tf" novalidate>
        <div class="grid-2">
          <div class="field"><label for="f-kind">Tipo</label><select class="input" id="f-kind" name="kind" ${ro}>${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${f.kind === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
          ${inp('cnpj', 'CNPJ', cnpj(f.cnpj), 'inputmode="numeric"')}
          ${inp('legal_name', 'Razão social', f.legal_name, '', 'Exatamente como no contrato social: entra no termo de cessão.')}
          ${inp('trade_name', 'Nome fantasia', f.trade_name)}
          ${inp('email', 'E-mail de operações', f.email, 'type="email"')}
          ${inp('phone', 'Telefone', f.phone, 'inputmode="tel"')}
        </div>
        ${inp('address', 'Endereço da sede', f.address, 'placeholder="Rua, número, sala, bairro, cidade - UF, CEP"', 'Entra na qualificação da cessionária no termo de cessão.')}
        <div class="fidc-only stack" ${f.kind === 'fidc' ? '' : 'hidden'}>
          <div class="section-title">Dados do FIDC</div>
          <div class="grid-2">
            ${inp('administrator_name', 'Administrador', f.administrator_name)}
            ${inp('administrator_cnpj', 'CNPJ do administrador', f.administrator_cnpj ? cnpj(f.administrator_cnpj) : '', 'inputmode="numeric"')}
            ${inp('manager_name', 'Gestor', f.manager_name)}
            ${inp('custodian_name', 'Custodiante', f.custodian_name)}
          </div>
        </div>
        ${saveBar}</form>`;
      const tf = host.querySelector('#tf');
      maskCnpj(tf.cnpj);
      tf.kind.onchange = () => (tf.querySelector('.fidc-only').hidden = tf.kind.value !== 'fidc');
      bindSave(tf, (x) => {
        if (x.cnpj.value.replace(/\D/g, '').length !== 14 || !x.legal_name.value.trim()) { toast('Informe o CNPJ e a razão social.', true); return null; }
        const p = { kind: x.kind.value, cnpj: x.cnpj.value, legal_name: x.legal_name.value, trade_name: x.trade_name.value, email: x.email.value, phone: x.phone.value };
        if (x.kind.value === 'fidc') Object.assign(p, { administrator_name: x.administrator_name.value, administrator_cnpj: x.administrator_cnpj.value, manager_name: x.manager_name.value, custodian_name: x.custodian_name.value });
        return p;
      }, (x) => rpc('bo_save_funder_address', { p_id: id, p_address: x.address.value }));
    }

    if (tab === 'condicoes') {
      host.innerHTML = `<form class="card stack" id="tf" novalidate>
        <div class="grid-2">
          ${inp('funding_monthly_rate', 'Custo do dinheiro (% ao mês)', pctIn(f.funding_monthly_rate), 'inputmode="decimal" placeholder="1,80"', 'Usado para calcular o spread da Lottus em cada operação.')}
          ${inp('max_term_days', 'Prazo máximo das duplicatas (dias)', f.max_term_days, 'inputmode="numeric" placeholder="Sem limite"')}
        </div>
        <div class="section-title">Limites</div>
        <div class="grid-3">
          ${inp('limit_total', 'Total em carteira (R$)', numIn(f.limit_total), 'inputmode="decimal" placeholder="Sem limite"')}
          ${inp('limit_per_company', 'Por cedente (R$)', numIn(f.limit_per_company), 'inputmode="decimal" placeholder="Sem limite"')}
          ${inp('limit_per_debtor', 'Por sacado (R$)', numIn(f.limit_per_debtor), 'inputmode="decimal" placeholder="Sem limite"')}
        </div>
        <div class="section-title">Regras</div>
        <div class="stack-sm">
          ${toggle('require_signature', 'Exigir o aceite do fundo', 'A operação só é aprovada depois que um representante assina o aceite no portal.', f.require_signature)}
          ${toggle('iof_applies', 'Cobrar IOF', 'Inclui o IOF no cálculo das operações com este fundo.', f.iof_applies)}
        </div>
        <div class="field"><label for="f-payout">Como o fundo paga o cedente</label>
          <textarea class="input" id="f-payout" name="payout_notes" rows="2" ${ro} placeholder="Ex.: TED da conta do fundo no mesmo dia da aprovação">${esc(f.payout_notes || '')}</textarea></div>
        <div class="field"><label for="f-notes">Observações internas</label>
          <textarea class="input" id="f-notes" name="notes" rows="2" ${ro}>${esc(f.notes || '')}</textarea></div>
        ${saveBar}</form>`;
      bindSave(host.querySelector('#tf'), (x) => ({
        funding_monthly_rate: pctOut(x.funding_monthly_rate.value), max_term_days: x.max_term_days.value.replace(/\D/g, ''),
        limit_total: numOut(x.limit_total.value), limit_per_company: numOut(x.limit_per_company.value), limit_per_debtor: numOut(x.limit_per_debtor.value),
        require_signature: String(x.require_signature.checked), iof_applies: String(x.iof_applies.checked),
        payout_notes: x.payout_notes.value, notes: x.notes.value,
      }));
      routingCard(host, id, admin, { inp, pctIn, pctOut, numIn, numOut });
    }

    if (tab === 'cobranca') {
      const opt = (k, title, text) => `<label class="choice"><input type="radio" name="billing_mode" value="${k}" ${f.billing_mode === k ? 'checked' : ''} ${ro}>
        <span><b>${esc(title)}</b><small>${esc(text)}</small></span></label>`;
      host.innerHTML = `<form class="card stack" id="tf" novalidate>
        <div class="field"><label>Quem emite os boletos dos sacados</label>
          <div class="choices">
            ${opt('manual', 'O próprio fundo', 'O fundo emite por conta própria e a Lottus só registra a baixa.')}
            ${opt('asaas', 'Asaas', 'A Lottus emite pela conta Asaas do fundo, com baixa automática.')}
            ${opt('http', 'API do fundo', 'A Lottus emite pela API de cobrança do próprio fundo.')}
          </div></div>
        <div class="mode-auto stack" ${f.billing_mode === 'manual' ? 'hidden' : ''}>
          <div class="grid-2">
            <div class="field"><label for="f-env">Ambiente</label><select class="input" id="f-env" name="billing_env" ${ro}>
              <option value="sandbox" ${f.billing_env !== 'production' ? 'selected' : ''}>Testes</option><option value="production" ${f.billing_env === 'production' ? 'selected' : ''}>Produção</option></select></div>
            <div class="mode-http">${inp('billing_base_url', 'Endereço da API', f.billing_base_url, 'placeholder="https://api.fundo.com.br/v1"')}</div>
          </div>
          <div class="grid-2 mode-http">
            ${inp('beneficiary_name', 'Beneficiário no boleto', f.beneficiary_name, `placeholder="${esc(f.legal_name)}"`)}
            ${inp('beneficiary_document', 'CNPJ do beneficiário', f.beneficiary_document ? cnpj(f.beneficiary_document) : '', `placeholder="${esc(cnpj(f.cnpj))}"`)}
          </div>
        </div>
        <div class="grid-2">
          ${inp('fine_percent', 'Multa por atraso (%)', numIn(f.fine_percent), 'inputmode="decimal" placeholder="2"')}
          ${inp('interest_monthly_percent', 'Juros por atraso (% ao mês)', numIn(f.interest_monthly_percent), 'inputmode="decimal" placeholder="1"')}
        </div>
        ${saveBar}</form>
      <div class="mode-auto" ${f.billing_mode === 'manual' ? 'hidden' : ''}>
        <div class="card stack" style="margin-top:16px">
          <div class="card-head"><h2>Chave da API</h2>${f.api_key_set ? `<span class="tag success">Configurada · final ${esc(f.api_key_last4)}</span>` : '<span class="tag warning">Falta</span>'}</div>
          <p class="muted small" style="margin:0">Fica guardada no cofre do banco de dados. Depois de salva, ninguém consegue ver de novo.</p>
          ${admin ? `<div class="row"><input class="input grow" id="apikey" type="password" autocomplete="off" placeholder="${f.api_key_set ? 'Cole uma nova chave para trocar' : 'Cole a chave da API'}" style="max-width:440px">
            <button class="btn secondary" id="savekey" type="button">Salvar chave</button>${f.api_key_set ? '<button class="btn ghost" id="delkey" type="button">Remover</button>' : ''}</div>` : ''}
        </div>
        <div class="card stack" style="margin-top:16px">
          <h2>Aviso de pagamento</h2>
          <p class="muted small" style="margin:0">Cadastre no provedor para a baixa ser automática. No Asaas: Integrações → Webhooks, com os eventos de cobrança.</p>
          <div class="copy-row"><span>URL</span><code>${esc(webhookUrl(f.id))}</code><button class="btn ghost sm" type="button" data-copy="${esc(webhookUrl(f.id))}">Copiar</button></div>
          ${admin ? `<div class="copy-row"><span>Token</span><code>${esc(f.webhook_token)}</code><button class="btn ghost sm" type="button" data-copy="${esc(f.webhook_token)}">Copiar</button><button class="btn ghost sm" type="button" id="rotate">Gerar novo</button></div>` : ''}
        </div>
      </div>`;
      const tf = host.querySelector('#tf');
      const sync = () => {
        const m = (tf.querySelector('[name=billing_mode]:checked') || {}).value;
        host.querySelectorAll('.mode-auto').forEach((x) => (x.hidden = m === 'manual'));
        host.querySelectorAll('.mode-http').forEach((x) => (x.hidden = m !== 'http'));
      };
      tf.querySelectorAll('[name=billing_mode]').forEach((x) => (x.onchange = sync));
      sync();
      bindSave(tf, (x) => {
        const m = x.querySelector('[name=billing_mode]:checked').value;
        const p = { billing_mode: m, fine_percent: numOut(x.fine_percent.value), interest_monthly_percent: numOut(x.interest_monthly_percent.value) };
        if (m !== 'manual') p.billing_env = x.billing_env.value;
        if (m === 'http') {
          if (!x.billing_base_url.value.trim()) { toast('Informe o endereço da API do fundo.', true); return null; }
          Object.assign(p, { billing_base_url: x.billing_base_url.value, beneficiary_name: x.beneficiary_name.value, beneficiary_document: x.beneficiary_document.value });
        }
        return p;
      });
      host.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => B.copy(b.dataset.copy)));
      on('#savekey', (b) => {
        const k = el.querySelector('#apikey').value.trim();
        if (!k) return toast('Cole a chave da API.', true);
        run(b, () => rpc('bo_set_funder_api_key', { p_id: id, p_key: k }), 'Chave salva').then(B.reload);
      });
      on('#delkey', async (b) => {
        const ok = await confirmAction({ title: 'Remover a chave da API', confirmLabel: 'Remover', danger: true, text: 'Os boletos deste fundo deixam de ser emitidos automaticamente.' });
        if (ok == null) return;
        run(b, () => rpc('bo_set_funder_api_key', { p_id: id, p_key: null }), 'Chave removida').then(B.reload);
      });
      on('#rotate', async (b) => {
        const ok = await confirmAction({ title: 'Gerar novo token', confirmLabel: 'Gerar', text: 'O token antigo para de valer. Atualize no provedor logo em seguida.' });
        if (ok == null) return;
        run(b, () => rpc('bo_rotate_funder_webhook', { p_id: id }), 'Novo token gerado').then(B.reload);
      });
    }

    if (tab === 'acesso') {
      const badMail = (m) => m.last_email && ['failed', 'bounced', 'complaint', 'not_configured'].includes(m.last_email.status);
      const state = (m) => !m.active ? ['', 'Sem acesso'] : !m.last_sign_in_at && badMail(m) ? ['danger', 'E-mail não chegou'] : !m.last_sign_in_at ? ['warning', 'Convite enviado'] : !m.has_mfa ? ['warning', 'Falta o autenticador'] : ['success', 'Ativo'];
      host.innerHTML = `<div class="card">
        <div class="card-head"><div><h2>Representantes</h2><p class="muted small" style="margin:4px 0 0">Entram neste mesmo endereço, com senha e código do autenticador, e veem só as cessões deste fundo.</p></div>
          ${admin && f.active ? '<button class="btn" id="invite">Convidar representante</button>' : ''}</div>
        ${f.members.length === 0 ? `<div class="empty-cta">${icon('representantes')}<b>Ninguém com acesso ainda</b><span class="muted small">Convide quem assina o aceite das cessões pelo fundo. A pessoa recebe um e-mail para criar a senha.</span></div>`
        : `<div class="list">${f.members.map((m) => { const [tone, label] = state(m); return `<div class="list-row member">
          <div class="avatar-sm">${esc(m.name.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase())}</div>
          <div class="grow"><b>${esc(m.name)}</b>${m.can_sign ? ' <span class="tag brand">Assina</span>' : ' <span class="tag">Só consulta</span>'}
            <div class="small muted">${esc(m.email || '')}${m.role ? ' · ' + esc(m.role) : ''} · CPF ${esc(cpf(m.cpf))}</div>
            <div class="small muted">${m.last_sign_in_at ? 'Último acesso ' + dateTime(m.last_sign_in_at) : m.invited_at ? 'Convidado em ' + dateTime(m.invited_at) : ''}${!m.last_sign_in_at && m.last_email ? ` · e-mail ${B.emailTag ? B.emailTag(m.last_email.status) : ''}${m.last_email.error ? ' ' + esc(m.last_email.error) : ''}` : ''}</div></div>
          <span class="tag ${tone}">${label}</span>
          ${admin ? `<div class="row-actions">
            ${m.active ? `<button class="btn ghost sm" data-resend="${esc(m.email)}">Reenviar acesso</button>` : ''}
            <button class="btn ghost sm" data-edit-m="${esc(m.id)}">Editar</button>
            <button class="btn ghost sm" data-del-m="${esc(m.id)}">Remover</button></div>` : ''}
        </div>`; }).join('')}</div>`}
      </div>`;
      const showLink = (link, email, error) => B.showAccessLink(link, email, error);
      const callAccess = async (body) => {
        const { data, error } = await sb.functions.invoke('backoffice-access', { body: { ...body, redirect_to: location.origin + location.pathname } });
        if (error) { let c = 'unavailable'; try { c = (await error.context.json()).error || c; } catch { /* sem corpo */ } throw new Error(c); }
        return data;
      };
      const memberForm = (m) => {
        const mel = modal({
          title: m ? 'Editar representante' : 'Convidar representante',
          subtitle: m ? '' : `A pessoa recebe um e-mail para criar a senha do portal de ${esc(f.trade_name || f.legal_name)}.`,
          body: `<form class="stack" id="mf" novalidate>
            <div class="field"><label for="m-name">Nome completo</label><input class="input" id="m-name" name="name" value="${esc(m ? m.name : '')}" autocomplete="off"></div>
            <div class="field"><label for="m-email">E-mail</label><input class="input" id="m-email" name="email" type="email" value="${esc(m ? m.email : '')}" ${m ? 'readonly' : ''} autocomplete="off">
              ${m ? '' : '<div class="help">Use um e-mail que não seja de cliente do app Lottus.</div>'}</div>
            <div class="grid-2"><div class="field"><label for="m-cpf">CPF</label><input class="input" id="m-cpf" name="cpf" inputmode="numeric" value="${esc(m ? cpf(m.cpf) : '')}"></div>
              <div class="field"><label for="m-role">Cargo</label><input class="input" id="m-role" name="role" value="${esc(m ? m.role || '' : '')}" placeholder="Diretor, procurador…"></div></div>
            ${toggle('can_sign', 'Pode assinar o aceite das cessões', 'Sem isso, a pessoa só consulta.', !m || m.can_sign)}
            ${m ? toggle('active', 'Acesso ativo', 'Desligue para bloquear a entrada no portal.', m.active) : ''}
          </form>`,
          foot: `<button class="btn secondary" data-close-btn>Cancelar</button><button class="btn" id="msave">${m ? 'Salvar' : 'Enviar convite'}</button>`,
        });
        const mf = mel.querySelector('#mf');
        mf.cpf.addEventListener('input', () => { const d = mf.cpf.value.replace(/\D/g, '').slice(0, 11); mf.cpf.value = d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2'); });
        mel.querySelector('[data-close-btn]').onclick = closeModal;
        mel.querySelector('#msave').onclick = async (ev) => {
          if (!mf.name.value.trim() || mf.cpf.value.replace(/\D/g, '').length !== 11 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mf.email.value.trim())) return toast('Preencha nome, e-mail e CPF.', true);
          if (m) {
            const ok = await run(ev.target, () => rpc('bo_save_funder_member', { p_funder: id, p_email: mf.email.value, p_name: mf.name.value, p_cpf: mf.cpf.value, p_role: mf.role.value, p_can_sign: mf.can_sign.checked, p_active: mf.active.checked }), 'Representante salvo').then(() => true, () => false);
            if (ok) { closeModal(); B.reload(); }
            return;
          }
          const out = await run(ev.target, () => callAccess({ action: 'invite_partner', funder_id: id, email: mf.email.value, name: mf.name.value, cpf: mf.cpf.value, role: mf.role.value, can_sign: mf.can_sign.checked }), null).catch(() => null);
          if (!out) return;
          closeModal();
          if (out.sent) { toast(`Convite enviado para ${mf.email.value.trim()}`); B.reload(); } else showLink(out.link, mf.email.value.trim(), out.error);
        };
      };
      on('#invite', () => memberForm(null));
      host.querySelectorAll('[data-edit-m]').forEach((b) => (b.onclick = () => memberForm(f.members.find((m) => m.id === b.dataset.editM))));
      host.querySelectorAll('[data-resend]').forEach((b) => (b.onclick = async () => {
        const out = await run(b, () => callAccess({ action: 'resend', email: b.dataset.resend }), null).catch(() => null);
        if (!out) return;
        if (out.sent) toast(`Novo link enviado para ${b.dataset.resend}`); else showLink(out.link, b.dataset.resend, out.error);
      }));
      host.querySelectorAll('[data-del-m]').forEach((b) => (b.onclick = async () => {
        const ok = await confirmAction({ title: 'Remover representante', confirmLabel: 'Remover', danger: true, text: 'A pessoa perde o acesso ao portal deste fundo. As assinaturas já feitas continuam válidas.' });
        if (ok == null) return;
        run(b, () => rpc('bo_remove_funder_member', { p_id: b.dataset.delM }), 'Representante removido').then(B.reload);
      }));
    }

    if (tab === 'operacoes') {
      const e = f.exposure || {};
      host.innerHTML = `<div class="stat-row">
          <div class="card stat"><span>Em carteira</span><b>${brl(e.open_gross)}</b><small>${esc(e.operations || 0)} operação(ões) em aberto</small></div>
          <div class="card stat"><span>Limite total</span><b>${f.limit_total ? brl(f.limit_total) : 'Sem limite'}</b><small>${f.limit_total ? Math.round(((e.open_gross || 0) / f.limit_total) * 100) + '% usado' : '&nbsp;'}</small></div>
          <div class="card stat"><span>Custo</span><b>${f.funding_monthly_rate != null ? pct(f.funding_monthly_rate) + ' a.m.' : '—'}</b><small>&nbsp;</small></div>
        </div>
        <div class="card" style="margin-top:16px"><h2>Operações recentes</h2>
        ${f.recent.length === 0 ? '<p class="muted">Nenhuma operação ainda.</p>' : `<div class="list">${f.recent.map((o) => `<a class="list-row" href="#/operacoes/${esc(o.id)}">
          <div class="grow"><b>${esc(o.legal_name)}</b><div class="small muted">${dateTime(o.created_at)}</div></div>
          ${B.tag('op', o.status)} ${o.signed ? '<span class="tag success">Aceite</span>' : ''}<div class="num"><b>${brl(o.gross)}</b></div></a>`).join('')}</div>`}
      </div>`;
    }
  }

  /* ==================================================== Parceiro na operação */
  async function issueCharges(opId, quiet) {
    const { data, error } = await sb.functions.invoke('charges', { body: { action: 'issue', operation_id: opId } });
    if (error) {
      let code = 'unavailable';
      try { code = (await error.context.json()).error || code; } catch { /* sem corpo */ }
      const msg = {
        billing_manual: 'Este parceiro está com cobrança manual.', billing_not_configured: 'Falta a chave da API do parceiro.',
        funder_required: 'Escolha o parceiro da operação.', invalid_status: 'Os boletos saem depois da aprovação.',
      }[code] || B.message(code);
      if (!quiet || !['billing_manual', 'billing_not_configured'].includes(code)) toast(msg, true);
      return null;
    }
    const r = data.results || [];
    const ok = r.filter((x) => x.ok).length;
    toast(ok === r.length ? `${ok} boleto(s) registrados no parceiro` : `${ok} de ${r.length} boletos registrados. Veja os erros no card do parceiro.`, ok !== r.length);
    return r;
  }
  B.issueCharges = issueCharges;

  /** Card do parceiro no detalhe da operação. */
  B.funderCard = async (host, o, me) => {
    let d;
    try { d = await rpc('bo_operation_funder', { p_id: o.id }); } catch (e) { host.innerHTML = ''; return; }
    if (!d.has_funders && !d.funder) {
      host.innerHTML = `<div class="card rail-card"><h3>Parceiro</h3><p class="muted small">Nenhum parceiro cadastrado.</p>
        ${can(me, 'admin') ? '<a class="btn secondary sm block" href="#/parceiros/novo">Cadastrar parceiro</a>' : ''}</div>`;
      return;
    }
    const f = d.funder;
    const editable = can(me, 'approver') && ['requested', 'in_review'].includes(o.status);
    const charges = d.charges || [];
    const regs = charges.filter((c) => c.digitable_line).length;
    const errs = charges.filter((c) => c.error);
    const ev = d.evidence[d.evidence.length - 1];
    host.innerHTML = `<div class="card rail-card">
      <h3>Parceiro</h3>
      ${f ? `<div><b>${esc(f.legal_name)}</b><div class="small muted">${esc(KIND[f.kind])} · ${esc(cnpj(f.cnpj))}</div></div>
        ${f.fit && !f.fit.ok ? `<div class="note-box">${f.fit.issues.map(esc).join('<br>')}</div>` : ''}
        <dl class="lines">
          ${f.funding_monthly_rate != null ? `<dt>Custo do parceiro</dt><dd>${pct(f.funding_monthly_rate)} a.m.</dd>` : ''}
          ${f.fit && f.fit.spread_monthly != null ? `<dt>Spread Lottus</dt><dd>${pct(f.fit.spread_monthly)} a.m.</dd>` : ''}
          <dt>Aceite</dt><dd>${d.signed_at ? `<span class="tag success">Assinado</span>` : d.declined_at ? '<span class="tag danger">Recusado</span>' : f.require_signature ? '<span class="tag warning">Aguardando</span>' : 'Não exigido'}</dd>
          <dt>Cobrança</dt><dd>${esc(MODE[f.billing_mode])}${f.billing_mode !== 'manual' && !f.billing_ready ? ' · sem chave' : ''}</dd>
          ${charges.length ? `<dt>Boletos</dt><dd>${regs} de ${o._items} registrados</dd>` : ''}
        </dl>
        ${d.signed_at ? `<div class="small muted">Por ${esc(d.signed_by || ev?.signer_name || '')} em ${dateTime(d.signed_at)}</div>` : ''}
        ${d.declined_at ? `<div class="note-box">${esc(d.decline_note || '')}</div>` : ''}
        ${errs.length ? `<div class="note-box">${errs.map((c) => esc(c.error)).join('<br>')}</div>` : ''}
        ${ev ? '<button class="btn ghost sm block" id="f-ev">Ver evidência do aceite</button>' : ''}`
      : '<p class="muted small">Nenhum parceiro escolhido.</p>'}
      ${editable ? `<div class="field"><label>Trocar parceiro</label><select class="input" id="f-sel">
          <option value="">Escolha…</option>
          ${d.options.map((x) => `<option value="${esc(x.id)}" ${f && f.id === x.id ? 'selected' : ''}>${esc(x.legal_name)}${x.funding_monthly_rate != null ? ' · ' + pct(x.funding_monthly_rate) : ''}${x.fit.ok ? '' : ' · não cabe'}</option>`).join('')}
        </select></div><button class="btn secondary sm block" id="f-set">Usar este parceiro</button>` : ''}
      ${f && f.billing_ready && ['approved', 'paid'].includes(o.status) && can(me, 'approver') ? `<button class="btn sm block" id="f-issue">${regs ? 'Emitir boletos que faltam' : 'Emitir boletos'}</button>` : ''}
    </div>`;
    const set = host.querySelector('#f-set');
    if (set) set.onclick = async () => {
      const v = host.querySelector('#f-sel').value;
      if (!v) return toast('Escolha um parceiro.', true);
      if (f && f.id === v) return;
      if (d.signed_at) {
        const ok = await confirmAction({ title: 'Trocar o parceiro', confirmLabel: 'Trocar', danger: true, text: 'O aceite já assinado deixa de valer e o novo parceiro precisa assinar.' });
        if (ok == null) return;
      }
      run(set, () => rpc('bo_set_operation_funder', { p_id: o.id, p_funder: v }), 'Parceiro escolhido').then(B.reload);
    };
    const iss = host.querySelector('#f-issue');
    if (iss) iss.onclick = async () => { iss.disabled = true; await issueCharges(o.id); iss.disabled = false; B.reload(); };
    const evb = host.querySelector('#f-ev');
    if (evb) evb.onclick = () => {
      const s = ev.summary || {};
      modal({
        title: 'Aceite da cessionária', wide: true,
        body: `<dl class="kv">
          <dt>Signatário</dt><dd>${esc(ev.signer_name)} · CPF ${esc(cpf(ev.signer_cpf))}</dd>
          <dt>Quando</dt><dd>${dateTime(ev.signed_at)}</dd>
          <dt>IP</dt><dd>${esc(ev.ip || '—')}${s.country ? ' · ' + esc(s.country) : ''}</dd>
          ${s.device ? `<dt>Aparelho</dt><dd>${esc(s.device)}</dd>` : ''}
          ${s.statement ? `<dt>Declaração</dt><dd>${esc(s.statement)}</dd>` : ''}
          <dt>Hash do documento</dt><dd class="mono">${esc(ev.document_hash)}</dd>
          <dt>Hash do registro</dt><dd class="mono">${esc(ev.record_hash)}</dd></dl>`,
      });
    };
    B._funderReady = !!(f && f.billing_ready);
    payoutInfo(host.querySelector('.rail-card'), o, me);
  };

  /** Por que este parceiro (roteamento) e o pagamento ao cedente */
  async function payoutInfo(card, o, me) {
    if (!card) return;
    const x = await rpc('bo_operation_payout', { p_id: o.id }).catch(() => null);
    if (!x) return;
    const r = x.routing, p = x.payout;
    const box = document.createElement('div');
    box.className = 'stack-sm';
    let html = '';
    if (r && Array.isArray(r.offers) && r.offers.length) {
      html += `<details><summary class="small"><b>Por que este parceiro</b>${r.fallback ? ' · nenhum aceitou, ficou com o padrão' : ''}</summary>
        <div class="stack-sm" style="margin-top:8px">${r.offers.slice().sort((a, b) => (b.ok - a.ok) || (a.base_rate - b.base_rate)).map((f) => `<div class="small">
          <b>${esc(f.name)}</b> · ${f.base_rate != null ? pct(f.base_rate) + ' a.m.' : '—'} ${f.funder_id === r.funder_id ? '<span class="tag success">escolhido</span>' : f.ok ? '' : '<span class="tag">fora</span>'}
          ${f.issues && f.issues.length ? `<div class="muted">${f.issues.map(esc).join(' · ')}</div>` : ''}</div>`).join('')}</div></details>`;
    }
    const auto = x.payout_mode && x.payout_mode !== 'manual';
    if (p || (auto && ['approved', 'paid'].includes(o.status))) {
      const [l, t] = p ? PAYOUT[p.status] || [p.status, ''] : ['Não enviado', 'warning'];
      html += `<dl class="lines"><dt>Pagamento ao cedente</dt><dd><span class="tag ${t}">${esc(l)}</span></dd>
        ${p ? `<dt>Via</dt><dd>${esc({ asaas: 'Asaas do parceiro', http: 'API do parceiro', manual: 'Registro manual' }[p.provider] || p.provider)}</dd>` : ''}
        ${p && p.amount ? `<dt>Valor</dt><dd>${brl(p.amount)}</dd>` : ''}</dl>
        ${p && p.error ? `<div class="note-box">${esc(p.error)}</div>` : ''}
        ${p && p.receipt_url ? `<a class="btn ghost sm block" href="${esc(p.receipt_url)}" target="_blank" rel="noopener">Comprovante do pagamento</a>` : ''}
        ${auto && o.status === 'approved' && (!p || p.status === 'failed') && can(me, 'approver') ? `<button class="btn sm block" id="po-run">${p ? 'Tentar pagar de novo' : 'Pagar pela API do parceiro'}</button>` : ''}`;
    }
    if (!html) return;
    box.innerHTML = html;
    card.appendChild(box);
    const b = box.querySelector('#po-run');
    if (b) b.onclick = () => run(b, async () => {
      const { data, error } = await sb.functions.invoke('charges', { body: { action: 'payout', operation_id: o.id } });
      if (error || (data && data.error)) throw new Error((data && data.error) || error.message);
      return data;
    }, 'Pagamento enviado').then(B.reload);
  }

  /** Roteamento (taxa e política) e pagamento ao cedente pela API */
  async function routingCard(host, id, admin, h) {
    const r = await rpc('bo_funder_routing', { p_id: id }).catch(() => null);
    if (!r) return;
    const ro = admin ? '' : 'disabled';
    const tiers = B.CREDIT_TIERS || ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'DDD', 'DD', 'D'];
    const base = r.funding_monthly_rate != null ? Number(r.funding_monthly_rate) + Number(r.lottus_spread || 0) : null;
    const card = document.createElement('form');
    card.className = 'card stack'; card.style.marginTop = '16px'; card.noValidate = true;
    card.innerHTML = `<div><h2>Roteamento e pagamento</h2>
        <p class="small muted" style="margin:4px 0 0">Cada pedido vai para o parceiro elegível com a menor taxa. Taxa-base deste parceiro = custo do dinheiro + remuneração da Lottus${base != null ? ` = <b>${pct(base)} a.m.</b>` : ''} (nunca abaixo da taxa de risco do cedente).</p></div>
      <label class="switch-row"><input type="checkbox" name="routing" ${r.routing ? 'checked' : ''} ${ro}><span class="switch" aria-hidden="true"></span>
        <span><b>Recebe operações pelo roteamento</b><small>Desligado, o parceiro só recebe operações enviadas pela equipe.</small></span></label>
      <div class="grid-3">
        ${h.inp('lottus_spread', 'Remuneração da Lottus (% ao mês)', h.pctIn(r.lottus_spread), 'inputmode="decimal" placeholder="0,80"')}
        ${h.inp('min_ticket', 'Operação mínima (R$)', h.numIn(r.min_ticket), 'inputmode="decimal" placeholder="Sem mínimo"')}
        ${h.inp('max_ticket', 'Operação máxima (R$)', h.numIn(r.max_ticket), 'inputmode="decimal" placeholder="Sem máximo"')}
      </div>
      <div class="grid-3">
        <div class="field"><label>Rating mínimo do cedente</label><select class="input" name="min_cedente_tier" ${ro}><option value="">Qualquer</option>${tiers.map((t) => `<option ${r.min_cedente_tier === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field"><label>Pagamento ao cedente</label><select class="input" name="payout_mode" ${ro}>
          <option value="manual" ${r.payout_mode === 'manual' ? 'selected' : ''}>O fundo paga e registra no Partners</option>
          <option value="asaas" ${r.payout_mode === 'asaas' ? 'selected' : ''}>Automático pela conta Asaas do fundo</option>
          <option value="http" ${r.payout_mode === 'http' ? 'selected' : ''}>Automático pela API do fundo</option></select></div>
        <div class="field"><label>Forma</label><select class="input" name="payout_operation" ${ro}>
          <option ${r.payout_operation === 'PIX' ? 'selected' : ''}>PIX</option><option ${r.payout_operation === 'TED' ? 'selected' : ''}>TED</option></select></div>
      </div>
      <p class="small muted" style="margin:0">O pagamento automático usa a mesma chave de API e o mesmo webhook da aba Cobrança.</p>
      ${admin ? '<div class="save-bar" style="gap:12px"><span class="small muted">Vale para os próximos pedidos.</span><button class="btn" type="submit">Salvar</button></div>' : ''}`;
    host.appendChild(card);
    card.onsubmit = (e) => {
      e.preventDefault();
      run(card.querySelector('[type=submit]'), () => rpc('bo_save_funder_routing', { p_id: id, p: {
        routing: card.routing.checked, lottus_spread: h.pctOut(card.lottus_spread.value), min_ticket: h.numOut(card.min_ticket.value),
        max_ticket: h.numOut(card.max_ticket.value), min_cedente_tier: card.min_cedente_tier.value,
        payout_mode: card.payout_mode.value, payout_operation: card.payout_operation.value } }), 'Roteamento salvo').then(B.reload);
    };
  }
})();
