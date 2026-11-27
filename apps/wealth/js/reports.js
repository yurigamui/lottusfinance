/* Lottus Wealth — Relatórios: janela com as opções (PDF e planilha) e documentos no estilo da marca do grupo (ou Lottus). */
(function () {
  'use strict';
  const { esc, ico } = W;
  const curId = () => W.curId();
  const MAXROWS = 3000;
  const CLASS = { acao: 'Renda Variável', fii: 'Renda Variável', etf: 'Renda Variável', bdr: 'Renda Variável', tesouro: 'Renda Fixa', rf_pos: 'Renda Fixa', rf_pre: 'Renda Fixa', rf_ipca: 'Renda Fixa', fundo: 'Fundos', cripto: 'Criptoativos' };
  const TXK = { compra: 'Compra', venda: 'Venda', provento: 'Provento' };
  const RPT = [
    ['posicao', 'trend', 'Patrimônio e posição', 'Patrimônio líquido, alocação por classe e posição de cada ativo hoje.', false],
    ['invest', 'list', 'Transações de investimentos', 'Compras, vendas e proventos, com o valor total de cada operação.', true],
    ['gastos', 'receipt', 'Extrato de gastos', 'Receitas e despesas classificadas por contraparte, centro de custo e grupo.', true],
  ];
  W.acts['reports-open'] = () => {
    const w = (W.state.wallets || []).find((x) => x.id === curId()) || {};
    W.modal({ title: 'Relatórios', wide: true, body: `<p class="muted small rpt-lead">Escolha o relatório e o formato. O PDF sai com ${w.brand ? 'a marca do seu grupo' : 'o estilo Lottus (com o plano Fund, ele usa a sua marca)'}; a planilha abre no Excel e no Google Planilhas.</p>
      <div class="rpt-grid">${RPT.map(([k, icon, t, d, period]) => `<form class="rpt-card" data-form="report" data-kind="${k}"><div class="rpt-ico">${ico(icon)}</div><div class="rpt-body"><b>${t}</b><p class="muted small">${d}</p></div>${period ? `<div class="field"><label>Período</label>${W.rangeHtml('', '')}</div>` : '<div class="rpt-spacer"></div>'}<div class="rpt-actions"><button class="btn sm" type="submit" name="fmt" value="print">${ico('file')} PDF</button><button class="btn secondary sm" type="submit" name="fmt" value="csv">${ico('download')} Planilha</button></div></form>`).join('')}</div>` });
  };
  document.addEventListener('submit', (e) => { const f = e.target.closest('form[data-form=report]'); if (f) f._fmt = e.submitter ? e.submitter.value : 'csv'; }, true);

  async function allRows(fn, args, max) { const rows = []; let total = 0; for (let p = 1; p <= 400; p++) { const r = await fn({ ...args, p_page: p }); rows.push(...r.rows); total = r.total; if (rows.length >= r.total || rows.length >= max) break; } return { rows: rows.slice(0, max), total }; }

  W.forms.report = async (f, e) => {
    const id = curId(); const kind = f.dataset.kind; const fmt = (e && e.submitter && e.submitter.value) || f._fmt || 'csv'; const v = W.form(f);
    const wal = (W.state.wallets || []).find((w) => w.id === id) || {}; const name = wal.name || 'carteira';
    const file = (n) => `lottus-wealth_${name.replace(/[^\w]+/g, '-').toLowerCase()}_${n}_${W.ymd()}.csv`;
    const per = v.from || v.to ? `${v.from ? W.dt(v.from) : 'início'} a ${v.to ? W.dt(v.to) : W.dt(W.ymd())}` : 'todo o período';
    if (kind === 'posicao') {
      const [nw, pos] = await Promise.all([W.rpc('w_networth', { p_wallet: id, p_mode: 'curva' }), W.rpc('w_positions', { p_wallet: id, p_mode: 'curva' })]);
      if (fmt === 'csv') return W.download(file('posicao'), W.csv([['Ativo', 'Classe', 'Tipo', 'Quantidade', 'PU médio', 'PU', 'Data do PU', 'Vencimento', 'Valor investido', 'Valor atualizado', 'Resultado', 'Resultado %', 'Peso'], ...pos.map((p) => [p.ticker || p.name, CLASS[p.kind] || 'Outros ativos', W.ASSET_KIND[p.kind] || p.kind, p.qty, p.avg_pu, p.pu_view, p.pu_date, p.maturity || '', p.invested, p.value, p.result, p.result_pct, p.weight]), [], ['Patrimônio líquido', nw.total], ['Investimentos', nw.investimentos], ['Contas', nw.contas]]));
      const byClass = new Map(); for (const p of pos) { const k = CLASS[p.kind] || 'Outros ativos'; const g = byClass.get(k) || { value: 0, inv: 0, res: 0 }; g.value += Number(p.value); g.inv += Number(p.invested); g.res += Number(p.result); byClass.set(k, g); }
      const tv = pos.reduce((s, p) => s + Number(p.value), 0), ti = pos.reduce((s, p) => s + Number(p.invested), 0), tr = pos.reduce((s, p) => s + Number(p.result), 0);
      const sorted = [...pos].sort((a, b) => (CLASS[a.kind] || 'Outros ativos').localeCompare(CLASS[b.kind] || 'Outros ativos') || Number(b.value) - Number(a.value));
      W.closeModal();
      return printDoc(wal, { title: 'Patrimônio e posição', sub: `Posição em ${W.dt(W.ymd())} · valorizada na curva`,
        kpis: [['Patrimônio líquido', W.brl(nw.total)], ['Investimentos', W.brl(nw.investimentos)], ['Contas bancárias', W.brl(nw.contas)], ['Resultado', `${W.sign(nw.resultado, W.brl)}${nw.rentabilidade === null ? '' : ` (${W.sign(nw.rentabilidade, (x) => W.pct(x, 2))})`}`, W.cls(nw.resultado)]],
        sections: [
          { title: 'Alocação por classe', head: ['Classe', 'Valor atualizado', '% dos investimentos', 'Resultado'], num: [1, 2, 3], rows: [...byClass.entries()].sort((a, b) => b[1].value - a[1].value).map(([k, g]) => [k, W.brl(g.value), tv > 0 ? W.pct(g.value / tv, 1) : '—', W.sign(g.res, W.brl)]), foot: ['Total', W.brl(tv), '100%', W.sign(tr, W.brl)] },
          { title: 'Posição por ativo', head: ['Ativo', 'Classe', 'Vencimento', 'Quantidade', 'Valor investido', 'Valor atualizado', 'Resultado', 'Peso'], num: [3, 4, 5, 6, 7], rows: sorted.map((p) => [p.ticker || p.name, CLASS[p.kind] || 'Outros ativos', p.maturity ? W.dt(p.maturity) : '—', W.qty(p.qty), W.brl(p.invested), W.brl(p.value), W.sign(p.result, W.brl), W.pct(p.weight || 0, 1)]), foot: ['Total', '', '', '', W.brl(ti), W.brl(tv), W.sign(tr, W.brl), '100%'] },
        ], note: 'Valores com base nos P.U. mais recentes disponíveis; renda fixa pela curva contratada.' });
    }
    if (kind === 'invest') {
      const { rows, total } = await allRows((a) => W.rpc('w_tx_list', { p_wallet: id, p_filters: { from: v.from, to: v.to }, p_page: a.p_page }), {}, fmt === 'csv' ? 100000 : MAXROWS);
      if (fmt === 'csv') return W.download(file('investimentos'), W.csv([['Data', 'Tipo', 'Ativo', 'Quantidade', 'PU', 'Total', 'Custodiante', 'Origem'], ...rows.map((t) => [t.date, t.kind, t.ticker || t.asset, t.qty, t.unit_price, t.total, t.custodian, t.source])]));
      const sum = (k) => rows.filter((t) => t.kind === k).reduce((s, t) => s + Number(t.total || 0), 0);
      W.closeModal();
      return printDoc(wal, { title: 'Transações de investimentos', sub: `Período: ${per}`, kpis: [['Compras', W.brl(sum('compra'))], ['Vendas', W.brl(sum('venda'))], ['Proventos', W.brl(sum('provento'))], ['Operações', String(total)]],
        sections: [{ title: 'Operações', head: ['Data', 'Tipo', 'Ativo', 'Quantidade', 'P.U.', 'Total', 'Custodiante'], num: [3, 4, 5], rows: rows.map((t) => [W.dt(t.date), TXK[t.kind] || t.kind, t.ticker || t.asset, W.qty(t.qty), W.num(t.unit_price, 4), W.brl(t.total), t.custodian || '—']) }],
        note: total > rows.length ? `Mostrando as ${rows.length} primeiras de ${total} operações; a planilha traz todas.` : '' });
    }
    const cad = (await W.rpc('w_cad_list', { p_wallet: id })).cadastros; const nm = (x) => (cad.find((c) => c.id === x) || {}).name || '';
    const { rows, total } = await allRows((a) => W.rpc('w_spend_list', { p_wallet: id, p_filters: { from: v.from, to: v.to }, p_page: a.p_page }), {}, fmt === 'csv' ? 100000 : MAXROWS);
    if (fmt === 'csv') return W.download(file('gastos'), W.csv([['Data', 'Conta', 'Descrição', 'Valor', 'Tipo', 'Contraparte', 'Centro de custo', 'Grupo', 'Transferência'], ...rows.map((t) => [t.date, t.account, t.description, t.amount, t.amount >= 0 ? 'Receita' : 'Despesa', nm(t.counterparty_id), nm(t.cost_center_id), nm(t.group_id), t.is_transfer ? 'Sim' : ''])]));
    const real = rows.filter((t) => !t.is_transfer); const rec = real.filter((t) => t.amount >= 0).reduce((s, t) => s + Number(t.amount), 0), des = real.filter((t) => t.amount < 0).reduce((s, t) => s + Number(t.amount), 0);
    W.closeModal();
    return printDoc(wal, { title: 'Extrato de gastos', sub: `Período: ${per}`, kpis: [['Receitas', W.brl(rec), 'pos'], ['Despesas', W.brl(Math.abs(des))], ['Saldo do período', W.sign(rec + des, W.brl), W.cls(rec + des)], ['Lançamentos', String(total)]],
      sections: [{ title: 'Lançamentos', head: ['Data', 'Descrição', 'Contraparte', 'Centro de custo', 'Valor'], num: [4], rows: rows.map((t) => [W.dt(t.date), t.description + (t.is_transfer ? ' (transferência)' : ''), nm(t.counterparty_id) || '—', nm(t.cost_center_id) || '—', W.sign(t.amount, W.brl)]) }],
      note: `Transferências entre as suas contas ficam fora dos totais.${total > rows.length ? ` Mostrando os ${rows.length} primeiros de ${total} lançamentos; a planilha traz todos.` : ''}` });
  };

  // documento para impressão / PDF: cabeçalho da marca, resumo em cartões, tabelas com cabeçalho repetido, rodapé com a página
  function printDoc(w, d) {
    const b = w.brand || null; const hex = (c, x) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : x);
    const c1 = hex(b && b.color, '#c73053'), c2 = hex(b && b.color2, '#1a1a1a');
    const font = { serif: "Georgia,'Times New Roman',serif", mono: 'ui-monospace,Menlo,Consolas,monospace' }[b && b.font] || "'Inter',system-ui,sans-serif";
    const brandName = (b && b.brand_name) || 'Lottus Wealth';
    const logo = b && b.logo_url && /^https:\/\//i.test(b.logo_url) ? `<img alt="" src="${esc(b.logo_url)}" class="rp-logo">` : `<span class="rp-mark">${esc(W.initials(brandName))}</span>`;
    const tbl = (s) => `<h2>${esc(s.title)}</h2><table><thead><tr>${s.head.map((h, i) => `<th class="${(s.num || []).includes(i) ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${s.rows.length ? s.rows.map((r) => `<tr>${r.map((c, i) => `<td class="${(s.num || []).includes(i) ? 'num' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${s.head.length}" class="rp-empty">Nada a mostrar neste período.</td></tr>`}</tbody>${s.foot ? `<tfoot><tr>${s.foot.map((c, i) => `<td class="${(s.num || []).includes(i) ? 'num' : ''}">${esc(c)}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
    const root = document.createElement('div'); root.id = 'print-root'; root.setAttribute('style', `--rp1:${c1};--rp2:${c2};font-family:${font}`);
    root.innerHTML = `<div class="rp-head">${logo}<div class="rp-ttl"><div class="rp-brand">${esc(brandName)}</div><div class="rp-sub">${esc(w.name || '')}</div></div><div class="rp-doc"><b>${esc(d.title)}</b><span>${esc(d.sub || '')}</span></div></div>
      ${d.kpis && d.kpis.length ? `<div class="rp-kpis">${d.kpis.map(([l, v, c]) => `<div><span>${esc(l)}</span><b class="${c || ''}">${esc(v)}</b></div>`).join('')}</div>` : ''}
      ${d.sections.map(tbl).join('')}${d.note ? `<p class="rp-note">${esc(d.note)}</p>` : ''}
      <p class="rp-note">Documento informativo, sem valor de extrato oficial de custódia.</p>
      <div class="rp-foot"><span>${esc(brandName)} · ${esc(w.name || '')}</span><span>Gerado em ${W.dt(W.ymd())}</span></div>`;
    document.body.appendChild(root); window.addEventListener('afterprint', () => root.remove(), { once: true }); setTimeout(() => window.print(), 80);
  }
})();
