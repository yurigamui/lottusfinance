-- Dados FICTÍCIOS para testar o Sign localmente (nomes, CPFs e e-mails de exemplo; senha de todos: senha-exemplo-1).
-- Os planos abaixo são inventados só para o ambiente local; não refletem os planos reais.
\set ON_ERROR_STOP on
set search_path = public, extensions;
insert into public.sign_plans (code, name, price_month, docs_included, extra_doc_price, sort) values
 ('free', 'Gratuito (exemplo)', 0, 5, null, 1),
 ('pro', 'Profissional (exemplo)', 10, 50, 1, 2);
insert into public.sign_messaging_config (id) values (1);
insert into auth.users (id, email, encrypted_password) values
 ('a1000000-0000-4000-8000-000000000001', 'ana.sign@exemplo.com.br',   crypt('senha-exemplo-1', gen_salt('bf'))),
 ('b1000000-0000-4000-8000-000000000002', 'bruno.sign@exemplo.com.br', crypt('senha-exemplo-1', gen_salt('bf'))),
 ('c1000000-0000-4000-8000-000000000003', 'carla.sign@exemplo.com.br', crypt('senha-exemplo-1', gen_salt('bf'))),
 ('d1000000-0000-4000-8000-000000000004', 'davi.sign@exemplo.com.br',  crypt('senha-exemplo-1', gen_salt('bf')));
insert into public.profiles (id, full_name, cpf, email) values
 ('a1000000-0000-4000-8000-000000000001', 'Ana Remetente Exemplo', '52998224725', 'ana.sign@exemplo.com.br'),
 ('d1000000-0000-4000-8000-000000000004', 'Davi Sem Acesso Exemplo', '76321894087', 'davi.sign@exemplo.com.br');
-- Ana: telefone verificado (sem isso sign_env_create responde identity_required). Davi: sem verificação.
insert into public.sign_identity (user_id, phone, phone_verified_at, phone_channel, onboarding_done)
 values ('a1000000-0000-4000-8000-000000000001', '5511900000001', now(), 'sms', true);

-- Envelope de exemplo criado pela RPC real: 2 signatários (Bruno e Carla), PDF mínimo válido (1 página).
select set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, false);
select public.sign_env_create(jsonb_build_object(
  'name', 'Contrato de exemplo', 'message', 'Documento fictício para teste local.', 'filename', 'exemplo.pdf', 'pdf_b64', 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMTAwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA1MCA+PgpzdHJlYW0KQlQgL0YxIDEyIFRmIDIwIDUwIFRkIChEb2N1bWVudG8gZGUgZXhlbXBsbykgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzNDEgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0MTEKJSVFT0YK',
  'signers', jsonb_build_array(
    jsonb_build_object('name', 'Bruno Signatário Exemplo', 'email', 'bruno.sign@exemplo.com.br', 'cpf', '11144477735', 'role', 'Contratante'),
    jsonb_build_object('name', 'Carla Signatária Exemplo', 'email', 'carla.sign@exemplo.com.br', 'cpf', '39053344705', 'role', 'Testemunha')))) as envelope \gset
select set_config('request.jwt.claims', '', false);
