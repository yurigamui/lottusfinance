-- Wealth: títulos de renda fixa importados (CDB/LCI/LCA/LCD/LIG/LF/CRI/CRA) passam a ser cadastrados como Renda Fixa,
-- com indexador, taxa e vencimento lidos do nome ("LCI-CDI ITAU 92,00 01/2031" → 92% do CDI, vence em 01/2031), e a curva
-- é acrescida automaticamente (reprecificação diária no banco). Só vale para ativo novo, sem ticker; não altera ativos existentes.
-- O vencimento do nome só traz mês/ano: usa o último dia do mês (editável no ativo).

create or replace function public._w_parse_rf(p_name text)
returns table(kind text, indexer text, rate numeric, maturity date)
language plpgsql immutable set search_path = '' as $$
declare n text := upper(trim(coalesce(p_name, ''))); m text[]; v_rate numeric; v_idx text; v_kind text; v_mat date;
begin
  if n !~ '^(CDB|LCI|LCA|LCD|LIG|LF|LC|CRI|CRA)([^A-Z0-9]|$)' then return; end if;
  m := regexp_match(n, '(?:^|\s)(\d+(?:[.,]\d+)?)\s+(\d{2})/(\d{4})\s*$');
  if m is null then return; end if;
  v_rate := replace(replace(m[1], '.', ''), ',', '.')::numeric / 100;
  if m[1] ~ '^\d+\.\d+$' then v_rate := m[1]::numeric / 100; end if;      -- "5.77" (ponto decimal sem milhar)
  if m[2]::int between 1 and 12 and m[3]::int between 2000 and 2100 then
    v_mat := (make_date(m[3]::int, m[2]::int, 1) + interval '1 month' - interval '1 day')::date;
  end if;
  -- mais de um indexador no nome (ex.: "CDI IPCA", "PRE ... DI") é ambíguo: não classifica, fica como ativo personalizado
  if (case when n ~ '(^|[^A-Z])IPCA([^A-Z]|$)' then 1 else 0 end) + (case when n ~ '(^|[^A-Z])(CDI|DI)([^A-Z]|$)' then 1 else 0 end) + (case when n ~ '(^|[^A-Z])PRE(FIXADO)?([^A-Z]|$)' or n ~ 'PRÉ' then 1 else 0 end) <> 1 then return; end if;
  if n ~ '(^|[^A-Z])IPCA([^A-Z]|$)' then v_idx := 'IPCA'; v_kind := 'rf_ipca';
  elsif n ~ '(^|[^A-Z])(CDI|DI)([^A-Z]|$)' then v_idx := 'CDI'; v_kind := 'rf_pos';
  else v_idx := 'PRE'; v_kind := 'rf_pre'; end if;
  -- faixas plausíveis: CDI = 50% a 300% do CDI; IPCA+ e pré = até 50% a.a. (fora disso o nome está fora do padrão: não classifica)
  if v_rate <= 0 or (v_idx = 'CDI' and (v_rate < 0.5 or v_rate > 3)) or (v_idx <> 'CDI' and v_rate > 0.5) then return; end if;
  kind := v_kind; indexer := v_idx; rate := v_rate; maturity := v_mat; return next;
end $$;
revoke all on function public._w_parse_rf(text) from public, anon, authenticated;
grant execute on function public._w_parse_rf(text) to service_role;

create or replace function public.w_tx_import(p_wallet uuid, p_filename text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_imp uuid; v_asset uuid; v_new int := 0; v_dup int := 0; v_bad int := 0; v_fp text; v_tick text; v_name text; v_k int; v_date date; v_qty numeric; v_pu numeric; v_kind text;
        v_rfk text; v_rfi text; v_rfr numeric; v_rfm date; v_rf uuid[] := '{}'; x uuid;
begin
  perform public._w_need(p_wallet, 'editor', true);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'invalid_file'; end if;
  insert into public.w_imports (wallet_id, kind, filename, rows_total, created_by) values (p_wallet, 'investimentos', left(p_filename, 200), jsonb_array_length(p_rows), auth.uid()) returning id into v_imp;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      v_tick := nullif(upper(trim(coalesce(r->>'ticker', ''))), ''); v_name := nullif(trim(coalesce(r->>'name', '')), '');
      v_date := (r->>'date')::date; v_qty := (r->>'qty')::numeric; v_pu := (r->>'unit_price')::numeric; v_kind := lower(coalesce(r->>'kind', 'compra'));
      if v_kind not in ('compra', 'venda', 'provento') or v_qty <= 0 or v_pu < 0 or v_date > current_date or (v_tick is null and v_name is null) then v_bad := v_bad + 1; continue; end if;
      v_asset := null; v_rfk := null;
      if v_tick is not null then select id into v_asset from public.w_assets where upper(ticker) = v_tick and (wallet_id = p_wallet or wallet_id is null) order by wallet_id nulls last limit 1; end if;
      if v_asset is null and v_name is not null then select id into v_asset from public.w_assets where lower(name) = lower(v_name) and wallet_id = p_wallet limit 1; end if;
      if v_asset is null then
        if v_tick is null then select p.kind, p.indexer, p.rate, p.maturity into v_rfk, v_rfi, v_rfr, v_rfm from public._w_parse_rf(v_name) p; end if;
        if v_rfk is not null then
          insert into public.w_assets (wallet_id, kind, name, ticker, custom, indexer, rate, maturity, pu_inicial)
          values (p_wallet, v_rfk, v_name, null, false, v_rfi, v_rfr, v_rfm, 1) returning id into v_asset;
        else
          insert into public.w_assets (wallet_id, kind, name, ticker, custom)
          values (p_wallet, case when coalesce(r->>'asset_kind', '') in ('acao','fii','etf','fundo','tesouro','rf_pre','rf_pos','rf_ipca','cripto','outro') then r->>'asset_kind' else 'outro' end,
                  coalesce(v_name, v_tick), v_tick, v_tick is null) returning id into v_asset;
        end if;
      end if;
      v_fp := md5(concat_ws('|', v_asset, v_kind, v_date, v_qty, v_pu));
      insert into public.w_invest_tx (wallet_id, asset_id, kind, date, qty, unit_price, custodian, source, fingerprint, import_id, created_by)
      values (p_wallet, v_asset, v_kind, v_date, v_qty, v_pu, nullif(trim(coalesce(r->>'custodian', '')), ''), 'arquivo', v_fp, v_imp, auth.uid()) on conflict do nothing;
      get diagnostics v_k = row_count;
      if v_k = 1 then v_new := v_new + 1; else v_dup := v_dup + 1; end if;
      if v_rfk is not null and not v_asset = any(v_rf) then v_rf := v_rf || v_asset; end if;
    exception when others then v_bad := v_bad + 1;
    end;
  end loop;
  -- renda fixa nova: calcula a curva (P.U. de todo dia útil) a partir da 1ª compra
  foreach x in array v_rf loop perform public._w_rf_reprice(x); end loop;
  update public.w_imports set rows_new = v_new, rows_dup = v_dup where id = v_imp;
  perform public._w_audit(p_wallet, 'import_invest', jsonb_build_object('file', p_filename, 'new', v_new, 'dup', v_dup, 'bad', v_bad, 'renda_fixa', coalesce(array_length(v_rf, 1), 0)));
  return jsonb_build_object('new', v_new, 'duplicates', v_dup, 'invalid', v_bad, 'renda_fixa', coalesce(array_length(v_rf, 1), 0));
end $$;
