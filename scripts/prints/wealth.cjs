// Prints do Lottus Wealth: Patrimônio (visão geral) e Gastos. Dados 100% fictícios.
// Uso: NODE_PATH=$(npm root -g) node scripts/prints/wealth.cjs
const path = require('path'), { execFileSync } = require('child_process'), fs = require('fs');
const { shoot, ROOT } = require('./lib.cjs');
const WID = '22222222-2222-4222-8222-222222222222';
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'marina.souza@exemplo.com.br', meta: { name: 'Marina Souza' } };
const me = { id: user.id, email: user.email, profile: { name: 'Marina Souza', completed: true, billing_status: 'em_dia', plan: 'pro' }, plan: 'pro' };
const wallet = { id: WID, name: 'Família Souza', role: 'gestor', is_owner: true, read_only: false, archived: false, view_mode: 'curva', benchmark: 'CDI', networth: 1319730.35, members: 2, owner_name: 'Marina Souza', brand: null };
const wallet2 = { ...wallet, id: '33333333-3333-4333-8333-333333333333', name: 'Souza Consultoria', networth: 412880.1, members: 1 };

const pos = [
  ['acao', 'PETR4', 'Petróleo Exemplo PN', 148320], ['acao', 'ITUB4', 'Banco Exemplo PN', 96540], ['fii', 'HGLG11', 'FII Logística Exemplo', 112800],
  ['fii', 'KNRI11', 'FII Renda Corporativa Exemplo', 84150], ['etf', 'BOVA11', 'ETF Índice Exemplo', 71900], ['tesouro', null, 'Tesouro IPCA+ 2035', 238400],
  ['rf_pos', null, 'CDB Banco Exemplo 120% CDI', 190000], ['rf_pre', null, 'LCI Banco Exemplo 2027', 126500], ['fundo', null, 'Fundo Multimercado Exemplo', 64700],
].map(([kind, ticker, name, value], i) => ({ asset_id: `aaaaaaaa-0000-4000-8000-00000000000${i}`, kind, ticker, name, value, qty: 100, cost: value * 0.86 }));
const inv = pos.reduce((s, p) => s + p.value, 0), contas = 186420.35, aportes = 960000;
const nw = { total: inv + contas, investimentos: inv, contas, aportes, resultado: inv - aportes, rentabilidade: (inv - aportes) / aportes, benchmark: 'CDI', tem_mercado: false };
// 13 pontos mensais (nov/25 a nov/26)
const eq = Array.from({ length: 13 }, (_, i) => {
  const t = i / 12, wob = Math.sin(i * 1.7) * 0.012;
  const investimentos = Math.round(inv * (0.52 + 0.48 * t + wob * (i < 12 ? 1 : 0)));
  const ap = Math.round(aportes * (0.55 + 0.45 * t));
  const date = i === 12 ? '2026-11-24' : new Date(Date.UTC(2025, 10 + i + 1, 0)).toISOString().slice(0, 10);
  return { date, investimentos: i === 12 ? inv : investimentos, aportes: i === 12 ? aportes : ap, contas: Math.round(contas * (0.60 + 0.40 * t)), total: 0, benchmark: Math.round(ap * (1 + 0.058 * t + 0.047 * t * t * 0.4)) };
}).map((p) => ({ ...p, total: p.investimentos + p.contas, benchmark: p.date === '2026-11-24' ? 1062000 : p.benchmark }));

// Gastos
const banks = [
  { id: 'b1', name: 'Conta corrente Marina', bank: 'Banco Exemplo', bank_code: '999', account_type: 'corrente', branch: '0001', account_number: '12345', account_digit: '6', last_date: '2026-11-23', balance: 94210.18, opening_balance: 0 },
  { id: 'b2', name: 'Conta conjunta família', bank: 'Banco Exemplo', bank_code: '999', account_type: 'corrente', branch: '0001', account_number: '67890', account_digit: '1', last_date: '2026-11-22', balance: 61350.4, opening_balance: 0 },
  { id: 'b3', name: 'Reserva de emergência', bank: 'Banco Modelo', bank_code: '998', account_type: 'poupanca', branch: '0002', account_number: '24680', account_digit: '0', last_date: '2026-11-15', balance: 30859.77, opening_balance: 0 },
];
const meses = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
const rec = [38200, 41500, 36800, 44100, 39900, 42600], des = [27100, 31800, 29400, 35200, 28600, 30900];
const summary = {
  unclassified: 7,
  by_month: meses.map((m, i) => ({ month: m + '-01', receitas: rec[i], despesas: des[i] })),
  by_centro: [{ name: 'Moradia', value: 62400 }, { name: 'Alimentação', value: 38900 }, { name: 'Educação', value: 31200 }, { name: 'Saúde', value: 22700 }, { name: 'Lazer e viagens', value: 19800 }, { name: 'Transporte', value: 16300 }],
  by_contraparte: [{ name: 'Imobiliária Planalto', value: 48000 }, { name: 'Supermercado Bom Preço', value: 27600 }, { name: 'Colégio Novo Horizonte', value: 31200 }, { name: 'Clínica Vida Plena', value: 18400 }, { name: 'Posto Rota 7', value: 9800 }, { name: 'Cia. Aérea Exemplo', value: 8600 }],
};
const rpc = { w_me: me, w_wallets_list: [wallet, wallet2], w_invites_mine: [], w_groups_list: { allowed: false, groups: [] }, w_networth: nw, w_equity: eq, w_positions: pos, w_bank_list: banks, w_spend_summary: summary };
const user_ = { app: 'wealth', user, storage: 'session', rpc, ready: '#view', wait: 2000 };

(async () => {
  const which = process.argv[2] || 'all';
  const jobs = [];
  if (which === 'all' || which === 'patrimonio') jobs.push({ ...user_, hash: `#/w/${WID}/patrimonio`, ready: '#ch-eq svg', out: path.join(ROOT, 'apps/site/img/wealth-painel.webp') });
  for (const j of jobs) {
    const png = await shoot(j);
    execFileSync('python3', [path.join(__dirname, 'toWebp.py'), png, j.out]); fs.unlinkSync(png);
    console.log(fs.statSync(j.out).size, 'bytes');
  }
})();
