-- 20261128120000_sign_onboarding_e_ciclo2_1_5.sql
-- Plataforma: Lottus Sign · seção 1.3 (Onboarding) + pacote ciclo 2 da 1.5 (C2-15)
-- Origem: docs/agente/sign/secao-1-3-onboarding.md (RN-OB7, seção 9) e docs/agente/sign/verificacao-1-5-ciclo-1.md
-- Estado: PRONTA, NÃO APLICADA. Testada só no Postgres local do Sign (scripts/sign-local). NADA foi aplicado em produção.
-- Depende de: 20261126120000_sign_perfil_fonte_unica.sql e 20261127120000_sign_verificacao_identidade.sql já aplicadas.
--
-- O que NÃO reverte (A15-N; vale também para a 20261127120000, cujos efeitos esta migração não desfaz):
--   NÃO REVERTE: a restrição sign_outbox_channel_check foi recriada pela 1.5 com 'email'; voltar ao par sms/whatsapp só com NOT VALID (existem linhas email).
--   NÃO REVERTE: as colunas sign_identity.otp_locked_until e sign_cert_challenges.bound_at (e o índice sign_outbox_created_at_idx) ficam; são inofensivas, drop só manual.
--   NÃO REVERTE: os revokes de tabela (sign_otps, sign_outbox, sign_cert_challenges, sign_cpf_attempts): reabrir acesso direto às tabelas é decisão de segurança, não de reversão.
--   NÃO REVERTE: a remoção do campo 'code' de params em sign_outbox (limpeza única, gatilho e purga) é IRREVERSÍVEL; o conteúdo já limpo não volta.
--   NÃO REVERTE: OTPs em voo (códigos enviados e ainda não digitados) deixam de valer na troca de hash (1.5); com esta migração, desafios de certificado em voo (5 min) também.
--   NÃO REVERTE: o agendamento de purga some só com select cron.unschedule('lottus-sign-outbox-purge'); linhas queued > 1 dia já viradas para failed não voltam a queued.
--
-- O que faz
--   1. RN-OB7: sign_onboarding_done exige perfil completo (nome 2+ palavras, CPF válido) e identidade verificada (celular/e-mail verificado ou certificado
--      válido, a mesma conta de sign_me.verified); senão 'onboarding_incomplete'. Mantém email_not_confirmed e devolve sign_me(). Idempotente.
--   2. A15-M1: _sign_cpf_guarded_apply abre com pg_advisory_xact_lock por usuário antes de contar: 40 sessões simultâneas deixam de furar o limite de 5.
--   3. A15-M2: _sign_outbox_purge também encerra queued com mais de 1 dia (status failed, sem 'code') e usa índice; agendamento a cada 15 min só se
--      houver pg_cron (bloco condicional e idempotente). Sem pg_cron nada acontece e o arquivo roda sem erro.
--   4. A15-B2: ordem única de locks profiles -> sign_identity em sign_phone_verify (o gatilho de RN7 em profiles já segura profiles e depois toca sign_identity).
--   5. V6-03: sign_phone_send NÃO altera mais phone, phone_verified_at nem phone_channel (só cria OTP e outbox). A verificação existente só passa ao
--      novo contato quando ele é confirmado em sign_phone_verify. O gatilho em profiles (telefone mudou fora do Sign) continua derrubando a verificação
--      por celular (A15-B3, documentar no Release).
--   6. V6-05: sign_me mascara o CPF dentro de cert.subject ('•••.456.789-••'); _sign_mask_cpf_text é interna.
--   7. V6-08: texto do desafio do certificado com acentos ('vínculo', 'Código'), em sign_cert_challenge E em _sign_cert_take (a função de borda recebe o
--      texto a verificar de _sign_cert_take; os dois precisam ser idênticos). ATENÇÃO: a função de borda (T-07, fora do repositório) não pode ter o texto fixo.
--   8. V6-09: índice sign_outbox_created_at_idx.
--   sign_me já devolve contact_kind desde a 1.5 (conferido); aqui só a máscara do titular muda.
--
-- Verificação 0, antes de aplicar em QUALQUER ambiente (só leitura):
--   -- (a) as migrações anteriores estão aplicadas (esperado: 1 linha cada):
--   select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = '_sign_profile_apply';
--   select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = '_sign_cpf_guarded_apply';
--   -- (b) pg_cron instalado? (0 linhas = o agendamento é ignorado, sem erro):
--   select extname from pg_extension where extname = 'pg_cron';
--   -- (c) a função de borda do certificado não fixa o texto do desafio (conferir no código dela; não está neste repositório).
--   -- (d) contas já com onboarding_done=true mas sem perfil completo/identidade (continuam com done=true; só o gate novo vale daqui em diante):
--   select count(*) from public.sign_identity i left join public.profiles p on p.id = i.user_id where i.onboarding_done and (p.cpf is null or p.full_name is null);
--
-- Como reverter (as funções voltam à definição anterior; o resto da lista acima NÃO reverte)
--   1. ANTES de aplicar, salve as definições atuais FORA do repositório (público):
--        scripts/sign-local/gerar-reversao-1-3.sh <banco> <arquivo fora do repo>   (pg_get_functiondef das 8 funções alteradas + drops)
--   2. Para reverter, execute esse arquivo. Ele recria as 8 funções antigas e remove o que esta migração criou:
--        drop function if exists public._sign_mask_cpf_text(text);
--        drop index if exists public.sign_outbox_created_at_idx;
--        select cron.unschedule('lottus-sign-outbox-purge');   -- só se pg_cron existir e o job existir
--   Os grants das funções públicas continuam como estão (authenticated).
--
-- Idempotente: create or replace, create index if not exists, revoke/grant repetidos e o bloco do cron não mudam nada na 2ª execução (1 job).

-- ---------------------------------------------------------------------------------------------------------------------
-- V6-09 índice (a purga filtra por created_at)
-- ---------------------------------------------------------------------------------------------------------------------
create index if not exists sign_outbox_created_at_idx on public.sign_outbox (created_at);

-- ---------------------------------------------------------------------------------------------------------------------
-- Internas (sem grant a ninguém além do dono)
-- ---------------------------------------------------------------------------------------------------------------------
-- V6-05: troca sequências de 11 dígitos (CPF, com ou sem pontuação) por '•••.456.789-••'. Não mexe em CNPJ (14 dígitos).
create or replace function public._sign_mask_cpf_text(p text)
returns text language sql immutable set search_path = ''
as $$ select regexp_replace(p, '(?<!\d)\d{3}\.?(\d{3})\.?(\d{3})-?\d{2}(?!\d)', '•••.\1.\2-••', 'g') $$;

-- A15-M2: purga. 'code' só existe enquanto queued (o gatilho tira nos demais estados); aqui: queued com mais de 1 dia (até 30 dias atrás) vira
-- failed e perde o código; queued com 15 min a 1 dia perde o código. As duas faixas são limitadas por created_at para usar o índice
-- sign_outbox_created_at_idx sem varrer o histórico inteiro (o que for mais velho que 30 dias é tratado uma vez, logo abaixo). Nenhuma linha é apagada.
create or replace function public._sign_outbox_purge()
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer; m integer;
begin
  update public.sign_outbox set status = 'failed', error = coalesce(error, 'expirado sem envio'), params = params - 'code'
   where status = 'queued' and created_at < now() - interval '1 day' and created_at >= now() - interval '30 days';
  get diagnostics n = row_count;
  update public.sign_outbox set params = params - 'code'
   where params ? 'code' and created_at < now() - interval '15 minutes' and created_at >= now() - interval '1 day';
  get diagnostics m = row_count;
  return n + m;
end $$;

-- limpeza única: queued com mais de 30 dias (fora da faixa da purga) também encerra e perde o código. Na 2ª execução não encontra nada.
update public.sign_outbox set status = 'failed', error = coalesce(error, 'expirado sem envio'), params = params - 'code'
 where status = 'queued' and created_at < now() - interval '30 days';

-- A15-M1: aplica nome/CPF com limite de tentativas. O lock por usuário serializa as chamadas simultâneas ANTES de contar.
create or replace function public._sign_cpf_guarded_apply(p_uid uuid, p_email text, p_name text, p_cpf text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_given boolean := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') <> ''; v_n integer; v_at timestamptz; v_err text;
begin
  if v_given then
    perform pg_advisory_xact_lock(hashtextextended('cpf_guard:' || p_uid::text, 0));
    delete from public.sign_cpf_attempts where user_id = p_uid and at < now() - interval '1 day';
    select count(*) into v_n from public.sign_cpf_attempts where user_id = p_uid and at > now() - interval '1 hour';
    if v_n >= 5 then
      select at into v_at from public.sign_cpf_attempts where user_id = p_uid and at > now() - interval '1 hour' order by at desc offset 4 limit 1;
      return jsonb_build_object('ok', false, 'error', 'too_many_attempts', 'retry_after', greatest(1, ceil(extract(epoch from (v_at + interval '1 hour' - now())))::integer));
    end if;
  end if;
  begin
    perform public._sign_profile_apply(p_uid, p_email, p_name, p_cpf);
    return null;
  exception when others then
    v_err := sqlerrm;
    if v_err not in ('cpf_in_use', 'invalid_cpf', 'cpf_locked') then raise; end if;
  end;
  if v_given then insert into public.sign_cpf_attempts (user_id) values (p_uid); end if;   -- só conta quando um CPF foi enviado
  return jsonb_build_object('ok', false, 'error', v_err);
end $$;

-- V6-08: o texto assinado pelo usuário e o texto conferido pela função de borda saem do mesmo lugar e têm de ser iguais
create or replace function public._sign_cert_take(p_uid uuid, p_nonce text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare c public.sign_cert_challenges;
begin
  select * into c from public.sign_cert_challenges where nonce = p_nonce and user_id = p_uid and used_at is null and expires_at > now() for update;
  if not found then return null; end if;
  update public.sign_cert_challenges set used_at = now() where nonce = p_nonce;
  return jsonb_build_object('text', 'Lottus Sign - vínculo de certificado digital. Código: ' || p_nonce,
    'roots', coalesce((select jsonb_agg(pem) from public.sign_trusted_roots where active), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Públicas
-- ---------------------------------------------------------------------------------------------------------------------
-- V6-05: único ponto novo é a máscara do titular. Resto idêntico à 20261127120000.
create or replace function public.sign_me()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_email text := public._sign_me(); v_uid uuid := auth.uid(); i public.sign_identity; p public.profiles; u auth.users; c public.sign_messaging_config; v_n text;
  v_cert boolean; v_valid boolean;
begin
  if v_email is null then raise exception 'email_not_confirmed'; end if;
  select * into i from public.sign_identity where user_id = v_uid;
  select * into p from public.profiles where id = v_uid;
  select * into u from auth.users where id = v_uid;
  select * into c from public.sign_messaging_config where id = 1;
  v_n := public._sign_name_norm(p.full_name);
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
    'profile_complete', (char_length(v_n) between 3 and 140 and strpos(v_n, ' ') > 0 and public._cpf_ok(p.cpf)));
end $$;

-- RN-OB7: o servidor decide. Só usa auth.uid() (nada vem do cliente). Perfil completo e identidade verificada, como em sign_me.
create or replace function public.sign_onboarding_done()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_email text := public._sign_me(); p public.profiles; i public.sign_identity; v_n text; v_perfil boolean; v_ident boolean;
begin
  if v_uid is null or v_email is null then raise exception 'email_not_confirmed'; end if;
  select * into p from public.profiles where id = v_uid;
  select * into i from public.sign_identity where user_id = v_uid;
  v_n := public._sign_name_norm(p.full_name);
  v_perfil := coalesce(char_length(v_n) between 3 and 140 and strpos(v_n, ' ') > 0 and public._cpf_ok(p.cpf), false);
  v_ident := coalesce(i.phone_verified_at is not null or (i.cert_verified_at is not null and i.cert_chain_ok and i.cert_not_after is not null and i.cert_not_after > now()), false);
  if not v_perfil or not v_ident then raise exception 'onboarding_incomplete'; end if;
  insert into public.sign_identity (user_id, onboarding_done) values (v_uid, true)
    on conflict (user_id) do update set onboarding_done = true, updated_at = now();
  return public.sign_me();
end $$;

-- V6-03: o envio do código não mexe na verificação existente. Resto idêntico à 20261127120000.
create or replace function public.sign_phone_send(p_phone text, p_channel text default 'email')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_email text := public._sign_me(); v_ch text := lower(btrim(coalesce(p_channel, 'email')));
  v_ph text := public._sign_phone_norm(p_phone); v_dest text; cfg public.sign_messaging_config; i public.sign_identity;
  v_code text; v_oid uuid := gen_random_uuid(); v_n integer; v_at timestamptz; v_ob bigint;
begin
  if v_uid is null or v_email is null then raise exception 'email_not_confirmed'; end if;
  if v_ch not in ('email', 'whatsapp') then raise exception 'invalid_channel'; end if;
  select * into cfg from public.sign_messaging_config where id = 1;
  if v_ch = 'whatsapp' then
    if not coalesce(cfg.whatsapp_enabled, false) then return jsonb_build_object('ok', false, 'error', 'channel_unavailable'); end if;
    if v_ph is null or v_ph !~ '^55[1-9][0-9][2-9][0-9]{7,8}$' then raise exception 'invalid_input'; end if;
  end if;
  v_dest := case when v_ch = 'email' then v_email else v_ph end;
  -- uma linha de identidade por usuário; trava a linha para os limites valerem sob chamadas simultâneas
  insert into public.sign_identity (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into i from public.sign_identity where user_id = v_uid for update;
  if i.otp_locked_until is not null and i.otp_locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'otp_locked', 'retry_after', greatest(1, ceil(extract(epoch from (i.otp_locked_until - now())))::integer));
  end if;
  if v_ch = 'whatsapp' and exists (select 1 from public.sign_identity x where x.phone = v_ph and x.phone_verified_at is not null and x.user_id <> v_uid) then
    return jsonb_build_object('ok', false, 'error', 'phone_in_use');
  end if;
  select count(*) into v_n from public.sign_otps where user_id = v_uid and created_at > now() - interval '1 hour';
  if v_n >= 3 then
    select created_at into v_at from public.sign_otps where user_id = v_uid and created_at > now() - interval '1 hour' order by created_at desc offset 2 limit 1;
    return jsonb_build_object('ok', false, 'error', 'too_many', 'retry_after', greatest(1, ceil(extract(epoch from (v_at + interval '1 hour' - now())))::integer));
  end if;
  select max(created_at) into v_at from public.sign_otps where user_id = v_uid and created_at > now() - interval '30 seconds';
  if v_at is not null then
    return jsonb_build_object('ok', false, 'error', 'too_soon', 'retry_after', greatest(1, ceil(extract(epoch from (v_at + interval '30 seconds' - now())))::integer));
  end if;
  -- V6-03: nada em sign_identity (phone, phone_verified_at, phone_channel) muda aqui; só vale o novo contato depois de confirmado
  update public.sign_otps set consumed_at = now() where user_id = v_uid and consumed_at is null;
  v_code := lpad((abs(('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into public.sign_otps (id, user_id, purpose, channel, destination, code_hash, expires_at)
    values (v_oid, v_uid, 'phone_verify', v_ch, v_dest, encode(extensions.digest(v_code || ':' || v_uid::text || ':' || v_oid::text, 'sha256'), 'hex'), now() + interval '10 minutes');
  insert into public.sign_outbox (user_id, channel, destination, template, params)
    values (v_uid, v_ch, v_dest, 'otp', jsonb_build_object('code', v_code, 'minutes', 10, 'otp_id', v_oid)) returning id into v_ob;
  perform public._call_function('sign-messenger', jsonb_build_object('outbox_id', v_ob));
  -- no 3º envio da hora, informa quando o limite libera (o mais antigo dos 3 sai da janela)
  if v_n + 1 >= 3 then
    select created_at into v_at from public.sign_otps where user_id = v_uid and created_at > now() - interval '1 hour' order by created_at desc offset 2 limit 1;
  else v_at := null; end if;
  return jsonb_build_object('ok', true, 'channel', v_ch, 'to', case when v_ch = 'email' then public._sign_mask_email(v_dest) else public._sign_mask_phone(v_dest) end,
    'expires_in', 600, 'resend_after', 30, 'sends_left', 3 - (v_n + 1),
    'limit_retry_after', case when v_at is not null then greatest(1, ceil(extract(epoch from (v_at + interval '1 hour' - now())))::integer) end);
end $$;

-- A15-B2: 1º lock profiles, 2º sign_identity (a mesma ordem do gatilho de RN7 em profiles). Resto idêntico à 20261127120000.
create or replace function public.sign_phone_verify(p_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_email text := public._sign_me(); o public.sign_otps; i public.sign_identity;
  v_code text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g'); v_att integer;
begin
  if v_uid is null or v_email is null then raise exception 'email_not_confirmed'; end if;
  if length(v_code) <> 6 then raise exception 'invalid_input'; end if;
  perform 1 from public.profiles where id = v_uid for update;            -- 1º: profiles
  select * into i from public.sign_identity where user_id = v_uid for update;   -- 2º: sign_identity
  if i.otp_locked_until is not null and i.otp_locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'otp_locked', 'retry_after', greatest(1, ceil(extract(epoch from (i.otp_locked_until - now())))::integer));
  end if;
  select * into o from public.sign_otps where user_id = v_uid and purpose = 'phone_verify' and consumed_at is null order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'otp_not_found'); end if;
  if o.expires_at < now() or o.attempts >= 5 then return jsonb_build_object('ok', false, 'error', 'otp_expired'); end if;
  if o.code_hash <> encode(extensions.digest(v_code || ':' || v_uid::text || ':' || o.id::text, 'sha256'), 'hex') then
    -- S-05: a tentativa é gravada e a função RETORNA (sem exceção), por isso a gravação não é desfeita
    v_att := o.attempts + 1;
    update public.sign_otps set attempts = v_att where id = o.id;
    if v_att >= 5 then
      insert into public.sign_identity (user_id, otp_locked_until) values (v_uid, now() + interval '30 minutes')
        on conflict (user_id) do update set otp_locked_until = excluded.otp_locked_until, updated_at = now();
      return jsonb_build_object('ok', false, 'error', 'otp_locked', 'remaining', 0, 'retry_after', 1800);
    end if;
    return jsonb_build_object('ok', false, 'error', 'otp_invalid', 'remaining', 5 - v_att);
  end if;
  update public.sign_otps set consumed_at = now() where id = o.id;
  -- V6-03: só agora o NOVO contato vira o verificado (phone, phone_verified_at e phone_channel do novo contato)
  if o.channel = 'email' then
    insert into public.sign_identity (user_id, phone_verified_at, phone_channel) values (v_uid, now(), 'email')
      on conflict (user_id) do update set phone_verified_at = now(), phone_channel = 'email', otp_locked_until = null, updated_at = now();
  else
    insert into public.sign_identity (user_id, phone, phone_verified_at, phone_channel) values (v_uid, o.destination, now(), o.channel)
      on conflict (user_id) do update set phone = excluded.phone, phone_verified_at = now(), phone_channel = excluded.phone_channel, otp_locked_until = null, updated_at = now();
    update public.profiles set phone = o.destination, updated_at = now() where id = v_uid;
  end if;
  return public.sign_me() || jsonb_build_object('ok', true);
end $$;

-- V6-08: acentos no texto do desafio (igual ao de _sign_cert_take). Resto idêntico à 20261127120000.
create or replace function public.sign_cert_challenge()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_n text := encode(extensions.gen_random_bytes(24), 'hex'); v_cnt integer; v_at timestamptz;
begin
  if v_uid is null or public._sign_me() is null then raise exception 'email_not_confirmed'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and nullif(cpf, '') is not null) then return jsonb_build_object('ok', false, 'error', 'cpf_required'); end if;
  perform pg_advisory_xact_lock(hashtextextended('sign_cert_challenge:' || v_uid::text, 0));
  delete from public.sign_cert_challenges where user_id = v_uid and created_at < now() - interval '1 hour';   -- o histórico da hora fica (serve ao limite)
  select count(*) into v_cnt from public.sign_cert_challenges where user_id = v_uid and created_at > now() - interval '1 hour';
  if v_cnt >= 10 then
    select created_at into v_at from public.sign_cert_challenges where user_id = v_uid and created_at > now() - interval '1 hour' order by created_at desc offset 9 limit 1;
    return jsonb_build_object('ok', false, 'error', 'too_many', 'retry_after', greatest(1, ceil(extract(epoch from (v_at + interval '1 hour' - now())))::integer));
  end if;
  insert into public.sign_cert_challenges (nonce, user_id, expires_at) values (v_n, v_uid, now() + interval '5 minutes');
  return jsonb_build_object('ok', true, 'nonce', v_n, 'text', 'Lottus Sign - vínculo de certificado digital. Código: ' || v_n, 'expires_in', 300,
    'roots_loaded', exists (select 1 from public.sign_trusted_roots where active));
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permissões (explícitas, em todas as funções tocadas)
-- ---------------------------------------------------------------------------------------------------------------------
revoke all on function public.sign_me() from public, anon;
revoke all on function public.sign_onboarding_done() from public, anon;
revoke all on function public.sign_phone_send(text, text) from public, anon;
revoke all on function public.sign_phone_verify(text) from public, anon;
revoke all on function public.sign_cert_challenge() from public, anon;
grant execute on function public.sign_me() to authenticated;
grant execute on function public.sign_onboarding_done() to authenticated;
grant execute on function public.sign_phone_send(text, text) to authenticated;
grant execute on function public.sign_phone_verify(text) to authenticated;
grant execute on function public.sign_cert_challenge() to authenticated;
-- _sign_cert_take é chamada pela função de borda com service_role (grant que já existia); ninguém mais
revoke all on function public._sign_cert_take(uuid, text) from public, anon, authenticated;
grant execute on function public._sign_cert_take(uuid, text) to service_role;
-- internas: sem grant
revoke all on function public._sign_mask_cpf_text(text) from public, anon, authenticated;
revoke all on function public._sign_outbox_purge() from public, anon, authenticated;
revoke all on function public._sign_cpf_guarded_apply(uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- A15-M2: agendamento da purga (a cada 15 min). SÓ se o pg_cron existir; sem ele, nada acontece. Idempotente: desagenda o job
-- de mesmo nome antes de agendar (2 execuções = 1 job). Reversão: select cron.unschedule('lottus-sign-outbox-purge');
-- ---------------------------------------------------------------------------------------------------------------------
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'lottus-sign-outbox-purge') then
      execute $q$select cron.unschedule('lottus-sign-outbox-purge')$q$;
    end if;
    execute $q$select cron.schedule('lottus-sign-outbox-purge', '*/15 * * * *', 'select public._sign_outbox_purge()')$q$;
  end if;
end $cron$;
