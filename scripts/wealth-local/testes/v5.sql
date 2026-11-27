-- Testes da migração 20261125100000: série sem salto na 1ª cotação. Banco LOCAL, tudo com rollback.
-- Rodar: psql -h 127.0.0.1 -p 54340 -U postgres -d wealth -v ON_ERROR_STOP=1 -f testes/v5.sql
\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create or replace function pg_temp.ok(c boolean, n text) returns void language plpgsql as $$ begin if not coalesce(c, false) then raise exception 'FALHOU: %', n; end if; raise notice 'ok  %', n; end $$;
select set_config('t.wid', (select id::text from public.w_wallets where name = 'Família Exemplo'), true);
-- ação comprada há 60 dias a 7,43; a 1ª cotação só existe a 5 dias atrás, a 16,07 (histórico de preços começou depois da compra)
insert into public.w_assets (id, kind, name, ticker, custom, pu_inicial) values ('55555555-0000-4000-8000-0000000000b1', 'acao', 'Ação Teste Sem Histórico', 'TSTX3', false, 1);
insert into public.w_invest_tx (wallet_id, asset_id, kind, date, qty, unit_price, source) values (current_setting('t.wid')::uuid, '55555555-0000-4000-8000-0000000000b1', 'compra', current_date - 60, 1000, 7.43, 'manual');
insert into public.w_asset_prices (asset_id, date, pu, source) values ('55555555-0000-4000-8000-0000000000b1', current_date - 5, 16.07, 'b3_cotahist'), ('55555555-0000-4000-8000-0000000000b1', current_date, 16.5, 'b3_cotahist');
select pg_temp.as_user((select id from auth.users where email = 'ana.gestora@exemplo.com.br'));
set local role authenticated;
do $$
declare s jsonb; d jsonb; mx numeric := 0; prev numeric; cur numeric; v6 numeric; v_first numeric; k int; tot numeric;
begin
  s := public.w_dashboard_series(current_setting('t.wid')::uuid, current_date - 60, current_date, 'curva');
  -- série só dessa ação: diferença entre o total e o total sem ela é difícil; confere pelo maior salto diário relativo da série completa da carteira
  select max(abs(b.v - a.v)) into mx from (
    select (e->>0)::date d, (e->>1)::numeric v from jsonb_array_elements(s->'days') e) a
    join (select (e->>0)::date d, (e->>1)::numeric v from jsonb_array_elements(s->'days') e) b on b.d = a.d + 1 where a.d >= current_date - 59 and a.d < current_date - 6;
  perform pg_temp.ok(mx < 1500, 'dashboard: nenhum salto diário > R$ 1.500 antes da 1ª cotação (maior = ' || round(coalesce(mx, 0), 4) || ')');
  -- valor da ação no dia anterior à 1ª cotação já perto do preço da cotação (interpolado), não do preço pago
  select (e->>1)::numeric into v6 from jsonb_array_elements(s->'days') e where (e->>0)::date = current_date - 6;
  select (e->>1)::numeric into v_first from jsonb_array_elements(s->'days') e where (e->>0)::date = current_date - 60;
  perform pg_temp.ok(v6 > v_first * 1.0, 'dashboard: valor cresce entre a compra e a 1ª cotação (interpolação)');
  -- equity_range também
  d := public.w_equity_range(current_setting('t.wid')::uuid, current_date - 60, current_date, 'curva');
  select max(abs((b->>'investimentos')::numeric - (a->>'investimentos')::numeric)) into mx
    from jsonb_array_elements(d->'points') with ordinality x(a, i) join jsonb_array_elements(d->'points') with ordinality y(b, j) on j = i + 1 where (a->>'date')::date >= current_date - 59 and (a->>'date')::date < current_date - 6;
  perform pg_temp.ok(mx < 1500, 'w_equity_range: sem salto antes da 1ª cotação (maior = ' || round(coalesce(mx, 0), 4) || ')');
  -- no dia da cotação o valor é o da cotação
  select (e->>1)::numeric into cur from jsonb_array_elements(s->'days') e where (e->>0)::date = current_date - 5;
  select (e->>1)::numeric into prev from jsonb_array_elements(s->'days') e where (e->>0)::date = current_date - 6;
  perform pg_temp.ok(abs(cur - prev) < 1500, 'dashboard: continuidade na véspera e no dia da 1ª cotação');
end $$;
rollback;
