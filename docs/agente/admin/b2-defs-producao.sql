-- Definições REAIS lidas em produção (somente leitura) em 25/11/2026. Use nos stubs de teste local.
-- (resumo; corpo completo onde está)

create or replace function public._plan_fee(p_pl numeric) returns numeric
language plpgsql stable security definer set search_path to '' as $f$
declare s public.billing_settings; t jsonb;
begin
  select * into s from public.billing_settings where id = 1;
  if coalesce(p_pl, 0) <= s.free_pl_limit then return 0; end if;
  for t in select x from jsonb_array_elements(s.tiers) x loop
    if t ->> 'up_to' is null or p_pl <= (t ->> 'up_to')::numeric then
      if t ? 'rate_aa' then
        return round(greatest(p_pl * (t ->> 'rate_aa')::numeric / 12, coalesce((t ->> 'min')::numeric, 0)), 2);
      end if;
      return (t ->> 'monthly')::numeric;
    end if;
  end loop;
  return 0;
end $f$;
-- tiers reais: [{"up_to":1000000,"monthly":149},{"up_to":5000000,"monthly":390},{"min":390,"up_to":null,"rate_aa":0.001}] ; free_pl_limit 100000 ; grace_days 15 ; due_day 10
-- NOTA: rate_aa é FRAÇÃO ao ano (0,001 = 0,1% a.a.), não porcentagem.

create or replace function public._platform_fee_run(p_month date default null) returns integer
language plpgsql security definer set search_path to '' as $f$
declare
  v_m date := coalesce(date_trunc('month', p_month)::date, (date_trunc('month', public._today_br()) - interval '1 month')::date);
  v_end date := (v_m + interval '1 month - 1 day')::date;
  f record; v_pl numeric; v_rate numeric; v_min numeric; v_amt numeric; n int := 0;
begin
  for f in select x.id, coalesce(b.origin, 'invite') origin, coalesce(b.exempt, false) exempt
           from public.funders x left join public.funder_billing b on b.funder_id = x.id loop
    if f.exempt then continue; end if;
    v_pl := public._funder_pl(f.id, v_end);            -- PL do fundo na data (função interna; stub: devolver pl_declared ou tabela de teste)
    if f.origin = 'self' then
      v_amt := public._plan_fee(v_pl); v_rate := 0; v_min := 0;       -- tabela global
    else
      select coalesce(p.rate_aa, 0.0010), coalesce(p.min_monthly, 0) into v_rate, v_min
        from (select 1) d left join public.platform_fee_plans p on p.funder_id = f.id and p.active;
      v_amt := round(greatest(v_pl * v_rate / 12, v_min), 2);         -- rate_aa fração/ano; padrão 0,10% a.a.
    end if;
    if v_amt > 0 then
      insert into public.platform_fees (funder_id, ref_month, pl, rate_aa, min_monthly, amount)
      values (f.id, v_m, round(v_pl, 2), v_rate, v_min, v_amt) on conflict (funder_id, ref_month) do nothing;
      n := n + 1;
    end if;
  end loop;
  return n;
end $f$;

-- _staff(p_min): exceções reais: 'forbidden' (não é equipe ativa), 'mfa_required', 'insufficient_level' (nível menor que o exigido).
-- _staff_log(s staff_users, p_action text, p_type text, p_id text, p_company uuid, p_details jsonb default '{}')
-- w_admin_set_plan(p_user, p_plan in ('gratis','pro','fund'), p_payment_ok): update w_profiles set plan, payment_ok; raise not_found; perform _w_replan(p_user) (hoje só um perform de leitura).
-- _w_price(plan): pro 79, fund 199, senão 0 (immutable).
-- bo_inv_generate(p_month): nível 'approver'; para cada platform_fees do mês (amount>0, status<>'paid') insere em bill_invoices com customer_kind='funder', number 'F-YYYY-nnnn' (bill_seq), source/source_ref preenchidos; vencimento = (m + 1 month) + (least(greatest(due_day,1),28) - 1).
-- _bill_reminders_run(): só faturas bill_invoices abertas cujo org_id está em one_orgs com remind_enabled, não pausadas, com customer_email; dias de atraso -3,0,3,7,15 → bill_reminders(kind).
