/* Lottus Partners — painel: o que espera o fundo, carteira, volume, vencimentos e concentração */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, pct } = B;
  const { head, tabs, onTabs } = B.ui;

  const PERIODS = [['6', '6 meses'], ['12', '12 meses'], ['24', '24 meses']];
  const MONTH = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MONTH_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const monthRow = (ym, i) => {
    const [y, mo] = ym.split('-').map(Number);
    return { label: MONTH[mo - 1] + (mo === 1 || i === 0 ? `/${String(y).slice(2)}` : ''), long: `${MONTH_LONG[mo - 1]} de ${y}` };
  };
  const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;
  const KEY = 'lottus.partners.period';

  function concentration(title, rows, total) {
    return `<div class="card"><h2>${title}</h2>${rows.length ? `<div class="conc">${rows.map((r) => {
      const share = total > 0 ? Number(r.amount) / total : 0;
      return `<div class="conc-row">
        <span class="conc-name">${esc(r.name || r.cnpj)}</span>
        <span class="conc-val">${brl(r.amount)} <span class="muted">· ${Math.round(share * 100)}%</span></span>
        <div class="meter" role="img" aria-label="${Math.round(share * 100)}% da carteira"><span style="width:${Math.max(2, share * 100).toFixed(1)}%"></span></div>
      </div>`;
    }).join('')}</div>` : '<p class="muted small" style="margin:10px 0 0">Sem carteira em aberto.</p>'}</div>`;
  }

  B.views.painel = async (el, [raw], me) => {
    let months = raw;
    if (!PERIODS.some(([k]) => k === months)) { try { months = localStorage.getItem(KEY) || '12'; } catch { months = '12'; } }
    if (!PERIODS.some(([k]) => k === months)) months = '12';
    const d = await rpc('partner_dashboard', { p_months: Number(months) });
    const p = d.period || {}, pf = d.portfolio || {}, q = d.queue || {};

    const actions = [];
    if (Number(q.pending)) actions.push(`<a class="action-card" href="#/assinar/pending"><span class="action-count">${esc(q.pending)}</span>
        <span class="grow"><b>${Number(q.pending) === 1 ? 'Para aprovar' : 'Para aprovar'}</b><span class="small muted">${brl(q.pending_gross)}</span></span><span class="action-go" aria-hidden="true">›</span></a>`);
    if (Number(q.to_pay)) actions.push(`<a class="action-card" href="#/assinar/to_pay"><span class="action-count">${esc(q.to_pay)}</span>
        <span class="grow"><b>Para pagar</b><span class="small muted">${brl(q.to_pay_net)} aos cedentes</span></span><span class="action-go" aria-hidden="true">›</span></a>`);

    setTimeout(() => B.askAccountConsent && B.askAccountConsent(me), 400);
    el.innerHTML = `
      ${head('Painel', null, `<div class="row" style="gap:8px">${tabs(PERIODS, months)}<button class="btn secondary sm" id="reports">Relatórios</button></div>`)}
      ${me.trio_required && !me.trio_ready ? `<a class="trio-banner" href="#/config/banco"><b>Conecte a Conta Trio do fundo</b>
        <span class="small">Até lá, o fundo não recebe operações: o Pix aos cedentes e o Pix das duplicatas usam essa conta. É só colar as chaves da API em Configurações → Banco.</span></a>` : ''}
      ${actions.length ? `<div class="action-cards">${actions.join('')}</div>` : ''}

      <div class="kpi4">
        <div class="tile main"><span class="kpi-label">Carteira a receber</span><span class="tile-value">${brl(pf.open)}</span>
          <span class="small muted">${brl(pf.next30)} nos próximos 30 dias</span></div>
        <div class="tile ${Number(pf.overdue) ? 'danger' : ''}"><span class="kpi-label">${Number(pf.overdue) ? '<span class="dot-ico" aria-hidden="true">!</span>' : ''}Vencido</span>
          <span class="tile-value">${brl(pf.overdue)}</span><span class="small muted">${Number(pf.overdue) ? plural(pf.overdue_items, 'duplicata', 'duplicatas') : 'nada vencido'}</span></div>
        <div class="tile"><span class="kpi-label">Volume cedido</span><span class="tile-value">${brl(p.gross)}</span>
          <span class="small muted">${plural(p.count || 0, 'operação', 'operações')}</span></div>
        <div class="tile"><span class="kpi-label">Taxa média</span><span class="tile-value">${p.rate != null ? pct(p.rate) : '—'}</span>
          <span class="small muted">${p.days != null ? `prazo médio ${Math.round(p.days)} dias` : 'ao mês'}</span></div>
      </div>

      <div class="grid-2 dash-row">
        <div class="card"><h2>Volume por mês</h2><div id="ch-vol"></div></div>
        <div class="card"><h2>A receber por mês</h2><div id="ch-mat"></div></div>
      </div>
      <div class="grid-2 dash-row">
        ${concentration('Maiores sacados', d.top_debtors || [], Number(pf.open) || 0)}
        ${concentration('Maiores cedentes', d.top_cedentes || [], Number(pf.open) || 0)}
      </div>`;

    onTabs(el, (t) => { try { localStorage.setItem(KEY, t); } catch { /* ok */ } location.hash = `#/painel/${t}`; });
    el.querySelector('#reports').onclick = () => B.openReports(me);
    B.columnChart(el.querySelector('#ch-vol'), (d.monthly || []).map((r, i) => ({ ...monthRow(r.month, i), value: r.gross,
      detail: r.count ? plural(r.count, 'operação', 'operações') : '' })), { name: 'Volume cedido' });
    B.columnChart(el.querySelector('#ch-mat'), (d.maturities || []).map((r, i) => ({ ...monthRow(r.month, i), value: r.amount,
      detail: r.items ? plural(r.items, 'duplicata', 'duplicatas') : '' })), { name: 'A receber' });
  };
})();
