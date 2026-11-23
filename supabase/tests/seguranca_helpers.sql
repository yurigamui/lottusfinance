-- Teste da migração 20261123121000_seguranca_rls_e_helpers_internos.sql
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.legacy_gl_lines'::regclass) then raise exception 'S1 RLS desligada'; end if;
  raise notice 'ok: S1 RLS ligada em legacy_gl_lines';
  if has_function_privilege('anon', 'public._brl(numeric)', 'execute') or has_function_privilege('anon', 'public._doc_norm(text)', 'execute') then
    raise exception 'S2 anon ainda executa helper interno'; end if;
  if not has_function_privilege('authenticated', 'public._brl(numeric)', 'execute') then raise exception 'S2 authenticated perdeu o helper'; end if;
  raise notice 'ok: S2 helpers sem anon, com authenticated';
  if not (select proconfig @> array['search_path=""'] from pg_proc where oid = 'news.log_forecast()'::regprocedure) then raise exception 'S3 search_path não fixado'; end if;
  if (select proconfig from pg_proc where oid = 'public._one_period_add(date,text,integer)'::regprocedure) is not null then raise exception 'S3 função SQL não deveria mudar'; end if;
  if not has_function_privilege('anon', 'public._one_period_add(date,text,integer)', 'execute') then raise exception 'S2 função fora da lista foi tocada'; end if;
  if public._one_period_add('2024-02-29', 'year', 1) <> '2025-02-28' then raise exception 'S3 _one_period_add mudou de resultado'; end if;
  insert into news.forecasts values ('selic', 'exemplo', 10.5, '2026-11-23');
  if (select count(*) from news.forecast_history) <> 1 then raise exception 'S3 log_forecast parou de gravar'; end if;
  raise notice 'ok: S3 search_path fixo e funções continuam funcionando';
end $$;
