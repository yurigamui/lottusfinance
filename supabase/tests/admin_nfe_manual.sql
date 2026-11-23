-- Teste da migração 20261123122000_admin_conferencia_manual_nfe.sql
do $$
declare st uuid; inv uuid; r jsonb; ok boolean;
begin
  insert into public.staff_users (name, level) values ('Analista Exemplo', 'analyst') returning user_id into st;
  insert into public.invoices (company_id) values (gen_random_uuid()) returning id into inv;

  ok := false; begin perform public.bo_nfe_manual_check(inv, 'authorized', 'conferida'); exception when others then ok := sqlerrm = 'forbidden'; end;
  if not ok then raise exception 'N1 quem não é da equipe conseguiu registrar'; end if;
  raise notice 'ok: N1 fora da equipe recusado';

  perform set_config('test.staff', st::text, true);
  ok := false; begin perform public.bo_nfe_manual_check(inv, 'denied', 'conferida'); exception when others then ok := sqlerrm = 'invalid_status'; end;
  if not ok then raise exception 'N2 status fora do formulário aceito'; end if;
  ok := false; begin perform public.bo_nfe_manual_check(inv, 'authorized', '  a '); exception when others then ok := sqlerrm = 'manual_note_required'; end;
  if not ok then raise exception 'N3 anotação vazia aceita'; end if;
  ok := false; begin perform public.bo_nfe_manual_check(inv, 'authorized', E'\n\n\t\n' || repeat(chr(160), 4)); exception when others then ok := sqlerrm = 'manual_note_required'; end;
  if not ok then raise exception 'N3b anotação só com quebras de linha aceita'; end if;
  ok := false; begin perform public.bo_nfe_manual_check(inv, 'authorized', repeat('a', 501)); exception when others then ok := sqlerrm = 'manual_note_required'; end;
  if not ok then raise exception 'N3c anotação com mais de 500 caracteres aceita'; end if;
  ok := false; begin perform public.bo_nfe_manual_check(gen_random_uuid(), 'authorized', 'conferida'); exception when others then ok := sqlerrm = 'not_found'; end;
  if not ok then raise exception 'N4 nota inexistente aceita'; end if;
  if exists (select 1 from public.nfe_checks_calls) then raise exception 'N2-N4 gravou algo mesmo recusando'; end if;
  raise notice 'ok: N2-N4 validações sem gravar nada';

  r := public.bo_nfe_manual_check(inv, 'cancelled', 'Portal em 23/11, evento de cancelamento');
  if r->>'status' <> 'cancelled' or (select sefaz_status from public.invoices where id = inv) <> 'cancelled' then raise exception 'N5 conferência não gravada'; end if;
  if (select p->>'provider' from public.nfe_checks_calls) <> 'manual:Analista Exemplo' then raise exception 'N5 origem não marcada como manual'; end if;
  if (select count(*) from public.staff_log where action = 'nfe_manual_check' and staff = st) <> 1 then raise exception 'N5 sem log da equipe'; end if;
  raise notice 'ok: N5 conferência gravada, marcada como manual e registrada no log';

  if has_function_privilege('anon', 'public.bo_nfe_manual_check(uuid,text,text)', 'execute') then raise exception 'N6 anon executa'; end if;
  if not has_function_privilege('authenticated', 'public.bo_nfe_manual_check(uuid,text,text)', 'execute') then raise exception 'N6 sem grant para authenticated'; end if;
  raise notice 'ok: N6 grants corretos';
end $$;
