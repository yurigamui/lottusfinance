/* Lottus Admin — aba "Plano e preço" da ficha do cliente (Pacote 3)
   Mostra plano, preço de tabela, preço personalizado vigente, preço efetivo e próxima cobrança (bo_customer_plan)
   e oferece: Trocar plano (administrador), Definir preço personalizado e Revogar (aprovador ou administrador).
   Analista só lê. O servidor confere tudo de novo (nível, limite de 20%, motivo, validade); aqui é só a primeira barreira.
   Depende de B.plan (plano-dados.js). */
(function () {
  'use strict';
  const B = window.BO;
  const { esc, brl, date, dateTime, toast, modal, closeModal } = B;
  const { can, fieldError } = B.ui;

  const WEALTH_NAMES = { gratis: 'Grátis', pro: 'Pro', fund: 'Fundo' };
  const KIND_NAME = { fixed: 'Valor fixo', discount_pct: 'Desconto (%)', fee_rate: 'Taxa (% ao ano)' };
  const MAX_MONEY = 99999999.99; // o servidor recusa valor a partir de R$ 100.000.000
  const round2 = (n) => Math.round(n * 100) / 100;
  const num = (v) => Number(v);
  const pctTxt = (n, d = 4) => `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: d })}%`;
  const monthTxt = (m) => { const s = String(m || '').slice(0, 7).split('-'); return s.length === 2 ? `${s[1]}/${s[0]}` : '—'; };

  /** Texto do preço personalizado com a unidade explícita (R$, % de desconto ou % a.a.). */
  function overrideText(o) {
    if (o.kind === 'fixed') return `${brl(o.value)} por mês (valor fixo)`;
    if (o.kind === 'discount_pct') return `${pctTxt(o.value, 2)} de desconto sobre a tabela`;
    return `${pctTxt(num(o.value) * 100)} ao ano sobre o patrimônio (taxa)`;
  }
  function planLabel(cp) {
    if (cp.product === 'partners') return cp.plan === 'contract' ? 'Contrato (condições combinadas)' : 'Tabela por faixa de patrimônio';
    if (cp.product === 'wealth') return WEALTH_NAMES[cp.plan] || cp.plan || '—';
    return cp.plan_name || cp.plan || '—';
  }
  const validity = (o) => `Vale a partir de ${date(o.valid_from)} ${o.valid_until ? `até ${date(o.valid_until)}` : '(sem data final)'}`;

  /** Estimativa da mensalidade de um fundo na tabela por faixa (rótulo "estimativa": quem decide é o servidor no fechamento do mês). */
  function tierEstimate(S, pl) {
    if (!S || pl == null || !Number.isFinite(pl)) return null;
    if (pl <= num(S.free_pl_limit)) return 0;
    for (const t of S.tiers || []) {
      if (t.up_to != null) { if (pl <= num(t.up_to)) return num(t.monthly); } else return Math.max(round2((pl * num(t.rate_aa)) / 12), num(t.min));
    }
    return null;
  }

  /* ------------------------------------------------------------ assistente em passos */
  /** Modal com formulário, revisão e confirmação. Uma chamada ao servidor por confirmação; Esc, ✕ e Cancelar não chamam nada.
   *  o: { title, subtitle, form, collect(el) → valores|null (mostra os erros nos campos), review(valores) → html, submit(valores) → Promise,
   *       nextLabel, confirmLabel, danger, single (sem revisão), onInput(el) → {block?:bool}, done(resultado) } */
  function wizard(o) {
    let busy = false, step = 1, values = null;
    const el = modal({
      title: o.title, subtitle: o.subtitle, wide: false,
      body: `<div class="stack"><div data-s="1">${o.form}</div><div data-s="2" hidden></div><div class="error-box" data-err role="alert" hidden></div></div>`,
      foot: `<button type="button" class="btn secondary pf-btn" data-w="back">Cancelar</button><button type="button" class="btn pf-btn${o.danger ? ' danger' : ''}" data-w="next">${esc(o.nextLabel)}</button>`,
    });
    const back = el.querySelector('[data-w=back]'), next = el.querySelector('[data-w=next]'), err = el.querySelector('[data-err]');
    const s1 = el.querySelector('[data-s="1"]'), s2 = el.querySelector('[data-s="2"]');
    const showErr = (m) => { err.hidden = !m; err.textContent = m || ''; };
    const refresh = () => { if (o.onInput && step === 1) { const r = o.onInput(el) || {}; next.disabled = !!r.block; } };
    el.addEventListener('input', () => { showErr(''); refresh(); });
    el.addEventListener('change', () => { showErr(''); refresh(); });
    refresh();
    back.onclick = () => {
      if (busy) return;
      if (step === 2) { step = 1; s2.hidden = true; s1.hidden = false; back.textContent = 'Cancelar'; next.textContent = o.nextLabel; next.classList.toggle('danger', !!o.danger && !!o.single); showErr(''); refresh(); return; }
      closeModal();
    };
    next.onclick = async () => {
      if (busy) return;
      showErr('');
      if (step === 1) {
        const v = o.collect(el);
        if (!v) { const bad = el.querySelector('[aria-invalid=true]'); if (bad) bad.focus(); return; }
        values = v;
        if (!o.single) {
          step = 2; s1.hidden = true; s2.hidden = false; s2.innerHTML = o.review(v);
          back.textContent = 'Voltar'; next.textContent = o.confirmLabel; next.disabled = false;
          return;
        }
      }
      busy = true; next.disabled = true; back.disabled = true;
      try {
        const r = await o.submit(values);
        closeModal();
        toast(r && r.unchanged ? B.plan.ERRORS.unchanged : o.okText);
        if (o.done) o.done(r);
      } catch (e) {
        showErr(B.plan.errorMessage(e));
        busy = false; next.disabled = false; back.disabled = false;
      }
    };
    return el;
  }

  /* ------------------------------------------------------------ campos */
  /** Lê um número digitado ("1.234,56"). Mostra o erro ao lado do campo e devolve undefined se inválido. */
  function readNumber(inp, { what, max, maxMsg, decimals = 2 }) {
    fieldError(inp, '');
    const t = inp.value.trim();
    if (!t) { fieldError(inp, `Informe ${what}.`); return undefined; }
    const n = B.parseMoney(t);
    if (n == null || !Number.isFinite(n)) { fieldError(inp, 'Use só números, como 1.234,56.'); return undefined; }
    if (n < 0) { fieldError(inp, 'Não pode ser negativo.'); return undefined; }
    if (n > max) { fieldError(inp, maxMsg); return undefined; }
    const f = 10 ** decimals;
    if (Math.abs(n * f - Math.round(n * f)) > 1e-6) { fieldError(inp, `Use no máximo ${decimals === 2 ? 'duas' : 'quatro'} casas decimais.`); return undefined; }
    return n;
  }
  const field = (id, label, control, help) => `<div class="field"><label for="${id}">${esc(label)}</label>${control}${help ? `<div class="help">${help}</div>` : ''}</div>`;

  /* ------------------------------------------------------------ ações */
  function planDialog(ctx, cp, onDone) {
    const { c, product, id } = ctx;
    B.plan.catalog().then((cat) => {
      let opts;
      if (product === 'sign') opts = (cat.sign || []).map((p) => ({ code: p.code, label: `${p.name} · ${brl(p.price_month)}/mês · ${p.docs_included} docs`, price: num(p.price_month), name: p.name }));
      else if (product === 'wealth') opts = (cat.wealth || []).map((p) => ({ code: p.code, label: `${WEALTH_NAMES[p.code] || p.code} · ${brl(p.price_month)}/mês`, price: num(p.price_month), name: WEALTH_NAMES[p.code] || p.code }));
      else opts = [{ code: 'tier', label: 'Tabela por faixa de patrimônio', name: 'Tabela por faixa de patrimônio' }, { code: 'contract', label: 'Contrato (taxa e mínimo combinados)', name: 'Contrato (condições combinadas)' }];
      const cur = cp.plan;
      const S = cat.partners;
      const pl = product === 'partners' && c && c.usage != null ? num(c.usage) : null;
      const contractFields = product === 'partners' ? `<div data-contract hidden class="stack">
        ${field('pf-rate', 'Taxa (% ao ano sobre o patrimônio)', '<input class="input" id="pf-rate" inputmode="decimal" autocomplete="off" placeholder="Ex.: 0,10">')}
        ${field('pf-min', 'Mensalidade mínima (R$)', '<input class="input" id="pf-min" inputmode="decimal" autocomplete="off" placeholder="Ex.: 500,00">')}</div>` : '';
      const el = wizard({
        title: 'Trocar plano', subtitle: esc(c ? c.name : ''),
        form: `${field('pf-plan', 'Novo plano', `<select class="input" id="pf-plan"><option value="">Escolha um plano…</option>${opts.map((p) => `<option value="${esc(p.code)}"${p.code === cur ? ' disabled' : ''}>${esc(p.label)}${p.code === cur ? ' (atual)' : ''}</option>`).join('')}</select>`)}
          ${contractFields}<div class="pf-preview" data-preview role="status"></div>`,
        nextLabel: 'Continuar', confirmLabel: 'Confirmar troca', okText: 'Plano alterado',
        onInput(m) {
          const sel = m.querySelector('#pf-plan').value, box = m.querySelector('[data-preview]');
          const ct = m.querySelector('[data-contract]'); if (ct) ct.hidden = sel !== 'contract';
          const o = opts.find((x) => x.code === sel);
          if (!o) { box.innerHTML = '<span class="muted">Escolha o novo plano para ver o efeito no preço.</span>'; return {}; }
          if (product === 'partners') {
            let est = null, line = '';
            if (sel === 'tier') { est = tierEstimate(S, pl); line = est == null ? 'O valor passa a seguir a tabela por faixa e é calculado no fechamento do mês.' : `Estimativa pela tabela com o patrimônio de hoje: <b>${brl(est)}</b> por mês.`; }
            else {
              const r = B.parseMoney(m.querySelector('#pf-rate').value), mn = B.parseMoney(m.querySelector('#pf-min').value);
              if (pl != null && Number.isFinite(r) && r != null && Number.isFinite(mn) && mn != null && r >= 0 && mn >= 0) { est = Math.max(round2((pl * (r / 100)) / 12), mn); line = `Estimativa com o patrimônio de hoje: <b>${brl(est)}</b> por mês.`; }
              else line = 'Informe a taxa e a mensalidade mínima para ver a estimativa.';
            }
            box.innerHTML = `Preço de tabela hoje: <b>${brl(cp.list_price)}</b> por mês → ${line}`;
          } else {
            box.innerHTML = `Preço de tabela: <b>${brl(cp.list_price)}</b> por mês → <b>${brl(o.price)}</b> por mês${cp.override ? '<div class="small muted">O preço personalizado vigente continua valendo sobre o novo plano.</div>' : ''}`;
          }
          return {};
        },
        collect(m) {
          const sel = m.querySelector('#pf-plan'); fieldError(sel, '');
          const o = opts.find((x) => x.code === sel.value);
          if (!o) { fieldError(sel, 'Escolha o novo plano.'); return null; }
          if (o.code === cur) { fieldError(sel, 'Escolha um plano diferente do atual.'); return null; }
          const v = { plan: o.code, name: o.name };
          if (product === 'partners' && o.code === 'contract') {
            const r = readNumber(m.querySelector('#pf-rate'), { what: 'a taxa', max: 100, maxMsg: 'A taxa máxima é 100% ao ano.', decimals: 4 });
            const mn = readNumber(m.querySelector('#pf-min'), { what: 'a mensalidade mínima', max: MAX_MONEY, maxMsg: 'O valor máximo é R$ 99.999.999,99.' });
            if (r === undefined || mn === undefined) return null;
            v.rate_aa = Math.round(r * 1e4) / 1e6; v.min_monthly = mn; v.ratePct = r;
          }
          return v;
        },
        review(v) {
          const extra = v.rate_aa != null ? `<dt>Condições</dt><dd>${esc(pctTxt(v.ratePct))} ao ano · mínimo de ${brl(v.min_monthly)} por mês</dd>` : '';
          const price = product === 'partners' ? '' : `<dt>Preço de tabela</dt><dd>${brl(cp.list_price)} → <b>${brl((opts.find((x) => x.code === v.plan) || {}).price)}</b> por mês</dd>`;
          return `<p>Confirma a troca de plano de <b>${esc(c ? c.name : '')}</b>?</p><dl class="kv"><dt>Plano</dt><dd>${esc(planLabel(cp))} → <b>${esc(v.name)}</b></dd>${price}${extra}</dl>
            <p class="small muted">A troca vale já e muda as próximas cobranças. Fica registrada na auditoria com o seu nome.</p>`;
        },
        submit(v) {
          const p = { product, subject: id, plan: v.plan };
          if (v.rate_aa != null) { p.rate_aa = v.rate_aa; p.min_monthly = v.min_monthly; }
          return B.plan.setPlan(p);
        },
        done: onDone,
      });
      el.querySelector('#pf-plan').focus({ preventScroll: true });
    }).catch((e) => toast(B.plan.errorMessage(e), true));
  }

  function overrideDialog(ctx, cp, me, onDone) {
    const { c, product, id } = ctx;
    const admin = can(me, 'admin');
    const contract = product === 'partners' && cp.plan === 'contract';
    const kinds = [['fixed', 'Valor fixo (R$ por mês)'], ['discount_pct', 'Desconto (% sobre a tabela)']].concat(contract ? [['fee_rate', 'Taxa (% ao ano sobre o patrimônio)']] : []);
    const list = num(cp.list_price || 0);
    const base = product === 'sign' && cp.custom_price != null ? num(cp.custom_price) : list;
    const pl = product === 'partners' && c && c.usage != null ? num(c.usage) : null;
    const today = B.today();
    /** Preço efetivo e redução contra a tabela, na mesma regra do servidor. */
    const calc = (kind, v) => {
      if (kind === 'fixed') return { eff: v, red: list > 0 ? ((list - v) / list) * 100 : 0 };
      if (kind === 'discount_pct') return { eff: round2(base * (1 - v / 100)), red: list > 0 ? ((list - base * (1 - v / 100)) / list) * 100 : 0 };
      return { eff: pl != null ? round2((pl * (v / 100)) / 12) : null, red: null };
    };
    const el = wizard({
      title: 'Definir preço personalizado', subtitle: `${esc(c ? c.name : '')}<br><span class="small">Tabela: ${brl(list)} por mês${cp.override ? ' · já existe um preço personalizado: este o substitui' : ''}</span>`,
      form: `${field('po-kind', 'Tipo', `<select class="input" id="po-kind">${kinds.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>`)}
        ${field('po-val', 'Valor', '<input class="input" id="po-val" inputmode="decimal" autocomplete="off">', '<span data-unit></span>')}
        ${field('po-until', 'Validade (opcional)', `<input class="input" id="po-until" type="date" min="${esc(today)}">`, 'Deixe em branco para valer até alguém revogar.')}
        ${field('po-reason', 'Motivo (obrigatório, mínimo de 5 caracteres)', '<textarea class="input" id="po-reason" rows="3" maxlength="300"></textarea>')}
        <div class="pf-preview" data-preview role="status"></div>
        <div class="note-box small" data-warn hidden role="alert"></div>`,
      nextLabel: 'Revisar', confirmLabel: 'Confirmar e salvar', okText: 'Preço personalizado salvo',
      onInput(m) {
        const kind = m.querySelector('#po-kind').value, inp = m.querySelector('#po-val');
        m.querySelector('[data-unit]').textContent = kind === 'fixed' ? 'Em reais por mês, ex.: 1.234,56.' : kind === 'discount_pct' ? 'Em % de desconto, de 0 a 100, ex.: 15.' : 'Em % ao ano, ex.: 0,08 (é o mesmo que 0,08% ao ano).';
        inp.setAttribute('placeholder', kind === 'fixed' ? 'R$ 0,00' : '0 %');
        const box = m.querySelector('[data-preview]'), warn = m.querySelector('[data-warn]');
        const raw = inp.value.trim(), v = raw ? B.parseMoney(raw) : null;
        warn.hidden = true;
        if (v == null || !Number.isFinite(v) || v < 0 || (kind === 'discount_pct' && v > 100) || (kind === 'fee_rate' && v > 100) || (kind === 'fixed' && v > MAX_MONEY)) {
          box.innerHTML = '<span class="muted">Digite o valor para ver o preço efetivo.</span>'; return {};
        }
        const r = calc(kind, v);
        let html;
        if (kind === 'fee_rate') {
          html = `Taxa de <b>${esc(pctTxt(v))} ao ano</b> sobre o patrimônio${r.eff != null ? `. Estimativa: <b>${brl(r.eff)}</b> por mês com o patrimônio de hoje (o mínimo mensal do contrato pode elevar o valor)` : ''}.<div class="small muted">O servidor confere o desconto em relação à taxa de tabela.</div>`;
          box.innerHTML = html; return {};
        }
        const red = r.red;
        const txt = red > 0 ? `desconto de <b>${esc(pctTxt(Math.round(red * 100) / 100, 2))}</b> sobre a tabela` : red < 0 ? `acréscimo de <b>${esc(pctTxt(Math.round(-red * 100) / 100, 2))}</b> sobre a tabela` : 'igual à tabela';
        box.innerHTML = `Preço efetivo: <b>${brl(r.eff)}</b> por mês · ${txt} (${brl(list)}).`;
        if (red > 20) {
          warn.hidden = false;
          if (!admin) { warn.textContent = 'Acima de 20% exige administrador. Peça a um administrador para definir este preço.'; return { block: true }; }
          warn.textContent = 'Desconto acima de 20%: só administradores podem definir. Fica registrado na auditoria.';
        }
        return {};
      },
      collect(m) {
        const kind = m.querySelector('#po-kind').value;
        const inp = m.querySelector('#po-val'), until = m.querySelector('#po-until'), reason = m.querySelector('#po-reason');
        const max = kind === 'fixed' ? MAX_MONEY : 100;
        const maxMsg = kind === 'fixed' ? 'O valor máximo é R$ 99.999.999,99.' : kind === 'discount_pct' ? 'O desconto máximo é 100%.' : 'A taxa máxima é 100% ao ano.';
        const v = readNumber(inp, { what: kind === 'fixed' ? 'o valor em reais' : kind === 'discount_pct' ? 'o desconto' : 'a taxa', max, maxMsg, decimals: kind === 'fee_rate' ? 4 : 2 });
        let ok = v !== undefined;
        fieldError(until, '');
        const u = until.value;
        if (u) {
          const real = /^\d{4}-\d{2}-\d{2}$/.test(u) && new Date(u + 'T12:00:00Z').toISOString().slice(0, 10) === u;
          if (!real) { fieldError(until, 'Use uma data real.'); ok = false; } else if (u < today) { fieldError(until, 'A validade não pode ser anterior a hoje.'); ok = false; }
        }
        fieldError(reason, '');
        const rs = reason.value.trim();
        if (rs.length < 5) { fieldError(reason, 'Explique o motivo (pelo menos 5 caracteres).'); ok = false; }
        if (ok && (kind === 'fixed' || kind === 'discount_pct') && !admin && calc(kind, v).red > 20) { fieldError(inp, 'Acima de 20% exige administrador.'); ok = false; }
        if (!ok) return null;
        return { kind, shown: v, value: kind === 'fee_rate' ? Math.round(v * 1e4) / 1e6 : v, valid_until: u || null, reason: rs };
      },
      review(v) {
        const r = calc(v.kind, v.shown);
        const val = v.kind === 'fixed' ? `${brl(v.shown)} por mês` : v.kind === 'discount_pct' ? `${pctTxt(v.shown, 2)} de desconto` : `${pctTxt(v.shown)} ao ano`;
        const eff = v.kind === 'fee_rate' ? (r.eff != null ? `≈ ${brl(r.eff)} por mês (estimativa)` : 'calculado no fechamento do mês') : `${brl(r.eff)} por mês${r.red > 0 ? ` (desconto de ${pctTxt(Math.round(r.red * 100) / 100, 2)})` : ''}`;
        return `<p>Confirma o preço personalizado de <b>${esc(c ? c.name : '')}</b>?</p><dl class="kv"><dt>Tipo</dt><dd>${esc(KIND_NAME[v.kind])}</dd><dt>Valor</dt><dd><b>${esc(val)}</b></dd>
          <dt>Preço efetivo</dt><dd>${eff}</dd><dt>Validade</dt><dd>${v.valid_until ? `até ${esc(date(v.valid_until))}` : 'sem data final'}</dd><dt>Motivo</dt><dd>${esc(v.reason)}</dd></dl>
          <p class="small muted">${cp.override ? 'O preço personalizado atual será substituído. ' : ''}Fica registrado na auditoria com o seu nome.</p>`;
      },
      submit(v) { return B.plan.setOverride({ product, subject: id, kind: v.kind, value: v.value, valid_until: v.valid_until, reason: v.reason }); },
      done: onDone,
    });
    el.querySelector('#po-kind').focus({ preventScroll: true });
  }

  function revokeDialog(ctx, cp, onDone) {
    const o = cp.override;
    wizard({
      title: 'Revogar preço personalizado', subtitle: esc(ctx.c ? ctx.c.name : ''), single: true, danger: true,
      form: `<p>O preço volta a ser o da tabela (<b>${brl(cp.list_price)}</b> por mês). Preço revogado: <b>${esc(overrideText(o))}</b>.</p>
        ${field('pr-reason', 'Motivo (obrigatório, mínimo de 5 caracteres)', '<textarea class="input" id="pr-reason" rows="3" maxlength="300"></textarea>')}`,
      nextLabel: 'Revogar preço', okText: 'Preço personalizado revogado',
      collect(m) { const t = m.querySelector('#pr-reason'); fieldError(t, ''); const v = t.value.trim(); if (v.length < 5) { fieldError(t, 'Explique o motivo (pelo menos 5 caracteres).'); return null; } return { reason: v }; },
      submit: (v) => B.plan.revokeOverride(o.id, v.reason),
      done: onDone,
    });
  }

  /* ------------------------------------------------------------ histórico */
  function historyHtml(rows) {
    const st = (r) => {
      if (r.revoked_at) return ['Revogado', ''];
      if (r.active_now) return ['Vigente', 'success'];
      if (r.valid_from && String(r.valid_from) > B.today()) return ['Agendado', 'brand'];
      return ['Expirado', ''];
    };
    return B.ui.table({
      rows, pageSize: 10, cardTitle: 'value', search: rows.length > 10, searchLabel: 'Buscar no histórico', emptyText: 'Nenhum preço personalizado até hoje.',
      columns: [
        { key: 'value', label: 'Preço', searchText: (r) => overrideText(r), render: (r) => `<b>${esc(overrideText(r))}</b>` },
        { key: 'valid_from', label: 'Validade', searchText: () => '', render: (r) => esc(validity(r)) },
        { key: 'reason', label: 'Motivo', render: (r) => `${esc(r.reason)}${r.revoked_at ? `<div class="small muted">Revogado em ${esc(dateTime(r.revoked_at))}${r.revoke_reason ? ': ' + esc(r.revoke_reason) : ''}</div>` : ''}` },
        { key: 'created_by_name', label: 'Definido por', render: (r) => `${esc(r.created_by_name || '—')}<div class="small muted">${esc(dateTime(r.created_at))}</div>` },
        { key: 'status', label: 'Situação', searchText: (r) => st(r)[0], render: (r) => { const [l, t] = st(r); return `<span class="tag ${t}">${esc(l)}</span>`; } },
      ],
    });
  }

  /* ------------------------------------------------------------ tela */
  /** Desenha a aba em box. ctx: { c (bo_customer), kind ('funder'|'sign'), id, me, fallbackHref } */
  async function render(box, ctx) {
    const { c, me } = ctx;
    const product = B.plan.productOf(ctx.kind);
    const full = Object.assign({}, ctx, { product });
    const token = (box._pfToken = (box._pfToken || 0) + 1);
    const live = () => box.isConnected && box._pfToken === token;
    box.innerHTML = B.ui.skeleton(4);
    let cp, hist;
    try {
      [cp, hist] = await Promise.all([B.plan.customer(product, ctx.id), B.plan.overrides(product, ctx.id).catch((e) => ({ __err: e }))]);
    } catch (e) {
      if (!live()) return;
      const miss = B.plan.isMissing(e);
      box.innerHTML = `<div class="card"><h2>Plano e preço</h2>
        <div class="${miss ? 'note-box' : 'error-box'}" role="${miss ? 'status' : 'alert'}">${esc(B.plan.errorMessage(e))}</div>
        <dl class="kv u-m16t"><dt>Plano atual</dt><dd>${esc(c.product)} · ${esc(c.plan)}</dd>${c.plan_requested ? `<dt>Pediu troca para</dt><dd>${esc(c.plan_requested)}</dd>` : ''}<dt>Valor mensal hoje</dt><dd><b>${brl(c.mrr)}</b></dd></dl>
        <div class="pf-actions u-m16t">${miss ? '' : '<button type="button" class="btn secondary" data-pf="retry">Tentar de novo</button>'}<a class="btn secondary" href="${esc(ctx.fallbackHref)}">${ctx.kind === 'funder' ? 'Abrir na gestão dos fundos' : 'Abrir Preços e planos'}</a></div></div>`;
      const rt = box.querySelector('[data-pf=retry]'); if (rt) rt.onclick = () => render(box, ctx);
      return;
    }
    if (!live()) return;
    const mayOverride = can(me, 'approver'), mayPlan = can(me, 'admin');
    const o = cp.override;
    const nb = cp.next_billing || {};
    const refresh = () => { B._fichaTab = 'plano'; B.reload(); };
    const histErr = hist && hist.__err;
    const rows = Array.isArray(hist) ? hist : [];
    const acts = [];
    if (mayPlan) acts.push('<button type="button" class="btn" data-pf="plan">Trocar plano</button>');
    if (mayOverride) acts.push('<button type="button" class="btn secondary" data-pf="ov">Definir preço personalizado</button>');
    if (mayOverride && o) acts.push('<button type="button" class="btn danger" data-pf="rev">Revogar</button>');
    const permNote = !mayOverride ? 'Seu nível só permite consultar. Para trocar o plano ou definir preço, peça a um aprovador ou administrador.' : !mayPlan ? 'Trocar o plano é só para administradores.' : '';
    box.innerHTML = `<div class="card"><h2>Plano e preço</h2>
      <p class="small muted">Valores por mês, em reais. A fatura é gerada no começo do mês seguinte à competência.</p>
      <dl class="kv">
        <dt>Plano atual</dt><dd>${esc(planLabel(cp))}</dd>
        ${c.plan_requested ? `<dt>Pediu troca para</dt><dd>${esc(c.plan_requested)}</dd>` : ''}
        <dt>Preço de tabela</dt><dd>${brl(cp.list_price)}${product === 'partners' ? '<div class="small muted">Calculado com o patrimônio de hoje.</div>' : ''}</dd>
        ${cp.custom_price != null ? `<dt>Preço combinado na conta</dt><dd>${brl(cp.custom_price)}<div class="small muted">Campo antigo, editado em Preços e planos.</div></dd>` : ''}
        <dt>Preço personalizado</dt><dd>${o ? `<b>${esc(overrideText(o))}</b><div class="small muted">${esc(validity(o))}</div><div>Motivo: ${esc(o.reason)}</div><div class="small muted">Definido por ${esc(o.created_by_name || 'equipe Lottus')} em ${esc(dateTime(o.created_at))}</div>` : '<span class="muted">Nenhum. Vale a tabela.</span>'}</dd>
        <dt>Preço efetivo</dt><dd><b>${brl(cp.effective_price)}</b>${cp.exempt ? '<div class="small muted">Conta isenta: não é cobrada.</div>' : ''}</dd>
        <dt>Próxima cobrança</dt><dd>${nb.ref_month ? `Competência ${esc(monthTxt(nb.ref_month))}<div class="small muted">Fatura gerada em ${esc(date(nb.invoice_on))} · vence em ${esc(date(nb.due_date))}</div>` : '—'}</dd>
      </dl>
      ${acts.length ? `<div class="pf-actions u-m16t">${acts.join('')}</div>` : ''}
      ${permNote ? `<p class="small muted u-m16t">${esc(permNote)}</p>` : ''}</div>
      <div class="card u-m16t"><h2>Histórico de preços personalizados</h2>
        ${histErr ? `<div class="${B.plan.isMissing(histErr) ? 'note-box' : 'error-box'}" role="status">${esc(B.plan.errorMessage(histErr))}</div>` : (rows.length ? B.ui.more(`Ver histórico (${rows.length})`, historyHtml(rows)) : B.ui.empty('Nenhum preço personalizado até hoje.'))}</div>`;
    B.ui.onTable(box);
    const on = (k, fn) => { const b = box.querySelector(`[data-pf=${k}]`); if (b) b.onclick = fn; };
    on('plan', () => planDialog(full, cp, refresh));
    on('ov', () => overrideDialog(full, cp, me, refresh));
    on('rev', () => revokeDialog(full, cp, refresh));
  }

  B.planoFicha = { render, overrideText, planLabel, tierEstimate };
})();
