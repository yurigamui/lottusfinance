// Lottus Wealth — cobrança. NÃO PUBLICADA (a versão em produção em 23/11 é a de 1 provedor "manual").
// Provedores por forma de pagamento (decisão W-v2-03):
//   pix    → Trio (Pix Automático). A documentação da Trio não é pública: o adaptador está pronto para receber os
//            endereços e campos reais (TRIO_*), e até lá devolve "não configurado" e a fatura fica aguardando.
//   cartao → Asaas (assinatura mensal no cartão; o cartão é digitado na página do Asaas, nunca aqui).
//   boleto → Asaas (cobrança avulsa por fatura).
// NADA AQUI FOI TESTADO CONTRA OS PROVEDORES (sem credenciais de sandbox nesta sessão). Ver depende-de-mim.md (W-v2).
// Ações:
//   POST ?action=checkout         (JWT do usuário)  cria o cliente no provedor e devolve o link de autorização/pagamento
//   POST ?action=webhook&provider=asaas|trio|manual  eventos do provedor (token no cabeçalho)
//   POST (x-cron-secret)          gera as cobranças das faturas em aberto (w_billing_pending)
// Segredos (Vault/env, nunca no código): WEALTH_CRON_SECRET, PAYMENT_WEBHOOK_TOKEN (manual), ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN,
//   ASAAS_BASE_URL (padrão: sandbox), TRIO_API_KEY, TRIO_BASE_URL, TRIO_WEBHOOK_TOKEN. BILLING_LIVE=1 liga os provedores reais.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const env = (k: string) => Deno.env.get(k) ?? '';
const live = () => env('BILLING_LIVE') === '1';

type Profile = { holder_name: string; doc: string; email: string; zip: string; street: string; number: string; complement?: string; district: string; city: string; state: string; method: 'pix' | 'cartao' | 'boleto'; provider?: string; provider_customer_id?: string };
type Pending = { invoice: string; user: string; amount: number; due_date: string; ref_month: string; profile: Profile };
type Charge = { provider: string; charge_id: string; method: string; pix_payload?: string; boleto_url?: string; boleto_line?: string };
type Event = { event_id: string; type: 'paid' | 'failed' | 'canceled' | 'refunded' | 'authorized'; charge_id?: string; customer_id?: string; card_brand?: string; card_last4?: string; payload: unknown };
type Checkout = { provider: string; url: string | null; customer_id?: string };

interface Provider {
  name: string;
  checkout(user: string, p: Profile, monthly: number, firstDue: string): Promise<Checkout>;
  createCharge(p: Pending): Promise<Charge | null>;
  parseWebhook(body: any, headers: Headers): Event | null;
}

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const nextDue = () => { const d = new Date(); const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)); return new Date(end.getTime() + 10 * 864e5).toISOString().slice(0, 10); };
const httpsOnly = (u: unknown) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);

/* ---------- manual: sem gateway; a fatura fica "em preparação" ---------- */
const manual: Provider = {
  name: 'manual',
  async checkout() { return { provider: 'manual', url: null }; },
  async createCharge() { return null; },
  parseWebhook(b, h) {
    const tok = env('PAYMENT_WEBHOOK_TOKEN'); if (!tok || h.get('x-webhook-token') !== tok) return null;
    if (!b?.event_id || !b?.type || !b?.charge_id) return null;
    return { event_id: String(b.event_id), type: b.type, charge_id: String(b.charge_id), payload: b };
  },
};

/* ---------- Asaas: cartão (assinatura) e boleto (avulso) ---------- */
async function asaas(path: string, init: RequestInit = {}) {
  const r = await fetch(`${env('ASAAS_BASE_URL') || 'https://sandbox.asaas.com/api/v3'}${path}`, { ...init, headers: { access_token: env('ASAAS_API_KEY'), 'content-type': 'application/json', 'user-agent': 'LottusWealth/1.0', ...(init.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`asaas ${r.status}: ${JSON.stringify(j?.errors ?? j).slice(0, 200)}`);
  return j;
}
async function asaasCustomer(user: string, p: Profile): Promise<string> {
  if (p.provider === 'asaas' && p.provider_customer_id) return p.provider_customer_id;
  const c = await asaas('/customers', { method: 'POST', body: JSON.stringify({ name: p.holder_name, cpfCnpj: p.doc, email: p.email, postalCode: p.zip, address: p.street, addressNumber: p.number, complement: p.complement ?? undefined, province: p.district, externalReference: user, notificationDisabled: false }) });
  await sb.rpc('w_billing_set_customer', { p_user: user, p_provider: 'asaas', p_customer_id: c.id });
  return c.id;
}
const asaasProv: Provider = {
  name: 'asaas',
  async checkout(user, p, monthly, firstDue) {
    const cus = await asaasCustomer(user, p);
    if (p.method !== 'cartao') return { provider: 'asaas', url: null, customer_id: cus };
    // assinatura no cartão: o primeiro pagamento vence com a 1ª fatura; o link abre a página segura do Asaas para digitar o cartão
    const subs = await asaas(`/subscriptions?customer=${encodeURIComponent(cus)}&status=ACTIVE`);
    let sub = subs?.data?.[0];
    if (!sub) sub = await asaas('/subscriptions', { method: 'POST', body: JSON.stringify({ customer: cus, billingType: 'CREDIT_CARD', value: monthly, nextDueDate: firstDue, cycle: 'MONTHLY', description: 'Lottus Wealth', externalReference: user }) });
    const pays = await asaas(`/subscriptions/${encodeURIComponent(sub.id)}/payments`);
    return { provider: 'asaas', url: httpsOnly(pays?.data?.[0]?.invoiceUrl), customer_id: cus };
  },
  async createCharge(p) {
    const cus = await asaasCustomer(p.user, p.profile);
    if (p.profile.method === 'cartao') {
      // ajusta o valor do pagamento da assinatura que vence junto com a fatura e liga os dois pelo id
      const subs = await asaas(`/subscriptions?customer=${encodeURIComponent(cus)}&status=ACTIVE`); const sub = subs?.data?.[0];
      if (!sub) throw new Error('assinatura_do_cartao_nao_encontrada');
      const pays = await asaas(`/subscriptions/${encodeURIComponent(sub.id)}/payments`);
      const pay = (pays?.data ?? []).find((x: any) => x.dueDate === p.due_date && x.status === 'PENDING');
      if (!pay) return null; // o Asaas ainda não gerou o pagamento do mês; tenta na próxima rodada
      if (Number(pay.value) !== Number(p.amount)) await asaas(`/payments/${encodeURIComponent(pay.id)}`, { method: 'PUT', body: JSON.stringify({ value: p.amount, dueDate: p.due_date }) });
      if (Number(sub.value) !== Number(p.amount)) await asaas(`/subscriptions/${encodeURIComponent(sub.id)}`, { method: 'PUT', body: JSON.stringify({ value: p.amount, updatePendingPayments: false }) });
      return { provider: 'asaas', charge_id: pay.id, method: 'cartao' };
    }
    const pay = await asaas('/payments', { method: 'POST', body: JSON.stringify({ customer: cus, billingType: 'BOLETO', value: p.amount, dueDate: p.due_date, description: `Lottus Wealth ${p.ref_month.slice(0, 7)}`, externalReference: p.invoice }) });
    const line = await asaas(`/payments/${encodeURIComponent(pay.id)}/identificationField`).catch(() => null);
    return { provider: 'asaas', charge_id: pay.id, method: 'boleto', boleto_url: httpsOnly(pay.bankSlipUrl) ?? undefined, boleto_line: line?.identificationField ?? undefined };
  },
  parseWebhook(b, h) {
    const tok = env('ASAAS_WEBHOOK_TOKEN'); if (!tok || h.get('asaas-access-token') !== tok) return null;
    const pay = b?.payment; if (!b?.event || !pay?.id) return null;
    const map: Record<string, Event['type']> = { PAYMENT_CONFIRMED: 'paid', PAYMENT_RECEIVED: 'paid', PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'failed', PAYMENT_REPROVED_BY_RISK_ANALYSIS: 'failed', PAYMENT_DELETED: 'canceled', PAYMENT_REFUNDED: 'refunded' };
    const type = map[b.event]; if (!type) return null;
    const card = pay.creditCard ?? {};
    return { event_id: String(b.id ?? `${b.event}:${pay.id}`), type, charge_id: String(pay.id), customer_id: pay.customer, card_brand: card.creditCardBrand, card_last4: card.creditCardNumber, payload: { event: b.event, payment: { id: pay.id, status: pay.status, value: pay.value, dueDate: pay.dueDate, billingType: pay.billingType } } };
  },
};

/* ---------- Trio: Pix Automático (endereços e campos a confirmar com a documentação da Trio) ---------- */
const trioReady = () => !!(env('TRIO_API_KEY') && env('TRIO_BASE_URL') && env('TRIO_PATH_AUTHORIZATION') && env('TRIO_PATH_CHARGE'));
async function trio(path: string, body: unknown) {
  const r = await fetch(`${env('TRIO_BASE_URL')}${path}`, { method: 'POST', headers: { authorization: `Bearer ${env('TRIO_API_KEY')}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`trio ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}
const trioProv: Provider = {
  name: 'trio',
  async checkout(user, p, monthly, firstDue) {
    if (!trioReady()) return { provider: 'trio', url: null };
    // Pix Automático: pedido de autorização recorrente (jornada do BCB); o pagador aceita no app do banco
    const a = await trio(env('TRIO_PATH_AUTHORIZATION'), { external_id: user, payer: { name: p.holder_name, document: p.doc, email: p.email }, amount_max: monthly * 3, frequency: 'MONTHLY', first_due_date: firstDue, description: 'Lottus Wealth' });
    if (a?.customer_id || a?.id) await sb.rpc('w_billing_set_customer', { p_user: user, p_provider: 'trio', p_customer_id: String(a.customer_id ?? a.id) });
    return { provider: 'trio', url: httpsOnly(a?.authorization_url ?? a?.url), customer_id: a?.customer_id ?? a?.id };
  },
  async createCharge(p) {
    if (!trioReady()) return null;
    const c = await trio(env('TRIO_PATH_CHARGE'), { external_id: p.invoice, authorization: p.profile.provider_customer_id, amount: p.amount, due_date: p.due_date, description: `Lottus Wealth ${p.ref_month.slice(0, 7)}` });
    return { provider: 'trio', charge_id: String(c.id), method: 'pix', pix_payload: typeof c.pix_copy_paste === 'string' ? c.pix_copy_paste : undefined };
  },
  parseWebhook(b, h) {
    const tok = env('TRIO_WEBHOOK_TOKEN'); if (!tok || h.get('x-webhook-token') !== tok) return null;
    const map: Record<string, Event['type']> = { 'authorization.accepted': 'authorized', 'charge.paid': 'paid', 'charge.failed': 'failed', 'charge.canceled': 'canceled', 'charge.refunded': 'refunded' };
    const type = map[b?.type]; if (!type || !b?.id) return null;
    return { event_id: String(b.id), type, charge_id: b?.data?.charge_id ? String(b.data.charge_id) : undefined, customer_id: b?.data?.customer_id, payload: b };
  },
};

const PROVIDERS: Record<string, Provider> = { manual, asaas: asaasProv, trio: trioProv };
const forMethod = (m: string): Provider => (!live() ? manual : m === 'pix' ? trioProv : m === 'cartao' || m === 'boleto' ? asaasProv : manual);

async function applyEvent(prov: Provider, ev: Event) {
  if (ev.type === 'authorized' || (ev.type === 'paid' && ev.customer_id && ev.card_last4)) {
    await sb.rpc('w_billing_authorized', { p_provider: prov.name, p_customer_id: ev.customer_id, p_card_brand: ev.card_brand ?? null, p_card_last4: ev.card_last4 ?? null });
    if (ev.type === 'authorized') return 'ok';
  }
  const { data, error } = await sb.rpc('w_payment_event_apply', { p_provider: prov.name, p_event_id: ev.event_id, p_type: ev.type, p_charge_id: ev.charge_id, p_payload: ev.payload });
  if (error) throw new Error(error.message);
  return data;
}

Deno.serve(async (req) => {
  const url = new URL(req.url); const action = url.searchParams.get('action');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });

  if (action === 'checkout') {
    const tok = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u } = await sb.auth.getUser(tok);
    if (!u?.user) return json({ ok: false, error: 'unauthorized' }, 401);
    const { data: info, error } = await sb.rpc('w_billing_checkout_info', { p_user: u.user.id });
    if (error || !info?.profile || !['pro', 'fund'].includes(info.plan)) return withCors(req, json({ ok: false, error: 'billing_required' }, 400));
    const prov = forMethod(info.profile.method);
    try {
      const c = await prov.checkout(u.user.id, info.profile, Number(info.price) * Math.max(Number(info.wallets), 1), nextDue());
      return withCors(req, json({ ok: true, provider: c.provider, url: c.url }));
    } catch (e) { console.error('checkout', (e as Error).message); return withCors(req, json({ ok: true, provider: prov.name, url: null, pending: true })); }
  }

  if (action === 'webhook') {
    const prov = PROVIDERS[url.searchParams.get('provider') ?? 'manual'];
    if (!prov) return new Response('not found', { status: 404 });
    const ev = prov.parseWebhook(await req.json().catch(() => null), req.headers);
    if (!ev) return new Response('forbidden', { status: 403 });
    try { return json({ ok: true, result: await applyEvent(prov, ev) }); } catch (e) { return json({ ok: false, error: (e as Error).message }, 500); }
  }

  const secret = env('WEALTH_CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('forbidden', { status: 403 });
  const { data: pend, error } = await sb.rpc('w_billing_pending');
  if (error) return json({ ok: false, error: error.message }, 500);
  const out = { live: live(), pending: (pend as Pending[]).length, charged: 0, skipped: 0, failed: 0 };
  for (const p of pend as Pending[]) {
    const prov = forMethod(p.profile.method);
    try {
      const c = await prov.createCharge(p);
      if (!c) { out.skipped++; continue; }
      const { error: e } = await sb.rpc('w_invoice_set_charge', { p_invoice: p.invoice, p: c });
      if (e) throw new Error(e.message);
      out.charged++;
    } catch (e) {
      out.failed++;
      await sb.rpc('w_invoice_set_error', { p_invoice: p.invoice, p_error: String((e as Error).message).slice(0, 300) });
    }
  }
  return json({ ok: true, ...out });
});

// o checkout é chamado pelo navegador do Wealth: CORS só para o domínio do app
function cors(req: Request): Record<string, string> {
  const allowed = (env('WEALTH_APP_ORIGINS') || 'https://wealth.lottusfinance.com.br').split(',').map((s) => s.trim());
  const o = req.headers.get('origin') ?? '';
  return allowed.includes(o) ? { 'access-control-allow-origin': o, 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin' } : {};
}
function withCors(req: Request, r: Response) { for (const [k, v] of Object.entries(cors(req))) r.headers.set(k, v); return r; }
