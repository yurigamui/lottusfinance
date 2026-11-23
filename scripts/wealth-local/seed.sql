-- Dados FICTÍCIOS para testar o Wealth localmente (nomes, CPFs e e-mails de exemplo).
\set ON_ERROR_STOP on
insert into auth.users (id, email, encrypted_password) values
 ('a0000000-0000-4000-8000-000000000001', 'ana.gestora@exemplo.com.br', crypt('senha-exemplo-1', gen_salt('bf'))),
 ('b0000000-0000-4000-8000-000000000002', 'bruno.editor@exemplo.com.br', crypt('senha-exemplo-1', gen_salt('bf'))),
 ('c0000000-0000-4000-8000-000000000003', 'carla.visual@exemplo.com.br', crypt('senha-exemplo-1', gen_salt('bf'))),
 ('d0000000-0000-4000-8000-000000000004', 'davi.intruso@exemplo.com.br', crypt('senha-exemplo-1', gen_salt('bf')));
-- catálogo global (o robô de preços preenche em produção)
insert into public.w_assets (id, wallet_id, kind, name, ticker) values
 ('11111111-0000-4000-8000-000000000001', null, 'acao', 'Petrobras PN', 'PETR4'),
 ('11111111-0000-4000-8000-000000000002', null, 'fii', 'Fundo Imobiliário Exemplo', 'XPTO11');
insert into public.w_assets (id, wallet_id, kind, name, indexer, rate, issue_date, maturity, pu_inicial) values
 ('11111111-0000-4000-8000-000000000003', null, 'tesouro', 'Tesouro Selic 2029', 'SELIC', 0, '2023-01-01', '2029-03-01', 13000);
insert into public.w_asset_prices (asset_id, date, pu, source) select '11111111-0000-4000-8000-000000000001', d::date, 30 + (extract(doy from d) % 10), 'exemplo' from generate_series(current_date - 400, current_date, interval '1 day') d;
insert into public.w_asset_prices (asset_id, date, pu, source) select '11111111-0000-4000-8000-000000000002', d::date, 95 + (extract(doy from d) % 7), 'exemplo' from generate_series(current_date - 400, current_date, interval '1 day') d;
insert into public.w_asset_prices (asset_id, date, pu, source) select '11111111-0000-4000-8000-000000000003', d::date, 13000 + (d::date - (current_date - 400)) * 4.5, 'exemplo' from generate_series(current_date - 400, current_date, interval '1 day') d;
insert into public.w_banks (code, ispb, name) values ('001', '00000000', 'Banco do Brasil'), ('341', '60701190', 'Itaú Unibanco'), ('260', '18236120', 'Nu Pagamentos') on conflict do nothing;

create or replace function pg_temp.as_user(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false) $$;
do $$
declare ana uuid := 'a0000000-0000-4000-8000-000000000001'; bruno uuid := 'b0000000-0000-4000-8000-000000000002'; carla uuid := 'c0000000-0000-4000-8000-000000000003';
  w jsonb; wid uuid; acc uuid; inv jsonb; cp uuid; cc uuid; gr uuid;
begin
  perform pg_temp.as_user(ana);   perform public.w_finish_signup('Ana Gestora Exemplo', '529.982.247-25', '+55 11 90000-0001');
  perform pg_temp.as_user(bruno); perform public.w_finish_signup('Bruno Editor Exemplo', '111.444.777-35', null);
  perform pg_temp.as_user(carla); perform public.w_finish_signup('Carla Visualizadora Exemplo', '390.533.447-05', null);
  perform pg_temp.as_user('d0000000-0000-4000-8000-000000000004'); perform public.w_finish_signup('Davi Sem Acesso Exemplo', '763.218.940-87', null);
  perform pg_temp.as_user(ana);
  w := public.w_wallet_create('Família Exemplo', 'familia'); wid := (w->>'id')::uuid;
  perform public.w_invite_create(wid, 'Bruno Editor Exemplo', '11144477735', 'bruno.editor@exemplo.com.br', 'editor');
  perform public.w_invite_create(wid, 'Carla Visualizadora Exemplo', '39053344705', 'carla.visual@exemplo.com.br', 'visualizador');
  perform pg_temp.as_user(bruno); perform public.w_invite_answer((select id from public.w_invites where lower(email)='bruno.editor@exemplo.com.br'), true);
  perform pg_temp.as_user(carla); perform public.w_invite_answer((select id from public.w_invites where lower(email)='carla.visual@exemplo.com.br'), true);
  perform pg_temp.as_user(ana);
  acc := (public.w_bank_save(wid, jsonb_build_object('name', 'Conta corrente BB', 'bank_code', '001', 'bank', 'Banco do Brasil', 'account_type', 'corrente', 'opening_balance', 15000, 'opening_date', (current_date - 120)::text))->>'id')::uuid;
  perform public.w_bank_save(wid, jsonb_build_object('name', 'Nubank', 'bank_code', '260', 'account_type', 'pagamento', 'opening_balance', 2000));
  cp := (public.w_cad_save(wid, 'contraparte', null, 'Supermercado Exemplo', null)->>'id')::uuid;
  cc := (public.w_cad_save(wid, 'centro', null, 'Casa', null)->>'id')::uuid;
  gr := (public.w_cad_save(wid, 'grupo', null, 'Alimentação', null)->>'id')::uuid;
  perform public.w_rule_save(wid, jsonb_build_object('match_text', 'SUPERMERC', 'match_kind', 'contem', 'counterparty_id', cp, 'cost_center_id', cc, 'group_id', gr));
  perform public.w_spend_import(wid, acc, 'extrato-exemplo.csv', (select jsonb_agg(jsonb_build_object('date', (current_date - g)::text, 'description', case g % 4 when 0 then 'SUPERMERCADO EXEMPLO LTDA' when 1 then 'SALARIO EMPRESA EXEMPLO' when 2 then 'CONTA DE LUZ' else 'PIX RECEBIDO' end, 'amount', case g % 4 when 0 then -(150 + g) when 1 then 8000 when 2 then -230.45 else 120 end)) from generate_series(1, 90) g));
  perform public.w_tx_save(wid, jsonb_build_object('asset_id', '11111111-0000-4000-8000-000000000001', 'kind', 'compra', 'date', (current_date - 300)::text, 'qty', 100, 'unit_price', 28.5, 'custodian', 'Corretora Exemplo'));
  perform public.w_tx_save(wid, jsonb_build_object('asset_id', '11111111-0000-4000-8000-000000000002', 'kind', 'compra', 'date', (current_date - 200)::text, 'qty', 50, 'unit_price', 96, 'custodian', 'Corretora Exemplo'));
  perform public.w_tx_save(wid, jsonb_build_object('asset_id', '11111111-0000-4000-8000-000000000003', 'kind', 'compra', 'date', (current_date - 150)::text, 'qty', 2, 'unit_price', 13500));
  perform public.w_other_save(wid, jsonb_build_object('kind', 'bem', 'name', 'Apartamento exemplo', 'value', 850000));
  perform public.w_other_save(wid, jsonb_build_object('kind', 'divida', 'name', 'Financiamento exemplo', 'value', 320000));
  -- carteira só da Ana, para testar isolamento
  perform pg_temp.as_user('d0000000-0000-4000-8000-000000000004'); perform public.w_wallet_create('Davi Exemplo', 'pessoal');
end $$;
select 'seed ok: ' || (select count(*) from public.w_wallets) || ' carteiras, ' || (select count(*) from public.w_spend_tx) || ' gastos, ' || (select count(*) from public.w_invest_tx) || ' transações, membros ' || (select count(*) from public.w_members);
