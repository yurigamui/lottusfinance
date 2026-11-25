-- Esquema MÍNIMO para testar a migração 20261125120000_admin_planos_precos_cobranca.sql em Postgres local.
-- Carregado DEPOIS de _stub_wealth.sql (reaproveita staff_users, staff_log, _staff_log, _guard_delete, roles).
-- São REPRODUÇÕES: colunas lidas em produção em 25/11/2026 (docs/agente/admin/b2-banco-planos-cobranca.md, apêndice);
-- as funções (_staff, _plan_fee, _w_price, _platform_fee_run, bo_inv_generate) foram reescritas a partir da DESCRIÇÃO do doc,
-- não copiadas de produção. O teste definitivo é num branch do Supabase.

-- Equipe: _staff agora respeita a hierarquia analyst < approver < admin (o stub do Wealth só checava existência).
create or replace function public._staff(p_min text) returns public.staff_users language plpgsql as $f$
declare s public.staff_users; need int; have int;
begin
  select * into s from public.staff_users
   where user_id = nullif(current_setting('test.staff', true), '')::uuid and coalesce(active, true);
  if not found then raise exception 'forbidden'; end if;
  need := case p_min when 'analyst' then 1 when 'approver' then 2 when 'admin' then 3 else 99 end;
  have := case s.level when 'analyst' then 1 when 'approver' then 2 when 'admin' then 3 else 0 end;
  if have < need then raise exception 'insufficient_level'; end if;   -- produção também levanta mfa_required (não simulado aqui)
  return s;
end $f$;

-- Auditoria da equipe: em produção _staff_log grava em staff_actions; aqui o stub do Wealth grava em staff_log
-- e um gatilho copia para staff_actions (staff_id, staff_name, action, target_type, target_id, company_id, details).
create table if not exists public.staff_actions (id bigserial primary key, staff_id uuid, staff_name text, action text, target_type text,
  target_id text, company_id uuid, details jsonb, created_at timestamptz default now());
create or replace function public._stub_staff_actions_copy() returns trigger language plpgsql as $f$ begin
  insert into public.staff_actions (staff_id, staff_name, action, target_type, target_id, company_id, details)
  values (new.staff, (select name from public.staff_users where user_id = new.staff), new.action, new.entity, new.entity_id, new.company, new.details);
  return new; end $f$;
drop trigger if exists stub_staff_actions_copy on public.staff_log;
create trigger stub_staff_actions_copy after insert on public.staff_log for each row execute function public._stub_staff_actions_copy();

create table public.customer_events (id bigserial primary key, kind text, ref_id uuid,
  event text check (event in ('new','upgrade','downgrade','cancel','reactivate','note')),
  mrr_before numeric, mrr_after numeric, text text, created_at timestamptz not null default now());

create table public.billing_settings (id int primary key check (id = 1), free_pl_limit numeric not null default 100000, tiers jsonb not null default '[]'::jsonb,
  terms_version text, grace_days int not null default 15, card_provider text, card_env text, pay_instructions text, remind_enabled boolean not null default true,
  due_day int not null default 10);
insert into public.billing_settings (id, free_pl_limit, tiers, grace_days, due_day) values
  (1, 100000, '[{"up_to":1000000,"monthly":149},{"up_to":5000000,"monthly":390},{"min":390,"up_to":null,"rate_aa":0.001}]'::jsonb, 15, 10);

create table public.funders (id uuid primary key default gen_random_uuid(), legal_name text, trade_name text, cnpj text, email text, kind text,
  active boolean not null default true, routing jsonb);
create table public.funder_billing (funder_id uuid primary key references public.funders(id), origin text not null default 'self' check (origin in ('self','invite')),
  exempt boolean not null default false, pl_declared numeric, terms_version text, terms_accepted_at timestamptz, card_ref text, over_limit_since date);
create table public.platform_fee_plans (funder_id uuid primary key references public.funders(id), rate_aa numeric not null, min_monthly numeric not null default 0,
  active boolean not null default true);
create table public.platform_fees (id uuid primary key default gen_random_uuid(), funder_id uuid not null references public.funders(id), ref_month date not null,
  pl numeric, rate_aa numeric, min_monthly numeric, amount numeric not null default 0, status text not null default 'open', paid_at timestamptz,
  created_at timestamptz not null default now(), unique (funder_id, ref_month));

create table public.sign_plans (code text primary key, name text not null, price_month numeric not null default 0, docs_included int, extra_doc_price numeric,
  sort int, active boolean not null default true, updated_at timestamptz default now());
insert into public.sign_plans (code, name, price_month, docs_included, extra_doc_price, sort) values
  ('free', 'Grátis', 0, 3, null, 1), ('essencial', 'Essencial', 39, 20, 2.5, 2), ('profissional', 'Profissional', 99, 80, 2, 3), ('empresa', 'Empresa', 249, 300, 1.5, 4);
create table public.sign_accounts (id uuid primary key default gen_random_uuid(), user_id uuid, name text, doc text, plan text not null default 'free' references public.sign_plans(code),
  plan_since date, cycle text default 'monthly', custom_price numeric, custom_docs int, exempt boolean not null default false, status text default 'active',
  plan_requested text, requested_at timestamptz, notes text, created_at timestamptz not null default now(), updated_at timestamptz default now());

create table public.w_profiles (user_id uuid primary key, name text, cpf text, phone text, plan text not null default 'gratis' check (plan in ('gratis','pro','fund')),
  payment_ok boolean not null default false, billing_status text, overdue_since date, completed_at timestamptz, created_at timestamptz not null default now());
create function public._w_price(p_plan text) returns numeric language sql immutable as $f$
  select case p_plan when 'pro' then 79::numeric when 'fund' then 199::numeric else 0::numeric end $f$;
create function public._w_replan(p_user uuid) returns void language plpgsql as $f$ begin perform 1; end $f$;
create function public.w_admin_set_plan(p_user uuid, p_plan text, p_payment_ok boolean) returns void language plpgsql security definer set search_path = '' as $f$ begin
  update public.w_profiles set plan = p_plan, payment_ok = coalesce(p_payment_ok, payment_ok) where user_id = p_user; perform public._w_replan(p_user); end $f$;
revoke all on function public.w_admin_set_plan(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.w_admin_set_plan(uuid, text, boolean) to service_role;

create sequence public.bill_seq;
create table public.bill_invoices (id uuid primary key default gen_random_uuid(), number text, customer_kind text, funder_id uuid, sign_account_id uuid,
  customer_name text, customer_doc text, customer_email text, description text, ref_month date, amount numeric not null default 0, due_date date,
  status text not null default 'open', paid_at timestamptz, paid_method text, notes text, source text, source_ref text, reminders_paused boolean not null default false,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz default now(), org_id uuid, customer_id uuid, contract_id uuid, proposal_id uuid,
  items jsonb, public_token text, bank_conn_id uuid, charge_ref text, charge_status text, charge_error text, pix_payload text, pix_qr text, boleto_url text,
  boleto_line text, pay_url text, paid_amount numeric, nfse_status text, nfse_number text, nfse_url text, billing_period text);

-- ---- Reproduções de funções de produção ----
-- _plan_fee, _platform_fee_run e _staff: corpo/erros REAIS lidos em 25/11/2026 (docs/agente/admin/b2-defs-producao.sql). rate_aa é FRAÇÃO ao ano.
create function public._today_br() returns date language sql stable as $f$ select (now() at time zone 'America/Sao_Paulo')::date $f$;
-- _funder_pl(funder, data): em produção é função interna própria; aqui devolve funder_billing.pl_declared (simples).
create function public._funder_pl(p_funder uuid, p_on date) returns numeric language sql stable as $f$
  select coalesce((select pl_declared from public.funder_billing where funder_id = p_funder), 0) $f$;
create function public._plan_fee(p_pl numeric) returns numeric
language plpgsql stable security definer set search_path to '' as $f$
declare s public.billing_settings; t jsonb;
begin
  select * into s from public.billing_settings where id = 1;
  if coalesce(p_pl, 0) <= s.free_pl_limit then return 0; end if;
  for t in select x from jsonb_array_elements(s.tiers) x loop
    if t ->> 'up_to' is null or p_pl <= (t ->> 'up_to')::numeric then
      if t ? 'rate_aa' then
        return round(greatest(p_pl * (t ->> 'rate_aa')::numeric / 12, coalesce((t ->> 'min')::numeric, 0)), 2);
      end if;
      return (t ->> 'monthly')::numeric;
    end if;
  end loop;
  return 0;
end $f$;

create function public._platform_fee_run(p_month date default null) returns integer
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
      v_amt := round(greatest(v_pl * v_rate / 12, v_min), 2);
    end if;
    if v_amt > 0 then
      insert into public.platform_fees (funder_id, ref_month, pl, rate_aa, min_monthly, amount)
      values (f.id, v_m, round(v_pl, 2), v_rate, v_min, v_amt) on conflict (funder_id, ref_month) do nothing;
      n := n + 1;
    end if;
  end loop;
  return n;
end $f$;
revoke all on function public._platform_fee_run(date) from public, anon, authenticated;
grant execute on function public._platform_fee_run(date) to service_role;

-- bo_inv_generate(mês) (aprovador): fatura a partir de platform_fees (amount>0, status<>'paid'); vencimento = 1º dia do mês seguinte + (due_day-1).
create function public.bo_inv_generate(p_month date) returns integer language plpgsql security definer set search_path = '' as $f$
declare s public.staff_users := public._staff('approver'); m date := date_trunc('month', p_month)::date; r record; n int := 0; dd int;
begin
  select least(greatest(due_day, 1), 28) into dd from public.billing_settings where id = 1;
  for r in select pf.*, fu.legal_name, fu.cnpj, fu.email from public.platform_fees pf join public.funders fu on fu.id = pf.funder_id
            where pf.ref_month = m and pf.amount > 0 and pf.status <> 'paid'
              and not exists (select 1 from public.bill_invoices b where b.funder_id = pf.funder_id and b.ref_month = m and b.source = 'platform_fee' and b.status <> 'cancelled') loop
    insert into public.bill_invoices (number, customer_kind, funder_id, customer_name, customer_doc, customer_email, description, ref_month, amount, due_date, source, source_ref, created_by)
    values ('F-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.bill_seq')::text, 4, '0'), 'funder', r.funder_id, r.legal_name, r.cnpj, r.email,
            'Taxa de plataforma ' || to_char(m, 'MM/YYYY'), m, r.amount, (m + interval '1 month')::date + (dd - 1), 'platform_fee', r.id::text, s.user_id);
    n := n + 1;
  end loop;
  return n;
end $f$;
revoke all on function public.bo_inv_generate(date) from public, anon;
grant execute on function public.bo_inv_generate(date) to authenticated;

-- Objetos de produção do Wealth que a migração 20261123125000 declara em tipos (a suíte já falhava sem eles).
create table public.w_billing_profiles (user_id uuid primary key, provider text, provider_customer_id text, card_brand text, card_last4 text,
  email text, holder_name text, method text, updated_at timestamptz default now());
