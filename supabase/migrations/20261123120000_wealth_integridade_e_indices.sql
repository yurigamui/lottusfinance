-- 20261123120000_wealth_integridade_e_indices.sql
-- Plataforma: Wealth · Origem: auditoria Beta de 23/11/2026 (docs/agente/wealth/relatorio.md, achados W-A1, W-A2, W-A3)
-- Estado: PRONTA, NÃO APLICADA. Testar primeiro num branch do Supabase (docs/agente/depende-de-mim.md, D-01).
--
-- O que faz
--   1. W-A1 (alto) e W-A1b: impede que um lançamento de gastos (w_spend_tx) ou uma regra (w_rules) aponte para
--      contraparte, centro de custo ou grupo (w_cadastros) de OUTRA carteira, ou de tipo errado.
--      Hoje w_spend_update e w_rule_save aceitam esses ids do cliente sem conferir a carteira.
--      A correção é um gatilho de validação: não muda nenhuma RPC e vale para qualquer caminho de escrita.
--      Um cadastro em uso também não pode mudar de carteira ou de tipo (gatilho em w_cadastros).
--   2. W-A2 (médio): índices nas chaves estrangeiras e em wallet_id que não têm índice de apoio
--      (filtros por carteira, junções e ON DELETE ficam sem varredura completa).
--   3. W-A3 (médio): _guard_delete nas tabelas financeiras do Wealth (w_invoices, w_payment_events),
--      no mesmo padrão das tabelas financeiras do restante do banco.
--
-- Como reverter
--   drop trigger if exists w_spend_tx_cad_refs on public.w_spend_tx;
--   drop trigger if exists w_rules_cad_refs on public.w_rules;
--   drop function if exists public._w_check_cad_refs();
--   drop trigger if exists guard_delete on public.w_invoices; drop trigger if exists guard_truncate on public.w_invoices;
--   drop trigger if exists guard_delete on public.w_payment_events; drop trigger if exists guard_truncate on public.w_payment_events;
--   drop trigger if exists w_cadastros_lock on public.w_cadastros; drop function if exists public._w_cadastro_lock();
--   drop index if exists public.w_spend_tx_counterparty_idx, public.w_spend_tx_cost_center_idx, public.w_spend_tx_group_idx, public.w_spend_tx_import_idx, public.w_rules_wallet_idx, public.w_rules_counterparty_idx, public.w_rules_cost_center_idx, public.w_rules_group_idx, public.w_imports_wallet_idx, public.w_invest_tx_asset_idx, public.w_invest_tx_import_idx, public.w_bank_accounts_wallet_idx, public.w_other_wallet_idx, public.w_members_group_idx, public.w_api_keys_user_idx, public.w_group_members_user_idx;
--
-- Diagnóstico antes de aplicar (somente leitura): linhas já inconsistentes. Em 23/11/2026 esta consulta, rodada só em leitura
-- na produção pela auditoria, deu 0 nas duas tabelas. Rode de novo no branch e antes de aplicar.
--   select count(*) from public.w_spend_tx s where (s.counterparty_id is not null and not exists (select 1 from public.w_cadastros c
--     where c.id = s.counterparty_id and c.wallet_id = s.wallet_id and c.kind = 'contraparte')) or (s.cost_center_id is not null and
--     not exists (select 1 from public.w_cadastros c where c.id = s.cost_center_id and c.wallet_id = s.wallet_id and c.kind = 'centro'))
--     or (s.group_id is not null and not exists (select 1 from public.w_cadastros c where c.id = s.group_id and c.wallet_id = s.wallet_id and c.kind = 'grupo'));
--   (a mesma consulta trocando w_spend_tx por w_rules)
--
-- Teste: scripts/test-db.sh (Postgres local) e, no branch, supabase/tests/wealth_integridade.sql

begin;

-- 1. Validação de referências a w_cadastros ---------------------------------------------------------
create or replace function public._w_check_cad_refs()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_all boolean := tg_op = 'INSERT' or new.wallet_id is distinct from old.wallet_id;
begin
  -- No UPDATE só valida a coluna que mudou (ou todas, se a carteira mudou): dado antigo inconsistente
  -- não trava edição de outra coluna nem o ON DELETE SET NULL de outro cadastro.
  if new.counterparty_id is not null and (v_all or new.counterparty_id is distinct from old.counterparty_id) and not exists (
       select 1 from public.w_cadastros c
       where c.id = new.counterparty_id and c.wallet_id = new.wallet_id and c.kind = 'contraparte') then
    raise exception 'invalid_reference' using detail = 'counterparty_id não pertence a esta carteira';
  end if;
  if new.cost_center_id is not null and (v_all or new.cost_center_id is distinct from old.cost_center_id) and not exists (
       select 1 from public.w_cadastros c
       where c.id = new.cost_center_id and c.wallet_id = new.wallet_id and c.kind = 'centro') then
    raise exception 'invalid_reference' using detail = 'cost_center_id não pertence a esta carteira';
  end if;
  if new.group_id is not null and (v_all or new.group_id is distinct from old.group_id) and not exists (
       select 1 from public.w_cadastros c
       where c.id = new.group_id and c.wallet_id = new.wallet_id and c.kind = 'grupo') then
    raise exception 'invalid_reference' using detail = 'group_id não pertence a esta carteira';
  end if;
  return new;
end;
$$;

-- A2: o cadastro em uso não pode mudar de carteira nem de tipo (fecharia o mesmo buraco pelo outro lado).
create or replace function public._w_cadastro_lock()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.wallet_id is distinct from old.wallet_id or new.kind is distinct from old.kind) and (
       exists (select 1 from public.w_spend_tx t where t.counterparty_id = old.id or t.cost_center_id = old.id or t.group_id = old.id)
    or exists (select 1 from public.w_rules r where r.counterparty_id = old.id or r.cost_center_id = old.id or r.group_id = old.id)) then
    raise exception 'in_use' using detail = 'cadastro em uso não pode mudar de carteira nem de tipo';
  end if;
  return new;
end;
$$;
revoke all on function public._w_cadastro_lock() from public, anon, authenticated;

drop trigger if exists w_cadastros_lock on public.w_cadastros;
create trigger w_cadastros_lock
  before update of wallet_id, kind on public.w_cadastros
  for each row execute function public._w_cadastro_lock();

-- Função interna de gatilho: ninguém a executa por RPC.
revoke all on function public._w_check_cad_refs() from public, anon, authenticated;

drop trigger if exists w_spend_tx_cad_refs on public.w_spend_tx;
create trigger w_spend_tx_cad_refs
  before insert or update of counterparty_id, cost_center_id, group_id, wallet_id on public.w_spend_tx
  for each row execute function public._w_check_cad_refs();

drop trigger if exists w_rules_cad_refs on public.w_rules;
create trigger w_rules_cad_refs
  before insert or update of counterparty_id, cost_center_id, group_id, wallet_id on public.w_rules
  for each row execute function public._w_check_cad_refs();

-- 2. Índices de apoio ---------------------------------------------------------------------------------
create index if not exists w_spend_tx_counterparty_idx on public.w_spend_tx (counterparty_id) where counterparty_id is not null;
create index if not exists w_spend_tx_cost_center_idx  on public.w_spend_tx (cost_center_id)  where cost_center_id is not null;
create index if not exists w_spend_tx_group_idx        on public.w_spend_tx (group_id)        where group_id is not null;
create index if not exists w_spend_tx_import_idx       on public.w_spend_tx (import_id)       where import_id is not null;
create index if not exists w_rules_wallet_idx          on public.w_rules (wallet_id, priority);
create index if not exists w_rules_counterparty_idx    on public.w_rules (counterparty_id) where counterparty_id is not null;
create index if not exists w_rules_cost_center_idx     on public.w_rules (cost_center_id)  where cost_center_id is not null;
create index if not exists w_rules_group_idx           on public.w_rules (group_id)        where group_id is not null;
create index if not exists w_imports_wallet_idx        on public.w_imports (wallet_id, created_at desc);
create index if not exists w_invest_tx_asset_idx       on public.w_invest_tx (asset_id);
create index if not exists w_invest_tx_import_idx      on public.w_invest_tx (import_id) where import_id is not null;
create index if not exists w_bank_accounts_wallet_idx  on public.w_bank_accounts (wallet_id);
create index if not exists w_other_wallet_idx          on public.w_other (wallet_id);
create index if not exists w_members_group_idx         on public.w_members (group_id) where group_id is not null;
create index if not exists w_api_keys_user_idx         on public.w_api_keys (user_id);
create index if not exists w_group_members_user_idx    on public.w_group_members (user_id);

-- 3. Proteção contra apagamento nas tabelas financeiras ------------------------------------------------
drop trigger if exists guard_delete on public.w_invoices;
create trigger guard_delete before delete on public.w_invoices for each row execute function public._guard_delete();
drop trigger if exists guard_truncate on public.w_invoices;
create trigger guard_truncate before truncate on public.w_invoices for each statement execute function public._guard_delete();

drop trigger if exists guard_delete on public.w_payment_events;
create trigger guard_delete before delete on public.w_payment_events for each row execute function public._guard_delete();
drop trigger if exists guard_truncate on public.w_payment_events;
create trigger guard_truncate before truncate on public.w_payment_events for each statement execute function public._guard_delete();

commit;
