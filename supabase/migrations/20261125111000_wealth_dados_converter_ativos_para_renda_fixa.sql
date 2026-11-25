-- Wealth (DADOS, aplicar só com OK do Yuri): converte ativos já importados como "outro" personalizado cujo nome é de renda fixa
-- (CDB/LCI/LCA/LCD/LIG/LF/CRI/CRA + indexador + taxa + vencimento) em Renda Fixa com indexador, taxa e vencimento, e calcula a curva.
-- Só mexe em ativos da carteira (wallet_id não nulo), kind = 'outro', custom, sem indexador e sem preço informado à mão. Idempotente.
-- Antes de aplicar, conferir a lista com:  select a.id, a.name, p.* from public.w_assets a, lateral public._w_parse_rf(a.name) p where a.wallet_id is not null and a.custom and a.kind = 'outro' and a.indexer is null;
update public.w_assets a
   set kind = q.kind, indexer = q.indexer, rate = q.rate, maturity = coalesce(a.maturity, q.maturity), custom = false, pu_inicial = coalesce(a.pu_inicial, 1)
  from (select s.id, p.kind, p.indexer, p.rate, p.maturity from public.w_assets s, lateral public._w_parse_rf(s.name) p
         where s.wallet_id is not null and s.custom and s.kind = 'outro' and s.indexer is null and s.rate is null
           and not exists (select 1 from public.w_asset_prices x where x.asset_id = s.id and x.source = 'manual')) q
 where a.id = q.id;
-- o gatilho w_assets_rf_reprice calcula a curva de cada ativo convertido
