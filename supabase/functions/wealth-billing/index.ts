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
type Event = { event_id: string; type: 'paid' | 'failed' | 'canceled' | 'refunded' | 'authorized' | 'ignore'; charge_id?: string; customer_id?: string; card_brand?: string; card_last4?: string; payload: unknown };
type Checkout = { provider: string; url: string | null; customer_id?: string; pix_payload?: string | null; authorized?: boolean };

interface Provider {
  name: string;
  checkout(user: string, p: Profile, monthly: number, firstDue: string, unitPrice: number): Promise<Checkout>;
  createCharge(p: Pending): Promise<Charge | null>;
  parseWebhook(body: any, headers: Headers, raw: string): Event | null | Promise<Event | null>;
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

/* ---------- Trio: Pix Automático (API V2, https://docs.trio.com.br/v2/guides/receivables/using-pix-automatic) ----------
   Recorrência mensal de valor variável (o valor depende de quantas carteiras o titular tem): o pagador autoriza uma vez pelo
   QR code (Pix copia e cola) no app do banco; a cada fatura criamos a cobrança do ciclo e a agendamos 2 a 10 dias antes do vencimento.
   Autenticação: HTTP Basic (client_id:client_secret) + cabeçalho Trio-Version. Webhook: cabeçalho x-webhook-secret e assinatura
   HMAC-SHA-256 (hexadecimal maiúsculo) do corpo cru em x-webhook-signature, com a notification_key do webhook. */
const TRIO_VERSION_DEFAULT = '2026-10-19.v2'; // versão vigente na documentação em 24/11/2026 (enum do cabeçalho Trio-Version)
const trioReady = () => !!(env('TRIO_CLIENT_ID') && env('TRIO_CLIENT_SECRET') && env('TRIO_BANK_ACCOUNT_ID'));
async function trio(method: string, path: string, body?: unknown) {
  const base = env('TRIO_BASE_URL') || 'https://api.sandbox.trio.com.br';
  const r = await fetch(`${base}${path}`, { method, headers: { authorization: `Basic ${btoa(`${env('TRIO_CLIENT_ID')}:${env('TRIO_CLIENT_SECRET')}`)}`, 'trio-version': env('TRIO_VERSION') || TRIO_VERSION_DEFAULT, 'content-type': 'application/json', accept: 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`trio ${r.status}: ${JSON.stringify(j?.errors ?? j?.error ?? j).slice(0, 200)}`);
  return j?.data ?? j;
}
const cents = (v: number) => Math.round(Number(v) * 100);
const daysUntil = (d: string) => Math.round((D(d).getTime() - D(new Date().toISOString().slice(0, 10)).getTime()) / 864e5);
const D = (s: string) => new Date(s + 'T00:00:00Z');
async function hmacHexUpper(key: string, raw: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(raw)));
  return [...s].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
const sameText = (a: string, b: string) => { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
const trioProv: Provider = {
  name: 'trio',
  async checkout(user, p, monthly, firstDue, unitPrice) {
    if (!trioReady()) return { provider: 'trio', url: null };
    // já autorizado: nada a fazer; pendente ou recusado: nova recorrência (o QR anterior expira sozinho)
    if (p.provider === 'trio' && p.provider_customer_id) {
      const cur = await trio('GET', `/v2/in/pix/recurrences/${encodeURIComponent(p.provider_customer_id)}`).catch(() => null);
      if (cur?.status === 'approved' || cur?.authorized_at) return { provider: 'trio', url: null, authorized: true, customer_id: cur.id };
    }
    const start = daysUntil(firstDue) >= 3 ? firstDue : new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10); // start_date: no mínimo 3 dias à frente
    const rec = await trio('POST', '/v2/in/pix/recurrences', {
      bank_account_id: env('TRIO_BANK_ACCOUNT_ID'),
      counterparty: { tax_number: p.doc, name: p.holder_name.slice(0, 140) },
      description: 'Lottus Wealth', // até 35 caracteres; aparece para o pagador na autorização
      contract_number: `LW${user.replace(/-/g, '')}`.slice(0, 35),
      periodicity: 'mnth', start_date: start, external_id: user,
      amounts: { minimum: cents(unitPrice) }, // valor variável (muda com o nº de carteiras), com mínimo = preço de 1 carteira
      options: { authorization_type: 'qrcode', automatic_schedule: false, automated_attempt_retry: true, retry_policy: '3r_7d', next_working_day: true, qrcode_expiration_seconds: 172800 },
    });
    await sb.rpc('w_billing_set_customer', { p_user: user, p_provider: 'trio', p_customer_id: String(rec.id) });
    return { provider: 'trio', url: null, customer_id: rec.id, pix_payload: typeof rec?.qrcode?.hash === 'string' ? rec.qrcode.hash : null };
  },
  async createCharge(p) {
    if (!trioReady() || p.profile.provider !== 'trio' || !p.profile.provider_customer_id) return null;
    // a Trio só aceita agendar 2 a 10 dias antes do vencimento: antes disso esperamos a próxima rodada; depois, registramos o erro
    const d = daysUntil(p.due_date);
    if (d > 10) return null;
    if (d < 2) throw new Error('trio: fora da janela de agendamento (2 a 10 dias antes do vencimento)');
    const col = await trio('POST', '/v2/in/pix/recurrences/collections/next', { recurrence_id: p.profile.provider_customer_id });
    try {
      await trio('POST', `/v2/in/pix/recurrences/collections/${encodeURIComponent(col.id)}/schedule`, { amount: cents(p.amount), due_date: p.due_date, external_id: p.invoice });
    } catch (e) {
      // não deixa cobrança criada e não agendada: cancela e devolve o erro para nova tentativa
      await trio('POST', `/v2/in/pix/recurrences/collections/${encodeURIComponent(col.id)}/cancel`, { requester_tax_number: env('TRIO_REQUESTER_TAX_NUMBER') || p.profile.doc }).catch(() => null);
      throw e;
    }
    return { provider: 'trio', charge_id: String(col.id), method: 'pix' };
  },
  async parseWebhook(b, h, raw) {
    const secret = env('TRIO_WEBHOOK_SECRET'), key = env('TRIO_NOTIFICATION_KEY');
    if (!secret || !key || !sameText(h.get('x-webhook-secret') ?? '', secret)) return null;
    if (!sameText(h.get('x-webhook-signature') ?? '', await hmacHexUpper(key, raw))) return null;
    const e = b?.event ?? b; // os exemplos da documentação trazem o envelope dentro de "event"
    const cat = e?.category, type = e?.type, data = e?.data ?? {}; const ref = String(e?.ref_id ?? e?.reference_id ?? data.id ?? '');
    if (!cat || !type || !ref) return null;
    const event_id = `${ref}:${cat}:${type}`; // a Trio reenvia notificações: ref_id + categoria + tipo identificam a notificação
    const payload = { category: cat, type, ref_id: ref, status: data.status ?? null };
    if (cat === 'recurrence' && type === 'approved') return { event_id, type: 'authorized', customer_id: String(data.id ?? ref), payload };
    if (cat === 'recurrence_collection') {
      const map: Record<string, Event['type']> = { settled: 'paid', expired: 'failed', rejected: 'failed', cancelled: 'canceled' };
      if (map[type]) return { event_id, type: map[type], charge_id: String(data.id ?? ref), payload };
    }
    return { event_id, type: 'ignore', payload }; // demais eventos (criação, tentativas, recorrência recusada/expirada) só confirmam o recebimento
  },
};

const PROVIDERS: Record<string, Provider> = { manual, asaas: asaasProv, trio: trioProv };
const forMethod = (m: string): Provider => (!live() ? manual : m === 'pix' ? trioProv : m === 'cartao' || m === 'boleto' ? asaasProv : manual);

async function applyEvent(prov: Provider, ev: Event) {
  if (ev.type === 'authorized' || (ev.type === 'paid' && ev.customer_id && ev.card_last4)) {
    const { data: auth, error: ae } = await sb.rpc('w_billing_authorized', { p_provider: prov.name, p_customer_id: ev.customer_id, p_card_brand: ev.card_brand ?? null, p_card_last4: ev.card_last4 ?? null });
    if (ae) throw new Error(ae.message);
    if (auth !== 'ok') console.warn('autorização sem cliente conhecido', prov.name);
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
    if (!u?.user) return withCors(req, json({ ok: false, error: 'unauthorized' }, 401));
    const { data: info, error } = await sb.rpc('w_billing_checkout_info', { p_user: u.user.id });
    if (error || !info?.profile || !['pro', 'fund'].includes(info.plan)) return withCors(req, json({ ok: false, error: 'billing_required' }, 400));
    const prov = forMethod(info.profile.method);
    try {
      const c = await prov.checkout(u.user.id, info.profile, Number(info.price) * Math.max(Number(info.wallets), 1), nextDue(), Number(info.price));
      return withCors(req, json({ ok: true, provider: c.provider, url: c.url, pix_payload: c.pix_payload ?? null, authorized: !!c.authorized }));
    } catch (e) { console.error('checkout', (e as Error).message); return withCors(req, json({ ok: true, provider: prov.name, url: null, pending: true })); }
  }

  if (action === 'webhook') {
    const pname = url.searchParams.get('provider') ?? 'manual'; const prov = Object.hasOwn(PROVIDERS, pname) ? PROVIDERS[pname] : null;
    if (!prov) return new Response('not found', { status: 404 });
    const raw = await req.text(); let body: any = null; try { body = JSON.parse(raw); } catch { /* corpo inválido */ }
    const ev = await prov.parseWebhook(body, req.headers, raw);
    if (!ev) return new Response('forbidden', { status: 403 });
    if (ev.type === 'ignore') return json({ ok: true, ignored: true });
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
