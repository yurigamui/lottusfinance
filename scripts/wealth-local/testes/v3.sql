-- Testes da migração 20261123130000 (Wealth v3) no banco LOCAL (esquema real + seed fictício). Tudo em transação com rollback.
-- Rodar: psql -h 127.0.0.1 -p 54340 -U postgres -d wealth -v ON_ERROR_STOP=1 -f testes/v3.sql
\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.ok(c boolean, n text) returns void language plpgsql as $$ begin if not coalesce(c, false) then raise exception 'FALHOU: %', n; end if; raise notice 'ok  %', n; end $$;
select set_config('t.wid', (select id::text from public.w_wallets where name = 'Família Exemplo'), true);
select set_config('t.davi', (select id::text from public.w_wallets where name = 'Davi Exemplo'), true);
-- CDBs "importados" sem taxa (como os 89 de produção) e uma fatura aberta para os avisos
insert into public.w_assets (id, wallet_id, kind, name, ticker, custom) select ('33333333-0000-4000-8000-00000000000' || g)::uuid, current_setting('t.wid')::uuid, 'rf_pos', 'CDB CDBEXEMPLO' || g, 'CDBEXEMPLO' || g, true from generate_series(1, 3) g;
insert into public.w_invest_tx (wallet_id, asset_id, kind, date, qty, unit_price, source) select current_setting('t.wid')::uuid, ('33333333-0000-4000-8000-00000000000' || g)::uuid, 'compra', current_date - 100 - g, 10, 1000 + g, 'arquivo' from generate_series(1, 3) g;
-- uma compra antiga (3,3 anos) para testar períodos longos
insert into public.w_invest_tx (wallet_id, asset_id, kind, date, qty, unit_price, source) values (current_setting('t.wid')::uuid, '11111111-0000-4000-8000-000000000002', 'compra', current_date - 1200, 1, 90, 'manual');
insert into public.w_billing_profiles (user_id, holder_name, doc, email, zip, street, number, district, city, state, method) values ('a0000000-0000-4000-8000-000000000001', 'Ana Gestora Exemplo', '52998224725', 'ana.cobranca@exemplo.com.br', '01001000', 'Rua Exemplo', '1', 'Centro', 'São Paulo', 'SP', 'cartao') on conflict (user_id) do nothing;
insert into public.w_invoices (id, user_id, ref_month, amount, status, due_date, detail) values ('44444444-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', date_trunc('month', current_date - 30)::date, 79, 'aberta', current_date + 2, '[{"wallet":"Família Exemplo","amount":79}]');
select set_config('t.pu10', (select pu::text from public.w_asset_prices where asset_id = '11111111-0000-4000-8000-000000000001' and date = current_date - 10), true);
select set_config('t.first', (select least((select min(date) from public.w_invest_tx where wallet_id = current_setting('t.wid')::uuid), (select min(date) from public.w_spend_tx where wallet_id = current_setting('t.wid')::uuid), (select min(opening_date) from public.w_bank_accounts where wallet_id = current_setting('t.wid')::uuid)))::text, true);
set local role authenticated;
do $$
declare ana uuid := 'a0000000-0000-4000-8000-000000000001'; bruno uuid := 'b0000000-0000-4000-8000-000000000002'; carla uuid := 'c0000000-0000-4000-8000-000000000003'; davi uuid := 'd0000000-0000-4000-8000-000000000004';
  wid uuid := current_setting('t.wid')::uuid; dw uuid := current_setting('t.davi')::uuid; l jsonb; r jsonb; ids uuid[]; x jsonb; pt jsonb; im uuid;
begin
  perform pg_temp.as_user(ana);
  -- A1 ativos: a lista diz como cada um é valorizado e o que falta
  l := public.w_assets_custom(wid);
  perform pg_temp.ok((select count(*) from jsonb_array_elements(l) a where a->>'name' like 'CDB CDBEXEMPLO%' and a->'valuation'->>'mode' = 'manual' and a->'valuation'->'missing' ? 'taxa') = 3, 'A1 CDBs importados aparecem como manuais, faltando taxa');
  perform pg_temp.ok((select (a->>'value')::numeric from jsonb_array_elements(l) a where a->>'name' = 'CDB CDBEXEMPLO1') = 10010, 'A1 posição do ativo na lista');
  -- A2 edição em lote: 100% do CDI, emissão e P.U. inicial pela 1ª compra, valorização automática
  ids := array['33333333-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003']::uuid[];
  r := public.w_assets_bulk_update(wid, ids, '{"indexer":"CDI","rate":1.0,"issue_from_first_tx":true,"pu_from_first_tx":true,"custom":false,"issuer":"Banco Exemplo"}');
  perform pg_temp.ok((r->>'updated')::int = 3, 'A2 três ativos atualizados');
  l := public.w_assets_custom(wid);
  perform pg_temp.ok((select count(*) from jsonb_array_elements(l) a where a->>'name' like 'CDB CDBEXEMPLO%' and a->'valuation'->>'mode' = 'curva') = 3, 'A2 agora valorizados pela curva');
  perform pg_temp.ok((select a->>'issue_date' = (current_date - 102)::text and (a->>'pu_inicial')::numeric = 1002 from jsonb_array_elements(l) a where a->>'name' = 'CDB CDBEXEMPLO2'), 'A2 emissão e P.U. inicial da 1ª compra de cada ativo');
  -- A2b lote com um bem no meio: o imóvel não ganha "% do CDI" e continua manual
  im := (public.w_asset_save(wid, '{"name":"Terreno exemplo","kind":"imovel"}')->>'id')::uuid;
  perform public.w_assets_bulk_update(wid, array[im, ids[1]], '{"indexer":"CDI","rate":1.1,"custom":false}');
  perform pg_temp.ok((select a->>'indexer' is null and (a->>'custom')::boolean from jsonb_array_elements(public.w_assets_custom(wid)) a where (a->>'id')::uuid = im), 'A2b imóvel no lote não recebe remuneração');
  perform pg_temp.ok((select (a->>'rate')::numeric = 1.1 from jsonb_array_elements(public.w_assets_custom(wid)) a where (a->>'id')::uuid = ids[1]), 'A2b o CDB do mesmo lote recebe');
  -- A3 lote: validações e isolamento
  perform pg_temp.ok(pg_temp.err(format('select public.w_assets_bulk_update(%L, %L, %L)', wid, ids, '{"indexer":"XYZ"}')) = 'invalid_value', 'A3 indexador inválido');
  perform pg_temp.ok(pg_temp.err(format('select public.w_assets_bulk_update(%L, %L, %L)', wid, ids, '{"rate":9}')) = 'invalid_value', 'A3 taxa absurda (900%)');
  perform pg_temp.ok(pg_temp.err(format('select public.w_assets_bulk_update(%L, %L, %L)', wid, array['11111111-0000-4000-8000-000000000001']::uuid[], '{"issuer":"X"}')) = 'not_found', 'A3 ativo do catálogo global não é editável');
  perform pg_temp.as_user(carla);
  perform pg_temp.ok(pg_temp.err(format('select public.w_assets_bulk_update(%L, %L, %L)', wid, ids, '{"issuer":"X"}')) = 'forbidden', 'A3 visualizador não edita');
  perform pg_temp.as_user(davi);
  perform pg_temp.ok(pg_temp.err(format('select public.w_assets_bulk_update(%L, %L, %L)', dw, ids, '{"issuer":"X"}')) = 'not_found', 'A3 ativos de outra carteira (IDOR) recusados');
  -- A4 novos tipos e regras do cadastro
  perform pg_temp.as_user(ana);
  im := (public.w_asset_save(wid, '{"name":"Casa de praia exemplo","kind":"imovel"}')->>'id')::uuid;
  perform pg_temp.ok((select a->'valuation'->>'mode' = 'manual' and a->>'kind' = 'imovel' from jsonb_array_elements(public.w_assets_custom(wid)) a where (a->>'id')::uuid = im), 'A4 imóvel cadastrado como manual');
  perform pg_temp.ok(pg_temp.err(format('select public.w_asset_save(%L, %L)', wid, '{"name":"Ruim","kind":"rf_pre","indexer":"PRE","rate":0.1,"issue_date":"2026-05-01","maturity":"2026-01-01"}')) = 'invalid_value', 'A4 vencimento antes da emissão');
  perform pg_temp.ok(pg_temp.err(format('select public.w_asset_save(%L, %L)', wid, '{"name":"Ruim","kind":"nave"}')) = 'invalid_value', 'A4 tipo inválido');
  -- A5 P.U. informado: excluir só o manual da própria carteira
  perform public.w_asset_price_set(wid, im, current_date - 5, 500000);
  perform public.w_asset_price_delete(wid, im, current_date - 5);
  perform pg_temp.ok(pg_temp.err(format('select public.w_asset_price_delete(%L, %L, %L)', wid, im, current_date - 5)) = 'not_found', 'A5 valor excluído (segunda vez: não encontrado)');
  perform pg_temp.ok(pg_temp.err(format('select public.w_asset_price_delete(%L, %L, %L)', wid, '11111111-0000-4000-8000-000000000001', current_date)) = 'not_found', 'A5 preço da B3 (catálogo) não pode ser excluído');
  -- P1 P.U. numa data
  x := public.w_pu_at(wid, '11111111-0000-4000-8000-000000000001', current_date - 10);
  perform pg_temp.ok((x->>'found')::boolean and (x->>'exact')::boolean and (x->>'pu')::numeric = current_setting('t.pu10')::numeric, 'P1 P.U. exato do dia');
  x := public.w_pu_at(wid, '33333333-0000-4000-8000-000000000001', current_date - 10);
  perform pg_temp.ok(not (x->>'found')::boolean and x->>'valuation' = 'curva', 'P1 sem preço no banco: devolve found=false (a função de borda busca)');
  perform pg_temp.ok(pg_temp.err(format('select public.w_pu_at(%L, %L, %L)', wid, '11111111-0000-4000-8000-000000000001', current_date + 1)) = 'invalid_value', 'P1 data futura');
  perform pg_temp.as_user(davi);
  perform pg_temp.ok(pg_temp.err(format('select public.w_pu_at(%L, %L, %L)', wid, '11111111-0000-4000-8000-000000000001', current_date)) = 'forbidden', 'P1 quem não é membro não consulta');
  perform pg_temp.ok(pg_temp.err(format('select public.w_pu_at(%L, %L, %L)', dw, im, current_date)) = 'not_found', 'P1 ativo de outra carteira (IDOR)');
  -- E1 série diária: confere com o cálculo de um dia em 6 datas, nas duas visões
  perform pg_temp.as_user(ana);
  r := public.w_equity_range(wid, current_date - 1000, current_date, null);
  perform pg_temp.ok(r->>'step' = 'semana', 'E2 período longo vira semanal');
  r := public.w_equity_range(wid, '2000-01-01', current_date, null);
  perform pg_temp.ok((r->>'from')::date = current_setting('t.first')::date, 'E2 desde o início começa na 1ª atividade (' || (r->>'from') || ')');
  perform pg_temp.ok(pg_temp.err(format('select public.w_equity_range(%L, %L, %L)', wid, current_date, current_date - 5)) = 'invalid_value', 'E2 início depois do fim');
  perform pg_temp.as_user(davi);
  perform pg_temp.ok(pg_temp.err(format('select public.w_equity_range(%L, %L, %L)', wid, current_date - 30, current_date)) = 'forbidden', 'E3 quem não é membro não lê a série');
  -- C1 fatura: detalhe e nova tentativa só do dono
  perform pg_temp.as_user(ana);
  x := public.w_invoice_get('44444444-0000-4000-8000-000000000001');
  perform pg_temp.ok((x->>'amount')::numeric = 79 and not x ? 'user_id' and not x ? 'provider_charge_id' and not (x->'billing') ? 'provider_customer_id', 'C1 detalhe sem campos internos');
  perform pg_temp.ok(pg_temp.err($q$select public.w_invoice_retry('44444444-0000-4000-8000-000000000001')$q$) = 'invalid_value', 'C1 sem recusa não há nova tentativa');
  perform pg_temp.as_user(bruno);
  perform pg_temp.ok(pg_temp.err($q$select public.w_invoice_get('44444444-0000-4000-8000-000000000001')$q$) = 'not_found', 'C1 fatura de outra pessoa (IDOR)');
  perform pg_temp.ok(not has_function_privilege('authenticated', 'public.w_billing_notices()', 'execute') and not has_function_privilege('authenticated', 'public.w_price_coverage(uuid[])', 'execute')
    and not has_function_privilege('authenticated', 'public._w_valuation(public.w_assets)', 'execute'), 'C1 rotinas internas não chamáveis pelo navegador');
end $$;
-- C2 avisos por e-mail (rotina do servidor): uma vez por fatura
reset role;
do $$
declare n1 jsonb; n2 jsonb; r jsonb; pt jsonb; wid uuid := current_setting('t.wid')::uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'a0000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
  r := public.w_equity_range(wid, current_date - 365, current_date, 'curva');
  perform pg_temp.ok(r->>'step' = 'dia' and jsonb_array_length(r->'points') = 366, 'E1 366 pontos diários em 1 ano');
  for pt in select p from jsonb_array_elements(r->'points') p where (p->>'date')::date in (current_date - 300, current_date - 150, current_date - 101, current_date - 99, current_date - 30, current_date) loop
    perform pg_temp.ok(round((pt->>'investimentos')::numeric, 2) = round(public._w_invest_value(wid, (pt->>'date')::date), 2)
      and round((pt->>'contas')::numeric, 2) = round(public._w_cash(wid, (pt->>'date')::date), 2) and round((pt->>'aportes')::numeric, 2) = round(public._w_contrib(wid, (pt->>'date')::date), 2), 'E1 confere em ' || (pt->>'date'));
  end loop;
  perform pg_temp.ok(round((r->'points'->-1->>'total')::numeric, 2) = round((public.w_networth(wid, 'curva')->>'total')::numeric, 2), 'E1 último ponto = patrimônio de hoje');
  r := public.w_equity_range(wid, current_date - 365, current_date, 'mercado');
  perform pg_temp.ok(round((r->'points'->-1->>'investimentos')::numeric, 2) = round((public.w_networth(wid, 'mercado')->>'investimentos')::numeric, 2), 'E1 visão a mercado bate com o patrimônio a mercado');
  delete from public.email_outbox;
  n1 := public.w_billing_notices(); n2 := public.w_billing_notices();
  perform pg_temp.ok((select count(*) from public.email_outbox where meta->>'invoice' = '44444444-0000-4000-8000-000000000001') = 1, 'C2 um aviso (fatura aberta) na 1ª rodada: ' || n1::text);
  perform pg_temp.ok(n2 = '{}'::jsonb, 'C2 a 2ª rodada não repete');
  perform pg_temp.ok((select notified ? 'opened' and notified ? 'reminder' from public.w_invoices where id = '44444444-0000-4000-8000-000000000001'), 'C2 vencendo em 2 dias: aberta e lembrete marcados juntos (um e-mail só)');
  update public.w_invoices set status = 'paga', paid_at = now() where id = '44444444-0000-4000-8000-000000000001';
  perform public.w_billing_notices();
  perform pg_temp.ok((select count(*) from public.email_outbox where kind = 'wealth_fatura_paid') = 1, 'C2 recibo por e-mail quando paga');
  perform pg_temp.ok((select html not like '%<script%' and subject = 'Recebemos o pagamento da sua fatura' from public.email_outbox where kind = 'wealth_fatura_paid'), 'C2 assunto e corpo do recibo');
  update public.w_invoices set status = 'aberta', paid_at = null, payment_error = 'pagamento_recusado' where id = '44444444-0000-4000-8000-000000000001';
  perform set_config('request.jwt.claims', json_build_object('sub', 'a0000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
  perform public.w_invoice_retry('44444444-0000-4000-8000-000000000001'); update public.w_invoices set payment_error = 'x' where id = '44444444-0000-4000-8000-000000000001';
  perform public.w_invoice_retry('44444444-0000-4000-8000-000000000001'); update public.w_invoices set payment_error = 'x' where id = '44444444-0000-4000-8000-000000000001';
  perform public.w_invoice_retry('44444444-0000-4000-8000-000000000001'); update public.w_invoices set payment_error = 'x' where id = '44444444-0000-4000-8000-000000000001';
  perform pg_temp.ok(pg_temp.err($q$select public.w_invoice_retry('44444444-0000-4000-8000-000000000001')$q$) = 'too_many_attempts', 'C3 no máximo 3 novas tentativas');
end $$;
rollback;
