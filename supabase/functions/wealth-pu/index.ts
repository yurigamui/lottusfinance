// Lottus Wealth — atualização diária de P.U. NÃO PUBLICADA nesta versão (a de produção em 23/11 é a v4, sem cripto nem ANBIMA).
// Fontes gratuitas: BCB SGS (CDI 12, IPCA 433), Tesouro Transparente, CVM (informe diário), B3 COTAHIST e Mercado Bitcoin (cripto).
// Novidades da v2 (pedido de 23/11):
//  · Cripto: cotação em reais pela API pública do Mercado Bitcoin (CRYPTO_SOURCE=0 desliga).
//  · Renda fixa "a mercado" por cálculo: taxa de mercado de hoje (Tesouro de prazo parecido) + o spread que o título
//    tinha na emissão (taxa contratada − taxa do Tesouro naquele dia). Vale para pré (CDB, LCI, LCA, CRI, CRA, debêntures
//    prefixados) e IPCA+. Pós-fixado em % do CDI fica igual à curva (spread de crédito constante).
//  · ANBIMA: PU indicativo de debêntures, CRI e CRA pelo código do ativo, só com ANBIMA_ENABLED=1 e credenciais
//    (ANBIMA_CLIENT_ID/ANBIMA_CLIENT_SECRET). Desligado até a confirmação da licença de uso dos dados (pendência W-v2-ANBIMA).
// Autenticação: x-cron-secret = WEALTH_CRON_SECRET (env) ou segredo interno do banco (w_system). B3_COTAHIST=0 desliga a B3.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { unzipSync } from 'https://esm.sh/fflate@0.8.2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const log: string[] = [];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const br = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
const D = (s: string) => new Date(s + 'T00:00:00Z');
const num = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.'));
const brDate = (s: string) => { const [d, m, y] = s.split('/'); return `${y}-${m}-${d}`; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r8 = (x: number) => Math.round(x * 1e8) / 1e8;
async function upsertPrices(rows: any[]) { for (let i = 0; i < rows.length; i += 500) { const { error } = await sb.from('w_asset_prices').upsert(rows.slice(i, i + 500), { onConflict: 'asset_id,date' }); if (error) throw new Error(error.message); } }

const holCache = new Map<number, Set<string>>();
function holidays(y: number): Set<string> {
  if (holCache.has(y)) return holCache.get(y)!;
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), dy = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(Date.UTC(y, mo - 1, dy));
  const add = (n: number) => iso(new Date(easter.getTime() + n * 864e5));
  const fixed = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'].map((x) => `${y}-${x}`);
  if (y >= 2024) fixed.push(`${y}-11-20`);
  const s = new Set([...fixed, add(-48), add(-47), add(-2), add(60)]);
  holCache.set(y, s);
  return s;
}
const isBiz = (d: Date) => { const w = d.getUTCDay(); return w !== 0 && w !== 6 && !holidays(d.getUTCFullYear()).has(iso(d)); };
function du(a: Date, b: Date): number {
  let n = 0;
  for (let t = a.getTime() + 864e5; t <= b.getTime(); t += 864e5) if (isBiz(new Date(t))) n++;
  return n;
}
function lastBiz(d: Date): Date { let t = d; while (!isBiz(t)) t = new Date(t.getTime() - 864e5); return t; }

async function sgsChunk(serie: number, s: Date, e: Date): Promise<{ date: string; value: number }[]> {
  const u = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados?formato=json&dataInicial=${br(s)}&dataFinal=${br(e)}`;
  let last = '';
  for (let t = 0; t < 4; t++) {
    const r = await fetch(u, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; LottusWealth/1.0)' } });
    const txt = await r.text();
    if (r.ok) { try { return (JSON.parse(txt) as any[]).map((x) => ({ date: brDate(x.data), value: Number(x.valor) })); } catch { /* cai no erro abaixo */ } }
    last = `${r.status} ${txt.slice(0, 160).replace(/\s+/g, ' ')}`;
    await sleep(1500 * (t + 1));
  }
  throw new Error(`SGS ${serie} ${br(s)}-${br(e)}: ${last}`);
}
async function sgs(serie: number, from: Date, to: Date): Promise<{ date: string; value: number }[]> {
  const out: { date: string; value: number }[] = [];
  for (let s = new Date(from); s <= to; s = new Date(Date.UTC(s.getUTCFullYear() + 2, s.getUTCMonth(), s.getUTCDate()))) {
    const e = new Date(Math.min(Date.UTC(s.getUTCFullYear() + 2, s.getUTCMonth(), s.getUTCDate()) - 864e5, to.getTime()));
    out.push(...await sgsChunk(serie, s, e));
  }
  return out;
}
async function loadIndices(today: Date) {
  for (const [name, serie] of [['CDI', 12], ['IPCA', 433]] as const) {
    try {
      const { data: last } = await sb.from('w_indices').select('date').eq('name', name).order('date', { ascending: false }).limit(1);
      const from = last?.length ? new Date(D(last[0].date).getTime() - 40 * 864e5) : new Date(Date.UTC(today.getUTCFullYear() - 8, 0, 1));
      const rows = (await sgs(serie, from, today)).map((x) => ({ name, ...x }));
      for (let i = 0; i < rows.length; i += 500) { const { error } = await sb.from('w_indices').upsert(rows.slice(i, i + 500), { onConflict: 'name,date' }); if (error) throw new Error(error.message); }
      log.push(`${name}: ${rows.length} pontos`);
    } catch (e) { log.push(`${name}: falhou (${(e as Error).message})`); }
  }
}
async function fetchAll(name: string): Promise<{ date: string; value: number }[]> {
  const out: { date: string; value: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('w_indices').select('date,value').eq('name', name).order('date').range(from, from + 999);
    if (!data?.length) break;
    out.push(...data.map((x: any) => ({ date: x.date, value: Number(x.value) })));
    if (data.length < 1000) break;
  }
  return out;
}

type Asset = { id: string; kind: string; name: string; ticker: string | null; isin: string | null; cnpj_fundo: string | null; indexer: string | null; rate: number | null; issue_date: string | null; maturity: string | null; pu_inicial: number; custom: boolean };

function makeCurves(cdi: { date: string; value: number }[], ipca: { date: string; value: number }[]) {
  const cdiDates = cdi.map((x) => x.date);
  const idxAfter = (d: string) => { let lo = 0, hi = cdiDates.length; while (lo < hi) { const m = (lo + hi) >> 1; if (cdiDates[m] <= d) lo = m + 1; else hi = m; } return lo; };
  return {
    pos(issue: string, to: string, pct: number): number {
      let f = 1;
      for (let i = idxAfter(issue); i < cdi.length && cdi[i].date <= to; i++) f *= 1 + (pct * cdi[i].value) / 100;
      return f;
    },
    ipcaFactor(issue: string, to: string): number {
      const im = issue.slice(0, 7), tm = to.slice(0, 7);
      let f = 1; let lastV = 0;
      for (const x of ipca) { const m = x.date.slice(0, 7); lastV = x.value; if (m > im && m < tm) f *= 1 + x.value / 100; }
      const has = ipca.some((x) => x.date.slice(0, 7) === tm);
      if (!has && tm > im) { const day = Number(to.slice(8, 10)); f *= 1 + (lastV / 100) * Math.min(day / 30, 1); }
      return f;
    },
  };
}

// Curvas do Tesouro por dia: tipo ('pre' | 'ipca') → data → [vencimento, taxa a.a.]
type Yields = Map<'pre' | 'ipca', Map<string, [string, number][]>>;
function yieldAt(y: Yields, kind: 'pre' | 'ipca', date: string, maturity: string): number | null {
  const byDate = y.get(kind); if (!byDate?.size) return null;
  // dia útil mais próximo para trás (até 10 dias): o arquivo não tem fins de semana e feriados
  let pts: [string, number][] | undefined;
  for (let back = 0; back <= 10 && !pts; back++) pts = byDate.get(iso(new Date(D(date).getTime() - back * 864e5)));
  if (!pts?.length) return null;
  const t = D(maturity).getTime();
  let best = pts[0];
  for (const p of pts) if (Math.abs(D(p[0]).getTime() - t) < Math.abs(D(best[0]).getTime() - t)) best = p;
  return best[1];
}

function priceAsset(a: Asset, at: string, curves: ReturnType<typeof makeCurves>, ylds: Yields | null): { pu: number; pu_mercado: number | null } | null {
  if (!a.issue_date || a.issue_date > at || !a.rate) return null;
  const end = a.maturity && a.maturity < at ? a.maturity : at;
  const dEnd = D(end), dIss = D(a.issue_date);
  const rate = Number(a.rate);
  // a mercado: desconta o valor no vencimento pela taxa de hoje do Tesouro de prazo parecido + spread da emissão
  const market = (fvAtMaturity: number, kind: 'pre' | 'ipca', realFactorNow = 1): number | null => {
    if (!ylds || !a.maturity || a.maturity <= at) return null;
    const yIss = yieldAt(ylds, kind, a.issue_date!, a.maturity), yNow = yieldAt(ylds, kind, at, a.maturity);
    if (yIss === null || yNow === null) return null;
    const mkt = yNow + (rate - yIss);
    if (!(mkt > -0.5)) return null;
    return (fvAtMaturity * realFactorNow) / Math.pow(1 + mkt, du(D(at), D(a.maturity)) / 252);
  };
  if (a.kind === 'rf_pre' || a.indexer === 'PRE') {
    const pu = a.pu_inicial * Math.pow(1 + rate, du(dIss, dEnd) / 252);
    const vf = a.maturity ? a.pu_inicial * Math.pow(1 + rate, du(dIss, D(a.maturity)) / 252) : 0;
    return { pu, pu_mercado: a.maturity ? market(vf, 'pre') : null };
  }
  if (a.kind === 'rf_pos' || a.indexer === 'CDI') return { pu: a.pu_inicial * curves.pos(a.issue_date, end, rate), pu_mercado: null };
  if (a.kind === 'rf_ipca' || a.indexer === 'IPCA') {
    const fIpca = curves.ipcaFactor(a.issue_date, end);
    const pu = a.pu_inicial * fIpca * Math.pow(1 + rate, du(dIss, dEnd) / 252);
    // valor no vencimento em termos reais (sem a inflação futura), corrigido pela inflação já ocorrida
    const vfReal = a.maturity ? a.pu_inicial * Math.pow(1 + rate, du(dIss, D(a.maturity)) / 252) : 0;
    return { pu, pu_mercado: a.maturity ? market(vfReal, 'ipca', fIpca) : null };
  }
  return null;
}

async function tesouro(assets: Asset[], today: string): Promise<Yields> {
  const list = assets.filter((a) => a.kind === 'tesouro' && !a.custom);
  const ylds: Yields = new Map([['pre', new Map()], ['ipca', new Map()]]);
  const url = Deno.env.get('TESOURO_CSV_URL') ?? 'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv';
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    const lines = (await r.text()).split(/\r?\n/);
    const rows: any[] = []; const recent = iso(new Date(D(today).getTime() - 7 * 864e5));
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(';');
      if (c.length < 8) continue;
      const [tipo, venc, base, , , , , puBase] = c;
      const date = brDate(base), vencIso = brDate(venc), pu = num(puBase), tl = tipo.toLowerCase();
      // curvas de referência: Prefixado (LTN) e IPCA+ (NTN-B Principal), todo o histórico (para o spread da emissão)
      const kind = tl === 'tesouro prefixado' ? 'pre' : tl === 'tesouro ipca+' ? 'ipca' : null;
      if (kind) { const m = ylds.get(kind)!; const arr = m.get(date) ?? []; arr.push([vencIso, num(c[3]) / 100]); m.set(date, arr); }
      if (date < recent && !list.length) continue;
      for (const a of list) {
        if (!a.name.toLowerCase().includes(tl)) continue;
        if (a.maturity ? a.maturity !== vencIso : !a.name.includes(vencIso.slice(0, 4))) continue;
        rows.push({ asset_id: a.id, date, pu, source: 'tesouro_transparente' });
      }
    }
    await upsertPrices(rows);
    log.push(`Tesouro: ${rows.length} preços para ${list.length} ativos; curvas pré ${ylds.get('pre')!.size} dias, IPCA+ ${ylds.get('ipca')!.size} dias`);
  } catch (e) { log.push(`Tesouro: falhou (${(e as Error).message})`); }
  return ylds;
}

// Fundos: guarda todo o histórico do mês para quem usa o fundo; para o resto do catálogo, só a cota mais recente (P.U. na hora de escolher o ativo).
async function cvm(assets: Asset[], today: Date, keepAll: Set<string>) {
  const list = assets.filter((a) => a.kind === 'fundo' && a.cnpj_fundo && !a.custom);
  if (!list.length) return;
  const byCnpj = new Map(list.map((a) => [a.cnpj_fundo!.replace(/\D/g, ''), a]));
  const months = today.getUTCDate() <= 7 ? [0, 1] : [0];
  for (const back of months) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1));
    const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    try {
      const r = await fetch(`https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_${ym}.zip`);
      if (!r.ok) throw new Error(String(r.status));
      const files = unzipSync(new Uint8Array(await r.arrayBuffer()));
      const text = new TextDecoder('latin1').decode(Object.values(files)[0]);
      const all = new Map<string, any>(); const latest = new Map<string, any>();
      let head: string[] = [];
      let iC = -1, iQ = -1, iD = -1;
      for (const ln of text.split(/\r?\n/)) {
        const c = ln.split(';');
        if (!head.length) { head = c; iC = head.indexOf('CNPJ_FUNDO_CLASSE') >= 0 ? head.indexOf('CNPJ_FUNDO_CLASSE') : head.indexOf('CNPJ_FUNDO'); iQ = head.indexOf('VL_QUOTA'); iD = head.indexOf('DT_COMPTC'); continue; }
        const a = byCnpj.get((c[iC] ?? '').replace(/\D/g, '')); if (!a) continue;
        const q = Number(c[iQ]); if (!(q > 0)) continue;
        const row = { asset_id: a.id, date: c[iD], pu: q, source: 'cvm_informe_diario' };
        if (keepAll.has(a.id)) all.set(a.id + row.date, row);
        const cur = latest.get(a.id); if (!cur || cur.date < row.date) latest.set(a.id, row);
      }
      const rows = [...all.values(), ...[...latest.values()].filter((x) => !keepAll.has(x.asset_id))];
      await upsertPrices(rows);
      log.push(`CVM ${ym}: ${rows.length} cotas (${latest.size} fundos)`);
    } catch (e) { log.push(`CVM ${ym}: falhou (${(e as Error).message})`); }
  }
}

async function b3(assets: Asset[], today: Date) {
  if (Deno.env.get('B3_COTAHIST') === '0') { log.push('B3 COTAHIST: desligado'); return; }
  const list = assets.filter((a) => ['acao', 'fii', 'etf', 'bdr'].includes(a.kind) && a.ticker && !a.custom);
  if (!list.length) return;
  const byTick = new Map<string, Asset[]>();
  for (const a of list) { const k = a.ticker!.toUpperCase(); byTick.set(k, [...(byTick.get(k) ?? []), a]); }
  for (let back = 0; back < 6; back++) {
    const d = new Date(today.getTime() - back * 864e5);
    if (!isBiz(d)) continue;
    const stamp = `${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}${d.getUTCFullYear()}`;
    const r = await fetch(`https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D${stamp}.ZIP`);
    if (!r.ok) continue;
    const files = unzipSync(new Uint8Array(await r.arrayBuffer()));
    const text = new TextDecoder('latin1').decode(Object.values(files)[0]);
    const rows: any[] = [];
    for (const ln of text.split(/\r?\n/)) {
      if (ln.slice(0, 2) !== '01') continue;
      const tick = ln.slice(12, 24).trim(); const as = byTick.get(tick); if (!as) continue;
      const date = `${ln.slice(2, 6)}-${ln.slice(6, 8)}-${ln.slice(8, 10)}`; const pu = Number(ln.slice(108, 121)) / 100;
      if (pu > 0) for (const a of as) rows.push({ asset_id: a.id, date, pu, source: 'b3_cotahist' });
    }
    await upsertPrices(rows);
    log.push(`B3 ${stamp}: ${rows.length} preços`);
    return;
  }
  log.push('B3 COTAHIST: nenhum arquivo nos últimos dias');
}

// Cripto: cotação em reais (par SÍMBOLO-BRL) na API pública do Mercado Bitcoin. Ativos de cripto usam o ticker (BTC, ETH…).
async function crypto(assets: Asset[], todayIso: string) {
  if (Deno.env.get('CRYPTO_SOURCE') === '0') { log.push('Cripto: desligado'); return; }
  const list = assets.filter((a) => a.kind === 'cripto' && a.ticker && !a.custom);
  if (!list.length) return;
  const sym = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/BRL$/, '');
  const bySym = new Map<string, Asset[]>();
  for (const a of list) { const s = sym(a.ticker!); if (s) bySym.set(s, [...(bySym.get(s) ?? []), a]); }
  const syms = [...bySym.keys()]; const rows: any[] = [];
  try {
    for (let i = 0; i < syms.length; i += 40) {
      const pairs = syms.slice(i, i + 40).map((s) => `${s}-BRL`).join(',');
      const r = await fetch(`https://api.mercadobitcoin.net/api/v4/tickers?symbols=${encodeURIComponent(pairs)}`, { headers: { accept: 'application/json', 'user-agent': 'LottusWealth/1.0' } });
      if (!r.ok) throw new Error(String(r.status));
      for (const t of (await r.json()) as any[]) {
        const s = String(t.pair ?? '').split('-')[0]; const last = Number(t.last);
        if (!(last > 0)) continue;
        for (const a of bySym.get(s) ?? []) rows.push({ asset_id: a.id, date: todayIso, pu: last, source: 'mercado_bitcoin' });
      }
      await sleep(300);
    }
    await upsertPrices(rows);
    log.push(`Cripto: ${rows.length} cotações para ${list.length} ativos`);
  } catch (e) { log.push(`Cripto: falhou (${(e as Error).message})`); }
}

// ANBIMA (desligado por padrão): PU indicativo de debêntures, CRI e CRA no mercado secundário, pelo código do ativo (ticker).
async function anbima(assets: Asset[], todayIso: string) {
  if (Deno.env.get('ANBIMA_ENABLED') !== '1') { log.push('ANBIMA: desligado (licença a confirmar)'); return; }
  const id = Deno.env.get('ANBIMA_CLIENT_ID'), secret = Deno.env.get('ANBIMA_CLIENT_SECRET');
  if (!id || !secret) { log.push('ANBIMA: sem credenciais'); return; }
  const list = assets.filter((a) => ['rf_pre', 'rf_pos', 'rf_ipca', 'outro'].includes(a.kind) && a.ticker && !a.custom);
  if (!list.length) return;
  const byCode = new Map<string, Asset[]>(); for (const a of list) { const k = a.ticker!.toUpperCase(); byCode.set(k, [...(byCode.get(k) ?? []), a]); }
  const base = Deno.env.get('ANBIMA_BASE_URL') ?? 'https://api.anbima.com.br';
  try {
    const t = await fetch(`${base}/oauth/access-token`, { method: 'POST', headers: { authorization: `Basic ${btoa(`${id}:${secret}`)}`, 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'client_credentials' }) });
    if (!t.ok) throw new Error(`token ${t.status}`);
    const tok = (await t.json()).access_token;
    const rows: any[] = [];
    for (const path of [Deno.env.get('ANBIMA_PATH_DEBENTURES') ?? '/feed/precos-indices/v1/titulos-privados/mercado-secundario-debentures', Deno.env.get('ANBIMA_PATH_CRI_CRA') ?? '/feed/precos-indices/v1/titulos-privados/mercado-secundario-cri-cra']) {
      const r = await fetch(`${base}${path}`, { headers: { client_id: id, access_token: tok, accept: 'application/json' } });
      if (!r.ok) { log.push(`ANBIMA ${path}: ${r.status}`); continue; }
      for (const x of (await r.json()) as any[]) {
        const code = String(x.codigo_ativo ?? '').toUpperCase(); const pu = Number(x.pu ?? x.pu_indicativo); const dt = String(x.data_referencia ?? todayIso).slice(0, 10);
        if (!(pu > 0)) continue;
        for (const a of byCode.get(code) ?? []) rows.push({ asset_id: a.id, date: dt, pu_mercado: pu, source: 'anbima' });
      }
    }
    // ANBIMA só preenche o preço a mercado; o P.U. da curva continua o calculado (por isso grava só onde já há linha do dia)
    for (const x of rows) await sb.from('w_asset_prices').update({ pu_mercado: x.pu_mercado }).eq('asset_id', x.asset_id).eq('date', x.date);
    log.push(`ANBIMA: ${rows.length} PUs indicativos`);
  } catch (e) { log.push(`ANBIMA: falhou (${(e as Error).message})`); }
}

Deno.serve(async (req) => {
  const got = req.headers.get('x-cron-secret') ?? '';
  const envSecret = Deno.env.get('WEALTH_CRON_SECRET');
  const ok = (!!envSecret && got === envSecret) || (!!got && (await sb.rpc('w_cron_ok', { p: got })).data === true);
  if (!ok) return new Response('forbidden', { status: 403 });
  try {
    const today = lastBiz(D(iso(new Date())));
    const todayIso = iso(today);
    await loadIndices(new Date());
    const cols = 'id,kind,name,ticker,isin,cnpj_fundo,indexer,rate,issue_date,maturity,pu_inicial,custom';
    const used = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data: tx } = await sb.from('w_invest_tx').select('asset_id').range(from, from + 999);
      (tx ?? []).forEach((x: any) => used.add(x.asset_id)); if (!tx || tx.length < 1000) break;
    }
    const keepAll = new Set<string>(used);
    const assets: Asset[] = [];
    const { data: own } = await sb.from('w_assets').select(cols).not('wallet_id', 'is', null).limit(20000);
    (own ?? []).forEach((a: any) => { assets.push(a); keepAll.add(a.id); used.delete(a.id); });
    const ids = [...used];
    for (let i = 0; i < ids.length; i += 200) { const { data: g } = await sb.from('w_assets').select(cols).in('id', ids.slice(i, i + 200)); (g ?? []).forEach((a: any) => assets.push(a)); }
    const have = new Set(assets.map((a) => a.id));
    for (let from = 0; ; from += 1000) {
      const { data: g } = await sb.from('w_assets').select(cols).is('wallet_id', null).in('kind', ['acao', 'fii', 'etf', 'bdr', 'tesouro', 'fundo', 'cripto']).order('id').range(from, from + 999);
      (g ?? []).forEach((a: any) => { if (!have.has(a.id)) { assets.push(a); have.add(a.id); } }); if (!g || g.length < 1000) break;
    }
    const ylds = await tesouro(assets, todayIso);
    const cdi = await fetchAll('CDI'), ipca = await fetchAll('IPCA');
    const curves = makeCurves(cdi, ipca);
    const rf = assets.filter((a) => ['rf_pre', 'rf_pos', 'rf_ipca'].includes(a.kind) && !a.custom);
    const { data: had } = await sb.from('w_asset_prices').select('asset_id').in('asset_id', rf.map((a) => a.id).slice(0, 5000)).limit(100000);
    const hasHist = new Set((had ?? []).map((x: any) => x.asset_id));
    const rows: any[] = [];
    for (const a of rf) {
      const dates = [todayIso];
      if (!hasHist.has(a.id) && a.issue_date) {
        for (let m = D(a.issue_date.slice(0, 7) + '-01'); iso(m) < todayIso; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
          const me = iso(lastBiz(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0))));
          if (me >= a.issue_date && me < todayIso) dates.push(me);
        }
      }
      // o preço a mercado também é calculado nos fins de mês do histórico (a curva do Tesouro tem todas as datas)
      for (const dt of dates) {
        const p = priceAsset(a, dt, curves, ylds);
        if (p) rows.push({ asset_id: a.id, date: dt, pu: r8(p.pu), pu_mercado: p.pu_mercado === null ? null : r8(p.pu_mercado), source: 'curva' });
      }
    }
    await upsertPrices(rows);
    log.push(`Renda fixa (curva e mercado): ${rows.length} preços para ${rf.length} ativos, ${rows.filter((x) => x.pu_mercado !== null).length} com preço a mercado`);
    await anbima(assets, todayIso);
    await crypto(assets, todayIso);
    await b3(assets, today);
    await cvm(assets, today, keepAll);
    return new Response(JSON.stringify({ ok: true, date: todayIso, log }), { headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message, log }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
});
