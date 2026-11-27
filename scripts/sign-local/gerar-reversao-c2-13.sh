#!/usr/bin/env bash
# Gera o arquivo de reversão da migração 20261129120000_sign_ciclo2_1_3.sql: as definições ATUAIS (pg_get_functiondef) das 3 funções que ela
# substitui (sign_me, sign_onboarding_done, _sign_outbox_purge), mais os drops do que ela cria (2 funções internas e 2 índices parciais).
# Rode no banco ANTES de aplicar a migração. Só lê o banco indicado (padrão "sign_antes", porta 54350). O arquivo contém código das funções do banco:
# grave FORA do repositório (público). Ex.:  scripts/sign-local/gerar-reversao-c2-13.sh sign_antes ~/sign-reversao-c2-13.sql
# NÃO reverte (ver o topo da migração): nomes gravados, onboarding_done já marcado, 'code' já removido do outbox, queued já viradas para failed.
set -e
DB="${1:-sign_antes}"
OUT="${2:?uso: gerar-reversao-c2-13.sh <banco> <arquivo de saída, fora do repositório>}"
case "$(cd "$(dirname "$OUT")" && pwd)/" in
  "$(cd "$(dirname "$0")/../.." && pwd)"/*) echo "recuso gravar dentro do repositório: $OUT" >&2; exit 2 ;;
esac
psql -X -q -h 127.0.0.1 -p "${PGPORT:-54350}" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -tA -c "
  select '-- reversão do ciclo 2 da 1.3 (gerada de ' || current_database() || ')';
  select pg_get_functiondef(p.oid) || ';' from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.proname in ('sign_me','sign_onboarding_done','_sign_outbox_purge') order by p.proname;
  select 'drop function if exists public._sign_name_ok(text);';
  select 'drop function if exists public._sign_name_visible(text);';
  select 'drop index if exists public.sign_outbox_code_idx;';
  select 'drop index if exists public.sign_outbox_queued_idx;';" > "$OUT"
echo "reversão gravada em $OUT ($(grep -c 'CREATE OR REPLACE FUNCTION' "$OUT") funções)"
