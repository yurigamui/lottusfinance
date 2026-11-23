-- Testes da migração 20261123125000 (Wealth v2) no banco LOCAL com o esquema real e o seed fictício.
-- Rodar: psql -h 127.0.0.1 -p 54340 -U postgres -d wealth -v ON_ERROR_STOP=1 -f testes/v2.sql
\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.ok(c boolean, n text) returns void language plpgsql as $$ begin if not coalesce(c, false) then raise exception 'FALHOU: %', n; end if; raise notice 'ok  %', n; end $$;
-- independente do estado: começa com a Ana no Grátis, sem cobrança nem grupos (B-1 da verificação)
update public.w_profiles set plan = 'gratis', payment_ok = false where user_id = 'a0000000-0000-4000-8000-000000000001';
delete from public.w_billing_profiles where user_id = 'a0000000-0000-4000-8000-000000000001';
delete from public.w_groups where owner_id = 'a0000000-0000-4000-8000-000000000001';
delete from public.w_wallets where owner_id = 'a0000000-0000-4000-8000-000000000001' and name <> 'Família Exemplo';
select set_config('t.wid', (select id::text from public.w_wallets where name = 'Família Exemplo'), true);
set local role authenticated;
do $$
declare ana uuid := 'a0000000-0000-4000-8000-000000000001'; bruno uuid := 'b0000000-0000-4000-8000-000000000002'; carla uuid := 'c0000000-0000-4000-8000-000000000003'; davi uuid := 'd0000000-0000-4000-8000-000000000004';
  wid uuid; nw jsonb; nwm jsonb; pos jsonb; eq jsonb; b jsonb; w2 jsonb; g jsonb; wl jsonb; dw uuid;
begin
  wid := current_setting('t.wid')::uuid;
  perform pg_temp.as_user(ana);
  -- V1 patrimônio = investimentos + contas (sem bens e dívidas)
  nw := public.w_networth(wid, 'curva');
  perform pg_temp.ok(nw->>'mode' = 'curva' and (nw->>'total')::numeric = (nw->>'investimentos')::numeric + (nw->>'contas')::numeric and not nw ? 'bens', 'V1 patrimônio sem bens/dívidas');
  -- V2 a mercado usa pu_mercado do CDB (10 × 1011,2 em vez de 10 × 1028,5)
  nwm := public.w_networth(wid, 'mercado');
  perform pg_temp.ok(round((nw->>'investimentos')::numeric - (nwm->>'investimentos')::numeric, 2) = 173.00, 'V2 diferença curva − mercado = 10 × 17,30');
  perform pg_temp.ok((nwm->>'tem_mercado')::boolean, 'V2 tem_mercado');
  pos := public.w_positions(wid, 'mercado');
  perform pg_temp.ok((select (p->>'value')::numeric from jsonb_array_elements(pos) p where p->>'asset_id' = '11111111-0000-4000-8000-000000000004') = 10112.00, 'V3 posição a mercado');
  perform pg_temp.ok((select round(sum((p->>'weight')::numeric), 6) from jsonb_array_elements(pos) p) = 1, 'V3 pesos somam 100%');
  -- V4 visão padrão da carteira vira mercado e é usada quando p_mode é nulo
  perform public.w_wallet_settings_save(wid, '{"name":"Família Exemplo","benchmark":"IPCA","view_mode":"mercado"}');
  perform pg_temp.ok(public.w_networth(wid)->>'mode' = 'mercado' and public.w_networth(wid)->>'benchmark' = 'IPCA', 'V4 configurações salvas e usadas');
  perform pg_temp.ok(pg_temp.err(format('select public.w_wallet_settings_save(%L, %L)', wid, '{"name":"Família Exemplo","benchmark":"SP500"}')) = 'invalid_value', 'V4 benchmark inválido recusado');
  perform pg_temp.ok(pg_temp.err(format('select public.w_wallet_settings_save(%L, %L)', wid, '{"name":"X"}')) = 'invalid_name', 'V4 nome curto recusado');
  -- V5 evolução traz a série do benchmark; o último ponto é maior que os aportes (índice positivo)
  eq := public.w_equity(wid, 12);
  perform pg_temp.ok((eq->-1->>'benchmark')::numeric > (eq->-1->>'aportes')::numeric, 'V5 benchmark corrige os aportes');
  perform public.w_wallet_settings_save(wid, '{"name":"Família Exemplo","benchmark":"nenhum","view_mode":"curva"}');
  perform pg_temp.ok(public.w_equity(wid, 12)->-1->'benchmark' = 'null'::jsonb, 'V5 sem benchmark = nulo');
  perform public.w_wallet_settings_save(wid, '{"name":"Família Exemplo","benchmark":"CDI","view_mode":"curva"}');
  -- V6 editor e visualizador não alteram configurações; visualizador lê
  perform pg_temp.as_user(bruno);
  perform pg_temp.ok(pg_temp.err(format('select public.w_wallet_settings_save(%L, %L)', wid, '{"name":"Invasor"}')) = 'forbidden', 'V6 editor não configura');
  perform pg_temp.as_user(carla);
  perform pg_temp.ok(public.w_networth(wid) ? 'total', 'V6 visualizador lê o patrimônio');
  perform pg_temp.as_user(davi);
  perform pg_temp.ok(pg_temp.err(format('select public.w_networth(%L)', wid)) = 'forbidden', 'V6 quem não é membro não lê');
  -- V7 bens e dívidas: RPCs antigas não são mais chamáveis
  perform pg_temp.as_user(ana);
  perform pg_temp.ok(pg_temp.err(format('select public.w_other_list(%L)', wid)) like 'permission denied%', 'V7 w_other_list sem permissão');
  -- V8 plano: Grátis não cria a 2ª carteira; Pro sem dados de cobrança é recusado; com dados, assina sem precisar de 2ª carteira
  perform pg_temp.ok(pg_temp.err($q$select public.w_wallet_create('Segunda Exemplo')$q$) = 'plan_required', 'V8 Grátis: 2ª carteira pede plano');
  perform pg_temp.ok(pg_temp.err($q$select public.w_plan_change('pro')$q$) = 'billing_required', 'V8 Pro pede dados de cobrança');
  perform public.w_billing_profile_save('{"holder_name":"Ana Gestora Exemplo","doc":"52998224725","email":"ana.gestora@exemplo.com.br","zip":"01001000","street":"Rua Exemplo","number":"1","district":"Centro","city":"São Paulo","state":"SP","method":"pix"}');
  b := public.w_plan_change('pro');
  perform pg_temp.ok(b->>'plan' = 'pro' and (b->>'billed')::boolean and (b->>'estimate')::numeric = 79 and (b->>'owned_wallets')::int = 1, 'V8 Pro ativo com 1 carteira, R$ 79');
  w2 := public.w_wallet_create('Segunda Exemplo');
  perform pg_temp.ok(w2 ? 'id', 'V8 Pro cria a 2ª carteira');
  perform pg_temp.ok(pg_temp.err($q$select public.w_plan_change('gratis')$q$) = 'too_many_wallets', 'V8 volta ao Grátis só com 1 carteira');
  perform pg_temp.ok(pg_temp.err($q$select public.w_plan_change('ouro')$q$) = 'invalid_value', 'V8 plano inválido');
  -- V9 fatura do mês: Pro com 2 carteiras (antes, Pro só era cobrado com 2+; agora todo Pro)
  perform set_config('t.w2', w2->>'id', true);
end $$;
reset role;
select public.w_billing_close(current_date) as faturas_fechadas;
set local role authenticated;
do $$
declare ana uuid := 'a0000000-0000-4000-8000-000000000001'; bruno uuid := 'b0000000-0000-4000-8000-000000000002'; carla uuid := 'c0000000-0000-4000-8000-000000000003';
  wid uuid := current_setting('t.wid')::uuid; w2 jsonb := jsonb_build_object('id', current_setting('t.w2')); g jsonb; wl jsonb; dw uuid;
begin
  perform pg_temp.as_user(ana);
  perform pg_temp.ok((public.w_billing_me()->'invoices'->0->>'amount')::numeric = 158, 'V9 fatura 2 × 79');
  -- V10 excluir carteira: só o titular, digitando o nome; faturas ficam
  dw := (w2->>'id')::uuid;
  perform public.w_tx_save(dw, jsonb_build_object('asset_id', '11111111-0000-4000-8000-000000000001', 'kind', 'compra', 'date', (current_date - 5)::text, 'qty', 3, 'unit_price', 30));
  perform pg_temp.ok(pg_temp.err(format('select public.w_wallet_delete(%L, %L)', dw, 'nome errado')) = 'confirm_mismatch', 'V10 nome errado recusa');
  perform pg_temp.as_user(bruno);
  perform pg_temp.ok(pg_temp.err(format('select public.w_wallet_delete(%L, %L)', wid, 'Família Exemplo')) = 'forbidden', 'V10 editor não exclui');
  perform pg_temp.as_user(ana);
  perform public.w_wallet_delete(dw, '  segunda exemplo ');
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.w_wallets_list()) x where x->>'id' = dw::text) and pg_temp.err(format('select public.w_networth(%L)', dw)) = 'forbidden', 'V10 carteira e lançamentos removidos');
  perform pg_temp.ok(jsonb_array_length(public.w_billing_me()->'invoices') = 1, 'V10 faturas mantidas');
  -- V11 marca do grupo aparece na lista de carteiras (Fund)
  perform public.w_plan_change('fund');
  g := public.w_group_save(null, 'Grupo Exemplo', array[]::uuid[]);
  perform public.w_group_wallet_add((g->>'id')::uuid, wid);
  perform public.w_group_brand_save((g->>'id')::uuid, '{"enabled":true,"brand_name":"Alfa","logo_url":"https://exemplo.com.br/logo.png","color":"#123456"}');
  wl := public.w_wallets_list();
  perform pg_temp.ok((select x->'brand'->>'logo_url' from jsonb_array_elements(wl) x where x->>'id' = wid::text) = 'https://exemplo.com.br/logo.png', 'V11 logo do grupo na carteira');
  perform pg_temp.as_user(carla);
  perform pg_temp.ok((select x->'brand'->>'color' from jsonb_array_elements(public.w_wallets_list()) x where x->>'id' = wid::text) = '#123456', 'V11 marca vale para os membros');
  perform pg_temp.ok(pg_temp.err(format('select public.w_group_wallet_add(%L, %L)', g->>'id', wid)) = 'not_found', 'V11 só o dono do grupo adiciona');
  -- V12 dados pessoais em profiles e w_profiles
  perform pg_temp.as_user(ana);
  perform public.w_profile_update('Ana Gestora Nova', '(11) 98888-7777');
  perform pg_temp.ok(public.w_me()->'profile'->>'name' = 'Ana Gestora Nova', 'V12 nome atualizado');
  perform pg_temp.ok(pg_temp.err($q$select public.w_profile_update('A', null)$q$) = 'name_required', 'V12 nome curto');
  perform pg_temp.ok(pg_temp.err($q$select public.w_profile_update('Ana Gestora', '123')$q$) = 'invalid_value', 'V12 telefone inválido');
end $$;
-- V13 API: só service_role chama; chave restrita a carteiras, expiração e revogação
reset role;
do $$
declare ana uuid := 'a0000000-0000-4000-8000-000000000001'; wid uuid; k1 text; k2 text; r jsonb; other uuid;
begin
  select id into wid from public.w_wallets where name = 'Família Exemplo';
  perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
  k1 := public.w_apikey_create('Site exemplo')->>'key';
  k2 := public.w_apikey_create('Só a família', array[wid], 30)->>'key';
  perform set_config('request.jwt.claims', '', true);
  r := public.w_api_call(k1, 'carteiras');
  perform pg_temp.ok(jsonb_array_length(r->'carteiras') >= 1, 'V13 lista de carteiras');
  r := public.w_api_call(k2, 'posicoes', wid, '{"visao":"mercado"}');
  perform pg_temp.ok(r->'dados'->0->>'mode' = 'mercado', 'V13 posições a mercado');
  perform pg_temp.ok(jsonb_array_length(public.w_api_call(k1, 'evolucao', wid, '{"meses":"6"}')->'dados') = 6, 'V13 evolução');
  perform pg_temp.ok((public.w_api_call(k1, 'transacoes', wid)->'dados') ? 'rows', 'V13 transações');
  perform pg_temp.ok(pg_temp.err(format('select public.w_api_call(%L, %L, %L)', 'wk_invalida', 'carteiras', null)) = 'unauthorized', 'V13 chave inválida');
  perform pg_temp.ok(pg_temp.err(format('select public.w_api_call(%L, %L, %L)', k1, 'apagar', wid)) = 'not_found', 'V13 recurso inexistente');
  select id into other from public.w_wallets where name = 'Davi Exemplo';
  perform pg_temp.ok(pg_temp.err(format('select public.w_api_call(%L, %L, %L)', k1, 'patrimonio', other)) = 'not_found', 'V13 carteira de outro titular');
  update public.w_api_keys set expires_at = now() - interval '1 minute' where prefix = left(k2, 9);
  perform pg_temp.ok(pg_temp.err(format('select public.w_api_call(%L, %L, %L)', k2, 'patrimonio', wid)) = 'unauthorized', 'V13 chave expirada');
  perform pg_temp.ok(not has_function_privilege('authenticated', 'public.w_api_call(text,text,uuid,jsonb)', 'execute') and not has_function_privilege('anon', 'public.w_api_call(text,text,uuid,jsonb)', 'execute'), 'V13 API não chamável pelo navegador');
  perform pg_temp.ok(not has_function_privilege('authenticated', 'public.w_billing_authorized(text,text,text,text)', 'execute'), 'V14 autorização de pagamento só pelo servidor');
  -- V14 autorização do provedor marca payment_ok e guarda só bandeira e 4 dígitos
  perform pg_temp.ok(not exists (select 1 from public.w_invest_tx where wallet_id = current_setting('t.w2')::uuid) and not exists (select 1 from public.w_assets where wallet_id = current_setting('t.w2')::uuid) and exists (select 1 from public.w_audit where action = 'wallet_deleted'), 'V10 nada da carteira excluída sobra no banco; exclusão registrada');
  perform public.w_billing_set_customer(ana, 'asaas', 'cus_exemplo');
  perform pg_temp.ok(public.w_billing_authorized('asaas', 'cus_exemplo', 'VISA', '4242') = 'ok', 'V14 autorização aceita');
  perform pg_temp.ok((select payment_ok from public.w_profiles where user_id = ana), 'V14 pagamento autorizado');
  perform pg_temp.ok((select card_last4 from public.w_billing_profiles where user_id = ana) = '4242', 'V14 só os 4 últimos dígitos');
end $$;
-- ciclo 2: regressões dos achados da verificação
do $$
declare ana uuid := 'a0000000-0000-4000-8000-000000000001'; wid uuid := current_setting('t.wid')::uuid; k text; t0 timestamptz; ms numeric; eq jsonb; old numeric;
begin
  -- B1: funções internas novas não são chamáveis por usuário logado
  perform pg_temp.ok(not has_function_privilege('authenticated', 'public._w_invest_value_m(uuid,date,text)', 'execute') and not has_function_privilege('authenticated', 'public._w_wallet_brand(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public._w_mode(uuid,text)', 'execute') and not has_function_privilege('authenticated', 'public._w_bench_factor(text,date,date)', 'execute'), 'C2-B1 internas sem grant para authenticated');
  -- A1: autorização sem cartão não apaga o final; número inteiro guarda os 4 últimos
  update public.w_billing_profiles set card_brand = 'VISA', card_last4 = '4242' where user_id = ana;
  perform public.w_billing_authorized('asaas', 'cus_exemplo', null, null);
  perform pg_temp.ok((select card_last4 from public.w_billing_profiles where user_id = ana) = '4242', 'C2-A1 autorização sem cartão mantém o final');
  perform public.w_billing_authorized('asaas', 'cus_exemplo', 'MASTER', '5555 4444 3333 1111');
  perform pg_temp.ok((select card_last4 from public.w_billing_profiles where user_id = ana) = '1111', 'C2-A1 guarda os 4 últimos dígitos');
  -- M6: data impossível na API vira invalid_value
  perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
  k := public.w_apikey_create('Datas')->>'key'; perform set_config('request.jwt.claims', '', true);
  perform pg_temp.ok(pg_temp.err(format('select public.w_api_call(%L, %L, %L, %L)', k, 'transacoes', wid, '{"de":"2026-02-30"}')) = 'invalid_value', 'C2-M6 data impossível = invalid_value');
  -- A3: benchmark em uma passada confere com a fórmula direta (fator por aporte) e fica dentro da meta com 1.000 lançamentos
  perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
  eq := public.w_equity(wid, 12, 'curva');
  select round(sum(case t.kind when 'compra' then t.qty * t.unit_price else -t.qty * t.unit_price end * public._w_bench_factor('CDI', t.date, (eq->-1->>'date')::date)), 2) into old
    from public.w_invest_tx t where t.wallet_id = wid and t.kind in ('compra', 'venda') and t.date <= (eq->-1->>'date')::date;
  perform pg_temp.ok(abs((eq->-1->>'benchmark')::numeric - old) < 0.05, format('C2-A3 benchmark igual à fórmula direta (%s × %s)', eq->-1->>'benchmark', old));
  insert into public.w_invest_tx (wallet_id, asset_id, kind, date, qty, unit_price, source)
  select wid, '11111111-0000-4000-8000-000000000001', 'compra', current_date - (g % 700), 1, 30, 'manual' from generate_series(1, 1000) g;
  t0 := clock_timestamp(); perform public.w_equity(wid, 60, 'curva'); ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform pg_temp.ok(ms < 300, format('C2-A3 w_equity 60 meses com 1.000 lançamentos em %s ms (meta 300)', round(ms)));
  t0 := clock_timestamp(); perform public.w_equity(wid, 12, 'curva'); ms := extract(epoch from clock_timestamp() - t0) * 1000;
  perform pg_temp.ok(ms < 300, format('C2-A3 w_equity 12 meses em %s ms', round(ms)));
end $$;
-- M1: CPF/CNPJ de cobrança com dígito verificador
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a0000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
do $$ begin
  perform pg_temp.ok(pg_temp.err($q$select public.w_billing_profile_save('{"holder_name":"Ana Exemplo","doc":"11111111111","email":"a@exemplo.com.br","zip":"01001000","street":"R","number":"1","district":"C","city":"S","state":"SP","method":"pix"}')$q$) = 'doc_invalid', 'C2-M1 CPF com dígitos repetidos recusado');
  perform pg_temp.ok(pg_temp.err($q$select public.w_billing_profile_save('{"holder_name":"Empresa Exemplo","doc":"11.222.333/0001-81","email":"a@exemplo.com.br","zip":"01001000","street":"R","number":"1","district":"C","city":"S","state":"SP","method":"boleto"}')$q$) = 'ok', 'C2-M1 CNPJ válido aceito');
  perform pg_temp.ok(pg_temp.err($q$select public.w_billing_profile_save('{"holder_name":"Empresa Exemplo","doc":"11.222.333/0001-82","email":"a@exemplo.com.br","zip":"01001000","street":"R","number":"1","district":"C","city":"S","state":"SP","method":"boleto"}')$q$) = 'doc_invalid', 'C2-M1 CNPJ com dígito errado recusado');
end $$;
rollback;
