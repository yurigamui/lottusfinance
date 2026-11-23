-- Teste da migração 20261123123000_wealth_posicao_nao_negativa.sql (o gatilho é adiado: cada caso roda na própria transação)
create or replace function pg_temp.tenta(sql text) returns text language plpgsql as $$
begin execute sql; return 'ok'; exception when others then return sqlerrm; end $$;
do $$
declare u uuid; w uuid; a uuid; r text;
begin
  insert into auth.users default values returning id into u;
  insert into public.w_wallets (name, owner_id, created_by) values ('Posição exemplo', u, u) returning id into w;
  insert into public.w_assets (wallet_id) values (w) returning id into a;
  perform set_config('t.w', w::text, false); perform set_config('t.a', a::text, false);
end $$;
-- Gatilho adiado só dispara no commit: usamos SET CONSTRAINTS IMMEDIATE para checar dentro do bloco.
do $$
declare w uuid := current_setting('t.w')::uuid; a uuid := current_setting('t.a')::uuid; ok boolean; buy uuid;
begin
  set constraints all immediate;
  insert into public.w_invest_tx (wallet_id, asset_id, kind, date, qty) values (w, a, 'compra', '2026-01-10', 100) returning id into buy;
  insert into public.w_invest_tx (wallet_id, asset_id, kind, date, qty) values (w, a, 'venda', '2026-02-10', 60);
  raise notice 'ok: P1 venda menor que a posição aceita';
  ok := false; begin insert into public.w_invest_tx (wallet_id, asset_id, kind, date, qty) values (w, a, 'venda', '2026-03-10', 41); exception when others then ok := sqlerrm = 'position_negative'; end;
  if not ok then raise exception 'P2 venda maior que a posição não foi recusada'; end if;
  raise notice 'ok: P2 venda maior que a posição recusada';
  ok := false; begin insert into public.w_invest_tx (wallet_id, asset_id, kind, date, qty) values (w, a, 'venda', '2026-01-05', 10); exception when others then ok := sqlerrm = 'position_negative'; end;
  if not ok then raise exception 'P3 venda antes da compra não foi recusada'; end if;
  raise notice 'ok: P3 venda datada antes da compra recusada';
  ok := false; begin delete from public.w_invest_tx where id = buy; exception when others then ok := sqlerrm = 'position_negative'; end;
  if not ok then raise exception 'P4 excluir a compra que sustenta a venda não foi recusado'; end if;
  raise notice 'ok: P4 excluir compra que sustenta venda recusado';
  ok := false; begin update public.w_invest_tx set qty = 10 where id = buy; exception when others then ok := sqlerrm = 'position_negative'; end;
  if not ok then raise exception 'P5 reduzir a compra abaixo da venda não foi recusado'; end if;
  raise notice 'ok: P5 editar compra para menos que a venda recusado';
  insert into public.w_invest_tx (wallet_id, asset_id, kind, date, qty) values (w, a, 'compra', '2026-02-10', 5), (w, a, 'venda', '2026-02-10', 5);
  raise notice 'ok: P6 compra e venda no mesmo dia se compensam';
end $$;
-- P7: importação fora de ordem (venda inserida antes da compra) passa, porque a checagem é adiada para o fim da transação
begin;
insert into public.w_invest_tx (wallet_id, asset_id, kind, date, qty) values (current_setting('t.w')::uuid, current_setting('t.a')::uuid, 'venda', '2026-06-02', 7);
insert into public.w_invest_tx (wallet_id, asset_id, kind, date, qty) values (current_setting('t.w')::uuid, current_setting('t.a')::uuid, 'compra', '2026-06-01', 7);
commit;
do $$ begin
  if has_function_privilege('authenticated', 'public._w_check_position()', 'execute') then raise exception 'P8 função interna executável'; end if;
  raise notice 'ok: P7 importação fora de ordem aceita no fim da transação; P8 função interna sem grant';
end $$;

-- P9: o gatilho adiado roda no commit com o papel do usuário (authenticated), que não tem acesso à tabela
create or replace function public._t_buy(w uuid, a uuid) returns void language sql security definer set search_path = '' as $f$
  insert into public.w_invest_tx (wallet_id, asset_id, kind, date, qty) values (w, a, 'compra', '2026-07-01', 1) $f$;
grant execute on function public._t_buy(uuid, uuid) to authenticated;
begin;
set local role authenticated;
select public._t_buy(current_setting('t.w')::uuid, current_setting('t.a')::uuid);
commit;
do $$ begin raise notice 'ok: P9 compra feita por RPC como authenticated passa no commit'; end $$;
