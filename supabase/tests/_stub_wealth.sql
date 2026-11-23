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
