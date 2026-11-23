-- 20261123121000_seguranca_rls_e_helpers_internos.sql
-- Plataforma: transversal (banco único) · Origem: auditoria de 23/11/2026 (docs/agente/repositorio/relatorio.md, S-DB-1 a S-DB-3)
-- Estado: PRONTA, NÃO APLICADA. Testar primeiro num branch do Supabase.
--
-- O que faz
--   S-DB-1 (W-016): liga a RLS em public.legacy_gl_lines, a única tabela de public/news sem RLS.
--          Não há grant para anon/authenticated nessa tabela, então nada muda para os apps; a RLS passa a
--          proteger também contra um grant acidental no futuro. O dono e o service_role continuam lendo.
--   S-DB-2: tira de anon (e de PUBLIC) a execução das funções auxiliares internas (prefixo _) que hoje
--          qualquer visitante pode chamar por /rest/v1/rpc/_... São 34 funções puras (SECURITY INVOKER,
--          formatação, validação, Pix). Nenhuma RPC pública, política de RLS ou tela chama essas funções
--          como anon (conferido em 23/11). authenticated e service_role mantêm a execução, com grant explícito,
--          para não quebrar funções INVOKER chamadas por usuários logados.
--   S-DB-3: fixa search_path vazio em news.log_forecast (alerta "function_search_path_mutable"). As duas funções
--          SQL apontadas pelo mesmo alerta ficam como estão, de propósito (ver o comentário do bloco).
--
-- Como reverter
--   alter table public.legacy_gl_lines disable row level security;
--   grant execute on function <cada uma abaixo> to public, anon;  revoke execute on function <cada uma> from service_role;   -- as 34 encontradas em produção em 23/11/2026:
--     public._acct_serie_label(text,text)
--     public._add_business_days(date,integer)
--     public._brl(numeric)
--     public._cnpj_ok(text)
--     public._crit_band_label(jsonb,text,jsonb)
--     public._crit_scores(jsonb,text,jsonb)
--     public._debtor_rating(text,text,date,boolean)
--     public._debtor_ratings()
--     public._doc_norm(text)
--     public._doc_store(text)
--     public._email_html(text,text[],text,text)
--     public._evidence_label(text)
--     public._fund_default_template(text)
--     public._html_escape(text)
--     public._ispb(text)
--     public._manual_pricing(text,numeric,numeric,jsonb,date)
--     public._money_br(numeric)
--     public._nfe_key_ok(text)
--     public._norm_line(jsonb)
--     public._pix_clean(text,integer)
--     public._pix_crc16(text)
--     public._pix_payload(text,text,text,numeric,text)
--     public._recurring_due(text,date,integer)
--     public._request_ip()
--     public._rules_text(jsonb)
--     public._sector_from_cnae(text)
--     public._sha256(text)
--     public._sign_mask_phone(text)
--     public._signature_statement(text,jsonb)
--     public._stage_label(text)
--     public._stmt_norm(text)
--     public._today_br()
--     public._trio_doc_slots(text)
--     public._uuid_list(jsonb)
--   alter function news.log_forecast() reset search_path;

begin;

-- S-DB-1
do $$ begin
  if to_regclass('public.legacy_gl_lines') is not null then
    execute 'alter table public.legacy_gl_lines enable row level security';
  end if;
end $$;

-- S-DB-2: lista fixa (a mesma da reversão), conferida em produção em 23/11/2026
do $$
declare f text; n int := 0;
begin
  foreach f in array array[
    'public._acct_serie_label(text, text)',
    'public._add_business_days(date, integer)',
    'public._brl(numeric)',
    'public._cnpj_ok(text)',
    'public._crit_band_label(jsonb, text, jsonb)',
    'public._crit_scores(jsonb, text, jsonb)',
    'public._debtor_rating(text, text, date, boolean)',
    'public._debtor_ratings()',
    'public._doc_norm(text)',
    'public._doc_store(text)',
    'public._email_html(text, text[], text, text)',
    'public._evidence_label(text)',
    'public._fund_default_template(text)',
    'public._html_escape(text)',
    'public._ispb(text)',
    'public._manual_pricing(text, numeric, numeric, jsonb, date)',
    'public._money_br(numeric)',
    'public._nfe_key_ok(text)',
    'public._norm_line(jsonb)',
    'public._pix_clean(text, integer)',
    'public._pix_crc16(text)',
    'public._pix_payload(text, text, text, numeric, text)',
    'public._recurring_due(text, date, integer)',
    'public._request_ip()',
    'public._rules_text(jsonb)',
    'public._sector_from_cnae(text)',
    'public._sha256(text)',
    'public._sign_mask_phone(text)',
    'public._signature_statement(text, jsonb)',
    'public._stage_label(text)',
    'public._stmt_norm(text)',
    'public._today_br()',
    'public._trio_doc_slots(text)',
    'public._uuid_list(jsonb)'
  ] loop
    if to_regprocedure(f) is null then continue; end if;
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
    n := n + 1;
  end loop;
  raise notice 'S-DB-2: % função(ões) auxiliares sem execução para anon', n;
end $$;

-- S-DB-3: só a função plpgsql. _one_period_add e _one_first_billing são SQL puras: com search_path fixo
-- o planejador deixa de "embutir" a função (medido: 19,8 ms -> 304 ms em 100 mil linhas) e o corpo delas
-- só usa funções do pg_catalog, então o alerta do Supabase fica aceito para as duas (decisoes.md).
do $$ begin
  if to_regprocedure('news.log_forecast()') is not null then
    alter function news.log_forecast() set search_path = '';
  end if;
end $$;

commit;
