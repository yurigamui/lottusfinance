# Sign: ambiente de teste local

Criado em 24/11/2026. Como subir: `scripts/sign-local/README.md`. Banco Postgres 16 em `127.0.0.1:54350` (dados em
`/var/lib/postgresql/sign-local`), com o esquema real do Sign exportado em leitura do projeto de produção para `~/sign-schema.sql`
(fora do repositório, que é público; **não commitar**). Nada foi escrito em produção e nenhuma migração foi aplicada.

## Como subir (resumo)
1. `initdb` + `pg_ctl start` na porta 54350 (comandos no README).
2. `SIGN_SCHEMA=~/sign-schema.sql scripts/sign-local/reset.sh` (recria o banco `sign`: `prelude.sql` + esquema + `seed.sql`).
3. `psql -X -h 127.0.0.1 -p 54350 -U postgres -d sign -f scripts/sign-local/prova.sql`.

## O que funciona (provado com `prova.sql`, papéis `authenticated` e `anon`)
- `sign_me`, `sign_plan_state`, `sign_contact_save`, `sign_phone_send` e `sign_phone_verify` (código OTP lido de `sign_outbox`).
- `sign_env_create` (PDF mínimo, 1 e 2 signatários), `sign_env_list`, `sign_env_get`, `sign_env_inbox`, `sign_env_my_link`, `sign_env_cancel`, `sign_env_remind`.
- Fluxo público: `sign_env_public_get` (token errado = `link_invalid`; certo = dados sem CPF completo), `sign_env_public_submit` com CPF errado (`cpf_mismatch`, `remaining` cai de 4 a 0), bloqueio após 5 erros (`too_many_attempts`), CPF certo (envelope fecha: `complete: true`, status `completed`, evento `completed`), reuso do token (`link_invalid`).
- `verify_envelope` (código curto = `code_invalid`), `verify_envelope_pdf` (CPF de outra pessoa = `cpf_mismatch`).
- Isolamento: outro usuário lê envelope alheio = `not_found`; sem telefone verificado = `identity_required`.
- Permissões: `anon` recebe `permission denied` em `sign_env_create`, `sign_me`, `sign_env_list`, `_senv_event` e nas tabelas; `authenticated` também não lê tabela direto (RLS ligado e sem grant).
- Cadeia de hash dos eventos do envelope: nenhum elo quebrado após o fluxo.
- Reset repetido sem erro (idempotente por recriar o banco).

## O que foi stubado (arquivo `prelude.sql`)
- `auth.users`, `auth.sessions`, `auth.uid()`, `auth.jwt()` (lê `request.jwt.claims`), roles `anon`/`authenticated`/`service_role`. Não há GoTrue: o login não existe, o teste "é" o usuário pelo `set_config`.
- `net.http_post`: não sai da máquina; grava em `net.http_calls`. É de lá que o teste lê o token do e-mail.
- `vault.decrypted_secrets`, `vault.create_secret`, `vault.update_secret`: tabela comum, sem criptografia. Há um token falso do Postmark (`token-falso-local`) para `_send_email` seguir o caminho "com token" (a função real foi mantida; o e-mail fica `queued` em `email_log`).
- `pgcrypto` no schema `extensions` (como no Supabase).
- Tabelas de outras plataformas só com as colunas que o Sign lê: `profiles`, `companies`, `company_members`, `api_partners`, `funders`, `funder_members`, `operations`, `platform_flags`, `staff_users`, `backoffice_settings`, `app_settings` (valores `exemplo.com.br`), `email_log`, `crm_leads`, `crm_activities`, `customer_events`, `customer_meta`, `admin_notifications`, `one_contracts`, `one_contract_events`.
- Funções reconstruídas ou vazias: `_my_funder_id` (lê `funder_members`), `_one_first_billing` (devolve `null`).
- `sign_plans` do seed são inventados (`free`, `pro`); a função real exige o plano `free` (default da conta).

## O que NÃO é fiel à produção (lacunas)
- Funções que o Sign chama mas que **não foram exportadas** e portanto não existem aqui: `_attach_contract`, `_col_done`, `_op_try_approve`, `_operation_document`, `_require_company`. Quebram: gravação de evidência em `signature_evidence` pelos gatilhos de contrato-mãe/antecipação (`_record_signature_full`), `signature_receipt`, o gatilho `col_signed_hook` (coleta de fundos) e `_sign_operation`.
- `sign_profile_save`, `sign_account_save`, `sign_cert_*`, `sign_onboarding_done` não foram chamadas na prova (o seed insere perfil e identidade direto).
- Tabelas sem stub (as funções que as usam falham ao executar): `fund_documents`, `funder_parties`, `identity_verifications`, `user_devices`, `operation_requests`, `invoices`, `invoice_installments`, `operation_items`, `agreement_versions`. Portanto não foram testadas: `sign_company_*` (vínculo de empresa), `sign_public_get/submit` (documentos de fundos), `sign_collection_*`, `verify_collection*`, `sign_my_documents`, `sign_my_link`, `_signature_context`.
- `unique(cpf)` em `profiles` foi inferido do código (`sign_profile_save` trata `unique_violation` como `cpf_in_use`); confirmar no esquema real.
- `backoffice_settings.require_mfa` está `false` e `staff_users` vazio: `sign_messaging_*` e `sign_root_*` (que exigem `is_staff()`) não foram exercitadas.
- E-mail, SMS, WhatsApp e Edge Functions (`sign-messenger`, `signature-mail`) não existem: `_call_function` devolve `false` (sem token interno no Vault). O conteúdo do e-mail só aparece em `net.http_calls`.
- `request.headers` (IP, user-agent) só existe se o teste definir (`set_config('request.headers', ...)`). Em produção quem põe é o PostgREST.
- `sign_envelopes_one` (contrato assinado => `one_contracts`) roda contra tabela vazia: a regra de cobrança real não foi testada.
- RLS: em produção as tabelas do Sign não têm policy (acesso só por RPC `SECURITY DEFINER`); o local reproduz isso, mas não há teste de PostgREST (cabeçalhos, `Prefer`, limites de tamanho do corpo).
- Desempenho (PDF de até 10 MB, índices com volume) não foi medido.

## Achados ao exportar/provar (não corrigidos; para o `verificador`)
- Nenhum erro de produção foi visto nas RPCs testadas. A única falha de verdade na prova foi local: `sign_env_public_submit` quebrava ao concluir o envelope porque `_one_first_billing` não existia (resolvido com o stub acima). Em produção a função existe.
- Observação de produto: após 5 CPFs errados o link do signatário trava (`too_many_attempts`) mesmo com o CPF certo; só é destravado por novo link (`sign_env_my_link` ou lembrete do remetente, que zeram `attempts`). Decidir se é o comportamento desejado.
