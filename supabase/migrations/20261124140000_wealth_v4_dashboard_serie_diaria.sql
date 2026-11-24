-- Wealth v4 (dashboard): série diária para rentabilidade, volatilidade, drawdown e comparação com o CDI.
-- Só leitura. Não aplicada em produção.
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
      select asset_id, date, 0 o, null::timestamptz ts, pu pa, null::numeric pt, 0::numeric dq from prices
      union all select asset_id, date, 1, created_at, null, case when kind in ('compra', 'venda') then unit_price end, case kind when 'compra' then qty when 'venda' then -qty else 0 end from tx
      union all select a.asset_id, x.d, 2, null, null, null, 0 from assets a cross join days x),
    c1 as (select e.*, sum(e.dq) over w q, count(e.pa) over w ca, count(e.pt) over w ct from ev e window w as (partition by e.asset_id order by e.date, e.o, e.ts rows unbounded preceding)),
    c2 as (select c.date, c.o, c.q, max(c.pa) over (partition by c.asset_id, c.ca) pa, max(c.pt) over (partition by c.asset_id, c.ct) pt from c1 c),
    inv as (select c.date d, sum(c.q * coalesce(c.pa, c.pt, 0)) v from c2 c where c.o = 2 and c.q <> 0 group by c.date),
    fl as (select date d, sum(case kind when 'compra' then qty * unit_price when 'venda' then -qty * unit_price else 0 end) f, sum(case kind when 'provento' then qty * unit_price else 0 end) i from tx group by date),
    cdi as (select date d, value from public.w_indices where name = 'CDI' and date <= v_to),
    cdic as (select x.d, coalesce((select exp(sum(ln(1 + c.value / 100))) from cdi c where c.d > v_all and c.d <= x.d), 1) k from days x)
    select jsonb_agg(jsonb_build_array(x.d, round(coalesce(i.v, 0), 2), round(coalesce(f.f, 0), 2), round(coalesce(f.i, 0), 2), round(k.k, 8)) order by x.d)
      from days x left join inv i on i.d = x.d left join fl f on f.d = x.d join cdic k on k.d = x.d
  ), '[]'::jsonb));
end $$;
revoke all on function public.w_dashboard_series(uuid, date, date, text) from public, anon;
grant execute on function public.w_dashboard_series(uuid, date, date, text) to authenticated;
