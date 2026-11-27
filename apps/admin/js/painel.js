/* Lottus Admin — Início: o que fazer hoje, receita (MRR), caixa, crescimento e evolução */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, run, modal, closeModal } = B;
  const { head, tabs, onTabs, empty, can } = B.ui;

  const PERIODS = [['6', '6 meses'], ['12', '12 meses'], ['24', '24 meses']];
  const MONTH = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MONTH_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const KEY = 'lottus.admin.period', MKEY = 'lottus.admin.metric2';
  const monthRow = (ym, i) => {
    const [y, mo] = ym.split('-').map(Number);
    return { label: MONTH[mo - 1] + (mo === 1 || i === 0 ? `/${String(y).slice(2)}` : ''), long: `${MONTH_LONG[mo - 1]} de ${y}` };
  };
  const nf = (v) => Number(v || 0).toLocaleString('pt-BR');
  const plural = (v, one, many) => `${nf(v)} ${Number(v) === 1 ? one : many}`;
  const METRICS = [['mrr', 'MRR', brl], ['received', 'Recebido', brl], ['expenses', 'Despesas', brl], ['result', 'Resultado', brl], ['leads', 'Leads', nf], ['reach', 'Alcance', nf]];
  const STAGES = [['lead', 'Lead'], ['contato', 'Em contato'], ['proposta', 'Proposta'], ['teste', 'Teste grátis'], ['cliente', 'Cliente'], ['perdido', 'Perdido']];
  const CHANNEL = { email: 'E-mail', instagram: 'Instagram', linkedin: 'LinkedIn', whatsapp: 'WhatsApp', anuncio: 'Anúncio', evento: 'Evento', outro: 'Outro' };
  B.STAGES = STAGES;

  const delta = (now, prev, fmt = brl) => {
    if (prev == null || !Number(prev)) return '';
    const d = Number(now) - Number(prev), pct = (d / Number(prev)) * 100;
    return `<span class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${Math.abs(pct).toFixed(1).replace('.', ',')}% <span class="muted">vs. mês anterior</span></span>`;
  };

  B.views.painel = async (el, [raw], me) => {
    let months = raw;
    if (!PERIODS.some(([k]) => k === months)) { try { months = localStorage.getItem(KEY) || '6'; } catch { months = '6'; } }
    if (!PERIODS.some(([k]) => k === months)) months = '6';
    let metric = 'mrr'; try { metric = localStorage.getItem(MKEY) || 'mrr'; } catch { /* ok */ }
    if (!METRICS.some(([k]) => k === metric)) metric = 'mrr';
    const [d, goals] = await Promise.all([rpc('bo_home', { p_months: Number(months) }), rpc('bo_goals', { p: null }).catch(() => ({}))]);
    const w = d.now, t = d.today, series = (d.months || []).map((m) => ({ ...m, result: Number(m.received) - Number(m.expenses) }));
    const goalBar = (val, goal, fmt = brl) => (Number(goal) > 0 ? `<div class="meter" role="img" aria-label="${Math.round((val / goal) * 100)}% da meta"><span style="width:${Math.min(100, Math.max(2, (val / goal) * 100)).toFixed(0)}%"></span></div><span class="small muted">meta ${fmt(goal)} · ${Math.round((val / goal) * 100)}%</span>` : '');
    const tile = (label, value, sub, href, cls = '', extra = '') =>
      `<a class="tile ${cls}" href="#/${href}"><span class="kpi-label">${esc(label)}</span><span class="tile-value">${value}</span>${extra}<span class="small muted">${sub}</span></a>`;

    // Hoje: pendências com o atalho certo
    const todo = [
      [t.overdue_invoices.count, `${plural(t.overdue_invoices.count, 'fatura vencida', 'faturas vencidas')} · ${brl(t.overdue_invoices.amount)}`, 'faturas/overdue', 'Cobrar', true],
      [t.payables_week.count, `${plural(t.payables_week.count, 'conta a pagar', 'contas a pagar')} em 7 dias · ${brl(t.payables_week.amount)}`, 'pagar', 'Ver contas', false],
      [t.tasks.count, `${plural(t.tasks.count, 'tarefa para hoje', 'tarefas para hoje')}${t.tasks.late ? ` (${t.tasks.late} atrasada${t.tasks.late === 1 ? '' : 's'})` : ''}`, 'tarefas', 'Abrir', t.tasks.late > 0],
      [t.requests, `${plural(t.requests, 'pedido', 'pedidos')} de troca de plano no Sign`, 'assinaturas', 'Responder', false],
      [t.red_customers, `${plural(t.red_customers, 'cliente', 'clientes')} com saúde ruim`, 'clientes/red', 'Ver', true],
      [t.scheduled, `${plural(t.scheduled, 'campanha agendada', 'campanhas agendadas')} para hoje`, 'campanhas', 'Ver', false],
      [t.content_today, `${plural(t.content_today, 'peça', 'peças')} de conteúdo para publicar hoje`, 'calendario', 'Abrir', false],
    ].filter((x) => Number(x[0]) > 0).slice(0, 5);
    const runway = w.runway == null ? (Number(w.balance) > 0 ? 'receita cobre as despesas' : 'sem dados de caixa') : `fôlego de ${String(w.runway).replace('.', ',')} meses`;
    const stagesMax = Math.max(1, ...STAGES.map(([k]) => Number(((d.stages || {})[k] || {}).count || 0)));

    el.innerHTML = `<div class="v-painel">
      ${head(`Olá, ${esc(me.name.split(' ')[0])}`, new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: B.TZ }),
        `<div class="row" style="gap:8px">${tabs(PERIODS, months)}${can(me, 'admin') ? '<button class="btn secondary sm" id="goals">Metas</button>' : ''}</div>`)}
      ${todo.length ? `<div class="card today"><h2>Hoje</h2><div class="queue">${todo.map(([, txt, href, act, hot]) =>
        `<a class="queue-row" href="#/${href}"><span class="dot ${hot ? 'hot' : ''}" aria-hidden="true"></span><span class="queue-label">${esc(txt)}</span><span class="btn secondary sm">${esc(act)}</span></a>`).join('')}</div></div>` : ''}
      <div class="kpi4 kpi4-c">
        ${tile('MRR (receita recorrente)', brl(w.mrr), `${brl(w.mrr_partners)} Partners · ${brl(w.mrr_sign)} Sign`, 'assinaturas', 'main hero', delta(w.mrr, w.mrr_prev) + goalBar(Number(w.mrr), Number(goals.revenue_month)))}
        ${tile('Recebido no mês', brl(w.received_month), `${brl(w.received_prev)} no mês anterior`, 'faturas/paid')}
        ${tile('A receber', brl(w.open_amount), `${brl(w.in_30d)} vence em 30 dias`, 'faturas/open')}
        ${tile(Number(w.overdue_count) ? '! Em atraso' : 'Em atraso', brl(w.overdue_amount), Number(w.overdue_count) ? plural(w.overdue_count, 'fatura', 'faturas') : 'tudo em dia', 'faturas/overdue', Number(w.overdue_count) ? 'late danger' : 'late')}
      </div>
      ${B.ui.more('Ver mais indicadores (caixa, saídas, clientes, leads e metas)', `<div class="kpi4 kpi4-c">
        ${tile('Caixa hoje', brl(w.balance), Number(w.accounts) ? runway : 'cadastre as contas em Fluxo de caixa', 'caixa', Number(w.cash_min) && Number(w.balance) < Number(w.cash_min) ? 'danger' : '')}
        ${tile('Saídas em 30 dias', brl(w.out_30d), `entradas previstas ${brl(w.in_30d)}`, 'caixa')}
        ${tile('Clientes pagantes', nf(w.customers), `${plural(w.new_customers, 'novo', 'novos')} · ${plural(w.lost_customers, 'perdido', 'perdidos')} no mês`, 'clientes')}
        ${tile('Leads novos (30 d)', nf(w.leads_30d), `${nf(w.leads_open)} abertos · ${brl(w.pipeline)}/mês no funil`, 'funil', '', goalBar(Number(w.leads_30d), Number(goals.leads_month), nf))}
      </div>`)}
      <div class="card dash-row dash-tabs"><div id="dt">${tabs([['rev', 'Receita'], ['funnel', 'Funil'], ['mkt', 'Marketing']], 'rev')}</div>
        <div id="dp-rev" role="tabpanel"><div class="card-head"><h2>Evolução</h2>${tabs(METRICS.map(([k, l]) => [k, l]), metric).replace('class="tabs"', 'class="tabs" id="mt"')}</div><div id="ch"></div></div>
        <div id="dp-funnel" role="tabpanel" hidden><div class="card-head"><h2>Funil comercial</h2><a class="small" href="#/funil">abrir funil</a></div>
          <div class="conc">${STAGES.map(([k, l]) => { const s = (d.stages || {})[k] || {}; const v = Number(s.count || 0); return `<div class="conc-row"><span class="conc-name">${l}</span><span class="conc-val">${nf(v)}${Number(s.value) ? ` <span class="muted">· ${brl(s.value)}/mês</span>` : ''}</span><div class="meter"><span style="width:${Math.max(v ? 3 : 0, (v / stagesMax) * 100).toFixed(1)}%"></span></div></div>`; }).join('')}</div></div>
        <div id="dp-mkt" role="tabpanel" hidden><div class="card-head"><h2>Campanhas com mais alcance</h2><a class="small tap" href="#/resultados">ver resultados</a></div>
          ${(d.top_campaigns || []).length ? `<div class="conc">${d.top_campaigns.map((c) => `<div class="conc-row"><span class="conc-name" title="${esc(c.name)}">${esc(c.name)} <span class="small muted">${esc(CHANNEL[c.channel] || '')}</span></span><span class="conc-val">${nf(c.reach)} <span class="muted">· ${nf(c.leads)} leads</span></span></div>`).join('')}</div>` : empty('Nenhuma campanha ainda.')}
          <p class="small muted u-m4t">Alcance nos últimos 30 dias: <b>${nf(w.reach_30d)}</b> · ${nf(w.contacts_active)} contatos ativos na base.</p></div>
      </div></div>`;

    onTabs(el.querySelector('.page-head'), (k) => { try { localStorage.setItem(KEY, k); } catch { /* ok */ } location.hash = `#/painel/${k}`; });
    const chart = () => {
      const [, label, fmt] = METRICS.find(([k]) => k === metric);
      B.columnChart(el.querySelector('#ch'), series.map((r, i) => ({ ...monthRow(r.month, i), value: Number(r[metric]) })), { name: label, format: fmt });
    };
    onTabs(el.querySelector('#mt'), (k) => { metric = k; try { localStorage.setItem(MKEY, k); } catch { /* ok */ } el.querySelectorAll('#mt [data-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.tab === k); b.setAttribute('aria-selected', String(b.dataset.tab === k)); }); chart(); });
    if (B.columnChart) chart();
    onTabs(el.querySelector('#dt'), (k) => {
      el.querySelectorAll('#dt [data-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.tab === k); b.setAttribute('aria-selected', String(b.dataset.tab === k)); b.tabIndex = b.dataset.tab === k ? 0 : -1; });
      ['rev', 'funnel', 'mkt'].forEach((x) => { el.querySelector('#dp-' + x).hidden = x !== k; });
      if (k === 'rev' && B.columnChart) chart();
    });

    const gb = el.querySelector('#goals');
    if (gb) gb.onclick = () => {
      const box = modal({ title: 'Metas do mês', subtitle: 'Aparecem como barra de progresso nos indicadores.',
        body: `<div class="stack"><div class="field"><label>MRR desejado (R$)</label><input class="input" id="g-r" inputmode="decimal" value="${goals.revenue_month ? String(goals.revenue_month).replace('.', ',') : ''}"></div>
          <div class="field"><label>Leads novos em 30 dias</label><input class="input" id="g-l" inputmode="numeric" value="${goals.leads_month || ''}"></div></div>`,
        foot: '<button class="btn secondary" data-close>Cancelar</button><button class="btn" id="g-ok">Salvar</button>' });
      box.querySelector('[data-close]').onclick = closeModal;
      box.querySelector('#g-ok').onclick = (e) => run(e.target, () => rpc('bo_goals', { p: { revenue_month: Number(box.querySelector('#g-r').value.replace(/\./g, '').replace(',', '.')) || 0, leads_month: Number(box.querySelector('#g-l').value) || 0 } }), 'Metas salvas').then(() => { closeModal(); B.reload(); }).catch(() => {});
    };
  };
})();
