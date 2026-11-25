-- Testes das migrações 20261125110000/111000: renda fixa importada pelo nome. Banco LOCAL, tudo com rollback.
\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create or replace function pg_temp.ok(c boolean, n text) returns void language plpgsql as $$ begin if not coalesce(c, false) then raise exception 'FALHOU: %', n; end if; raise notice 'ok  %', n; end $$;
select set_config('t.wid', (select id::text from public.w_wallets where name = 'Família Exemplo'), true);
do $$
declare p record;
begin
  select * into p from public._w_parse_rf('LCI-CDI ITAU 92,00 01/2031'); perform pg_temp.ok(p.kind = 'rf_pos' and p.indexer = 'CDI' and p.rate = 0.92 and p.maturity = date '2031-01-31', 'P1 LCI-CDI 92% do CDI, vence 01/2031');
  select * into p from public._w_parse_rf('CDB-DI ITAU CDI 100,00 07/2031'); perform pg_temp.ok(p.kind = 'rf_pos' and p.rate = 1 and p.maturity = date '2031-07-31', 'P2 CDB-DI 100% do CDI');
  select * into p from public._w_parse_rf('CDB IPCA ITAU IPCA 5,77 10/2027'); perform pg_temp.ok(p.kind = 'rf_ipca' and p.indexer = 'IPCA' and p.rate = 0.0577, 'P3 CDB IPCA+5,77%');
  select * into p from public._w_parse_rf('LIG-IPCA ITAU IPCA 6,56 05/2035'); perform pg_temp.ok(p.kind = 'rf_ipca' and p.rate = 0.0656 and p.maturity = date '2035-05-31', 'P4 LIG IPCA+6,56%');
  select * into p from public._w_parse_rf('LCD BNDESBD DI 95,50 12/2029'); perform pg_temp.ok(p.kind = 'rf_pos' and p.rate = 0.955, 'P5 LCD DI 95,5%');
  select * into p from public._w_parse_rf('CDB PRE BANCO X 12,50 03/2028'); perform pg_temp.ok(p.kind = 'rf_pre' and p.indexer = 'PRE' and p.rate = 0.125, 'P6 CDB pré 12,5% a.a.');
  perform pg_temp.ok(not exists (select 1 from public._w_parse_rf('CFF ITAUBA FIAGRO RESPONSABILIDADE LIMITADA')) and not exists (select 1 from public._w_parse_rf('KINEA PE V FD FIP CA')) and not exists (select 1 from public._w_parse_rf('CDB ITAU SEM TAXA')) and not exists (select 1 from public._w_parse_rf('CDB CDI ITAU 92,00 13/2031') where maturity is not null), 'P7 nomes que não são título (ou sem taxa) não são convertidos; mês 13 sem vencimento');
  perform pg_temp.ok(not exists (select 1 from public._w_parse_rf('LCI CDI BANCO 1,00 01/2030')) and not exists (select 1 from public._w_parse_rf('CDB IPCA BANCO 100,00 01/2030')) and not exists (select 1 from public._w_parse_rf('CDB DI BANCO X 1.000,50 12/2029')), 'P9 taxa fora da faixa do indexador ou com milhar não é classificada');
  perform pg_temp.ok(not exists (select 1 from public._w_parse_rf('CDB CDI IPCA BANCO 5,00 01/2030')) and not exists (select 1 from public._w_parse_rf('CDB PRE BANCO DI 12,50 03/2028')), 'P10 mais de um indexador no nome é ambíguo: não classifica');
  perform pg_temp.ok((select rate from public._w_parse_rf('cdb pré banco 12,5 03/2028')) = 0.125 and (select rate from public._w_parse_rf('CDB  IPCA+  BANCO  IPCA 5.77  10/2027')) = 0.0577, 'P11 minúsculas, acento e espaços duplos');
  perform pg_temp.ok(not has_function_privilege('authenticated', 'public._w_parse_rf(text)', 'execute'), 'P8 parser fechado ao navegador');
end $$;
-- importação: um título novo vira Renda Fixa e a curva é acrescida; um ativo comum continua "outro"
select pg_temp.as_user((select id from auth.users where email = 'ana.gestora@exemplo.com.br'));
set local role authenticated;
do $$
declare r jsonb; a public.w_assets; n int; v numeric; wid uuid := current_setting('t.wid')::uuid;
begin
  r := public.w_tx_import(wid, 'teste.csv', jsonb_build_array(
    jsonb_build_object('date', (current_date - 90)::text, 'kind', 'compra', 'name', 'LCI-CDI ITAU 92,00 01/2031', 'qty', 100000, 'unit_price', 1, 'asset_kind', 'outro'),
    jsonb_build_object('date', (current_date - 90)::text, 'kind', 'compra', 'name', 'Bem qualquer sem padrão', 'qty', 1, 'unit_price', 5000, 'asset_kind', 'outro')));
  perform pg_temp.ok((r->>'new')::int = 2 and (r->>'renda_fixa')::int = 1, 'I1 importação: 2 novas, 1 renda fixa');
end $$;
reset role;
do $$
declare r jsonb; a public.w_assets; n int; v numeric; wid uuid := current_setting('t.wid')::uuid;
begin
  select * into a from public.w_assets where wallet_id = wid and name = 'LCI-CDI ITAU 92,00 01/2031';
  perform pg_temp.ok(a.kind = 'rf_pos' and a.indexer = 'CDI' and a.rate = 0.92 and not a.custom and a.maturity = date '2031-01-31', 'I2 ativo criado como Renda Fixa pós (92% CDI), não personalizado');
  select count(*), max(pu) into n, v from public.w_asset_prices where asset_id = a.id;
  perform pg_temp.ok(n > 50 and v > 1.0 and v < 1.04, format('I3 curva acrescida automaticamente (%s dias, P.U. final %s)', n, round(v, 6)));
  select * into a from public.w_assets where wallet_id = wid and name = 'Bem qualquer sem padrão';
  perform pg_temp.ok(a.kind = 'outro' and a.custom, 'I4 ativo sem padrão continua personalizado');
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'ana.gestora@exemplo.com.br'), 'role', 'authenticated')::text, true);
  perform public.w_tx_import(wid, 'teste2.csv', jsonb_build_array(jsonb_build_object('date', (current_date - 30)::text, 'kind', 'compra', 'name', 'LCI-CDI ITAU 92,00 01/2031', 'qty', 10, 'unit_price', 1, 'asset_kind', 'outro')));
  perform pg_temp.ok((select count(*) from public.w_assets where wallet_id = wid and name = 'LCI-CDI ITAU 92,00 01/2031') = 1, 'I5 reimportar o mesmo título não duplica o ativo');
  -- B1: linha para ativo que JÁ existe (por ticker) precisa gravar
  r := public.w_tx_import(wid, 'teste3.csv', jsonb_build_array(jsonb_build_object('date', (current_date - 3)::text, 'kind', 'compra', 'ticker', 'PETR4', 'qty', 5, 'unit_price', 30)));
  perform pg_temp.ok((r->>'new')::int = 1 and (r->>'invalid')::int = 0 and exists (select 1 from public.w_invest_tx t where t.wallet_id = wid and t.date = current_date - 3 and t.qty = 5 and t.source = 'arquivo'), 'I6 importar linha de ativo já existente grava a transação (sem contar como inválida)');
end $$;
-- conversão dos já importados (dados)
reset role;
insert into public.w_assets (id, wallet_id, kind, name, custom) values ('66666666-0000-4000-8000-0000000000c1', current_setting('t.wid')::uuid, 'outro', 'LCA-CDI ITAU 94,00 03/2027', true), ('66666666-0000-4000-8000-0000000000c2', current_setting('t.wid')::uuid, 'outro', 'Imóvel Teste', true);
insert into public.w_invest_tx (wallet_id, asset_id, kind, date, qty, unit_price, source) values (current_setting('t.wid')::uuid, '66666666-0000-4000-8000-0000000000c1', 'compra', current_date - 60, 50000, 1, 'arquivo');
\i supabase/migrations/20261125111000_wealth_dados_converter_ativos_para_renda_fixa.sql
do $$
declare a public.w_assets; n int;
begin
  select * into a from public.w_assets where id = '66666666-0000-4000-8000-0000000000c1';
  perform pg_temp.ok(a.kind = 'rf_pos' and a.rate = 0.94 and not a.custom, 'D1 ativo antigo convertido para Renda Fixa (94% do CDI)');
  select count(*) into n from public.w_asset_prices where asset_id = a.id; perform pg_temp.ok(n > 30, 'D2 curva calculada para o ativo convertido (' || n || ' dias)');
  perform pg_temp.ok((select kind from public.w_assets where id = '66666666-0000-4000-8000-0000000000c2') = 'outro', 'D3 ativo que não é título não é tocado');
end $$;
rollback;
