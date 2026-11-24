/* Lottus Partners — configurações: Conta Lottus e regras dos boletos, política de crédito e equipe */
(function () {
  'use strict';
  const B = window.BO;
  const { sb, rpc, esc, brl, pct, toast, run, copy, modal, closeModal, confirmAction, dateTime } = B;
  const { head, tabs, onTabs } = B.ui;

  const TABS = [['banco', 'Conta Lottus'], ['politica', 'Política de crédito'], ['equipe', 'Equipe']];
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
    el.innerHTML = `${head('Configurações', adm ? null : 'Só administradores do fundo alteram estas configurações.', tabs(TABS.map(([k, l]) => [k, k === 'banco' && !(s.trio && s.trio.required) ? 'Banco' : l]), tab))}<div id="pane"></div>`;
    onTabs(el, (t) => (location.hash = `#/config/${t}`));
    const pane = el.querySelector('#pane');
    if (tab === 'politica') policy(pane, s, adm);
    else if (tab === 'banco') bank(pane, s, adm);
    else team(pane, s, adm);
  };

  /* -------------------------------------------------- política de crédito */
  function policy(pane, s, can) {
    const p = s.policy, def = p.defaults || {};
    const ro = can ? '' : 'disabled';
    pane.innerHTML = `
      <form class="card stack" id="pf" novalidate>
        <div><h2>Cedentes</h2><p class="small muted" style="margin:4px 0 0">A nota vem da análise da Lottus. Para cada nota, você decide se aceita, a taxa do fundo e o limite por cedente. Em branco vale o padrão do fundo${def.monthly_rate != null ? ` (${pct(def.monthly_rate)} a.m.)` : ''}.</p></div>
        <div class="table-wrap"><table class="pol">
          <thead><tr><th>Nota</th><th>Aceita</th><th>Taxa do fundo (% a.m.)</th><th>Limite por cedente (R$)</th></tr></thead>
          <tbody>${p.cedente.map((r) => `<tr data-ced="${esc(r.rating)}">
            <td><span class="tag ${['AAA', 'AA', 'A'].includes(r.rating) ? 'success' : ['BBB', 'BB', 'B'].includes(r.rating) ? 'brand' : ['CCC', 'CC', 'C'].includes(r.rating) ? 'warning' : 'danger'}">${esc(r.rating)}</span></td>
            <td><label class="mini-switch"><input type="checkbox" name="acc" ${r.accepts ? 'checked' : ''} ${ro}><span aria-hidden="true"></span><span class="sr">Aceita nota ${esc(r.rating)}</span></label></td>
            <td><input class="input sm" name="rate" inputmode="decimal" value="${pctIn(r.monthly_rate)}" placeholder="padrão" ${ro}></td>
            <td><input class="input sm" name="lim" inputmode="decimal" value="${numIn(r.limit_amount)}" placeholder="${def.limit_per_company != null ? 'padrão' : 'sem limite'}" ${ro}></td>
          </tr>`).join('')}</tbody></table></div>

        <div style="margin-top:8px"><h2>Sacados</h2><p class="small muted" style="margin:4px 0 0">Nota de risco do sacado, também da Lottus. Você decide se aceita e o limite por sacado.</p></div>
        <div class="table-wrap"><table class="pol">
          <thead><tr><th>Nota</th><th>Aceita</th><th>Limite por sacado (R$)</th><th></th></tr></thead>
          <tbody>${p.sacado.map((r) => `<tr data-sac="${esc(r.rating)}">
            <td><span class="tag ${['A', 'B'].includes(r.rating) ? 'success' : r.rating === 'C' ? 'warning' : 'danger'}">${esc(r.rating)}</span></td>
            <td><label class="mini-switch"><input type="checkbox" name="acc" ${r.accepts ? 'checked' : ''} ${ro}><span aria-hidden="true"></span><span class="sr">Aceita nota ${esc(r.rating)}</span></label></td>
            <td><input class="input sm" name="lim" inputmode="decimal" value="${numIn(r.limit_amount)}" placeholder="${def.limit_per_debtor != null ? 'padrão' : 'sem limite'}" ${ro}></td><td></td>
          </tr>`).join('')}</tbody></table></div>
        ${can ? '<div class="save-bar" style="gap:12px"><span class="small muted">Vale para os próximos pedidos.</span><button class="btn" type="submit">Salvar política</button></div>' : ''}
      </form>`;
    const f = pane.querySelector('#pf');
    f.onsubmit = (e) => {
      e.preventDefault();
      const ced = [...f.querySelectorAll('[data-ced]')].map((tr) => ({ rating: tr.dataset.ced, accepts: tr.querySelector('[name=acc]').checked,
        monthly_rate: pctOut(tr.querySelector('[name=rate]').value), limit_amount: numOut(tr.querySelector('[name=lim]').value) }));
      const sac = [...f.querySelectorAll('[data-sac]')].map((tr) => ({ rating: tr.dataset.sac, accepts: tr.querySelector('[name=acc]').checked,
        limit_amount: numOut(tr.querySelector('[name=lim]').value) }));
      if (ced.some((r) => r.monthly_rate != null && (Number.isNaN(r.monthly_rate) || r.monthly_rate > 0.2))) return toast('Confira as taxas (até 20% a.m.).', true);
      run(f.querySelector('[type=submit]'), () => rpc('partner_save_policy', { p: { cedente: ced, sacado: sac } }), 'Política salva').catch(() => null);
    };
  }

  /* ------------------------------------------------- Conta Lottus do fundo */
  const ACC_STEP = {
    none: ['Ainda não aberta', ''], opening: ['Abrindo', 'brand'], linking: ['Abrindo', 'brand'], in_validation: ['Em análise', 'warning'], in_review: ['Em análise', 'warning'],
    approved: ['Aprovada', 'brand'], rejected: ['Não aprovada', 'danger'], active: ['Ativa', 'success'], error: ['Em revisão pela Lottus', 'warning'],
  };
  const TRIO_STEP = ACC_STEP; // rótulos do histórico
  const CONSENT_TEXT = 'Declaro que represento o fundo e autorizo a Lottus a abrir a Conta Lottus em nome do fundo e a usá-la para pagar os cedentes e emitir os boletos das operações que aprovarmos no Partners. A Conta Lottus é uma conta de pagamento mantida na Trio, instituição de pagamento autorizada pelo Banco Central e parceira da Lottus. Ficam registrados meu nome, CPF, IP e o horário.';
  async function trioCall(body) {
    const { data, error } = await sb.functions.invoke('charges', { body });
    if (error) {
      let j = {}; try { j = await error.context.json(); } catch { /* sem corpo */ }
      const e = new Error(j.error || 'unavailable'); e.detail = j.detail || null; throw e;
    }
    if (data && data.error) { const e = new Error(data.error); e.detail = data.detail || null; throw e; }
    return data;
  }

  /** Campos do consentimento (no painel e na janela que abre ao entrar) */
  const consentFields = (acc) => `
    ${acc.ask_business ? `<div class="grid-2">
      <div class="field"><label>Faturamento anual do fundo (R$)</label><input class="input" name="annual" inputmode="decimal" placeholder="Ex.: 12.000.000"></div>
      <div class="field"><label>Valor médio por operação (R$)</label><input class="input" name="ticket" inputmode="decimal" placeholder="Ex.: 50.000"></div></div>` : ''}
    ${acc.ask_phone ? '<div class="field" style="max-width:280px"><label>Seu celular, com DDD</label><input class="input" name="phone" inputmode="tel" placeholder="(11) 98765-4321" autocomplete="tel"><div class="help">Para a prova de vida, que você recebe por e-mail.</div></div>' : ''}
    <label class="check-row"><input type="checkbox" name="accept"><span class="small">${CONSENT_TEXT}</span></label>
    <div class="error-box" data-err hidden></div>`;
  async function sendConsent(form, acc, btn) {
    const err = form.querySelector('[data-err]');
    const p = { accept: form.accept.checked };
    if (acc.ask_phone) p.phone = form.phone.value.trim();
    if (acc.ask_business) { p.annual_revenue = numOut(form.annual.value); p.average_ticket = numOut(form.ticket.value); }
    const bad = acc.ask_business && (!p.annual_revenue || !p.average_ticket) ? 'Informe o faturamento anual e o valor médio por operação.'
      : acc.ask_phone && String(p.phone).replace(/\D/g, '').length < 10 ? 'Informe seu celular com DDD.'
      : !p.accept ? 'Marque a autorização para abrir a conta.' : '';
    if (bad) { err.hidden = false; err.textContent = bad; return false; }
    err.hidden = true; btn.disabled = true;
    try { await rpc('partner_account_consent', { p }); return true; }
    catch (e) { err.hidden = false; err.textContent = B.message(e); btn.disabled = false; return false; }
  }

  /** Ao entrar: o administrador autoriza a abertura (uma vez) e a conta abre sozinha */
  B.askAccountConsent = (me) => {
    const acc = me.account || {};
    if (!acc.ask_consent) return;
    try { if (sessionStorage.getItem('lottus-consent-later')) return; } catch { /* sem armazenamento */ }
    const box = modal({
      title: 'Conta Lottus do fundo',
      subtitle: 'O Pix aos cedentes e os boletos das duplicatas saem da Conta Lottus do fundo. Abrimos a conta para você.',
      body: `<form class="stack" id="cf" novalidate>${consentFields(acc)}</form>`,
      foot: '<button class="btn secondary" data-act="later">Agora não</button><button class="btn" data-act="ok">Abrir a Conta Lottus</button>',
    });
    box.querySelector('[data-act=later]').onclick = () => { try { sessionStorage.setItem('lottus-consent-later', '1'); } catch { /* ok */ } closeModal(); };
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      if (await sendConsent(box.querySelector('#cf'), acc, ev.currentTarget)) { acc.ask_consent = false; closeModal(); toast('Abrindo a Conta Lottus'); B.reload(); }
    };
  };

  /** Modo manual: o fundo paga pelo próprio banco e envia o boleto de cada duplicata */
  function manualBank(pane, s, adm) {
    const ro = adm ? '' : 'disabled';
    const a = s.account || {};
    pane.innerHTML = `
      <div class="stack">
        <form class="card stack" id="acct" novalidate>
          <div><h2>Conta do fundo</h2><p class="small muted" style="margin:4px 0 0">A chave Pix e a cidade vão nas cobranças Pix das duplicatas, enviadas aos sacados quando o fundo registra o pagamento ao cedente.</p></div>
          <div class="grid-3">
            <div class="field"><label>Banco (código)</label><input class="input" name="bank_code" value="${esc(a.bank_code || '')}" inputmode="numeric" placeholder="341" ${ro}></div>
            <div class="field"><label>Nome do banco</label><input class="input" name="bank_name" value="${esc(a.bank_name || '')}" ${ro}></div>
            <div class="field"><label>Chave Pix</label><input class="input" name="pix_key" value="${esc(a.pix_key || '')}" ${ro}></div>
            <div class="field"><label>Agência</label><input class="input" name="branch" value="${esc(a.branch || '')}" ${ro}></div>
            <div class="field"><label>Conta</label><input class="input" name="account" value="${esc(a.account || '')}" ${ro}></div>
            <div class="field"><label>Cidade (vai no Pix)</label><input class="input" name="pix_city" value="${esc(a.pix_city || '')}" placeholder="Ex.: São Paulo" maxlength="40" ${ro}></div>
          </div>
          ${adm ? '<div class="row" style="justify-content:flex-end"><button class="btn" type="submit">Salvar</button></div>' : ''}
        </form>
      </div>`;
    const f = pane.querySelector('#acct');
    f.onsubmit = (e) => {
      e.preventDefault();
      run(f.querySelector('[type=submit]'), () => rpc('partner_save_account', { p: { bank_code: f.bank_code.value, bank_name: f.bank_name.value,
        branch: f.branch.value, account: f.account.value, pix_key: f.pix_key.value, pix_city: f.pix_city.value } }), 'Conta salva').catch(() => null);
    };
  }

  function bank(pane, s, adm) {
    if (!(s.trio && s.trio.required)) return manualBank(pane, s, adm);
    const t = s.trio || { status: 'none' };
    const ro = adm ? '' : 'disabled';
    const r = s.rules || {};
    const [stLabel, stTone] = ACC_STEP[t.status] || ACC_STEP.none;
    pane.innerHTML = `
      <div class="stack">
        <div class="card stack" id="trio">
          <div class="row between" style="align-items:flex-start;gap:12px;flex-wrap:wrap">
            <div><h2>Conta Lottus</h2><p class="small muted" style="margin:4px 0 0">A conta do fundo de onde saem os Pix aos cedentes e onde caem os boletos das duplicatas.</p></div>
            <div class="row" style="gap:6px">${t.env === 'sandbox' ? '<span class="tag">Ambiente de testes</span>' : ''}<span class="tag ${stTone}">${esc(stLabel)}</span></div>
          </div>
          <div id="trio-body"></div>
        </div>
        <form class="card stack" id="rules" novalidate>
          <div><h2>Regras dos boletos</h2><p class="small muted" style="margin:4px 0 0">Valem para todos os boletos emitidos na Conta Lottus do fundo. Todo boleto já vem com Pix.</p></div>
          <div class="grid-3">
            <div class="field"><label>Multa por atraso (%)</label><input class="input" name="fine_percent" inputmode="decimal" value="${decIn(r.fine_percent)}" placeholder="Sem multa (usual: 2,00)" ${ro}></div>
            <div class="field"><label>Juros de mora (% ao mês)</label><input class="input" name="interest_monthly_percent" inputmode="decimal" value="${decIn(r.interest_monthly_percent)}" placeholder="Sem juros (usual: 1,00)" ${ro}></div>
            <div class="field"><label>Aceitar pagamento até (dias após o vencimento)</label><input class="input" name="writeoff_days" inputmode="numeric" value="${r.writeoff_days ?? ''}" placeholder="60" ${ro}></div>
            <div class="field"><label>Desconto para pagar antes (%)</label><input class="input" name="discount_percent" inputmode="decimal" value="${decIn(r.discount_percent)}" placeholder="Sem desconto" ${ro}></div>
            <div class="field"><label>Até quantos dias antes do vencimento</label><input class="input" name="discount_days" inputmode="numeric" value="${r.discount_days ?? ''}" placeholder="0" ${ro}></div>
            <div class="field"><label>Observação no boleto</label><input class="input" name="instructions" maxlength="80" value="${esc(r.instructions || '')}" placeholder="Opcional" ${ro}></div>
          </div>
          <p class="small muted" id="preview" style="margin:0"></p>
          <p class="small muted" style="margin:0">O boleto já informa que o título foi cedido ao fundo e quem é o cedente.</p>
          ${adm ? '<div class="row" style="justify-content:flex-end"><button class="btn" type="submit">Salvar regras</button></div>' : ''}
        </form>
      </div>`;
    trioBody(pane.querySelector('#trio-body'), s, t, adm);

    const f = pane.querySelector('#rules');
    const preview = () => {
      const fine = decOut(f.fine_percent.value) || 0, int = decOut(f.interest_monthly_percent.value) || 0, disc = decOut(f.discount_percent.value) || 0;
      const dd = intOut(f.discount_days.value) || 0, wo = intOut(f.writeoff_days.value) || 60;
      const parts = [`Num boleto de ${brl(1000)}: ${fine ? `multa de ${brl(10 * fine)}` : 'sem multa'} e ${int ? `juros de ${brl((10 * int) / 30)} por dia de atraso` : 'sem juros'}`];
      if (disc) parts.push(`desconto de ${brl(10 * disc)} se pago até ${dd ? `${dd} dias antes do vencimento` : 'o vencimento'}`);
      parts.push(`pode ser pago até ${wo} dias depois do vencimento`);
      pane.querySelector('#preview').textContent = parts.join('; ') + '.';
    };
    ['fine_percent', 'interest_monthly_percent', 'discount_percent', 'discount_days', 'writeoff_days'].forEach((k) => (f[k].oninput = preview));
    preview();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = f.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        await rpc('partner_save_boleto_rules', { p: { fine_percent: decOut(f.fine_percent.value), interest_monthly_percent: decOut(f.interest_monthly_percent.value),
          discount_percent: decOut(f.discount_percent.value), discount_days: intOut(f.discount_days.value), writeoff_days: intOut(f.writeoff_days.value),
          instructions: f.instructions.value } });
        toast('Regras salvas');
      } catch (err) { fail(err); }
      btn.disabled = false;
    };
  }

  function trioBody(box, s, t, adm) {
    const refreshBtn = adm ? '<button class="btn secondary sm" type="button" id="trio-refresh">Atualizar situação</button>' : '';
    const wire = () => {
      const rb = box.querySelector('#trio-refresh');
      if (rb) rb.onclick = async () => {
        rb.disabled = true;
        try { await trioCall({ action: 'trio_refresh' }); B.reload(); } catch (e) { fail(e); rb.disabled = false; }
      };
    };
    const acc = (s.me && s.me.account) || {};

    if (t.status === 'active') {
      const a = t.account || {};
      box.innerHTML = `<dl class="lines" style="margin:0">
          ${a.number ? `<dt>Agência · conta</dt><dd><b>${esc(a.branch || '')} · ${esc(a.number)}${a.digit ? `-${esc(a.digit)}` : ''}</b></dd>` : ''}
          <dt>Titular</dt><dd>${esc(s.funder.legal_name)}</dd>
          <dt>Saldo disponível</dt><dd><b id="trio-bal"><span class="muted">…</span></b></dd>
          <dt>Pagamentos</dt><dd>Pix na hora, ao aprovar, para a chave CNPJ do cedente</dd>
          <dt>Boletos</dt><dd>Emitidos depois do pagamento, com Pix e baixa automática</dd></dl>
        <p class="small muted" style="margin:0">Mantenha saldo na conta: sem saldo, a aprovação avisa antes de assinar.</p>`;
      trioCall({ action: 'trio_balance' }).then((d) => {
        const el = box.querySelector('#trio-bal');
        if (el) el.textContent = d && d.available != null ? brl(d.available) : 'Não deu para ler agora';
      }).catch(() => { const el = box.querySelector('#trio-bal'); if (el) el.textContent = 'Não deu para ler agora'; });
      return;
    }

    if (t.status === 'approved') {
      box.innerHTML = `<p style="margin:0">A conta foi aprovada e fica pronta em alguns minutos. Avisamos por e-mail.</p><div class="row" style="justify-content:flex-start">${refreshBtn}</div>`;
      return wire();
    }
    if (t.status === 'rejected') {
      box.innerHTML = `<div class="note-box">A análise não aprovou a conta${t.reason ? `: ${esc(t.reason)}` : '.'} A equipe Lottus vai falar com você para resolver.</div>`;
      return;
    }
    if (t.status === 'error') {
      box.innerHTML = '<p style="margin:0">Estamos concluindo a abertura da conta. Se precisarmos de algo, a equipe Lottus fala com você.</p>';
      return;
    }

    if (t.status === 'in_validation' || t.status === 'in_review') {
      const reps = t.representatives || [];
      const docs = t.docs || [];
      const slots = t.doc_slots || [];
      const sent = (slot) => docs.filter((d) => d.slot === slot).pop();
      const upl = (slot, d) => (adm ? `<label class="btn ${d ? 'ghost' : 'secondary'} sm file-btn">${d ? 'Trocar' : 'Enviar PDF'}<input type="file" accept="application/pdf,.pdf" data-slot="${esc(slot)}"></label>` : '');
      const reqLeft = slots.filter((x) => x.required && !sent(x.slot)).length;
      box.innerHTML = `
        <ol class="steps">
          <li class="done"><b>Conta solicitada</b><span class="small muted">Com os dados do fundo, de forma automática${t.requested_at ? ` · ${dateTime(t.requested_at)}` : ''}</span></li>
          <li class="${reqLeft ? 'now' : 'done'}"><b>Documentos do fundo</b><span class="small muted">${reqLeft ? `Faltam ${reqLeft} obrigatório${reqLeft > 1 ? 's' : ''}. PDF, até 10 MB cada.` : 'Obrigatórios enviados.'}</span>
            <div class="list">${slots.map((x) => { const d = sent(x.slot); return `<div class="list-row"><div class="grow"><b>${esc(x.label)}</b>${x.required ? '' : ' <span class="small muted">(se houver)</span>'}
                <div class="small muted">${d ? `Enviado: ${esc(d.name)} · ${dateTime(d.at)}` : x.required ? 'Obrigatório' : 'Opcional'}</div></div>
              ${d ? '<span class="tag success">Enviado</span>' : ''}${upl(x.slot, d)}</div>`; }).join('')}</div></li>
          <li class="${reps.length && reps.every((r) => r.status === 'approved') ? 'done' : 'now'}"><b>Representantes</b>
            <span class="small muted">Cada um recebeu por e-mail o link da prova de vida, feita pelo celular. Envie também o RG ou a CNH de cada um, em PDF.</span>
            <div class="list">${reps.map((r) => {
              const d = sent(`rg:${r.id}`);
              return `<div class="list-row"><div class="grow"><b>${esc(r.name)}</b><div class="small muted">${esc(r.email || '')}${d ? ` · documento enviado ${dateTime(d.at)}` : ''}</div></div>
                <span class="tag ${r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}">${r.status === 'approved' ? 'Aprovado' : r.status === 'rejected' ? 'Recusado' : 'Prova de vida pendente'}</span>
                ${adm && r.liveness_link ? `<button class="btn ghost sm" type="button" data-live="${esc(r.liveness_link)}">Copiar link</button>` : ''}
                ${adm ? `<label class="btn ${d ? 'ghost' : 'secondary'} sm file-btn">${d ? 'Trocar RG/CNH' : 'Enviar RG/CNH'}<input type="file" accept="application/pdf,.pdf" data-slot="rg:${esc(r.id)}"></label>` : ''}</div>`;
            }).join('')}</div></li>
          <li class="${t.status === 'in_review' ? 'now' : ''}"><b>Análise</b><span class="small muted">A aprovação chega sozinha, e avisamos por e-mail.</span></li>
        </ol>
        <div class="row" style="justify-content:flex-start;margin-top:6px">${refreshBtn}</div>`;
      box.querySelectorAll('[data-live]').forEach((b) => (b.onclick = () => copy(b.dataset.live)));
      box.querySelectorAll('[data-slot]').forEach((inp) => (inp.onchange = async () => {
        const file = inp.files && inp.files[0]; if (!file) return;
        if (file.size > 10 * 1024 * 1024) return toast('O arquivo passa de 10 MB.', true);
        const fd = new FormData();
        fd.append('action', 'trio_document'); fd.append('slot', inp.dataset.slot); fd.append('file', file, file.name);
        const lab = inp.closest('label'); lab.classList.add('loading');
        try { await trioCall(fd); toast('Documento enviado'); B.reload(); } catch (e) { fail(e); lab.classList.remove('loading'); }
      }));
      return wire();
    }

    // Ainda não aberta, ou abrindo: abre sozinha quando houver a autorização e os dados do fundo
    const n = t.needs || {};
    if (adm && acc.ask_consent) {
      box.innerHTML = `<p style="margin:0">Abrimos a Conta Lottus do fundo automaticamente, com os dados que já temos. Só falta a sua autorização${acc.ask_phone || acc.ask_business ? ' e alguns dados' : ''}.</p>
        <form class="stack" id="cfp" novalidate>${consentFields(acc)}
          <div class="row" style="justify-content:flex-end"><button class="btn" type="submit">Abrir a Conta Lottus</button></div></form>`;
      const form = box.querySelector('#cfp');
      form.onsubmit = async (e) => { e.preventDefault(); if (await sendConsent(form, acc, form.querySelector('[type=submit]'))) { toast('Abrindo a Conta Lottus'); B.reload(); } };
      return;
    }
    const wait = n.consent ? 'Falta a autorização de um administrador do fundo.'
      : n.business ? 'A equipe Lottus está completando os dados do fundo.'
      : n.phone ? 'Falta o celular de um administrador do fundo (para a prova de vida).'
      : 'Estamos abrindo a conta. Em alguns minutos, os documentos do fundo aparecem aqui.';
    box.innerHTML = `<p style="margin:0">${esc(wait)}</p><div class="row" style="justify-content:flex-start">${t.status === 'opening' ? refreshBtn : ''}</div>`;
    wire();
  }

  /* ---------------------------------------------------------------- equipe */
  async function team(pane, s, adm) {
    const list = s.team || [];
    const label = (m) => { const a = accessOf(m); return a === 'approver' && m.approval_limit ? `Aprovador até ${brl(m.approval_limit)}` : ACCESS[a][0]; };
    pane.innerHTML = `
      <div class="card">
        <div class="card-head"><h2>Equipe</h2>${adm ? '<button class="btn sm" id="invite">Convidar pessoa</button>' : ''}</div>
        <div class="list" style="margin-top:4px">${list.map((m, i) => `<div class="list-row ${m.active ? '' : 'off'}">
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
      const CH = { member_saved: 'alterou a equipe', bank_saved: 'alterou o banco', policy_saved: 'alterou a política de crédito', api_key_set: 'salvou uma chave', api_key_removed: 'removeu uma chave', webhook_rotated: 'gerou novo token do aviso', boleto_rules_saved: 'alterou as regras dos boletos', trio_link_requested: 'pediu a Conta Lottus', trio_reset: 'recomeçou a Conta Lottus', trio_status: 'Conta Lottus', account_consent: 'autorizou a abertura da Conta Lottus', trio_retry: 'Conta Lottus: nova tentativa' };
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
