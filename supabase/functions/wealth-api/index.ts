// Lottus Wealth — API pública v1 (só leitura). NÃO PUBLICADA: depende da migração 20261123125000 (w_api_call).
// Autenticação: Authorization: Bearer wk_… (ou x-api-key). A chave é conferida no banco pelo hash; o banco aplica
// as mesmas regras da tela (titular da cobrança, plano Fund em dia, carteiras da chave, validade).
// Rotas:
//   GET /v1/carteiras
//   GET /v1/carteiras/{id}                 (= patrimonio)
//   GET /v1/carteiras/{id}/patrimonio      ?visao=curva|mercado
//   GET /v1/carteiras/{id}/posicoes        ?visao=curva|mercado
//   GET /v1/carteiras/{id}/evolucao        ?meses=12&visao=
//   GET /v1/carteiras/{id}/transacoes      ?de=AAAA-MM-DD&ate=AAAA-MM-DD&pagina=1
//   GET /v1/carteiras/{id}/gastos          ?de=&ate=&pagina=
// Segredos: só os padrão da função (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). Sem CORS de propósito: uso servidor a servidor.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const RESOURCES = new Set(['patrimonio', 'posicoes', 'evolucao', 'transacoes', 'gastos']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS: Record<string, [number, string]> = {
  unauthorized: [401, 'Chave inválida, expirada ou revogada.'],
  not_found: [404, 'Carteira ou recurso não encontrado para esta chave.'],
  invalid_value: [400, 'Parâmetro inválido.'],
  forbidden: [403, 'Sem permissão.'],
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const fail = (code: string) => { const [s, m] = STATUS[code] ?? [500, 'Erro interno.']; return json({ erro: { codigo: s === 500 ? 'erro_interno' : code, mensagem: m } }, s); };

Deno.serve(async (req) => {
  if (req.method !== 'GET') return json({ erro: { codigo: 'metodo', mensagem: 'Use GET.' } }, 405);
  const url = new URL(req.url);
  const key = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '') || req.headers.get('x-api-key') || '';
  if (!/^wk_[0-9a-f]{48}$/.test(key)) return fail('unauthorized');
  // o caminho chega como /wealth-api/v1/...; aceitamos também sem o prefixo da função
  const parts = url.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  if (parts[0] === 'wealth-api') parts.shift();
  if (parts[0] !== 'v1' || parts[1] !== 'carteiras' || parts.length > 4) return fail('not_found');
  const wallet = parts[2] ?? null; const resource = wallet ? (parts[3] ?? 'patrimonio') : 'carteiras';
  if (wallet && !UUID.test(wallet)) return fail('not_found');
  if (wallet && !RESOURCES.has(resource)) return fail('not_found');
  const q = url.searchParams; const params: Record<string, string> = {};
  for (const k of ['visao', 'meses', 'de', 'ate', 'pagina']) { const v = q.get(k); if (v !== null && v !== '') params[k] = v; }
  if (params.visao && !['curva', 'mercado'].includes(params.visao)) return fail('invalid_value');
  const realDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  if ((params.de && !realDate(params.de)) || (params.ate && !realDate(params.ate))) return fail('invalid_value');
  if (params.meses && !(/^\d{1,3}$/.test(params.meses) && +params.meses >= 1 && +params.meses <= 120)) return fail('invalid_value');
  if (params.pagina && !(/^\d{1,5}$/.test(params.pagina) && +params.pagina >= 1)) return fail('invalid_value');
  const { data, error } = await sb.rpc('w_api_call', { p_key: key, p_resource: resource, p_wallet: wallet, p_params: params });
  if (error) { const code = Object.keys(STATUS).find((c) => error.message.includes(c)); if (!code) console.error('wealth-api', error.message); return fail(code ?? 'erro'); }
  return json(data);
});
