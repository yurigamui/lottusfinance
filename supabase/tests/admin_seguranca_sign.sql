-- Teste da migração 20261126120000_admin_seguranca_sign_mensageria.sql
-- Papéis: anon negado; analista/aprovador insufficient_level; admin passa; log sem token; impl interna; idempotência.
create function pg_temp.try(p_sql text, p_role text, p_staff text) returns text language plpgsql as $f$
begin
  perform set_config('test.staff', coalesce(p_staff, ''), false);
  execute 'set local role ' || p_role;
  begin execute p_sql; reset role; return 'ok';
  exception when others then reset role; return sqlerrm; end;
end $f$;

do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); rid uuid; r text; n int := 0; total int := 0; det text;
  q_save constant text := $q$select public.sign_messaging_save('{"token":"SEGREDO-123","phone_id":"55"}')$q$;
  q_add  constant text := $q$select public.sign_root_add('Raiz X', '-----BEGIN CERTIFICATE-----SEGREDO-PEM')$q$;
begin
  insert into public.staff_users (user_id, name, level) values (a, 'Ana', 'analyst'), (b, 'Beto', 'approver'), (c, 'Cris', 'admin');
  -- 1-3 anon negado
  r := pg_temp.try(q_save, 'anon', c::text);  total := total + 1; if r ilike '%permission denied%' then n := n + 1; else raise notice 'FALHA anon save: %', r; end if;
  r := pg_temp.try(q_add,  'anon', c::text);  total := total + 1; if r ilike '%permission denied%' then n := n + 1; else raise notice 'FALHA anon add: %', r; end if;
  r := pg_temp.try($q$select public.sign_root_toggle(gen_random_uuid(), true)$q$, 'anon', c::text);
  total := total + 1; if r ilike '%permission denied%' then n := n + 1; else raise notice 'FALHA anon toggle: %', r; end if;
  -- 4-9 analista e aprovador: insufficient_level
  r := pg_temp.try(q_save, 'authenticated', a::text); total := total + 1; if r = 'insufficient_level' then n := n + 1; else raise notice 'FALHA analista save: %', r; end if;
  r := pg_temp.try(q_add,  'authenticated', a::text); total := total + 1; if r = 'insufficient_level' then n := n + 1; else raise notice 'FALHA analista add: %', r; end if;
  r := pg_temp.try($q$select public.sign_root_toggle(gen_random_uuid(), false)$q$, 'authenticated', a::text);
  total := total + 1; if r = 'insufficient_level' then n := n + 1; else raise notice 'FALHA analista toggle: %', r; end if;
  r := pg_temp.try(q_save, 'authenticated', b::text); total := total + 1; if r = 'insufficient_level' then n := n + 1; else raise notice 'FALHA aprovador save: %', r; end if;
  r := pg_temp.try(q_add,  'authenticated', b::text); total := total + 1; if r = 'insufficient_level' then n := n + 1; else raise notice 'FALHA aprovador add: %', r; end if;
  r := pg_temp.try($q$select public.sign_root_toggle(gen_random_uuid(), false)$q$, 'authenticated', b::text);
  total := total + 1; if r = 'insufficient_level' then n := n + 1; else raise notice 'FALHA aprovador toggle: %', r; end if;
  -- nada foi gravado pelos negados
  total := total + 1;
  if not exists (select 1 from public.sign_messaging_cfg) and not exists (select 1 from public.sign_roots) and not exists (select 1 from public.staff_actions where action like 'sign_%') then n := n + 1; else raise notice 'FALHA: negados gravaram algo'; end if;
  -- 11-13 não equipe (sem staff, e usuário desconhecido): forbidden
  r := pg_temp.try(q_save, 'authenticated', null); total := total + 1; if r = 'forbidden' then n := n + 1; else raise notice 'FALHA forbidden save: %', r; end if;
  r := pg_temp.try(q_add,  'authenticated', gen_random_uuid()::text); total := total + 1; if r = 'forbidden' then n := n + 1; else raise notice 'FALHA forbidden add: %', r; end if;
  r := pg_temp.try($q$select public.sign_root_toggle(gen_random_uuid(), false)$q$, 'authenticated', null);
  total := total + 1; if r = 'forbidden' then n := n + 1; else raise notice 'FALHA forbidden toggle: %', r; end if;

  -- 14-16 admin passa e a impl executou
  r := pg_temp.try(q_save, 'authenticated', c::text); total := total + 1;
  if r = 'ok' and (select cfg ->> 'token' from public.sign_messaging_cfg) = 'SEGREDO-123' then n := n + 1; else raise notice 'FALHA admin save: %', r; end if;
  perform set_config('test.staff', c::text, false);
  set local role authenticated;
  rid := (public.sign_root_add('Raiz X', 'PEM-PUBLICO') ->> 'id')::uuid;
  reset role;
  total := total + 1; if exists (select 1 from public.sign_roots where id = rid and name = 'Raiz X') then n := n + 1; else raise notice 'FALHA admin add'; end if;
  r := pg_temp.try(format('select public.sign_root_toggle(%L, false)', rid), 'authenticated', c::text);
  total := total + 1; if r = 'ok' and not (select active from public.sign_roots where id = rid) then n := n + 1; else raise notice 'FALHA admin toggle: %', r; end if;
  -- retorno é jsonb
  total := total + 1;
  if (select prorettype from pg_proc where oid = 'public.sign_messaging_save(jsonb)'::regprocedure) = 'jsonb'::regtype
     and (select prorettype from pg_proc where oid = 'public.sign_root_add(text,text)'::regprocedure) = 'jsonb'::regtype
     and (select prorettype from pg_proc where oid = 'public.sign_root_toggle(uuid,boolean)'::regprocedure) = 'jsonb'::regtype
  then n := n + 1; else raise notice 'FALHA retorno jsonb'; end if;

  -- log gravado, sem token nem PEM
  total := total + 1;
  if (select count(*) from public.staff_actions where action in ('sign_messaging_save', 'sign_root_add', 'sign_root_toggle') and staff_id = c) = 3 then n := n + 1; else raise notice 'FALHA log: 3 linhas esperadas'; end if;
  total := total + 1;
  select string_agg(coalesce(details::text, '') || coalesce(target_id, ''), ' ') into det from public.staff_actions where action like 'sign_%';
  if det not ilike '%SEGREDO%' and det not ilike '%PEM-PUBLICO%' and det like '%token%' then n := n + 1; else raise notice 'FALHA log vazou segredo ou perdeu campos: %', det; end if;
  total := total + 1;
  if (select target_id from public.staff_actions where action = 'sign_root_toggle') = rid::text then n := n + 1; else raise notice 'FALHA log id da raiz'; end if;

  -- impl não executável por authenticated/anon/public; service_role sim; wrapper com authenticated e sem anon
  total := total + 1;
  if not has_function_privilege('authenticated', 'public._sign_messaging_save_impl(jsonb)', 'execute')
     and not has_function_privilege('anon', 'public._sign_messaging_save_impl(jsonb)', 'execute')
     and not has_function_privilege('authenticated', 'public._sign_root_add_impl(text,text)', 'execute')
     and not has_function_privilege('anon', 'public._sign_root_add_impl(text,text)', 'execute')
     and not has_function_privilege('authenticated', 'public._sign_root_toggle_impl(uuid,boolean)', 'execute')
     and not has_function_privilege('anon', 'public._sign_root_toggle_impl(uuid,boolean)', 'execute')
     and has_function_privilege('service_role', 'public._sign_messaging_save_impl(jsonb)', 'execute')
     and has_function_privilege('service_role', 'public._sign_root_add_impl(text,text)', 'execute')
     and has_function_privilege('service_role', 'public._sign_root_toggle_impl(uuid,boolean)', 'execute')
  then n := n + 1; else raise notice 'FALHA privilégios da impl'; end if;
  r := pg_temp.try($q$select public._sign_messaging_save_impl('{"token":"x"}')$q$, 'authenticated', c::text);
  total := total + 1; if r ilike '%permission denied%' then n := n + 1; else raise notice 'FALHA authenticated chamou impl: %', r; end if;
  total := total + 1;
  if has_function_privilege('authenticated', 'public.sign_messaging_save(jsonb)', 'execute') and not has_function_privilege('anon', 'public.sign_messaging_save(jsonb)', 'execute')
     and has_function_privilege('authenticated', 'public.sign_root_add(text,text)', 'execute') and not has_function_privilege('anon', 'public.sign_root_add(text,text)', 'execute')
     and has_function_privilege('authenticated', 'public.sign_root_toggle(uuid,boolean)', 'execute') and not has_function_privilege('anon', 'public.sign_root_toggle(uuid,boolean)', 'execute')
  then n := n + 1; else raise notice 'FALHA privilégios do wrapper'; end if;
  -- wrapper definer com search_path vazio
  total := total + 1;
  if (select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where oid in ('public.sign_messaging_save(jsonb)'::regprocedure, 'public.sign_root_add(text,text)'::regprocedure, 'public.sign_root_toggle(uuid,boolean)'::regprocedure))
  then n := n + 1; else raise notice 'FALHA definer/search_path'; end if;

  raise notice '% de % passaram (admin_seguranca_sign)', n, total;
  if n <> total then raise exception 'testes falharam: % de %', n, total; end if;
end $$;

-- idempotência: o script já aplicou a migração 2x (se a 2ª renomeasse de novo, teria falhado); aqui conferimos o estado
do $$ begin
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('sign_messaging_save', 'sign_root_add', 'sign_root_toggle')) <> 3
     or (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('_sign_messaging_save_impl', '_sign_root_add_impl', '_sign_root_toggle_impl')) <> 3
  then raise exception 'idempotência: contagem de funções errada'; end if;
  if (select prosrc from pg_proc where proname = '_sign_root_add_impl') like '%_staff%' then raise exception 'idempotência: impl virou wrapper'; end if;
  raise notice 'ok: idempotência (2 aplicações, impl intacta, 3+3 funções)';
end $$;
