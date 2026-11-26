#!/usr/bin/env bash
# Gera o arquivo de reversão da migração 20261126120000_sign_perfil_fonte_unica.sql: as definições ATUAIS das 5 funções que ela substitui
# (pg_get_functiondef) mais os drops das 3 funções novas. Só lê o banco indicado (padrão: banco local "sign_antes", porta 54350).
# O arquivo gerado contém código das funções do banco: grave FORA do repositório (que é público). Ex.:
#   scripts/sign-local/gerar-reversao.sh sign_antes ~/sign-reversao-1-4.sql
set -e
DB="${1:-sign_antes}"
OUT="${2:?uso: gerar-reversao.sh <banco> <arquivo de saída, fora do repositório>}"
case "$(cd "$(dirname "$OUT")" && pwd)/" in
  "$(cd "$(dirname "$0")/../.." && pwd)"/*) echo "recuso gravar dentro do repositório: $OUT" >&2; exit 2 ;;
esac
psql -X -q -h 127.0.0.1 -p "${PGPORT:-54350}" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -tA -c "
  select '-- reversão da 1.4 (gerada de ' || current_database() || ')';
  select pg_get_functiondef(p.oid) || ';' from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.proname in ('sign_me','sign_profile_save','sign_account_save','sign_plan_state','_senv_owner_name') order by p.proname;
  select 'drop function if exists public._sign_profile_apply(uuid, text, text, text);';
  select 'drop function if exists public._sign_cpf_locked(uuid);';
  select 'drop function if exists public._sign_name_norm(text);';" > "$OUT"
echo "reversão gravada em $OUT ($(grep -c 'CREATE OR REPLACE FUNCTION' "$OUT") funções)"
