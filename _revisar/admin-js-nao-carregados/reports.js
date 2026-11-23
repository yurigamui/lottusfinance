/* Lottus Partners — extrato em CSV (conciliação) e relatório por período em PDF */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, pct, date, cnpj, modal, closeModal, toast } = B;

  const MONTH_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const STATUS = { open: 'Em aberto', paid: 'Recebida', cancelled: 'Cancelada' };
  const num = (v) => (v == null || v === '' ? '' : Number(v).toFixed(2).replace('.', ','));
  const brDate = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
  const monthRange = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`];
  };
  const monthName = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTH_LONG[m - 1]} de ${y}`; };

  /** CSV com ; e vírgula decimal (abre direto no Excel em português) */
  function download(name, rows) {
    const cell = (v) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /** Extrato de duplicatas para conciliação */
  B.statementCsv = (rows, name) => download(name, [
    ['Operação', 'Paga ao cedente em', 'Cedente', 'CNPJ do cedente', 'Sacado', 'CNPJ do sacado', 'NF-e', 'Parcela', 'Vencimento',
      'Valor de face', 'Deságio', 'IOF', 'Pago ao cedente', 'Taxa (% a.m.)', 'Prazo (dias)', 'Situação', 'Recebida em', 'Nosso número', 'Comprovante do pagamento'],
    ...rows.map((r) => [r.operation_id, brDate(r.paid_at), r.cedente, cnpj(r.cedente_cnpj), r.sacado, cnpj(r.sacado_cnpj), r.nfe, r.parcela,
      brDate(r.due_date), num(r.face), num(r.discount), num(r.iof), num(r.paid_to_cedente), num(Number(r.rate) * 100), r.days,
      STATUS[r.charge_status] || r.charge_status, brDate(r.received_at), r.our_number || '', r.payout_reference || '']),
  ]);

  /** Lista de operações da tela, como está filtrada */
  B.operationsCsv = (list, name) => download(name, [
    ['Operação', 'Pedida em', 'Cedente', 'CNPJ', 'Nota Lottus', 'Valor de face', 'Pago ao cedente', 'Taxa (% a.m.)', 'Parcelas', '1º vencimento', 'Situação'],
    ...list.map((o) => [o.id, brDate(o.created_at), o.legal_name, cnpj(o.cnpj), o.tier || '', num(o.gross), num(o.net), num(Number(o.monthly_rate) * 100),
      o.items, brDate(o.first_due), o._state || '']),
  ]);

  /* ===================================================== relatório por período */
  const MON3 = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const ROSA = '#C73053', INK = '#2b2321', MUTED = '#6b605a', LINE = '#ece8e1', GRAY = '#b8aea7';
  const N = (v) => Number(v || 0);
  const pc = (v, d = 2) => (v == null || !isFinite(v) ? '—' : `${(Number(v) * 100).toFixed(d).replace('.', ',')}%`);
  const brlK = (v) => {
    const n = N(v), a = Math.abs(n);
    if (a >= 1e6) return `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (a >= 1e3) return `R$ ${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return brl(n);
  };
  /** Rampa de um tom só (rosa), do mais claro ao mais escuro: notas melhores ficam mais escuras */
  function ramp(n) {
    const a = [242, 196, 207], b = [110, 18, 44];
    return Array.from({ length: n }, (_, i) => {
      const t = n === 1 ? 1 : i / (n - 1);
      return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * t)).join(',')})`;
    });
  }
  /** Eixo com passos "redondos": devolve o topo e as marcas */
  function axis(v) {
    if (!(v > 0)) return { max: 1, ticks: [0, 1] };
    const raw = v / 4, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
    const max = Math.ceil(v / step) * step;
    return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step) };
  }

  /** Rosca: fatias com 2px de folga, rótulos de % fora */
  function donutSvg(rows, colors) {
    const total = rows.reduce((s, r) => s + N(r.amount), 0);
    if (!total) return '<div class="empty">Sem carteira no fim do período.</div>';
    const R = 62, r = 38, cx = 90, cy = 80;
    let ang = -Math.PI / 2, out = '';
    rows.forEach((x, i) => {
      const frac = N(x.amount) / total, a2 = ang + frac * Math.PI * 2;
      const large = a2 - ang > Math.PI ? 1 : 0;
      const p = (rad, rr) => `${(cx + rr * Math.cos(rad)).toFixed(2)},${(cy + rr * Math.sin(rad)).toFixed(2)}`;
      out += frac >= 0.9999
        ? `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${colors[i]}" stroke-width="${R - r}"/>`
        : `<path d="M${p(ang, R)} A${R},${R} 0 ${large} 1 ${p(a2, R)} L${p(a2, r)} A${r},${r} 0 ${large} 0 ${p(ang, r)} Z" fill="${colors[i]}" stroke="#fff" stroke-width="2"/>`;
      if (frac >= 0.04) {
        const mid = (ang + a2) / 2;
        out += `<text x="${(cx + (R + 14) * Math.cos(mid)).toFixed(1)}" y="${(cy + (R + 14) * Math.sin(mid) + 3).toFixed(1)}" text-anchor="${Math.cos(mid) >= 0 ? 'start' : 'end'}" class="lbl">${pc(frac, 1)}</text>`;
      }
      ang = a2;
    });
    return `<svg viewBox="0 0 200 160" class="donut" role="img" aria-label="Carteira por nota">${out}</svg>`;
  }

  /** Área: carteira a receber ao longo do período */
  function areaSvg(series) {
    const W = 860, H = 210, L = 64, B = 30, T = 10, Rr = 12;
    if (!series.length) return '';
    const ax = axis(Math.max(...series.map((s) => N(s.open)))), max = ax.max;
    const x = (i) => L + (series.length === 1 ? 0 : (i / (series.length - 1)) * (W - L - Rr));
    const y = (v) => T + (1 - N(v) / max) * (H - T - B);
    const pts = series.map((s, i) => `${x(i).toFixed(1)},${y(s.open).toFixed(1)}`);
    const grid = ax.ticks.map((t) => `<line x1="${L}" x2="${W - Rr}" y1="${y(t)}" y2="${y(t)}" class="grid"/>
      <text x="${L - 8}" y="${y(t) + 3}" text-anchor="end" class="ax">${brlK(t)}</text>`).join('');
    const every = Math.max(1, Math.ceil(series.length / 12));
    const ticks = series.map((s, i) => (i % every === 0 || i === series.length - 1)
      ? `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="ax">${date(s.day).slice(0, 5)}</text>` : '').join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Evolução da carteira">${grid}
      <path d="M${pts[0].split(',')[0]},${y(0)} L${pts.join(' L')} L${x(series.length - 1)},${y(0)} Z" fill="${ROSA}" fill-opacity=".14"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="${ROSA}" stroke-width="2" stroke-linejoin="round"/>
      <line x1="${L}" x2="${W - Rr}" y1="${y(0)}" y2="${y(0)}" class="base"/>${ticks}</svg>`;
  }

  /** Colunas: volume cedido por mês (12 meses) */
  function columnsSvg(rows) {
    const W = 860, H = 200, L = 64, B = 28, T = 16;
    const ax = axis(Math.max(...rows.map((r) => N(r.volume)), 0)), max = ax.max;
    const bw = (W - L) / rows.length, w = Math.min(34, bw * 0.6);
    const y = (v) => T + (1 - N(v) / max) * (H - T - B);
    const grid = ax.ticks.map((t) => `<line x1="${L}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 8}" y="${y(t) + 3}" text-anchor="end" class="ax">${brlK(t)}</text>`).join('');
    const top = Math.max(...rows.map((r) => N(r.volume)));
    const bars = rows.map((r, i) => {
      const cx = L + bw * i + bw / 2, v = N(r.volume), h = y(0) - y(v);
      const [yy, mm] = r.month.split('-');
      const lab = v > 0 && (v === top || i === rows.length - 1) ? `<text x="${cx}" y="${y(v) - 5}" text-anchor="middle" class="val">${brlK(v)}</text>` : '';
      const bar = v > 0 ? `<path d="M${cx - w / 2},${y(0)} V${y(v) + Math.min(4, h)} q0,-${Math.min(4, h)} ${Math.min(4, w / 2)},-${Math.min(4, h)} H${cx + w / 2 - Math.min(4, w / 2)} q${Math.min(4, w / 2)},0 ${Math.min(4, w / 2)},${Math.min(4, h)} V${y(0)} Z" fill="${ROSA}"/>` : '';
      return `${bar}${lab}<text x="${cx}" y="${H - 9}" text-anchor="middle" class="ax">${MON3[Number(mm) - 1].toLowerCase()}/${yy.slice(2)}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Volume cedido por mês">${grid}${bars}<line x1="${L}" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="base"/></svg>`;
  }

  /** Barras horizontais: resultado do período por nota do cedente */
  function hbarsSvg(rows) {
    if (!rows.length) return '<div class="empty">Sem operações no período.</div>';
    const W = 420, rowH = 30, L = 70, Rr = 80, H = rows.length * rowH + 10;
    const max = Math.max(...rows.map((r) => N(r.result)), 0.01);
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Resultado por nota do cedente">${rows.map((r, i) => {
      const yy = 6 + i * rowH, w = Math.max(2, (N(r.result) / max) * (W - L - Rr));
      return `<text x="${L - 10}" y="${yy + 15}" text-anchor="end" class="ax strong">${esc(r.rating)}</text>
        <rect x="${L}" y="${yy + 4}" width="${w}" height="16" rx="4" fill="${ROSA}"/>
        <text x="${L + w + 6}" y="${yy + 16}" class="val">${brl(r.result)}</text>`;
    }).join('')}</svg>`;
  }

  async function fullReport(from, to, me) {
    const w = window.open('', '_blank');
    if (!w) { toast('Permita janelas deste site para gerar o relatório.', true); return; }
    w.document.write('<p style="font-family:sans-serif;padding:24px">Montando o relatório…</p>');
    const d = await rpc('partner_report', { p_from: from, p_to: to });
    const s = d.summary || {};
    const fund = d.fund.trade_name || d.fund.legal_name;
    const period = `${date(d.from)} a ${date(d.to)}`;
    // Logo embutido (a janela do relatório nem sempre carrega arquivos do site)
    const logo = await fetch('img/logo-rosa.png').then((r) => r.blob()).then((b) => new Promise((res) => {
      const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b);
    })).catch(() => null);

    // Carteira por nota do cedente (rosca) — notas da melhor para a pior, mais escuras primeiro
    const byRating = [...(d.by_cedente_rating || [])].reverse();
    const named = byRating.filter((r) => r.rating !== 'Sem nota');
    const cols = ramp(named.length).reverse();
    const colors = byRating.map((r) => (r.rating === 'Sem nota' ? GRAY : cols[named.indexOf(r)]));
    const totalOpen = byRating.reduce((t, r) => t + N(r.amount), 0);

    // Resultado: período, ano, 12 e 24 meses (pelo mês a mês)
    const mon = d.monthly || [];
    const yearOf = d.to.slice(0, 4);
    const agg = (list) => {
      const vol = list.reduce((t, m) => t + N(m.volume), 0), res = list.reduce((t, m) => t + N(m.result), 0);
      const rate = vol ? list.reduce((t, m) => t + N(m.rate) * N(m.volume), 0) / vol : null;
      return { vol, res, rate, ret: vol - res > 0 ? res / (vol - res) : null, rec: list.reduce((t, m) => t + N(m.received), 0) };
    };
    const cmp = [
      ['Período', { vol: N(s.volume), res: N(s.result), rate: s.rate, ret: s.result_pct, rec: N(s.received) }],
      [`Ano (${yearOf})`, agg(mon.filter((m) => m.month.startsWith(yearOf)))],
      ['12 meses', agg(mon.slice(-12))],
      ['24 meses', agg(mon)],
    ];

    // Mês a mês, por ano (os dois últimos anos)
    const years = [...new Set(mon.map((m) => m.month.slice(0, 4)))].slice(-2).reverse();
    const cell = (y, k, f) => MON3.map((_, i) => { const m = mon.find((x) => x.month === `${y}-${String(i + 1).padStart(2, '0')}`); return `<td class="num">${m && N(m[k]) ? f(m[k]) : '-'}</td>`; }).join('');
    const yearTot = (y) => agg(mon.filter((m) => m.month.startsWith(y)));

    // Vencimentos (com acumulado)
    let acc = 0;
    const mats = (d.maturities || []).map((m) => { acc += N(m.amount); return { ...m, acc }; });
    const matTot = acc;

    const sum = (rows, k) => rows.reduce((t, r) => t + N(r[k]), 0);
    const ops = d.operations || [];
    const OPS_PER_PAGE = 16;
    const opPages = []; for (let i = 0; i < Math.max(ops.length, 1); i += OPS_PER_PAGE) opPages.push(ops.slice(i, i + OPS_PER_PAGE));

    const head = `<header class="ph">${logo ? `<img src="${logo}" alt="Lottus" class="logo">` : '<b class="brand">Lottus</b>'}<div class="meta"><span><b>Fundo</b> ${esc(fund)}</span><span class="sep"></span><span><b>Período do relatório</b> ${esc(period)}</span></div></header>`;
    const card = (title, sub, body, cls = '') => `<section class="card ${cls}"><div class="ch"><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div><div class="cb">${body}</div></section>`;

    const pages = [];
    // ---------------------------------------------------------------- página 1
    pages.push(`<div class="row3">
      ${card('Resumo', 'Dados gerais da carteira', `
        <div class="big"><span>Carteira a receber</span><b>${brl(s.portfolio)}</b></div>
        <div class="big"><span>Resultado no período (deságio)</span><b>${brl(s.result)}</b></div>
        <div class="big"><span>Retorno no período</span><b>${pc(s.result_pct)}</b></div>
        <dl class="kv"><dt>Taxa média</dt><dd>${pc(s.rate)} a.m.</dd><dt>Prazo médio</dt><dd>${s.days != null ? Math.round(s.days) + ' dias' : '—'}</dd>
          <dt>Vencido sem pagamento</dt><dd>${brl(s.overdue)} · ${pc(N(s.portfolio) ? N(s.overdue) / N(s.portfolio) : null)}</dd></dl>`)}
      ${card('Movimentos do período', 'Dinheiro que entrou e saiu.', `<table><thead><tr><th>Movimento</th><th class="num">Valor</th></tr></thead><tbody>
          <tr><td>Volume cedido (valor de face)</td><td class="num">${brl(s.volume)}</td></tr>
          <tr><td>Pago aos cedentes</td><td class="num">${brl(-N(s.paid_to_cedentes))}</td></tr>
          <tr><td>Recebido dos sacados</td><td class="num">${brl(s.received)}</td></tr>
          <tr><td>Operações · duplicatas</td><td class="num">${N(s.operations)} · ${N(s.items)}</td></tr>
          <tr><td>Cedentes · sacados</td><td class="num">${N(s.cedentes)} · ${N(s.sacados)}</td></tr></tbody>
          <tfoot><tr><td>Saldo do período</td><td class="num">${brl(N(s.received) - N(s.paid_to_cedentes))}</td></tr></tfoot></table>`)}
      ${card('Carteira por nota do cedente', 'Distribuição da carteira a receber pela nota da Lottus.', totalOpen ? `<div class="donut-wrap">${donutSvg(byRating, colors)}
          <ul class="legend">${byRating.map((r, i) => `<li><i style="background:${colors[i]}"></i><span>${esc(r.rating)}</span><b>${brlK(r.amount)}</b></li>`).join('')}</ul></div>` : '<div class="empty">Sem carteira no fim do período.</div>')}
    </div>
    ${card('Evolução da carteira', 'Carteira a receber ao longo do período.', areaSvg(d.evolution || []), 'wide')}`);

    // ---------------------------------------------------------------- página 2
    pages.push(`${card('Volume cedido por mês', 'Valor de face das operações pagas pelo fundo, nos últimos 12 meses.', columnsSvg(mon.slice(-12)), 'wide')}
    ${card('Resultado financeiro', 'Resultado do fundo nas operações da Lottus.', `<table><thead><tr><th></th>${cmp.map(([l]) => `<th class="num">${esc(l)}</th>`).join('')}</tr></thead><tbody>
      <tr><td>Volume cedido</td>${cmp.map(([, x]) => `<td class="num">${brl(x.vol)}</td>`).join('')}</tr>
      <tr><td>Resultado (deságio)</td>${cmp.map(([, x]) => `<td class="num">${brl(x.res)}</td>`).join('')}</tr>
      <tr><td>Retorno sobre o pago</td>${cmp.map(([, x]) => `<td class="num">${pc(x.ret)}</td>`).join('')}</tr>
      <tr><td>Taxa média ao mês</td>${cmp.map(([, x]) => `<td class="num">${pc(x.rate)}</td>`).join('')}</tr>
      <tr><td>Recebido dos sacados</td>${cmp.map(([, x]) => `<td class="num">${brl(x.rec)}</td>`).join('')}</tr></tbody></table>`, 'wide')}`);

    // ---------------------------------------------------------------- página 3
    pages.push(`${card('Volume e resultado mês a mês', 'Volume cedido e resultado (deságio) de cada mês.', `<table class="months"><thead><tr><th></th>${MON3.map((m) => `<th class="num">${m}</th>`).join('')}<th class="num">ANO</th></tr></thead><tbody>
      ${years.map((y, yi) => `<tr class="${yi % 2 ? 'alt' : ''}"><td><b>${y}</b> volume</td>${cell(y, 'volume', brlK)}<td class="num"><b>${brlK(yearTot(y).vol)}</b></td></tr>
        <tr class="${yi % 2 ? 'alt' : ''}"><td>resultado</td>${cell(y, 'result', brlK)}<td class="num"><b>${brlK(yearTot(y).res)}</b></td></tr>
        <tr class="${yi % 2 ? 'alt' : ''}"><td>taxa média</td>${cell(y, 'rate', (v) => pc(v))}<td class="num"><b>${pc(yearTot(y).rate)}</b></td></tr>`).join('')}</tbody></table>`, 'wide')}
    <div class="row2">
      ${card('Vencimentos da carteira', 'Quando a carteira a receber vence, a partir do fim do período.', mats.length ? `<table><thead><tr><th>Prazo</th><th class="num">Valor</th><th class="num">%</th><th class="num">Acumulado</th><th class="num">% acum.</th></tr></thead><tbody>
        ${mats.map((m) => `<tr${m.bucket === 'Vencido' ? ' class="warn"' : ''}><td>${esc(m.bucket)}</td><td class="num">${brl(m.amount)}</td><td class="num">${pc(N(m.amount) / matTot)}</td><td class="num">${brl(m.acc)}</td><td class="num">${pc(m.acc / matTot)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sem carteira no fim do período.</div>')}
      ${card('Concentração por sacado', 'Maiores sacados da carteira a receber.', (d.top_sacados || []).length ? `<table><thead><tr><th>Sacado</th><th>Nota</th><th class="num">A receber</th><th class="num">% carteira</th></tr></thead><tbody>
        ${d.top_sacados.map((x) => `<tr><td>${esc(x.name || cnpj(x.cnpj))}</td><td>${esc(x.rating || '—')}</td><td class="num">${brl(x.amount)}</td><td class="num">${pc(N(x.amount) / (N(s.portfolio) || 1))}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total dos maiores</td><td></td><td class="num">${brl(sum(d.top_sacados, 'amount'))}</td><td class="num">${pc(sum(d.top_sacados, 'amount') / (N(s.portfolio) || 1))}</td></tr></tfoot></table>` : '<div class="empty">Sem carteira no fim do período.</div>')}
    </div>`);

    // ---------------------------------------------------------------- página 4
    const rbr = d.result_by_rating || [];
    const rTot = sum(rbr, 'result');
    pages.push(`<div class="row2">
      ${card('Resultado por nota do cedente', 'Deságio das operações do período, pela nota da Lottus.', hbarsSvg(rbr))}
      ${card('Resultado por nota do cedente', 'Volume, resultado e taxa de cada nota.', rbr.length ? `<table><thead><tr><th>Nota</th><th class="num">Volume</th><th class="num">Resultado</th><th class="num">Taxa média</th><th class="num">% do resultado</th></tr></thead><tbody>
        ${rbr.map((r) => `<tr><td>${esc(r.rating)}</td><td class="num">${brl(r.volume)}</td><td class="num">${brl(r.result)}</td><td class="num">${pc(r.rate)}</td><td class="num">${pc(rTot ? N(r.result) / rTot : null)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${brl(sum(rbr, 'volume'))}</td><td class="num">${brl(rTot)}</td><td class="num">${pc(s.rate)}</td><td class="num">100%</td></tr></tfoot></table>` : '<div class="empty">Sem operações no período.</div>')}
    </div>
    <div class="row2">
      ${card('Maiores cedentes', 'Carteira a receber por cedente.', (d.top_cedentes || []).length ? `<table><thead><tr><th>Cedente</th><th>Nota</th><th class="num">A receber</th><th class="num">% carteira</th></tr></thead><tbody>
        ${d.top_cedentes.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.rating || '—')}</td><td class="num">${brl(x.amount)}</td><td class="num">${pc(N(x.amount) / (N(s.portfolio) || 1))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sem carteira no fim do período.</div>')}
      ${card('Carteira por nota do sacado', 'Carteira a receber pela nota do sacado.', (d.by_sacado_rating || []).length ? `<table><thead><tr><th>Nota</th><th class="num">A receber</th><th class="num">% carteira</th></tr></thead><tbody>
        ${d.by_sacado_rating.map((x) => `<tr><td>${esc(x.rating)}</td><td class="num">${brl(x.amount)}</td><td class="num">${pc(N(x.amount) / (N(s.portfolio) || 1))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sem carteira no fim do período.</div>')}
    </div>`);

    // ---------------------------------------------------------------- operações
    opPages.forEach((list, pi) => pages.push(card(pi ? 'Operações do período (continuação)' : 'Operações do período', 'Operações pagas pelo fundo no período.', list.length ? `<table><thead><tr><th>Pagamento</th><th>Cedente</th><th>Nota</th><th class="num">Duplicatas</th><th class="num">Valor de face</th><th class="num">Pago ao cedente</th><th class="num">Resultado</th><th class="num">Taxa</th></tr></thead><tbody>
      ${list.map((o) => `<tr><td>${date(o.paid_on)}</td><td>${esc(o.cedente)}<span class="sub">${esc(cnpj(o.cnpj))}</span></td><td>${esc(o.rating || '—')}</td><td class="num">${N(o.items)}</td><td class="num">${brl(o.face)}</td><td class="num">${brl(o.paid)}</td><td class="num">${brl(o.result)}</td><td class="num">${pc(o.rate)}</td></tr>`).join('')}</tbody>
      ${pi === opPages.length - 1 ? `<tfoot><tr><td>Total</td><td>${ops.length} operações</td><td></td><td class="num">${sum(ops, 'items')}</td><td class="num">${brl(sum(ops, 'face'))}</td><td class="num">${brl(sum(ops, 'paid'))}</td><td class="num">${brl(sum(ops, 'result'))}</td><td class="num">${pc(s.rate)}</td></tr></tfoot>` : ''}</table>` : '<div class="empty">Nenhuma operação paga no período.</div>', 'wide')));

    const total = pages.length;
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório ${esc(fund)} ${esc(period)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
        @page { size: A4 landscape; margin: 0; }
        * { box-sizing: border-box; }
        html, body { margin: 0; background: #e9e5de; }
        body { font-family: Inter, Helvetica, Arial, sans-serif; color: ${INK}; font-size: 9.5px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .page { width: 297mm; height: 210mm; padding: 9mm 11mm 8mm; background: #fff; margin: 0 auto 8mm; display: flex; flex-direction: column; gap: 4mm; overflow: hidden; page-break-after: always; break-after: page; }
        .page:last-child { page-break-after: auto; break-after: auto; }
        @media print { html, body { background: #fff; } .page { margin: 0; } }
        .ph { display: flex; justify-content: space-between; align-items: center; }
        .logo { height: 18px; }
        .meta { display: flex; gap: 10px; align-items: center; font-size: 9px; color: ${MUTED}; }
        .meta b { color: ${INK}; font-weight: 700; margin-right: 4px; }
        .meta .sep { width: 1px; height: 12px; background: #cfc6bd; }
        .body { flex: 1; display: flex; flex-direction: column; gap: 4mm; min-height: 0; }
        .pf { display: flex; justify-content: space-between; font-size: 8.5px; color: ${MUTED}; }
        .pf b { color: ${ROSA}; }
        .row3 { display: grid; grid-template-columns: 1fr 1fr 1.25fr; gap: 4mm; }
        .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
        .card { border: 1px solid ${LINE}; border-radius: 10px; overflow: hidden; background: #fff; display: flex; flex-direction: column; }
        .ch { padding: 9px 12px 8px; border-bottom: 1px solid ${LINE}; }
        .ch h2 { font-size: 10.5px; font-weight: 700; margin: 0; }
        .ch p { margin: 1px 0 0; color: ${MUTED}; font-size: 8.5px; }
        .cb { padding: 8px 12px 10px; flex: 1; }
        .big { margin-bottom: 7px; } .big span { display: block; color: ${MUTED}; font-size: 8.5px; } .big b { font-size: 15px; font-weight: 700; letter-spacing: -.01em; }
        .kv { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; margin: 8px 0 0; padding-top: 7px; border-top: 1px solid ${LINE}; }
        .kv dt { color: ${MUTED}; } .kv dd { margin: 0; text-align: right; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; font-weight: 600; color: ${MUTED}; font-size: 8.5px; padding: 6px 6px; background: #f7f5f1; border-bottom: 1px solid ${LINE}; }
        td { padding: 6px 6px; border-bottom: 1px solid ${LINE}; vertical-align: top; }
        .card table { margin: -8px -12px 0; width: calc(100% + 24px); }
        .card table th:first-child, .card table td:first-child { padding-left: 12px; } .card table th:last-child, .card table td:last-child { padding-right: 12px; }
        .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
        tfoot td { background: #fbeef1; font-weight: 700; border-bottom: none; }
        tr.alt td { background: #faf8f4; } tr.warn td { color: #b3261e; }
        .months td, .months th { padding: 5px 4px; font-size: 8.5px; }
        .sub { display: block; color: ${MUTED}; font-size: 8px; }
        .donut-wrap { display: grid; grid-template-columns: 1.1fr 1fr; align-items: center; gap: 6px; }
        .donut { width: 100%; }
        .legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; }
        .legend li { display: grid; grid-template-columns: 10px 1fr auto; gap: 6px; align-items: center; }
        .legend i { width: 10px; height: 10px; border-radius: 3px; display: block; }
        .legend b { font-weight: 600; font-variant-numeric: tabular-nums; }
        .chart { width: 100%; height: auto; display: block; }
        .chart .grid { stroke: ${LINE}; stroke-width: 1; } .chart .base { stroke: #cfc6bd; stroke-width: 1; }
        .chart .ax, .donut .lbl { font: 500 9px Inter, Helvetica, Arial, sans-serif; fill: ${MUTED}; }
        .chart .ax.strong { fill: ${INK}; font-weight: 700; }
        .chart .val { font: 600 9px Inter, Helvetica, Arial, sans-serif; fill: ${INK}; }
        .wide .cb { display: flex; flex-direction: column; justify-content: center; }
        .empty { color: ${MUTED}; padding: 16px 0; text-align: center; }
        .note { color: ${MUTED}; font-size: 8px; }
      </style></head><body>
      ${pages.map((body, i) => `<div class="page">${head}<div class="body">${body}</div>
        <footer class="pf"><span>Página ${i + 1} / ${total}</span><span>Carteira do fundo · Relatório por período · Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span><span>Lottus <b>Partners</b></span></footer></div>`).join('')}
      </body></html>`;
    w.document.open(); w.document.write(html); w.document.close();
    const go = () => { try { w.focus(); w.print(); } catch { /* janela fechada */ } };
    // Espera a fonte e o logo antes de abrir a impressão
    const imgs = [...w.document.images].map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))).filter(Boolean);
    Promise.race([Promise.all([w.document.fonts ? w.document.fonts.ready : null, ...imgs]), new Promise((r) => setTimeout(r, 4000))]).then(() => setTimeout(go, 200));
  }
  B.fullReport = fullReport;

  /** Janela "Relatórios": escolhe o período e baixa o PDF ou o extrato */
  B.openReports = (me) => {
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const now = new Date();
    const first = (y, m) => new Date(y, m, 1), last = (y, m) => new Date(y, m + 1, 0);
    const PRESETS = [
      ['mes', 'Este mês', [first(now.getFullYear(), now.getMonth()), now]],
      ['anterior', 'Mês passado', [first(now.getFullYear(), now.getMonth() - 1), last(now.getFullYear(), now.getMonth() - 1)]],
      ['tri', 'Últimos 3 meses', [first(now.getFullYear(), now.getMonth() - 2), now]],
      ['ano', 'Este ano', [new Date(now.getFullYear(), 0, 1), now]],
      ['12m', 'Últimos 12 meses', [first(now.getFullYear(), now.getMonth() - 11), now]],
    ].map(([k, l, [a, b]]) => [k, l, iso(a), iso(b)]);
    const box = modal({
      title: 'Relatórios',
      body: `<div class="stack">
        <div class="chips" role="group" aria-label="Período">${PRESETS.map(([k, l], i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-p="${k}" type="button">${esc(l)}</button>`).join('')}</div>
        <div class="grid-2"><div class="field"><label for="rf">De</label><input class="input" type="date" id="rf" value="${PRESETS[0][2]}"></div>
          <div class="field"><label for="rt">Até</label><input class="input" type="date" id="rt" value="${PRESETS[0][3]}"></div></div>
        <p class="small muted" style="margin:0">O relatório traz carteira, resultado, vencimentos, concentração e as operações do período, em PDF. O extrato lista cada duplicata, para conciliar com o banco.</p></div>`,
      foot: '<button class="btn secondary" id="rcsv">Baixar extrato (CSV)</button><button class="btn" id="rpdf">Relatório em PDF</button>',
    });
    const f = box.querySelector('#rf'), t = box.querySelector('#rt');
    box.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => {
      const p = PRESETS.find((x) => x[0] === b.dataset.p); f.value = p[2]; t.value = p[3];
      box.querySelectorAll('[data-p]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    [f, t].forEach((x) => (x.oninput = () => box.querySelectorAll('[data-p]').forEach((c) => c.classList.remove('on'))));
    const range = () => {
      if (!f.value || !t.value || t.value < f.value) { toast('Confira as datas do período.', true); return null; }
      if ((new Date(t.value) - new Date(f.value)) / 864e5 > 400) { toast('Escolha um período de até 13 meses.', true); return null; }
      return [f.value, t.value];
    };
    box.querySelector('#rpdf').onclick = () => { const r = range(); if (!r) return; closeModal(); fullReport(r[0], r[1], me).catch((e) => toast(B.message(e), true)); };
    box.querySelector('#rcsv').onclick = async (e) => {
      const r = range(); if (!r) return;
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const rows = await rpc('partner_statement', { p_from: r[0], p_to: r[1] });
        if (!rows.length) { toast('Nenhuma duplicata paga ou recebida neste período.'); return; }
        B.statementCsv(rows, `extrato-${r[0]}-a-${r[1]}.csv`);
        closeModal();
      } catch (err) { toast(B.message(err), true); } finally { btn.disabled = false; }
    };
  };
})();
