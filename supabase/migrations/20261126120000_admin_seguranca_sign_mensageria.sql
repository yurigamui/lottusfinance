-- 20261126120000_admin_seguranca_sign_mensageria.sql
-- Plataforma: Admin / Sign (banco único) · Origem: leitura somente-leitura da produção em 26/11/2026
-- Estado: PRONTA, NÃO APLICADA. Testar primeiro num branch do Supabase.
--
-- O que faz
--   As funções de escrita public.sign_messaging_save(p jsonb), public.sign_root_add(p_name, p_pem) e
--   public.sign_root_toggle(p_id, p_active) são SECURITY DEFINER e só conferem public.is_staff() (qualquer nível,
--   sem MFA, sem log). Um analista consegue gravar o token do WhatsApp (Vault) e as raízes de confiança dos
--   certificados do Sign. Esta migração, para cada uma das 3:
--     1. renomeia a original para _<nome>_impl (mesmos argumentos; o corpo de produção não é copiado nem alterado);
--     2. tira a execução da impl de public/anon/authenticated (interna: só service_role e as novas funções);
--     3. recria a função pública com a MESMA assinatura e retorno jsonb: exige public._staff('admin') (nível admin
--        + MFA, como as demais RPCs bo_ de escrita), chama a impl, grava public._staff_log (SEM o token nem o PEM:
--        só o nome da raiz, o id e os NOMES dos campos enviados) e devolve o resultado.
--   sign_messaging_get e sign_roots_list (leitura) não mudam.
--
-- Por quê: escrita de segredo e de cadeia de confiança precisa de nível admin, MFA e trilha de auditoria.
--
-- ANTES DE APLICAR
--   - Conferir em produção que as 3 funções existem, retornam jsonb e que nenhuma outra função/trigger/cron as chama
--     por dentro (select proname from pg_proc where prosrc ~ 'sign_(messaging_save|root_add|root_toggle)').
--     Se alguma retornar outro tipo (ex.: void), ajustar o "returns jsonb" antes. Os tipos dos argumentos são lidos
--     do próprio banco (nada é presumido aqui).
--   - Quem usa a tela Mensageria precisa ser staff nível admin com MFA; analista e aprovador passam a receber
--     "insufficient_level" (a tela mostra o erro pelo fail() padrão).
--   - Rodar num branch do Supabase e repetir a migração uma segunda vez (é idempotente).
--
-- Como reverter (num único bloco; conferir os argumentos com \df public.sign_*)
--   drop function public.sign_messaging_save(jsonb);
--   alter function public._sign_messaging_save_impl(jsonb) rename to sign_messaging_save;
--   (idem sign_root_add e sign_root_toggle, com os argumentos reais)
--   grant execute on function <cada original> to authenticated;   -- como estava antes

begin;

do $$
declare
  spec constant text[][] := array[
    -- nome,               ação do log,                 entidade,         expressão do id (text),   expressão dos detalhes (jsonb, sem segredo)
    ['sign_messaging_save', 'sign_messaging_save',      'sign_messaging', 'null::text',             $d$jsonb_build_object('campos', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(p) k), '[]'::jsonb))$d$],
    ['sign_root_add',       'sign_root_add',            'sign_root',      'null::text',             $d$jsonb_build_object('nome', p_name)$d$],
    ['sign_root_toggle',    'sign_root_toggle',         'sign_root',      'p_id::text',             $d$jsonb_build_object('ativo', p_active)$d$]
  ];
  i int; n text; impl text; o oid; args text; callargs text; ident text;
begin
  for i in 1 .. array_length(spec, 1) loop
    n := spec[i][1]; impl := '_' || n || '_impl';

    -- 1. renomeia só se a impl ainda não existe
    select p.oid into o from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = impl;
    if o is null then
      select p.oid into o from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = n;
      if o is null then raise exception 'função public.% não encontrada (nem a impl): migração não aplicável', n; end if;
      ident := pg_get_function_identity_arguments(o);
      execute format('alter function public.%I(%s) rename to %I', n, ident, impl);
      select p.oid into o from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = impl;
    end if;

    ident := pg_get_function_identity_arguments(o);
    args  := pg_get_function_arguments(o);
    select string_agg(format('%1$I => %1$I', a), ', ' order by ord) into callargs
      from unnest((select proargnames from pg_proc where oid = o)) with ordinality t(a, ord);

    -- 2. impl interna
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated', impl, ident);
    execute format('grant execute on function public.%I(%s) to service_role', impl, ident);

    -- 3. função pública com a mesma assinatura (create or replace: tolera rodar 2x)
    execute format($f$
      create or replace function public.%1$I(%2$s) returns jsonb
      language plpgsql security definer set search_path = '' as $b$
      declare s public.staff_users; r jsonb;
      begin
        s := public._staff('admin');
        r := public.%3$I(%4$s);
        perform public._staff_log(s, %5$L, %6$L, %7$s, null, %8$s);
        return r;
      end $b$
    $f$, n, args, impl, callargs, spec[i][2], spec[i][3], spec[i][4], spec[i][5]);
    execute format('revoke all on function public.%I(%s) from public, anon', n, ident);
    execute format('grant execute on function public.%I(%s) to authenticated', n, ident);
  end loop;
end $$;

commit;
