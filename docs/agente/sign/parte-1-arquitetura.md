# Sign / Parte 1: Arquitetura (Conta e identidade)
24/11/2026 · v0.1 · Arquiteto · para o G2 da Parte 1

**Base e honestidade.** LIDO (não executado): `/root/sign-schema.sql` (esquema real exportado, só leitura), a ficha, o manual 12 e 13 e `apps/sign/js/home.js`. EXECUTADO: apenas SELECTs no Postgres local (`sign`, porta 54350). O banco local tem 2 contas de seed, então "0 divergências" ali não diz nada sobre produção. NÃO lido, porque não está no repositório nem no export: as Edge Functions `sign-messenger` (entrega do OTP) e a que valida a cadeia do certificado (chama `_sign_cert_take/_sign_cert_save`); as configurações do Supabase Auth (painel). Nada aplicado. A migração do item 3 é só esboço.

## 1. Decisões P1-01 a P1-07 e P1-11
| ID | Decisão técnica | Motivo | Yuri? |
|---|---|---|---|
| P1-01 | **Generalizar o canal**, mantendo `sign_phone_send(text,text)` e `sign_phone_verify(text)`. Canal `email` usa o e-mail da sessão como destino; `p_phone` é ignorado. | `sign_otps_channel_check` já aceita `email`; falta `sign_outbox_channel_check` e `sign_messaging_config.email_enabled`. RPCs novas duplicariam regra e grants. | Não |
| P1-02 | Manter `sign_identity.phone_verified_at` como "contato verificado" (é o que `sign_env_create` e `sign_company_link` exigem; não mexo neles). Canal `email` grava `phone_channel='email'` e **não toca no número**. `sign_me` ganha `contact_verified`/`contact_channel` e `phone_verified` passa a valer só para `sms`/`whatsapp`. | Compatível com o back-end atual. Mas, por honestidade: depois da confirmação do cadastro, o código por e-mail prova só o acesso à mesma caixa (não o celular). | **Sim.** Pergunta: "e-mail confirmado no cadastro já basta para enviar (RN10), ficando o OTP por e-mail como reconfirmação?" Recomendo: manter o OTP (pedido seu, prepara T-04) e rotular na tela "e-mail confirmado", nunca "celular". |
| P1-03 | Oferecer TOTP do Auth (sem SMS). Perda do 2º fator: só pela equipe (Admin, `bo_`), com conferência manual. Não há códigos de recuperação nativos. | TOTP no Auth é gratuito (confirmar na doc vigente). `is_staff()` já exige `aal2` quando `backoffice_settings.require_mfa` é true. | Aviso: o fluxo de suporte tem custo operacional. |
| P1-04 | RN5 como na ficha (6 dígitos, 10 min, 5 tentativas, 30 s entre envios; limite horário vira 4 envios, hoje é 6). **RN3 (5 falhas = 15 min por e-mail) não é implementável só com o Auth nativo**: o limite dele é por IP e a recusa por e-mail não é configurável. **RN13 (8 h de inatividade)**: o tempo limite de sessão do Auth parece ser recurso pago (confirmar). Proposta custo zero: mensagem única de erro no login, limite nativo do Auth, e saída por inatividade no navegador (conforto, não segurança). | Limites de provedor, não de modelagem. | **Sim:** aceitar RN3 e RN13 reduzidos em custo zero, ou pagar o plano que os cobre. |
| P1-05 | **Bloquear** a troca de CPF depois do primeiro envelope criado ou de certificado aceito (`cpf_locked`); mudança só por RPC `bo_` do Admin, com log. Nome continua editável (o envelope guarda o nome da época). | Evidência de assinatura aponta para quem enviou. | Confirmar (impacta suporte). |
| P1-06 | v1 só pessoa física: `sign_accounts.doc` deixa de aceitar CNPJ; CNPJ entra pelo vínculo (`sign_company_links`, v2). Não existe coluna "tipo de conta" em `sign_accounts` (a ficha diz que existe): não criar. | Evita segundo lugar para documento. | **Sim** (Yuri decide). |
| P1-07 | v1: cadeia e validade. Revogação (CRL/OCSP) na v2. Pré-requisito: localizar e **versionar no repositório** a Edge Function que valida o certificado; hoje a regra RN9 a, b e d está fora do que consegui ler. | Não dá para verificar RN9 sem esse código. | Não |
| P1-11 | Medir antes de decidir. Estimativa por cadastro: 1 confirmação + 1 OTP + recuperações. O SMTP padrão do Supabase é só para teste (limite muito baixo por hora; confirmar valor vigente). `_send_email` usa Postmark, de plano gratuito pequeno. Custo zero exige SMTP próprio em provedor com cota gratuita (confirmar cotas vigentes). | Sem isso o cadastro e o OTP falham em produção. | **Sim**, escolher provedor e domínio remetente. |

## 2. Duplicidade T-02 (lido no esquema; produção não consultada)
| Dado | Onde se repete | Veredito |
|---|---|---|
| Nome da pessoa | `profiles.full_name`; `sign_accounts.name` (copiado na criação da conta e editado por `sign_account_save`); `crm_leads.name` (gravado por `sign_account_save` e `_crm_sync_sign`); `auth.users.raw_user_meta_data.name` (usado por `_senv_owner_name` como `owner_name` do envelope) | Duplicidade real, quatro cópias. Fonte única: `profiles`. |
| Documento | `profiles.cpf`; `sign_accounts.doc` (CPF ou CNPJ, sem unicidade); `crm_leads.doc` | Duplicidade real. `profiles.cpf` é a fonte; CNPJ sai da v1 (P1-06). |
| Telefone | `profiles.phone` e `sign_identity.phone` (os dois são gravados na verificação) | Exceção documentada: `sign_identity.phone` é o número **que foi verificado** (fato de prova); `profiles.phone` é o declarado. Teste: o `auditor-dados` confere que, se `phone_verified_at` existe, os dois coincidem. |
| `sign_env_signers.name/cpf` | Terceiros sem conta, declarados pelo remetente | **Não é duplicidade.** É prova imutável do que foi enviado. Não ligar a `profiles`. |
| `sign_contacts` (name, email, cpf, phone) | Agenda de terceiros (v2) | Não é duplicidade. Manter; já tem `unique(user_id,email)`. |
| `companies` | `sign_company_links` guarda só `cnpj`/`company_id`; nome vem de `companies` por join (`_sign_companies_json`) | Correto. |

**Migração em duas etapas (as duas não aplicadas; a B só depois do OK do Yuri):**
- **A (`..._sign_fonte_unica_pessoa.sql`, aditiva):** `sign_account_save` grava só o nome, em `profiles` (CPF continua só em `sign_profile_save`); recusa CNPJ com `doc_not_supported`. `sign_plan_state` passa a devolver `account.name/doc` lidos de `profiles` (mesmas chaves, sem quebrar). `_crm_sync_sign` e `_senv_owner_name` leem de `profiles`. A `_senv_owner_name` é interna, mas alimenta evidência: exige teste antes (decisão do Maestro de 24/11).
- **B (`..._sign_drop_name_doc.sql`):** `drop column sign_accounts.name, sign_accounts.doc`, só depois de a auditoria em produção (SELECT) listar divergências e linhas com `doc` de 14 dígitos, e de o Yuri aprovar. Reversão: recriar as colunas e repopular de `profiles`.
- Auditoria prévia (somente leitura): consultas 1, 2, 4 e 6 do manual, seção 12, sobre `sign_accounts` x `profiles`, e contagem de `sign_accounts.doc` com 14 dígitos.

## 3. Canal `email` e WhatsApp pronto e desligado (esboço, NÃO aplicar)
Estado real lido: `sign_otps.channel` aceita sms/whatsapp/email; `sign_outbox.channel` só sms/whatsapp; `sign_messaging_config` tem `whatsapp_enabled=false` (default) e `sms_enabled=true` (default, provedor `textbee`; o valor de produção não foi consultado). `sign_phone_verify` grava `o.destination` em `sign_identity.phone` e `profiles.phone`: com canal e-mail isso colocaria o **e-mail no campo telefone**; por isso o ramo novo. Bug a corrigir junto: o contador de tentativas é gravado e depois a função dá `raise`, que desfaz tudo (ver item 6, R1); o erro de código errado passa a **retornar** `{ok:false,...}`.

Arquivo proposto: `supabase/migrations/20261124150000_sign_canal_email_e_otp_seguro.sql`
```sql
-- REVERSAO (tudo aditivo): drop index if exists sign_identity_phone_verified_uidx, sign_cert_challenges_user_idx;
--   alter table sign_outbox drop constraint sign_outbox_channel_check, recriar com ('sms','whatsapp');
--   alter table sign_messaging_config drop column email_enabled; cron.unschedule('lottus-sign-otp-purge');
--   restaurar sign_phone_send/verify/sign_me do dump pre-migracao (guardar antes: pg_get_functiondef).
-- NAO APLICAR sem OK. Testar no Postgres local (scripts/sign-local); prova.sql chama 'sms': atualizar.
begin;
alter table public.sign_messaging_config add column if not exists email_enabled boolean not null default true;
-- DEPENDE DO YURI: update public.sign_messaging_config set sms_enabled = false where id = 1;  (RN6: SMS inexistente)
alter table public.sign_outbox drop constraint if exists sign_outbox_channel_check;
alter table public.sign_outbox add constraint sign_outbox_channel_check check (channel in ('email','whatsapp','sms'));
-- unicidade do telefone verificado (hoje so checada na funcao, com corrida). Antes: SELECT de duplicados em producao.
create unique index if not exists sign_identity_phone_verified_uidx on public.sign_identity (phone)
  where phone_verified_at is not null and phone_channel in ('sms','whatsapp');
create index if not exists sign_cert_challenges_user_idx on public.sign_cert_challenges (user_id);

create or replace function public.sign_phone_send(p_phone text, p_channel text default 'sms') returns jsonb
language plpgsql security definer set search_path = '' as $f$
declare v_uid uuid := auth.uid(); v_mail text := public._sign_me(); cfg public.sign_messaging_config;
  v_ch text := lower(coalesce(nullif(trim(p_channel), ''), 'email')); v_ph text := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  v_dest text; v_code text; v_ob bigint;
begin
  if v_uid is null or v_mail is null then raise exception 'email_not_confirmed'; end if;
  if v_ch not in ('email','whatsapp','sms') then raise exception 'invalid_channel'; end if;
  select * into cfg from public.sign_messaging_config where id = 1;
  if not (case v_ch when 'email' then coalesce(cfg.email_enabled, true) when 'whatsapp' then cfg.whatsapp_enabled else cfg.sms_enabled end)
    then raise exception 'channel_unavailable'; end if;           -- RN6: servidor recusa canal desligado
  if v_ch = 'email' then v_dest := v_mail;
  else
    if length(v_ph) in (10,11) then v_ph := '55' || v_ph; end if;
    if v_ph !~ '^55[1-9][0-9][2-9][0-9]{7,8}$' then raise exception 'invalid_phone'; end if;
    if exists (select 1 from public.sign_identity x where x.phone = v_ph and x.phone_verified_at is not null
               and x.phone_channel in ('sms','whatsapp') and x.user_id <> v_uid) then raise exception 'phone_in_use'; end if;
    v_dest := v_ph;
  end if;
  if exists (select 1 from public.sign_otps where user_id = v_uid and created_at > now() - interval '30 seconds') then raise exception 'too_soon'; end if;
  if (select count(*) from public.sign_otps where user_id = v_uid and created_at > now() - interval '1 hour') >= 4 then raise exception 'too_many'; end if;
  update public.sign_otps set consumed_at = now() where user_id = v_uid and consumed_at is null;
  v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint & 2147483647) % 1000000)::text, 6, '0');
  insert into public.sign_otps (user_id, purpose, channel, destination, code_hash, expires_at)
  values (v_uid, 'phone_verify', v_ch, v_dest, encode(extensions.digest(v_code || ':' || v_uid::text, 'sha256'), 'hex'), now() + interval '10 minutes');
  if v_ch <> 'email' then   -- RN7: trocar o numero derruba a verificacao por telefone (nao a por e-mail)
    insert into public.sign_identity (user_id, phone) values (v_uid, v_ph)
    on conflict (user_id) do update set
      phone_verified_at = case when sign_identity.phone is distinct from excluded.phone and sign_identity.phone_channel in ('sms','whatsapp') then null else sign_identity.phone_verified_at end,
      phone_channel     = case when sign_identity.phone is distinct from excluded.phone and sign_identity.phone_channel in ('sms','whatsapp') then null else sign_identity.phone_channel end,
      phone = excluded.phone, updated_at = now();
  end if;
  insert into public.sign_outbox (user_id, channel, destination, template, params)
  values (v_uid, v_ch, v_dest, 'otp', jsonb_build_object('code', v_code, 'minutes', 10)) returning id into v_ob;
  perform public._call_function('sign-messenger', jsonb_build_object('outbox_id', v_ob));  -- ramo email vive no messenger (a escrever/versionar)
  return jsonb_build_object('channel', v_ch, 'to', case when v_ch = 'email' then left(v_mail,1) || '***@' || split_part(v_mail,'@',2) else public._sign_mask_phone(v_dest) end,
                            'expires_in', 600, 'resend_after', 30);
end $f$;

create or replace function public.sign_phone_verify(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $f$
declare v_uid uuid := auth.uid(); o public.sign_otps; v_code text := regexp_replace(coalesce(p_code,''), '\D', '', 'g');
begin
  if v_uid is null or public._sign_me() is null then raise exception 'email_not_confirmed'; end if;
  if length(v_code) <> 6 then raise exception 'otp_invalid'; end if;
  select * into o from public.sign_otps where user_id = v_uid and purpose = 'phone_verify' and consumed_at is null order by created_at desc limit 1 for update;
  if not found then raise exception 'otp_not_found'; end if;
  if o.expires_at < now() then raise exception 'otp_expired'; end if;
  if o.attempts >= 5 then raise exception 'otp_locked'; end if;
  if o.code_hash <> encode(extensions.digest(v_code || ':' || v_uid::text, 'sha256'), 'hex') then
    update public.sign_otps set attempts = attempts + 1 where id = o.id;          -- persiste porque NAO ha raise depois
    return jsonb_build_object('ok', false, 'error', 'otp_invalid', 'remaining', greatest(4 - o.attempts, 0));
  end if;
  update public.sign_otps set consumed_at = now() where id = o.id;
  if o.channel = 'email' then            -- nao mexe em phone; nao rebaixa verificacao por celular ja feita
    insert into public.sign_identity (user_id, phone_verified_at, phone_channel) values (v_uid, now(), 'email')
    on conflict (user_id) do update set updated_at = now(),
      phone_verified_at = case when sign_identity.phone_channel in ('sms','whatsapp') and sign_identity.phone_verified_at is not null then sign_identity.phone_verified_at else now() end,
      phone_channel     = case when sign_identity.phone_channel in ('sms','whatsapp') and sign_identity.phone_verified_at is not null then sign_identity.phone_channel else 'email' end;
  else
    insert into public.sign_identity (user_id, phone, phone_verified_at, phone_channel) values (v_uid, o.destination, now(), o.channel)
    on conflict (user_id) do update set phone = excluded.phone, phone_verified_at = now(), phone_channel = excluded.phone_channel, updated_at = now();
    update public.profiles set phone = o.destination, updated_at = now() where id = v_uid;
  end if;
  return public.sign_me() || jsonb_build_object('ok', true);
end $f$;

-- sign_me (CREATE OR REPLACE, so estas mudancas): channels.email = coalesce(email_enabled,true); acrescentar
--   'contact_verified' (phone_verified_at is not null), 'contact_channel' (phone_channel);
--   'phone_verified' = phone_verified_at is not null and phone_channel in ('sms','whatsapp');
--   'verified' exige tambem cert_not_after > now() para o ramo certificado (RN9b); cpf/phone sem fallback de raw_user_meta_data.
-- Purga (RN5/RN17): codigo em claro nao fica no outbox nem o OTP no banco.
create or replace function public._sign_purge_otps() returns void language sql security definer set search_path = '' as $f$
  update public.sign_outbox set params = '{}'::jsonb where template = 'otp' and created_at < now() - interval '15 minutes' and params <> '{}'::jsonb;
  delete from public.sign_otps where created_at < now() - interval '1 day';
$f$;
revoke all on function public._sign_purge_otps() from public, anon, authenticated;
grant execute on function public._sign_purge_otps() to service_role;
revoke all on function public.sign_phone_send(text,text), public.sign_phone_verify(text), public.sign_me() from public, anon;
grant execute on function public.sign_phone_send(text,text), public.sign_phone_verify(text), public.sign_me() to authenticated;
do $c$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then
  perform cron.schedule('lottus-sign-otp-purge', '*/15 * * * *', 'select public._sign_purge_otps()'); end if; end $c$;
commit;
```
Notas do esboço: (a) o gerador do código (6 dígitos aleatórios via `gen_random_bytes`) foi reescrito no esboço; conferir com o de produção. (b) WhatsApp: nada novo; continua `whatsapp_enabled=false`; `sign_messaging_save` já recusa ligar sem token e número (`whatsapp_incomplete`). Ligar depois = credenciais no Vault + `sign_messaging_save`, sem mudar tela nem RPC. (c) O ramo `email` do `sign-messenger` (ou chamada direta a `_send_email`) é parte da construção, decidido em P1-11. (d) Rollback do contrato: `otp_invalid` deixa de ser exceção e vira `ok:false`; o front de `apps/sign` ainda não chama essas RPCs (conferido por busca), e `prova.sql` precisa ajustar a linha 127.

## 4. Funções reais: retorno, erros e lacunas (lido; só `sign_me`/`sign_*` locais foram chamadas antes pelo Maestro, não por mim)
Todas: `SECURITY DEFINER`, `search_path` vazio, `authenticated` (e `service_role`) com execute, `anon` sem execute; nenhuma recebe id de usuário (RN17 ok). Quando o Postgres devolve erro, o PostgREST entrega `message` = código abaixo.
| RPC | Retorno (JSON) | Erros (códigos) | Lacunas contra RN1 a RN18 |
|---|---|---|---|
| `sign_me()` | `email, name, cpf, phone, phone_verified(_at), cert{subject,issuer,cpf,cnpj,not_after,verified_at,serial}\|null, verified, onboarding_done, channels{email,sms,whatsapp}, cert_pending, companies[]` | `email_not_confirmed` | RN1: não devolve estado, lança erro; o front precisa tratá-lo como "mostrar só onboarding". `name/cpf/phone` caem para `raw_user_meta_data` (editável pelo usuário, sem validação). `verified` aceita certificado vencido (não olha `cert_not_after`, RN9b). `channels.sms` hoje sai verdadeiro por padrão (RN6). Sem campo de contato por e-mail. |
| `sign_profile_save(p{name,cpf})` | `sign_me()` | `email_not_confirmed, invalid_name` (menos de 2 palavras ou mais de 140), `invalid_cpf, cpf_locked` (só com certificado de outro CPF), `cpf_in_use` | RN8: validação de CPF ok e unicidade depende de `unique(cpf)` em `profiles`, **inferida do código; não confirmada** (o export não traz `profiles`). P1-05: não bloqueia troca após envelope. `profiles` é compartilhada com Partners/Wealth: a função sobrescreve nome e CPF de quem já é usuário de outra plataforma, sem aviso (regra 14). Não normaliza espaços. `cpf_in_use` permite a qualquer conta testar CPFs (enumeração). Sem limite de tentativas. Não atualiza `sign_accounts.name` (T-02). |
| `sign_account_save(p{name,doc})` | `sign_plan_state()` (`account, usage, plans, history`) | `email_not_confirmed, doc_invalid` | Aceita CNPJ e CPF sem unicidade e sem relação com `profiles.cpf` (RN16 violada). Grava também em `crm_leads`. Não há tipo de conta. Nome em branco não limpa (ok). |
| `sign_phone_send(p_phone, p_channel='sms')` | `{channel, to(mascarado), expires_in:600, resend_after:30}` | `email_not_confirmed, invalid_phone, invalid_channel, channel_unavailable, phone_in_use, too_soon, too_many` | Sem canal `email` (item 3). RN5: 6 envios/hora, não 4; código 6 dígitos e 10 min ok; hash ok. RN7: trocar o número **mantém** `phone_verified_at` (o número novo aparece como verificado). `phone_in_use` revela que um telefone é de outra conta. Código fica em claro em `sign_outbox.params` até ser enviado; nunca limpo se falhar ou não for configurado. |
| `sign_phone_verify(p_code)` | `sign_me()` | `email_not_confirmed, otp_invalid, otp_not_found, otp_expired, otp_locked` | **Limite de 5 tentativas ineficaz** (R1). Grava o destino em `profiles.phone` mesmo sendo e-mail se o canal fosse generalizado sem o ramo novo. `profiles.phone` é sobrescrito sem aviso. |
| `sign_cert_challenge()` | `{nonce (48 hex), text, roots_loaded}` | `email_not_confirmed` | Validade 5 min ok. Sem limite de criação por usuário e sem índice em `user_id`. A verificação RN9 não está aqui nem no repositório (Edge Function). `roots_loaded:false` precisa de estado de tela (sem raízes ativas = ninguém valida). |
| `sign_onboarding_done()` | `sign_me()` | `email_not_confirmed` | Não exige nada (nem perfil nem contato): RN18 diz só que o onboarding cai até a chamada; aceitável, mas então a tela deve checar `verified`/`cpf`. Idempotente (upsert). |
| `sign_otp_delivery()` | `{status: none\|queued\|sent\|failed\|not_configured, channel}` | nenhum além de permissão | Pega a última linha do outbox do usuário de qualquer template. Não há erro detalhado (bom). Serve para a tela mostrar "e-mail não configurado" em vez de esperar. |

Estados que o front deve tratar em `sign_phone_*`: `too_soon` (mostrar contagem de 30 s), `too_many`, `otp_expired` e `otp_locked` (botão "novo código"), `channel_unavailable` (esconder o canal), `not_configured`/`failed` vindo de `sign_otp_delivery`.

## 5. Mapa de vínculos da Parte 1
| Dado | Fonte única | Escreve | Lê |
|---|---|---|---|
| Login, e-mail, senha, MFA, sessão | `auth.users` (Supabase Auth) | Auth (`signUp`, recuperação, TOTP) | `_sign_me`, `sign_me`, todas as RPCs `sign_*` |
| Nome, CPF | `profiles.full_name/cpf` | `sign_profile_save` (e, após etapa A, `sign_account_save` só o nome) | `sign_me`, `_sign_account` (semente), `sign_company_link`, `_sign_cert_save` (confere CPF) |
| Telefone declarado | `profiles.phone` | `sign_phone_verify` (ramo telefone) | `sign_me` (fallback) |
| Contato verificado, certificado, onboarding | `sign_identity` | `sign_phone_send` (número), `sign_phone_verify`, `_sign_cert_save` (service_role), `sign_onboarding_done` | `sign_me`, `sign_env_create` (exige verificação), `sign_company_link`, Parte 2 |
| Código de verificação | `sign_otps` (hash) | `sign_phone_send/verify`, purga | só essas funções |
| Mensagem a entregar | `sign_outbox` | `sign_phone_send`; `_sign_outbox_done` (messenger) | `_sign_outbox_get` (messenger), `sign_otp_delivery` |
| Canais ligados | `sign_messaging_config` (id=1) | `sign_messaging_save` (equipe) | `sign_phone_send`, `sign_me`, `sign_messaging_get` |
| Desafio do certificado | `sign_cert_challenges` | `sign_cert_challenge`; `_sign_cert_take` | Edge Function de certificado |
| Raízes ICP | `sign_trusted_roots` | `sign_root_add/toggle` (`is_staff()`) | `_sign_cert_take`, `sign_roots_list` |
| Conta, plano, cota | `sign_accounts` | `_sign_account` (cria sob demanda), `sign_plan_request`, Admin | `sign_plan_state` (Parte 5); `crm_leads` espelha via `_crm_sync_sign` |
| Empresa vinculada | `companies`, `sign_company_links` | `sign_company_link/unlink/decide` | `sign_me.companies` (v2) |
Tabelas `sign_*`: RLS ligada e sem policy (lido no export: acesso só por RPC), conforme manual 13.

## 6. Riscos de segurança
| # | Risco | Gravidade | Ação |
|---|---|---|---|
| R1 | `sign_phone_verify`: o `update attempts+1` é desfeito pelo `raise otp_invalid` (mesma transação). Só o limite de envios (30 s e 6/h) freia; as tentativas de verificação são praticamente ilimitadas nos 10 min. Deduzido da semântica do plpgsql, **não reproduzi** (exige escrita). | Alta | Migração do item 3 (retornar `ok:false`) e teste local: 6 códigos errados seguidos, depois o certo, deve dar `otp_locked`. |
| R2 | Código OTP em claro em `sign_outbox.params` (só zera em `sent`). | Média | Purga de 15 min (item 3); `sign-messenger` não deve logar o corpo. |
| R3 | Nome do remetente em evidência vem de `raw_user_meta_data` (o usuário edita via `auth.updateUser`): pode se passar por outra pessoa/empresa nos e-mails ao signatário. | Alta | T-02 etapa A: usar `profiles.full_name`; no cadastro, não confiar em metadata. |
| R4 | Enumeração: `cpf_in_use`, `phone_in_use` (conta logada pode sondar CPFs/telefones); `signUp` do Auth pode revelar e-mail existente conforme configuração (não verificada). | Média | Limite de tentativas por usuário em `sign_profile_save`; mensagem neutra no front; conferir "Confirm email" ligado e resposta do `signUp`. |
| R5 | `sign_profile_save` grava em `profiles` compartilhada: pode alterar CPF de usuário de Partners/Wealth. | Alta | Recusar troca de CPF quando o usuário tem vínculo (`company_members`/`funder_members`) ou CPF já preenchido; só preencher se vazio. |
| R6 | `anon` executa 7 `sign_*` (`sign_env_public_*`, `sign_public_*`, `sign_collection_*`) e `verify_*`, mais helpers com `public` (`_cpf_ok`... `_sha256`, `_sign_mask_phone`): por desenho, por token. Fora da Parte 1: `verify_envelope_pdf` responde `code_invalid` x `cpf_mismatch`, o que permite saber se um código existe (Parte 4). | Baixa/Média | Registrar para as Partes 3 e 4; limite de uso (manual 13, endpoint público). |
| R7 | IDOR: não achei parâmetro de id de usuário nas RPCs da Parte 1 (todas usam `auth.uid()`); `sign_contact_save` filtra por `user_id`. Só lido, sem teste com duas contas. | OK | Teste de duas contas na verificação. |
| R8 | `sign_root_*` e `sign_messaging_*` dependem de `is_staff()`, que só exige `aal2` se `backoffice_settings.require_mfa` for true (valor de produção não consultado). | Média | Conferir em produção (SELECT); recomendar true. |
| R9 | Edge Functions `sign-messenger` e de certificado fora do repositório: `verify_jwt`, assinatura e logs não auditados; `_sign_cert_save` confia no JSON de quem chama (service_role). | Média | Versionar em `supabase/functions` antes de construir a seção 5. |
| R10 | Configurações do Auth que a ficha supõe (senha mínima 10, senhas vazias bloqueadas, expiração do link 1 h, sessão) estão no painel e não foram lidas; proteção contra senhas vazadas e tempo limite de sessão parecem exigir plano pago (confirmar). | Média | Yuri/Desenvolvedor conferem o painel; ajustar RN2/RN4/RN13 ao que couber. |
| R11 | Sem índice em `sign_identity.phone` (checagem `phone_in_use` varre a tabela) e sem unicidade no banco do telefone verificado. | Baixa | Índice único parcial no item 3. |

## Pendências a registrar
Yuri: P1-02, P1-04 (RN3/RN13 reduzidos), P1-05, P1-06, P1-11, `sms_enabled=false` em produção, `require_mfa`. Jurídico: P1-08 a P1-10 (inalterados). Time: versionar as duas Edge Functions; confirmar `unique(cpf)` em `profiles`; auditoria de divergência T-02 em produção (SELECT).
