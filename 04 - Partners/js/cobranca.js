/* Lottus Partners — Cobrança: parcelas a receber do fundo, baixa e lembretes */
(function () {
  'use strict';
  const B = window.BO;
  const { rpc, esc, brl, date, run, closeModal } = B;
  const { head, tabs, onTabs, empty } = B.ui;
  const TABS = [['all', 'Tudo'], ['open', 'Em aberto'], ['overdue', 'Vencidas'], ['next7', 'Próximos 7 dias'], ['paid', 'Pagas']];
  const INSTR = { cessao: 'Cessão', nota_comercial: 'Nota comercial', ccb: 'CCB' };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const { today } = B;

  /* Baixa manual: um ou mais itens (agrupados por operação) */
  function baixa(items, done) {
    const total = items.reduce((t, x) => t + Number(x.amount), 0);
    const box = B.drawer({ title: 'Dar baixa', subtitle: `${items.length} ${items.length === 1 ? 'parcela' : 'parcelas'} · ${brl(total)}`,
      body: `<form id="bf" novalidate>
        <div class="fsec"><h3>Data do recebimento</h3><input class="input" name="paid_on" data-mask="date" data-req="Informe a data" value="${esc(B.mask.toBr(today()))}"></div>
        <div class="fsec"><h3>Parcelas</h3><table class="mini"><tbody>${items.map((x) => `<tr><td><b>${esc(x.sacado)}</b><div class="small muted">${esc(x.cedente)} · parcela ${esc(x.parcela)} · vence ${esc(date(x.due_date))}</div></td><td class="num"><b>${brl(x.amount)}</b></td></tr>`).join('')}</tbody></table></div>
        <div class="note-box small">Use depois de conferir o recebimento na conta do fundo. Pagamentos identificados pela conta bancária têm baixa automática.</div>
        <div class="error-box" id="bf-err" hidden></div></form>`,
      foot: '<button class="btn secondary" data-act="cancel">Cancelar</button><button class="btn" data-act="ok">Confirmar baixa</button>' });
    box.querySelector('[data-act=cancel]').onclick = () => closeModal();
    box.querySelector('[data-act=ok]').onclick = async (ev) => {
      const f = box.querySelector('#bf'), err = box.querySelector('#bf-err'), d = B.mask.iso(f.paid_on);
      if (!d || d > today()) { B.fieldError(f.paid_on, 'Use uma data até hoje'); return; }
      const byOp = {}; items.forEach((x) => { (byOp[x.operation_id] = byOp[x.operation_id] || []).push(x.installment_id); });
      try {
        await run(ev.currentTarget, async () => { for (const [op, ids] of Object.entries(byOp)) await rpc('partner_mark_received', { p_id: op, p_items: ids, p_paid_on: d }); }, 'Baixa registrada');
        closeModal(); done();
      } catch (e) { err.hidden = false; err.textContent = B.message(e); }
    };
  }

  B.baixaParcelas = baixa;

  B.views.cobranca = async (el, [rawTab], me) => {
    const tab = TABS.some(([k]) => k === rawTab) ? rawTab : 'all';
    const canBaixa = me.can_sign !== false;
    const d = await rpc('partner_receivables', { p_view: tab });
    const t = d.totals || {};
    const kpi = (l, v, sub, bad) => `<div class="card kpi${bad && Number(v) > 0 ? ' alert' : ''}"><span class="lbl">${l}</span><span class="big">${brl(v)}</span>${sub ? `<span class="small muted">${sub}</span>` : ''}</div>`;
    el.innerHTML = head('Cobrança', 'Parcelas a receber das operações pagas pelo fundo') + `<div class="kpis">${kpi('A receber', t.open, `${t.open_count} ${t.open_count === 1 ? 'parcela' : 'parcelas'}`)}${kpi('Vencido', t.overdue, `${t.overdue_count} ${t.overdue_count === 1 ? 'parcela' : 'parcelas'}`, true)}${kpi('Vence em 7 dias', t.next7)}${kpi('Recebido em 30 dias', t.received30)}</div>`
      + '<div class="ops-bar" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:12px">' + tabs(TABS, tab) + '<input class="input search" style="flex:0 1 320px;width:auto;min-width:160px" id="q" type="search" placeholder="Buscar sacado, cedente ou CNPJ" aria-label="Buscar"><span id="sel" class="small muted"></span><button class="btn sm" id="bulk" hidden>Dar baixa nas selecionadas</button></div><div id="list"></div>';
    onTabs(el, (k) => { location.hash = `#/cobranca/${k}`; });
    const reload = () => B.views.cobranca(el, [tab], me);
    const picked = new Set();
    const paint = () => {
      const q = norm(el.querySelector('#q').value), qd = q.replace(/\D/g, '');
      const rows = d.items.filter((x) => !q || norm(x.sacado).includes(q) || norm(x.cedente).includes(q) || (qd && (String(x.sacado_cnpj).includes(qd) || String(x.cedente_cnpj).includes(qd))));
      const openRow = (x) => x.status !== 'paid' && x.status !== 'cancelled';
      const pg = B.ui.pager('cobr:' + tab, rows, { unit: rows.length === 1 ? 'cobrança' : 'cobranças', sig: tab + '|' + q, sum: rows.reduce((t, x) => t + Number(x.amount || 0), 0) });
      el.querySelector('#list').innerHTML = rows.length ? `<div class="card"><table><thead><tr>${canBaixa ? '<th style="width:32px"></th>' : ''}<th>Vencimento</th><th>Sacado</th><th>Cedente</th><th class="num">Valor</th><th></th></tr></thead><tbody>
        ${pg.rows.map((x) => `<tr>${canBaixa ? `<td>${openRow(x) ? `<input type="checkbox" data-pick="${esc(x.installment_id)}" ${picked.has(x.installment_id) ? 'checked' : ''} aria-label="Selecionar">` : ''}</td>` : ''}
          <td><b>${esc(date(x.due_date))}</b></td>
          <td><b>${esc(x.sacado)}</b><div class="small muted">${esc(x.document || '')} · parcela ${esc(x.parcela)}${x.series ? ' · ' + esc(x.series) : ''}</div></td>
          <td>${esc(x.cedente)}${x.instrument ? `<div class="small muted">${INSTR[x.instrument] || ''}</div>` : ''}</td>
          <td class="num"><b>${brl(x.amount)}</b></td>
          <td class="num">${openRow(x) ? `${canBaixa ? `<button class="btn sm" data-one="${esc(x.installment_id)}">Dar baixa</button>` : ''}` : ''}</td></tr>`).join('')}
        </tbody></table>${pg.bar}</div>` : `<div class="card">${empty(d.items.length ? 'Nada encontrado para essa busca.' : 'Nenhuma parcela nesta lista.')}</div>`;
      B.ui.pagerBind(el, 'cobr:' + tab, paint);
      el.querySelectorAll('[data-pick]').forEach((c) => (c.onchange = () => { c.checked ? picked.add(c.dataset.pick) : picked.delete(c.dataset.pick); sync(); }));
      el.querySelectorAll('[data-one]').forEach((b) => (b.onclick = () => baixa(d.items.filter((x) => x.installment_id === b.dataset.one), reload)));
      sync();
    };
    const sync = () => {
      const n = picked.size, bk = el.querySelector('#bulk');
      bk.hidden = !n; el.querySelector('#sel').textContent = n ? `${n} selecionada(s)` : '';
    };
    el.querySelector('#bulk').onclick = () => baixa(d.items.filter((x) => picked.has(x.installment_id)), reload);
    el.querySelector('#q').oninput = paint;
    paint();
  };
})();
