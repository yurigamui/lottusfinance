# Sign em ambiente local (teste sem tocar a produção)

Postgres 16 local com **as funções reais do Sign** (`sign_*`, `verify_*` e as internas), para testar as RPCs como os papéis
`anon` e `authenticated`, como o PostgREST faz. Nada sai da máquina. Modelo: `scripts/wealth-local`.
Detalhes do que é fiel e do que é stub: `docs/agente/sign/ambiente-local.md`.

## 1. Esquema (fica FORA do repositório, que é público)
Exporte, só em leitura, do projeto Supabase: as tabelas `sign_*`, `signature_evidence`, `signature_notifications`, `api_signers`,
`fund_collections`, `fund_collection_signers` (colunas, defaults, PK/FK/CHECK/UNIQUE, índices, RLS, triggers) e as funções
`sign_*`, `_sign*`, `_senv*`, `_collection*`, `_record_signature*`, `_signature*`, `verify_*`, mais `_cpf_ok`, `_cnpj_ok`, `_sha256`,
`_html_escape`, `_email_html`, `_send_email`, `_email_config`, `_email_paused`, `_email_funder`, `_call_function`, `is_staff`,
`_crm_sync_sign`, `_crm_log` e as funções de trigger delas; inclua os GRANT/REVOKE de execute. Salve em um arquivo local, por
exemplo `~/sign-schema.sql` (ordem: tabelas e índices, funções, triggers, grants). **Nunca commite esse arquivo.**

## 2. Subir
```bash
sudo -u postgres /usr/lib/postgresql/16/bin/initdb -D /var/lib/postgresql/sign-local -A trust -U postgres
```
```bash
sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/sign-local -o "-p 54350 -c listen_addresses=127.0.0.1" -l /var/lib/postgresql/sign-local/log start
```
```bash
SIGN_SCHEMA=~/sign-schema.sql scripts/sign-local/reset.sh
```
(Como root, troque `sudo -u postgres` por `su postgres -c "..."`.) O `reset.sh` apaga e recria o banco `sign`: prelúdio, esquema, seed.

## 3. Testar
```bash
psql -X -h 127.0.0.1 -p 54350 -U postgres -d sign -f scripts/sign-local/prova.sql
```
`prova.sql` chama as RPCs como `authenticated`/`anon` e mostra o que deu certo e o que foi negado. Para escrever outros testes:
`select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', false); set role authenticated;`
(e `set role anon;` para público; `reset role;` volta). O link de assinatura que iria no e-mail fica em `net.http_calls`
(o `net.http_post` é um stub), no campo `body->>'HtmlBody'`.

Usuários de exemplo (senha `senha-exemplo-1`, `exemplo.com.br`): `ana.sign@` (remetente, telefone verificado), `bruno.sign@`,
`carla.sign@` (signatários do envelope de exemplo), `davi.sign@` (sem verificação). CPFs são válidos e fictícios.
