-- Ambiente LOCAL que imita o Supabase só no que o Sign usa. Dados fictícios, nenhuma regra de produção inventada:
-- as tabelas "stub" abaixo têm só as colunas que as funções do Sign leem. Veja docs/agente/sign/ambiente-local.md.
create schema if not exists extensions; create schema if not exists auth; create schema if not exists net; create schema if not exists vault;
create extension if not exists pgcrypto schema extensions;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;

-- auth
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, encrypted_password text, phone text,
  raw_user_meta_data jsonb default '{}', created_at timestamptz default now(), email_confirmed_at timestamptz default now(),
  phone_confirmed_at timestamptz, last_sign_in_at timestamptz);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid, created_at timestamptz default now(), refreshed_at timestamptz, ip inet, user_agent text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'sub', '')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

-- net.http_post STUB: não sai da máquina; grava a chamada em net.http_calls (é daí que o teste lê o link do e-mail).
create table net.http_calls (id bigint generated always as identity primary key, url text, body jsonb, headers jsonb, at timestamptz default now());
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
  returns bigint language plpgsql security definer as $$ declare v bigint; begin insert into net.http_calls (url, body, headers) values (url, body, headers) returning id into v; return v; end $$;

-- vault STUB: tabela comum (em produção é criptografada). O token do Postmark abaixo é falso: faz _send_email seguir o caminho "com token".
create table vault.decrypted_secrets (id uuid primary key default gen_random_uuid(), name text unique, decrypted_secret text, description text);
create or replace function vault.create_secret(secret text, name text default null, description text default '') returns uuid language sql as
  $$ insert into vault.decrypted_secrets (name, decrypted_secret, description) values (name, secret, description) returning id $$;
create or replace function vault.update_secret(id uuid, secret text) returns void language sql as
  $$ update vault.decrypted_secrets s set decrypted_secret = secret where s.id = update_secret.id $$;
insert into vault.decrypted_secrets (name, decrypted_secret) values ('postmark_server_token', 'token-falso-local');

-- STUBS de tabelas de outras plataformas (só colunas lidas pelo Sign; tipos conforme produção)
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, full_name text, cpf text unique, phone text, email text, updated_at timestamptz default now());
  -- unique(cpf): inferido do código (sign_profile_save trata unique_violation como 'cpf_in_use'); confirmar no esquema real.
create table public.companies (id uuid primary key default gen_random_uuid(), cnpj text, legal_name text, trade_name text);
create table public.company_members (company_id uuid references public.companies(id), user_id uuid, access text, role text, sign_limit numeric, sign_monthly_limit numeric);
create table public.api_partners (id uuid primary key default gen_random_uuid());
create table public.funders (id uuid primary key default gen_random_uuid(), trade_name text, legal_name text, email_paused boolean default false);
create table public.funder_members (id uuid primary key default gen_random_uuid(), funder_id uuid not null, user_id uuid not null, name text not null, cpf text not null, email text,
  role text, can_sign boolean not null default true, active boolean not null default true, created_at timestamptz not null default now(), alerts boolean not null default true,
  is_admin boolean not null default false, approval_limit numeric, invited_by uuid, phone text);
create table public.operations (id uuid primary key default gen_random_uuid(), funder_id uuid, company_id uuid);
create table public.platform_flags (key text primary key, value jsonb);
create table public.staff_users (user_id uuid primary key, active boolean not null default true);
create table public.backoffice_settings (id int primary key, require_mfa boolean not null default false);
insert into public.backoffice_settings values (1, false);
create table public.app_settings (id int primary key default 1, signature_email_from text, signature_email_enabled boolean not null default true, email_from text, email_reply_to text,
  functions_url text, signature_pdf boolean not null default true, partners_url text, lottus_legal_name text);
insert into public.app_settings values (1, 'assinaturas@exemplo.com.br', true, 'acesso@exemplo.com.br', 'contato@exemplo.com.br', 'https://funcoes.exemplo.com.br/functions/v1', true, 'https://partners.exemplo.com.br/', 'EMPRESA EXEMPLO LTDA');
create table public.email_log (id uuid not null default gen_random_uuid() primary key, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  kind text not null, recipient text not null, subject text, status text not null default 'queued', provider_id text, request_id bigint, error text, meta jsonb not null default '{}',
  opened_at timestamptz, clicked_at timestamptz);
create table public.crm_leads (id uuid primary key default gen_random_uuid(), name text not null, product text not null default 'partners', kind text, contact_name text, email text, phone text, doc text,
  stage text not null default 'lead', source text, notes text, lost_reason text, next_action_at date, funder_id uuid, sign_account_id uuid, attention boolean not null default false, created_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), stage_changed_at timestamptz not null default now(), value_monthly numeric, owner_id uuid, owner_name text);
create table public.crm_activities (id bigint generated always as identity primary key, lead_id uuid, kind text, text text, by_name text, created_at timestamptz not null default now());
create table public.customer_events (id bigint generated always as identity primary key, kind text not null, ref_id uuid not null, event text not null, mrr_before numeric, mrr_after numeric, text text, by_name text, created_at timestamptz not null default now());
create table public.customer_meta (kind text not null, ref_id uuid not null, owner_id uuid, owner_name text, notes text, cancelled_at timestamptz, cancel_reason text, updated_at timestamptz not null default now(), primary key (kind, ref_id));
create table public.admin_notifications (id bigint generated always as identity primary key, kind text not null, title text not null, body text, link text, created_at timestamptz not null default now());
-- usadas só por triggers/funções fora dos testes principais (precisam existir para o plano das funções):
create table public.one_contracts (id uuid primary key default gen_random_uuid(), sign_envelope_id uuid, status text, signed_at timestamptz, next_billing date, start_date date, billing_day int, updated_at timestamptz);
create table public.one_contract_events (id bigint generated always as identity primary key, contract_id uuid, kind text, text text);

-- _my_funder_id existe em produção (lê funder_members do usuário); versão reconstruída, usada só por _email_funder
create or replace function public._my_funder_id() returns uuid language sql stable security definer set search_path = '' as
  $$ select funder_id from public.funder_members where user_id = auth.uid() and active limit 1 $$;
-- _one_first_billing existe em produção (módulo de contratos); aqui devolve null. Só é chamada quando há contrato vinculado ao envelope
-- (sign_envelopes_one), e o seed não cria contratos. A regra real de cobrança NÃO é testada aqui.
create or replace function public._one_first_billing(p_start date, p_day int) returns date language sql as $$ select null::date $$;
