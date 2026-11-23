-- 20261123123000_wealth_posicao_nao_negativa.sql
-- Plataforma: Wealth · Seções: Investimentos (Transações, Posição) · Origem: auditoria de 23/11/2026, achado WE-06 (alto)
-- Estado: PRONTA, NÃO APLICADA. Testar primeiro num branch do Supabase.
--
-- O problema: w_tx_save, w_tx_delete e w_tx_import aceitavam uma venda maior que a quantidade em carteira
-- (ou a exclusão de uma compra que sustentava vendas posteriores). A posição ficava negativa (ex.: -390 ações)
-- e o patrimônio, a rentabilidade e os pesos da carteira passavam a mostrar números errados.
--
-- O que faz: gatilho de restrição ADIADO (roda no fim da transação, depois de todas as linhas de uma importação)
-- que recusa com 'position_negative' qualquer mudança que deixe a posição de um ativo negativa em alguma data.
-- A conta é por dia (compras e vendas do mesmo dia se compensam), igual a public._w_pos.
-- A função é SECURITY DEFINER porque o gatilho adiado roda no commit com o papel do usuário (authenticated),
-- que não lê w_invest_tx; testado no esquema real com uma RPC chamada como authenticated (scripts/wealth-local).
-- Em 23/11/2026, consulta somente leitura na produção: 0 ativos com posição negativa em qualquer dia.
--
-- Como reverter:
--   drop trigger if exists w_invest_tx_position on public.w_invest_tx;
--   drop function if exists public._w_check_position();

begin;

create or replace function public._w_check_position()
returns trigger
language plpgsql
security definer          -- o gatilho é ADIADO: roda no commit, já fora da RPC, como "authenticated" (sem acesso à tabela)
set search_path = ''
as $$
declare
  v_wallet uuid := coalesce(new.wallet_id, old.wallet_id);
  v_asset uuid := coalesce(new.asset_id, old.asset_id);
begin
  if exists (
    select 1 from (
      select sum(sum(case kind when 'compra' then qty when 'venda' then -qty else 0 end)) over (order by date) as run
      from public.w_invest_tx
      where wallet_id = v_wallet and asset_id = v_asset
      group by date
    ) r where r.run < -0.00000001
  ) then
    raise exception 'position_negative' using detail = 'A venda é maior que a quantidade em carteira nesta data';
  end if;
  -- troca de ativo ou de carteira numa edição: confere também o par antigo
  if tg_op = 'UPDATE' and (old.asset_id is distinct from new.asset_id or old.wallet_id is distinct from new.wallet_id) then
    if exists (
      select 1 from (
        select sum(sum(case kind when 'compra' then qty when 'venda' then -qty else 0 end)) over (order by date) as run
        from public.w_invest_tx where wallet_id = old.wallet_id and asset_id = old.asset_id group by date
      ) r where r.run < -0.00000001
    ) then
      raise exception 'position_negative' using detail = 'A alteração deixa a posição do ativo anterior negativa';
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public._w_check_position() from public, anon, authenticated;

drop trigger if exists w_invest_tx_position on public.w_invest_tx;
create constraint trigger w_invest_tx_position
  after insert or update of kind, qty, date, asset_id, wallet_id or delete on public.w_invest_tx
  deferrable initially deferred
  for each row execute function public._w_check_position();

commit;
