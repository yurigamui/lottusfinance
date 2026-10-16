/* Lottus Partners — painel do fundo: fila, carteira, volume por mês, vencimentos e concentração */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, pct, cnpj } = B;
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
    if (!rows.length) return `<div class="card"><h2>${title}</h2><p class="muted small" style="margin:10px 0 0">Sem carteira em aberto.</p></div>`;
    return `<div class="card"><h2>${title}</h2><div class="conc">${rows.map((r) => {
      const share = total > 0 ? Number(r.amount) / total : 0;
      return `<div class="conc-row">
        <div class="conc-name"><b>${esc(r.name || cnpj(r.cnpj))}</b><span class="small muted">${esc(cnpj(r.cnpj))}</span></div>
        <div class="conc-val"><b>${brl(r.amount)}</b><span class="small muted">${Math.round(share * 100)}% da carteira</span></div>
        <div class="meter" role="img" aria-label="${Math.round(share * 100)}% da carteira"><span style="width:${Math.max(2, share * 100).toFixed(1)}%"></span></div>
      </div>`;
    }).join('')}</div></div>`;
  }

  B.views.painel = async (el, [raw], me) => {
    let months = raw;
    if (!PERIODS.some(([k]) => k === months)) { try { months = localStorage.getItem(KEY) || '12'; } catch { months = '12'; } }
    if (!PERIODS.some(([k]) => k === months)) months = '12';
    const d = await rpc('partner_dashboard', { p_months: Number(months) });
    const p = d.period || {}, pf = d.portfolio || {}, q = d.queue || {}, dc = d.decisions || {};
    const decided = Number(dc.approved || 0) + Number(dc.declined || 0);
    const first = (me.name || '').split(/\s+/)[0];

    const actions = [];
    if (Number(q.pending)) actions.push(`<a class="action-card" href="#/assinar/pending">
        <span class="action-count">${esc(q.pending)}</span>
        <span class="grow"><b>${Number(q.pending) === 1 ? 'Operação para aprovar' : 'Operações para aprovar'}</b><span class="small muted">${brl(q.pending_gross)} em duplicatas</span></span>
        <span class="action-go">Revisar <span aria-hidden="true">›</span></span></a>`);
    if (Number(q.to_pay)) actions.push(`<a class="action-card" href="#/assinar/to_pay">
        <span class="action-count">${esc(q.to_pay)}</span>
        <span class="grow"><b>${Number(q.to_pay) === 1 ? 'Aprovada para pagar' : 'Aprovadas para pagar'}</b><span class="small muted">${brl(q.to_pay_net)} aos cedentes</span></span>
        <span class="action-go">Pagar <span aria-hidden="true">›</span></span></a>`);

    el.innerHTML = `
      ${head(first ? `Olá, ${first}` : 'Painel', me.funder ? me.funder.legal_name : null, tabs(PERIODS, months))}
      ${actions.length ? `<div class="action-cards">${actions.join('')}</div>` : ''}

      <div class="dash-top">
        <div class="card hero-card">
          <span class="kpi-label">Carteira a receber</span>
          <span class="hero-value">${brl(pf.open)}</span>
          <span class="small muted">${plural(pf.items || 0, 'duplicata em aberto', 'duplicatas em aberto')} · ${brl(pf.next30)} vencem nos próximos 30 dias</span>
          ${Number(pf.overdue) ? `<div class="status-line danger"><span class="status-ico" aria-hidden="true">!</span><span><b>${brl(pf.overdue)} vencidos</b> em ${plural(pf.overdue_items, 'duplicata', 'duplicatas')}</span></div>`
            : '<div class="status-line ok"><span class="status-ico" aria-hidden="true">✓</span><span>Nenhuma duplicata vencida</span></div>'}
        </div>
        <div class="tiles">
          <div class="tile"><span class="kpi-label">Volume cedido</span><span class="tile-value">${brl(p.gross)}</span><span class="small muted">${plural(p.count || 0, 'operação paga', 'operações pagas')}</span></div>
          <div class="tile"><span class="kpi-label">Pago aos cedentes</span><span class="tile-value">${brl(p.net)}</span><span class="small muted">${plural(p.cedentes || 0, 'cedente', 'cedentes')}</span></div>
          <div class="tile"><span class="kpi-label">Taxa média</span><span class="tile-value">${p.rate != null ? pct(p.rate) : '—'}</span><span class="small muted">ao mês, ponderada</span></div>
          <div class="tile"><span class="kpi-label">Prazo médio</span><span class="tile-value">${p.days != null ? `${Math.round(p.days)} dias` : '—'}</span><span class="small muted">${decided ? `${Math.round((dc.approved / decided) * 100)}% aprovadas de ${decided}` : 'por valor das duplicatas'}</span></div>
        </div>
      </div>

      <div class="grid-2 dash-charts">
        <div class="card"><div class="card-head"><div><h2>Volume pago por mês</h2><div class="small muted">Valor de face das operações pagas</div></div></div><div id="ch-vol"></div></div>
        <div class="card"><div class="card-head"><div><h2>A receber por mês</h2><div class="small muted">Vencimento das duplicatas em aberto</div></div></div><div id="ch-mat"></div></div>
      </div>

      <div class="grid-2 dash-conc">
        ${concentration('Maiores sacados', d.top_debtors || [], Number(pf.open) || 0)}
        ${concentration('Maiores cedentes', d.top_cedentes || [], Number(pf.open) || 0)}
      </div>`;

    onTabs(el, (t) => { try { localStorage.setItem(KEY, t); } catch { /* ok */ } location.hash = `#/painel/${t}`; });
    B.columnChart(el.querySelector('#ch-vol'), (d.monthly || []).map((r, i) => ({ ...monthRow(r.month, i), value: r.gross,
      detail: r.count ? plural(r.count, 'operação', 'operações') : '' })), { name: 'Volume pago' });
    B.columnChart(el.querySelector('#ch-mat'), (d.maturities || []).map((r, i) => ({ ...monthRow(r.month, i), value: r.amount,
      detail: r.items ? plural(r.items, 'duplicata', 'duplicatas') : '' })), { name: 'A receber' });
  };
})();
