-- 20261123124000_wealth_ativos_da_carteira.sql
-- Plataforma: Wealth · Seção: Investimentos › Transações (filtro "Ativo") · Origem: auditoria de 23/11/2026, achado WE-07 (alto)
-- Estado: PRONTA, NÃO APLICADA. Testar primeiro num branch do Supabase.
--
-- O problema: o filtro "Ativo" usava w_asset_search com texto vazio, que devolve os 30 primeiros ativos do CATÁLOGO
-- global (~35 mil em produção), e não os ativos que a carteira negociou. O filtro listava ativos alheios e podia
-- não ter os da carteira.
-- O que faz: cria public.w_tx_assets(p_wallet), somente leitura, que devolve os ativos com ao menos uma transação
-- na carteira (id, nome, ticker, tipo), ordenados por ticker/nome. Mesma checagem de acesso das demais (visualizador+).
--
-- Como reverter: drop function if exists public.w_tx_assets(uuid);

begin;

create or replace function public.w_tx_assets(p_wallet uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._w_need(p_wallet, 'visualizador');
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'ticker', a.ticker, 'kind', a.kind) order by a.ticker nulls last, a.name)
    from public.w_assets a
    where a.id in (select distinct t.asset_id from public.w_invest_tx t where t.wallet_id = p_wallet)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.w_tx_assets(uuid) from public, anon;
grant execute on function public.w_tx_assets(uuid) to authenticated;

commit;
