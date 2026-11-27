-- 20261125120000_admin_planos_precos_cobranca.sql
-- Plataforma: Admin · Parte 4 (planos, preços personalizados e cobrança automática) · só a camada de banco.
-- Origem: docs/agente/admin/b2-banco-planos-cobranca.md (lacunas 1 a 5) e hipóteses D2 a D4 de docs/agente/admin/status.md.
-- Estado: PRONTA, NÃO APLICADA. Testar primeiro num branch do Supabase (nunca rodou contra o banco real).
--
-- O que faz
--   1. public.price_overrides: preço personalizado por cliente e produto (partners | sign | wealth) com motivo (>=5 caracteres),
--      validade opcional, auditoria e revogação. Um override ativo por (produto, sujeito). RLS ligada SEM política (só por RPC), _guard_delete.
--      Sujeito: partners = funders.id; sign = sign_accounts.id; wealth = w_profiles.user_id.
--   2. RPCs do Admin (SECURITY DEFINER, search_path vazio, grant só a authenticated, _staff(nível) e _staff_log dentro):
--      bo_plan_catalog (analista), bo_customer_plan (analista), bo_price_override_list (analista),
--      bo_price_override_set (aprovador; desconto efetivo até 20% = D4; acima disso exige administrador),
--      bo_price_override_revoke (aprovador), bo_set_plan (administrador; sign, wealth e partners), bo_overdue_list (analista; D3).
--   3. Internas (só service_role): _effective_price, _override_fee_rate, _partners_fee_calc,
--      _w_price_for, _bill_generate_auto.
--      REDEFINE _platform_fee_run(date) com create or replace: mesma lógica, mais o override (fee_rate no ramo contrato, desconto, valor fixo).
--      Sem override o resultado é idêntico ao anterior.
--   4. _bill_generate_auto(mês): gera em bill_invoices as faturas do mês anterior (taxa de plataforma a partir de platform_fees e
--      mensalidade do Sign), idempotente por (cliente, ref_month, source); job pg_cron 'lottus-billing-auto' (0 13 2 * *, 10:00 UTC-3), só se
--      a extensão pg_cron existir. O envio NÃO está coberto: ver A-028 abaixo.
--
-- ANTES DE APLICAR: comparar _platform_fee_run, _plan_fee e _staff com pg_get_functiondef de produção; o create or replace falha se a assinatura diferir.
-- (Premissas conferidas em docs/agente/admin/b2-defs-producao.sql, leitura real de 25/11/2026: _plan_fee(numeric) devolve numeric; rate_aa é FRAÇÃO ao ano;
--  PL vem de _funder_pl(funder_id, data); _staff levanta forbidden | mfa_required | insufficient_level.)
-- REGRAS DE COBRANÇA AUTOMÁTICA
--   * Vigência: o override vale se estiver vigente no ÚLTIMO DIA do mês de competência (ref_month); override criado hoje não retroage a competência já fechada.
--   * Fatura CANCELADA conta como "já tratada": _bill_generate_auto não recria para o mesmo (cliente, ref_month, source). Para refazer, a equipe emite
--     manualmente (bo_inv_save) a nova fatura.
--   * Limite D4 (20%): mede o preço resultante contra o preço de TABELA; custom_price do Sign + desconto acima de 20% sobre a tabela exige administrador.
-- ATENÇÃO antes de aplicar (ler com o Yuri)
--   * _platform_fee_run é o corpo REAL de produção (25/11/2026) com 3 linhas de override; sem override o resultado é idêntico. Antes de aplicar, salvar a
--     versão que estiver em produção na hora (pode ter mudado): select pg_get_functiondef('public._platform_fee_run'::regproc);
--   * fee_rate só vale para fundo no ramo contrato/'invite' (substitui v_rate); em fundo 'self' (tabela global) é recusado ('fee_rate_needs_contract').
--     rate_aa e fee_rate são FRAÇÃO ao ano (0,001 = 0,1% a.a.); por isso price_overrides.value é numeric(14,6).
--   * bill_invoices tem CHECKs reais: customer_kind in ('funder','sign','lead','other','customer'), source in ('platform_fee','sign','manual'),
--     status in ('open','paid','cancelled'), amount >= 0. _bill_generate_auto usa só customer_kind 'funder'/'sign' e source 'platform_fee'/'sign'.
--     O e-mail da fatura do Sign fica nulo (sign_accounts não tem e-mail).
--   * A-028 (pendência): a régua real _bill_reminders_run só considera faturas com org_id em one_orgs com remind_enabled. As faturas geradas aqui
--     (taxa de plataforma e Sign) saem SEM org_id e, portanto, NÃO recebem lembrete por ela. _bill_reminders_run NÃO foi alterada; decidir à parte.
--   * Esta migração não altera _w_price nem w_billing_close: oferece _w_price_for(user, plano) para a cobrança do Wealth passar a usar
--     (próximo passo, fora deste escopo).
--
-- Como reverter
--   select cron.unschedule('lottus-billing-auto');   -- se o job foi criado
--   drop function if exists public.bo_plan_catalog(), public.bo_customer_plan(text, uuid), public.bo_price_override_list(text, uuid),
--     public.bo_price_override_set(jsonb), public.bo_price_override_revoke(uuid, text), public.bo_set_plan(jsonb), public.bo_overdue_list(),
--     public._bill_generate_auto(date), public._w_price_for(uuid, text), public._partners_fee_calc(uuid, date),
--     public._override_fee_rate(uuid, date),
--     public._effective_price(text, uuid, numeric, date), public._price_subject(text, uuid);
--   -- restaurar _platform_fee_run (corpo real de 25/11/2026, de docs/agente/admin/b2-defs-producao.sql; confirmar com o pg_get_functiondef salvo antes de aplicar):
--   create or replace function public._platform_fee_run(p_month date default null) returns integer
--   language plpgsql security definer set search_path to '' as $f$
--   declare
--     v_m date := coalesce(date_trunc('month', p_month)::date, (date_trunc('month', public._today_br()) - interval '1 month')::date);
--     v_end date := (v_m + interval '1 month - 1 day')::date;
--     f record; v_pl numeric; v_rate numeric; v_min numeric; v_amt numeric; n int := 0;
--   begin
--     for f in select x.id, coalesce(b.origin, 'invite') origin, coalesce(b.exempt, false) exempt
--              from public.funders x left join public.funder_billing b on b.funder_id = x.id loop
--       if f.exempt then continue; end if;
--       v_pl := public._funder_pl(f.id, v_end);            -- PL do fundo na data (função interna; stub: devolver pl_declared ou tabela de teste)
--       if f.origin = 'self' then
--         v_amt := public._plan_fee(v_pl); v_rate := 0; v_min := 0;       -- tabela global
--       else
--         select coalesce(p.rate_aa, 0.0010), coalesce(p.min_monthly, 0) into v_rate, v_min
--           from (select 1) d left join public.platform_fee_plans p on p.funder_id = f.id and p.active;
--         v_amt := round(greatest(v_pl * v_rate / 12, v_min), 2);         -- rate_aa fração/ano; padrão 0,10% a.a.
--       end if;
--       if v_amt > 0 then
--         insert into public.platform_fees (funder_id, ref_month, pl, rate_aa, min_monthly, amount)
--         values (f.id, v_m, round(v_pl, 2), v_rate, v_min, v_amt) on conflict (funder_id, ref_month) do nothing;
--         n := n + 1;
--       end if;
--     end loop;
--     return n;
--   end $f$;
--   -- (_plan_fee e _staff não são redefinidas por esta migração.)
--   drop table if exists public.price_overrides;   -- só depois de arquivar os dados (tabela de prova; exige lottus.allow_purge='on').
--   (as faturas já geradas ficam em bill_invoices; cancelar pelo fluxo normal, se for o caso.)

begin;

-- ============ 1. Tabela ============
create table if not exists public.price_overrides (
  id uuid primary key default gen_random_uuid(),
  product text not null check (product in ('partners', 'sign', 'wealth')),
  subject_kind text not null check (subject_kind in ('funder', 'sign_account', 'wealth_user')),
  subject_id uuid not null,
  kind text not null check (kind in ('fixed', 'discount_pct', 'fee_rate')),
  value numeric(14, 6) not null check (value >= 0),
  valid_from date not null default public._today_br(),
  valid_until date,
  reason text not null check (char_length(trim(reason)) >= 5),
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  constraint price_overrides_pct_max check (kind <> 'discount_pct' or value <= 100),
  constraint price_overrides_period check (valid_until is null or valid_until >= valid_from),
  constraint price_overrides_rate_partners check (kind <> 'fee_rate' or product = 'partners'),
  constraint price_overrides_subject check ((product, subject_kind) in (('partners', 'funder'), ('sign', 'sign_account'), ('wealth', 'wealth_user')))
);
create unique index if not exists price_overrides_one_active on public.price_overrides (product, subject_id) where revoked_at is null;
create index if not exists price_overrides_subject_idx on public.price_overrides (product, subject_id, created_at desc);
create index if not exists price_overrides_validity_idx on public.price_overrides (valid_until) where revoked_at is null;

alter table public.price_overrides alter column valid_from set default public._today_br();   -- data de Brasília (B3)
alter table public.price_overrides enable row level security;   -- sem política: authenticated e anon não leem nem gravam; só as RPCs
revoke all on table public.price_overrides from public, anon, authenticated;
drop trigger if exists price_overrides_guard_delete on public.price_overrides;
create trigger price_overrides_guard_delete before delete on public.price_overrides for each row execute function public._guard_delete();
drop trigger if exists price_overrides_guard_truncate on public.price_overrides;
create trigger price_overrides_guard_truncate before truncate on public.price_overrides for each statement execute function public._guard_delete();

-- ============ 2. Internas de cálculo ============
-- override vigente na data p_on (não revogado, dentro da validade)
create or replace function public._effective_price(p_product text, p_subject uuid, p_list_price numeric, p_on date default public._today_br())
returns numeric language plpgsql stable security definer set search_path = '' as $$
declare o public.price_overrides;
begin
  select * into o from public.price_overrides
   where product = p_product and subject_id = p_subject and revoked_at is null
     and valid_from <= p_on and (valid_until is null or valid_until >= p_on);
  if not found then return p_list_price; end if;
  -- fee_rate muda a TAXA na origem do cálculo (ver _override_fee_rate), não o valor: aqui devolve o preço como veio.
  return case o.kind
    when 'fixed' then round(o.value, 2)
    when 'discount_pct' then case when p_list_price is null then null else round(p_list_price * (1 - o.value / 100), 2) end
    else p_list_price end;
end $$;

create or replace function public._override_fee_rate(p_funder uuid, p_on date default public._today_br())
returns numeric language sql stable security definer set search_path = '' as $$
  select o.value from public.price_overrides o
   where o.product = 'partners' and o.subject_id = p_funder and o.kind = 'fee_rate' and o.revoked_at is null
     and o.valid_from <= p_on and (o.valid_until is null or o.valid_until >= p_on);
$$;

-- Condições e valor mensal do fundo na data p_on, espelhando o corpo real de _platform_fee_run (usado só para exibição e validação nas RPCs;
-- o teste confere que dá o mesmo valor que a rotina). rate_aa é fração ao ano.
create or replace function public._partners_fee_calc(p_funder uuid, p_on date default public._today_br())
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_origin text; v_pl numeric; v_rate numeric := 0; v_min numeric := 0; v_applied numeric; v_list numeric; v_amt numeric;
begin
  select coalesce(b.origin, 'invite') into v_origin from public.funders x left join public.funder_billing b on b.funder_id = x.id where x.id = p_funder;
  v_pl := public._funder_pl(p_funder, p_on);
  if v_origin = 'self' then
    v_list := public._plan_fee(v_pl); v_applied := null; v_rate := null; v_amt := v_list;
  else
    select coalesce(p.rate_aa, 0.0010), coalesce(p.min_monthly, 0) into v_rate, v_min
      from (select 1) d left join public.platform_fee_plans p on p.funder_id = p_funder and p.active;
    v_list := round(greatest(v_pl * v_rate / 12, v_min), 2);
    v_applied := coalesce(public._override_fee_rate(p_funder, p_on), v_rate);
    v_amt := round(greatest(v_pl * v_applied / 12, v_min), 2);
  end if;
  return jsonb_build_object('origin', v_origin, 'pl', round(v_pl, 2), 'rate_aa', v_rate, 'rate_applied', v_applied, 'min_monthly', v_min,
                            'list_amount', v_list, 'amount', public._effective_price('partners', p_funder, v_amt, p_on));
end $$;

-- preço de tabela do Wealth para um usuário, com override (gratis = 0). Sem override devolve exatamente _w_price(plano).
create or replace function public._w_price_for(p_user uuid, p_plan text)
returns numeric language sql stable security definer set search_path = '' as $$
  select public._effective_price('wealth', p_user, public._w_price(p_plan), public._today_br());
$$;

-- dados do sujeito para as RPCs: existe?, plano, preço de tabela e taxa de tabela
create or replace function public._price_subject(p_product text, p_subject uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.sign_accounts; sp public.sign_plans; w public.w_profiles; f public.funders; c jsonb;
begin
  if p_product = 'sign' then
    select * into a from public.sign_accounts where id = p_subject;
    if not found then return null; end if;
    select * into sp from public.sign_plans where code = a.plan;
    return jsonb_build_object('plan', a.plan, 'plan_name', sp.name, 'list_price', coalesce(sp.price_month, 0), 'list_rate', null, 'exempt', a.exempt,
                              'custom_price', a.custom_price, 'name', a.name);
  elsif p_product = 'wealth' then
    select * into w from public.w_profiles where user_id = p_subject;
    if not found then return null; end if;
    return jsonb_build_object('plan', w.plan, 'plan_name', w.plan, 'list_price', public._w_price(w.plan), 'list_rate', null, 'exempt', false, 'name', w.name);
  elsif p_product = 'partners' then
    select * into f from public.funders where id = p_subject;
    if not found then return null; end if;
    c := public._partners_fee_calc(p_subject, public._today_br());
    return jsonb_build_object('plan', case when c->>'origin' = 'self' then 'tier' else 'contract' end, 'plan_name', c->>'origin',
                              'list_price', (c->>'list_amount')::numeric, 'list_rate', (c->>'rate_aa')::numeric,
                              'exempt', coalesce((select exempt from public.funder_billing where funder_id = p_subject), false),
                              'name', coalesce(f.trade_name, f.legal_name), 'origin', c->>'origin');
  end if;
  return null;
end $$;

-- ============ 3. _platform_fee_run com override ============
-- Corpo REAL de produção (docs/agente/admin/b2-defs-producao.sql); só mudam as linhas marcadas "OVERRIDE". Sem override o resultado é idêntico.
create or replace function public._platform_fee_run(p_month date default null) returns integer
language plpgsql security definer set search_path to '' as $f$
declare
  v_m date := coalesce(date_trunc('month', p_month)::date, (date_trunc('month', public._today_br()) - interval '1 month')::date);
  v_end date := (v_m + interval '1 month - 1 day')::date;
  f record; v_pl numeric; v_rate numeric; v_min numeric; v_amt numeric; n int := 0;
begin
  for f in select x.id, coalesce(b.origin, 'invite') origin, coalesce(b.exempt, false) exempt
           from public.funders x left join public.funder_billing b on b.funder_id = x.id loop
    if f.exempt then continue; end if;
    v_pl := public._funder_pl(f.id, v_end);
    if f.origin = 'self' then
      v_amt := public._plan_fee(v_pl); v_rate := 0; v_min := 0;
    else
      select coalesce(p.rate_aa, 0.0010), coalesce(p.min_monthly, 0) into v_rate, v_min
        from (select 1) d left join public.platform_fee_plans p on p.funder_id = f.id and p.active;
      v_rate := coalesce(public._override_fee_rate(f.id, v_end), v_rate);                 -- OVERRIDE: fee_rate substitui a taxa (só contrato)
      v_amt := round(greatest(v_pl * v_rate / 12, v_min), 2);
    end if;
    v_amt := public._effective_price('partners', f.id, v_amt, v_end);                     -- OVERRIDE: fixed substitui, discount_pct reduz
    if v_amt > 0 then
      insert into public.platform_fees (funder_id, ref_month, pl, rate_aa, min_monthly, amount)
      values (f.id, v_m, round(v_pl, 2), v_rate, v_min, v_amt) on conflict (funder_id, ref_month) do nothing;
      n := n + 1;
    end if;
  end loop;
  return n;
end $f$;

-- ============ 4. Geração automática de faturas ============
create or replace function public._bill_generate_auto(p_month date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m date := coalesce(date_trunc('month', p_month)::date, (date_trunc('month', public._today_br()) - interval '1 month')::date);
  v_end date := (m + interval '1 month - 1 day')::date;
  dd int; v_due date; r record; v_amt numeric; n_fee int := 0; n_sign int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('lottus-billing-auto'));
  select least(greatest(coalesce(due_day, 10), 1), 28) into dd from public.billing_settings where id = 1;
  v_due := (m + interval '1 month')::date + (coalesce(dd, 10) - 1);

  -- taxa de plataforma (platform_fees já traz o valor com override aplicado)
  for r in select pf.id, pf.funder_id, pf.amount, fu.legal_name, fu.cnpj, fu.email
             from public.platform_fees pf join public.funders fu on fu.id = pf.funder_id
            where pf.ref_month = m and pf.amount > 0 and pf.status <> 'paid'
              and not exists (select 1 from public.bill_invoices b where b.funder_id = pf.funder_id and b.ref_month = m and b.source = 'platform_fee' ) loop
    insert into public.bill_invoices (number, customer_kind, funder_id, customer_name, customer_doc, customer_email, description, ref_month, amount, due_date, source, source_ref)
    values ('F-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.bill_seq')::text, 4, '0'), 'funder', r.funder_id, r.legal_name, r.cnpj, r.email,
            'Taxa de plataforma ' || to_char(m, 'MM/YYYY'), m, r.amount, v_due, 'platform_fee', r.id::text);
    n_fee := n_fee + 1;
  end loop;

  -- mensalidade do Sign: contas não isentas criadas até o fim da competência; preço = custom_price (se houver) ou do plano, com override;
  -- gera se o preço EFETIVO for > 0 (inclusive plano de tabela 0 com override fixo vigente)
  for r in select sa.id, sa.name, sa.doc, sa.custom_price, sp.price_month, sp.name plan_name
             from public.sign_accounts sa join public.sign_plans sp on sp.code = sa.plan
            where not sa.exempt and sa.created_at < (v_end + 1)
              and not exists (select 1 from public.bill_invoices b where b.sign_account_id = sa.id and b.ref_month = m and b.source = 'sign' ) loop
    v_amt := public._effective_price('sign', r.id, coalesce(r.custom_price, r.price_month), v_end);
    if coalesce(v_amt, 0) <= 0 then continue; end if;
    insert into public.bill_invoices (number, customer_kind, sign_account_id, customer_name, customer_doc, description, ref_month, amount, due_date, source, source_ref)
    values ('F-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.bill_seq')::text, 4, '0'), 'sign', r.id, r.name, r.doc,
            'Mensalidade Sign (' || r.plan_name || ') ' || to_char(m, 'MM/YYYY'), m, v_amt, v_due, 'sign', r.id::text);
    n_sign := n_sign + 1;
  end loop;
  return jsonb_build_object('ref_month', m, 'platform_fee', n_fee, 'sign', n_sign);
end $$;

-- ============ 5. RPCs do Admin ============
create or replace function public.bo_plan_catalog()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.staff_users := public._staff('analyst'); b public.billing_settings;
begin
  select * into b from public.billing_settings where id = 1;
  return jsonb_build_object(
    'sign', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'price_month', price_month, 'docs_included', docs_included,
                      'extra_doc_price', extra_doc_price) order by sort, code) from public.sign_plans where active), '[]'::jsonb),
    'partners', jsonb_build_object('free_pl_limit', b.free_pl_limit, 'tiers', b.tiers, 'grace_days', b.grace_days, 'due_day', least(greatest(coalesce(b.due_day, 10), 1), 28)),
    'wealth', jsonb_build_array(jsonb_build_object('code', 'gratis', 'price_month', public._w_price('gratis')),
                                jsonb_build_object('code', 'pro', 'price_month', public._w_price('pro')),
                                jsonb_build_object('code', 'fund', 'price_month', public._w_price('fund'))));
end $$;

create or replace function public.bo_customer_plan(p_product text, p_subject uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.staff_users := public._staff('analyst'); sub jsonb; o public.price_overrides; v_list numeric; v_eff numeric; v_dd int; v_ref date; c jsonb; v_shown numeric; v_inapp boolean := false;
begin
  if p_product is null or p_product not in ('partners', 'sign', 'wealth') then raise exception 'invalid_product'; end if;
  sub := public._price_subject(p_product, p_subject);
  if sub is null then raise exception 'subject_not_found'; end if;
  v_list := (sub->>'list_price')::numeric;
  select * into o from public.price_overrides where product = p_product and subject_id = p_subject and revoked_at is null
     and valid_from <= public._today_br() and (valid_until is null or valid_until >= public._today_br());
  if p_product = 'partners' then v_eff := (public._partners_fee_calc(p_subject, public._today_br())->>'amount')::numeric;
  elsif p_product = 'sign' then v_eff := public._effective_price('sign', p_subject, coalesce((sub->>'custom_price')::numeric, v_list), public._today_br());
  else v_eff := public._effective_price('wealth', p_subject, v_list, public._today_br());
  end if;
  -- fee_rate de fundo na tabela por faixa não se aplica (M3): não aparece como vigente
  if o.id is not null and o.kind = 'fee_rate' and p_product = 'partners' and sub->>'origin' = 'self' then v_inapp := true; end if;
  v_shown := case when (sub->>'exempt')::boolean then 0 else v_eff end;
  select least(greatest(coalesce(due_day, 10), 1), 28) into v_dd from public.billing_settings where id = 1;
  v_dd := coalesce(v_dd, 10);
  v_ref := date_trunc('month', public._today_br())::date;   -- competência em andamento: pós-paga, fatura gerada no dia 2 do mês seguinte
  return jsonb_build_object('product', p_product, 'subject', p_subject, 'name', sub->>'name', 'plan', sub->>'plan', 'plan_name', sub->>'plan_name',
    'exempt', (sub->>'exempt')::boolean, 'list_price', v_list, 'custom_price', sub->'custom_price',
    'due_day', v_dd,
    'override_inapplicable', case when v_inapp then jsonb_build_object('id', o.id, 'kind', o.kind, 'value', o.value, 'reason', o.reason) else null end,
    'override', case when o.id is null or v_inapp then null else jsonb_build_object('id', o.id, 'kind', o.kind, 'value', o.value, 'valid_from', o.valid_from,
        'valid_until', o.valid_until, 'reason', o.reason, 'created_by_name', o.created_by_name, 'created_at', o.created_at) end,
    'effective_price', v_shown,
    'next_billing', case when coalesce(v_shown, 0) <= 0 then null   -- a geração automática não fatura preço <= 0 nem isento (B2)
      else jsonb_build_object('ref_month', v_ref, 'invoice_on', (v_ref + interval '1 month')::date + 1,
                              'due_date', (v_ref + interval '1 month')::date + (v_dd - 1)) end);
end $$;

create or replace function public.bo_price_override_list(p_product text, p_subject uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.staff_users := public._staff('analyst');
begin
  if p_product is null or p_product not in ('partners', 'sign', 'wealth') then raise exception 'invalid_product'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select id, product, kind, value, valid_from, valid_until, reason, created_by_name, created_at, revoked_at, revoke_reason,
           (revoked_at is null and valid_from <= public._today_br() and (valid_until is null or valid_until >= public._today_br())
            and not (kind = 'fee_rate' and exists (select 1 from public.funder_billing fb where fb.funder_id = p_subject and fb.origin = 'self'))) as active_now
      from public.price_overrides where product = p_product and subject_id = p_subject order by created_at desc limit 50) x), '[]'::jsonb);
end $$;

create or replace function public.bo_price_override_set(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.staff_users := public._staff('approver');
  v_product text := p->>'product'; v_subject uuid; v_kind text := p->>'kind'; v_value numeric; v_from date; v_until date; v_reason text := trim(coalesce(p->>'reason', ''));
  sub jsonb; v_red numeric; o public.price_overrides; v_new uuid; v_old uuid;
begin
  if v_product is null or v_product not in ('partners', 'sign', 'wealth') then raise exception 'invalid_product'; end if;
  if v_kind is null or v_kind not in ('fixed', 'discount_pct', 'fee_rate') or (v_kind = 'fee_rate' and v_product <> 'partners') then raise exception 'invalid_kind'; end if;
  begin
    v_subject := (p->>'subject')::uuid; v_value := (p->>'value')::numeric;
    v_from := coalesce(nullif(p->>'valid_from', '')::date, public._today_br()); v_until := nullif(p->>'valid_until', '')::date;
  exception when others then raise exception 'invalid_value'; end;
  if v_subject is null or v_value is null or v_value < 0 or v_value >= 100000000 or (v_kind = 'discount_pct' and v_value > 100) then raise exception 'invalid_value'; end if;
  if char_length(v_reason) < 5 then raise exception 'reason_required'; end if;
  if v_until is not null and (v_until < v_from or v_until < public._today_br()) then raise exception 'invalid_period'; end if;
  sub := public._price_subject(v_product, v_subject);
  if sub is null then raise exception 'subject_not_found'; end if;
  if v_kind = 'fee_rate' and sub->>'origin' is distinct from 'invite' then raise exception 'fee_rate_needs_contract'; end if;

  -- D4: redução do preço resultante em relação ao preço de TABELA; o novo override incide sobre o preço vigente sem ele
  -- (Sign: coalesce(custom_price, tabela)), logo custom_price já baixo + desconto também pode passar de 20% e exigir administrador.
  v_red := case v_kind
    when 'discount_pct' then case when (sub->>'list_price')::numeric > 0
        then ((sub->>'list_price')::numeric - coalesce((sub->>'custom_price')::numeric, (sub->>'list_price')::numeric) * (1 - v_value / 100)) / (sub->>'list_price')::numeric * 100 else 0 end
    when 'fixed' then case when (sub->>'list_price')::numeric > 0 then ((sub->>'list_price')::numeric - v_value) / (sub->>'list_price')::numeric * 100 else 0 end
    else case when coalesce((sub->>'list_rate')::numeric, 0) > 0 then ((sub->>'list_rate')::numeric - v_value) / (sub->>'list_rate')::numeric * 100 else 0 end end;
  if v_red > 20 then
    begin s := public._staff('admin');
    exception when others then
      if sqlerrm = 'insufficient_level' then raise exception 'discount_needs_admin'; end if;   -- 'forbidden' e 'mfa_required' seguem como estão
      raise;
    end;
  end if;

  perform pg_advisory_xact_lock(hashtext('price_override:' || v_product || ':' || v_subject::text));
  select * into o from public.price_overrides where product = v_product and subject_id = v_subject and revoked_at is null;
  if found then
    if o.kind = v_kind and o.value = round(v_value, 6) and o.valid_from = v_from and o.valid_until is not distinct from v_until and o.reason = v_reason then
      return jsonb_build_object('id', o.id, 'unchanged', true, 'replaced_id', null);   -- reenvio idêntico: nada novo
    end if;
    update public.price_overrides set revoked_at = now(), revoked_by = s.user_id, revoke_reason = 'substituído por novo preço personalizado' where id = o.id and revoked_at is null;
    v_old := o.id;
  end if;
  insert into public.price_overrides (product, subject_kind, subject_id, kind, value, valid_from, valid_until, reason, created_by, created_by_name)
  values (v_product, case v_product when 'partners' then 'funder' when 'sign' then 'sign_account' else 'wealth_user' end, v_subject, v_kind, v_value, v_from, v_until, v_reason,
          s.user_id, nullif(trim(s.name), '')) returning id into v_new;
  perform public._staff_log(s, 'price_override_set', 'price_override', v_new::text, null,
    jsonb_build_object('product', v_product, 'subject', v_subject, 'kind', v_kind, 'value', v_value, 'valid_from', v_from, 'valid_until', v_until,
                       'reason', v_reason, 'reduction_pct', round(v_red, 2), 'replaced_id', v_old));
  return jsonb_build_object('id', v_new, 'unchanged', false, 'replaced_id', v_old);
end $$;

create or replace function public.bo_price_override_revoke(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.staff_users := public._staff('approver'); v_reason text := trim(coalesce(p_reason, '')); o public.price_overrides;
begin
  if char_length(v_reason) < 5 then raise exception 'reason_required'; end if;
  select * into o from public.price_overrides where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if o.revoked_at is not null then return jsonb_build_object('id', o.id, 'unchanged', true); end if;
  update public.price_overrides set revoked_at = now(), revoked_by = s.user_id, revoke_reason = v_reason where id = p_id and revoked_at is null;
  perform public._staff_log(s, 'price_override_revoke', 'price_override', p_id::text, null,
    jsonb_build_object('product', o.product, 'subject', o.subject_id, 'reason', v_reason));
  return jsonb_build_object('id', p_id, 'unchanged', false);
end $$;

-- p: {product, subject, plan, [payment_ok] (wealth), [rate_aa, min_monthly] (partners contract)}
--   sign: plan = código em sign_plans (ativo). wealth: plan = gratis|pro|fund. partners: plan = 'tier' (faixa global; desativa o contrato) | 'contract' (exige rate_aa e min_monthly).
create or replace function public.bo_set_plan(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.staff_users := public._staff('admin');
  v_product text := p->>'product'; v_subject uuid; v_plan text := p->>'plan'; v_ok boolean; v_rate numeric; v_min numeric;
  a public.sign_accounts; w public.w_profiles; n_price numeric; o_price numeric; v_event text; v_old text;
  v_cur_origin text; pp public.platform_fee_plans; v_rev record; v_revoked int := 0;
begin
  if v_product is null or v_product not in ('partners', 'sign', 'wealth') then raise exception 'invalid_product'; end if;
  begin v_subject := (p->>'subject')::uuid; exception when others then raise exception 'subject_not_found'; end;
  if v_subject is null then raise exception 'subject_not_found'; end if;

  if v_product = 'sign' then
    select * into a from public.sign_accounts where id = v_subject for update;
    if not found then raise exception 'subject_not_found'; end if;
    if v_plan is null or not exists (select 1 from public.sign_plans where code = v_plan and active) then raise exception 'invalid_plan'; end if;
    if a.plan = v_plan then return jsonb_build_object('product', v_product, 'subject', v_subject, 'plan', v_plan, 'unchanged', true); end if;
    o_price := case when a.exempt then 0 else public._effective_price('sign', v_subject, (select price_month from public.sign_plans where code = a.plan)) end;
    n_price := case when a.exempt then 0 else public._effective_price('sign', v_subject, (select price_month from public.sign_plans where code = v_plan)) end;
    update public.sign_accounts set plan = v_plan, plan_since = public._today_br(), updated_at = now(),
      plan_requested = null, requested_at = null where id = v_subject;   -- M4: o pedido pendente deixa de valer ao trocar o plano
    v_event := case when n_price > o_price then 'upgrade' when n_price < o_price then 'downgrade' else 'note' end;
    insert into public.customer_events (kind, ref_id, event, mrr_before, mrr_after, text)
    values ('sign', v_subject, v_event, o_price, n_price, 'Plano alterado de ' || a.plan || ' para ' || v_plan || ' por ' || coalesce(nullif(trim(s.name), ''), 'equipe Lottus'));
    v_old := a.plan;
  elsif v_product = 'wealth' then
    select * into w from public.w_profiles where user_id = v_subject for update;
    if not found then raise exception 'subject_not_found'; end if;
    if v_plan is null or v_plan not in ('gratis', 'pro', 'fund') then raise exception 'invalid_plan'; end if;
    begin v_ok := nullif(p->>'payment_ok', '')::boolean; exception when others then raise exception 'invalid_value'; end;
    if w.plan = v_plan and (v_ok is null or v_ok = w.payment_ok) then return jsonb_build_object('product', v_product, 'subject', v_subject, 'plan', v_plan, 'unchanged', true); end if;
    update public.w_profiles set plan = v_plan, payment_ok = coalesce(v_ok, payment_ok) where user_id = v_subject;
    v_old := w.plan;
  else
    if not exists (select 1 from public.funders where id = v_subject) then raise exception 'subject_not_found'; end if;
    if v_plan is null or v_plan not in ('tier', 'contract') then raise exception 'invalid_plan'; end if;
    select coalesce(b.origin, 'invite') into v_cur_origin from (select 1) d left join public.funder_billing b on b.funder_id = v_subject;
    select * into pp from public.platform_fee_plans where funder_id = v_subject;
    v_old := case when v_cur_origin = 'self' then 'tier' else 'contract' end;
    if v_plan = 'contract' then
      begin v_rate := (p->>'rate_aa')::numeric; v_min := (p->>'min_monthly')::numeric; exception when others then raise exception 'invalid_value'; end;
      if v_rate is null or v_min is null or v_rate < 0 or v_rate > 1 or v_min < 0 then raise exception 'invalid_value'; end if;   -- rate_aa é fração ao ano (0,001 = 0,1%)
      -- M2: já é contrato com os mesmos valores -> nada a fazer; com valores novos, atualiza taxa e mínimo
      if v_cur_origin = 'invite' and pp.funder_id is not null and pp.active and pp.rate_aa = v_rate and pp.min_monthly = v_min then
        return jsonb_build_object('product', v_product, 'subject', v_subject, 'plan', v_plan, 'unchanged', true);
      end if;
      update public.platform_fee_plans set rate_aa = v_rate, min_monthly = v_min, active = true where funder_id = v_subject;
      if not exists (select 1 from public.platform_fee_plans where funder_id = v_subject) then
        insert into public.platform_fee_plans (funder_id, rate_aa, min_monthly, active) values (v_subject, v_rate, v_min, true);
      end if;
    else
      update public.platform_fee_plans set active = false where funder_id = v_subject;
      -- M3: fee_rate só vale em contrato; ao ir para a tabela por faixa, o override de taxa ativo é revogado
      for v_rev in update public.price_overrides set revoked_at = now(), revoked_by = s.user_id, revoke_reason = 'plano trocado para tabela por faixa'
                    where product = 'partners' and subject_id = v_subject and kind = 'fee_rate' and revoked_at is null returning id loop
        perform public._staff_log(s, 'price_override_revoke', 'price_override', v_rev.id::text, null,
          jsonb_build_object('product', 'partners', 'subject', v_subject, 'reason', 'plano trocado para tabela por faixa'));
        v_revoked := v_revoked + 1;
      end loop;
    end if;
    update public.funder_billing set origin = case v_plan when 'contract' then 'invite' else 'self' end where funder_id = v_subject;
    if not exists (select 1 from public.funder_billing where funder_id = v_subject) then
      insert into public.funder_billing (funder_id, origin) values (v_subject, case v_plan when 'contract' then 'invite' else 'self' end);
    end if;
  end if;
  perform public._staff_log(s, 'set_plan', v_product, v_subject::text, null,
    jsonb_build_object('plan', v_plan, 'previous_plan', v_old, 'payment_ok', p->'payment_ok', 'rate_aa', p->'rate_aa', 'min_monthly', p->'min_monthly',
                       'overrides_revoked', v_revoked));
  return jsonb_build_object('product', v_product, 'subject', v_subject, 'plan', v_plan, 'unchanged', false, 'overrides_revoked', v_revoked);
end $$;

-- D3: faturas abertas vencidas; dentro da carência (grace_days) x além dela. Sem bloqueio nem rebaixa automáticos.
create or replace function public.bo_overdue_list()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.staff_users := public._staff('analyst'); g int; v_today date := public._today_br(); v_total int; v_sum numeric; v_items jsonb;
begin
  select coalesce(grace_days, 15) into g from public.billing_settings where id = 1;
  g := coalesce(g, 15);
  -- B5: total e valor somam TODAS as faturas em atraso; a lista traz as 200 mais antigas
  select count(*), coalesce(sum(amount), 0) into v_total, v_sum from public.bill_invoices where status = 'open' and due_date < v_today;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'number', x.number, 'customer_kind', x.customer_kind, 'customer_name', x.customer_name,
              'funder_id', x.funder_id, 'sign_account_id', x.sign_account_id, 'ref_month', x.ref_month, 'amount', x.amount, 'due_date', x.due_date,
              'days_overdue', v_today - x.due_date, 'stage', case when v_today - x.due_date <= g then 'grace' else 'beyond_grace' end,
              'reminders_paused', x.reminders_paused) order by x.due_date, x.id), '[]'::jsonb) into v_items
    from (select * from public.bill_invoices where status = 'open' and due_date < v_today order by due_date, id limit 200) x;
  return jsonb_build_object('grace_days', g, 'total', v_total, 'total_amount', v_sum, 'shown', least(v_total, 200), 'items', v_items);
end $$;

-- ============ 6. Grants ============
do $$
declare f text;
begin
  foreach f in array array[
    'public.bo_plan_catalog()', 'public.bo_customer_plan(text, uuid)', 'public.bo_price_override_list(text, uuid)', 'public.bo_price_override_set(jsonb)',
    'public.bo_price_override_revoke(uuid, text)', 'public.bo_set_plan(jsonb)', 'public.bo_overdue_list()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'public._effective_price(text, uuid, numeric, date)', 'public._override_fee_rate(uuid, date)', 'public._partners_fee_calc(uuid, date)', 'public._w_price_for(uuid, text)', 'public._price_subject(text, uuid)',
    'public._platform_fee_run(date)', 'public._bill_generate_auto(date)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ============ 7. Job (só onde o pg_cron existe): dia 2, 13:00 UTC = 10:00 em Brasília ============
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $c$select cron.schedule('lottus-billing-auto', '0 13 2 * *', 'select public._bill_generate_auto()')$c$;
  end if;
end $$;

commit;
