-- Lottus Wealth v3 (pedido do Yuri em 23/11/2026). NÃO APLICADA: testar no branch antes (D-01). Depende da 20261123125000.
-- 1. Ativos personalizados: tipos Imóvel e Veículo; forma de valorização explícita; edição em lote (ex.: CDBs importados
--    sem taxa); excluir P.U. manual; lista com o que falta para valorizar.
-- 2. P.U. de um ativo numa data (para a nova transação mostrar o P.U. do dia do aporte).
-- 3. Série diária do patrimônio (calendário da página inicial): uma passada com janelas, sem consulta por dia.
-- 4. Cobrança: avisos por e-mail (fatura aberta, lembrete, paga, em atraso), detalhe da fatura, nova tentativa e rotinas agendadas.

-- ============ 1. Ativos personalizados ============
alter table public.w_assets drop constraint if exists w_assets_kind_check;
alter table public.w_assets add constraint w_assets_kind_check check (kind in ('acao', 'fii', 'etf', 'bdr', 'fundo', 'tesouro', 'rf_pre', 'rf_pos', 'rf_ipca', 'cripto', 'imovel', 'veiculo', 'outro'));

-- como o ativo é valorizado e o que falta para valorizar automaticamente
create or replace function public._w_valuation(a public.w_assets)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when a.kind in ('rf_pre', 'rf_pos', 'rf_ipca') and not a.custom then
      case when a.indexer is not null and a.rate is not null and a.issue_date is not null then jsonb_build_object('mode', 'curva', 'missing', '[]'::jsonb)
           else jsonb_build_object('mode', 'manual', 'missing', to_jsonb(array_remove(array[case when a.indexer is null then 'indexador' end, case when a.rate is null then 'taxa' end, case when a.issue_date is null then 'emissão' end], null))) end
    when a.kind in ('rf_pre', 'rf_pos', 'rf_ipca') then
      jsonb_build_object('mode', 'manual', 'missing', to_jsonb(array_remove(array[case when a.indexer is null then 'indexador' end, case when a.rate is null then 'taxa' end, case when a.issue_date is null then 'emissão' end], null)))
    when a.kind in ('acao', 'fii', 'etf', 'bdr', 'cripto') and not a.custom and a.ticker is not null then jsonb_build_object('mode', 'cotacao', 'missing', '[]'::jsonb)
    when a.kind = 'fundo' and not a.custom and a.cnpj_fundo is not null then jsonb_build_object('mode', 'cotacao', 'missing', '[]'::jsonb)
    when a.kind = 'tesouro' and not a.custom then jsonb_build_object('mode', 'cotacao', 'missing', '[]'::jsonb)
    when a.kind in ('acao', 'fii', 'etf', 'bdr', 'cripto') and a.ticker is null then jsonb_build_object('mode', 'manual', 'missing', '["código"]'::jsonb)
    else jsonb_build_object('mode', 'manual', 'missing', '[]'::jsonb) end;
$$;
revoke all on function public._w_valuation(public.w_assets) from public, anon, authenticated;

-- regras do cadastro: renda fixa com indexador, taxa e emissão vale "pela curva"; cripto e bolsa com código, "por cotação"
create or replace function public._w_asset_check(p jsonb) returns void language plpgsql immutable set search_path = '' as $$
declare d1 date; d2 date;
begin
  begin d1 := nullif(p->>'issue_date', '')::date; d2 := nullif(p->>'maturity', '')::date; perform nullif(p->>'rate', '')::numeric, nullif(p->>'pu_inicial', '')::numeric;
  exception when others then raise exception 'invalid_value'; end;
  if char_length(coalesce(p->>'issuer', '')) > 120 or char_length(coalesce(p->>'ticker', '')) > 30 or char_length(coalesce(p->>'name', '')) > 200 then raise exception 'invalid_value'; end if;
  if coalesce(p->>'kind', 'outro') not in ('acao', 'fii', 'etf', 'bdr', 'fundo', 'tesouro', 'rf_pre', 'rf_pos', 'rf_ipca', 'cripto', 'imovel', 'veiculo', 'outro') then raise exception 'invalid_value'; end if;
  if nullif(p->>'indexer', '') is not null and p->>'indexer' not in ('PRE', 'CDI', 'IPCA', 'SELIC') then raise exception 'invalid_value'; end if;
  if nullif(p->>'rate', '') is not null and ((p->>'rate')::numeric < -0.1 or (p->>'rate')::numeric > 5) then raise exception 'invalid_value'; end if;
  if nullif(p->>'issue_date', '') is not null and nullif(p->>'maturity', '') is not null and (p->>'maturity')::date <= (p->>'issue_date')::date then raise exception 'invalid_value'; end if;
  if nullif(p->>'pu_inicial', '') is not null and (p->>'pu_inicial')::numeric <= 0 then raise exception 'invalid_value'; end if;
end $$;
revoke all on function public._w_asset_check(jsonb) from public, anon, authenticated;

create or replace function public.w_asset_save(p_wallet uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_kind text := coalesce(nullif(p->>'kind', ''), 'outro');
begin
  perform public._w_need(p_wallet, 'editor', true);
  if length(trim(coalesce(p->>'name', ''))) < 2 then raise exception 'name_required'; end if;
  perform public._w_asset_check(p);
  if v_id is null then
    insert into public.w_assets (wallet_id, kind, name, ticker, issuer, indexer, rate, issue_date, maturity, pu_inicial, custom)
    values (p_wallet, v_kind, trim(p->>'name'), nullif(upper(trim(coalesce(p->>'ticker', ''))), ''), nullif(trim(coalesce(p->>'issuer', '')), ''), nullif(p->>'indexer', ''),
            nullif(p->>'rate', '')::numeric, nullif(p->>'issue_date', '')::date, nullif(p->>'maturity', '')::date,
            coalesce(nullif(p->>'pu_inicial', '')::numeric, 1000), coalesce((p->>'custom')::boolean, v_kind in ('imovel', 'veiculo', 'outro')))
    returning id into v_id;
  else
    update public.w_assets set kind = v_kind, name = trim(p->>'name'), ticker = nullif(upper(trim(coalesce(p->>'ticker', ''))), ''), issuer = nullif(trim(coalesce(p->>'issuer', '')), ''),
           indexer = nullif(p->>'indexer', ''), rate = nullif(p->>'rate', '')::numeric, issue_date = nullif(p->>'issue_date', '')::date, maturity = nullif(p->>'maturity', '')::date,
           pu_inicial = coalesce(nullif(p->>'pu_inicial', '')::numeric, pu_inicial), custom = coalesce((p->>'custom')::boolean, custom)
     where id = v_id and wallet_id = p_wallet;
    if not found then raise exception 'not_found'; end if;
  end if;
  perform public._w_audit(p_wallet, 'asset_saved', jsonb_build_object('asset', v_id, 'name', p->>'name'));
  return jsonb_build_object('id', v_id);
end $$;

-- edição em lote: só os campos enviados; "emissão = 1ª compra" e "P.U. inicial = preço da 1ª compra" por ativo
create or replace function public.w_assets_bulk_update(p_wallet uuid, p_ids uuid[], p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform public._w_need(p_wallet, 'editor', true);
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 1000 then raise exception 'invalid_value'; end if;
  perform public._w_asset_check(p);
  if (select count(*) from public.w_assets where id = any(p_ids) and wallet_id = p_wallet) <> cardinality(p_ids) then raise exception 'not_found'; end if;
  -- remuneração, emissão e P.U. inicial só mudam em renda fixa (tipo final); imóvel, veículo e "outro" continuam manuais
  update public.w_assets a set
    kind = coalesce(nullif(p->>'kind', ''), a.kind),
    indexer = case when p ? 'indexer' and coalesce(nullif(p->>'kind', ''), a.kind) in ('rf_pre', 'rf_pos', 'rf_ipca') then nullif(p->>'indexer', '') else a.indexer end,
    rate = case when p ? 'rate' and coalesce(nullif(p->>'kind', ''), a.kind) in ('rf_pre', 'rf_pos', 'rf_ipca') then nullif(p->>'rate', '')::numeric else a.rate end,
    issuer = case when p ? 'issuer' then nullif(trim(p->>'issuer'), '') else a.issuer end,
    maturity = case when p ? 'maturity' then nullif(p->>'maturity', '')::date else a.maturity end,
    issue_date = case when coalesce(nullif(p->>'kind', ''), a.kind) not in ('rf_pre', 'rf_pos', 'rf_ipca') then a.issue_date
                      when coalesce((p->>'issue_from_first_tx')::boolean, false) and a.issue_date is null then coalesce((select min(t.date) from public.w_invest_tx t where t.asset_id = a.id and t.wallet_id = p_wallet and t.kind = 'compra'), a.issue_date)
                      when p ? 'issue_date' then nullif(p->>'issue_date', '')::date else a.issue_date end,
    pu_inicial = case when coalesce(nullif(p->>'kind', ''), a.kind) not in ('rf_pre', 'rf_pos', 'rf_ipca') then a.pu_inicial
                      when coalesce((p->>'pu_from_first_tx')::boolean, false) and a.issue_date is null then coalesce((select t.unit_price from public.w_invest_tx t where t.asset_id = a.id and t.wallet_id = p_wallet and t.kind = 'compra' order by t.date, t.created_at limit 1), a.pu_inicial)
                      else a.pu_inicial end,
    custom = case when coalesce(nullif(p->>'kind', ''), a.kind) in ('imovel', 'veiculo', 'outro') then true else coalesce((p->>'custom')::boolean, a.custom) end
   where a.id = any(p_ids) and a.wallet_id = p_wallet;
  get diagnostics n = row_count;
  if exists (select 1 from public.w_assets where id = any(p_ids) and maturity is not null and issue_date is not null and maturity <= issue_date) then raise exception 'maturity_before_issue'; end if;
  perform public._w_audit(p_wallet, 'assets_bulk', jsonb_build_object('n', n, 'fields', (select jsonb_agg(k) from jsonb_object_keys(p) k)));
  return jsonb_build_object('updated', n);
end $$;
revoke all on function public.w_assets_bulk_update(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.w_assets_bulk_update(uuid, uuid[], jsonb) to authenticated;

create or replace function public.w_assets_custom(p_wallet uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._w_need(p_wallet, 'visualizador');
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'kind', a.kind, 'ticker', a.ticker, 'issuer', a.issuer, 'indexer', a.indexer, 'rate', a.rate,
      'issue_date', a.issue_date, 'maturity', a.maturity, 'pu_inicial', a.pu_inicial, 'custom', a.custom, 'last_pu', lp.pu, 'last_date', lp.date,
      'valuation', public._w_valuation(a), 'qty', ps.qty, 'value', ps.qty * ps.pu,
      'first_buy', (select min(t.date) from public.w_invest_tx t where t.asset_id = a.id and t.wallet_id = p_wallet and t.kind = 'compra')) order by a.name)
    from public.w_assets a
    left join lateral (select pu, date from public.w_asset_prices where asset_id = a.id order by date desc limit 1) lp on true
    left join lateral (select p.qty, p.pu from public._w_pos(p_wallet, current_date) p where p.asset_id = a.id) ps on true
   where a.wallet_id = p_wallet), '[]'::jsonb);
end $$;

create or replace function public.w_asset_detail(p_wallet uuid, p_asset uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.w_assets;
begin
  perform public._w_need(p_wallet, 'visualizador');
  select * into a from public.w_assets where id = p_asset and (wallet_id = p_wallet or wallet_id is null);
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('asset', to_jsonb(a), 'valuation', public._w_valuation(a), 'own', a.wallet_id is not null,
    'position', (select to_jsonb(p) from public._w_pos(p_wallet, current_date) p where p.asset_id = p_asset),
    'prices', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'pu', pu, 'pu_mercado', pu_mercado, 'source', source) order by date)
                          from (select * from public.w_asset_prices where asset_id = p_asset and date >= current_date - 400 order by date desc limit 400) x), '[]'::jsonb),
    'tx', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'date', date, 'qty', qty, 'unit_price', unit_price, 'custodian', custodian, 'source', source) order by date desc)
                      from public.w_invest_tx where wallet_id = p_wallet and asset_id = p_asset), '[]'::jsonb));
end $$;

-- excluir um P.U. informado à mão (só de ativo da própria carteira)
create or replace function public.w_asset_price_delete(p_wallet uuid, p_asset uuid, p_date date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._w_need(p_wallet, 'editor', true);
  if not exists (select 1 from public.w_assets where id = p_asset and wallet_id = p_wallet) then raise exception 'not_found'; end if;
  delete from public.w_asset_prices where asset_id = p_asset and date = p_date and source = 'manual';
  if not found then raise exception 'not_found'; end if;
  perform public._w_audit(p_wallet, 'price_deleted', jsonb_build_object('asset', p_asset, 'date', p_date));
end $$;
revoke all on function public.w_asset_price_delete(uuid, uuid, date) from public, anon;
grant execute on function public.w_asset_price_delete(uuid, uuid, date) to authenticated;

-- ============ 2. P.U. numa data ============
-- último P.U. até a data (até 10 dias antes, para cobrir fins de semana, feriados e atraso da fonte)
-- p_fetch = true: a função de borda vai buscar na fonte; exige editor (quem lança transação)
create or replace function public.w_pu_at(p_wallet uuid, p_asset uuid, p_date date, p_fetch boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.w_assets; r record;
begin
  perform public._w_need(p_wallet, case when p_fetch then 'editor' else 'visualizador' end, p_fetch);
  select * into a from public.w_assets where id = p_asset and (wallet_id = p_wallet or wallet_id is null);
  if not found then raise exception 'not_found'; end if;
  if p_date is null or p_date > current_date then raise exception 'invalid_value'; end if;
  select date, pu, source into r from public.w_asset_prices where asset_id = p_asset and date <= p_date and date >= p_date - 10 order by date desc limit 1;
  return jsonb_build_object('asset', p_asset, 'date_requested', p_date, 'valuation', public._w_valuation(a)->>'mode',
    'found', r.date is not null, 'date', r.date, 'pu', r.pu, 'source', r.source, 'exact', r.date = p_date);
end $$;
revoke all on function public.w_pu_at(uuid, uuid, date, boolean) from public, anon;
grant execute on function public.w_pu_at(uuid, uuid, date, boolean) to authenticated;

-- ============ 3. Série diária ============
-- Patrimônio dia a dia entre duas datas (passo: dia até 400 dias, semana até 1.500, mês acima).
-- Uma passada: posições e saldos acumulados por janela e P.U. "carregado" do último dia com preço (igual a _w_pos).
create or replace function public.w_equity_range(p_wallet uuid, p_from date, p_to date, p_mode text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
      select asset_id, date, 0 o, null::timestamptz ts, pu pa, null::numeric pt, 0::numeric dq from prices
      union all select asset_id, date, 1, created_at, null, case when kind in ('compra', 'venda') then unit_price end, case kind when 'compra' then qty when 'venda' then -qty else 0 end from tx
      union all select a.asset_id, x.d, 2, null, null, null, 0 from assets a cross join days x),
    c1 as (select e.*, sum(e.dq) over w q, count(e.pa) over w ca, count(e.pt) over w ct from ev e window w as (partition by e.asset_id order by e.date, e.o, e.ts rows unbounded preceding)),
    c2 as (select c.date, c.o, c.q, max(c.pa) over (partition by c.asset_id, c.ca) pa, max(c.pt) over (partition by c.asset_id, c.ct) pt from c1 c),
    inv as (select c.date d, sum(c.q * coalesce(c.pa, c.pt, 0)) v from c2 c where c.o = 2 and c.q <> 0 group by c.date),
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
end $$;
revoke all on function public.w_equity_range(uuid, date, date, text) from public, anon;
grant execute on function public.w_equity_range(uuid, date, date, text) to authenticated;

-- ============ 4. Cobrança ============
alter table public.w_invoices add column if not exists notified jsonb not null default '{}'::jsonb;
-- faturas que já existiam ao aplicar a migração não recebem avisos retroativos
update public.w_invoices set notified = jsonb_build_object('opened', 'legado', 'reminder', 'legado', 'overdue', 'legado', 'paid', 'legado') where notified = '{}'::jsonb;

-- detalhe de uma fatura do próprio usuário
create or replace function public.w_invoice_get(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare i public.w_invoices;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  select * into i from public.w_invoices where id = p_id and user_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
  return to_jsonb(i) - 'user_id' - 'provider_charge_id' - 'notified'
    || jsonb_build_object('plan_price', (select public._w_price(p.plan) from public.w_profiles p where p.user_id = auth.uid()),
                          'billing', (select to_jsonb(b) - 'user_id' - 'provider_customer_id' from public.w_billing_profiles b where b.user_id = auth.uid()),
                          'can_retry', i.status = 'aberta' and i.payment_error is not null and coalesce((i.notified->>'retries')::int, 0) < 3,
                          'retries', coalesce((i.notified->>'retries')::int, 0));
end $$;
revoke all on function public.w_invoice_get(uuid) from public, anon;
grant execute on function public.w_invoice_get(uuid) to authenticated;

-- pagamento recusado: liberar para a rotina de cobrança tentar de novo (máximo 3 tentativas por fatura)
create or replace function public.w_invoice_retry(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.w_invoices; n int;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  select * into i from public.w_invoices where id = p_id and user_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
  if i.status <> 'aberta' or i.payment_error is null then raise exception 'invalid_value'; end if;
  n := coalesce((i.notified->>'retries')::int, 0);
  if n >= 3 then raise exception 'too_many_attempts'; end if;
  update public.w_invoices set provider_charge_id = null, payment_error = null, charged_at = null, notified = notified || jsonb_build_object('retries', n + 1) where id = p_id;
  perform public._w_audit(null, 'invoice_retry', jsonb_build_object('invoice', p_id, 'try', n + 1));
end $$;
revoke all on function public.w_invoice_retry(uuid) from public, anon;
grant execute on function public.w_invoice_retry(uuid) to authenticated;

-- avisos por e-mail; cada aviso uma vez por fatura (marcado em notified)
create or replace function public.w_billing_notices()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_kind text; v_subject text; v_paras text[]; v_from text; v_link text := 'https://wealth.lottusfinance.com.br/#/conta?aba=plano'; out jsonb := '{}'::jsonb; v_val text;
begin
  begin select signature_email_from into v_from from public.app_settings where id = 1; exception when others then v_from := null; end;
  for r in
    select i.*, b.email, b.holder_name, b.method as pay_method from public.w_invoices i join public.w_billing_profiles b on b.user_id = i.user_id
     where i.amount > 0 and (
       (i.status = 'aberta' and i.due_date >= current_date and not i.notified ? 'opened') or
       (i.status = 'aberta' and i.due_date - current_date between 0 and 3 and not i.notified ? 'reminder' and i.notified ? 'opened') or
       (i.status = 'aberta' and i.due_date < current_date and not i.notified ? 'overdue') or
       (i.status = 'paga' and not i.notified ? 'paid'))
  loop
    v_val := 'R$ ' || replace(replace(replace(to_char(r.amount, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.');
    v_kind := case when r.status = 'paga' then 'paid' when r.due_date < current_date then 'overdue' when not r.notified ? 'opened' then 'opened' else 'reminder' end;
    v_subject := case v_kind when 'opened' then 'Sua fatura do Lottus Wealth está disponível' when 'reminder' then 'Sua fatura do Lottus Wealth vence em breve'
                             when 'overdue' then 'Fatura do Lottus Wealth em atraso' else 'Recebemos o pagamento da sua fatura' end;
    v_paras := case v_kind
      when 'opened' then array['Olá, ' || public._html_escape(split_part(r.holder_name, ' ', 1)) || '.', 'A fatura de ' || to_char(r.ref_month, 'MM/YYYY') || ' fechou em <b>' || v_val || '</b>, com vencimento em ' || to_char(r.due_date, 'DD/MM/YYYY') || '.',
                           case r.pay_method when 'cartao' then 'Ela será cobrada no cartão cadastrado no vencimento.' when 'pix' then 'Ela será debitada pelo Pix Automático no vencimento.' else 'O boleto está disponível na sua conta.' end]
      when 'reminder' then array['A fatura de ' || to_char(r.ref_month, 'MM/YYYY') || ' (' || v_val || ') vence em ' || to_char(r.due_date, 'DD/MM/YYYY') || '.', 'Se já pagou, desconsidere este aviso.']
      when 'overdue' then array['A fatura de ' || to_char(r.ref_month, 'MM/YYYY') || ' (' || v_val || ') venceu em ' || to_char(r.due_date, 'DD/MM/YYYY') || ' e ainda não consta como paga.', 'Depois de 10 dias de atraso, as carteiras ficam somente para visualização até o pagamento.']
      else array['Recebemos ' || v_val || ' referentes à fatura de ' || to_char(r.ref_month, 'MM/YYYY') || '. Obrigado.', 'O recibo fica disponível na sua conta.'] end;
    begin
      perform public._send_email(r.email, v_subject, public._email_html(v_subject, v_paras, 'Ver fatura', v_link), v_subject || ': ' || v_link, 'wealth_fatura_' || v_kind,
        jsonb_build_object('invoice', r.id::text, 'transactional', true), v_from);
      -- cada aviso marca também os anteriores: nunca chega um "fatura aberta" depois do "em atraso", nem repete
      update public.w_invoices set notified = notified || jsonb_build_object(v_kind, now())
        || case when v_kind = 'opened' and r.due_date - current_date <= 3 then jsonb_build_object('reminder', now()) else '{}'::jsonb end
        || case when v_kind in ('reminder', 'overdue', 'paid') and not notified ? 'opened' then jsonb_build_object('opened', now()) else '{}'::jsonb end
        || case when v_kind in ('overdue', 'paid') and not notified ? 'reminder' then jsonb_build_object('reminder', now()) else '{}'::jsonb end
        || case when v_kind = 'paid' and not notified ? 'overdue' then jsonb_build_object('overdue', now()) else '{}'::jsonb end where id = r.id;
      out := out || jsonb_build_object(v_kind, coalesce((out->>v_kind)::int, 0) + 1);
    exception when others then out := out || jsonb_build_object('erros', coalesce((out->>'erros')::int, 0) + 1);
    end;
  end loop;
  return out;
end $$;
revoke all on function public.w_billing_notices() from public, anon, authenticated;
grant execute on function public.w_billing_notices() to service_role;

-- rotinas agendadas (só onde o pg_cron existe; em produção já rodam w_billing_close, w_overdue_check e wealth-pu)
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('wealth-billing-notices', '20 12 * * *', 'select public.w_billing_notices()');
    perform cron.schedule('wealth-billing-charge', '40 12 * * *',
      $c$select net.http_post(url := 'https://rowhslnnlzfbhmzbylbz.supabase.co/functions/v1/wealth-billing', headers := jsonb_build_object('x-cron-secret', (select value from public.w_system where key = 'cron_secret'), 'content-type', 'application/json'), body := '{}'::jsonb)$c$);
  end if;
end $$;

-- ============ 5. Cobertura de preços (para o robô buscar só o que falta) ============
-- para o robô: primeiro e último preço, a 1ª transação, os meses que já têm preço (para achar buracos no histórico)
-- e o P.U. guardado no 1º dia (para saber se a curva mudou depois de editar taxa ou emissão)
create or replace function public.w_price_coverage(p_ids uuid[])
returns table(asset_id uuid, first_price date, last_price date, first_tx date, first_pu numeric, months text[])
language sql stable security definer set search_path = '' as $$
  select a.id, f.date, (select max(p.date) from public.w_asset_prices p where p.asset_id = a.id),
         (select min(t.date) from public.w_invest_tx t where t.asset_id = a.id), f.pu,
         (select array_agg(distinct to_char(p.date, 'YYYY-MM')) from public.w_asset_prices p where p.asset_id = a.id)
    from unnest(p_ids) a(id) left join lateral (select p.date, p.pu from public.w_asset_prices p where p.asset_id = a.id order by p.date limit 1) f on true;
$$;
revoke all on function public.w_price_coverage(uuid[]) from public, anon, authenticated;
grant execute on function public.w_price_coverage(uuid[]) to service_role;

-- ============ 6. Busca sem acento (ciclo 2 da verificação) ============
-- sem "set search_path" de propósito: assim o Postgres embute a função na consulta (só usa lower/translate do pg_catalog)
create or replace function public._w_norm(s text) returns text language sql immutable parallel safe as $$
  select lower(translate(coalesce(s, ''), 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'));
$$;
revoke all on function public._w_norm(text) from public, anon;
grant execute on function public._w_norm(text) to authenticated, service_role;

create or replace function public.w_asset_search(p_wallet uuid, p_q text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare q text := replace(replace(replace(public._w_norm(trim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_'); ids uuid[];
begin
  perform public._w_need(p_wallet, 'visualizador');
  if char_length(q) < 2 then return '[]'::jsonb; end if;
  -- 1) ativos da própria carteira (sempre poucos) entram todos; 2) código exato; 3) catálogo, limitado antes de ordenar:
  --    com 2 letras só pelo início do código (índice btree do ticker; o de trigramas precisa de 3+ letras), com 3+ pelo nome sem acento.
  --    Consultas separadas por tamanho do termo para o planejador usar o índice certo.
  ids := array(select id from public.w_assets where wallet_id = p_wallet and (public._w_norm(name) like '%' || q || '%' or lower(ticker) like q || '%') limit 30)
      || array(select id from public.w_assets where wallet_id is null and upper(ticker) = upper(q) limit 5);
  if char_length(q) < 3 then
    ids := ids || array(select id from public.w_assets where wallet_id is null and upper(ticker) >= upper(q) and upper(ticker) < upper(q) || 'ZZZZZZZZZZ' limit 300);
  else
    ids := ids || array(select id from public.w_assets where wallet_id is null and (public._w_norm(name) like '%' || q || '%' or lower(ticker) like q || '%') limit 300);
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'ticker', ticker, 'kind', kind, 'custom', custom,
      'last_pu', (select pu from public.w_asset_prices p where p.asset_id = s.id order by date desc limit 1),
      'last_date', (select date from public.w_asset_prices p where p.asset_id = s.id order by date desc limit 1)))
    from (select * from public.w_assets where id = any(ids)
          order by (lower(ticker) = q) desc, (wallet_id is not null) desc, (lower(ticker) like q || '%') desc, ticker nulls last, name limit 30) s), '[]'::jsonb);
end $$;

create or replace function public.w_custodian_search(p_q text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare q text := replace(replace(replace(public._w_norm(trim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if char_length(q) < 2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('name', name, 'kind', kind)) from (
    select name, kind from public.w_custodians where public._w_norm(name) like '%' || q || '%'
     order by (public._w_norm(name) like q || '%') desc, name limit 30) s), '[]'::jsonb);
end $$;

create or replace function public.w_bank_catalog_search(p_q text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare q text := replace(replace(replace(public._w_norm(trim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if char_length(q) < 2 and q !~ '^\d+$' then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('code', code, 'name', name)) from (
    select code, name from public.w_banks
     where public._w_norm(name) like '%' || q || '%' or public._w_norm(full_name) like '%' || q || '%' or code like q || '%'
     order by (code = q) desc, name limit 30) s), '[]'::jsonb);
end $$;

-- ============ 7. Histórico de preços: meses já tentados (ciclo 3 da verificação) ============
-- Um mês que a fonte não tem (arquivo ausente, ativo sem negócio) não pode travar o preenchimento dos demais:
-- o robô anota a tentativa e só tenta de novo depois de 30 dias.
create table if not exists public.w_price_backfill (asset_id uuid not null references public.w_assets(id) on delete cascade, month text not null check (month ~ '^\d{4}-\d{2}$'),
  tried_at timestamptz not null default now(), found boolean not null default false, primary key (asset_id, month));
alter table public.w_price_backfill enable row level security;
revoke all on table public.w_price_backfill from anon, authenticated;
grant select, insert, update, delete on table public.w_price_backfill to service_role;

create or replace function public.w_price_coverage(p_ids uuid[])
returns table(asset_id uuid, first_price date, last_price date, first_tx date, first_pu numeric, months text[])
language sql stable security definer set search_path = '' as $$
  -- meses com preço + meses tentados nos últimos 30 dias (sem dados na fonte): os dois contam como "não falta"
  select a.id, f.date, (select max(p.date) from public.w_asset_prices p where p.asset_id = a.id),
         (select min(t.date) from public.w_invest_tx t where t.asset_id = a.id), f.pu,
         (select array_agg(distinct m) from (select to_char(p.date, 'YYYY-MM') m from public.w_asset_prices p where p.asset_id = a.id
                                             union all select b.month from public.w_price_backfill b where b.asset_id = a.id and (b.found or b.tried_at > now() - interval '30 days')) x)
    from unnest(p_ids) a(id) left join lateral (select p.date, p.pu from public.w_asset_prices p where p.asset_id = a.id order by p.date limit 1) f on true;
$$;

-- ============ 8. Índice da busca sem acento (resolve W-038; pg_trgm vem com o Supabase, não estava ligado) ============
create extension if not exists pg_trgm with schema extensions;
create index if not exists w_assets_name_norm_trgm on public.w_assets using gin (public._w_norm(name) extensions.gin_trgm_ops);
create index if not exists w_custodians_name_norm_trgm on public.w_custodians using gin (public._w_norm(name) extensions.gin_trgm_ops);
