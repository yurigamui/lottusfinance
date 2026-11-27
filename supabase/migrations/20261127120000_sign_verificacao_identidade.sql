-- 20261127120000_sign_verificacao_identidade.sql
-- Plataforma: Lottus Sign, seção 1.5 (Verificação de identidade) · Origem: docs/agente/sign/secao-1-5-verificacao-de-identidade.md
-- Estado: PRONTA, NÃO APLICADA. Testada só no Postgres local do Sign (scripts/sign-local). Nada foi aplicado em produção.
-- Depende de: 20261126120000_sign_perfil_fonte_unica.sql (sign_me, sign_profile_save, sign_account_save, _sign_profile_apply) já aplicada.
--
-- O que faz
--   1. S-05: sign_phone_verify persiste a tentativa errada. Código errado NÃO levanta exceção (a exceção desfazia o attempts+1):
--      devolve {ok:false, error:'otp_invalid', remaining:n}. Na 5ª errada grava sign_identity.otp_locked_until = now()+30 min e devolve
--      {ok:false, error:'otp_locked', remaining:0, retry_after:1800}. otp_expired / otp_not_found também voltam como {ok:false}.
--      Exceção só para email_not_confirmed, invalid_channel e invalid_input. Sucesso devolve sign_me() com ok:true.
--   2. Bloqueio de 30 min persistido (sobrevive a novo envio e a novo login). sign_phone_send e sign_phone_verify devolvem otp_locked.
--   3. Reenvio: 3 envios por hora (era 6) e 30 s de intervalo. too_many e too_soon devolvem retry_after (segundos).
--      sign_me ganha otp_retry_after (segundos de bloqueio restantes, ou null) para a tela mostrar o bloqueio depois de recarregar.
--   4. Canal: 'email' (destino = e-mail da conta, sem telefone) e 'whatsapp' (pronto, DESLIGADO enquanto whatsapp_enabled=false:
--      channel_unavailable). 'sms' não existe mais: invalid_channel. sign_me.channels.sms é sempre false.
--   5. Hash do código: sha256(código || ':' || user_id || ':' || id do otp). Códigos em voo na hora da migração (até 10 min) deixam de valer.
--   6. RN7: o contato verificado cai (phone_verified_at e phone_channel = null) na mesma transação quando (a) sign_phone_send usa destino
--      diferente do verificado ou (b) profiles.phone muda para outro número (trigger em profiles; vale para qualquer escritor, inclusive
--      sign_profile_save se um dia gravar telefone). Reenvio para o mesmo destino não derruba.
--   7. R2: trigger BEFORE UPDATE em sign_outbox tira a chave 'code' de params quando o status vira sent, failed ou not_configured.
--      sign_outbox.params guarda {minutes, otp_id} e o código só enquanto 'queued'. A purga (_sign_outbox_purge) existe como função;
--      o agendamento fica só como comentário no fim do arquivo (NENHUM cron.schedule ativo). sign_outbox aceita channel 'email'.
--      Limpeza única de linhas já finalizadas que ainda guardem 'code' (só remove a chave; não apaga linha).
--   8. RN9: _sign_cert_save recusa cert_expired, cert_not_yet_valid, cert_cpf_mismatch, cert_chain_invalid (chain_ok=false não vincula),
--      cpf_required e challenge_expired (exige o nonce do desafio, uso único, validade de 5 min; marca sign_cert_challenges.bound_at).
--      sign_cert_challenge exige CPF no perfil e limita a 10 desafios por hora. sign_me.cert e verified só contam certificado com
--      not_after > now(); sign_me ganha contact_kind, cert_expired e cert_expired_at. sign_env_create troca a checagem por cert_not_after > now().
--   9. A14-M3: sign_cpf_attempts(user_id, at). Cada cpf_in_use, invalid_cpf ou cpf_locked de sign_profile_save/sign_account_save conta; a
--      partir da 5ª em 1 hora devolve {ok:false, error:'too_many_attempts', retry_after} mesmo com CPF livre. Esses 3 erros agora voltam
--      como {ok:false, error:...} (a exceção desfazia o registro da tentativa). O texto de cpf_in_use no cliente passa a ser genérico.
--
-- ATENÇÃO antes de aplicar em produção (decisões do Yuri/time):
--   * A função de borda que valida o certificado (T-07) deve chamar _sign_cert_save com o campo "nonce" do desafio. Sem nonce o vínculo é
--     recusado (challenge_expired). Esta migração não altera _sign_cert_take (continua marcando used_at ao entregar o texto e as raízes).
--   * sign-messenger (T-07b) precisa aceitar channel 'email' no outbox (a função não está no repositório).
--   * profiles é compartilhada com Partners e Wealth: o trigger de RN7 só atua em quem tem sign_identity verificada por telefone.
--
-- Verificação 0, antes de aplicar em QUALQUER ambiente (só leitura):
--   -- (a) a migração 20261126120000 já está aplicada (esperado: 1 linha):
--   select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = '_sign_profile_apply';
--   -- (b) restrições de canal do outbox (esperado: só sms/whatsapp; o arquivo recria incluindo email):
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.sign_outbox'::regclass and contype = 'c';
--   -- (c) linhas de outbox ainda com código (contagem; esperado: só as 'queued' recentes):
--   select status, count(*) from public.sign_outbox where params ? 'code' group by 1;
--   -- (d) certificados vinculados já vencidos (contagem; passam a contar como "vencido"):
--   select count(*) from public.sign_identity where cert_verified_at is not null and (cert_not_after is null or cert_not_after <= now());
--
-- Como reverter
--   1. ANTES de aplicar, salve as definições atuais FORA do repositório (público):
--        scripts/sign-local/gerar-reversao-1-5.sh <banco> <arquivo fora do repo>   (usa pg_get_functiondef das 8 funções alteradas)
--   2. Para reverter: execute esse arquivo e depois:
--        drop trigger if exists sign_outbox_scrub on public.sign_outbox;      drop trigger if exists sign_profiles_phone_rn7 on public.profiles;
--        drop function if exists public._sign_outbox_scrub(); drop function if exists public._sign_outbox_purge(); drop function if exists public._sign_profile_phone_rn7();
--        drop function if exists public._sign_cpf_guarded_apply(uuid, text, text, text); drop function if exists public._sign_phone_norm(text); drop function if exists public._sign_mask_email(text);
--        drop table if exists public.sign_cpf_attempts;   -- só guarda contagem de tentativas
--        -- se existirem linhas de outbox com channel 'email', decida com o Yuri o destino delas ANTES de recriar a restrição antiga:
--        alter table public.sign_outbox drop constraint if exists sign_outbox_channel_check;
--        alter table public.sign_outbox add constraint sign_outbox_channel_check check (channel in ('sms','whatsapp'));
--      As colunas sign_identity.otp_locked_until e sign_cert_challenges.bound_at ficam (inofensivas; nada as lê depois da reversão).
--   Os grants das funções públicas ficam como estão.
--
-- Idempotente: create or replace, drop ... if exists, add column if not exists, revoke e grant repetidos não mudam nada na 2ª execução.

-- ---------------------------------------------------------------------------------------------------------------------
-- Tabelas e colunas
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.sign_identity add column if not exists otp_locked_until timestamptz;
alter table public.sign_cert_challenges add column if not exists bound_at timestamptz;
create index if not exists sign_cert_challenges_user_idx on public.sign_cert_challenges (user_id, created_at desc);

-- o outbox passa a aceitar o canal e-mail (o código vai por e-mail); a restrição antiga só tinha sms e whatsapp
alter table public.sign_outbox drop constraint if exists sign_outbox_channel_check;
alter table public.sign_outbox add constraint sign_outbox_channel_check check (channel in ('sms', 'whatsapp', 'email'));

-- tentativas de CPF recusadas (A14-M3). RLS ligado e nenhuma policy: só as funções SECURITY DEFINER leem e escrevem.
create table if not exists public.sign_cpf_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists sign_cpf_attempts_user_idx on public.sign_cpf_attempts (user_id, at desc);
alter table public.sign_cpf_attempts enable row level security;
revoke all on table public.sign_cpf_attempts from public, anon, authenticated;
-- nenhum cliente lê estas tabelas direto; o acesso é só pelas RPCs
revoke all on table public.sign_otps from anon, authenticated;
revoke all on table public.sign_outbox from anon, authenticated;
revoke all on table public.sign_cert_challenges from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Internas (sem grant a ninguém além do dono)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public._sign_phone_norm(p text)
returns text language sql immutable set search_path = ''
as $$ select case when d = '' then null when length(d) in (10, 11) then '55' || d else d end from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x $$;

create or replace function public._sign_mask_email(p text)
returns text language sql immutable set search_path = ''
as $$ select case when strpos(p, '@') > 1 then left(p, 1) || '***' || substr(p, strpos(p, '@')) else '***' end $$;

-- R2: o código só vive enquanto o envio está na fila
create or replace function public._sign_outbox_scrub()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status in ('sent', 'failed', 'not_configured') then new.params := coalesce(new.params, '{}'::jsonb) - 'code'; end if;
  return new;
end $$;
drop trigger if exists sign_outbox_scrub on public.sign_outbox;
create trigger sign_outbox_scrub before update on public.sign_outbox for each row execute function public._sign_outbox_scrub();

-- R2: rotina de purga (a ser agendada pelo time; ver o comentário no fim do arquivo). Remove 'code' de linhas com mais de 15 min.
create or replace function public._sign_outbox_purge()
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  update public.sign_outbox set params = params - 'code' where params ? 'code' and created_at < now() - interval '15 minutes';
  get diagnostics n = row_count;
  return n;
end $$;

-- limpeza única: linhas já finalizadas que ainda guardem o código (só remove a chave)
update public.sign_outbox set params = params - 'code' where params ? 'code' and status <> 'queued';

-- RN7: o contato verificado por celular cai quando profiles.phone muda para outro número (contato por e-mail não depende de telefone)
create or replace function public._sign_profile_phone_rn7()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.phone is distinct from old.phone then
    update public.sign_identity i set phone_verified_at = null, phone_channel = null, updated_at = now()
     where i.user_id = new.id and i.phone_verified_at is not null and i.phone_channel is distinct from 'email'
       and public._sign_phone_norm(new.phone) is distinct from public._sign_phone_norm(i.phone);
  end if;
  return new;
end $$;
drop trigger if exists sign_profiles_phone_rn7 on public.profiles;
create trigger sign_profiles_phone_rn7 after update of phone on public.profiles for each row execute function public._sign_profile_phone_rn7();

-- A14-M3: aplica nome/CPF com limite de tentativas. Devolve null quando deu certo; {ok:false, error, retry_after?} quando o CPF foi recusado.
-- A tentativa recusada é gravada DEPOIS do bloco protegido, por isso sobrevive (a exceção desfaria o registro).
create or replace function public._sign_cpf_guarded_apply(p_uid uuid, p_email text, p_name text, p_cpf text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_given boolean := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') <> ''; v_n integer; v_at timestamptz; v_err text;
begin
  if v_given then
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

-- ---------------------------------------------------------------------------------------------------------------------
-- Públicas
-- ---------------------------------------------------------------------------------------------------------------------
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
    'cert', case when v_valid then jsonb_build_object('subject', i.cert_subject, 'issuer', i.cert_issuer, 'cpf', i.cert_cpf, 'cnpj', i.cert_cnpj, 'not_after', i.cert_not_after, 'verified_at', i.cert_verified_at, 'serial', i.cert_serial) end,
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

create or replace function public.sign_phone_send(p_phone text, p_channel text default 'email')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_email text := public._sign_me(); v_ch text := lower(btrim(coalesce(p_channel, 'email')));
  v_ph text := public._sign_phone_norm(p_phone); v_dest text; cfg public.sign_messaging_config; i public.sign_identity;
  v_code text; v_oid uuid := gen_random_uuid(); v_n integer; v_at timestamptz; v_same boolean; v_ob bigint;
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
  -- RN7: destino diferente do verificado derruba a verificação, na mesma transação; o mesmo destino mantém
  v_same := i.phone_verified_at is not null and ((v_ch = 'email' and i.phone_channel = 'email') or (v_ch <> 'email' and i.phone_channel is distinct from 'email' and i.phone is not distinct from v_ph));
  if i.phone_verified_at is not null and not v_same then
    update public.sign_identity set phone_verified_at = null, phone_channel = null, updated_at = now() where user_id = v_uid;
  end if;
  if v_ch <> 'email' and not v_same then update public.sign_identity set phone = v_ph, updated_at = now() where user_id = v_uid; end if;
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

create or replace function public.sign_phone_verify(p_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_email text := public._sign_me(); o public.sign_otps; i public.sign_identity;
  v_code text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g'); v_att integer;
begin
  if v_uid is null or v_email is null then raise exception 'email_not_confirmed'; end if;
  if length(v_code) <> 6 then raise exception 'invalid_input'; end if;
  select * into i from public.sign_identity where user_id = v_uid for update;
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
  return jsonb_build_object('ok', true, 'nonce', v_n, 'text', 'Lottus Sign - vinculo de certificado digital. Codigo: ' || v_n, 'expires_in', 300,
    'roots_loaded', exists (select 1 from public.sign_trusted_roots where active));
end $$;

-- Chamada só pela função de borda (service_role). Rejeita o que não pode vincular.
create or replace function public._sign_cert_save(p_uid uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_cpf text := nullif(regexp_replace(coalesce(p ->> 'cpf', ''), '\D', '', 'g'), ''); v_cnpj text := nullif(regexp_replace(coalesce(p ->> 'cnpj', ''), '\D', '', 'g'), '');
  v_chain boolean := coalesce((p ->> 'chain_ok')::boolean, false); v_from timestamptz; v_to timestamptz; v_pcpf text; r jsonb; v_nonce text := nullif(p ->> 'nonce', '');
begin
  select nullif(regexp_replace(coalesce(x.cpf, ''), '\D', '', 'g'), '') into v_pcpf from public.profiles x where x.id = p_uid;
  if v_pcpf is null then raise exception 'cpf_required'; end if;
  if not v_chain then raise exception 'cert_chain_invalid'; end if;
  if v_cpf is distinct from v_pcpf then raise exception 'cert_cpf_mismatch'; end if;
  begin v_from := (p ->> 'not_before')::timestamptz; v_to := (p ->> 'not_after')::timestamptz; exception when others then raise exception 'cert_chain_invalid'; end;
  if v_to is null or v_from is null then raise exception 'cert_chain_invalid'; end if;
  if v_to < now() then raise exception 'cert_expired'; end if;
  if v_from > now() then raise exception 'cert_not_yet_valid'; end if;
  -- nonce de uso único, do próprio usuário, ainda dentro dos 5 min
  update public.sign_cert_challenges set bound_at = now() where nonce = v_nonce and user_id = p_uid and bound_at is null and expires_at > now();
  if not found then raise exception 'challenge_expired'; end if;
  insert into public.sign_identity (user_id, cert_serial, cert_subject, cert_issuer, cert_cpf, cert_cnpj, cert_not_before, cert_not_after, cert_verified_at, cert_chain_ok)
    values (p_uid, p ->> 'serial', left(p ->> 'subject', 300), left(p ->> 'issuer', 300), v_cpf, v_cnpj, v_from, v_to, now(), true)
    on conflict (user_id) do update set cert_serial = excluded.cert_serial, cert_subject = excluded.cert_subject, cert_issuer = excluded.cert_issuer, cert_cpf = excluded.cert_cpf, cert_cnpj = excluded.cert_cnpj,
      cert_not_before = excluded.cert_not_before, cert_not_after = excluded.cert_not_after, cert_verified_at = now(), cert_chain_ok = true, updated_at = now();
  if v_cnpj is not null and public._cnpj_ok(v_cnpj) then r := public._sign_link_try(p_uid, v_cnpj); end if;
  return coalesce(r, '{}'::jsonb);
end $$;

create or replace function public.sign_profile_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_email text := public._sign_me(); v_bad jsonb;
begin
  if v_uid is null or v_email is null then raise exception 'email_not_confirmed'; end if;
  -- o uid vem só do token; qualquer id/user_id no payload é ignorado
  v_bad := public._sign_cpf_guarded_apply(v_uid, v_email, coalesce(p ->> 'name', ''), coalesce(p ->> 'cpf', ''));
  if v_bad is not null then return v_bad; end if;
  return public.sign_me();
end $$;

create or replace function public.sign_account_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare a public.sign_accounts; v_uid uuid := auth.uid(); v_email text := public._sign_me();
  v_name text := nullif(public._sign_name_norm(p ->> 'name'), ''); v_doc text := regexp_replace(coalesce(p ->> 'doc', ''), '\D', '', 'g'); v_bad jsonb;
begin
  if v_uid is null or v_email is null then raise exception 'email_not_confirmed'; end if;
  if v_doc <> '' and not ((length(v_doc) = 11 and public._cpf_ok(v_doc)) or (length(v_doc) = 14 and public._cnpj_ok(v_doc))) then raise exception 'doc_invalid'; end if;
  a := public._sign_account(v_uid);
  v_bad := public._sign_cpf_guarded_apply(v_uid, v_email, v_name, case when length(v_doc) = 11 then v_doc end);
  if v_bad is not null then return v_bad; end if;
  if v_name is not null then
    update public.crm_leads l set name = pr.full_name, updated_at = now()
      from public.profiles pr where pr.id = v_uid and l.sign_account_id = a.id and nullif(pr.full_name, '') is not null and l.name is distinct from pr.full_name;
  end if;
  return public.sign_plan_state();
end $$;

-- RN9: a checagem de identidade só aceita certificado com not_after > now(). Resto da função idêntico ao atual.
CREATE OR REPLACE FUNCTION public.sign_env_create(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid(); v_email text := public._sign_me(); v_name text := trim(coalesce(p->>'name', ''));
  v_b64 text := regexp_replace(coalesce(p->>'pdf_b64', ''), '\s', '', 'g'); v_raw bytea; v_id uuid; v_sig jsonb; x jsonb; i int := 0;
  v_seq boolean := coalesce((p->>'sequential')::boolean, false); v_days int := least(greatest(coalesce((p->>'expires_days')::int, 30), 1), 90);
  v_emails text[] := '{}'; v_em text; v_first uuid; v_sid uuid;
begin
  if v_uid is null or v_email is null then raise exception 'email_not_confirmed'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 140 then raise exception 'invalid_name'; end if;
  if not exists (select 1 from public.sign_identity i where i.user_id = v_uid and (i.phone_verified_at is not null or (i.cert_verified_at is not null and i.cert_chain_ok and i.cert_not_after > now()))) then raise exception 'identity_required'; end if;
  if (select count(*) from public.sign_envelopes where owner = v_uid and created_at > now() - interval '24 hours') >= 30 then raise exception 'daily_limit'; end if;
  perform public._sign_quota_check(v_uid);
  if length(v_b64) < 100 or length(v_b64) > 14500000 then raise exception 'invalid_pdf'; end if;
  begin v_raw := decode(v_b64, 'base64'); exception when others then raise exception 'invalid_pdf'; end;
  if length(v_raw) > 10485760 or convert_from(substring(v_raw from 1 for 5), 'LATIN1') <> '%PDF-' then raise exception 'invalid_pdf'; end if;
  v_sig := coalesce(p->'signers', '[]'::jsonb);
  if jsonb_typeof(v_sig) <> 'array' or jsonb_array_length(v_sig) < 1 or jsonb_array_length(v_sig) > 10 then raise exception 'invalid_signers'; end if;
  for x in select * from jsonb_array_elements(v_sig) loop
    v_em := lower(trim(coalesce(x->>'email', '')));
    if char_length(trim(coalesce(x->>'name', ''))) < 3 or v_em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or not public._cpf_ok(x->>'cpf') then raise exception 'invalid_signer'; end if;
    if v_em = any (v_emails) then raise exception 'duplicate_signer'; end if;
    v_emails := v_emails || v_em;
  end loop;
  insert into public.sign_envelopes (owner, owner_name, owner_email, name, message, filename, pdf_b64, pdf_bytes, sha256, sequential, expires_at)
  values (v_uid, public._senv_owner_name(v_uid), v_email, v_name, nullif(left(trim(coalesce(p->>'message', '')), 1000), ''),
    left(coalesce(nullif(trim(p->>'filename'), ''), 'documento.pdf'), 200), v_b64, length(v_raw), encode(sha256(v_raw), 'hex'), v_seq, now() + make_interval(days => v_days))
  returning id into v_id;
  perform public._senv_event(v_id, null, 'created', jsonb_build_object('by', v_email, 'sequential', v_seq));
  for x in select * from jsonb_array_elements(v_sig) loop
    i := i + 1;
    insert into public.sign_env_signers (envelope_id, name, email, cpf, role, sort)
    values (v_id, trim(x->>'name'), lower(trim(x->>'email')), regexp_replace(x->>'cpf', '\D', '', 'g'), nullif(left(trim(coalesce(x->>'role', '')), 60), ''), i)
    returning id into v_sid;
    if v_first is null then v_first := v_sid; end if;
    if not v_seq then perform public._senv_notify(v_sid); end if;
  end loop;
  if v_seq then perform public._senv_notify(v_first); end if;
  return jsonb_build_object('id', v_id, 'sha256', encode(sha256(v_raw), 'hex'));
end $function$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permissões (explícitas)
-- ---------------------------------------------------------------------------------------------------------------------
revoke all on function public.sign_me() from public, anon;
revoke all on function public.sign_phone_send(text, text) from public, anon;
revoke all on function public.sign_phone_verify(text) from public, anon;
revoke all on function public.sign_cert_challenge() from public, anon;
revoke all on function public.sign_profile_save(jsonb) from public, anon;
revoke all on function public.sign_account_save(jsonb) from public, anon;
revoke all on function public.sign_env_create(jsonb) from public, anon;
revoke all on function public.sign_otp_delivery() from public, anon;
grant execute on function public.sign_me() to authenticated;
grant execute on function public.sign_phone_send(text, text) to authenticated;
grant execute on function public.sign_phone_verify(text) to authenticated;
grant execute on function public.sign_cert_challenge() to authenticated;
grant execute on function public.sign_profile_save(jsonb) to authenticated;
grant execute on function public.sign_account_save(jsonb) to authenticated;
grant execute on function public.sign_env_create(jsonb) to authenticated;
grant execute on function public.sign_otp_delivery() to authenticated;
-- _sign_cert_save é chamada pela função de borda com service_role (grant que já existia); ninguém mais
revoke all on function public._sign_cert_save(uuid, jsonb) from public, anon, authenticated;
grant execute on function public._sign_cert_save(uuid, jsonb) to service_role;
-- internas novas: sem grant
revoke all on function public._sign_phone_norm(text) from public, anon, authenticated;
revoke all on function public._sign_mask_email(text) from public, anon, authenticated;
revoke all on function public._sign_outbox_scrub() from public, anon, authenticated;
revoke all on function public._sign_outbox_purge() from public, anon, authenticated;
revoke all on function public._sign_profile_phone_rn7() from public, anon, authenticated;
revoke all on function public._sign_cpf_guarded_apply(uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Agendamento da purga (R2). NÃO ATIVO: o pg_cron é decisão do time/Yuri. Para ativar, rode manualmente, uma vez:
--   select cron.schedule('lottus-sign-outbox-purge', '*/15 * * * *', $$select public._sign_outbox_purge()$$);
-- Para tirar:  select cron.unschedule('lottus-sign-outbox-purge');
-- ---------------------------------------------------------------------------------------------------------------------
