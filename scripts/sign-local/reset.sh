#!/usr/bin/env bash
# Recria o banco LOCAL do Sign: prelúdio (auth/roles/stubs) + esquema real + seed fictício.
# Precisa de: Postgres em 127.0.0.1:54350 (ver README) e do esquema em $SIGN_SCHEMA (fora do repositório, que é público).
set -e
cd "$(dirname "$0")"
: "${SIGN_SCHEMA:?defina SIGN_SCHEMA com o caminho do esquema exportado (ver README)}"
export PGOPTIONS="-c check_function_bodies=off -c client_min_messages=warning"
PS="psql -X -q -h 127.0.0.1 -p ${PGPORT:-54350} -U postgres -v ON_ERROR_STOP=1"
$PS -d postgres -c "drop database if exists sign with (force)" -c "create database sign"
$PS -d sign -f prelude.sql
$PS -d sign -f "$SIGN_SCHEMA"
$PS -d sign -f seed.sql >/dev/null
$PS -d sign -tAc "select 'sign pronto: ' || (select count(*) from public.sign_envelopes) || ' envelope(s), ' || (select count(*) from public.sign_env_signers) || ' signatário(s)'"
