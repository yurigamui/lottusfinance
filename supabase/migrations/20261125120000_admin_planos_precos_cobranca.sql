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
--   3. Internas (só service_role): _effective_price, _override_fee_rate, _partners_fee, _partners_list_terms, _partners_fee_calc,
--      _w_price_for, _bill_generate_auto.
--      REDEFINE _platform_fee_run(date) com create or replace: mesma lógica, mais o override (taxa fee_rate, desconto, valor fixo).
--      Sem override o resultado é idêntico ao anterior.
--   4. _bill_generate_auto(mês): gera em bill_invoices as faturas do mês anterior (taxa de plataforma a partir de platform_fees e
--      mensalidade do Sign), idempotente por (cliente, ref_month, source); job pg_cron 'lottus-billing-auto' (0 13 2 * *, 10:00 UTC-3), só se
--      a extensão pg_cron existir. O envio continua na régua existente (lottus-bill-reminders).
--
-- ATENÇÃO antes de aplicar (ler com o Yuri)
--   * _platform_fee_run foi reescrita a partir da DESCRIÇÃO do doc B2, não do código de produção. Antes de aplicar, salvar a original:
--       select pg_get_functiondef('public._platform_fee_run'::regproc);   -- e comparar assinatura (argumentos/retorno) e a fonte do PL.
--     Se a assinatura ou a lógica de produção diferir (ex.: fonte do PL, formato de billing_settings.tiers, retorno de _plan_fee),
--     ajustar _partners_list_terms/_platform_fee_run antes. create or replace falha se o tipo de retorno for outro.
--   * Valores de customer_kind ('funder' | 'sign') e source ('platform_fee' | 'sign_subscription') em bill_invoices são hipóteses a conferir.
--   * Esta migração não altera _w_price nem w_billing_close: oferece _w_price_for(user, plano) para a cobrança do Wealth passar a usar
--     (próximo passo, fora deste escopo).
--
-- Como reverter
--   select cron.unschedule('lottus-billing-auto');   -- se o job foi criado
--   drop function if exists public.bo_plan_catalog(), public.bo_customer_plan(text, uuid), public.bo_price_override_list(text, uuid),
--     public.bo_price_override_set(jsonb), public.bo_price_override_revoke(uuid, text), public.bo_set_plan(jsonb), public.bo_overdue_list(),
--     public._bill_generate_auto(date), public._w_price_for(uuid, text), public._partners_fee_calc(uuid, date),
--     public._partners_list_terms(uuid), public._partners_fee(numeric, numeric, numeric), public._override_fee_rate(uuid, date),
--     public._effective_price(text, uuid, numeric, date), public._price_subject(text, uuid);
--   -- restaurar _platform_fee_run com o pg_get_functiondef salvo antes de aplicar;
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
  value numeric(12, 4) not null check (value >= 0),
  valid_from date not null default current_date,
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

alter table public.price_overrides enable row level security;   -- sem política: authenticated e anon não leem nem gravam; só as RPCs
revoke all on table public.price_overrides from public, anon, authenticated;
drop trigger if exists price_overrides_guard_delete on public.price_overrides;
create trigger price_overrides_guard_delete before delete on public.price_overrides for each row execute function public._guard_delete();
drop trigger if exists price_overrides_guard_truncate on public.price_overrides;
create trigger price_overrides_guard_truncate before truncate on public.price_overrides for each statement execute function public._guard_delete();

-- ============ 2. Internas de cálculo ============
-- override vigente na data p_on (não revogado, dentro da validade)
create or replace function public._effective_price(p_product text, p_subject uuid, p_list_price numeric, p_on date default current_date)
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

create or replace function public._override_fee_rate(p_funder uuid, p_on date default current_date)
returns numeric language sql stable security definer set search_path = '' as $$
  select o.value from public.price_overrides o
   where o.product = 'partners' and o.subject_id = p_funder and o.kind = 'fee_rate' and o.revoked_at is null
     and o.valid_from <= p_on and (o.valid_until is null or o.valid_until >= p_on);
$$;

-- taxa de plataforma mensal: maior entre o mínimo e PL x taxa a.a. / 12 (rate_aa em % ao ano)
create or replace function public._partners_fee(p_pl numeric, p_rate numeric, p_min numeric)
returns numeric language sql immutable set search_path = '' as $$
  select round(greatest(coalesce(p_min, 0), coalesce(p_pl, 0) * coalesce(p_rate, 0) / 100 / 12), 2);
$$;

-- condições de tabela do fundo: contrato (platform_fee_plans ativo) ou faixa global (billing_settings.tiers via _plan_fee)
create or replace function public._partners_list_terms(p_funder uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_pl numeric; v_free numeric; p public.platform_fee_plans; t jsonb;
begin
  select coalesce(pl_declared, 0) into v_pl from public.funder_billing where funder_id = p_funder;
  select free_pl_limit into v_free from public.billing_settings where id = 1;
  select * into p from public.platform_fee_plans where funder_id = p_funder and active;
  if found then
    return jsonb_build_object('pl', coalesce(v_pl, 0), 'rate_aa', p.rate_aa, 'min_monthly', p.min_monthly, 'source', 'contract', 'tier', null);
  end if;
  t := public._plan_fee(coalesce(v_pl, 0));
  return jsonb_build_object('pl', coalesce(v_pl, 0), 'rate_aa', coalesce((t->>'rate_aa')::numeric, 0), 'min_monthly', coalesce((t->>'min_monthly')::numeric, 0),
                            'source', case when coalesce(v_pl, 0) <= coalesce(v_free, 0) then 'free' else 'tier' end, 'tier', t->>'name');
end $$;

create or replace function public._partners_fee_calc(p_funder uuid, p_on date default current_date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t jsonb := public._partners_list_terms(p_funder); v_ov numeric := public._override_fee_rate(p_funder, p_on);
  v_pl numeric := (t->>'pl')::numeric; v_rate numeric := (t->>'rate_aa')::numeric; v_min numeric := (t->>'min_monthly')::numeric;
  v_applied numeric; v_base numeric;
begin
  v_applied := coalesce(v_ov, v_rate);
  v_base := public._partners_fee(v_pl, v_applied, v_min);
  return t || jsonb_build_object('list_amount', public._partners_fee(v_pl, v_rate, v_min), 'rate_applied', v_applied,
                                 'amount', public._effective_price('partners', p_funder, v_base, p_on));
end $$;

-- preço de tabela do Wealth para um usuário, com override (gratis = 0). Sem override devolve exatamente _w_price(plano).
create or replace function public._w_price_for(p_user uuid, p_plan text)
returns numeric language sql stable security definer set search_path = '' as $$
  select public._effective_price('wealth', p_user, public._w_price(p_plan), current_date);
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
    c := public._partners_fee_calc(p_subject, current_date);
    return jsonb_build_object('plan', c->>'source', 'plan_name', coalesce(c->>'tier', c->>'source'), 'list_price', (c->>'list_amount')::numeric,
                              'list_rate', (c->>'rate_aa')::numeric, 'exempt', coalesce((select exempt from public.funder_billing where funder_id = p_subject), false),
                              'name', coalesce(f.trade_name, f.legal_name));
  end if;
  return null;
end $$;

-- ============ 3. _platform_fee_run com override (mesma lógica; sem override o resultado não muda) ============
create or replace function public._platform_fee_run(p_month date default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare m date := coalesce(date_trunc('month', p_month)::date, (date_trunc('month', current_date) - interval '1 month')::date);
  r record; c jsonb; n int := 0; v_free numeric;
begin
  select free_pl_limit into v_free from public.billing_settings where id = 1;
  for r in select fu.id from public.funders fu join public.funder_billing fb on fb.funder_id = fu.id
            where fu.active and not fb.exempt and fb.pl_declared > v_free loop
    c := public._partners_fee_calc(r.id, (m + interval '1 month - 1 day')::date);   -- override vigente no último dia da competência
    insert into public.platform_fees (funder_id, ref_month, pl, rate_aa, min_monthly, amount)
    values (r.id, m, (c->>'pl')::numeric, (c->>'rate_applied')::numeric, (c->>'min_monthly')::numeric, (c->>'amount')::numeric)
    on conflict (funder_id, ref_month) do update set pl = excluded.pl, rate_aa = excluded.rate_aa, min_monthly = excluded.min_monthly, amount = excluded.amount
      where public.platform_fees.status <> 'paid';
    n := n + 1;
  end loop;
  return n;
end $$;

-- ============ 4. Geração automática de faturas ============
create or replace function public._bill_generate_auto(p_month date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m date := coalesce(date_trunc('month', p_month)::date, (date_trunc('month', current_date) - interval '1 month')::date);
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
              and not exists (select 1 from public.bill_invoices b where b.funder_id = pf.funder_id and b.ref_month = m and b.source = 'platform_fee' and b.status <> 'cancelled') loop
    insert into public.bill_invoices (number, customer_kind, funder_id, customer_name, customer_doc, customer_email, description, ref_month, amount, due_date, source, source_ref)
    values ('F-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.bill_seq')::text, 4, '0'), 'funder', r.funder_id, r.legal_name, r.cnpj, r.email,
            'Taxa de plataforma ' || to_char(m, 'MM/YYYY'), m, r.amount, v_due, 'platform_fee', r.id::text);
    n_fee := n_fee + 1;
  end loop;

  -- mensalidade do Sign: contas não isentas criadas até o fim da competência; preço = custom_price (se houver) ou do plano, com override
  for r in select sa.id, sa.name, sa.doc, sa.custom_price, sp.price_month, sp.name plan_name
             from public.sign_accounts sa join public.sign_plans sp on sp.code = sa.plan
            where not sa.exempt and coalesce(sa.status, 'active') <> 'cancelled' and sa.created_at < (v_end + 1)
              and (coalesce(sp.price_month, 0) > 0 or coalesce(sa.custom_price, 0) > 0)
              and not exists (select 1 from public.bill_invoices b where b.sign_account_id = sa.id and b.ref_month = m and b.source = 'sign_subscription' and b.status <> 'cancelled') loop
    v_amt := public._effective_price('sign', r.id, coalesce(r.custom_price, r.price_month), v_end);
    if coalesce(v_amt, 0) <= 0 then continue; end if;
    insert into public.bill_invoices (number, customer_kind, sign_account_id, customer_name, customer_doc, description, ref_month, amount, due_date, source, source_ref)
    values ('F-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.bill_seq')::text, 4, '0'), 'sign', r.id, r.name, r.doc,
            'Mensalidade Sign (' || r.plan_name || ') ' || to_char(m, 'MM/YYYY'), m, v_amt, v_due, 'sign_subscription', r.id::text);
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
    'partners', jsonb_build_object('free_pl_limit', b.free_pl_limit, 'tiers', b.tiers, 'grace_days', b.grace_days, 'due_day', b.due_day),
    'wealth', jsonb_build_array(jsonb_build_object('code', 'gratis', 'price_month', public._w_price('gratis')),
                                jsonb_build_object('code', 'pro', 'price_month', public._w_price('pro')),
                                jsonb_build_object('code', 'fund', 'price_month', public._w_price('fund'))));
end $$;

create or replace function public.bo_customer_plan(p_product text, p_subject uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.staff_users := public._staff('analyst'); sub jsonb; o public.price_overrides; v_list numeric; v_eff numeric; v_dd int; v_ref date; c jsonb;
begin
  if p_product is null or p_product not in ('partners', 'sign', 'wealth') then raise exception 'invalid_product'; end if;
  sub := public._price_subject(p_product, p_subject);
  if sub is null then raise exception 'subject_not_found'; end if;
  v_list := (sub->>'list_price')::numeric;
  select * into o from public.price_overrides where product = p_product and subject_id = p_subject and revoked_at is null
     and valid_from <= current_date and (valid_until is null or valid_until >= current_date);
  if p_product = 'partners' then v_eff := (public._partners_fee_calc(p_subject, current_date)->>'amount')::numeric;
  elsif p_product = 'sign' then v_eff := public._effective_price('sign', p_subject, coalesce((sub->>'custom_price')::numeric, v_list), current_date);
  else v_eff := public._effective_price('wealth', p_subject, v_list, current_date);
  end if;
  select least(greatest(coalesce(due_day, 10), 1), 28) into v_dd from public.billing_settings where id = 1;
  v_ref := date_trunc('month', current_date)::date;   -- competência em andamento: pós-paga, fatura gerada no dia 2 do mês seguinte
  return jsonb_build_object('product', p_product, 'subject', p_subject, 'name', sub->>'name', 'plan', sub->>'plan', 'plan_name', sub->>'plan_name',
    'exempt', (sub->>'exempt')::boolean, 'list_price', v_list, 'custom_price', sub->'custom_price',
    'override', case when o.id is null then null else jsonb_build_object('id', o.id, 'kind', o.kind, 'value', o.value, 'valid_from', o.valid_from,
        'valid_until', o.valid_until, 'reason', o.reason, 'created_by_name', o.created_by_name, 'created_at', o.created_at) end,
    'effective_price', case when (sub->>'exempt')::boolean then 0 else v_eff end,
    'next_billing', jsonb_build_object('ref_month', v_ref, 'invoice_on', (v_ref + interval '1 month')::date + 1,
                                       'due_date', (v_ref + interval '1 month')::date + (v_dd - 1)));
end $$;

create or replace function public.bo_price_override_list(p_product text, p_subject uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.staff_users := public._staff('analyst');
begin
  if p_product is null or p_product not in ('partners', 'sign', 'wealth') then raise exception 'invalid_product'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select id, product, kind, value, valid_from, valid_until, reason, created_by_name, created_at, revoked_at, revoke_reason,
           (revoked_at is null and valid_from <= current_date and (valid_until is null or valid_until >= current_date)) as active_now
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
    v_from := coalesce(nullif(p->>'valid_from', '')::date, current_date); v_until := nullif(p->>'valid_until', '')::date;
  exception when others then raise exception 'invalid_value'; end;
  if v_subject is null or v_value is null or v_value < 0 or v_value >= 100000000 or (v_kind = 'discount_pct' and v_value > 100) then raise exception 'invalid_value'; end if;
  if char_length(v_reason) < 5 then raise exception 'reason_required'; end if;
  if v_until is not null and (v_until < v_from or v_until < current_date) then raise exception 'invalid_period'; end if;
  sub := public._price_subject(v_product, v_subject);
  if sub is null then raise exception 'subject_not_found'; end if;

  -- D4: redução efetiva sobre o preço (ou a taxa) de tabela; acima de 20% só administrador
  v_red := case v_kind
    when 'discount_pct' then v_value
    when 'fixed' then case when (sub->>'list_price')::numeric > 0 then ((sub->>'list_price')::numeric - v_value) / (sub->>'list_price')::numeric * 100 else 0 end
    else case when coalesce((sub->>'list_rate')::numeric, 0) > 0 then ((sub->>'list_rate')::numeric - v_value) / (sub->>'list_rate')::numeric * 100 else 0 end end;
  if v_red > 20 then
    begin s := public._staff('admin');
    exception when others then
      if sqlerrm = 'forbidden' then raise exception 'discount_needs_admin'; end if;
      raise;
    end;
  end if;

  perform pg_advisory_xact_lock(hashtext('price_override:' || v_product || ':' || v_subject::text));
  select * into o from public.price_overrides where product = v_product and subject_id = v_subject and revoked_at is null;
  if found then
    if o.kind = v_kind and o.value = round(v_value, 4) and o.valid_from = v_from and o.valid_until is not distinct from v_until and o.reason = v_reason then
      return jsonb_build_object('id', o.id, 'unchanged', true, 'replaced_id', null);   -- reenvio idêntico: nada novo
    end if;
    update public.price_overrides set revoked_at = now(), revoked_by = s.user_id, revoke_reason = 'substituído por novo preço personalizado' where id = o.id;
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
  update public.price_overrides set revoked_at = now(), revoked_by = s.user_id, revoke_reason = v_reason where id = p_id;
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
    update public.sign_accounts set plan = v_plan, plan_since = current_date, updated_at = now() where id = v_subject;
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
    if v_plan = 'contract' then
      begin v_rate := (p->>'rate_aa')::numeric; v_min := (p->>'min_monthly')::numeric; exception when others then raise exception 'invalid_value'; end;
      if v_rate is null or v_min is null or v_rate < 0 or v_rate > 100 or v_min < 0 then raise exception 'invalid_value'; end if;
      update public.platform_fee_plans set rate_aa = v_rate, min_monthly = v_min, active = true where funder_id = v_subject;
      if not found then insert into public.platform_fee_plans (funder_id, rate_aa, min_monthly, active) values (v_subject, v_rate, v_min, true); end if;
    else
      update public.platform_fee_plans set active = false where funder_id = v_subject;
    end if;
    update public.funder_billing set origin = case v_plan when 'contract' then 'invite' else 'self' end where funder_id = v_subject;
    if not found then insert into public.funder_billing (funder_id, origin) values (v_subject, case v_plan when 'contract' then 'invite' else 'self' end); end if;
    v_old := null;
  end if;
  perform public._staff_log(s, 'set_plan', v_product, v_subject::text, null,
    jsonb_build_object('plan', v_plan, 'previous_plan', v_old, 'payment_ok', p->'payment_ok', 'rate_aa', p->'rate_aa', 'min_monthly', p->'min_monthly'));
  return jsonb_build_object('product', v_product, 'subject', v_subject, 'plan', v_plan, 'unchanged', false);
end $$;

-- D3: faturas abertas vencidas; dentro da carência (grace_days) x além dela. Sem bloqueio nem rebaixa automáticos.
create or replace function public.bo_overdue_list()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.staff_users := public._staff('analyst'); g int; v_today date := current_date;
begin
  select coalesce(grace_days, 15) into g from public.billing_settings where id = 1;
  return (select jsonb_build_object('grace_days', g, 'total', count(*), 'total_amount', coalesce(sum(x.amount), 0),
            'items', coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'number', x.number, 'customer_kind', x.customer_kind, 'customer_name', x.customer_name,
              'funder_id', x.funder_id, 'sign_account_id', x.sign_account_id, 'ref_month', x.ref_month, 'amount', x.amount, 'due_date', x.due_date,
              'days_overdue', v_today - x.due_date, 'stage', case when v_today - x.due_date <= g then 'grace' else 'beyond_grace' end,
              'reminders_paused', x.reminders_paused) order by x.due_date, x.id), '[]'::jsonb))
          from (select * from public.bill_invoices where status = 'open' and due_date < v_today order by due_date, id limit 200) x);
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
    'public._effective_price(text, uuid, numeric, date)', 'public._override_fee_rate(uuid, date)', 'public._partners_fee(numeric, numeric, numeric)',
    'public._partners_list_terms(uuid)', 'public._partners_fee_calc(uuid, date)', 'public._w_price_for(uuid, text)', 'public._price_subject(text, uuid)',
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
