-- Lottus Wealth v2 (pedido do Yuri em 23/11/2026). NÃO APLICADA: testar no branch antes (D-01).
-- 1. Configurações da carteira: benchmark e visão padrão (a mercado ou na curva).
-- 2. Excluir carteira de vez (só o titular, digitando o nome); faturas ficam.
-- 3. Plano Pro sem exigir a 2ª carteira: assinatura explícita (w_plan_change); Grátis = 1 carteira.
-- 4. Visão "A mercado" × "Na curva" em patrimônio, posição, evolução, grupos e API.
-- 5. Bens e dívidas saem do produto: o patrimônio passa a ser investimentos + contas.
--    A tabela w_other fica (sem dados em produção em 23/11; nada é apagado) e as RPCs dela deixam de ser chamáveis.
-- 6. Marca do grupo aplicada à carteira (logo no lugar das iniciais), lida por w_wallets_list.
-- 7. Dados pessoais editáveis (nome e telefone) sem duplicar: grava em profiles e em w_profiles (W-029).
-- 8. API v2: chave restrita a carteiras, chamada única w_api_call só para service_role (função de borda wealth-api).
-- 9. Cobrança: autorização do cartão/Pix Automático pelo provedor (w_billing_authorized) e dados para o checkout.

-- ============ 1. Configurações da carteira ============
alter table public.w_wallets add column if not exists benchmark text not null default 'CDI';
alter table public.w_wallets add column if not exists view_mode text not null default 'curva';
alter table public.w_wallets drop constraint if exists w_wallets_benchmark_check;
alter table public.w_wallets add constraint w_wallets_benchmark_check check (benchmark in ('CDI', 'IPCA', 'nenhum'));
alter table public.w_wallets drop constraint if exists w_wallets_view_mode_check;
alter table public.w_wallets add constraint w_wallets_view_mode_check check (view_mode in ('curva', 'mercado'));

create or replace function public.w_wallet_settings_save(p_wallet uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text := trim(coalesce(p->>'name', ''));
begin
  perform public._w_need(p_wallet, 'gestor', true);
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'invalid_name'; end if;
  if coalesce(p->>'benchmark', 'CDI') not in ('CDI', 'IPCA', 'nenhum') or coalesce(p->>'view_mode', 'curva') not in ('curva', 'mercado') then raise exception 'invalid_value'; end if;
  update public.w_wallets set name = v_name, benchmark = coalesce(p->>'benchmark', benchmark), view_mode = coalesce(p->>'view_mode', view_mode) where id = p_wallet;
  perform public._w_audit(p_wallet, 'wallet_updated', jsonb_build_object('name', v_name, 'benchmark', p->>'benchmark', 'view_mode', p->>'view_mode'));
end $$;
revoke all on function public.w_wallet_settings_save(uuid, jsonb) from public, anon;
grant execute on function public.w_wallet_settings_save(uuid, jsonb) to authenticated;

-- ============ 2. Excluir carteira de vez ============
create or replace function public.w_wallet_delete(p_wallet uuid, p_confirm text)
returns void language plpgsql security definer set search_path = '' as $$
declare w public.w_wallets;
begin
  perform public._w_need(p_wallet, 'gestor');
  select * into w from public.w_wallets where id = p_wallet;
  if w.owner_id <> auth.uid() then raise exception 'owner_only'; end if;
  if lower(trim(coalesce(p_confirm, ''))) <> lower(trim(w.name)) then raise exception 'confirm_mismatch'; end if;
  -- lançamentos primeiro (o gatilho de posição não deve ver ativos já removidos); o resto sai em cascata pela carteira
  delete from public.w_invest_tx where wallet_id = p_wallet;
  delete from public.w_spend_tx where wallet_id = p_wallet;
  delete from public.w_wallets where id = p_wallet;
  -- registro fora da carteira (w_audit da carteira sai junto): só o fato e o nome
  perform public._w_audit(null, 'wallet_deleted', jsonb_build_object('wallet', p_wallet, 'name', w.name));
end $$;
revoke all on function public.w_wallet_delete(uuid, text) from public, anon;
grant execute on function public.w_wallet_delete(uuid, text) to authenticated;

-- ============ 3. Plano: assinatura explícita, sem exigir a 2ª carteira ============
-- _w_replan não troca mais o plano pela quantidade de carteiras (antes: 2 carteiras = Pro automático)
create or replace function public._w_replan(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- mantida por compatibilidade com as RPCs que a chamam; o plano agora muda só por w_plan_change ou pela equipe
  perform 1 from public.w_profiles where user_id = p_user;
end $$;

create or replace function public.w_wallet_create(p_name text, p_kind text default 'pessoal')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pr public.w_profiles; n int; v_id uuid;
begin
  select * into pr from public.w_profiles where user_id = auth.uid() and completed_at is not null;
  if not found then raise exception 'profile_required'; end if;
  if pr.billing_status = 'atrasado' then raise exception 'read_only'; end if;
  select count(*) into n from public.w_wallets where owner_id = auth.uid() and archived_at is null;
  if n >= 1 and pr.plan = 'gratis' then raise exception 'plan_required'; end if;
  insert into public.w_wallets (name, kind, owner_id, created_by) values (trim(p_name), coalesce(p_kind, 'pessoal'), auth.uid(), auth.uid()) returning id into v_id;
  insert into public.w_members (wallet_id, user_id, role) values (v_id, auth.uid(), 'gestor');
  perform public._w_audit(v_id, 'wallet_created', jsonb_build_object('name', trim(p_name)));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.w_member_remove(p_wallet uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w public.w_wallets; me public.w_profiles; v_old uuid; n int;
begin
  perform public._w_need(p_wallet, 'gestor', true);
  select * into w from public.w_wallets where id = p_wallet;
  if not exists (select 1 from public.w_members where wallet_id = p_wallet and user_id = p_user) then raise exception 'not_found'; end if;
  if p_user = auth.uid() and w.owner_id = auth.uid() then raise exception 'owner_cannot_leave'; end if;
  if (select count(*) from public.w_members where wallet_id = p_wallet and role = 'gestor' and user_id <> p_user) = 0 then raise exception 'last_manager'; end if;
  if p_user = w.owner_id then
    select * into me from public.w_profiles where user_id = auth.uid();
    select count(*) into n from public.w_wallets where owner_id = auth.uid() and archived_at is null;
    if n >= 1 and me.plan = 'gratis' then raise exception 'plan_required'; end if;
    v_old := w.owner_id;
    update public.w_wallets set owner_id = auth.uid() where id = p_wallet;
  end if;
  delete from public.w_members where wallet_id = p_wallet and user_id = p_user;
  perform public._w_audit(p_wallet, 'member_removed', jsonb_build_object('user', p_user, 'owner_changed', v_old is not null));
  return jsonb_build_object('owner_changed', v_old is not null);
end $$;

-- Assinar, trocar ou cancelar o plano. Pro e Fund pedem dados de cobrança; Grátis só com 1 carteira.
create or replace function public.w_plan_change(p_plan text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pr public.w_profiles; n int;
begin
  select * into pr from public.w_profiles where user_id = auth.uid() and completed_at is not null;
  if not found then raise exception 'profile_required'; end if;
  if p_plan not in ('gratis', 'pro', 'fund') then raise exception 'invalid_value'; end if;
  if p_plan = pr.plan then return public.w_billing_me(); end if;
  if p_plan = 'gratis' then
    select count(*) into n from public.w_wallets where owner_id = auth.uid() and archived_at is null;
    if n > 1 then raise exception 'too_many_wallets'; end if;
  elsif not exists (select 1 from public.w_billing_profiles where user_id = auth.uid()) then
    raise exception 'billing_required';
  end if;
  update public.w_profiles set plan = p_plan where user_id = auth.uid();
  perform public._w_audit(null, 'plan_changed', jsonb_build_object('from', pr.plan, 'to', p_plan));
  return public.w_billing_me();
end $$;
revoke all on function public.w_plan_change(text) from public, anon;
grant execute on function public.w_plan_change(text) to authenticated;

-- Fatura do mês: todo Pro e Fund (antes: Pro só com 2+ carteiras)
create or replace function public.w_billing_close(p_ref date default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_ref date := coalesce(date_trunc('month', p_ref)::date, (date_trunc('month', current_date) - interval '1 month')::date); v_end date := (v_ref + interval '1 month - 1 day')::date;
        u record; v_aum numeric; v_n int := 0; v_detail jsonb;
begin
  for u in select o.owner_id, p.plan, count(*) n from public.w_wallets o join public.w_profiles p on p.user_id = o.owner_id
            where o.archived_at is null and o.created_at::date <= v_end and p.plan in ('pro', 'fund')
            group by o.owner_id, p.plan loop
    select coalesce(sum(public._w_invest_value(id, v_end)), 0),
           jsonb_agg(jsonb_build_object('wallet', name, 'aum', public._w_invest_value(id, v_end), 'amount', public._w_price(u.plan)))
      into v_aum, v_detail from public.w_wallets where owner_id = u.owner_id and archived_at is null and created_at::date <= v_end;
    insert into public.w_invoices (user_id, ref_month, aum, amount, status, due_date, detail)
    values (u.owner_id, v_ref, v_aum, u.n * public._w_price(u.plan), 'aberta', (v_end + interval '10 days')::date, coalesce(v_detail, '[]'::jsonb))
    on conflict (user_id, ref_month) do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.w_billing_me()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare pr public.w_profiles; v_n int; v_aum numeric; v_billed boolean; bp public.w_billing_profiles;
begin
  select * into pr from public.w_profiles where user_id = auth.uid();
  if not found then raise exception 'profile_required'; end if;
  select * into bp from public.w_billing_profiles where user_id = auth.uid();
  select count(*), coalesce(sum(public._w_invest_value(id, current_date)), 0) into v_n, v_aum from public.w_wallets where owner_id = auth.uid() and archived_at is null;
  v_billed := pr.plan in ('pro', 'fund');
  return jsonb_build_object('plan', pr.plan, 'payment_ok', pr.payment_ok, 'billing_status', pr.billing_status, 'overdue_since', pr.overdue_since,
    'owned_wallets', v_n, 'aum', v_aum, 'billed', v_billed, 'price', case when v_billed then public._w_price(pr.plan) end,
    'estimate', case when v_billed then v_n * public._w_price(pr.plan) end, 'grace_days', 10,
    'prices', jsonb_build_object('pro', public._w_price('pro'), 'fund', public._w_price('fund')),
    'card', case when bp.card_last4 is not null then jsonb_build_object('brand', bp.card_brand, 'last4', bp.card_last4) end,
    'wallets', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'aum', public._w_invest_value(id, current_date)) order by created_at) from public.w_wallets where owner_id = auth.uid() and archived_at is null), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'ref_month', ref_month, 'aum', aum, 'amount', amount, 'status', status, 'due_date', due_date, 'paid_at', paid_at, 'detail', detail,
                    'method', method, 'pix_payload', pix_payload, 'boleto_url', boleto_url, 'boleto_line', boleto_line, 'payment_error', payment_error) order by ref_month desc)
                  from public.w_invoices where user_id = auth.uid()), '[]'::jsonb));
end $$;

-- Provedor confirmou a autorização recorrente (cartão tokenizado no ambiente dele ou Pix Automático aceito no banco do pagador)
create or replace function public.w_billing_authorized(p_provider text, p_customer_id text, p_card_brand text default null, p_card_last4 text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  select user_id into v_user from public.w_billing_profiles where provider = p_provider and provider_customer_id = p_customer_id;
  if v_user is null then return 'not_found'; end if;
  update public.w_billing_profiles set card_brand = coalesce(p_card_brand, card_brand), card_last4 = coalesce(nullif(right(regexp_replace(coalesce(p_card_last4, ''), '\D', '', 'g'), 4), ''), card_last4) where user_id = v_user;
  update public.w_profiles set payment_ok = true where user_id = v_user;
  perform public._w_audit(null, 'payment_authorized', jsonb_build_object('user', v_user, 'provider', p_provider));
  return 'ok';
end $$;
revoke all on function public.w_billing_authorized(text, text, text, text) from public, anon, authenticated;
grant execute on function public.w_billing_authorized(text, text, text, text) to service_role;

-- Dados para o checkout (função de borda, com o usuário já autenticado por ela) e gravação do cliente no provedor
create or replace function public.w_billing_checkout_info(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('plan', p.plan, 'price', public._w_price(p.plan),
    'wallets', (select count(*) from public.w_wallets where owner_id = p_user and archived_at is null),
    'profile', to_jsonb(b) - 'user_id')
    from public.w_profiles p left join public.w_billing_profiles b on b.user_id = p.user_id where p.user_id = p_user;
$$;
revoke all on function public.w_billing_checkout_info(uuid) from public, anon, authenticated;
grant execute on function public.w_billing_checkout_info(uuid) to service_role;

create or replace function public.w_billing_set_customer(p_user uuid, p_provider text, p_customer_id text)
returns void language sql security definer set search_path = '' as $$
  update public.w_billing_profiles set provider = p_provider, provider_customer_id = p_customer_id, updated_at = now() where user_id = p_user;
$$;
revoke all on function public.w_billing_set_customer(uuid, text, text) from public, anon, authenticated;
grant execute on function public.w_billing_set_customer(uuid, text, text) to service_role;

-- ============ 4 e 5. A mercado × na curva; patrimônio sem bens e dívidas ============
create or replace function public._w_mode(p_wallet uuid, p_mode text)
returns text language sql stable security definer set search_path = '' as $$
  select case when p_mode in ('curva', 'mercado') then p_mode else coalesce((select view_mode from public.w_wallets where id = p_wallet), 'curva') end;
$$;

-- a mercado: usa o P.U. de mercado quando existe (renda fixa); nos demais ativos o preço já é de mercado
create or replace function public._w_invest_value_m(p_wallet uuid, p_asof date, p_mode text)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(qty * case when p_mode = 'mercado' then coalesce(pu_mercado, pu) else pu end), 0) from public._w_pos(p_wallet, p_asof);
$$;

-- fator acumulado do benchmark entre duas datas (CDI diário; IPCA mensal, data = 1º dia do mês)
create or replace function public._w_bench_factor(p_name text, p_from date, p_to date)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(exp(sum(ln(1 + value / 100))), 1) from public.w_indices where name = p_name and date > p_from and date <= p_to;
$$;

revoke all on function public._w_mode(uuid, text), public._w_invest_value_m(uuid, date, text), public._w_bench_factor(text, date, date) from public, anon;
-- internas: sem grant para authenticated (as RPCs públicas as chamam como dono, depois de conferir o acesso)
revoke execute on function public._w_mode(uuid, text), public._w_invest_value_m(uuid, date, text), public._w_bench_factor(text, date, date) from authenticated;
grant execute on function public._w_mode(uuid, text), public._w_invest_value_m(uuid, date, text), public._w_bench_factor(text, date, date) to service_role;

drop function if exists public.w_networth(uuid);
create or replace function public.w_networth(p_wallet uuid, p_mode text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m text; i numeric; c numeric; k numeric; ic numeric;
begin
  perform public._w_need(p_wallet, 'visualizador');
  m := public._w_mode(p_wallet, p_mode);
  i := public._w_invest_value_m(p_wallet, current_date, m); ic := public._w_invest_value(p_wallet, current_date);
  c := public._w_cash(p_wallet, current_date); k := public._w_contrib(p_wallet, current_date);
  return jsonb_build_object('mode', m, 'investimentos', i, 'investimentos_curva', ic, 'contas', c, 'total', i + c, 'aportes', k, 'resultado', i - k,
    'rentabilidade', case when k > 0 then (i - k) / k end,
    'benchmark', (select benchmark from public.w_wallets where id = p_wallet),
    'tem_mercado', exists (select 1 from public._w_pos(p_wallet, current_date) where pu_mercado is not null));
end $$;
revoke all on function public.w_networth(uuid, text) from public, anon;
grant execute on function public.w_networth(uuid, text) to authenticated;

drop function if exists public.w_positions(uuid);
create or replace function public.w_positions(p_wallet uuid, p_mode text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_total numeric; m text;
begin
  perform public._w_need(p_wallet, 'visualizador');
  m := public._w_mode(p_wallet, p_mode);
  select coalesce(sum(qty * case when m = 'mercado' then coalesce(pu_mercado, pu) else pu end), 0) into v_total from public._w_pos(p_wallet, current_date);
  return coalesce((
    select jsonb_agg(jsonb_build_object('asset_id', a.id, 'name', a.name, 'ticker', a.ticker, 'kind', a.kind, 'indexer', a.indexer, 'rate', a.rate, 'maturity', a.maturity, 'custom', a.custom,
      'qty', p.qty, 'avg_pu', p.avg_pu, 'cost', p.qty * p.avg_pu, 'pu', p.pu, 'pu_date', p.pu_date, 'pu_mercado', p.pu_mercado,
      'value_curva', p.qty * p.pu, 'value_mercado', case when p.pu_mercado is not null then p.qty * p.pu_mercado end,
      'value', p.qty * x.pu_v, 'pu_view', x.pu_v, 'mode', m,
      'result', p.qty * (x.pu_v - p.avg_pu), 'result_pct', case when p.avg_pu > 0 then x.pu_v / p.avg_pu - 1 end,
      'weight', case when v_total > 0 then p.qty * x.pu_v / v_total end) order by p.qty * x.pu_v desc)
      from public._w_pos(p_wallet, current_date) p join public.w_assets a on a.id = p.asset_id
      cross join lateral (select case when m = 'mercado' then coalesce(p.pu_mercado, p.pu) else p.pu end as pu_v) x), '[]'::jsonb);
end $$;
revoke all on function public.w_positions(uuid, text) from public, anon;
grant execute on function public.w_positions(uuid, text) to authenticated;

-- evolução mensal com o benchmark: "aportes corrigidos" = quanto os aportes valeriam se rendessem o benchmark.
-- Conta em uma passada: com L(d) = soma de ln(1 + índice) até d, cada aporte vale fluxo × e^(L(d) − L(data do aporte)),
-- então benchmark(d) = e^L(d) × Σ fluxo × e^(−L(data)). Evita uma subconsulta por lançamento e por mês.
drop function if exists public.w_equity(uuid, integer);
create or replace function public.w_equity(p_wallet uuid, p_months integer default 12, p_mode text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_first date; m text; bm text;
begin
  perform public._w_need(p_wallet, 'visualizador');
  m := public._w_mode(p_wallet, p_mode);
  select benchmark into bm from public.w_wallets where id = p_wallet;
  v_first := (date_trunc('month', current_date) - make_interval(months => greatest(least(coalesce(p_months, 12), 120), 1) - 1))::date;
  return coalesce((
    with ev as (
      select i.date, ln(1 + i.value / 100) l, 0::numeric f, 0 o from public.w_indices i where bm <> 'nenhum' and i.name = bm
      union all
      select t.date, 0, case t.kind when 'compra' then t.qty * t.unit_price else -t.qty * t.unit_price end, 1
        from public.w_invest_tx t where t.wallet_id = p_wallet and t.kind in ('compra', 'venda')),
    acc as (select e.date, e.f, e.o, sum(e.l) over (order by e.date, e.o rows unbounded preceding) cum from ev e),
    tw as (select a.date, a.f * exp(-a.cum) w from acc a where a.o = 1),
    months as (select least((g + interval '1 month - 1 day')::date, current_date) d from generate_series(v_first, date_trunc('month', current_date)::date, interval '1 month') g)
    select jsonb_agg(jsonb_build_object('date', s.d, 'investimentos', s.i, 'contas', s.c, 'total', s.i + s.c, 'aportes', s.k, 'benchmark', s.bv) order by s.d)
      from (select x.d, public._w_invest_value_m(p_wallet, x.d, m) i, public._w_cash(p_wallet, x.d) c, public._w_contrib(p_wallet, x.d) k,
                   case when bm = 'nenhum' then null else round(
                     exp(coalesce((select sum(ln(1 + i.value / 100)) from public.w_indices i where i.name = bm and i.date <= x.d), 0))
                     * coalesce((select sum(tw.w) from tw where tw.date <= x.d), 0), 2) end bv
              from months x) s), '[]'::jsonb);
end $$;
revoke all on function public.w_equity(uuid, integer, text) from public, anon;
grant execute on function public.w_equity(uuid, integer, text) to authenticated;

-- carteiras: patrimônio sem bens e dívidas, na visão escolhida; marca do grupo (logo e cor) quando ativada
create or replace function public._w_wallet_brand(p_wallet uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('group_id', b.group_id, 'brand_name', b.brand_name, 'logo_url', b.logo_url, 'color', b.color, 'color2', b.color2, 'font', b.font, 'style', b.style)
    from public.w_group_wallets gw join public.w_groups g on g.id = gw.group_id join public.w_group_brand b on b.group_id = g.id
   where gw.wallet_id = p_wallet and b.enabled order by g.created_at limit 1;
$$;
revoke all on function public._w_wallet_brand(uuid) from public, anon;
revoke execute on function public._w_wallet_brand(uuid) from authenticated;
grant execute on function public._w_wallet_brand(uuid) to service_role;

create or replace function public.w_wallets_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'name', w.name, 'kind', w.kind, 'role', m.role, 'is_owner', w.owner_id = auth.uid(),
      'owner_name', (select name from public.w_profiles where user_id = w.owner_id),
      'read_only', w.archived_at is not null or po.billing_status = 'atrasado', 'archived', w.archived_at is not null,
      'members', (select count(*) from public.w_members x where x.wallet_id = w.id),
      'benchmark', w.benchmark, 'view_mode', w.view_mode,
      'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'mine', g.owner_id = auth.uid()) order by g.created_at) from public.w_group_wallets gw join public.w_groups g on g.id = gw.group_id where gw.wallet_id = w.id), '[]'::jsonb),
      'brand', public._w_wallet_brand(w.id),
      'invest', public._w_invest_value_m(w.id, current_date, w.view_mode),
      'networth', public._w_invest_value_m(w.id, current_date, w.view_mode) + public._w_cash(w.id, current_date)
    ) order by w.created_at)
    from public.w_members m join public.w_wallets w on w.id = m.wallet_id join public.w_profiles po on po.user_id = w.owner_id
    where m.user_id = auth.uid() and w.archived_at is null), '[]'::jsonb);
end $$;

create or replace function public.w_group_get(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_g public.w_groups; v_rows jsonb;
begin
  perform public._w_group_need(p_id);
  select * into v_g from public.w_groups where id = p_id;
  select coalesce(jsonb_agg(r order by r->>'name'), '[]'::jsonb) into v_rows from (
    select jsonb_build_object('id', w.id, 'name', w.name, 'role', m.role, 'view_mode', w.view_mode,
      'investimentos', public._w_invest_value_m(w.id, current_date, w.view_mode), 'contas', public._w_cash(w.id, current_date),
      'total', public._w_invest_value_m(w.id, current_date, w.view_mode) + public._w_cash(w.id, current_date)) r
      from public.w_group_wallets gw join public.w_members m on m.wallet_id = gw.wallet_id and m.user_id = auth.uid()
      join public.w_wallets w on w.id = gw.wallet_id and w.archived_at is null where gw.group_id = p_id) s;
  return jsonb_build_object('id', v_g.id, 'name', v_g.name, 'wallets', v_rows,
    'fund', exists (select 1 from public.w_profiles where user_id = auth.uid() and plan = 'fund'),
    'brand', (select to_jsonb(b) - 'group_id' from public.w_group_brand b where b.group_id = p_id),
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', gm.user_id, 'name', pr.name, 'email', u.email, 'role', gm.role, 'since', gm.since) order by pr.name)
                           from public.w_group_members gm join public.w_profiles pr on pr.user_id = gm.user_id join auth.users u on u.id = gm.user_id where gm.group_id = p_id), '[]'::jsonb));
end $$;

create or replace function public.w_groups_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  return jsonb_build_object('allowed', public._w_group_plan_ok(), 'groups', coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name,
        'wallets', coalesce((select jsonb_agg(gw.wallet_id) from public.w_group_wallets gw join public.w_members m on m.wallet_id = gw.wallet_id and m.user_id = auth.uid() where gw.group_id = g.id), '[]'::jsonb),
        'brand', (select jsonb_build_object('enabled', b.enabled, 'logo_url', b.logo_url, 'color', b.color) from public.w_group_brand b where b.group_id = g.id),
        'networth', coalesce((select sum(public._w_invest_value_m(gw.wallet_id, current_date, w.view_mode) + public._w_cash(gw.wallet_id, current_date))
                                from public.w_group_wallets gw join public.w_members m on m.wallet_id = gw.wallet_id and m.user_id = auth.uid() join public.w_wallets w on w.id = gw.wallet_id and w.archived_at is null
                               where gw.group_id = g.id), 0)
      ) order by g.created_at) from public.w_groups g where g.owner_id = auth.uid()), '[]'::jsonb));
end $$;

-- adicionar uma carteira a um grupo existente sem reescrever a lista (usado em Configurações > Marca)
create or replace function public.w_group_wallet_add(p_group uuid, p_wallet uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._w_group_need(p_group);
  if not public._w_group_plan_ok() then raise exception 'plan_required'; end if;
  perform public._w_need(p_wallet, 'gestor', true);
  insert into public.w_group_wallets (group_id, wallet_id) values (p_group, p_wallet) on conflict do nothing;
  perform public._w_group_sync(p_group);
end $$;
revoke all on function public.w_group_wallet_add(uuid, uuid) from public, anon;
grant execute on function public.w_group_wallet_add(uuid, uuid) to authenticated;

-- Bens e dívidas fora do produto (tabela mantida, sem dados em produção em 23/11/2026)
revoke execute on function public.w_other_save(uuid, jsonb), public.w_other_list(uuid), public.w_other_delete(uuid, uuid) from authenticated;

-- ============ 7. Dados pessoais ============
create or replace function public.w_profile_update(p_name text, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_name text := trim(coalesce(p_name, '')); v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if char_length(v_name) < 3 or char_length(v_name) > 120 then raise exception 'name_required'; end if;
  if v_phone is not null and length(v_phone) not between 10 and 13 then raise exception 'invalid_value'; end if;
  update public.w_profiles set name = v_name, phone = v_phone where user_id = auth.uid() and completed_at is not null;
  if not found then raise exception 'profile_required'; end if;
  update public.profiles set full_name = v_name, phone = v_phone, updated_at = now() where id = auth.uid();
  perform public._w_audit(null, 'profile_updated', '{}'::jsonb);
  return public.w_me();
end $$;
revoke all on function public.w_profile_update(text, text) from public, anon;
grant execute on function public.w_profile_update(text, text) to authenticated;

-- ============ 8. API v2 ============
alter table public.w_api_keys add column if not exists wallet_ids uuid[];
alter table public.w_api_keys add column if not exists expires_at timestamptz;

drop function if exists public.w_apikey_create(text);
create or replace function public.w_apikey_create(p_label text, p_wallets uuid[] default null, p_days integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_key text := 'wk_' || encode(extensions.gen_random_bytes(24), 'hex'); v_ids uuid[];
begin
  perform public._w_need_fund();
  if length(trim(coalesce(p_label, ''))) < 2 then raise exception 'name_required'; end if;
  if p_days is not null and (p_days < 1 or p_days > 730) then raise exception 'invalid_value'; end if;
  if p_wallets is not null and cardinality(p_wallets) > 0 then
    select array_agg(id) into v_ids from public.w_wallets where id = any(p_wallets) and owner_id = auth.uid() and archived_at is null;
    if v_ids is null or cardinality(v_ids) <> cardinality(p_wallets) then raise exception 'not_found'; end if;
  end if;
  insert into public.w_api_keys (user_id, label, prefix, key_hash, wallet_ids, expires_at)
  values (auth.uid(), trim(p_label), left(v_key, 9), public._sha256(v_key), v_ids, case when p_days is not null then now() + make_interval(days => p_days) end);
  return jsonb_build_object('key', v_key);
end $$;
revoke all on function public.w_apikey_create(text, uuid[], integer) from public, anon;
grant execute on function public.w_apikey_create(text, uuid[], integer) to authenticated;

create or replace function public.w_wl_get()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  return jsonb_build_object('fund', exists (select 1 from public.w_profiles where user_id = auth.uid() and plan = 'fund'),
    'keys', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'label', k.label, 'prefix', k.prefix, 'created_at', k.created_at, 'revoked_at', k.revoked_at, 'last_used_at', k.last_used_at,
                 'expires_at', k.expires_at, 'expired', k.expires_at is not null and k.expires_at < now(),
                 'wallets', case when k.wallet_ids is null then null else (select coalesce(jsonb_agg(w.name order by w.name), '[]'::jsonb) from public.w_wallets w where w.id = any(k.wallet_ids)) end) order by k.created_at desc)
             from public.w_api_keys k where k.user_id = auth.uid()), '[]'::jsonb));
end $$;

-- Chamada única da API (só a função de borda, com service_role). Reaproveita as RPCs da tela como se fosse o titular,
-- então as mesmas regras de acesso valem. Recursos só de leitura.
create or replace function public.w_api_call(p_key text, p_resource text, p_wallet uuid default null, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare k public.w_api_keys; v_mode text := nullif(p_params->>'visao', ''); v_res jsonb;
begin
  select * into k from public.w_api_keys where key_hash = public._sha256(coalesce(p_key, '')) and revoked_at is null and (expires_at is null or expires_at > now());
  if not found or not exists (select 1 from public.w_profiles where user_id = k.user_id and plan = 'fund' and billing_status = 'ok') then raise exception 'unauthorized'; end if;
  if v_mode is not null and v_mode not in ('curva', 'mercado') then raise exception 'invalid_value'; end if;
  update public.w_api_keys set last_used_at = now() where id = k.id;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', k.user_id, 'role', 'authenticated')::text, true);
  if p_resource = 'carteiras' then
    return jsonb_build_object('carteiras', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'nome', w.name, 'benchmark', w.benchmark, 'visao', w.view_mode,
             'patrimonio', public._w_invest_value_m(w.id, current_date, w.view_mode) + public._w_cash(w.id, current_date)) order by w.created_at)
             from public.w_wallets w where w.owner_id = k.user_id and w.archived_at is null and (k.wallet_ids is null or w.id = any(k.wallet_ids))), '[]'::jsonb));
  end if;
  if p_wallet is null or not exists (select 1 from public.w_wallets where id = p_wallet and owner_id = k.user_id and archived_at is null and (k.wallet_ids is null or id = any(k.wallet_ids))) then
    raise exception 'not_found';
  end if;
  case p_resource
    when 'patrimonio' then v_res := public.w_networth(p_wallet, v_mode);
    when 'posicoes' then v_res := public.w_positions(p_wallet, v_mode);
    when 'evolucao' then v_res := public.w_equity(p_wallet, coalesce(nullif(p_params->>'meses', '')::int, 12), v_mode);
    when 'transacoes' then v_res := public.w_tx_list(p_wallet, jsonb_build_object('from', p_params->>'de', 'to', p_params->>'ate'), coalesce(nullif(p_params->>'pagina', '')::int, 1));
    when 'gastos' then v_res := public.w_spend_list(p_wallet, jsonb_build_object('from', p_params->>'de', 'to', p_params->>'ate'), coalesce(nullif(p_params->>'pagina', '')::int, 1));
    else raise exception 'not_found';
  end case;
  return jsonb_build_object('carteira', p_wallet, 'dados', v_res);
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then
  raise exception 'invalid_value';
end $$;
revoke all on function public.w_api_call(text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.w_api_call(text, text, uuid, jsonb) to service_role;

-- a chamada antiga da API (v1) passa a usar a nova regra de patrimônio
create or replace function public.w_api_wallet(p_key text, p_wallet uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_wallet is null then return public.w_api_call(p_key, 'carteiras', null, '{}'::jsonb); end if;
  return public.w_api_call(p_key, 'patrimonio', p_wallet, '{}'::jsonb) || jsonb_build_object('posicoes', (public.w_api_call(p_key, 'posicoes', p_wallet, '{}'::jsonb))->'dados');
end $$;
revoke all on function public.w_api_wallet(text, uuid) from public, anon, authenticated;
grant execute on function public.w_api_wallet(text, uuid) to service_role;

-- ============ ciclo 2 da verificação ============
-- CPF ou CNPJ de cobrança conferido pelos dígitos verificadores (antes só pelo tamanho)
create or replace function public._w_cnpj_ok(p text) returns boolean language plpgsql immutable set search_path = '' as $$
declare d int[]; s int; r int; w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2]; w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if p !~ '^\d{14}$' or p ~ '^(\d)\1{13}$' then return false; end if;
  select array_agg(substr(p, g, 1)::int order by g) into d from generate_series(1, 14) g;
  s := 0; for i in 1..12 loop s := s + d[i] * w1[i]; end loop; r := s % 11; if (case when r < 2 then 0 else 11 - r end) <> d[13] then return false; end if;
  s := 0; for i in 1..13 loop s := s + d[i] * w2[i]; end loop; r := s % 11; return (case when r < 2 then 0 else 11 - r end) = d[14];
end $$;
revoke all on function public._w_cnpj_ok(text) from public, anon, authenticated;

create or replace function public.w_billing_profile_save(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_doc text := regexp_replace(coalesce(p->>'doc', ''), '\D', '', 'g'); v_zip text := regexp_replace(coalesce(p->>'zip', ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if length(trim(coalesce(p->>'holder_name', ''))) < 3 then raise exception 'name_required'; end if;
  if not ((length(v_doc) = 11 and public._w_cpf_ok(v_doc)) or (length(v_doc) = 14 and public._w_cnpj_ok(v_doc))) then raise exception 'doc_invalid'; end if;
  if v_zip !~ '^\d{8}$' then raise exception 'zip_invalid'; end if;
  if coalesce(trim(p->>'email'), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalid'; end if;
  insert into public.w_billing_profiles (user_id, holder_name, doc, email, zip, street, number, complement, district, city, state, method, updated_at)
  values (auth.uid(), trim(p->>'holder_name'), v_doc, lower(trim(p->>'email')), v_zip, trim(p->>'street'), trim(p->>'number'), nullif(trim(coalesce(p->>'complement', '')), ''),
          trim(p->>'district'), trim(p->>'city'), upper(trim(p->>'state')), p->>'method', now())
  on conflict (user_id) do update set holder_name = excluded.holder_name, doc = excluded.doc, email = excluded.email, zip = excluded.zip, street = excluded.street, number = excluded.number,
    complement = excluded.complement, district = excluded.district, city = excluded.city, state = excluded.state, method = excluded.method, updated_at = now();
  perform public._w_audit(null, 'billing_profile_saved', jsonb_build_object('method', p->>'method'));
end $$;
