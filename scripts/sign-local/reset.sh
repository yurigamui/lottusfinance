#!/usr/bin/env bash
# Recria o(s) banco(s) LOCAL(is) do Sign: prelúdio (auth/roles/stubs) + esquema real + [migração candidata] + seed fictício.
# Uso: reset.sh [antes|depois|ambos]   (padrão: ambos)
#   antes  -> banco "sign_antes": esquema atual, SEM a migração da 1.4 (prova a diferença nos testes)
#   depois -> banco "sign":       esquema atual + supabase/migrations/20261126120000_sign_perfil_fonte_unica.sql
# Precisa de: Postgres em 127.0.0.1:54350 (ver README) e do esquema em $SIGN_SCHEMA (fora do repositório, que é público).
# Nada é aplicado em produção: este script só fala com 127.0.0.1.
set -e
cd "$(dirname "$0")"
: "${SIGN_SCHEMA:?defina SIGN_SCHEMA com o caminho do esquema exportado (ver README)}"
MODO="${1:-ambos}"
MIG="../../supabase/migrations/20261126120000_sign_perfil_fonte_unica.sql"
export PGOPTIONS="-c check_function_bodies=off -c client_min_messages=warning"
PS="psql -X -q -h 127.0.0.1 -p ${PGPORT:-54350} -U postgres -v ON_ERROR_STOP=1"
build() { # $1 = nome do banco, $2 = com migração (1) ou sem (0)
  $PS -d postgres -c "drop database if exists $1 with (force)" -c "create database $1"
  $PS -d "$1" -f prelude.sql
  $PS -d "$1" -f "$SIGN_SCHEMA"
  if [ "$2" = "1" ]; then $PS -d "$1" -f "$MIG"; fi
  $PS -d "$1" -f seed.sql >/dev/null
  $PS -d "$1" -tAc "select '$1 pronto: ' || (select count(*) from public.sign_envelopes) || ' envelope(s), ' || (select count(*) from public.sign_env_signers) || ' signatário(s), ' || (select count(*) from public.profiles) || ' perfil(is)'"
}
case "$MODO" in
  antes)  build sign_antes 0 ;;
  depois) build sign 1 ;;
  ambos)  build sign_antes 0; build sign 1 ;;
  *) echo "uso: reset.sh [antes|depois|ambos]" >&2; exit 2 ;;
esac
