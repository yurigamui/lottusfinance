/* Lottus Wealth — Relatórios: janela com as opções; PDF/impressão no estilo da marca do grupo (ou Lottus). */
(function () {
  'use strict';
  const { esc, ico } = W;
  const curId = () => W.curId();
  const RPT = [
    ['posicao', 'trend', 'Patrimônio e posição', 'Patrimônio líquido e posição por ativo hoje.', false, true],
    ['invest', 'list', 'Transações de investimentos', 'Compras, vendas e proventos do período.', true, false],
    ['gastos', 'receipt', 'Extrato de gastos', 'Lançamentos classificados do período.', true, false],
  ];
  W.acts['reports-open'] = () => {
    const w = (W.state.wallets || []).find((x) => x.id === curId()) || {};
    W.modal({ title: 'Relatórios', body: `<div class="stack rpt-list">${RPT.map(([k, icon, t, d, period, pdf]) => `<form class="rpt-item" data-form="report" data-kind="${k}"><div class="rpt-head"><span class="org-mark">${ico(icon)}</span><div><b>${t}</b><div class="muted small">${d}</div></div></div>${period ? `<div class="field"><label>Período</label>${W.rangeHtml('', '')}</div>` : ''}<div class="row"><button class="btn sm" type="submit" name="fmt" value="csv">${ico('download')} Planilha (CSV)</button>${pdf ? `<button class="btn secondary sm" type="submit" name="fmt" value="print">${ico('file')} PDF / imprimir</button>` : ''}</div></form>`).join('')}</div><p class="muted small" style="margin-top:12px">${w.brand ? 'O PDF usa a marca do seu grupo.' : 'O PDF usa o estilo Lottus. Com o plano Fund ele passa a usar a sua marca.'}</p>` });
  };
  document.addEventListener('submit', (e) => { const f = e.target.closest('form[data-form=report]'); if (f) f._fmt = e.submitter ? e.submitter.value : 'csv'; }, true);
  W.forms.report = async (f, e) => {
    const id = curId(); const kind = f.dataset.kind; const fmt = (e && e.submitter && e.submitter.value) || f._fmt || 'csv'; const v = W.form(f);
    const wal = (W.state.wallets || []).find((w) => w.id === id) || {}; const name = wal.name || 'carteira';
    const file = (n) => `lottus-wealth_${name.replace(/[^\w]+/g, '-').toLowerCase()}_${n}_${W.ymd()}.csv`;
    if (kind === 'posicao') {
      const mode = wal.view_mode || 'curva';
      const [nw, pos] = await Promise.all([W.rpc('w_networth', { p_wallet: id, p_mode: mode }), W.rpc('w_positions', { p_wallet: id, p_mode: mode })]);
      if (fmt === 'csv') return W.download(file('posicao'), W.csv([['Ativo', 'Tipo', 'Quantidade', 'PU médio', 'PU', 'Data do PU', 'Vencimento', 'Valor', 'Resultado', 'Peso'], ...pos.map((p) => [p.ticker || p.name, W.ASSET_KIND[p.kind] || p.kind, p.qty, p.avg_pu, p.pu_view, p.pu_date, p.maturity || '', p.value, p.result, p.weight]), [], ['Patrimônio líquido', nw.total], ['Investimentos', nw.investimentos], ['Contas', nw.contas]]));
      W.closeModal(); return printReport(wal, nw, pos);
    }
    if (kind === 'invest') {
      const rows = []; for (let p = 1; p <= 200; p++) { const r = await W.rpc('w_tx_list', { p_wallet: id, p_filters: { from: v.from, to: v.to }, p_page: p }); rows.push(...r.rows); if (rows.length >= r.total) break; }
      return W.download(file('investimentos'), W.csv([['Data', 'Tipo', 'Ativo', 'Quantidade', 'PU', 'Total', 'Custodiante', 'Origem'], ...rows.map((t) => [t.date, t.kind, t.ticker || t.asset, t.qty, t.unit_price, t.total, t.custodian, t.source])]));
    }
    const cad = (await W.rpc('w_cad_list', { p_wallet: id })).cadastros; const nm = (x) => (cad.find((c) => c.id === x) || {}).name || '';
    const rows = []; for (let p = 1; p <= 400; p++) { const r = await W.rpc('w_spend_list', { p_wallet: id, p_filters: { from: v.from, to: v.to }, p_page: p }); rows.push(...r.rows); if (rows.length >= r.total) break; }
    return W.download(file('gastos'), W.csv([['Data', 'Conta', 'Descrição', 'Valor', 'Tipo', 'Contraparte', 'Centro de custo', 'Grupo', 'Transferência'], ...rows.map((t) => [t.date, t.account, t.description, t.amount, t.amount >= 0 ? 'Receita' : 'Despesa', nm(t.counterparty_id), nm(t.cost_center_id), nm(t.group_id), t.is_transfer ? 'Sim' : ''])]));
  };
  function printReport(w, nw, pos) {
    const b = w.brand || null; const hex = (c, d) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : d);
    const c1 = hex(b && b.color, '#c73053'), c2 = hex(b && b.color2, '#1a1a1a');
    const font = { serif: "Georgia,'Times New Roman',serif", mono: 'ui-monospace,Menlo,Consolas,monospace' }[b && b.font] || "'Inter',system-ui,sans-serif";
    const logo = b && b.logo_url && /^https:\/\//i.test(b.logo_url) ? `<img alt="" src="${esc(b.logo_url)}" class="rp-logo">` : `<span class="rp-mark">${esc(W.initials((b && b.brand_name) || 'Lottus'))}</span>`;
    const root = document.createElement('div'); root.id = 'print-root'; root.setAttribute('style', `--rp1:${c1};--rp2:${c2};font-family:${font}`);
    root.innerHTML = `<div class="rp-head">${logo}<div><div class="rp-brand">${esc((b && b.brand_name) || 'Lottus Wealth')}</div><div class="rp-sub">${esc(w.name || '')} · posição em ${W.dt(W.ymd())}</div></div></div>
      <div class="rp-kpis"><div><span>Patrimônio líquido</span><b>${W.brl(nw.total)}</b></div><div><span>Investimentos</span><b>${W.brl(nw.investimentos)}</b></div><div><span>Contas</span><b>${W.brl(nw.contas)}</b></div></div>
      <h2>Posição</h2><table><thead><tr><th>Ativo</th><th class="num">Qtd</th><th class="num">P.U.</th><th>Vencimento</th><th class="num">Valor</th><th class="num">Resultado</th><th class="num">Peso</th></tr></thead><tbody>${pos.map((p) => `<tr><td>${esc(p.ticker || p.name)}</td><td class="num">${W.qty(p.qty)}</td><td class="num">${W.num(p.pu_view, 4)}</td><td>${p.maturity ? W.dt(p.maturity) : '—'}</td><td class="num">${W.brl(p.value)}</td><td class="num">${W.brl(p.result)}</td><td class="num">${W.pct(p.weight, 1)}</td></tr>`).join('')}</tbody></table>
      <p class="rp-note">Valores com base nos P.U. mais recentes disponíveis. Documento informativo, sem valor de extrato oficial de custódia.</p>`;
    document.body.appendChild(root); window.addEventListener('afterprint', () => root.remove(), { once: true }); setTimeout(() => window.print(), 50);
  }
})();
