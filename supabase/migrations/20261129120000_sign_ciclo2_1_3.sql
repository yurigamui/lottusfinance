-- 20261129120000_sign_ciclo2_1_3.sql
-- Plataforma: Lottus Sign · ciclo 2 da seção 1.3 (pacote C2-13, itens de banco: M-01 e B-6/A13-B3)
-- Origem: docs/agente/sign/secao-1-2-recuperar-senha.md (AC-R1 e AC-R7) e docs/agente/sign/verificacao-1-3-ciclo-1.md
-- Estado: PRONTA, NÃO APLICADA. Testada só no Postgres local do Sign (scripts/sign-local). NADA foi aplicado em produção.
-- Depende de: 20261126120000, 20261127120000 e 20261128120000 já aplicadas (as duas funções públicas abaixo são redefinidas a partir da 20261128120000).
--
-- O que NÃO reverte:
--   NÃO REVERTE: dados já gravados. Nomes com caracteres invisíveis continuam como estão em profiles.full_name; só a conta passa a não os contar.
--   NÃO REVERTE: onboarding_done=true já gravado antes desta migração (por nome só de invisíveis) fica true; nada é desmarcado.
--   NÃO REVERTE: o 'code' removido do outbox (limpeza da purga) é irreversível; o conteúdo já limpo não volta.
--   NÃO REVERTE: linhas queued com mais de 1 dia já viradas para 'failed' pela purga não voltam a 'queued'.
--   NÃO REVERTE: os 2 índices parciais criados aqui (sign_outbox_code_idx, sign_outbox_queued_idx) ficam se não forem removidos à mão (reversão abaixo os remove).
--
-- O que faz
--   1. M-01: nome só com caracteres invisíveis (U+200B, U+200C, U+200D, U+2060, U+FEFF, U+00AD, U+180E) e espaços não conta como nome.
--      Internas novas _sign_name_visible(text) e _sign_name_ok(text); sign_me.profile_complete e sign_onboarding_done passam a usá-las.
--      _sign_name_norm (que também grava o nome) NÃO muda: nada do que já é gravado muda de forma.
--   2. B-6 / A13-B3: _sign_outbox_purge limpa 'code' de QUALQUER linha com mais de 15 min, em todos os estados e sem limite inferior de data;
--      queued com mais de 1 dia vira failed (sem 'code'). Nenhuma linha é apagada. Devolve a contagem de linhas alteradas (2ª execução: 0).
--      Dois índices parciais mantêm a purga barata sem o limite inferior de data.
--
-- Verificação 0, antes de aplicar em QUALQUER ambiente (só leitura):
--   select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = '_sign_mask_cpf_text';   -- 1 linha: a 20261128120000 está aplicada
--   select status, count(*) from public.sign_outbox where params ? 'code' group by 1;                     -- quantas linhas a purga vai limpar
--   select count(*) from public.sign_identity i join public.profiles p on p.id = i.user_id
--    where i.onboarding_done and public._sign_name_norm(p.full_name) ~ '^[​‌‍⁠﻿­᠎ ]*$';   -- contas já concluídas com nome vazio de verdade (não são desfeitas)
--
-- Como reverter (as duas funções públicas e a purga voltam à definição da 20261128120000; o resto da lista acima NÃO reverte)
--   1. ANTES de aplicar, salve as definições atuais FORA do repositório (público):
--        scripts/sign-local/gerar-reversao-c2-13.sh <banco> <arquivo fora do repo>   (as 3 funções alteradas: sign_me, sign_onboarding_done e _sign_outbox_purge)
--   2. Para reverter, execute esse arquivo e depois:
--        drop function if exists public._sign_name_ok(text);
--        drop function if exists public._sign_name_visible(text);
--        drop index if exists public.sign_outbox_code_idx;
--        drop index if exists public.sign_outbox_queued_idx;
--   Os grants das funções públicas continuam como estão (authenticated).
--
-- Idempotente: create or replace, create index if not exists e revoke/grant repetidos não mudam nada na 2ª execução.

-- ---------------------------------------------------------------------------------------------------------------------
-- Índices parciais (a purga sem limite inferior de data só olha o que ainda tem 'code' ou ainda está na fila)
-- ---------------------------------------------------------------------------------------------------------------------
create index if not exists sign_outbox_code_idx on public.sign_outbox (created_at) where params ? 'code';
create index if not exists sign_outbox_queued_idx on public.sign_outbox (created_at) where status = 'queued';

-- ---------------------------------------------------------------------------------------------------------------------
-- Internas (sem grant a ninguém além do dono)
-- ---------------------------------------------------------------------------------------------------------------------
-- M-01: nome como o usuário o vê: sem caracteres invisíveis, espaços colapsados e aparados. Só para MEDIR; nunca para gravar.
create or replace function public._sign_name_visible(p text)
returns text language sql immutable set search_path = ''
as $$ select btrim(regexp_replace(regexp_replace(coalesce(p, ''), '[​‌‍⁠﻿­᠎]', '', 'g'), '\s+', ' ', 'g')) $$;

-- M-01: nome completo = 3 a 140 caracteres visíveis e pelo menos 2 palavras (espaço interno depois de tirar os invisíveis)
create or replace function public._sign_name_ok(p text)
returns boolean language sql immutable set search_path = ''
as $$ select char_length(public._sign_name_visible(p)) between 3 and 140 and strpos(public._sign_name_visible(p), ' ') > 0 $$;

-- B-6 / A13-B3: purga. Nenhuma linha é apagada. (1) queued com mais de 1 dia vira failed, sem 'code'. (2) qualquer outra linha com mais de 15 min perde o 'code'.
create or replace function public._sign_outbox_purge()
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer; m integer;
begin
  update public.sign_outbox set status = 'failed', error = coalesce(error, 'expirado sem envio'), params = coalesce(params, '{}'::jsonb) - 'code'
   where status = 'queued' and created_at < now() - interval '1 day';
  get diagnostics n = row_count;
  update public.sign_outbox set params = params - 'code'
   where params ? 'code' and created_at < now() - interval '15 minutes';
  get diagnostics m = row_count;
  return n + m;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Públicas
-- ---------------------------------------------------------------------------------------------------------------------
-- M-01: único ponto novo é profile_complete (_sign_name_ok). Resto idêntico à 20261128120000.
create or replace function public.sign_me()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_email text := public._sign_me(); v_uid uuid := auth.uid(); i public.sign_identity; p public.profiles; u auth.users; c public.sign_messaging_config;
  v_cert boolean; v_valid boolean;
begin
  if v_email is null then raise exception 'email_not_confirmed'; end if;
  select * into i from public.sign_identity where user_id = v_uid;
  select * into p from public.profiles where id = v_uid;
  select * into u from auth.users where id = v_uid;
  select * into c from public.sign_messaging_config where id = 1;
  v_cert := i.cert_verified_at is not null and i.cert_chain_ok;           -- há certificado vinculado
  v_valid := v_cert and i.cert_not_after is not null and i.cert_not_after > now();  -- e ele ainda vale (RN9)
  return jsonb_build_object('email', v_email,
    'name', nullif(p.full_name, ''),
    'cpf', nullif(p.cpf, ''),
    'name_hint', nullif(left(public._sign_name_norm(u.raw_user_meta_data ->> 'name'), 140), ''),
    'phone', coalesce(i.phone, nullif(p.phone, '')),
    'phone_verified', i.phone_verified_at is not null, 'phone_verified_at', i.phone_verified_at,
    'contact_kind', case when i.phone_verified_at is null then null when i.phone_channel = 'email' then 'email' else 'phone' end,
    'cert', case when v_valid then jsonb_build_object('subject', public._sign_mask_cpf_text(i.cert_subject), 'issuer', i.cert_issuer, 'cpf', i.cert_cpf, 'cnpj', i.cert_cnpj, 'not_after', i.cert_not_after, 'verified_at', i.cert_verified_at, 'serial', i.cert_serial) end,
    'otp_retry_after', case when i.otp_locked_until > now() then greatest(1, ceil(extract(epoch from (i.otp_locked_until - now())))::integer) end,
    'cert_expired', (v_cert and not v_valid),
    'cert_expired_at', case when v_cert and not v_valid then i.cert_not_after end,
    'verified', (i.phone_verified_at is not null or v_valid),
    'onboarding_done', coalesce(i.onboarding_done, false),
    'channels', jsonb_build_object('email', true, 'sms', false, 'whatsapp', coalesce(c.whatsapp_enabled, false)),
    'cert_pending', (i.cert_verified_at is not null and not i.cert_chain_ok), 'companies', public._sign_companies_json(v_uid),
    'cpf_locked', public._sign_cpf_locked(v_uid),
    'profile_complete', (public._sign_name_ok(p.full_name) and public._cpf_ok(p.cpf)));
end $$;

-- M-01: o gate do servidor usa a mesma regra de nome. Resto idêntico à 20261128120000.
create or replace function public.sign_onboarding_done()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_email text := public._sign_me(); p public.profiles; i public.sign_identity; v_perfil boolean; v_ident boolean;
begin
  if v_uid is null or v_email is null then raise exception 'email_not_confirmed'; end if;
  select * into p from public.profiles where id = v_uid;
  select * into i from public.sign_identity where user_id = v_uid;
  v_perfil := coalesce(public._sign_name_ok(p.full_name) and public._cpf_ok(p.cpf), false);
  v_ident := coalesce(i.phone_verified_at is not null or (i.cert_verified_at is not null and i.cert_chain_ok and i.cert_not_after is not null and i.cert_not_after > now()), false);
  if not v_perfil or not v_ident then raise exception 'onboarding_incomplete'; end if;
  insert into public.sign_identity (user_id, onboarding_done) values (v_uid, true)
    on conflict (user_id) do update set onboarding_done = true, updated_at = now();
  return public.sign_me();
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permissões (explícitas, em todas as funções tocadas)
-- ---------------------------------------------------------------------------------------------------------------------
revoke all on function public.sign_me() from public, anon;
revoke all on function public.sign_onboarding_done() from public, anon;
grant execute on function public.sign_me() to authenticated;
grant execute on function public.sign_onboarding_done() to authenticated;
-- internas: sem grant
revoke all on function public._sign_name_visible(text) from public, anon, authenticated;
revoke all on function public._sign_name_ok(text) from public, anon, authenticated;
revoke all on function public._sign_outbox_purge() from public, anon, authenticated;
