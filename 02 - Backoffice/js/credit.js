/* Lottus · Backoffice — motor de crédito: análise do cedente e configuração */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, pct, date, dateTime, cnpj, run, toast, confirmAction } = B;
  const { head, empty, can } = B.ui;

  Object.assign(B.ACTION_LABEL || {}, {
    credit_data_saved: 'atualizou os dados de crédito', credit_settings_saved: 'alterou o motor de crédito',
    credit_auto_on: 'ligou os ajustes automáticos', credit_auto_off: 'desligou os ajustes automáticos',
    credit_managed_on: 'entregou o limite ao motor', credit_managed_off: 'voltou o limite para decisão manual',
  });

  const TIERS = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'DDD', 'DD', 'D'];
  B.CREDIT_TIERS = TIERS;
  const tierTone = (t) => (['AAA', 'AA', 'A'].includes(t) ? 'success' : ['BBB', 'BB', 'B'].includes(t) ? 'brand' : ['CCC', 'CC', 'C'].includes(t) ? 'warning' : 'danger');
  const tierTag = (t) => (t ? `<span class="tag ${tierTone(t)}">${esc(t)}</span>` : '');
  B.tierTag = tierTag;
  const pc = (v, d = 0) => (v == null ? '—' : `${(Number(v) * 100).toFixed(d).replace('.', ',')}%`);
  const num = (v) => { const s = String(v ?? '').trim(); if (!s) return null; const n = Number(s.replace(/\s|R\$/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const SRC_TONE = { 'Receita': 'brand', 'Receita (CNAE)': 'brand', 'Notas importadas': 'brand', 'Histórico na Lottus': 'success', 'Informado': '', 'Balanço': '', 'DRE': '', 'Calculado': '', 'Cadastro do app': '', 'Cadastro do app (faixa)': '' };
  const srcTag = (s) => `<span class="tag ${SRC_TONE[s] ?? ''}" style="display:inline-flex;width:auto">${esc(s || '—')}</span>`;
  const SOURCE_HINT = { receita: 'Receita', notas: 'Notas importadas', historico: 'Histórico', cadastro: 'Cadastro', manual: 'Informar', calculado: 'Informar dados' };

  const sw = (attrs, on, off, label, help) =>
    `<label class="switch-row"><input type="checkbox" ${attrs} ${on ? 'checked' : ''} ${off ? 'disabled' : ''}><span class="switch" aria-hidden="true"></span>${label ? `<span><b>${esc(label)}</b>${help ? `<small>${esc(help)}</small>` : ''}</span>` : ''}</label>`;

  function adjText(a) {
    const v = Number(a.value);
    if (a.what === 'rate') return `${v > 0 ? '+' : ''}${(v * 100).toFixed(2).replace('.', ',')} p.p.`;
    if (/sem operar/.test(a.label)) return `limite × ${pc(v)}`;
    if (/^Uso de/.test(a.label)) return `+${pc(v)}`;
    return brl(v);
  }

  function fmt(unit, v) {
    if (v == null || v === '') return '—';
    if (typeof v === 'string' && isNaN(Number(v))) return esc(v);
    const n = Number(v);
    switch (unit) {
      case 'pct': return pc(n, 1);
      case 'brl': return brl(n);
      case 'anos': return `${String(n).replace('.', ',')} anos`;
      case 'ratio': return n.toFixed(2).replace('.', ',');
      case 'dias': return `${Math.round(n)} dias`;
      default: return esc(String(v));
    }
  }

  /* -------------------------------------------- campos do cadastro de crédito */
  // tipo: opt (opções do critério), yn (Sim/Não), int, money, pct (digita 40 → 0,40), days, date
  const SECTIONS = [
    ['Empresa e gestão', [
      ['setor', 'Setor de atuação (se diferente do CNAE)', 'opt'], ['regime', 'Regime de tributação', 'opt'],
      ['funcionarios', 'Número de funcionários', 'int'], ['experiencia', 'Experiência dos gestores', 'opt'],
      ['estrutura', 'Estrutura (sede)', 'opt'], ['idoneos', 'Sócios parecem idôneos', 'yn'],
      ['cresc_curto', 'Crescimento do setor (até 5 anos)', 'opt'], ['cresc_longo', 'Crescimento do setor (mais de 5 anos)', 'opt'],
      ['sens_macro', 'Sensibilidade macroeconômica', 'opt'], ['invest_capital', 'Investimento em bens de capital', 'opt'],
    ]],
    ['Vendas e cobrança', [
      ['praca', 'Praça de venda', 'opt'], ['pct_vendas_prazo', '% das vendas a prazo', 'pct'],
      ['concentracao', 'Concentração no maior cliente (%) — se diferente das notas', 'pct'],
      ['sacado_pj', 'Vende para empresas', 'yn'], ['sacado_pf', 'Vende para pessoas físicas', 'yn'],
      ['cobr_duplicata', 'Cobra em duplicata/boleto', 'yn'], ['cobr_cheque', 'Cobra em cheque', 'yn'], ['cobr_deposito', 'Cobra por depósito em conta', 'yn'],
      ['antecipa_contratos', 'Antecipa contratos', 'yn'], ['antes_entrega', 'Antecipa antes de entregar a mercadoria', 'yn'],
      ['intercompany', 'Vende para empresas do mesmo grupo', 'yn'],
    ]],
    ['Outras casas de crédito', [
      ['outras_factorings', 'Tem cadastro em outras securitizadoras/FIDCs', 'yn'],
      ['limites_outras', 'Soma dos limites em outras casas (R$)', 'money'],
      ['liq_recompra', '% recomprado pelo cedente em outras casas', 'pct'],
    ]],
    ['Faturamento e DRE (últimos 12 meses)', [
      ['faturamento_gerencial', 'Faturamento gerencial anual (R$)', 'money'],
      ['receita_bruta', 'Receita bruta (DRE)', 'money'], ['receita_liquida', 'Receita líquida', 'money'],
      ['lucro_bruto', 'Lucro bruto', 'money'], ['ebitda', 'EBITDA', 'money'], ['lucro_liquido', 'Lucro líquido', 'money'],
    ]],
    ['Balanço', [
      ['data_balanco', 'Data do balanço', 'date'],
      ['ativo_circulante', 'Ativo circulante', 'money'], ['passivo_circulante', 'Passivo circulante', 'money'],
      ['contas_receber', 'Contas a receber', 'money'], ['contas_pagar', 'Contas a pagar', 'money'],
      ['emprestimos_lp', 'Empréstimos de longo prazo', 'money'],
      ['lucros_acumulados', 'Lucros acumulados', 'money'], ['prejuizos_acumulados', 'Prejuízos acumulados', 'money'],
      ['prazo_pagamento', 'Prazo médio de pagamento a fornecedores (dias), se não houver balanço', 'days'],
    ]],
  ];

  function fieldHtml([key, label, type], data, opts) {
    const v = data[key];
    const id = `cd-${key}`;
    let input;
    if (type === 'opt' || type === 'yn') {
      const list = type === 'yn' ? ['Sim', 'Não'] : opts[key] || [];
      input = `<select class="input" id="${id}" name="${key}"><option value="">—</option>${list.map((o) => `<option ${String(v) === String(o) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    } else if (type === 'date') {
      input = `<input class="input" id="${id}" name="${key}" type="date" value="${esc(v || '')}">`;
    } else {
      const shown = v == null ? '' : type === 'pct' ? String(Math.round(Number(v) * 1000) / 10).replace('.', ',') : type === 'money' ? Number(v).toLocaleString('pt-BR') : String(v);
      input = `<input class="input" id="${id}" name="${key}" inputmode="decimal" value="${esc(shown)}" placeholder="${type === 'pct' ? 'ex.: 35' : type === 'money' ? 'R$' : ''}">`;
    }
    return `<div class="field"><label for="${id}">${esc(label)}</label>${input}</div>`;
  }

  function readForm(form) {
    const out = {};
    SECTIONS.forEach(([, fields]) => fields.forEach(([key, , type]) => {
      const el = form.elements[key];
      if (!el) return;
      const raw = el.value.trim();
      if (raw === '') { out[key] = null; return; }
      if (type === 'opt' || type === 'yn' || type === 'date') out[key] = raw;
      else if (type === 'pct') { const n = num(raw); out[key] = n == null ? null : Math.round(n * 10) / 1000; }
      else out[key] = num(raw);
    }));
    return out;
  }

  /* ---------------------------------------------- Receita (BrasilAPI) no navegador */
  async function refreshReceita(companyId, cnpjNum, btn) {
    const go = async () => {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjNum}`, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(r.status === 404 ? 'CNPJ não encontrado na Receita.' : 'Receita indisponível agora. Tente de novo.');
      const p = await r.json();
      return rpc('bo_save_company_registry', { p_company: companyId, p: p });
    };
    return run(btn, go, 'Dados da Receita atualizados');
  }

  /* ================================================ análise de crédito do cedente */
  B.creditPage = async (el, id, me) => {
    const d = await rpc('bo_credit_engine', { p_company: id });
    const r = d.result, l = d.limit || {}, bh = r.behavior || {};
    const approver = can(me, 'approver');
    const opts = Object.fromEntries((d.criteria || []).filter((c) => c.options).map((c) => [c.key, c.options]));
    const qual = r.breakdown.filter((b) => b.block === 'qual'), quant = r.breakdown.filter((b) => b.block === 'quant');
    const bar = (v) => `<div class="cov-bar"><span style="width:${Math.round(Number(v || 0) * 100)}%"></span></div>`;
    const crRow = (b) => `<tr><td>${esc(b.label)}</td><td>${fmt(b.unit, b.value)}${b.band && String(b.band) !== String(b.value) ? `<div class="small muted">${esc(b.band)}</div>` : ''}</td>
      <td class="num">${esc(b.base)}</td><td class="num">${esc(b.weight)}</td><td>${srcTag(b.source)}</td></tr>`;
    const tableOf = (rows) => rows.length ? `<table><thead><tr><th>Critério</th><th>Valor</th><th class="num">Nota base</th><th class="num">Peso</th><th>Fonte</th></tr></thead>
      <tbody>${rows.map(crRow).join('')}</tbody></table>` : empty('Sem dados neste bloco ainda.');

    el.innerHTML = `
      <div class="page-head"><div><a class="back" href="#/empresas/${esc(id)}">‹ ${esc(d.company.legal_name)}</a>
        <h1>Motor de crédito</h1><div class="page-sub">${esc(cnpj(d.company.cnpj))} · calculado ${dateTime(r.computed_at)}</div></div>
        <div class="row"><button class="btn secondary" id="receita">Atualizar dados da Receita</button><button class="btn secondary" id="recalc">Recalcular</button></div></div>

      <div class="credit-hero card">
        <div class="credit-score">
          <div class="score-ring" style="--p:${Math.min(100, Number(r.score) / 10)}"><div><b>${Math.round(r.score)}</b><span>de 1000</span></div></div>
          <div class="stack-sm">
            <div class="row" style="gap:8px">${tierTag(r.tier)}<span class="muted small">probabilidade de inadimplência ${r.pd == null ? 'default' : pc(r.pd, 2)}</span></div>
            <div><div class="small muted">Dados usados: ${pc(r.coverage)} do peso total</div>${bar(r.coverage)}</div>
            <div class="small muted">Qualitativo ${r.qual_score ?? '—'} (${pc(r.qual_coverage)} dos dados) · Quantitativo ${r.quant_score ?? '—'} (${pc(r.quant_coverage)} dos dados)</div>
          </div>
        </div>
        <div class="credit-offer">
          <div><div class="kpi-label">Sugestão do motor</div><div class="kpi-value">${brl(r.limit)}</div><div class="small muted">a ${pct(r.monthly_rate)} a.m. · tier ${esc(r.tier)} parte de ${pct(r.tier_rate)}</div></div>
          <div><div class="kpi-label">Hoje</div><div class="kpi-value">${l.status === 'approved' ? brl(l.limit_amount) : '—'}</div>
            <div class="small muted">${l.status === 'approved' ? `a ${pct(l.monthly_rate)} a.m. · ${l.engine_managed ? 'gerido pelo motor' : 'decidido pela equipe'}` : B.tag('credit', l.status)}</div></div>
        </div>
      </div>

      ${(r.alerts || []).length ? `<div class="stack-sm" style="margin:12px 0">${r.alerts.map((a) => `<div class="note-box">${esc(a)}</div>`).join('')}</div>` : ''}

      <div class="grid-2" style="margin-top:16px">
        <div class="card"><h2>Política automática</h2>
          ${sw('id="auto"', l.auto_adjust !== false, !(approver && l.status), 'Ajustes automáticos', 'Todo dia o motor recalcula. Atraso e inatividade reduzem o limite; bom uso aumenta.')}
          ${sw('id="managed"', l.engine_managed, !(approver && l.status === 'approved'), 'Motor gere o limite', l.engine_managed ? 'O limite segue a nota do motor (aumentos de até 25% por vez).' : 'O limite é o decidido pela equipe; o motor só reage a risco e ao uso.')}
          ${(r.adjustments || []).length ? `<h3 class="section-title" style="margin-top:14px">Ajustes aplicados na sugestão</h3>
            <div class="list">${r.adjustments.map((a) => `<div class="list-row"><div class="grow">${esc(a.label)}</div>
              <span class="small muted">${adjText(a)}</span></div>`).join('')}</div>` : ''}
        </div>
        <div class="card"><h2>Comportamento na Lottus</h2>
          <dl class="kv">
            <dt>Uso do limite</dt><dd>${bh.utilization == null ? '—' : pc(bh.utilization)} · em aberto ${brl(bh.exposure)}</dd>
            <dt>Pago em dia</dt><dd>${bh.on_time_ratio == null ? 'sem vencimentos ainda' : pc(bh.on_time_ratio)}${bh.late_ratio ? ` · com atraso ${pc(bh.late_ratio)}` : ''}</dd>
            <dt>Vencido em aberto</dt><dd>${Number(bh.overdue_open) ? `<span style="color:var(--danger)">${brl(bh.overdue_open)} · ${esc(bh.max_overdue_days)} dias</span>` : 'nada'}</dd>
            <dt>Operações</dt><dd>${esc(bh.ops_total || 0)} pagas · ${esc(bh.settled_ops || 0)} liquidadas</dd>
            <dt>Última operação</dt><dd>${bh.last_op_at ? `${date(bh.last_op_at)} · ${esc(bh.idle_days)} dias atrás` : 'nenhuma'}</dd>
            <dt>Antecipado em 12 meses</dt><dd>${brl(bh.gross_12m)}</dd>
            <dt>Faturamento usado</dt><dd>${r.revenue_annual ? `${brl(r.revenue_annual)} por ano · ${esc(r.revenue_source)}` : '—'}</dd>
          </dl>
        </div>
      </div>

      ${r.missing.filter((m) => m.source !== 'historico').length ? `<div class="card" style="margin-top:16px"><div class="card-head"><div><h2>O que mais melhora a avaliação</h2>
          <div class="small muted">Nada é obrigatório. Cada dado novo deixa a nota mais precisa e pode aumentar o limite. O histórico de pagamentos entra sozinho conforme o cedente opera.</div></div></div>
        <div class="missing-grid">${r.missing.filter((m) => m.source !== 'historico').slice(0, 12).map((m) => `<a class="missing" href="#cd-${esc(m.key)}" data-focus="${esc(m.key)}">
          <b>${esc(m.label)}</b><span class="small muted">peso ${esc(m.weight)} · ${esc(SOURCE_HINT[m.source] || m.source)}</span></a>`).join('')}</div></div>` : ''}

      <div class="card flush" style="margin-top:16px"><div class="card-pad-head"><h2>Qualitativo</h2><span class="muted small">nota ${r.qual_score ?? '—'}</span></div><div class="table-wrap">${tableOf(qual)}</div></div>
      <div class="card flush" style="margin-top:16px"><div class="card-pad-head"><h2>Quantitativo</h2><span class="muted small">nota ${r.quant_score ?? '—'}</span></div><div class="table-wrap">${tableOf(quant)}</div></div>

      <form class="card" id="cdata" style="margin-top:16px" novalidate>
        <div class="card-head"><div><h2>Dados de crédito</h2><div class="small muted">Preencha o que tiver. O que vem da Receita, das notas e do histórico entra sozinho.${d.data_updated_at ? ' Atualizado ' + dateTime(d.data_updated_at) + '.' : ''}</div></div></div>
        ${SECTIONS.map(([title, fields]) => `<details class="cd-sec" ${fields.some(([k]) => d.data[k] != null) ? 'open' : ''}><summary>${esc(title)}
            <span class="small muted">${fields.filter(([k]) => d.data[k] != null).length}/${fields.length}</span></summary>
          <div class="grid-3">${fields.map((f) => fieldHtml(f, d.data, opts)).join('')}</div></details>`).join('')}
        <div class="save-bar"><span class="small muted">Ao salvar, o motor recalcula na hora.</span><button class="btn" type="submit">Salvar e recalcular</button></div>
      </form>

      <div class="card" style="margin-top:16px"><h2>Histórico do motor</h2>
        ${d.history.length ? `<div class="list">${d.history.map((h) => `<div class="list-row"><div class="grow">
          <b>${Math.round(h.score)}</b> ${tierTag(h.tier)} <span class="small muted">· ${brl(h.limit)} a ${pct(h.rate)} a.m. · dados ${pc(h.coverage)}</span>
          ${h.applied ? `<div class="small" style="color:var(--brand)">${h.applied.kind === 'auto_approve' ? 'Aprovado automaticamente' : `Limite ${brl(h.applied.limit_from)} → ${brl(h.applied.limit_to)}${h.applied.rate_to !== h.applied.rate_from ? ` · taxa ${pct(h.applied.rate_from)} → ${pct(h.applied.rate_to)}` : ''}`}</div>` : ''}</div>
          <span class="small muted">${esc({ daily: 'diário', manual: 'manual', data: 'dados', receita: 'Receita' }[h.trigger] || h.trigger)} · ${dateTime(h.at)}</span></div>`).join('')}</div>` : '<p class="muted">Nenhuma avaliação guardada ainda.</p>'}
      </div>`;

    el.querySelector('#recalc').onclick = (e) => run(e.currentTarget, () => rpc('bo_run_credit', { p_company: id, p_apply: approver }), 'Recalculado').then(B.reload);
    el.querySelector('#receita').onclick = (e) => refreshReceita(id, d.company.cnpj, e.currentTarget).then((x) => x && B.reload());
    const auto = el.querySelector('#auto');
    if (auto) auto.onchange = () => run(null, () => rpc('bo_set_credit_auto', { p_company: id, p_on: auto.checked }), auto.checked ? 'Ajustes automáticos ligados' : 'Ajustes automáticos desligados');
    const managed = el.querySelector('#managed');
    if (managed) managed.onchange = async () => {
      if (managed.checked) {
        const ok = await confirmAction({ title: 'Entregar o limite ao motor', confirmLabel: 'Entregar',
          text: `O limite passa a seguir a nota do motor. Hoje a sugestão é <b>${brl(r.limit)}</b> a ${pct(r.monthly_rate)} a.m.` });
        if (ok == null) { managed.checked = false; return; }
      }
      run(null, () => rpc('bo_set_credit_managed', { p_company: id, p_on: managed.checked }), managed.checked ? 'O motor passou a gerir o limite' : 'Limite voltou para decisão da equipe').then(B.reload);
    };
    el.querySelectorAll('[data-focus]').forEach((a) => (a.onclick = (ev) => {
      const f = el.querySelector(`#cd-${a.dataset.focus}`);
      if (!f) return; // vem da Receita, das notas ou do histórico
      ev.preventDefault();
      f.closest('details').open = true; f.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => f.focus(), 300);
    }));
    const form = el.querySelector('#cdata');
    form.onsubmit = (ev) => {
      ev.preventDefault();
      run(form.querySelector('[type=submit]'), () => rpc('bo_save_credit_data', { p_company: id, p_data: readForm(form) }), 'Dados salvos e nota recalculada').then((x) => x && B.reload());
    };
  };

  /* ======================================================= configuração do motor */
  const POLICY = [
    ['auto_recalc', 'Recalcular todo dia', 'bool'],
    ['auto_adjust_down', 'Reduzir limite e subir taxa sozinho quando o risco aumenta', 'bool'],
    ['auto_adjust_up', 'Aumentar limite e reduzir taxa sozinho com bom comportamento', 'bool'],
    ['auto_approve', 'Aprovar limites novos sozinho', 'bool'],
    ['auto_approve_min_tier', 'Tier mínimo para aprovar sozinho', 'tier'],
    ['auto_approve_min_coverage', 'Dados mínimos para aprovar sozinho (%)', 'pct'],
    ['auto_approve_max', 'Limite máximo aprovado sozinho (R$)', 'money'],
    ['auto_up_ceiling', 'Aumentos automáticos até (R$)', 'money'],
    ['auto_up_max_step', 'Aumento máximo por vez (%)', 'pct'],
    ['prior_score', 'Nota-base quando faltam dados (0 a 1000)', 'int'],
    ['uncertainty_rate', 'Prêmio de incerteza na taxa (p.p.)', 'pp'],
    ['min_tier_for_limit', 'Tier mínimo para ter limite automático', 'tier'],
    ['starter_cap', 'Teto de entrada sem histórico (R$)', 'money'],
    ['starter_ops', 'Operações liquidadas para sair do teto de entrada', 'int'],
    ['no_revenue_limit', 'Limite sem faturamento conhecido (R$)', 'money'],
    ['idle_days_1', 'Dias sem operar: primeira redução', 'int'], ['idle_mult_1', 'Limite mantido na primeira redução (%)', 'pct'],
    ['idle_days_2', 'Dias sem operar: segunda redução', 'int'], ['idle_mult_2', 'Limite mantido na segunda redução (%)', 'pct'],
    ['overdue_grace_days', 'Atraso que congela o limite (dias)', 'int'], ['overdue_block_days', 'Atraso que bloqueia o limite (dias)', 'int'],
    ['growth_util_high', 'Uso que dá o aumento maior (%)', 'pct'], ['growth_high', 'Aumento maior (%)', 'pct'],
    ['growth_util_mid', 'Uso que dá o aumento menor (%)', 'pct'], ['growth_mid', 'Aumento menor (%)', 'pct'],
    ['loyal_ops_1', 'Operações em dia para o 1º desconto', 'int'], ['loyal_disc_1', '1º desconto na taxa (p.p.)', 'pp'],
    ['loyal_ops_2', 'Operações em dia para o 2º desconto', 'int'], ['loyal_disc_2', '2º desconto na taxa (p.p.)', 'pp'],
  ];

  B.views.motor = async (el, _p, me) => {
    const d = await rpc('bo_credit_settings');
    const admin = can(me, 'admin');
    const e = d.engine || {};
    const shown = (t, v) => v == null ? '' : t === 'pct' ? String(Math.round(Number(v) * 1000) / 10).replace('.', ',') : t === 'pp' ? String(Math.round(Number(v) * 10000) / 100).replace('.', ',') : t === 'money' ? Number(v).toLocaleString('pt-BR') : String(v);
    const dis = admin ? '' : 'disabled';
    el.innerHTML = `
      ${head('Motor de crédito', 'Regras do Modelo de Crédito da Lottus, com coleta automática e ajustes pelo comportamento')}
      <div class="kpis">
        <div class="kpi"><span class="kpi-label">Cedentes avaliados</span><span class="kpi-value">${esc(d.stats.assessed || 0)}</span></div>
        <div class="kpi"><span class="kpi-label">Com ajuste automático</span><span class="kpi-value">${esc(d.stats.auto || 0)}</span></div>
        <div class="kpi"><span class="kpi-label">Dados médios por cedente</span><span class="kpi-value">${pc(d.stats.avg_coverage)}</span></div>
      </div>
      <form id="mf" class="stack" novalidate>
        <div class="card"><h2>Política</h2>
          <div class="grid-3" style="margin-top:12px">${POLICY.map(([k, label, t]) => t === 'bool'
            ? sw(`name="${k}"`, e[k], !admin, label)
            : t === 'tier' ? `<div class="field"><label>${esc(label)}</label><select class="input" name="${k}" ${dis}>${TIERS.map((x) => `<option ${e[k] === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>`
            : `<div class="field"><label>${esc(label)}</label><input class="input" name="${k}" inputmode="decimal" value="${esc(shown(t, e[k]))}" ${dis}></div>`).join('')}</div>
        </div>
        <div class="card flush"><div class="card-pad-head"><h2>Tiers</h2><span class="small muted">Taxa mínima e limite como % do faturamento mensal. O limite de um tier nunca passa o de um tier melhor.</span></div>
          <div class="table-wrap"><table><thead><tr><th>Tier</th><th>Nota a partir de</th><th>Taxa mínima (% a.m.)</th><th>Limite (% do fat. mensal)</th><th>Inadimplência esperada</th></tr></thead>
          <tbody>${d.tiers.map((t) => `<tr data-tier="${esc(t.tier)}"><td>${tierTag(t.tier)}</td>
            <td><input class="input sm" name="min_score" value="${esc(t.min_score)}" ${dis}></td>
            <td><input class="input sm" name="monthly_rate" value="${esc(String(Math.round(t.monthly_rate * 10000) / 100).replace('.', ','))}" ${dis}></td>
            <td><input class="input sm" name="limit_pct" value="${esc(String(Math.round(t.limit_pct * 1000) / 10).replace('.', ','))}" ${dis}></td>
            <td>${t.pd == null ? 'default' : pc(t.pd, 2)}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="card flush"><div class="card-pad-head"><h2>Critérios e pesos</h2><span class="small muted">Peso 0 ou desligado tira o critério da conta.</span></div>
          <div class="table-wrap"><table><thead><tr><th>Critério</th><th>Bloco</th><th>Fonte</th><th class="num">Peso</th><th>Ativo</th></tr></thead>
          <tbody>${d.criteria.map((c) => `<tr data-crit="${esc(c.key)}"><td>${esc(c.label)}</td><td>${c.block === 'qual' ? 'Qualitativo' : 'Quantitativo'}</td>
            <td>${esc(SOURCE_HINT[c.source] || c.source)}</td>
            <td class="num"><input class="input sm" name="weight" value="${esc(c.weight)}" style="max-width:80px;text-align:right" ${dis}></td>
            <td>${sw('name="active"', c.active, !admin)}</td></tr>`).join('')}</tbody></table></div></div>
        ${admin ? '<div class="save-bar"><span class="small muted">As mudanças valem no próximo cálculo.</span><button class="btn" type="submit">Salvar regras</button></div>' : ''}
      </form>`;
    const f = el.querySelector('#mf');
    f.onsubmit = (ev) => {
      ev.preventDefault();
      const engine = {};
      POLICY.forEach(([k, , t]) => {
        const x = f.elements[k];
        if (t === 'bool') engine[k] = x.checked;
        else if (t === 'tier') engine[k] = x.value;
        else { const n = num(x.value); if (n != null) engine[k] = t === 'pct' ? n / 100 : t === 'pp' ? n / 100 : n; }
      });
      const tiers = [...f.querySelectorAll('[data-tier]')].map((tr) => ({ tier: tr.dataset.tier,
        min_score: num(tr.querySelector('[name=min_score]').value),
        monthly_rate: (num(tr.querySelector('[name=monthly_rate]').value) ?? 0) / 100,
        limit_pct: (num(tr.querySelector('[name=limit_pct]').value) ?? 0) / 100 }));
      const criteria = [...f.querySelectorAll('[data-crit]')].map((tr) => ({ key: tr.dataset.crit,
        weight: num(tr.querySelector('[name=weight]').value), active: tr.querySelector('[name=active]').checked }));
      run(f.querySelector('[type=submit]'), () => rpc('bo_save_credit_settings', { p: { engine, tiers, criteria } }), 'Regras salvas').then(B.reload);
    };
  };
})();
