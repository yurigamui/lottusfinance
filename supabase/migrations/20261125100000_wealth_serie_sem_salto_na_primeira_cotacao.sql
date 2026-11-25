-- Wealth: a série de valor não dá mais salto na 1ª cotação de um ativo comprado antes de existir histórico de preço.
-- Antes: entre a compra e a 1ª cotação valia o preço pago e, no dia da 1ª cotação, o valor pulava ("explosão de rentabilidade"). Agora o preço é interpolado
-- (linear) entre o preço da última operação e a 1ª cotação. Só leitura; mesmas assinaturas e permissões.
CREATE OR REPLACE FUNCTION public.w_equity_range(p_wallet uuid, p_from date, p_to date, p_mode text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m text; bm text; v_to date := least(coalesce(p_to, current_date), current_date); v_from date; v_step text; v_span int;
begin
  perform public._w_need(p_wallet, 'visualizador');
  m := public._w_mode(p_wallet, p_mode);
  select benchmark into bm from public.w_wallets where id = p_wallet;
  v_from := coalesce(p_from, v_to - 365);
  if v_from > v_to then raise exception 'invalid_value'; end if;
  -- não começa antes da 1ª atividade da carteira (transação, lançamento ou saldo inicial)
  v_from := greatest(v_from, coalesce((select least((select min(date) from public.w_invest_tx where wallet_id = p_wallet), (select min(date) from public.w_spend_tx where wallet_id = p_wallet),
                                                      (select min(opening_date) from public.w_bank_accounts where wallet_id = p_wallet))), v_from));
  if v_from > v_to then v_from := v_to; end if;
  if v_to - v_from > 18300 then v_from := v_to - 18300; end if;  -- 50 anos (passo mensal acima de 1.500 dias)
  v_span := v_to - v_from;
  v_step := case when v_span <= 400 then 'dia' when v_span <= 1500 then 'semana' else 'mes' end;
  return jsonb_build_object('from', v_from, 'to', v_to, 'step', v_step, 'mode', m, 'benchmark', bm, 'points', coalesce((
    with days as (
      select d::date d from generate_series(v_from, v_to, case v_step when 'dia' then interval '1 day' when 'semana' then interval '7 days' else interval '1 month' end) d
      union select v_to),
    tx as (select t.asset_id, t.date, t.created_at, t.kind, t.qty, t.unit_price from public.w_invest_tx t where t.wallet_id = p_wallet and t.date <= v_to),
    assets as (select distinct asset_id from tx),
    -- preços do período + o último antes dele (um por ativo), na visão escolhida
    prices as (
      select p.asset_id, p.date, case when m = 'mercado' then coalesce(p.pu_mercado, p.pu) else p.pu end pu
        from public.w_asset_prices p join assets a on a.asset_id = p.asset_id where p.date between v_from and v_to
      union all
      select a.asset_id, lp.date, lp.pu from assets a cross join lateral (
        select p.date, case when m = 'mercado' then coalesce(p.pu_mercado, p.pu) else p.pu end pu from public.w_asset_prices p where p.asset_id = a.asset_id and p.date < v_from order by p.date desc limit 1) lp),
    -- linha do tempo por ativo: preço (0), transação (1) e dia do gráfico (2); acumula quantidade e "carrega" o último preço
    ev as (
      select asset_id, date, 0 o, null::timestamptz ts, pu pa, null::numeric pt, 0::numeric dq, null::date td from prices
      union all select asset_id, date, 1, created_at, null, case when kind in ('compra', 'venda') then unit_price end, case kind when 'compra' then qty when 'venda' then -qty else 0 end, case when kind in ('compra', 'venda') then date end from tx
      union all select a.asset_id, x.d, 2, null, null, null, 0, null from assets a cross join days x),
    c1 as (select e.*, sum(e.dq) over w q, count(e.pa) over w ca, count(e.pt) over w ct from ev e window w as (partition by e.asset_id order by e.date, e.o, e.ts rows unbounded preceding)),
    c2 as (select c.asset_id, c.date, c.o, c.q, max(c.pa) over (partition by c.asset_id, c.ca) pa, max(c.pt) over (partition by c.asset_id, c.ct) pt, max(c.td) over (partition by c.asset_id, c.ct) td from c1 c),
    -- 1ª cotação de cada ativo até o fim do período: antes dela o valor é interpolado do preço da última operação até essa cotação (sem salto)
    fq as (select distinct on (p.asset_id) p.asset_id, p.date fd, case when m = 'mercado' then coalesce(p.pu_mercado, p.pu) else p.pu end fp from public.w_asset_prices p join assets a on a.asset_id = p.asset_id where p.date <= v_to order by p.asset_id, p.date),
    inv as (select c.date d, sum(c.q * case when c.pa is null and c.pt is not null and c.td is not null and f.fd is not null and c.date < f.fd then c.pt + (f.fp - c.pt) * (c.date - c.td)::numeric / greatest(f.fd - c.td, 1) else coalesce(c.pa, c.pt, 0) end) v from c2 c left join fq f on f.asset_id = c.asset_id where c.o = 2 and c.q <> 0 group by c.date),
    -- benchmark: L(d) acumulado e peso de cada aporte e^(−L(data))
    flows as (select date, sum(case kind when 'compra' then qty * unit_price else -qty * unit_price end) f from tx where kind in ('compra', 'venda') group by date),
    idx as (select i.date, ln(1 + i.value / 100) l from public.w_indices i where bm <> 'nenhum' and i.name = bm and i.date <= v_to),
    acc as (select e.date, e.f, e.o, sum(e.l) over (order by e.date, e.o rows unbounded preceding) cum
              from (select date, l, 0::numeric f, 0 o from idx union all select date, 0, f, 1 from flows) e),
    -- linha do tempo geral: gastos, aportes, índice, peso do benchmark e os dias do gráfico (por último no mesmo dia)
    tl as (
      select date, 0 o, s.amount sa, 0::numeric sf, 0::numeric sl, 0::numeric sw from public.w_spend_tx s where s.wallet_id = p_wallet and s.date <= v_to
      union all select date, 0, 0, f, 0, 0 from flows
      union all select date, 0, 0, 0, l, 0 from idx
      union all select date, 0, 0, 0, 0, f * exp(-cum) from acc where o = 1
      union all select d, 1, 0, 0, 0, 0 from days),
    run as (select t.date, t.o, sum(t.sa) over w a, sum(t.sf) over w f, sum(t.sl) over w l, sum(t.sw) over w s from tl t window w as (order by t.date, t.o rows unbounded preceding)),
    ob as (select coalesce(sum(opening_balance), 0) v from public.w_bank_accounts where wallet_id = p_wallet)
    select jsonb_agg(jsonb_build_object('date', r.date, 'investimentos', coalesce(i.v, 0), 'contas', ob.v + r.a, 'total', coalesce(i.v, 0) + ob.v + r.a, 'aportes', r.f,
                     'benchmark', case when bm = 'nenhum' then null else round(exp(r.l) * r.s, 2) end) order by r.date)
      from run r cross join ob left join inv i on i.d = r.date where r.o = 1
  ), '[]'::jsonb));
end $function$;

create or replace function public.w_dashboard_series(p_wallet uuid, p_from date default null, p_to date default null, p_mode text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m text; v_to date := least(coalesce(p_to, current_date), current_date); v_from date; v_first date; v_all date;
begin
  perform public._w_need(p_wallet, 'visualizador');
  m := public._w_mode(p_wallet, p_mode);
  select min(date) into v_first from public.w_invest_tx where wallet_id = p_wallet;
  if v_first is null then return jsonb_build_object('from', null, 'to', v_to, 'first', null, 'mode', m, 'days', '[]'::jsonb, 'income', '[]'::jsonb); end if;
  v_from := greatest(coalesce(p_from, v_first), v_first, v_to - 3660);   -- até 10 anos de série diária
  if v_from > v_to then v_from := v_to; end if;
  -- um dia antes do início serve de base para o primeiro retorno
  v_all := v_from - 1;
  return jsonb_build_object('from', v_from, 'to', v_to, 'first', v_first, 'mode', m, 'days', coalesce((
    with days as (select d::date d from generate_series(v_all, v_to, interval '1 day') d),
    tx as (select t.asset_id, t.date, t.created_at, t.kind, t.qty, t.unit_price from public.w_invest_tx t where t.wallet_id = p_wallet and t.date <= v_to),
    assets as (select distinct asset_id from tx),
    prices as (
      select p.asset_id, p.date, case when m = 'mercado' then coalesce(p.pu_mercado, p.pu) else p.pu end pu
        from public.w_asset_prices p join assets a on a.asset_id = p.asset_id where p.date between v_all and v_to
      union all
      select a.asset_id, lp.date, lp.pu from assets a cross join lateral (
        select p.date, case when m = 'mercado' then coalesce(p.pu_mercado, p.pu) else p.pu end pu from public.w_asset_prices p where p.asset_id = a.asset_id and p.date < v_all order by p.date desc limit 1) lp),
    ev as (
      select asset_id, date, 0 o, null::timestamptz ts, pu pa, null::numeric pt, 0::numeric dq, null::date td from prices
      union all select asset_id, date, 1, created_at, null, case when kind in ('compra', 'venda') then unit_price end, case kind when 'compra' then qty when 'venda' then -qty else 0 end, case when kind in ('compra', 'venda') then date end from tx
      union all select a.asset_id, x.d, 2, null, null, null, 0, null from assets a cross join days x),
    c1 as (select e.*, sum(e.dq) over w q, count(e.pa) over w ca, count(e.pt) over w ct from ev e window w as (partition by e.asset_id order by e.date, e.o, e.ts rows unbounded preceding)),
    c2 as (select c.asset_id, c.date, c.o, c.q, max(c.pa) over (partition by c.asset_id, c.ca) pa, max(c.pt) over (partition by c.asset_id, c.ct) pt, max(c.td) over (partition by c.asset_id, c.ct) td from c1 c),
    -- 1ª cotação de cada ativo até o fim do período: antes dela o valor é interpolado do preço da última operação até essa cotação (sem salto)
    fq as (select distinct on (p.asset_id) p.asset_id, p.date fd, case when m = 'mercado' then coalesce(p.pu_mercado, p.pu) else p.pu end fp from public.w_asset_prices p join assets a on a.asset_id = p.asset_id where p.date <= v_to order by p.asset_id, p.date),
    inv as (select c.date d, sum(c.q * case when c.pa is null and c.pt is not null and c.td is not null and f.fd is not null and c.date < f.fd then c.pt + (f.fp - c.pt) * (c.date - c.td)::numeric / greatest(f.fd - c.td, 1) else coalesce(c.pa, c.pt, 0) end) v from c2 c left join fq f on f.asset_id = c.asset_id where c.o = 2 and c.q <> 0 group by c.date),
    fl as (select date d, sum(case kind when 'compra' then qty * unit_price when 'venda' then -qty * unit_price else 0 end) f, sum(case kind when 'provento' then qty * unit_price else 0 end) i from tx group by date),
    cdi as (select date d, value from public.w_indices where name = 'CDI' and date <= v_to),
    cdic as (select x.d, coalesce((select exp(sum(ln(1 + c.value / 100))) from cdi c where c.d > v_all and c.d <= x.d), 1) k from days x)
    select jsonb_agg(jsonb_build_array(x.d, round(coalesce(i.v, 0), 2), round(coalesce(f.f, 0), 2), round(coalesce(f.i, 0), 2), round(k.k, 8)) order by x.d)
      from days x left join inv i on i.d = x.d left join fl f on f.d = x.d join cdic k on k.d = x.d
  ), '[]'::jsonb));
end $$;
