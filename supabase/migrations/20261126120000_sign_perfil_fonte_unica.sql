-- 20261126120000_sign_perfil_fonte_unica.sql
-- Plataforma: Lottus Sign, seção 1.4 (Perfil e conta) · Origem: docs/agente/sign/secao-1-4-perfil-e-conta.md; decisões de 26/11/2026 (R5, M2, R3, T-02 etapa A)
-- Estado: PRONTA, NÃO APLICADA. Testada só no Postgres local do Sign (scripts/sign-local). Nada foi aplicado em produção.
--
-- O que faz
--   Nome e CPF da pessoa passam a viver só em public.profiles (fonte única). O Sign deixa de gravar nome/CPF em sign_accounts.
--   1. sign_me: name e cpf só de profiles; phone só de sign_identity.phone ou profiles.phone (fim do fallback de
--      raw_user_meta_data, pendência M2); novas chaves name_hint (sugestão, nunca dado validado), cpf_locked e profile_complete.
--      As chaves antigas continuam (1.0 e 1.1 não quebram).
--   2. sign_profile_save (regra R5): nome sempre editável (3 a 140 caracteres, 2+ palavras, espaços colapsados); CPF só se preenche:
--      vazio grava, igual não muda nada, diferente dá cpf_locked. Nunca toca email nem phone da linha. Duplicado vira cpf_in_use.
--   3. sign_account_save: o nome (e o CPF de 11 dígitos, se vier em doc) passam pela mesma regra e vão para profiles; deixa de
--      gravar sign_accounts.name/doc; mantém crm_leads.name em sincronia. doc com 14 dígitos (CNPJ) é ignorado na v1 (P1-06), sem erro.
--   4. sign_plan_state: account.name e account.doc leem de profiles (mesma forma de resposta).
--   5. _senv_owner_name (R3): profiles.full_name, depois a parte local do e-mail; nunca raw_user_meta_data. Envelopes antigos
--      mantêm o owner_name já gravado (evidência não é reescrita).
--   6. Funções internas novas (sem grant a ninguém): _sign_name_norm, _sign_cpf_locked, _sign_profile_apply.
--   7. grant execute explícito só a authenticated nas 4 RPCs públicas; revoke de public e anon.
--   Não apaga coluna nem dado. A etapa B (remover sign_accounts.name/doc, duplicidade em sign_env_signers) NÃO está aqui (pendência E-02).
--
-- Verificação 0, antes de aplicar em QUALQUER ambiente (só leitura; T-08). Em produção rode e guarde o resultado:
--   -- (a) unique(cpf) em profiles existe? (esperado: uma linha). Se não existir, NÃO aplicar até o Yuri conferir duplicados:
--   select indexdef from pg_indexes where schemaname = 'public' and tablename = 'profiles' and indexdef ilike '%unique%' and indexdef ilike '%(cpf)%';
--   -- (b) CPF duplicado depois de normalizar (esperado: 0 linhas):
--   select regexp_replace(cpf, '\D', '', 'g') as cpf_norm, count(*) from public.profiles where nullif(cpf, '') is not null group by 1 having count(*) > 1;
--   -- (c) divergência de nome entre profiles e sign_accounts (só contagem; não listar nomes):
--   select count(*) from public.sign_accounts a join public.profiles p on p.id = a.user_id
--    where lower(trim(coalesce(a.name, ''))) is distinct from lower(trim(coalesce(p.full_name, '')));
--   -- (d0) CPF gravado com máscara/não-dígitos (A14-M1; a unicidade do índice não os pega; esperado: 0, senão listar mascarado e decidir com o Yuri):
--   select count(*) from public.profiles where cpf ~ '\D';
--   -- (d) as colunas profiles.full_name, cpf, email, phone, updated_at existem e cpf aceita null (a migração grava cpf só quando há valor):
--   select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name in ('full_name','cpf','email','phone','updated_at');
--
-- Como reverter (nenhum dado é alterado por esta migração; só funções e permissões)
--   1. ANTES de aplicar, salve as definições atuais num arquivo FORA do repositório (que é público):
--        select pg_get_functiondef(p.oid) || ';' from pg_proc p where p.pronamespace = 'public'::regnamespace
--         and p.proname in ('sign_me','sign_profile_save','sign_account_save','sign_plan_state','_senv_owner_name');
--      (scripts/sign-local/gerar-reversao.sh faz isso no banco local e prova a reversão.)
--   2. Para reverter: execute esse arquivo (volta as 5 funções) e depois:
--        drop function if exists public._sign_profile_apply(uuid, text, text, text);
--        drop function if exists public._sign_cpf_locked(uuid);
--        drop function if exists public._sign_name_norm(text);
--      Os grants das 4 RPCs públicas ficam como estão (authenticated); se precisar do estado antigo, reaplique os grants anteriores.
--
-- Idempotente: create or replace, revoke e grant repetidos não mudam nada na 2ª execução.
-- Ordem: depende só do esquema atual do Sign (sign_identity, sign_envelopes, sign_accounts, crm_leads) e de _cpf_ok, _cnpj_ok, _sign_me, _sign_account, _sign_companies_json.

-- ---------------------------------------------------------------------------------------------------------------------
-- Internas
-- ---------------------------------------------------------------------------------------------------------------------

-- Nome normalizado: espaços (inclusive repetidos) colapsados e aparados. Não altera maiúsculas nem caracteres.
create or replace function public._sign_name_norm(p text)
returns text language sql immutable set search_path = ''
as $$ select btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')) $$;

-- CPF travado para troca pelo Sign (regra R5): CPF já preenchido, ou existe envelope do usuário (P1-05),
-- ou certificado verificado, ou vínculo com empresa (Partners) ou fundo (Wealth). Só leitura por chave.
create or replace function public._sign_cpf_locked(p_uid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_uid is not null and (
    exists (select 1 from public.profiles pr where pr.id = p_uid and nullif(pr.cpf, '') is not null)
    or exists (select 1 from public.sign_envelopes e where e.owner = p_uid)
    or exists (select 1 from public.sign_identity i where i.user_id = p_uid and i.cert_verified_at is not null and i.cert_chain_ok)
    -- vínculo com empresa (Partners) ou fundo (Wealth) só trava quando o CPF do perfil está preenchido (A14-B1)
    or (exists (select 1 from public.profiles pr where pr.id = p_uid and nullif(pr.cpf, '') is not null)
        and (exists (select 1 from public.company_members m where m.user_id = p_uid)
             or exists (select 1 from public.funder_members f where f.user_id = p_uid)))
  )
$$;

-- Aplica nome e CPF ao profiles do usuário (única escrita de pessoa do Sign). p_name null = não mexe no nome;
-- p_cpf null = não mexe no CPF. Valida aqui (o cliente é só conforto). Nunca toca email nem phone de uma linha existente.
create or replace function public._sign_profile_apply(p_uid uuid, p_email text, p_name text, p_cpf text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_name text; v_cpf text; v_cur public.profiles; v_cur_cpf text; v_has boolean; i public.sign_identity;
begin
  if p_uid is null then raise exception 'email_not_confirmed'; end if;
  if p_name is not null then
    v_name := public._sign_name_norm(p_name);
    if char_length(v_name) < 3 or char_length(v_name) > 140 or strpos(v_name, ' ') = 0 then raise exception 'invalid_name'; end if;
    -- A14-B3: caracteres invisíveis de direção e largura zero (U+200B a U+200F, U+202A a U+202E, U+2066 a U+2069) não entram no nome
    if v_name ~ '[\u200B-\u200F\u202A-\u202E\u2066-\u2069]' then raise exception 'invalid_name'; end if;
  end if;
  select * into v_cur from public.profiles where id = p_uid for update;
  v_has := found;
  v_cur_cpf := nullif(regexp_replace(coalesce(v_cur.cpf, ''), '\D', '', 'g'), '');
  if p_cpf is not null then
    v_cpf := regexp_replace(p_cpf, '\D', '', 'g');
    if v_cur_cpf is not null and v_cpf = '' then
      v_cpf := null;                                   -- salvar só o nome: o CPF atual continua
    elsif not public._cpf_ok(v_cpf) then
      raise exception 'invalid_cpf';
    elsif v_cur_cpf is not null then
      if v_cpf <> v_cur_cpf then raise exception 'cpf_locked'; end if;
      v_cpf := null;                                   -- igual ao atual: nada a gravar
    elsif public._sign_cpf_locked(p_uid) then
      select * into i from public.sign_identity where user_id = p_uid;
      -- travado por envelope, certificado ou vínculo; só passa se for o CPF do próprio certificado verificado
      if not (i.cert_verified_at is not null and i.cert_chain_ok and i.cert_cpf is not null and i.cert_cpf = v_cpf) then raise exception 'cpf_locked'; end if;
    end if;
  end if;
  if v_name is null and v_cpf is null then return; end if;
  -- A14-M1: o CPF vale pelos dígitos; outro perfil com o mesmo CPF gravado com máscara (Partners/Wealth) também é duplicado
  if v_cpf is not null and exists (select 1 from public.profiles o where o.id <> p_uid and regexp_replace(coalesce(o.cpf, ''), '\D', '', 'g') = v_cpf) then raise exception 'cpf_in_use'; end if;
  if not v_has and v_cpf is null then raise exception 'invalid_cpf'; end if;  -- sem linha em profiles não dá para criar só com o nome
  insert into public.profiles (id, full_name, cpf, email) values (p_uid, v_name, v_cpf, p_email)
    on conflict (id) do update set
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      cpf = case when nullif(public.profiles.cpf, '') is null then coalesce(excluded.cpf, public.profiles.cpf) else public.profiles.cpf end,
      updated_at = now()
    where public.profiles.full_name is distinct from coalesce(excluded.full_name, public.profiles.full_name)
       or (nullif(public.profiles.cpf, '') is null and excluded.cpf is not null);
exception when unique_violation then raise exception 'cpf_in_use';
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Públicas
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.sign_me()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_email text := public._sign_me(); v_uid uuid := auth.uid(); i public.sign_identity; p public.profiles; u auth.users; c public.sign_messaging_config; v_n text;
begin
  if v_email is null then raise exception 'email_not_confirmed'; end if;
  select * into i from public.sign_identity where user_id = v_uid;
  select * into p from public.profiles where id = v_uid;
  select * into u from auth.users where id = v_uid;
  select * into c from public.sign_messaging_config where id = 1;
  v_n := public._sign_name_norm(p.full_name);
  return jsonb_build_object('email', v_email,
    'name', nullif(p.full_name, ''),
    'cpf', nullif(p.cpf, ''),
    'name_hint', nullif(left(public._sign_name_norm(u.raw_user_meta_data ->> 'name'), 140), ''),
    'phone', coalesce(i.phone, nullif(p.phone, '')),
    'phone_verified', i.phone_verified_at is not null, 'phone_verified_at', i.phone_verified_at,
    'cert', case when i.cert_verified_at is not null and i.cert_chain_ok then jsonb_build_object('subject', i.cert_subject, 'issuer', i.cert_issuer, 'cpf', i.cert_cpf, 'cnpj', i.cert_cnpj, 'not_after', i.cert_not_after, 'verified_at', i.cert_verified_at, 'serial', i.cert_serial) end,
    'verified', (i.phone_verified_at is not null or (i.cert_verified_at is not null and i.cert_chain_ok)),
    'onboarding_done', coalesce(i.onboarding_done, false),
    'channels', jsonb_build_object('email', true, 'sms', coalesce(c.sms_enabled, false), 'whatsapp', coalesce(c.whatsapp_enabled, false)),
    'cert_pending', (i.cert_verified_at is not null and not i.cert_chain_ok), 'companies', public._sign_companies_json(v_uid),
    'cpf_locked', public._sign_cpf_locked(v_uid),
    'profile_complete', (char_length(v_n) between 3 and 140 and strpos(v_n, ' ') > 0 and public._cpf_ok(p.cpf)));
end $$;

create or replace function public.sign_profile_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_email text := public._sign_me();
begin
  if v_uid is null or v_email is null then raise exception 'email_not_confirmed'; end if;
  -- o uid vem só do token; qualquer id/user_id no payload é ignorado
  perform public._sign_profile_apply(v_uid, v_email, coalesce(p ->> 'name', ''), coalesce(p ->> 'cpf', ''));
  return public.sign_me();
end $$;

create or replace function public.sign_account_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare a public.sign_accounts; v_uid uuid := auth.uid(); v_email text := public._sign_me();
  v_name text := nullif(public._sign_name_norm(p ->> 'name'), ''); v_doc text := regexp_replace(coalesce(p ->> 'doc', ''), '\D', '', 'g');
begin
  if v_uid is null or v_email is null then raise exception 'email_not_confirmed'; end if;
  if v_doc <> '' and not ((length(v_doc) = 11 and public._cpf_ok(v_doc)) or (length(v_doc) = 14 and public._cnpj_ok(v_doc))) then raise exception 'doc_invalid'; end if;
  a := public._sign_account(v_uid);
  -- fonte única: nome e CPF vão para profiles; sign_accounts.name/doc não são mais escritos. CNPJ é ignorado na v1 (P1-06).
  perform public._sign_profile_apply(v_uid, v_email, v_name, case when length(v_doc) = 11 then v_doc end);
  if v_name is not null then
    update public.crm_leads l set name = pr.full_name, updated_at = now()
      from public.profiles pr where pr.id = v_uid and l.sign_account_id = a.id and nullif(pr.full_name, '') is not null and l.name is distinct from pr.full_name;
  end if;
  return public.sign_plan_state();
end $$;

create or replace function public.sign_plan_state()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare a public.sign_accounts; v_uid uuid := auth.uid(); m date := public._sign_month(null); pr public.profiles;
begin
  if v_uid is null or public._sign_me() is null then raise exception 'email_not_confirmed'; end if;
  a := public._sign_account(v_uid);
  select * into pr from public.profiles where id = v_uid;
  return jsonb_build_object(
    'account', jsonb_build_object('id', a.id, 'name', nullif(pr.full_name, ''), 'doc', nullif(pr.cpf, ''), 'plan', a.plan, 'cycle', a.cycle, 'plan_requested', a.plan_requested, 'requested_at', a.requested_at, 'status', a.status, 'custom_price', a.custom_price),
    'usage', public._sign_calc(a, m),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'price_month', price_month, 'docs_included', docs_included, 'extra_doc_price', extra_doc_price) order by sort), '[]'::jsonb) from public.sign_plans where active),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('month', d, 'used', public._sign_used(v_uid, d)) order by d desc), '[]'::jsonb) from (select (m - make_interval(months => g))::date d from generate_series(0, 5) g) q));
end $$;

-- R3: o nome do remetente nas evidências vem de profiles, nunca do metadado editável do Auth.
create or replace function public._senv_owner_name(p_uid uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce(nullif(public._sign_name_norm(pr.full_name), ''), split_part(u.email, '@', 1))
    from auth.users u left join public.profiles pr on pr.id = u.id where u.id = p_uid;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permissões (o padrão do banco pode conceder execução a anon/public; aqui fica explícito)
-- ---------------------------------------------------------------------------------------------------------------------
revoke all on function public.sign_me() from public, anon;
revoke all on function public.sign_profile_save(jsonb) from public, anon;
revoke all on function public.sign_account_save(jsonb) from public, anon;
revoke all on function public.sign_plan_state() from public, anon;
grant execute on function public.sign_me() to authenticated;
grant execute on function public.sign_profile_save(jsonb) to authenticated;
grant execute on function public.sign_account_save(jsonb) to authenticated;
grant execute on function public.sign_plan_state() to authenticated;
-- internas: sem grant a ninguém além do dono (as RPCs acima são SECURITY DEFINER e as chamam como dono)
revoke all on function public._sign_name_norm(text) from public, anon, authenticated;
revoke all on function public._sign_cpf_locked(uuid) from public, anon, authenticated;
revoke all on function public._sign_profile_apply(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public._senv_owner_name(uuid) from public, anon, authenticated;
