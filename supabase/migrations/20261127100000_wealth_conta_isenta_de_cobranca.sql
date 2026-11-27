-- Wealth: conta isenta de cobrança (cortesia do titular do produto). O fechamento mensal não gera fatura para contas isentas;
-- o plano continua valendo (limites e recursos do Pro/Fund). A marcação é feita pelo administrador, direto no banco.
alter table public.w_profiles add column if not exists billing_exempt boolean not null default false;

create or replace function public.w_billing_close(p_ref date default null::date)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_ref date := coalesce(date_trunc('month', p_ref)::date, (date_trunc('month', current_date) - interval '1 month')::date); v_end date := (v_ref + interval '1 month - 1 day')::date;
        u record; v_aum numeric; v_n int := 0; v_detail jsonb;
begin
  for u in select o.owner_id, p.plan, count(*) n from public.w_wallets o join public.w_profiles p on p.user_id = o.owner_id
            where o.archived_at is null and o.created_at::date <= v_end and p.plan in ('pro', 'fund') and not p.billing_exempt
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
