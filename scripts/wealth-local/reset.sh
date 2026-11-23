#!/usr/bin/env bash
# Recria o banco LOCAL do Wealth: prelúdio (auth/roles falsos) + esquema real + seeds fictícios.
# Precisa de: Postgres em 127.0.0.1:54340 (ver README) e do esquema em $WEALTH_SCHEMA (fora do repositório).
set -e
cd "$(dirname "$0")"
: "${WEALTH_SCHEMA:?defina WEALTH_SCHEMA com o caminho do esquema exportado (ver README)}"
export PGOPTIONS="-c check_function_bodies=off -c client_min_messages=warning"
PS="psql -X -q -h 127.0.0.1 -p ${PGPORT:-54340} -U postgres -v ON_ERROR_STOP=1"
$PS -d postgres -c "drop database if exists wealth with (force)" -c "create database wealth"
$PS -d wealth -f prelude.sql
$PS -d wealth -f "$WEALTH_SCHEMA"
# Migrações do Wealth (as do Admin dependem de tabelas que não existem aqui). Erro em qualquer uma interrompe o reset.
for m in ../../supabase/migrations/*wealth*.sql ../../supabase/migrations/*seguranca*.sql; do echo "· $(basename "$m")" >&2; $PS -d wealth -f "$m"; done
$PS -d wealth -f post.sql
$PS -d wealth -f seed.sql >/dev/null
$PS -d wealth -tAc "select id from public.w_wallets where name = 'Família Exemplo'"
