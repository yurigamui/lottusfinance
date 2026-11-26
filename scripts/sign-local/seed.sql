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

\set pdf 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMTAwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA1MCA+PgpzdHJlYW0KQlQgL0YxIDEyIFRmIDIwIDUwIFRkIChEb2N1bWVudG8gZGUgZXhlbXBsbykgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzNDEgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0MTEKJSVFT0YK'
-- Envelope de exemplo criado pela RPC real: 2 signatários (Bruno e Carla), PDF mínimo válido (1 página).
select set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, false);
select public.sign_env_create(jsonb_build_object(
  'name', 'Contrato de exemplo', 'message', 'Documento fictício para teste local.', 'filename', 'exemplo.pdf', 'pdf_b64', :'pdf',
  'signers', jsonb_build_array(
    jsonb_build_object('name', 'Bruno Signatário Exemplo', 'email', 'bruno.sign@exemplo.com.br', 'cpf', '11144477735', 'role', 'Contratante'),
    jsonb_build_object('name', 'Carla Signatária Exemplo', 'email', 'carla.sign@exemplo.com.br', 'cpf', '39053344705', 'role', 'Testemunha')))) as envelope \gset
select set_config('request.jwt.claims', '', false);

-- ===== Seção 1.4 (Perfil e conta): usuários U1..U7 FICTÍCIOS, senha senha-correta-1 (a mesma do Auth falso em memória). CPFs válidos gerados por script. =====
-- U1 pronto: perfil completo, celular verificado, 0 envelopes. U2 outro: CPF diferente. U3 vazio: linha de profiles sem nome/CPF e metadado "malicioso".
-- U4 parceiro: CPF e nome do Partners/Wealth, vínculo em company_members e funder_members. U5: 1 envelope. U6: certificado verificado. U7: sem linha em profiles.
insert into auth.users (id, email, encrypted_password, phone, raw_user_meta_data) values
 ('f1000000-0000-4000-8000-000000000001', 'pronto@teste.example',   crypt('senha-correta-1', gen_salt('bf')), null, '{}'),
 ('f1000000-0000-4000-8000-000000000002', 'outro@teste.example',    crypt('senha-correta-1', gen_salt('bf')), null, '{}'),
 ('f1000000-0000-4000-8000-000000000003', 'vazio@teste.example',    crypt('senha-correta-1', gen_salt('bf')), null, '{"name":"Banco Falso S.A.","cpf":"11288006322","phone":"5511999990000"}'),
 ('f1000000-0000-4000-8000-000000000004', 'parceiro@teste.example', crypt('senha-correta-1', gen_salt('bf')), null, '{}'),
 ('f1000000-0000-4000-8000-000000000005', 'envelope@teste.example', crypt('senha-correta-1', gen_salt('bf')), null, '{"name":"Nome Do Metadado"}'),
 ('f1000000-0000-4000-8000-000000000006', 'cert@teste.example',     crypt('senha-correta-1', gen_salt('bf')), null, '{}'),
 ('f1000000-0000-4000-8000-000000000007', 'semlinha@teste.example', crypt('senha-correta-1', gen_salt('bf')), null, '{}');
insert into public.profiles (id, full_name, cpf, email, phone) values
 ('f1000000-0000-4000-8000-000000000001', 'Ana Exemplo da Silva',    '33698027089', 'pronto@teste.example',   null),
 ('f1000000-0000-4000-8000-000000000002', 'Bruno Outro Exemplo',     '98263630304', 'outro@teste.example',    null),
 ('f1000000-0000-4000-8000-000000000003', null,                      null,          'vazio@teste.example',    null),
 ('f1000000-0000-4000-8000-000000000004', 'Dora Parceira Exemplo',   '00488180031', 'parceiro@teste.example', '5511911112222'),
 ('f1000000-0000-4000-8000-000000000005', 'Edu Envelope Exemplo',    '79855663098', 'envelope@teste.example', null),
 ('f1000000-0000-4000-8000-000000000006', 'Fabi Certificada Exemplo','43966982080', 'cert@teste.example',     null);
insert into public.sign_identity (user_id, phone, phone_verified_at, phone_channel, onboarding_done, cert_serial, cert_subject, cert_issuer, cert_cpf, cert_not_before, cert_not_after, cert_verified_at, cert_chain_ok) values
 ('f1000000-0000-4000-8000-000000000001', '5511987651234', now(), 'email', true, null, null, null, null, null, null, null, false),
 ('f1000000-0000-4000-8000-000000000002', null, null, null, true, null, null, null, null, null, null, null, false),
 ('f1000000-0000-4000-8000-000000000003', null, null, null, true, null, null, null, null, null, null, null, false),
 ('f1000000-0000-4000-8000-000000000004', null, null, null, true, null, null, null, null, null, null, null, false),
 ('f1000000-0000-4000-8000-000000000005', '5511955554444', now(), 'email', true, null, null, null, null, null, null, null, false),
 ('f1000000-0000-4000-8000-000000000006', null, null, null, true, '0A1B', 'CN=Fabi Exemplo', 'AC Exemplo', '43966982080', now() - interval '30 days', now() + interval '300 days', now(), true),
 ('f1000000-0000-4000-8000-000000000007', null, null, null, true, null, null, null, null, null, null, null, false);
insert into public.companies (id, cnpj, legal_name) values ('c0000000-0000-4000-8000-000000000001', '11222333000181', 'Empresa Exemplo Ltda');
insert into public.company_members (company_id, user_id, access, role) values ('c0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000004', 'admin', 'owner');
insert into public.funders (id, trade_name, legal_name) values ('d0000000-0000-4000-8000-000000000001', 'Fundo Exemplo', 'Fundo Exemplo S.A.');
insert into public.funder_members (funder_id, user_id, name, cpf, email) values ('d0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000004', 'Dora Parceira Exemplo', '00488180031', 'parceiro@teste.example');
-- U5: um envelope criado pela RPC real (o nome do remetente na evidência vem de profiles: R3)
select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-8000-000000000005', 'role', 'authenticated')::text, false);
select public.sign_env_create(jsonb_build_object('name', 'Contrato do U5', 'filename', 'u5.pdf', 'pdf_b64', :'pdf',
  'signers', jsonb_build_array(jsonb_build_object('name', 'Bruno Signatário Exemplo', 'email', 'bruno.sign@exemplo.com.br', 'cpf', '11144477735', 'role', 'Contratante')))) as envelope_u5 \gset
select set_config('request.jwt.claims', '', false);
