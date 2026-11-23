-- Ambiente LOCAL que imita o Supabase só no que o Wealth usa. Dados fictícios.
create extension if not exists pgcrypto;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create schema if not exists auth; create schema if not exists extensions; create schema if not exists net;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, encrypted_password text, phone text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now(), email_confirmed_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb $$;
create or replace function extensions.gen_random_bytes(int) returns bytea language sql as $$ select public.gen_random_bytes($1) $$;
create or replace function net.http_post(url text, body jsonb default '{}', headers jsonb default '{}') returns bigint language sql as $$ select 1::bigint $$;
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, full_name text, cpf text, phone text, email text, updated_at timestamptz default now());
create table public.app_settings (id int primary key, signature_email_from text);
insert into public.app_settings values (1, 'nao-responda@exemplo.com.br');
create table public.email_outbox (id uuid primary key default gen_random_uuid(), to_addr text, subject text, html text, kind text, meta jsonb, created_at timestamptz default now());

-- _guard_delete existe em produção (protege tabelas financeiras); versão local equivalente para as migrações do repo.
create or replace function public._guard_delete() returns trigger language plpgsql as $$
begin
  if current_setting('lottus.allow_purge', true) = 'on' then return old; end if;
  if tg_op = 'TRUNCATE' then raise exception 'protected_table'; end if;
  raise exception 'protected_delete';
end $$;
