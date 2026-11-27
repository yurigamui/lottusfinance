#!/usr/bin/env bash
# Gera o arquivo de reversão da migração 20261128120000_sign_onboarding_e_ciclo2_1_5.sql: as definições ATUAIS (pg_get_functiondef) das 8 funções
# que ela substitui, mais os drops do que ela cria (função interna, índice e job do pg_cron). Rode no banco ANTES de aplicar a migração.
# Só lê o banco indicado (padrão "sign_antes", porta 54350). O arquivo contém código das funções do banco: grave FORA do repositório (público). Ex.:
#   scripts/sign-local/gerar-reversao-1-3.sh sign_antes ~/sign-reversao-1-3.sql
# NÃO reverte (ver o topo da migração): a limpeza do 'code' do outbox, queued antigos já viradas para failed, OTPs/desafios em voo, revokes, colunas.
set -e
DB="${1:-sign_antes}"
OUT="${2:?uso: gerar-reversao-1-3.sh <banco> <arquivo de saída, fora do repositório>}"
case "$(cd "$(dirname "$OUT")" && pwd)/" in
  "$(cd "$(dirname "$0")/../.." && pwd)"/*) echo "recuso gravar dentro do repositório: $OUT" >&2; exit 2 ;;
esac
psql -X -q -h 127.0.0.1 -p "${PGPORT:-54350}" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -tA -c "
  select '-- reversão da 1.3 e do ciclo 2 da 1.5 (gerada de ' || current_database() || ')';
  select pg_get_functiondef(p.oid) || ';' from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.proname in ('sign_me','sign_onboarding_done','sign_phone_send','sign_phone_verify','sign_cert_challenge','_sign_cert_take','_sign_outbox_purge','_sign_cpf_guarded_apply') order by p.proname;
  select 'drop function if exists public._sign_mask_cpf_text(text);';
  select 'drop index if exists public.sign_outbox_created_at_idx;';
  select 'do \$r\$ begin if exists (select 1 from pg_extension where extname = ''pg_cron'') then if exists (select 1 from cron.job where jobname = ''lottus-sign-outbox-purge'') then execute \$q\$select cron.unschedule(''lottus-sign-outbox-purge'')\$q\$; end if; end if; end \$r\$;';" > "$OUT"
echo "reversão gravada em $OUT ($(grep -c 'CREATE OR REPLACE FUNCTION' "$OUT") funções)"
