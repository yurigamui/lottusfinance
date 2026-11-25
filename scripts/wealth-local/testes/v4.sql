-- Testes da migração 20261124120000 (Wealth v4) no banco LOCAL (esquema real + seed fictício). Tudo em transação com rollback.
-- Rodar: psql -h 127.0.0.1 -p 54340 -U postgres -d wealth -v ON_ERROR_STOP=1 -f testes/v4.sql
\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.ok(c boolean, n text) returns void language plpgsql as $$ begin if not coalesce(c, false) then raise exception 'FALHOU: %', n; end if; raise notice 'ok  %', n; end $$;
select set_config('t.wid', (select id::text from public.w_wallets where name = 'Família Exemplo'), true);
-- CDB pós (110% do CDI) comprado há 120 dias; LCI pré 12% a.a. comprada há 100 dias; um fundo com compra, venda parcial e provento
insert into public.w_assets (id, wallet_id, kind, name, custom, pu_inicial, indexer, rate) values
  ('44444444-0000-4000-8000-0000000000a1', current_setting('t.wid')::uuid, 'rf_pos', 'CDB Teste 110% CDI', false, 1, 'CDI', 1.10),
  ('44444444-0000-4000-8000-0000000000a2', current_setting('t.wid')::uuid, 'rf_pre', 'LCI Teste Pré', false, 1, 'PRE', 0.12),
  ('44444444-0000-4000-8000-0000000000a3', current_setting('t.wid')::uuid, 'rf_pos', 'CDB sem taxa', true, 1, null, null);
insert into public.w_invest_tx (wallet_id, asset_id, kind, date, qty, unit_price, custodian, source) values
  (current_setting('t.wid')::uuid, '44444444-0000-4000-8000-0000000000a1', 'compra', current_date - 120, 10, 1000, 'INTER DTVM', 'manual'),
  (current_setting('t.wid')::uuid, '44444444-0000-4000-8000-0000000000a2', 'compra', current_date - 100, 5, 2000, 'XP', 'manual'),
  (current_setting('t.wid')::uuid, '44444444-0000-4000-8000-0000000000a3', 'compra', current_date - 50, 1, 5000, null, 'arquivo');
-- Índices CDI diários e IPCA mensal fictícios já vêm do seed (CDI 0,045%/dia úteis)
select public._w_rf_reprice('44444444-0000-4000-8000-0000000000a1') as n_cdb, public._w_rf_reprice('44444444-0000-4000-8000-0000000000a2') as n_lci, public._w_rf_reprice('44444444-0000-4000-8000-0000000000a3') as n_manual \gset
select set_config('t.n1', :'n_cdb', true), set_config('t.n2', :'n_lci', true), set_config('t.n3', :'n_manual', true) \gset
-- cálculo independente (como dono do banco): dias úteis com CDI publicado e, depois do último CDI, segunda a sexta com o último valor
select (1000 * exp(sum(ln(1 + 1.10 * coalesce(i.value, (select value from public.w_indices where name = 'CDI' order by date desc limit 1)) / 100)))) as e1
  from (select g::date d from generate_series(current_date - 119, current_date, interval '1 day') g where extract(isodow from g) < 6) c
  left join public.w_indices i on i.name = 'CDI' and i.date = c.d
 where i.value is not null or c.d > (select max(date) from public.w_indices where name = 'CDI') \gset
select count(*) as du from generate_series(current_date - 99, current_date, interval '1 day') g where extract(isodow from g) < 6
   and (exists (select 1 from public.w_indices i where i.name = 'CDI' and i.date = g::date) or g::date > (select max(date) from public.w_indices where name = 'CDI')) \gset
select set_config('t.esp_cdb', :'e1', true), set_config('t.du', :'du', true), set_config('t.esp_pre', (2000 * power(1.12, :du / 252.0))::text, true) \gset
set local role authenticated;
do $$
declare ana uuid := 'a0000000-0000-4000-8000-000000000001'; bruno uuid := 'b0000000-0000-4000-8000-000000000002'; carla uuid := 'c0000000-0000-4000-8000-000000000003'; davi uuid := 'd0000000-0000-4000-8000-000000000004';
  wid uuid := current_setting('t.wid')::uuid; pos jsonb; p jsonb; liq jsonb; x jsonb; esperado numeric; du int; got numeric;
begin
  perform pg_temp.as_user(ana);
  -- R1 renda fixa: preços diários gravados desde a compra, sem tocar no ativo "valorização manual"
  perform pg_temp.ok(current_setting('t.n1')::int > 80 and current_setting('t.n2')::int > 70, 'R1 preços diários gravados (CDB ' || current_setting('t.n1') || ', LCI ' || current_setting('t.n2') || ')');
  perform pg_temp.ok(current_setting('t.n3')::int = 0, 'R1 ativo com valorização manual não é reprecificado');
  pos := public.w_positions(wid);
  p := (select e from jsonb_array_elements(pos) e where e->>'name' = 'CDB Teste 110% CDI');
  esperado := current_setting('t.esp_cdb')::numeric;
  perform pg_temp.ok(abs((p->>'pu')::numeric - esperado) < 0.01, format('R2 PU do CDB confere com o cálculo independente (%s × %s)', round((p->>'pu')::numeric, 4), round(esperado, 4)));
  -- R3 pré: 2000 × 1,12^(du/252)
  p := (select e from jsonb_array_elements(pos) e where e->>'name' = 'LCI Teste Pré');
  du := current_setting('t.du')::int; esperado := current_setting('t.esp_pre')::numeric;
  perform pg_temp.ok(abs((p->>'pu')::numeric - esperado) < 0.01, format('R3 PU pré confere (%s × %s, %s dias úteis)', round((p->>'pu')::numeric, 4), round(esperado, 4), du));
  -- P1 posição: custodiante, valor investido e TWR sem distorção por aporte
  p := (select e from jsonb_array_elements(pos) e where e->>'name' = 'CDB Teste 110% CDI');
  perform pg_temp.ok(p->>'custodian' = 'INTER DTVM' and (p->>'invested')::numeric = 10000, 'P1 custodiante e valor investido');
  perform pg_temp.ok(abs((p->>'twr')::numeric - ((p->>'pu')::numeric / 1000 - 1)) < 0.00001, 'P1 TWR de compra única = PU / PU pago − 1');
  perform pg_temp.ok(abs((p->>'pnl')::numeric - (10 * (p->>'pu')::numeric - 10000)) < 0.01, 'P1 P&L = valor − investido');
  -- P2 período: TWR de um recorte é menor que o desde o início e P&L do recorte é menor também
  pos := public.w_positions(wid, null, current_date - 30, current_date);
  x := (select e from jsonb_array_elements(pos) e where e->>'name' = 'CDB Teste 110% CDI');
  perform pg_temp.ok((x->>'twr')::numeric > 0 and (x->>'twr')::numeric < (p->>'twr')::numeric and (x->>'pnl')::numeric < (p->>'pnl')::numeric, 'P2 rentabilidade do período < desde o início');
  perform pg_temp.ok(pg_temp.err(format('select public.w_positions(%L, null, %L, %L)', wid, current_date + 1, current_date)) = 'invalid_value', 'P2 início depois do fim recusado');
  -- P3 TWR com aporte e venda: o aporte não vira "rentabilidade"
  perform public.w_asset_price_set(wid, '44444444-0000-4000-8000-0000000000a3', current_date - 40, 5000); perform public.w_asset_price_set(wid, '44444444-0000-4000-8000-0000000000a3', current_date - 30, 5500); perform public.w_asset_price_set(wid, '44444444-0000-4000-8000-0000000000a3', current_date, 5500);
  perform public.w_tx_save(wid, jsonb_build_object('asset_id', '44444444-0000-4000-8000-0000000000a3', 'kind', 'compra', 'date', (current_date - 30)::text, 'qty', 1, 'unit_price', 5500));
  x := (select e from jsonb_array_elements(public.w_positions(wid)) e where e->>'name' = 'CDB sem taxa');
  perform pg_temp.ok(abs((x->>'twr')::numeric - 0.10) < 0.0001, format('P3 TWR com 2º aporte: 5.000→5.500 (+10%%), 2º aporte a 5.500 sem ganho: %s', x->>'twr'));
  perform pg_temp.ok(abs((x->>'pnl')::numeric - 500) < 0.01, 'P3 P&L = 500 (o aporte de 5.500 não é lucro)');
  -- L1 liquidez: vencimentos em faixas; soma das faixas = patrimônio em investimentos
  perform public.w_assets_bulk_update(wid, array['44444444-0000-4000-8000-0000000000a1']::uuid[], jsonb_build_object('maturity', (current_date + 20)::text));
  perform public.w_assets_bulk_update(wid, array['44444444-0000-4000-8000-0000000000a2']::uuid[], jsonb_build_object('maturity', (current_date + 400)::text));
  liq := public.w_liquidity(wid);
  perform pg_temp.ok(abs((liq->>'total')::numeric - (public.w_networth(wid)->>'investimentos')::numeric) < 0.01, 'L1 total de liquidez = investimentos');
  perform pg_temp.ok((select (b->>'count')::int = 1 from jsonb_array_elements(liq->'buckets') b where b->>'key' = 'd30') and (select (b->>'count')::int = 1 from jsonb_array_elements(liq->'buckets') b where b->>'key' = 'a2'), 'L1 CDB em "até 30 dias" e LCI em "1 a 2 anos"');
  perform pg_temp.ok(abs((select (b->>'cumulative')::numeric from jsonb_array_elements(liq->'buckets') b where b->>'key' = 'sem_data') - 1) < 0.000001, 'L1 acumulado fecha em 100%');
  perform pg_temp.ok((select (b->>'count')::int from jsonb_array_elements(liq->'buckets') b where b->>'key' = 'diaria') >= 2, 'L1 ações e FIIs entram em liquidez diária');
  perform pg_temp.as_user(davi);
  perform pg_temp.ok(pg_temp.err(format('select public.w_liquidity(%L)', wid)) = 'forbidden' and pg_temp.err(format('select public.w_positions(%L)', wid)) = 'forbidden', 'L2 quem não é membro não lê liquidez nem posição');
  -- T1 titular: ninguém o remove nem transfere
  perform pg_temp.as_user(ana);
  perform pg_temp.ok(pg_temp.err(format('select public.w_member_remove(%L, %L)', wid, ana)) = 'owner_cannot_leave', 'T1 titular não pode ser removido (nem por ele)');
  perform public.w_member_remove(wid, carla);
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.w_members_list(wid)) m where m->>'user_id' = carla::text), 'T1 outro membro continua removível');
  -- A1 arquivadas: arquivar, listar, desarquivar; Grátis com outra carteira ativa não desarquiva
  perform public.w_wallet_archive(wid);
  perform pg_temp.ok(jsonb_array_length(public.w_wallets_archived()->'wallets') = 1 and (public.w_wallets_archived()->>'can_unarchive')::boolean, 'A1 carteira arquivada aparece e pode ser reativada');
  perform pg_temp.as_user(bruno);
  perform pg_temp.ok(pg_temp.err(format('select public.w_wallet_unarchive(%L)', wid)) = 'owner_only', 'A1 só o titular desarquiva');
  perform pg_temp.as_user(ana);
  perform public.w_wallet_unarchive(wid);
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(public.w_wallets_list()) w where w->>'id' = wid::text), 'A1 desarquivada volta à lista');
  perform public.w_wallet_archive(wid);
    -- (a Ana não tem outra carteira ativa: o limite do Grátis só vale com 1 ativa)
  perform pg_temp.ok(jsonb_array_length(public.w_wallets_archived()->'wallets') = 1, 'A1 lista segue com a arquivada');
end $$;
-- I1 importação de extrato com colunas de contraparte, centro de custo e grupo
do $$
declare ana uuid := 'a0000000-0000-4000-8000-000000000001'; wid uuid := current_setting('t.wid')::uuid; acc uuid; r jsonb; n0 int; cpid uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
  perform public.w_wallet_unarchive(wid);
  acc := (select (b->>'id')::uuid from jsonb_array_elements(public.w_bank_list(wid)) b limit 1);
  r := public.w_spend_import(wid, acc, 'v4.csv', '[{"date":"2026-11-01","description":"MERCADO NOVO X","amount":-80,"counterparty":"Mercado Novo","cost_center":"Casa","group":"Alimentação"},
                                                {"date":"2026-11-02","description":"PADARIA Y","amount":-20,"counterparty":"  mercado novo ","cost_center":"","group":""},
                                                {"date":"2026-11-03","description":"SALARIO Z","amount":5000}]');
  perform pg_temp.ok((r->>'new')::int = 3 and (r->>'cadastros_created')::int >= 1, 'I1 importou 3 linhas e criou os cadastros que faltavam (' || (r->>'cadastros_created') || ')');
  perform pg_temp.ok((select count(*) from jsonb_array_elements(public.w_cad_list(wid)->'cadastros') c where lower(c->>'name') = 'mercado novo') = 1, 'I1 contraparte repetida com outra caixa e espaços não duplica');
  perform pg_temp.ok((select count(*) from jsonb_array_elements(public.w_spend_list(wid, '{"q":"MERCADO NOVO X"}')->'rows') s where s->>'counterparty_id' is not null and s->>'cost_center_id' is not null and s->>'group_id' is not null) = 1, 'I1 lançamento recebeu contraparte, centro de custo e grupo das colunas');
end $$;
-- C1 índices pelo banco (pg_net simulado): grava a resposta do Banco Central e recalcula a renda fixa
reset role;
create table if not exists net._http_response (id bigint primary key, status_code int, content text);
insert into net._http_response values (900001, 200, '[{"data":"01/01/2030","valor":"0.050000"},{"data":"02/01/2030","valor":"0.050000"}]');
insert into public.w_system (key, value) values ('indices_req_cdi', '900001') on conflict (key) do update set value = excluded.value;
do $$
begin
  perform pg_temp.ok(public.w_indices_ingest() = 2, 'C1 CDI do Banco Central gravado (2 pontos)');
  perform pg_temp.ok(exists (select 1 from public.w_indices where name = 'CDI' and date = '2030-01-02' and value = 0.05) and not exists (select 1 from public.w_system where key = 'indices_req_cdi'), 'C1 índice gravado e pedido concluído');
  perform pg_temp.ok(public.w_rf_reprice_all() > 100, 'C1 reprecificação de todos os ativos com taxa');
  perform pg_temp.ok(not has_function_privilege('authenticated', 'public.w_rf_reprice_all()', 'execute') and not has_function_privilege('authenticated', 'public._w_rf_reprice(uuid)', 'execute') and not has_function_privilege('authenticated', 'public.w_indices_ingest()', 'execute'), 'C1 rotinas internas fechadas ao navegador');
end $$;
-- A2 editar a taxa de um ativo já reprecifica na hora (gatilho), sem rotina agendada
select public._w_rf_reprice('44444444-0000-4000-8000-0000000000a1') > 0 as ok \gset
update public.w_assets set rate = 1.0 where id = '44444444-0000-4000-8000-0000000000a1';
do $$
declare a numeric; b numeric;
begin
  select pu into a from public.w_asset_prices where asset_id = '44444444-0000-4000-8000-0000000000a1' and date = (select max(date) from public.w_asset_prices where asset_id = '44444444-0000-4000-8000-0000000000a1');
  update public.w_assets set rate = 1.2 where id = '44444444-0000-4000-8000-0000000000a1';
  select pu into b from public.w_asset_prices where asset_id = '44444444-0000-4000-8000-0000000000a1' and date = (select max(date) from public.w_asset_prices where asset_id = '44444444-0000-4000-8000-0000000000a1');
  perform pg_temp.ok(b > a, format('A2 trocar 100%% para 120%% do CDI reprecifica na hora (%s → %s)', round(a, 4), round(b, 4)));
end $$;
rollback;
