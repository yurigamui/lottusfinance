-- Esquema MÍNIMO para testar migrações do Wealth em Postgres local, sem tocar o Supabase.
-- Reproduz só as colunas e restrições de produção que as migrações usam (lidas em 23/11/2026).
-- Não é o esquema completo: o teste definitivo é no branch do Supabase.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create or replace function public._guard_delete() returns trigger language plpgsql as $$
begin
  if current_setting('lottus.allow_purge', true) = 'on' then return old; end if;
  if tg_op = 'TRUNCATE' then raise exception 'protected_table'; end if;
  raise exception 'protected_delete';
end $$;
create table public.w_wallets (id uuid primary key default gen_random_uuid(), name text not null, kind text not null default 'pessoal',
  owner_id uuid not null references auth.users(id), created_by uuid not null references auth.users(id), archived_at timestamptz, created_at timestamptz not null default now());
create table public.w_groups (id uuid primary key default gen_random_uuid(), owner_id uuid references auth.users(id), name text);
create table public.w_members (wallet_id uuid not null references public.w_wallets(id) on delete cascade, user_id uuid not null references auth.users(id),
  role text not null, invited_by uuid references auth.users(id), since timestamptz not null default now(), group_id uuid references public.w_groups(id) on delete cascade, primary key (wallet_id, user_id));
create table public.w_cadastros (id uuid primary key default gen_random_uuid(), wallet_id uuid not null references public.w_wallets(id) on delete cascade,
  kind text not null check (kind in ('contraparte','centro','grupo')), name text not null, document text, created_at timestamptz not null default now());
create table public.w_bank_accounts (id uuid primary key default gen_random_uuid(), wallet_id uuid not null references public.w_wallets(id) on delete cascade,
  name text not null, opening_balance numeric not null default 0, created_at timestamptz not null default now());
create table public.w_imports (id uuid primary key default gen_random_uuid(), wallet_id uuid not null references public.w_wallets(id) on delete cascade, created_at timestamptz not null default now());
create table public.w_spend_tx (id uuid primary key default gen_random_uuid(), wallet_id uuid not null references public.w_wallets(id) on delete cascade,
  account_id uuid not null references public.w_bank_accounts(id) on delete restrict, date date not null, description text not null, amount numeric not null,
  counterparty_id uuid references public.w_cadastros(id) on delete set null, cost_center_id uuid references public.w_cadastros(id) on delete set null,
  group_id uuid references public.w_cadastros(id) on delete set null, is_transfer boolean not null default false, transfer_with uuid, fingerprint text,
  import_id uuid references public.w_imports(id) on delete set null, notes text, created_by uuid, created_at timestamptz not null default now());
create table public.w_rules (id uuid primary key default gen_random_uuid(), wallet_id uuid not null references public.w_wallets(id) on delete cascade,
  priority int not null default 100, match_kind text not null default 'contem', match_text text not null, sign text not null default 'any',
  counterparty_id uuid references public.w_cadastros(id) on delete set null, cost_center_id uuid references public.w_cadastros(id) on delete set null,
  group_id uuid references public.w_cadastros(id) on delete set null, active boolean not null default true, created_at timestamptz not null default now());
create table public.w_assets (id uuid primary key default gen_random_uuid(), wallet_id uuid references public.w_wallets(id));
create table public.w_invest_tx (id uuid primary key default gen_random_uuid(), wallet_id uuid not null references public.w_wallets(id) on delete cascade,
  asset_id uuid not null references public.w_assets(id), import_id uuid references public.w_imports(id) on delete set null);
create table public.w_other (id uuid primary key default gen_random_uuid(), wallet_id uuid not null references public.w_wallets(id) on delete cascade);
create table public.w_api_keys (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);
create table public.w_group_members (group_id uuid references public.w_groups(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, added_by uuid references auth.users(id));
create table public.w_invoices (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id));
create table public.w_payment_events (id uuid primary key default gen_random_uuid(), provider text);

-- Para 20261123121000: tabela legada sem RLS, helpers internos executáveis por anon e funções sem search_path.
create table public.legacy_gl_lines (id bigint primary key, amount numeric);
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create function public._brl(p numeric) returns text language sql as $f$ select to_char(p, 'FM999G999G990D00') $f$;
create function public._doc_norm(t text) returns text language sql as $f$ select regexp_replace(coalesce(t, ''), '\D', '', 'g') $f$;
grant execute on function public._brl(numeric), public._doc_norm(text) to anon, authenticated;
create function public._one_period_add(p_date date, p_period text, p_n integer) returns date language sql as $f$
  select (p_date + case p_period when 'quarter' then make_interval(months => 3 * p_n) when 'year' then make_interval(years => p_n) else make_interval(months => p_n) end)::date $f$;
create function public._one_first_billing(p_start date, p_day integer) returns date language sql as $f$ select p_start $f$;
create schema news;
create table news.forecasts (indicator text, house text, value numeric, as_of date);
create table news.forecast_history (indicator text, house text, value numeric, as_of date);
create function news.log_forecast() returns trigger language plpgsql as $f$ begin
  if tg_op = 'INSERT' or old.value is distinct from new.value then
    insert into news.forecast_history(indicator, house, value, as_of) values (new.indicator, new.house, new.value, new.as_of); end if; return new; end $f$;
create trigger log_forecast after insert or update on news.forecasts for each row execute function news.log_forecast();

-- Para 20261123122000 (Admin): equipe, notas e o helper de conferência, reduzidos ao que a RPC usa.
create table public.staff_users (id uuid primary key default gen_random_uuid(), level text not null);
create table public.staff_log (id bigserial primary key, staff uuid, action text, entity text, entity_id text, company uuid, details jsonb);
create table public.invoices (id uuid primary key default gen_random_uuid(), company_id uuid, sefaz_status text);
create table public.nfe_checks_calls (invoice_id uuid, p jsonb);
create function public._staff(p_min text) returns public.staff_users language plpgsql as $f$
declare s public.staff_users; begin
  select * into s from public.staff_users where id = nullif(current_setting('test.staff', true), '')::uuid;
  if not found then raise exception 'forbidden'; end if; return s; end $f$;
create function public._staff_log(s public.staff_users, a text, e text, i text, c uuid, d jsonb) returns void language sql as $f$
  insert into public.staff_log (staff, action, entity, entity_id, company, details) values (s.id, a, e, i, c, d) $f$;
create function public._nfe_check_save(p_invoice uuid, p jsonb) returns jsonb language plpgsql as $f$ begin
  insert into public.nfe_checks_calls values (p_invoice, p);
  update public.invoices set sefaz_status = p->>'status' where id = p_invoice;
  return jsonb_build_object('status', p->>'status', 'ok', p->>'status' = 'authorized'); end $f$;
