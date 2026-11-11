/* Lottus Partners — consulta do investidor: posição, rendimentos e resgates (link pessoal, sem senha) */
(function () {
  'use strict';
  const cfg = window.LOTTUS_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const root = document.getElementById('inv');
  const token = (location.hash || '').replace(/^#/, '');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const pu = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
  const date = (iso) => (iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—');
  const doc = (c) => (String(c).length === 11 ? String(c).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : String(c).replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5'));
  const ST = { pending: 'Aguardando pagamento', paid: 'Pago', cancelled: 'Cancelado' };
  const shell = (inner) => { root.innerHTML = `<header class="sign-head"><img src="img/logo-rosa.png" alt="Lottus" height="28"></header>${inner}`; };
  const fail = (msg) => shell(`<div class="card sign-card"><h1>Link indisponível</h1><p class="muted">${esc(msg)}</p></div>`);

  async function main() {
    if (!token) return fail('O endereço está incompleto. Abra o link que o fundo enviou.');
    const { data, error } = await sb.rpc('portal_investor_view', { p_token: token });
    if (error || !data) return fail('Este link não é válido ou foi substituído por um mais recente. Peça um novo link ao fundo.');
    const pos = data.positions || [], tot = pos.reduce((a, x) => ({ v: a.v + Number(x.value), i: a.i + Number(x.invested) }), { v: 0, i: 0 });
    shell(`<div class="inv-top"><div><h1 class="u-m0">${esc(data.investor.name)}</h1><div class="small muted">${esc(doc(data.investor.document))} · ${esc(data.fund)} · posição em ${esc(date(data.as_of))}</div></div><button class="btn secondary" id="prt">Imprimir</button></div>
      <div class="kpis"><div class="card kpi"><span class="lbl">Valor atual</span><span class="big">${brl(tot.v)}</span></div><div class="card kpi"><span class="lbl">Investido</span><span class="big">${brl(tot.i)}</span></div><div class="card kpi"><span class="lbl">Rendimento</span><span class="big">${brl(tot.v - tot.i)}</span></div></div>
      <h3 class="sec-h">Minhas debêntures</h3>
      ${pos.length ? `<div class="card"><div class="table-wrap"><table><thead><tr><th>Série</th><th class="num">Quantidade</th><th class="num">P.U. atual</th><th class="num">Valor atual</th><th class="num">Rendimento</th><th>Vencimento</th></tr></thead><tbody>
        ${pos.map((x) => `<tr><td><b>${esc(x.series)}</b></td><td class="num">${Number(x.quantity).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td><td class="num">R$ ${pu(x.pu)}</td><td class="num"><b>${brl(x.value)}</b></td><td class="num">${brl(x.gain)}</td><td>${x.maturity ? esc(date(x.maturity)) : '—'}</td></tr>`).join('')}</tbody></table></div></div>` : '<div class="card"><p class="u-m0 muted">Nenhuma debênture em posição no momento.</p></div>'}
      <h3 class="sec-h">Integralizações</h3>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Data</th><th>Série</th><th class="num">Quantidade</th><th class="num">P.U.</th><th class="num">Valor</th><th>Situação</th></tr></thead><tbody>
        ${(data.subscriptions || []).map((x) => `<tr><td>${esc(date(x.pay_date || x.created_at))}</td><td>${esc(x.series)}</td><td class="num">${Number(x.quantity).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td><td class="num">R$ ${pu(x.unit_price)}</td><td class="num">${brl(x.amount)}</td><td>${esc(ST[x.status] || x.status)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhuma.</td></tr>'}</tbody></table></div></div>
      ${(data.redemptions || []).length ? `<h3 class="sec-h">Resgates</h3><div class="card"><div class="table-wrap"><table><thead><tr><th>Data</th><th>Série</th><th class="num">Qtd.</th><th class="num">Bruto</th><th class="num">IOF</th><th class="num">IR</th><th class="num">Líquido</th><th>Situação</th></tr></thead><tbody>
        ${data.redemptions.map((x) => `<tr><td>${esc(date(x.pay_date))}</td><td>${esc(x.series)}</td><td class="num">${Number(x.quantity).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td><td class="num">${brl(x.gross)}</td><td class="num">${brl(x.iof)}</td><td class="num">${brl(x.ir)}</td><td class="num"><b>${brl(x.net)}</b></td><td>${esc(ST[x.status] || x.status)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      <p class="u-mt16 small muted">Valores informativos, atualizados pelo fundo. O rendimento considera o P.U. do dia; impostos são apurados no resgate.</p>`);
    document.getElementById('prt').onclick = () => window.print();
  }
  main().catch(() => fail('Não foi possível carregar agora. Tente de novo em instantes.'));
})();
