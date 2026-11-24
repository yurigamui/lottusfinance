-- Prova do Sign local: chama as RPCs como authenticated / anon (como o PostgREST faz). Só dados fictícios do seed.sql.
-- Uso: psql -X -h 127.0.0.1 -p 54350 -U postgres -d sign -f prova.sql
\set ON_ERROR_STOP off
\pset pager off
\pset tuples_only on
\pset format unaligned
\echo '== (a) authenticated: Ana'
\set ana '''a1000000-0000-4000-8000-000000000001'''
select set_config('request.jwt.claims', json_build_object('sub', :ana, 'role', 'authenticated')::text, false) \g /dev/null
set role authenticated;
\echo '-- sign_me'
select jsonb_pretty(public.sign_me() - 'companies');
\echo '-- sign_env_create (1 signatario: Davi, PDF minimo)'
select public.sign_env_create(jsonb_build_object('name', 'Termo de teste', 'filename', 'termo.pdf',
  'pdf_b64', 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMTAwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA1MCA+PgpzdHJlYW0KQlQgL0YxIDEyIFRmIDIwIDUwIFRkIChEb2N1bWVudG8gZGUgZXhlbXBsbykgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzNDEgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0MTEKJSVFT0YK',
  'signers', jsonb_build_array(jsonb_build_object('name', 'Davi Signatario Exemplo', 'email', 'davi.sign@exemplo.com.br', 'cpf', '76321894087')))) as novo \gset
select :'novo'::jsonb ->> 'id' as envid \gset
\echo '-- sign_env_list (nomes/status/n signatarios)'
select string_agg(format('%s | %s | %s signatario(s)', e->>'name', e->>'status', jsonb_array_length(e->'signers')), E'\n') from jsonb_array_elements(public.sign_env_list()) e;
\echo '-- sign_env_get (sem pdf; signatarios e eventos)'
select jsonb_pretty((public.sign_env_get(:'envid'::uuid)) - 'message');
\echo '-- isolamento: Davi tenta ler o envelope da Ana'
select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-8000-000000000004', 'role', 'authenticated')::text, false) \g /dev/null
select public.sign_env_get(:'envid'::uuid);
\echo '-- Davi sem telefone verificado tenta criar envelope'
select public.sign_env_create('{"name":"x"}'::jsonb);
reset role;

\echo
\echo '== (b) anon: link publico do signatario'
select (regexp_match(body->>'HtmlBody', 'assinar\.html\?t=(env_[0-9a-f]+)'))[1] as tok
  from net.http_calls where body->>'To' = 'davi.sign@exemplo.com.br' order by id desc limit 1 \gset
select (:'tok' <> '') as token_extraido_do_email_stub;
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.9, 10.0.0.1","user-agent":"prova-local/1.0"}', false) \g /dev/null
set role anon;
\echo '-- sign_env_public_get com token errado'
select public.sign_env_public_get('env_invalido');
\echo '-- sign_env_public_get com token certo (pdf_b64 omitido na saida)'
select jsonb_pretty(public.sign_env_public_get(:'tok') - 'pdf_b64');
\echo '-- submit com CPF ERRADO (1a tentativa)'
select public.sign_env_public_submit(:'tok', '111.444.777-35', true);
\echo '-- submit sem aceitar'
select public.sign_env_public_submit(:'tok', '763.218.940-87', false);
\echo '-- submit com CPF CERTO'
select public.sign_env_public_submit(:'tok', '763.218.940-87', true);
\echo '-- submit de novo (token ja consumido)'
select public.sign_env_public_submit(:'tok', '763.218.940-87', true);

\echo
\echo '== (c) verify_envelope (anon)'
reset role;
select left(sha256, 24) as code from public.sign_envelopes where id = :'envid'::uuid \gset
set role anon;
select jsonb_pretty(public.verify_envelope(:'code'));
\echo '-- verify_envelope_pdf com CPF de outra pessoa'
select public.verify_envelope_pdf(:'code', '52998224725');
\echo '-- verify_envelope_pdf com CPF do signatario (pdf omitido)'
select jsonb_pretty(public.verify_envelope_pdf(:'code', '76321894087') - 'pdf_b64');
\echo '-- verify_envelope com codigo curto'
select public.verify_envelope('abc');

\echo
\echo '== (d) anon NAO executa funcoes autenticadas'
select public.sign_env_create('{"name":"x"}'::jsonb);
select public.sign_me();
select public.sign_env_list();
select public._senv_event(gen_random_uuid(), null, 'x', '{}');
\echo '-- anon le tabela direto'
select count(*) from public.sign_envelopes;
select count(*) from public.sign_env_signers;
reset role;
set role authenticated;
\echo '-- authenticated le tabela direto (RLS+sem grant)'
select count(*) from public.sign_envelopes;
select public._sha256('x') is not null as helper_publico_ok;
reset role;
\echo
\echo '== (e) conclusao, tentativas, cancelamento'
\echo '-- apos a assinatura do Davi o envelope fecha? (esperado: completed, 1 evidencia de assinatura)'
select e.status, e.completed_at is not null as completo, (select count(*) from public.sign_env_events v where v.envelope_id = e.id and v.kind = 'completed') as evento_completed
  from public.sign_envelopes e where e.id = :'envid'::uuid;
set role anon;
select (public.verify_envelope(:'code') ->> 'complete') as verify_complete;
reset role;
\echo '-- Bruno (envelope de 2 signatarios): 5 CPFs errados e depois o certo'
select (regexp_match(body->>'HtmlBody', 'assinar\.html\?t=(env_[0-9a-f]+)'))[1] as btok from net.http_calls where body->>'To' = 'bruno.sign@exemplo.com.br' order by id desc limit 1 \gset
set role anon;
select public.sign_env_public_submit(:'btok', '529.982.247-25', true) from generate_series(1, 5);
select public.sign_env_public_submit(:'btok', '111.444.777-35', true);
reset role;
\echo '-- Carla: pega o proprio link logada (sign_env_my_link) e assina; Davi (outro usuario) nao consegue o link dela'
select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-4000-8000-000000000003', 'role', 'authenticated')::text, false) \g /dev/null
set role authenticated;
select jsonb_array_length(public.sign_env_inbox()) as itens_na_caixa_da_carla;
select (public.sign_env_inbox() -> 0 ->> 'id') as csid \gset
select (public.sign_env_my_link(:'csid'::uuid) ->> 'token') as ctok \gset
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-8000-000000000004', 'role', 'authenticated')::text, false) \g /dev/null
set role authenticated;
select public.sign_env_my_link(:'csid'::uuid);
reset role;
set role anon;
select public.sign_env_public_submit(:'ctok', '390.533.447-05', true);
reset role;
\echo '-- Ana tenta cancelar o envelope ja concluido e lembrar signatario inexistente'
select set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, false) \g /dev/null
set role authenticated;
select public.sign_env_cancel(:'envid'::uuid);
select public.sign_env_remind(gen_random_uuid());
reset role;
\echo '-- cadeia de eventos do envelope (hash encadeado) conferida no servidor'
select count(*) filter (where prev_hash is distinct from lag_hash) as elos_quebrados
  from (select envelope_id, prev_hash, lag(hash) over (partition by envelope_id order by id) lag_hash from public.sign_env_events) x;
\echo
\echo '== (f) telefone (OTP), contatos, plano'
select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-8000-000000000004', 'role', 'authenticated')::text, false) \g /dev/null
set role authenticated;
\echo '-- Davi: telefone invalido, depois valido (sign_phone_send)'
select public.sign_phone_send('123', 'sms');
select public.sign_phone_send('(11) 98888-7777', 'sms');
select public.sign_phone_send('(11) 98888-7777', 'sms');
select public.sign_phone_send('(11) 98888-7777', 'whatsapp');
reset role;
select (params ->> 'code') as otp from public.sign_outbox where user_id = 'd1000000-0000-4000-8000-000000000004' order by id desc limit 1 \gset
set role authenticated;
\echo '-- codigo errado, depois o certo (sign_phone_verify)'
select public.sign_phone_verify('000000');
select (public.sign_phone_verify(:'otp') ->> 'phone_verified') as telefone_verificado;
\echo '-- contatos'
select public.sign_contact_save('{"name":"Contato Exemplo","email":"contato@exemplo.com.br","cpf":"390.533.447-05"}'::jsonb);
select public.sign_contact_save('{"name":"Ruim","email":"nao-e-email"}'::jsonb);
\echo '-- plano'
select jsonb_pretty(public.sign_plan_state() #- '{history}');
reset role;
\echo
\echo '== estado final'
select e.name, e.status, e.completed_at is not null as completo, (select count(*) from public.sign_env_events v where v.envelope_id = e.id) as eventos from public.sign_envelopes e order by created_at;
select kind, recipient, status from public.email_log order by created_at;
