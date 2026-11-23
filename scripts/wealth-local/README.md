# Wealth em ambiente local (teste sem tocar a produção)

Roda o front `apps/wealth` contra **as funções reais do banco do Wealth** num Postgres local, com um Supabase falso
(`fake-supabase.cjs`) que imita só o que o Wealth usa: login, cadastro, MFA simplificado e `/rest/v1/rpc/*`.
Cada RPC roda como o papel `authenticated` com o usuário do token, como o PostgREST faz. Nada sai da máquina.

## 1. Esquema (fica FORA do repositório, que é público)
Exporte, só em leitura, as tabelas `w_*` e as funções `w_*`, `_w_*`, `_sha256`, `_email_html`, `_html_escape` e
`_send_email` do projeto (a consulta usada está em `docs/agente/wealth/relatorio.md`, seção "Ambiente de teste") e
salve num arquivo local, por exemplo `~/wealth-schema.sql`.

## 2. Subir
```bash
sudo -u postgres /usr/lib/postgresql/16/bin/initdb -D /var/lib/postgresql/wealth-local -A trust -U postgres
```
```bash
sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/wealth-local -o "-p 54340 -c listen_addresses=127.0.0.1" -l /var/lib/postgresql/wealth-local/log start
```
```bash
WEALTH_SCHEMA=~/wealth-schema.sql scripts/wealth-local/reset.sh
```
```bash
npm --prefix scripts/wealth-local install pg@8 && node scripts/wealth-local/fake-supabase.cjs
```

## 3. Testar
`node scripts/wealth-local/testes/t-entrada.cjs` (e os demais `t-*.cjs`). O driver (`drv.cjs`) serve `apps/wealth`
com a CSP do `_headers` e desvia o endereço do Supabase de produção para o falso local. Usuários de exemplo
(senha `senha-exemplo-1`): `ana.gestora@`, `bruno.editor@`, `carla.visual@`, `davi.intruso@` (`exemplo.com.br`).
Capturas: defina `SHOTS=<pasta>`.
