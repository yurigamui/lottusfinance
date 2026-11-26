-- Stub MÍNIMO para a migração 20261126120000_admin_seguranca_sign_mensageria.sql (Postgres local).
-- Carregado depois de _stub_admin_billing.sql (usa _staff com hierarquia e staff_actions).
-- Reproduz só a ASSINATURA e o comportamento mínimo das 3 funções de escrita lidas em produção em 26/11/2026
-- (SECURITY DEFINER, retorno jsonb, executáveis por authenticated). Corpos reescritos, NÃO copiados. Tipo de p_id presumido uuid.
create table public.sign_messaging_cfg (id int primary key default 1, cfg jsonb);       -- "token" ficaria no Vault em produção
create table public.sign_roots (id uuid primary key default gen_random_uuid(), name text, pem text, active boolean not null default true);

create function public.sign_messaging_save(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $f$
begin
  if not exists (select 1 from public.staff_users where user_id = nullif(current_setting('test.staff', true), '')::uuid) then raise exception 'forbidden'; end if;
  insert into public.sign_messaging_cfg (id, cfg) values (1, p) on conflict (id) do update set cfg = excluded.cfg;
  return jsonb_build_object('ok', true, 'segredo_eco', p ->> 'token');
end $f$;
create function public.sign_root_add(p_name text, p_pem text) returns jsonb language plpgsql security definer set search_path = '' as $f$
declare v uuid;
begin
  insert into public.sign_roots (name, pem) values (p_name, p_pem) returning id into v;
  return jsonb_build_object('ok', true, 'id', v);
end $f$;
create function public.sign_root_toggle(p_id uuid, p_active boolean) returns jsonb language plpgsql security definer set search_path = '' as $f$
begin
  update public.sign_roots set active = p_active where id = p_id;
  return jsonb_build_object('ok', found);
end $f$;
grant execute on function public.sign_messaging_save(jsonb), public.sign_root_add(text, text), public.sign_root_toggle(uuid, boolean) to authenticated;
