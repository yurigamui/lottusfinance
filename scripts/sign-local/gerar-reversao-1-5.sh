#!/usr/bin/env bash
# Gera o arquivo de reversão da migração 20261127120000_sign_verificacao_identidade.sql: as definições ATUAIS (pg_get_functiondef) das 8 funções
# que ela substitui, mais os drops do que ela cria. Rode no banco ANTES de aplicar a migração. Só lê o banco indicado (padrão "sign_antes", porta 54350).
# O arquivo gerado contém código das funções do banco: grave FORA do repositório (que é público). Ex.:
#   scripts/sign-local/gerar-reversao-1-5.sh sign_antes ~/sign-reversao-1-5.sql
set -e
DB="${1:-sign_antes}"
OUT="${2:?uso: gerar-reversao-1-5.sh <banco> <arquivo de saída, fora do repositório>}"
case "$(cd "$(dirname "$OUT")" && pwd)/" in
  "$(cd "$(dirname "$0")/../.." && pwd)"/*) echo "recuso gravar dentro do repositório: $OUT" >&2; exit 2 ;;
esac
psql -X -q -h 127.0.0.1 -p "${PGPORT:-54350}" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -tA -c "
  select '-- reversão da 1.5 (gerada de ' || current_database() || ')';
  select pg_get_functiondef(p.oid) || ';' from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.proname in ('sign_me','sign_phone_send','sign_phone_verify','sign_cert_challenge','_sign_cert_save','sign_env_create','sign_profile_save','sign_account_save') order by p.proname;
  select 'drop trigger if exists sign_outbox_scrub on public.sign_outbox;';
  select 'drop trigger if exists sign_profiles_phone_rn7 on public.profiles;';
  select 'drop function if exists public._sign_outbox_scrub();';
  select 'drop function if exists public._sign_outbox_purge();';
  select 'drop function if exists public._sign_profile_phone_rn7();';
  select 'drop function if exists public._sign_cpf_guarded_apply(uuid, text, text, text);';
  select 'drop function if exists public._sign_phone_norm(text);';
  select 'drop function if exists public._sign_mask_email(text);';
  select 'drop table if exists public.sign_cpf_attempts;';
  select 'alter table public.sign_outbox drop constraint if exists sign_outbox_channel_check;';
  select 'alter table public.sign_outbox add constraint sign_outbox_channel_check check (channel in (''sms'', ''whatsapp'')) not valid;  -- not valid: linhas email já gravadas não impedem a reversão (decidir o destino delas com o Yuri)';" > "$OUT"
echo "reversão gravada em $OUT ($(grep -c 'CREATE OR REPLACE FUNCTION' "$OUT") funções)"
