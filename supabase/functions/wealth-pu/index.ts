// Lottus Wealth — atualização diária de P.U. NÃO PUBLICADA nesta versão (a de produção em 23/11 é a v4, sem cripto nem ANBIMA).
// Fontes gratuitas: BCB SGS (CDI 12, IPCA 433), Tesouro Transparente, CVM (informe diário), B3 COTAHIST e Mercado Bitcoin (cripto).
// Novidades da v2 (pedido de 23/11):
//  · Cripto: cotação em reais pela API pública do Mercado Bitcoin (CRYPTO_SOURCE=0 desliga).
//  · Renda fixa "a mercado" por cálculo: taxa de mercado de hoje (Tesouro de prazo parecido) + o spread que o título
//    tinha na emissão (taxa contratada − taxa do Tesouro naquele dia). Vale para pré (CDB, LCI, LCA, CRI, CRA, debêntures
//    prefixados) e IPCA+. Pós-fixado em % do CDI fica igual à curva (spread de crédito constante).
//  · ANBIMA: PU indicativo de debêntures, CRI e CRA pelo código do ativo, só com ANBIMA_ENABLED=1 e credenciais
//    (ANBIMA_CLIENT_ID/ANBIMA_CLIENT_SECRET). Desligado até a confirmação da licença de uso dos dados (pendência W-v2-ANBIMA).
// Ação pu_at (POST, JWT do usuário): P.U. de um ativo numa data, buscando na fonte se o banco não tiver.
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

type CovRow = { first_price: string | null; last_price: string | null; first_tx: string | null; first_pu?: number | null; months?: string[] | null };
type Cov = Map<string, CovRow>;
// O que falta buscar de cada ativo: desde a 1ª transação (se ainda não há preço tão antigo) ou desde o último preço guardado.
async function coverage(ids: string[]): Promise<Cov> {
  const out: Cov = new Map();
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await sb.rpc('w_price_coverage', { p_ids: ids.slice(i, i + 500) });
    if (error) throw new Error(error.message);
    for (const r of data ?? []) out.set(r.asset_id, r);
  }
  return out;
}
const addDays = (s: string, n: number) => iso(new Date(D(s).getTime() + n * 864e5));
// data a partir da qual faltam preços: usado → desde a 1ª transação (−5 dias); não usado → só os últimos dias
// meses (AAAA-MM) entre a 1ª transação e o mês passado que ainda não têm nenhum preço guardado: buracos do histórico
function missingMonths(c: CovRow | undefined, today: string): string[] {
  if (!c?.first_tx) return [];
  const have = new Set(c.months ?? []); const cur = today.slice(0, 7); const out: string[] = [];
  for (let d = D(c.first_tx.slice(0, 7) + '-01'); iso(d).slice(0, 7) < cur; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) { const m = iso(d).slice(0, 7); if (!have.has(m)) out.push(m); }
  return out;
}
function needFrom(c: CovRow | undefined, today: string, recentDays = 10): string {
  const recent = addDays(today, -recentDays);
  if (!c) return recent;
  if (c.first_tx && (!c.first_price || c.first_price > c.first_tx)) return addDays(c.first_tx, -5);
  return c.last_price ? (addDays(c.last_price, 1) < recent ? addDays(c.last_price, 1) : recent) : recent;
}

// Tesouro: grava só o que falta de cada título (antes regravava todo o histórico e estourava o tempo da função).
// O tipo precisa ser exatamente o do nome ("Tesouro IPCA+ 2032" ≠ "Tesouro IPCA+ com Juros Semestrais 2035").
async function tesouro(assets: Asset[], today: string, cov: Cov): Promise<Yields> {
  const list = assets.filter((a) => a.kind === 'tesouro' && !a.custom);
  const ylds: Yields = new Map([['pre', new Map()], ['ipca', new Map()]]);
  const from = new Map(list.map((a) => [a.id, needFrom(cov.get(a.id), today)]));
  const tipoOf = (a: Asset) => a.name.toLowerCase().replace(/\s+\d{4}\s*$/, '').trim();
  const url = Deno.env.get('TESOURO_CSV_URL') ?? 'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv';
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    const lines = (await r.text()).split(/\r?\n/);
    const byKey = new Map<string, Asset[]>();
    for (const a of list) { const k = `${tipoOf(a)}|${a.maturity ?? a.name.slice(-4)}`; byKey.set(k, [...(byKey.get(k) ?? []), a]); }
    const rows: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(';');
      if (c.length < 8) continue;
      const [tipo, venc, base, , , , , puBase] = c;
      const date = brDate(base), vencIso = brDate(venc), tl = tipo.toLowerCase().trim();
      // curvas de referência: Prefixado (LTN) e IPCA+ (NTN-B Principal), todo o histórico (para o spread da emissão)
      const kind = tl === 'tesouro prefixado' ? 'pre' : tl === 'tesouro ipca+' ? 'ipca' : null;
      if (kind) { const m = ylds.get(kind)!; const arr = m.get(date) ?? []; arr.push([vencIso, num(c[3]) / 100]); m.set(date, arr); }
      for (const a of [...(byKey.get(`${tl}|${vencIso}`) ?? []), ...(byKey.get(`${tl}|${vencIso.slice(0, 4)}`) ?? [])]) {
        if (date < from.get(a.id)!) continue;
        const pu = num(puBase); if (pu > 0) rows.push({ asset_id: a.id, date, pu, source: 'tesouro_transparente' });
      }
    }
    await upsertPrices(rows);
    log.push(`Tesouro: ${rows.length} preços novos para ${list.length} títulos; curvas pré ${ylds.get('pre')!.size} dias, IPCA+ ${ylds.get('ipca')!.size} dias`);
  } catch (e) { log.push(`Tesouro: falhou (${(e as Error).message})`); }
  return ylds;
}

// Uma linha por fundo e dia: desde 2024 a CVM publica uma linha por subclasse no mesmo CNPJ. Fica a linha sem subclasse
// (a cota da classe) e, se só houver subclasses, sempre a de menor identificador, para a série não pular entre elas.
function cvmParse(text: string, byCnpj: Map<string, Asset>, want: (a: Asset, date: string) => boolean): any[] {
  let head: string[] = []; let iC = -1, iQ = -1, iD = -1, iS = -1;
  const best = new Map<string, { sub: string; row: any }>();
  for (const ln of text.split(/\r?\n/)) {
    const c = ln.split(';');
    if (!head.length) { head = c; iC = head.indexOf('CNPJ_FUNDO_CLASSE') >= 0 ? head.indexOf('CNPJ_FUNDO_CLASSE') : head.indexOf('CNPJ_FUNDO'); iQ = head.indexOf('VL_QUOTA'); iD = head.indexOf('DT_COMPTC'); iS = head.indexOf('ID_SUBCLASSE'); continue; }
    const a = byCnpj.get((c[iC] ?? '').replace(/\D/g, '')); if (!a) continue;
    const date = c[iD]; if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !want(a, date)) continue;
    const q = Number(c[iQ]); if (!(q > 0)) continue;
    const sub = iS >= 0 ? (c[iS] ?? '').trim() : ''; const k = a.id + date; const cur = best.get(k);
    if (!cur || (cur.sub !== '' && (sub === '' || sub < cur.sub))) best.set(k, { sub, row: { asset_id: a.id, date, pu: q, source: 'cvm_informe_diario' } });
  }
  return [...best.values()].map((x) => x.row);
}
const histCache = new Map<string, Uint8Array | null>();
async function cvmFile(ym: string): Promise<string | null> {
  const r = await fetch(`https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_${ym}.zip`);
  if (r.ok) { const files = unzipSync(new Uint8Array(await r.arrayBuffer())); return new TextDecoder('latin1').decode(Object.values(files)[0]); }
  // anos antigos: a CVM guarda em HIST/ um arquivo por ano (vários CSV mensais dentro); usamos só o do mês pedido
  // o ZIP anual é baixado uma vez por execução e só o CSV do mês é descompactado (filtro do fflate), para não estourar memória
  const y = ym.slice(0, 4);
  if (!histCache.has(y)) { const h = await fetch(`https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/HIST/inf_diario_fi_${y}.zip`); histCache.set(y, h.ok ? new Uint8Array(await h.arrayBuffer()) : null); }
  const zip = histCache.get(y); if (!zip) return null;
  const files = unzipSync(zip, { filter: (f) => f.name.includes(ym) });
  const name = Object.keys(files)[0]; return name ? new TextDecoder('latin1').decode(files[name]) : null;
}
// anota a tentativa de cada ativo naquele mês (achou ou não): mês sem dados não trava o preenchimento dos outros
async function markTried(month: string, ids: Iterable<string>, found: Set<string>) {
  const rows = [...ids].map((id) => ({ asset_id: id, month, tried_at: new Date().toISOString(), found: found.has(id) }));
  for (let i = 0; i < rows.length; i += 500) await sb.from('w_price_backfill').upsert(rows.slice(i, i + 500), { onConflict: 'asset_id,month' });
}
// Fundos: cota mais recente de todo o catálogo; para quem usa o fundo, histórico desde a 1ª aplicação
// (até CVM_BACKFILL_MONTHS arquivos mensais por execução, padrão 4; o resto vem nas próximas execuções).
async function cvm(assets: Asset[], today: Date, keepAll: Set<string>, cov: Cov) {
  const list = assets.filter((a) => a.kind === 'fundo' && a.cnpj_fundo && !a.custom);
  if (!list.length) return;
  const todayIso = iso(today);
  const byCnpj = new Map(list.map((a) => [a.cnpj_fundo!.replace(/\D/g, ''), a]));
  const from = new Map(list.filter((a) => keepAll.has(a.id)).map((a) => [a.id, needFrom(cov.get(a.id), todayIso, 40)]));
  const ymOf = (s: string) => s.slice(0, 4) + s.slice(5, 7);
  const months = new Set<string>([ymOf(todayIso)]); if (today.getUTCDate() <= 7) months.add(ymOf(iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)))));
  // buracos: todo mês entre a 1ª aplicação e o mês passado sem cota, do mais antigo para o mais novo, alguns por execução
  const gap = new Map<string, Set<string>>();
  for (const a of list) if (keepAll.has(a.id)) for (const m of missingMonths(cov.get(a.id), todayIso)) { const k = m.replace('-', ''); if (!months.has(k)) gap.set(k, (gap.get(k) ?? new Set()).add(a.id)); }
  const back = [...gap.keys()].sort().slice(0, Number(Deno.env.get('CVM_BACKFILL_MONTHS') ?? 4));
  for (const ym of [...months, ...back]) {
    try {
      const isCur = months.has(ym);
      const text = await cvmFile(ym);
      if (!text) { if (!isCur) await markTried(`${ym.slice(0, 4)}-${ym.slice(4)}`, gap.get(ym) ?? [], new Set()); throw new Error('arquivo indisponível'); }
      const rows = cvmParse(text, byCnpj, (a, date) => (isCur ? (from.has(a.id) ? date >= from.get(a.id)! : true) : (gap.get(ym)?.has(a.id) ?? false)));
      // para os fundos do catálogo que ninguém usa, só a cota mais recente
      const latest = new Map<string, any>(); const keep: any[] = [];
      for (const r of rows) { if (from.has(r.asset_id)) keep.push(r); else { const c = latest.get(r.asset_id); if (!c || c.date < r.date) latest.set(r.asset_id, r); } }
      await upsertPrices([...keep, ...latest.values()]);
      if (!isCur) await markTried(`${ym.slice(0, 4)}-${ym.slice(4)}`, gap.get(ym) ?? [], new Set(keep.map((r) => r.asset_id)));
      log.push(`CVM ${ym}: ${keep.length} cotas de fundos usados, ${latest.size} cotas do catálogo`);
    } catch (e) { log.push(`CVM ${ym}: falhou (${(e as Error).message})`); }
  }
}

function cotahistParse(text: string, byTick: Map<string, Asset[]>, want: (a: Asset, date: string) => boolean): any[] {
  const rows: any[] = [];
  for (const ln of text.split(/\r?\n/)) {
    if (ln.slice(0, 2) !== '01') continue;
    const tick = ln.slice(12, 24).trim(); const as = byTick.get(tick); if (!as) continue;
    const tp = ln.slice(24, 27); if (tp !== '010' && tp !== '020') continue; // TPMERC: à vista (010) ou fracionário (020); opções e termo ficam de fora
    const date = `${ln.slice(2, 6)}-${ln.slice(6, 8)}-${ln.slice(8, 10)}`; const pu = Number(ln.slice(108, 121)) / 100;
    if (pu > 0) for (const a of as) if (want(a, date)) rows.push({ asset_id: a.id, date, pu, source: 'b3_cotahist', tp });
  }
  // se houver à vista e fracionário no mesmo dia, fica o à vista
  rows.sort((x, y) => (x.tp < y.tp ? -1 : x.tp > y.tp ? 1 : 0));
  const seen = new Set<string>(); return rows.filter((r) => { const k = r.asset_id + r.date; if (seen.has(k)) return false; seen.add(k); delete r.tp; return true; });
}
async function cotahistFile(name: string): Promise<string | null> {
  const r = await fetch(`https://bvmf.bmfbovespa.com.br/InstDados/SerHist/${name}`);
  if (!r.ok) return null;
  const files = unzipSync(new Uint8Array(await r.arrayBuffer()));
  return new TextDecoder('latin1').decode(Object.values(files)[0]);
}
// B3: último pregão para todo o catálogo; para quem usa o ativo, histórico mensal desde a 1ª compra (B3_BACKFILL_MONTHS por execução, padrão 3)
async function b3(assets: Asset[], today: Date, keepAll: Set<string>, cov: Cov) {
  if (Deno.env.get('B3_COTAHIST') === '0') { log.push('B3 COTAHIST: desligado'); return; }
  const list = assets.filter((a) => ['acao', 'fii', 'etf', 'bdr'].includes(a.kind) && a.ticker && !a.custom);
  if (!list.length) return;
  const todayIso = iso(today);
  const byTick = new Map<string, Asset[]>();
  for (const a of list) { const k = a.ticker!.toUpperCase(); byTick.set(k, [...(byTick.get(k) ?? []), a]); }
  for (let back = 0; back < 6; back++) {
    const d = new Date(today.getTime() - back * 864e5);
    if (!isBiz(d)) continue;
    const stamp = `${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}${d.getUTCFullYear()}`;
    const text = await cotahistFile(`COTAHIST_D${stamp}.ZIP`); if (!text) continue;
    const rows = cotahistParse(text, byTick, () => true);
    await upsertPrices(rows); log.push(`B3 ${stamp}: ${rows.length} preços`);
    break;
  }
  const from = new Map(list.filter((a) => keepAll.has(a.id)).map((a) => [a.id, needFrom(cov.get(a.id), todayIso, 10)]));
  const curYm = todayIso.slice(0, 7);
  const gap = new Map<string, Set<string>>();
  for (const a of list) if (keepAll.has(a.id)) for (const m of missingMonths(cov.get(a.id), todayIso)) gap.set(m, (gap.get(m) ?? new Set()).add(a.id));
  const months = [...gap.keys()].sort().slice(0, Number(Deno.env.get('B3_BACKFILL_MONTHS') ?? 3));
  for (const ym of months) {
    try {
      const text = await cotahistFile(`COTAHIST_M${ym.slice(5, 7)}${ym.slice(0, 4)}.ZIP`);
      if (!text) { await markTried(ym, gap.get(ym)!, new Set()); throw new Error('arquivo indisponível'); }
      const rows = cotahistParse(text, byTick, (a) => gap.get(ym)!.has(a.id));
      await upsertPrices(rows); await markTried(ym, gap.get(ym)!, new Set(rows.map((r) => r.asset_id)));
      log.push(`B3 histórico ${ym}: ${rows.length} preços`);
    } catch (e) { log.push(`B3 histórico ${ym}: falhou (${(e as Error).message})`); }
  }
  // o mês corrente que falta para os ativos usados: arquivos diários (no máximo 25 por execução)
  const need = [...from.values()].filter((s) => s.slice(0, 7) === curYm).sort()[0];
  if (need) {
    let n = 0;
    for (let t = D(need); iso(t) < todayIso && n < 25; t = new Date(t.getTime() + 864e5)) {
      if (!isBiz(t)) continue; n++;
      const stamp = `${String(t.getUTCDate()).padStart(2, '0')}${String(t.getUTCMonth() + 1).padStart(2, '0')}${t.getUTCFullYear()}`;
      const text = await cotahistFile(`COTAHIST_D${stamp}.ZIP`); if (!text) continue;
      await upsertPrices(cotahistParse(text, byTick, (a, date) => from.has(a.id) && date >= from.get(a.id)!));
    }
  }
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

// ---------- P.U. de um ativo numa data, pedido pela tela da nova transação (JWT do usuário) ----------
function cors(req: Request): Record<string, string> {
  const allowed = (Deno.env.get('WEALTH_APP_ORIGINS') || 'https://wealth.lottusfinance.com.br').split(',').map((s) => s.trim());
  const o = req.headers.get('origin') ?? '';
  return allowed.includes(o) ? { 'access-control-allow-origin': o, 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin' } : {};
}
const jres = (req: Request, o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...cors(req) } });
async function puAt(req: Request): Promise<Response> {
  const tok = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const body = await req.json().catch(() => ({}));
  const { wallet, asset, date } = body ?? {};
  if (!tok || typeof wallet !== 'string' || typeof asset !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return jres(req, { ok: false, error: 'invalid_value' }, 400);
  // a conferência de acesso é a mesma da tela: chamamos a RPC como o próprio usuário
  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${tok}` } } });
  const first = await user.rpc('w_pu_at', { p_wallet: wallet, p_asset: asset, p_date: date, p_fetch: true }); // exige editor
  if (first.error) return jres(req, { ok: false, error: first.error.message.includes('forbidden') ? 'forbidden' : 'invalid_value' }, first.error.message.includes('forbidden') ? 403 : 400);
  if (first.data?.found && first.data.exact) return jres(req, { ok: true, ...first.data });
  const { data: a } = await sb.from('w_assets').select('id,kind,name,ticker,isin,cnpj_fundo,indexer,rate,issue_date,maturity,pu_inicial,custom').eq('id', asset).single();
  if (!a || a.custom) return jres(req, { ok: true, ...first.data });
  const from = iso(new Date(D(date).getTime() - 10 * 864e5));
  let rows: any[] = [];
  try {
    if (['acao', 'fii', 'etf', 'bdr'].includes(a.kind) && a.ticker) {
      const byTick = new Map([[a.ticker.toUpperCase(), [a]]]);
      for (let t = D(date), n = 0; n < 6; t = new Date(t.getTime() - 864e5)) {
        if (!isBiz(t)) continue; n++;
        const stamp = `${String(t.getUTCDate()).padStart(2, '0')}${String(t.getUTCMonth() + 1).padStart(2, '0')}${t.getUTCFullYear()}`;
        const text = await cotahistFile(`COTAHIST_D${stamp}.ZIP`); if (!text) continue;
        rows = cotahistParse(text, byTick, () => true); if (rows.length) break;
      }
    } else if (a.kind === 'fundo' && a.cnpj_fundo) {
      const byCnpj = new Map([[a.cnpj_fundo.replace(/\D/g, ''), a]]);
      for (const ym of [...new Set([date.slice(0, 4) + date.slice(5, 7), from.slice(0, 4) + from.slice(5, 7)])]) {
        const text = await cvmFile(ym); if (text) rows.push(...cvmParse(text, byCnpj, (_x, d) => d <= date));
      }
    } else if (a.kind === 'tesouro') {
      const cov: Cov = new Map([[a.id, { first_price: null, last_price: null, first_tx: from }]]);
      await tesouro([a], iso(new Date()), cov); // grava desde a data pedida
    } else if (['rf_pre', 'rf_pos', 'rf_ipca'].includes(a.kind) && a.issue_date && a.rate !== null && a.issue_date <= date) {
      const curves = makeCurves(await fetchAll('CDI'), await fetchAll('IPCA'));
      const p = priceAsset(a, date, curves, null); if (p) rows.push({ asset_id: a.id, date, pu: r8(p.pu), source: 'curva' });
    }
    if (rows.length) await upsertPrices(rows);
  } catch (e) { console.error('pu_at', (e as Error).message); }
  const again = await user.rpc('w_pu_at', { p_wallet: wallet, p_asset: asset, p_date: date, p_fetch: false });
  return jres(req, { ok: true, fetched: rows.length, ...(again.data ?? first.data) });
}

Deno.serve(async (req) => {
  const action = new URL(req.url).searchParams.get('action');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (action === 'pu_at') return puAt(req);
  const got = req.headers.get('x-cron-secret') ?? '';
  const envSecret = Deno.env.get('WEALTH_CRON_SECRET');
  log.length = 0; histCache.clear(); // o módulo pode ser reaproveitado entre execuções
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
    // cobertura de preços dos ativos usados (para buscar só o que falta)
    const cov = await coverage([...keepAll]);
    const ylds = await tesouro(assets, todayIso, cov);
    const cdi = await fetchAll('CDI'), ipca = await fetchAll('IPCA');
    const curves = makeCurves(cdi, ipca);
    // renda fixa pela curva: P.U. de todo dia útil desde a emissão (só os dias que faltam), com o preço a mercado
    const rf = assets.filter((a) => ['rf_pre', 'rf_pos', 'rf_ipca'].includes(a.kind) && !a.custom && a.issue_date && a.rate !== null);
    const rows: any[] = [];
    for (const a of rf) {
      const c = cov.get(a.id);
      // se taxa, emissão ou P.U. de emissão mudaram (ex.: edição em lote), o P.U. guardado no 1º dia não bate: recalcula tudo desde a emissão
      let firstBiz = D(a.issue_date!); while (!isBiz(firstBiz)) firstBiz = new Date(firstBiz.getTime() + 864e5); // emissão em fim de semana/feriado
      const firstOk = !!(c?.first_price && c.first_price <= iso(firstBiz) && c.first_pu !== null && c.first_pu !== undefined && (() => { const q = priceAsset(a, c.first_price!, curves, null); return !!q && Math.abs(q.pu - Number(c.first_pu)) < 1e-6 * Math.max(1, q.pu); })());
      if (c && !firstOk && c.first_price) await sb.from('w_asset_prices').delete().eq('asset_id', a.id).eq('source', 'curva');
      let start = firstOk && c?.last_price ? addDays(c.last_price, 1) : a.issue_date!;
      if (c?.last_price && start > todayIso) start = todayIso; // recalcula o dia de hoje (índice novo pode ter chegado)
      for (let t = D(start); iso(t) <= todayIso; t = new Date(t.getTime() + 864e5)) {
        if (!isBiz(t) && iso(t) !== todayIso) continue;
        const dt = iso(t); const p = priceAsset(a, dt, curves, ylds);
        if (p) rows.push({ asset_id: a.id, date: dt, pu: r8(p.pu), pu_mercado: p.pu_mercado === null ? null : r8(p.pu_mercado), source: 'curva' });
      }
    }
    await upsertPrices(rows);
    log.push(`Renda fixa (curva e mercado): ${rows.length} preços para ${rf.length} ativos, ${rows.filter((x) => x.pu_mercado !== null).length} com preço a mercado`);
    await anbima(assets, todayIso);
    await crypto(assets, todayIso);
    await b3(assets, today, keepAll, cov);
    await cvm(assets, today, keepAll, cov);
    return new Response(JSON.stringify({ ok: true, date: todayIso, log }), { headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message, log }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
});
