#!/usr/bin/env bash
# Recria o(s) banco(s) LOCAL(is) do Sign: prelúdio (auth/roles/stubs) + esquema real + [migração candidata] + seed fictício.
# Uso: reset.sh [antes|depois|ambos]   (padrão: ambos)
#   antes  -> banco "sign_antes": esquema atual, SEM a migração da 1.4 (prova a diferença nos testes)
#   depois -> banco "sign":       esquema atual + migrações 20261126120000 (1.4), 20261127120000 (1.5), 20261128120000 (1.3 + ciclo 2 da 1.5) e 20261129120000 (ciclo 2 da 1.3), nessa ordem
#   antes15 -> banco "sign_antes": esquema atual + 1.4 + 1.5 (SEM a 1.3): o ANTES da seção 1.3 e do pacote C2-15
#   antes13 -> banco "sign_antes": esquema atual + 1.4 + 1.5 + 1.3 (SEM a 20261129120000, ciclo 2 da 1.3): o ANTES do pacote C2-13
#   Com SIGN_SO_ATE=1.3 o "depois" recebe até 20261128120000 (sem o ciclo 2 da 1.3). Com SIGN_SO_ATE=1.4 o "depois" recebe só a migração da 1.4 (prova a 1.5 sobre a 1.4); com SIGN_SO_ATE=1.5, 1.4 e 1.5 (prova a 1.3 sobre a 1.5).
# Precisa de: Postgres em 127.0.0.1:54350 (ver README) e do esquema em $SIGN_SCHEMA (fora do repositório, que é público).
# Nada é aplicado em produção: este script só fala com 127.0.0.1.
set -e
cd "$(dirname "$0")"
: "${SIGN_SCHEMA:?defina SIGN_SCHEMA com o caminho do esquema exportado (ver README)}"
MODO="${1:-ambos}"
BD_DEPOIS="${SIGN_DB:-sign}"          # SIGN_DB=sign_dev: banco isolado de quem testa (não mexe no "sign" de outros)
BD_ANTES="${SIGN_DB_ANTES:-sign_antes}"
MIG="../../supabase/migrations/20261126120000_sign_perfil_fonte_unica.sql"
MIG15="../../supabase/migrations/20261127120000_sign_verificacao_identidade.sql"
MIG13="../../supabase/migrations/20261128120000_sign_onboarding_e_ciclo2_1_5.sql"
MIG29="../../supabase/migrations/20261129120000_sign_ciclo2_1_3.sql"
export PGOPTIONS="-c check_function_bodies=off -c client_min_messages=warning"
PS="psql -X -q -h 127.0.0.1 -p ${PGPORT:-54350} -U postgres -v ON_ERROR_STOP=1"
build() { # $1 = nome do banco, $2 = com migração (1) ou sem (0)
  $PS -d postgres -c "drop database if exists $1 with (force)" -c "create database $1"
  $PS -d "$1" -f prelude.sql
  $PS -d "$1" -f "$SIGN_SCHEMA"
  if [ "$2" = "1" ]; then
    $PS -d "$1" -f "$MIG"
    if [ "${SIGN_SO_ATE:-}" != "1.4" ]; then $PS -d "$1" -f "$MIG15"; fi
    if [ "${SIGN_SO_ATE:-}" != "1.4" ] && [ "${SIGN_SO_ATE:-}" != "1.5" ]; then $PS -d "$1" -f "$MIG13"; fi
    if [ "${SIGN_SO_ATE:-}" != "1.4" ] && [ "${SIGN_SO_ATE:-}" != "1.5" ] && [ "${SIGN_SO_ATE:-}" != "1.3" ]; then $PS -d "$1" -f "$MIG29"; fi
  fi
  $PS -d "$1" -f seed.sql >/dev/null
  $PS -d "$1" -tAc "select '$1 pronto: ' || (select count(*) from public.sign_envelopes) || ' envelope(s), ' || (select count(*) from public.sign_env_signers) || ' signatário(s), ' || (select count(*) from public.profiles) || ' perfil(is)'"
}
case "$MODO" in
  antes)  build "$BD_ANTES" 0 ;;
  depois) build "$BD_DEPOIS" 1 ;;
  antes15) SIGN_SO_ATE=1.5 build "$BD_ANTES" 1 ;;
  antes13) SIGN_SO_ATE=1.3 build "$BD_ANTES" 1 ;;
  ambos)  build "$BD_ANTES" 0; build "$BD_DEPOIS" 1 ;;
  *) echo "uso: reset.sh [antes|depois|ambos|antes15|antes13]" >&2; exit 2 ;;
esac
