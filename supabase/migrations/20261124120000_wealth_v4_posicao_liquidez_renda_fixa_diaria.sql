-- Lottus Wealth v4 (pedido do Yuri em 24/11/2026). Depende da 20261123130000.
-- 1. Titular da carteira não muda: ninguém remove o titular e a titularidade não é transferida.
-- 2. Carteiras arquivadas: listar e desarquivar (só o titular; respeita o limite do plano Grátis).
-- 3. Posição estilo Gorila: custodiante, valor investido, P&L e rentabilidade TWR por ativo, num período (de/até).
-- 4. Liquidez por vencimento (tabela do dashboard).
-- 5. Importação de extrato com colunas de centro de custo, grupo e contraparte (criados por nome quando não existem).
-- 6. Renda fixa: P.U. de TODO dia útil calculado no banco (CDI, pré, IPCA+) a partir da 1ª compra; índices do Banco Central
--    atualizados pelo próprio banco (pg_net + pg_cron), sem depender da função de borda.

-- ============ 1. Titular não muda ============
create or replace function public.w_member_remove(p_wallet uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w public.w_wallets;
begin
  perform public._w_need(p_wallet, 'gestor', true);
  select * into w from public.w_wallets where id = p_wallet;
  if not exists (select 1 from public.w_members where wallet_id = p_wallet and user_id = p_user) then raise exception 'not_found'; end if;
  if p_user = w.owner_id then raise exception 'owner_cannot_leave'; end if;
  if (select count(*) from public.w_members where wallet_id = p_wallet and role = 'gestor' and user_id <> p_user) = 0 then raise exception 'last_manager'; end if;
  delete from public.w_members where wallet_id = p_wallet and user_id = p_user;
  perform public._w_audit(p_wallet, 'member_removed', jsonb_build_object('user', p_user));
  return jsonb_build_object('owner_changed', false);
end $$;

-- ============ 2. Carteiras arquivadas ============
create or replace function public.w_wallets_archived()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare pr public.w_profiles; n int;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  select * into pr from public.w_profiles where user_id = auth.uid();
  select count(*) into n from public.w_wallets where owner_id = auth.uid() and archived_at is null;
  return jsonb_build_object('can_unarchive', not (n >= 1 and coalesce(pr.plan, 'gratis') = 'gratis') and coalesce(pr.billing_status, 'ok') <> 'atrasado',
    'wallets', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'kind', w.kind, 'archived_at', w.archived_at,
        'tx', (select count(*) from public.w_invest_tx t where t.wallet_id = w.id), 'spend', (select count(*) from public.w_spend_tx t where t.wallet_id = w.id)) order by w.archived_at desc)
      from public.w_wallets w where w.owner_id = auth.uid() and w.archived_at is not null), '[]'::jsonb));
end $$;
revoke all on function public.w_wallets_archived() from public, anon;
grant execute on function public.w_wallets_archived() to authenticated;

create or replace function public.w_wallet_unarchive(p_wallet uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare w public.w_wallets; pr public.w_profiles; n int;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  select * into w from public.w_wallets where id = p_wallet;
  if not found then raise exception 'not_found'; end if;
  if w.owner_id <> auth.uid() then raise exception 'owner_only'; end if;
  if w.archived_at is null then return; end if;
  select * into pr from public.w_profiles where user_id = auth.uid();
  if pr.billing_status = 'atrasado' then raise exception 'read_only'; end if;
  select count(*) into n from public.w_wallets where owner_id = auth.uid() and archived_at is null;
  if n >= 1 and pr.plan = 'gratis' then raise exception 'plan_required'; end if;
  update public.w_wallets set archived_at = null where id = p_wallet;
  perform public._w_audit(p_wallet, 'wallet_unarchived', '{}'::jsonb);
end $$;
revoke all on function public.w_wallet_unarchive(uuid) from public, anon;
grant execute on function public.w_wallet_unarchive(uuid) to authenticated;

-- ============ 3. Posição: TWR, P&L e custodiante ============
-- P.U. do ativo no fim de um dia: último preço até a data (a mercado ou na curva); sem preço, o preço da última compra/venda até a data
create or replace function public._w_pu_on(p_wallet uuid, p_asset uuid, p_date date, p_mode text)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case when p_mode = 'mercado' then coalesce(p.pu_mercado, p.pu) else p.pu end from public.w_asset_prices p where p.asset_id = p_asset and p.date <= p_date order by p.date desc limit 1),
    (select t.unit_price from public.w_invest_tx t where t.wallet_id = p_wallet and t.asset_id = p_asset and t.kind in ('compra', 'venda') and t.date <= p_date order by t.date desc, t.created_at desc limit 1),
    (select t.unit_price from public.w_invest_tx t where t.wallet_id = p_wallet and t.asset_id = p_asset and t.kind in ('compra', 'venda') order by t.date, t.created_at limit 1));
$$;

-- Desempenho de um ativo no período [p_from, p_to] (p_from nulo = desde a 1ª operação):
--   twr    = rentabilidade ponderada no tempo (encadeia os subperíodos entre as operações; aportes e resgates não distorcem)
--   pnl    = valor final − valor inicial − (compras − vendas) + proventos
create or replace function public._w_asset_perf(p_wallet uuid, p_asset uuid, p_from date, p_to date, p_mode text)
returns table(twr numeric, pnl numeric, v_start numeric, v_end numeric, flows numeric, income numeric)
language plpgsql stable security definer set search_path = '' as $$
declare q numeric := 0; f numeric := 1; prev numeric := 0; r record; v_before numeric; pu numeric; v0 numeric := 0; fl numeric := 0; inc numeric := 0; has boolean := false; end_d date := coalesce(p_to, current_date);
begin
  if p_from is not null then
    select coalesce(sum(case t.kind when 'compra' then t.qty when 'venda' then -t.qty else 0 end), 0) into q
      from public.w_invest_tx t where t.wallet_id = p_wallet and t.asset_id = p_asset and t.date < p_from;
    pu := public._w_pu_on(p_wallet, p_asset, p_from - 1, p_mode); v0 := q * coalesce(pu, 0); prev := v0;
  end if;
  for r in
    select t.date, sum(case when t.kind = 'compra' then t.qty else 0 end) bq, sum(case when t.kind = 'compra' then t.qty * t.unit_price else 0 end) bv,
           sum(case when t.kind = 'venda' then t.qty else 0 end) sq, sum(case when t.kind = 'venda' then t.qty * t.unit_price else 0 end) sv,
           sum(case when t.kind = 'provento' then t.qty * t.unit_price else 0 end) pv
      from public.w_invest_tx t where t.wallet_id = p_wallet and t.asset_id = p_asset and t.date >= coalesce(p_from, date '0001-01-01') and t.date <= end_d
     group by t.date order by t.date
  loop
    pu := public._w_pu_on(p_wallet, p_asset, r.date, p_mode); v_before := q * coalesce(pu, 0);
    if prev > 0 then f := f * ((v_before + r.pv) / prev); end if;
    q := q + r.bq - r.sq; prev := v_before + r.bv - r.sv; fl := fl + r.bv - r.sv; inc := inc + r.pv; has := true;
  end loop;
  pu := public._w_pu_on(p_wallet, p_asset, end_d, p_mode); v_end := q * coalesce(pu, 0);
  if prev > 0 then f := f * (v_end / prev); end if;
  twr := case when has or v0 > 0 then f - 1 end; pnl := v_end - v0 - fl + inc; v_start := v0; flows := fl; income := inc;
  return next;
end $$;
revoke all on function public._w_pu_on(uuid, uuid, date, text), public._w_asset_perf(uuid, uuid, date, date, text) from public, anon, authenticated;
grant execute on function public._w_pu_on(uuid, uuid, date, text), public._w_asset_perf(uuid, uuid, date, date, text) to service_role;

drop function if exists public.w_positions(uuid, text);
-- p_perf = false pula o cálculo de TWR/P&L por ativo (gráficos de alocação só precisam de valores)
create or replace function public.w_positions(p_wallet uuid, p_mode text default null, p_from date default null, p_to date default null, p_perf boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_total numeric; m text; v_asof date := least(coalesce(p_to, current_date), current_date);
begin
  perform public._w_need(p_wallet, 'visualizador');
  m := public._w_mode(p_wallet, p_mode);
  if p_from is not null and p_from > v_asof then raise exception 'invalid_value'; end if;
  select coalesce(sum(qty * case when m = 'mercado' then coalesce(pu_mercado, pu) else pu end), 0) into v_total from public._w_pos(p_wallet, v_asof);
  return coalesce((
    select jsonb_agg(jsonb_build_object('asset_id', a.id, 'name', a.name, 'ticker', a.ticker, 'kind', a.kind, 'indexer', a.indexer, 'rate', a.rate, 'maturity', a.maturity, 'custom', a.custom,
      'qty', p.qty, 'avg_pu', p.avg_pu, 'cost', p.qty * p.avg_pu, 'invested', p.qty * p.avg_pu, 'pu', p.pu, 'pu_date', p.pu_date, 'pu_mercado', p.pu_mercado,
      'value_curva', p.qty * p.pu, 'value_mercado', case when p.pu_mercado is not null then p.qty * p.pu_mercado end,
      'value', p.qty * x.pu_v, 'pu_view', x.pu_v, 'mode', m,
      'result', p.qty * (x.pu_v - p.avg_pu), 'result_pct', case when p.avg_pu > 0 then x.pu_v / p.avg_pu - 1 end,
      'twr', (perf.pj->>'twr')::numeric, 'pnl', (perf.pj->>'pnl')::numeric, 'v_start', (perf.pj->>'v_start')::numeric, 'income', (perf.pj->>'income')::numeric,
      'custodian', (select t.custodian from public.w_invest_tx t where t.wallet_id = p_wallet and t.asset_id = a.id and nullif(t.custodian, '') is not null order by t.date desc, t.created_at desc limit 1),
      'weight', case when v_total > 0 then p.qty * x.pu_v / v_total end) order by p.qty * x.pu_v desc)
      from public._w_pos(p_wallet, v_asof) p join public.w_assets a on a.id = p.asset_id
      cross join lateral (select case when m = 'mercado' then coalesce(p.pu_mercado, p.pu) else p.pu end as pu_v) x
      cross join lateral (select case when p_perf then (select to_jsonb(z) from public._w_asset_perf(p_wallet, a.id, p_from, v_asof, m) z) end as pj) perf), '[]'::jsonb);
end $$;
revoke all on function public.w_positions(uuid, text, date, date, boolean) from public, anon;
grant execute on function public.w_positions(uuid, text, date, date, boolean) to authenticated;

-- ============ 4. Liquidez por vencimento ============
create or replace function public.w_liquidity(p_wallet uuid, p_mode text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m text; v_total numeric;
begin
  perform public._w_need(p_wallet, 'visualizador');
  m := public._w_mode(p_wallet, p_mode);
  return (
    with pos as (
      select a.id, a.name, a.ticker, a.kind, a.maturity, p.qty * case when m = 'mercado' then coalesce(p.pu_mercado, p.pu) else p.pu end v
        from public._w_pos(p_wallet, current_date) p join public.w_assets a on a.id = p.asset_id),
    b as (
      select pos.*, case
          when maturity is not null and maturity < current_date then 'vencido'
          when maturity is null and kind in ('acao', 'fii', 'etf', 'bdr', 'cripto') then 'diaria'
          when maturity is null then 'sem_data'
          when maturity - current_date <= 30 then 'd30'
          when maturity - current_date <= 90 then 'd90'
          when maturity - current_date <= 180 then 'd180'
          when maturity - current_date <= 365 then 'a1'
          when maturity - current_date <= 730 then 'a2'
          when maturity - current_date <= 1825 then 'a5'
          else 'a5mais' end k from pos),
    keys(k, ord, label) as (values ('vencido', 0, 'Vencido'), ('diaria', 1, 'Liquidez diária'), ('d30', 2, 'Até 30 dias'), ('d90', 3, '31 a 90 dias'), ('d180', 4, '91 a 180 dias'),
                                   ('a1', 5, '181 dias a 1 ano'), ('a2', 6, '1 a 2 anos'), ('a5', 7, '2 a 5 anos'), ('a5mais', 8, 'Acima de 5 anos'), ('sem_data', 9, 'Sem vencimento informado')),
    agg as (select k.k, k.ord, k.label, coalesce(sum(b.v), 0) v, count(b.id) n,
                   coalesce(jsonb_agg(jsonb_build_object('asset_id', b.id, 'name', b.name, 'ticker', b.ticker, 'maturity', b.maturity, 'value', b.v) order by b.v desc) filter (where b.id is not null), '[]'::jsonb) items
              from keys k left join b on b.k = k.k group by k.k, k.ord, k.label),
    acc as (select agg.*, sum(agg.v) over (order by agg.ord) cum from agg),
    tot as (select coalesce(sum(v), 0) t from agg)
    select jsonb_build_object('total', (select t from tot), 'mode', m, 'buckets', (
      select jsonb_agg(jsonb_build_object('key', acc.k, 'label', acc.label, 'value', acc.v, 'count', acc.n,
                                          'share', case when (select t from tot) > 0 then acc.v / (select t from tot) end,
                                          'cumulative', case when (select t from tot) > 0 then acc.cum / (select t from tot) end,
                                          'items', (select coalesce(jsonb_agg(i) , '[]'::jsonb) from (select i from jsonb_array_elements(acc.items) i limit 8) z)) order by acc.ord) from acc)));
end $$;
revoke all on function public.w_liquidity(uuid, text) from public, anon;
grant execute on function public.w_liquidity(uuid, text) to authenticated;

-- ============ 5. Importação de extrato com centro de custo, grupo e contraparte ============
create or replace function public._w_cad_get(p_wallet uuid, p_kind text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_name text := left(trim(coalesce(p_name, '')), 120); v_id uuid;
begin
  if v_name = '' then return null; end if;
  select id into v_id from public.w_cadastros where wallet_id = p_wallet and kind = p_kind and lower(name) = lower(v_name);
  if v_id is null then
    insert into public.w_cadastros (wallet_id, kind, name) values (p_wallet, p_kind, v_name) on conflict do nothing returning id into v_id;
    if v_id is null then select id into v_id from public.w_cadastros where wallet_id = p_wallet and kind = p_kind and lower(name) = lower(v_name); end if;
  end if;
  return v_id;
end $$;
revoke all on function public._w_cad_get(uuid, text, text) from public, anon, authenticated;
grant execute on function public._w_cad_get(uuid, text, text) to service_role;

create or replace function public.w_spend_import(p_wallet uuid, p_account uuid, p_filename text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_imp uuid; v_new int := 0; v_dup int := 0; v_bad int := 0; v_tr int := 0; v_k int; v_id uuid; v_fp text; v_date date; v_amt numeric; v_desc text; c record; o record; ids uuid[] := '{}'; seen jsonb := '{}'::jsonb; v_base text; v_occ int;
        v_cp uuid; v_cc uuid; v_gr uuid; v_cad0 int; v_cad1 int;
begin
  perform public._w_need(p_wallet, 'editor', true);
  if not exists (select 1 from public.w_bank_accounts where id = p_account and wallet_id = p_wallet) then raise exception 'not_found'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'invalid_file'; end if;
  select count(*) into v_cad0 from public.w_cadastros where wallet_id = p_wallet;
  insert into public.w_imports (wallet_id, kind, filename, rows_total, created_by) values (p_wallet, 'extrato', left(p_filename, 200), jsonb_array_length(p_rows), auth.uid()) returning id into v_imp;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      v_date := (r->>'date')::date; v_amt := (r->>'amount')::numeric; v_desc := left(trim(coalesce(r->>'description', '')), 300);
      if v_desc = '' or v_amt is null or v_amt = 0 then v_bad := v_bad + 1; continue; end if;
      if nullif(r->>'fitid', '') is not null then
        v_fp := md5(concat_ws('|', p_account, r->>'fitid'));
      else
        v_base := concat_ws('~', v_date, v_amt, lower(v_desc));
        v_occ := coalesce((seen->>v_base)::int, 0) + 1; seen := jsonb_set(seen, array[v_base], to_jsonb(v_occ));
        v_fp := md5(concat_ws('|', p_account, case when v_occ = 1 then v_base else v_base || '~' || v_occ end));
      end if;
      -- nomes vindos das colunas do arquivo (criados na carteira se não existirem); as regras só completam o que ficou vazio
      v_cp := public._w_cad_get(p_wallet, 'contraparte', r->>'counterparty');
      v_cc := public._w_cad_get(p_wallet, 'centro', r->>'cost_center');
      v_gr := public._w_cad_get(p_wallet, 'grupo', r->>'group');
      select * into c from public._w_classify(p_wallet, v_desc, v_amt, v_cp, v_cc, v_gr);
      insert into public.w_spend_tx (wallet_id, account_id, date, description, amount, counterparty_id, cost_center_id, group_id, fingerprint, import_id, created_by)
      values (p_wallet, p_account, v_date, v_desc, v_amt, c.o_cp, c.o_cc, c.o_gr, v_fp, v_imp, auth.uid()) on conflict do nothing returning id into v_id;
      get diagnostics v_k = row_count;
      if v_k = 1 then v_new := v_new + 1; ids := ids || v_id; else v_dup := v_dup + 1; end if;
    exception when others then v_bad := v_bad + 1;
    end;
  end loop;
  for o in select * from public.w_spend_tx where id = any(ids) and not is_transfer loop
    select t.id into v_id from public.w_spend_tx t
     where t.wallet_id = p_wallet and t.account_id <> o.account_id and not t.is_transfer and t.amount = -o.amount and abs(t.date - o.date) <= 3
     order by abs(t.date - o.date), t.created_at limit 1;
    if v_id is not null then
      update public.w_spend_tx set is_transfer = true, transfer_with = v_id where id = o.id;
      update public.w_spend_tx set is_transfer = true, transfer_with = o.id where id = v_id;
      v_tr := v_tr + 1; v_id := null;
    end if;
  end loop;
  select count(*) into v_cad1 from public.w_cadastros where wallet_id = p_wallet;
  update public.w_imports set rows_new = v_new, rows_dup = v_dup where id = v_imp;
  perform public._w_audit(p_wallet, 'import_spend', jsonb_build_object('file', p_filename, 'new', v_new, 'dup', v_dup, 'bad', v_bad, 'transfers', v_tr, 'cadastros', v_cad1 - v_cad0));
  return jsonb_build_object('new', v_new, 'duplicates', v_dup, 'invalid', v_bad, 'transfers', v_tr, 'cadastros_created', v_cad1 - v_cad0);
end $$;

-- ============ 6. Renda fixa: P.U. de todo dia útil, no banco ============
-- Âncora = 1ª compra (data e preço pago): PU(t) = preço × (fator do indexador de âncora até t). Não depende de data de emissão nem
-- de P.U. de emissão, e funciona para CDB/LCI/LCA/LIG importados de extrato. Dias úteis = dias com CDI publicado; depois do último
-- CDI publicado, segunda a sexta com o último CDI. Só ativo da carteira, com indexador e taxa, e sem "valorização manual".
-- Não sobrescreve valores informados à mão (source = 'manual'); o preço a mercado (pu_mercado) continua vindo da função de borda.
create or replace function public._w_rf_reprice(p_asset uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare a public.w_assets; v_date date; v_price numeric; n int := 0; v_last date; v_rate numeric; v_ipca numeric; v_idx text;
begin
  select * into a from public.w_assets where id = p_asset and wallet_id is not null;
  if not found or a.custom or a.indexer is null or a.rate is null or a.kind not in ('rf_pre', 'rf_pos', 'rf_ipca') then return 0; end if;
  select t.date, t.unit_price into v_date, v_price from public.w_invest_tx t where t.asset_id = p_asset and t.kind = 'compra' and t.unit_price > 0 order by t.date, t.created_at limit 1;
  if v_date is null or v_date > current_date then return 0; end if;
  v_idx := case when a.indexer = 'IPCA' then 'IPCA' else 'CDI' end;
  select max(date) into v_last from public.w_indices where name = 'CDI';
  select value into v_rate from public.w_indices where name = 'CDI' and date = v_last;
  if v_last is null then v_last := v_date; v_rate := 0; end if;   -- sem CDI carregado: pré e IPCA+ ainda calculam (dias úteis = segunda a sexta)
  select value into v_ipca from public.w_indices where name = 'IPCA' order by date desc limit 1;
  with cal as (
    select g::date d from generate_series(v_date + 1, current_date, interval '1 day') g where extract(isodow from g) < 6),
  biz as (
    select c.d, coalesce(i.value, case when c.d > v_last then v_rate end) cdi
      from cal c left join public.w_indices i on i.name = 'CDI' and i.date = c.d
     where i.value is not null or c.d > v_last or v_last = v_date),
  x as (select d, coalesce(cdi, 0) cdi, row_number() over (order by d) du from biz),
  calc as (
    select d, du,
           sum(case when a.indexer in ('CDI', 'SELIC') then ln(1 + a.rate * cdi / 100) else 0 end) over (order by d) lcdi
      from x),
  pu as (
    select v_date d, v_price p
    union all
    select c.d, v_price * case
        when a.indexer in ('CDI', 'SELIC') then exp(c.lcdi)
        when a.indexer = 'PRE' then power(1 + a.rate, c.du / 252.0)
        else exp(coalesce((select sum(ln(1 + i.value / 100)) from public.w_indices i where i.name = 'IPCA' and i.date > date_trunc('month', v_date) and i.date < date_trunc('month', c.d)), 0)
                 + case when exists (select 1 from public.w_indices i where i.name = 'IPCA' and i.date = date_trunc('month', c.d)) or v_ipca is null then 0
                        else ln(1 + v_ipca / 100) * least(extract(day from c.d) / 30.0, 1) end)
             * power(1 + a.rate, c.du / 252.0) end
      from calc c)
  insert into public.w_asset_prices (asset_id, date, pu, source)
  select p_asset, pu.d, round(pu.p::numeric, 8), 'curva' from pu where pu.p is not null and pu.p > 0
  on conflict (asset_id, date) do update set pu = excluded.pu where public.w_asset_prices.source = 'curva';
  get diagnostics n = row_count;
  delete from public.w_asset_prices where asset_id = p_asset and source = 'curva' and date < v_date;
  return n;
end $$;
revoke all on function public._w_rf_reprice(uuid) from public, anon, authenticated;
grant execute on function public._w_rf_reprice(uuid) to service_role;

create or replace function public.w_rf_reprice_all()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select id from public.w_assets where wallet_id is not null and not custom and indexer is not null and rate is not null and kind in ('rf_pre', 'rf_pos', 'rf_ipca') loop
    n := n + public._w_rf_reprice(r.id);
  end loop;
  return n;
end $$;
revoke all on function public.w_rf_reprice_all() from public, anon, authenticated;
grant execute on function public.w_rf_reprice_all() to service_role;

-- reprecifica sozinho quando o ativo é criado ou editado (cadastro, edição em lote, importação)
create or replace function public._w_rf_reprice_trg()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public._w_rf_reprice(new.id);
  return null;
end $$;
revoke all on function public._w_rf_reprice_trg() from public, anon, authenticated;
drop trigger if exists w_assets_rf_reprice on public.w_assets;
create trigger w_assets_rf_reprice after insert or update of kind, indexer, rate, custom on public.w_assets
  for each row when (new.wallet_id is not null and new.indexer is not null and new.rate is not null and not new.custom)
  execute function public._w_rf_reprice_trg();

-- Índices do Banco Central direto do banco: pede à API pública (pg_net) e grava a resposta (SGS 12 = CDI diário, 433 = IPCA mensal)
create or replace function public.w_indices_refresh()
returns void language plpgsql security definer set search_path = '' as $$
declare v_from date; v_req bigint; k record;
begin
  if to_regprocedure('net.http_get(text,jsonb,jsonb,integer)') is null then return; end if;
  for k in select * from (values ('CDI', 12), ('IPCA', 433)) t(nm, serie) loop
    select coalesce(max(date), date '2018-01-01') - 45 into v_from from public.w_indices where name = k.nm;
    execute format($q$select net.http_get(url := %L, headers := '{"accept":"application/json","user-agent":"LottusWealth/1.0"}'::jsonb, timeout_milliseconds := 20000)$q$,
      format('https://api.bcb.gov.br/dados/serie/bcdata.sgs.%s/dados?formato=json&dataInicial=%s&dataFinal=%s', k.serie, to_char(v_from, 'DD/MM/YYYY'), to_char(current_date, 'DD/MM/YYYY'))) into v_req;
    insert into public.w_system (key, value) values ('indices_req_' || lower(k.nm), v_req::text) on conflict (key) do update set value = excluded.value;
  end loop;
end $$;

create or replace function public.w_indices_ingest()
returns integer language plpgsql security definer set search_path = '' as $$
declare k record; v_content text; v_status int; n int := 0; c int;
begin
  if to_regclass('net._http_response') is null then return 0; end if;
  for k in select s.key, s.value, case s.key when 'indices_req_cdi' then 'CDI' else 'IPCA' end nm from public.w_system s where s.key in ('indices_req_cdi', 'indices_req_ipca') loop
    execute format('select status_code, content from net._http_response where id = %L::bigint', k.value) into v_status, v_content;
    if v_status = 200 and v_content is not null and v_content like '[%' then
      insert into public.w_indices (name, date, value)
      select k.nm, to_date(x->>'data', 'DD/MM/YYYY'), (x->>'valor')::numeric from jsonb_array_elements(v_content::jsonb) x
       where (x->>'valor') ~ '^-?[0-9.]+$' and (x->>'data') ~ '^\d{2}/\d{2}/\d{4}$'
      on conflict (name, date) do update set value = excluded.value;
      get diagnostics c = row_count; n := n + c;
      delete from public.w_system where key = k.key;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.w_indices_refresh(), public.w_indices_ingest() from public, anon, authenticated;
grant execute on function public.w_indices_refresh(), public.w_indices_ingest() to service_role;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('wealth-indices-fetch', '0 10,21 * * *', 'select public.w_indices_refresh()');
    perform cron.schedule('wealth-indices-ingest', '10 10,21 * * *', 'select public.w_indices_ingest()');
    perform cron.schedule('wealth-rf-reprice', '20 10,21 * * *', 'select public.w_rf_reprice_all()');
  end if;
end $$;
