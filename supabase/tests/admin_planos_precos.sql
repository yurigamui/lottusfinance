-- Teste da migração 20261125120000_admin_planos_precos_cobranca.sql (Postgres local, dados fictícios de exemplo)
create temp table t_res (n serial, name text, ok boolean);
create function pg_temp.chk(p_name text, p_ok boolean) returns void language plpgsql as $$
begin insert into t_res (name, ok) values (p_name, coalesce(p_ok, false)); end $$;
-- executa um comando e devolve a mensagem de erro (ou null se não falhou); como_role opcional
create function pg_temp.err(p_sql text, p_role text default null) returns text language plpgsql as $$
declare m text;
begin
  begin
    if p_role is not null then execute 'set local role ' || p_role; end if;
    execute p_sql;
    m := null;
  exception when others then m := sqlerrm;
  end;
  reset role;
  return m;
end $$;
create temp table t_last (msg text);
create function pg_temp.run(p_sql text, p_role text default null) returns void language plpgsql as $$
begin delete from t_last; insert into t_last values (pg_temp.err(p_sql, p_role)); end $$;
create function pg_temp.act(p_level text) returns void language plpgsql as $$
declare u uuid;
begin
  if p_level is null then perform set_config('test.staff', '', false); return; end if;
  select user_id into u from public.staff_users where name = 'Teste ' || p_level;
  if u is null then insert into public.staff_users (name, level) values ('Teste ' || p_level, p_level) returning user_id into u; end if;
  perform set_config('test.staff', u::text, false);
end $$;

-- ---- massa de exemplo ----
insert into public.funders (id, legal_name, trade_name, cnpj, email) values
  ('f0000000-0000-0000-0000-000000000001', 'Fundo Exemplo A', 'Exemplo A', '00000000000191', 'a@exemplo.test'),
  ('f0000000-0000-0000-0000-000000000002', 'Fundo Exemplo B', 'Exemplo B', '00000000000272', 'b@exemplo.test'),
  ('f0000000-0000-0000-0000-000000000003', 'Fundo Exemplo C', 'Exemplo C', '00000000000353', 'c@exemplo.test');
insert into public.funder_billing (funder_id, origin, exempt, pl_declared) values
  ('f0000000-0000-0000-0000-000000000001', 'invite', false, 60000000),   -- contrato padrão 0,0010 a.a.: 60e6*0,001/12 = 5000,00
  ('f0000000-0000-0000-0000-000000000002', 'self', false, 30000000),      -- tabela global, faixa com rate_aa 0,001 e mín. 390: 30e6*0,001/12 = 2500,00
  ('f0000000-0000-0000-0000-000000000003', 'self', true, 80000000);    -- isento: não gera
insert into public.sign_accounts (id, name, doc, plan, created_at) values
  ('50000000-0000-0000-0000-000000000001', 'Conta Sign Essencial', '11111111111', 'essencial', '2026-01-10'),
  ('50000000-0000-0000-0000-000000000002', 'Conta Sign Profissional', '22222222222', 'profissional', '2026-01-10'),
  ('50000000-0000-0000-0000-000000000003', 'Conta Sign Grátis', '33333333333', 'free', '2026-01-10'),
  ('50000000-0000-0000-0000-000000000004', 'Conta Sign Isenta', '44444444444', 'empresa', '2026-01-10'),
  ('50000000-0000-0000-0000-000000000005', 'Conta Sign Nova', '55555555555', 'essencial', '2099-01-10');
update public.sign_accounts set exempt = true where id = '50000000-0000-0000-0000-000000000004';
insert into public.w_profiles (user_id, name, plan) values
  ('a0000000-0000-0000-0000-000000000001', 'Pessoa Exemplo 1', 'pro'),
  ('a0000000-0000-0000-0000-000000000002', 'Pessoa Exemplo 2', 'gratis');

-- ---- regressão do _platform_fee_run SEM override (valores calculados à mão) ----
do $$ declare n int; begin
  n := public._platform_fee_run('2026-10-15');
  perform pg_temp.chk('R1 _platform_fee_run gera 2 fundos (isento fora)', n = 2);
  perform pg_temp.chk('R2 fundo A (contrato padrão) = 5000,00', (select amount from public.platform_fees where funder_id = 'f0000000-0000-0000-0000-000000000001' and ref_month = '2026-10-01') = 5000.00);
  perform pg_temp.chk('R3 fundo B (tabela global) = 2500,00', (select amount from public.platform_fees where funder_id = 'f0000000-0000-0000-0000-000000000002' and ref_month = '2026-10-01') = 2500.00);
  perform pg_temp.chk('R4 taxa gravada = padrão 0,0010', (select rate_aa from public.platform_fees where funder_id = 'f0000000-0000-0000-0000-000000000001') = 0.0010);
  perform pg_temp.chk('R5 rodar de novo não duplica (on conflict do nothing)', public._platform_fee_run('2026-10-01') = 2 and (select count(*) from public.platform_fees) = 2);
  perform pg_temp.chk('R7 _partners_fee_calc (exibição) = valor da rotina', (public._partners_fee_calc('f0000000-0000-0000-0000-000000000001', '2026-10-31')->>'amount')::numeric = 5000.00
    and (public._partners_fee_calc('f0000000-0000-0000-0000-000000000002', '2026-10-31')->>'amount')::numeric = 2500.00);
  perform pg_temp.chk('R6 isento não gera', not exists (select 1 from public.platform_fees where funder_id = 'f0000000-0000-0000-0000-000000000003'));
end $$;

-- ---- papéis: anon, analista, aprovador, administrador ----
do $$ declare r text; id1 uuid; sg uuid := '50000000-0000-0000-0000-000000000001'; begin
  perform pg_temp.act(null);
  perform pg_temp.chk('P1 sem equipe: bo_plan_catalog recusado', pg_temp.err('select public.bo_plan_catalog()', 'authenticated') = 'forbidden');
  perform pg_temp.chk('P1b quem não é da equipe continua forbidden também no set', pg_temp.err($q$select public.bo_price_override_set('{"product":"sign","subject":"50000000-0000-0000-0000-000000000001","kind":"fixed","value":30,"reason":"motivo válido"}')$q$, 'authenticated') = 'forbidden');
  perform pg_temp.chk('P2 anon sem permissão de execução', pg_temp.err('select public.bo_plan_catalog()', 'anon') ilike 'permission denied%');
  perform pg_temp.chk('P3 anon não lê a tabela', pg_temp.err('select * from public.price_overrides', 'anon') ilike 'permission denied%');
  perform pg_temp.chk('P4 authenticated não lê a tabela (só RPC)', pg_temp.err('select * from public.price_overrides', 'authenticated') ilike 'permission denied%');

  perform pg_temp.act('analyst');
  perform pg_temp.chk('P5 analista lê o catálogo', pg_temp.err('select public.bo_plan_catalog()', 'authenticated') is null);
  perform pg_temp.chk('P6 analista não grava override', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"sign","subject":"%s","kind":"discount_pct","value":5,"reason":"cortesia comercial"}')$q$, sg), 'authenticated') = 'insufficient_level');
  perform pg_temp.chk('P7 analista não troca plano', pg_temp.err(format($q$select public.bo_set_plan('{"product":"sign","subject":"%s","plan":"empresa"}')$q$, sg), 'authenticated') = 'insufficient_level');

  perform pg_temp.act('approver');
  perform pg_temp.chk('P8 aprovador não troca plano (admin)', pg_temp.err(format($q$select public.bo_set_plan('{"product":"sign","subject":"%s","plan":"empresa"}')$q$, sg), 'authenticated') = 'insufficient_level');
  r := pg_temp.err(format($q$select public.bo_price_override_set('{"product":"sign","subject":"%s","kind":"discount_pct","value":20,"reason":"cortesia comercial"}')$q$, sg), 'authenticated');
  perform pg_temp.chk('P9 aprovador grava 20% (limite inclusive)', r is null);
  perform pg_temp.chk('P10 aprovador barrado acima de 20%', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"sign","subject":"%s","kind":"discount_pct","value":20.5,"reason":"cortesia comercial"}')$q$, sg), 'authenticated') = 'discount_needs_admin');
  perform pg_temp.chk('P11 valor fixo com redução > 20% (39 -> 25) barrado ao aprovador', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"sign","subject":"%s","kind":"fixed","value":25,"reason":"cortesia comercial"}')$q$, sg), 'authenticated') = 'discount_needs_admin');
  perform pg_temp.chk('P12 valor fixo com redução <= 20% (39 -> 31,20) liberado', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"sign","subject":"%s","kind":"fixed","value":31.2,"reason":"cortesia comercial"}')$q$, sg), 'authenticated') is null);

  perform pg_temp.act('admin');
  perform pg_temp.chk('P13 admin grava acima de 20%', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"sign","subject":"%s","kind":"discount_pct","value":50,"reason":"acordo comercial"}')$q$, sg), 'authenticated') is null);
  perform pg_temp.chk('P14 log da equipe gravou as alterações', (select count(*) from public.staff_actions where action = 'price_override_set') >= 3);
end $$;

-- ---- validações do set ----
do $$ declare sg uuid := '50000000-0000-0000-0000-000000000002'; q text; begin
  perform pg_temp.act('admin');
  perform pg_temp.chk('V1 motivo curto rejeitado', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"sign","subject":"%s","kind":"discount_pct","value":5,"reason":" abc "}')$q$, sg), 'authenticated') = 'reason_required');
  perform pg_temp.chk('V2 sem motivo rejeitado', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"sign","subject":"%s","kind":"discount_pct","value":5}')$q$, sg), 'authenticated') = 'reason_required');
  perform pg_temp.chk('V3 desconto > 100 rejeitado', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"sign","subject":"%s","kind":"discount_pct","value":101,"reason":"motivo válido"}')$q$, sg), 'authenticated') = 'invalid_value');
  perform pg_temp.chk('V4 valor negativo rejeitado', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"sign","subject":"%s","kind":"fixed","value":-1,"reason":"motivo válido"}')$q$, sg), 'authenticated') = 'invalid_value');
  perform pg_temp.chk('V5 fee_rate só para partners', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"sign","subject":"%s","kind":"fee_rate","value":1,"reason":"motivo válido"}')$q$, sg), 'authenticated') = 'invalid_kind');
  perform pg_temp.chk('V6 produto inválido', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"invest","subject":"%s","kind":"fixed","value":1,"reason":"motivo válido"}')$q$, sg), 'authenticated') = 'invalid_product');
  perform pg_temp.chk('V7 sujeito inexistente', pg_temp.err($q$select public.bo_price_override_set('{"product":"sign","subject":"99999999-0000-0000-0000-000000000000","kind":"fixed","value":1,"reason":"motivo válido"}')$q$, 'authenticated') = 'subject_not_found');
  perform pg_temp.chk('V8 validade invertida', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"sign","subject":"%s","kind":"fixed","value":90,"valid_from":"2099-02-01","valid_until":"2099-01-01","reason":"motivo válido"}')$q$, sg), 'authenticated') = 'invalid_period');
  perform pg_temp.chk('V9 validade já vencida', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"sign","subject":"%s","kind":"fixed","value":90,"valid_until":"2020-01-01","valid_from":"2019-01-01","reason":"motivo válido"}')$q$, sg), 'authenticated') = 'invalid_period');
  perform pg_temp.chk('V10 nada gravado pelas recusas', (select count(*) from public.price_overrides where subject_id = sg) = 0);
  perform pg_temp.chk('V11 CHECK do banco: motivo curto direto', pg_temp.err(format($q$insert into public.price_overrides (product, subject_kind, subject_id, kind, value, reason) values ('sign','sign_account','%s','fixed',1,'abc')$q$, sg)) ilike '%price_overrides_reason_check%');
  perform pg_temp.chk('V12 CHECK do banco: fee_rate em sign', pg_temp.err(format($q$insert into public.price_overrides (product, subject_kind, subject_id, kind, value, reason) values ('sign','sign_account','%s','fee_rate',1,'motivo válido')$q$, sg)) ilike '%price_overrides_rate_partners%');
  perform pg_temp.chk('V13 CHECK do banco: desconto > 100', pg_temp.err(format($q$insert into public.price_overrides (product, subject_kind, subject_id, kind, value, reason) values ('sign','sign_account','%s','discount_pct',101,'motivo válido')$q$, sg)) ilike '%price_overrides_pct_max%');
end $$;

-- ---- idempotência, substituição, revogação, um ativo por sujeito ----
do $$ declare sg uuid := '50000000-0000-0000-0000-000000000002'; a jsonb; b jsonb; c jsonb; v_q text; begin
  perform pg_temp.act('approver');
  v_q := format($q$select public.bo_price_override_set('{"product":"sign","subject":"%s","kind":"discount_pct","value":10,"reason":"parceria piloto"}')$q$, sg);
  execute v_q into a;
  execute v_q into b;
  perform pg_temp.chk('I1 reenvio idêntico devolve o mesmo id', (a->>'id') = (b->>'id') and (b->>'unchanged')::boolean);
  perform pg_temp.chk('I2 reenvio não duplica nem gera novo log', (select count(*) from public.price_overrides where subject_id = sg) = 1
    and (select count(*) from public.staff_actions where action = 'price_override_set' and target_id = a->>'id') = 1);
  execute format($q$select public.bo_price_override_set('{"product":"sign","subject":"%s","kind":"discount_pct","value":15,"reason":"parceria piloto"}')$q$, sg) into c;
  perform pg_temp.chk('I3 alteração revoga o anterior e cria um novo', (c->>'replaced_id') = (a->>'id') and not (c->>'unchanged')::boolean
    and (select revoked_at is not null from public.price_overrides where id = (a->>'id')::uuid)
    and (select count(*) from public.price_overrides where subject_id = sg and revoked_at is null) = 1);
  perform pg_temp.chk('I4 índice único: segundo ativo direto no banco falha', pg_temp.err(format($q$insert into public.price_overrides (product, subject_kind, subject_id, kind, value, reason) values ('sign','sign_account','%s','fixed',50,'motivo válido')$q$, sg)) ilike '%price_overrides_one_active%');
  perform pg_temp.chk('I5 revogar com motivo curto recusado', pg_temp.err(format($q$select public.bo_price_override_revoke('%s', 'x')$q$, c->>'id'), 'authenticated') = 'reason_required');
  perform pg_temp.act('analyst');
  perform pg_temp.chk('I6 analista não revoga', pg_temp.err(format($q$select public.bo_price_override_revoke('%s', 'motivo válido')$q$, c->>'id'), 'authenticated') = 'insufficient_level');
  perform pg_temp.act('approver');
  perform pg_temp.run(format($q$select public.bo_price_override_revoke('%s', 'fim da parceria')$q$, c->>'id'), 'authenticated');
  perform pg_temp.chk('I7 aprovador revoga', (select msg from t_last) is null and (select revoke_reason from public.price_overrides where id = (c->>'id')::uuid) = 'fim da parceria');
  perform pg_temp.chk('I8 revogar de novo é idempotente', (public.bo_price_override_revoke((c->>'id')::uuid, 'fim da parceria')->>'unchanged')::boolean);
  perform pg_temp.chk('I9 revogar id inexistente', pg_temp.err($q$select public.bo_price_override_revoke('99999999-0000-0000-0000-000000000000', 'motivo válido')$q$, 'authenticated') = 'not_found');
  perform pg_temp.chk('I10 depois de revogar pode criar outro', pg_temp.err(v_q, 'authenticated') is null);
  perform pg_temp.chk('I11 lista traz o histórico (3) com o ativo marcado', jsonb_array_length(public.bo_price_override_list('sign', sg)) = 3
    and (select count(*) from jsonb_array_elements(public.bo_price_override_list('sign', sg)) e where (e->>'active_now')::boolean) = 1);
end $$;

-- ---- _effective_price ----
do $$ declare w uuid := 'a0000000-0000-0000-0000-000000000001'; begin
  perform pg_temp.chk('E1 sem override devolve o preço de tabela', public._effective_price('wealth', w, 79) = 79);
  insert into public.price_overrides (product, subject_kind, subject_id, kind, value, reason, valid_from, valid_until)
    values ('wealth', 'wealth_user', w, 'discount_pct', 10, 'desconto de teste', current_date - 5, current_date + 5);
  perform pg_temp.chk('E2 desconto 10% vigente: 79 -> 71,10', public._effective_price('wealth', w, 79) = 71.10);
  perform pg_temp.chk('E3 antes da validade volta ao preço de tabela', public._effective_price('wealth', w, 79, current_date - 6) = 79);
  perform pg_temp.chk('E4 depois da validade volta ao preço de tabela', public._effective_price('wealth', w, 79, current_date + 6) = 79);
  perform pg_temp.chk('E5 último dia da validade ainda vale', public._effective_price('wealth', w, 79, current_date + 5) = 71.10);
  perform pg_temp.chk('E6 _w_price_for aplica o override; _w_price intacto', public._w_price_for(w, 'pro') = 71.10 and public._w_price('pro') = 79);
  update public.price_overrides set revoked_at = now() where subject_id = w;
  perform pg_temp.chk('E7 revogado não vale', public._effective_price('wealth', w, 79) = 79);
  insert into public.price_overrides (product, subject_kind, subject_id, kind, value, reason) values ('wealth', 'wealth_user', w, 'fixed', 49.9, 'preço fixo de teste');
  perform pg_temp.chk('E8 valor fixo substitui o preço', public._effective_price('wealth', w, 79) = 49.90 and public._effective_price('wealth', w, 199) = 49.90);
  perform pg_temp.chk('E9 outro sujeito não é afetado', public._effective_price('wealth', 'a0000000-0000-0000-0000-000000000002', 79) = 79);
  perform pg_temp.chk('E10 outro produto não é afetado', public._effective_price('sign', w, 79) = 79);
end $$;

-- ---- partners: override entra no _platform_fee_run (meses novos, pois a rotina real não regrava: on conflict do nothing) ----
do $$ declare fa uuid := 'f0000000-0000-0000-0000-000000000001'; fb uuid := 'f0000000-0000-0000-0000-000000000002'; begin
  perform pg_temp.act('approver');
  perform pg_temp.chk('F1 aprovador: taxa 0,0010 -> 0,0008 (20%) liberada', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"partners","subject":"%s","kind":"fee_rate","value":0.0008,"valid_from":"2026-01-01","reason":"negociação anual"}')$q$, fa), 'authenticated') is null);
  perform pg_temp.chk('F2 aprovador: taxa 0,0010 -> 0,0007 (30%) barrada', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"partners","subject":"%s","kind":"fee_rate","value":0.0007,"reason":"negociação anual"}')$q$, fa), 'authenticated') = 'discount_needs_admin');
  perform pg_temp.chk('F2b fee_rate em fundo de tabela global (self) é recusado', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"partners","subject":"%s","kind":"fee_rate","value":0.0008,"reason":"negociação anual"}')$q$, fb), 'authenticated') = 'fee_rate_needs_contract');
  perform pg_temp.chk('F3 desconto 10% no fundo B', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"partners","subject":"%s","kind":"discount_pct","value":10,"valid_from":"2026-01-01","reason":"negociação anual"}')$q$, fb), 'authenticated') is null);
  perform public._platform_fee_run('2026-09-01');
  perform pg_temp.chk('F4 fundo A com taxa 0,0008: 60e6*0,0008/12 = 4000,00 (taxa gravada 0,0008)', (select amount from public.platform_fees where funder_id = fa and ref_month = '2026-09-01') = 4000.00
    and (select rate_aa from public.platform_fees where funder_id = fa and ref_month = '2026-09-01') = 0.0008);
  perform pg_temp.chk('F5 fundo B com desconto 10%: 2500 -> 2250,00', (select amount from public.platform_fees where funder_id = fb and ref_month = '2026-09-01') = 2250.00);
  perform pg_temp.chk('F6 bo_customer_plan partners: tabela x efetivo', (public.bo_customer_plan('partners', fa)->>'list_price')::numeric = 5000
    and (public.bo_customer_plan('partners', fa)->>'effective_price')::numeric = 4000);
  perform pg_temp.chk('F7 fee_rate não altera _effective_price (taxa é aplicada na origem)', public._effective_price('partners', fa, 5000) = 5000);
  perform pg_temp.act('admin');
  perform pg_temp.chk('F7b admin: valor fixo substitui o valor (fundo B = 1000,00)', pg_temp.err(format($q$select public.bo_price_override_set('{"product":"partners","subject":"%s","kind":"fixed","value":1000,"valid_from":"2026-01-01","reason":"acordo especial"}')$q$, fb), 'authenticated') is null);
  perform public._platform_fee_run('2026-08-01');
  perform pg_temp.chk('F7c fixed no fundo B = 1000,00', (select amount from public.platform_fees where funder_id = fb and ref_month = '2026-08-01') = 1000.00);
  perform public.bo_price_override_revoke((select id from public.price_overrides where subject_id = fa and revoked_at is null), 'volta ao normal');
  perform public.bo_price_override_revoke((select id from public.price_overrides where subject_id = fb and revoked_at is null), 'volta ao normal');
  perform public._platform_fee_run('2026-07-01');
  perform pg_temp.chk('F8 sem override a rotina volta a 5000 e 2500 (regressão)', (select array_agg(amount order by amount) from public.platform_fees where ref_month = '2026-07-01') = array[2500.00, 5000.00]::numeric[]);
end $$;

-- ---- bo_set_plan nos 3 produtos ----
do $$ declare sg uuid := '50000000-0000-0000-0000-000000000001'; w1 uuid := 'a0000000-0000-0000-0000-000000000001'; w2 uuid := 'a0000000-0000-0000-0000-000000000002';
  fc uuid := 'f0000000-0000-0000-0000-000000000002'; begin
  perform pg_temp.act('admin');
  perform pg_temp.run(format($q$select public.bo_set_plan('{"product":"sign","subject":"%s","plan":"profissional"}')$q$, sg), 'authenticated');
  perform pg_temp.chk('S1 sign: troca essencial -> profissional', (select msg from t_last) is null and (select plan from public.sign_accounts where id = sg) = 'profissional' and (select plan_since from public.sign_accounts where id = sg) = current_date);
  perform pg_temp.chk('S2 sign: evento upgrade com MRR efetivo antes/depois (override 50% ativo: 19,50 -> 49,50)', (select event || mrr_before || '>' || mrr_after from public.customer_events where ref_id = sg order by id desc limit 1) = 'upgrade19.50>49.50');
  perform pg_temp.chk('S3 sign: mesmo plano é idempotente (sem novo evento)', (public.bo_set_plan(jsonb_build_object('product', 'sign', 'subject', sg, 'plan', 'profissional'))->>'unchanged')::boolean
    and (select count(*) from public.customer_events where ref_id = sg) = 1);
  perform pg_temp.chk('S4 sign: plano inválido', pg_temp.err(format($q$select public.bo_set_plan('{"product":"sign","subject":"%s","plan":"inexistente"}')$q$, sg), 'authenticated') = 'invalid_plan');
  perform pg_temp.run(format($q$select public.bo_set_plan('{"product":"wealth","subject":"%s","plan":"fund","payment_ok":true}')$q$, w2), 'authenticated');
  perform pg_temp.chk('S5 wealth: gratis -> fund com pagamento ok', (select msg from t_last) is null and (select plan from public.w_profiles where user_id = w2) = 'fund' and (select payment_ok from public.w_profiles where user_id = w2));
  perform pg_temp.chk('S6 wealth: plano inválido', pg_temp.err(format($q$select public.bo_set_plan('{"product":"wealth","subject":"%s","plan":"ouro"}')$q$, w1), 'authenticated') = 'invalid_plan');
  perform pg_temp.chk('S7 wealth: usuário inexistente', pg_temp.err($q$select public.bo_set_plan('{"product":"wealth","subject":"99999999-0000-0000-0000-000000000000","plan":"pro"}')$q$, 'authenticated') = 'subject_not_found');
  perform pg_temp.run(format($q$select public.bo_set_plan('{"product":"partners","subject":"%s","plan":"contract","rate_aa":0.0005,"min_monthly":800}')$q$, fc), 'authenticated');
  perform pg_temp.chk('S8 partners: contrato 0,0005 a.a. e mínimo 800 cria platform_fee_plans e origin invite', (select msg from t_last) is null and (select rate_aa from public.platform_fee_plans where funder_id = fc) = 0.0005 and (select origin from public.funder_billing where funder_id = fc) = 'invite');
  perform pg_temp.chk('S9 partners: contrato passa a valer no cálculo (30e6*0,0005/12 = 1250,00)', (public._partners_fee_calc(fc)->>'list_amount')::numeric = 1250.00);
  perform pg_temp.chk('S10 partners: contrato sem taxa (ou taxa > 1) recusado', pg_temp.err(format($q$select public.bo_set_plan('{"product":"partners","subject":"%s","plan":"contract"}')$q$, fc), 'authenticated') = 'invalid_value');
  perform pg_temp.run(format($q$select public.bo_set_plan('{"product":"partners","subject":"%s","plan":"tier"}')$q$, fc), 'authenticated');
  perform pg_temp.chk('S11 partners: volta à faixa global', (select msg from t_last) is null and not (select active from public.platform_fee_plans where funder_id = fc) and (select origin from public.funder_billing where funder_id = fc) = 'self'
    and (public._partners_fee_calc(fc)->>'list_amount')::numeric = 2500.00);
  perform pg_temp.chk('S12 partners: funder inexistente', pg_temp.err($q$select public.bo_set_plan('{"product":"partners","subject":"99999999-0000-0000-0000-000000000000","plan":"tier"}')$q$, 'authenticated') = 'subject_not_found');
  perform pg_temp.chk('S13 set_plan registrado no log', (select count(*) from public.staff_actions where action = 'set_plan') = 4);
  perform pg_temp.chk('S14 w_admin_set_plan continua sem acesso para authenticated', not has_function_privilege('authenticated', 'public.w_admin_set_plan(uuid,text,boolean)', 'execute'));
  perform pg_temp.chk('S15 bo_plan_catalog traz os 3 produtos', (select count(*) from jsonb_object_keys(public.bo_plan_catalog())) = 3
    and jsonb_array_length(public.bo_plan_catalog()->'sign') = 4 and jsonb_array_length(public.bo_plan_catalog()->'wealth') = 3);
  perform pg_temp.chk('S16 bo_customer_plan sign mostra tabela, plano e próxima cobrança', (public.bo_customer_plan('sign', sg)->>'list_price')::numeric = 99
    and public.bo_customer_plan('sign', sg)->'next_billing'->>'due_date' is not null and public.bo_customer_plan('sign', sg)->>'plan' = 'profissional');
  perform pg_temp.chk('S17 bo_customer_plan sujeito inexistente', pg_temp.err($q$select public.bo_customer_plan('sign', '99999999-0000-0000-0000-000000000000')$q$, 'authenticated') = 'subject_not_found');
end $$;

-- ---- _bill_generate_auto ----
do $$ declare r1 jsonb; r2 jsonb; fa uuid := 'f0000000-0000-0000-0000-000000000001'; s2 uuid := '50000000-0000-0000-0000-000000000002'; s1 uuid := '50000000-0000-0000-0000-000000000001'; begin
  -- estado: sign 1 = profissional (99), sign 2 = profissional (99, com override ativo de 10% criado no bloco anterior), outros conforme massa
  update public.sign_accounts set plan = 'essencial' where id = s1;
  update public.price_overrides set revoked_at = now() where product = 'sign' and subject_id in (s1, s2) and revoked_at is null;
  insert into public.price_overrides (product, subject_kind, subject_id, kind, value, reason) values ('sign', 'sign_account', s2, 'discount_pct', 10, 'desconto de teste');
  update public.price_overrides set valid_from = '2026-01-01' where subject_id = s2 and revoked_at is null;
  delete from public.bill_invoices;
  r1 := public._bill_generate_auto('2026-10-20');
  r2 := public._bill_generate_auto('2026-10-01');
  perform pg_temp.chk('G1 primeira rodada: 2 taxas + 2 mensalidades (grátis, isenta e conta nova fora)', (r1->>'platform_fee')::int = 2 and (r1->>'sign')::int = 2);
  perform pg_temp.chk('G2 segunda rodada não duplica', (r2->>'platform_fee')::int = 0 and (r2->>'sign')::int = 0 and (select count(*) from public.bill_invoices) = 4);
  perform pg_temp.chk('G3 Sign essencial = 39,00 sem override', (select amount from public.bill_invoices where sign_account_id = s1) = 39.00);
  perform pg_temp.chk('G4 Sign profissional com 10% = 89,10 (respeita o override)', (select amount from public.bill_invoices where sign_account_id = s2) = 89.10);
  perform pg_temp.chk('G5 taxa de plataforma = platform_fees', (select amount from public.bill_invoices where funder_id = fa) = 5000.00);
  perform pg_temp.chk('G6 vencimento = dia 10 do mês seguinte, ref_month = 01/10', (select count(*) from public.bill_invoices where due_date = '2026-11-10' and ref_month = '2026-10-01') = 4);
  perform pg_temp.chk('G7 faturas abertas, com origem e número', (select count(*) from public.bill_invoices where status = 'open' and source is not null and number like 'F-%') = 4);
  perform pg_temp.chk('G7b só valores permitidos pelos CHECKs reais (kind, source, status, amount)', (select count(*) from public.bill_invoices) = 4
    and not exists (select 1 from public.bill_invoices where customer_kind not in ('funder','sign') or source not in ('platform_fee','sign') or status <> 'open' or amount < 0 or org_id is not null)
    and (select count(*) from public.bill_invoices where customer_kind = 'funder' and source = 'platform_fee') = 2 and (select count(*) from public.bill_invoices where customer_kind = 'sign' and source = 'sign') = 2);
  perform pg_temp.chk('G7c o stub rejeita valor inválido (source antigo)', pg_temp.err($q$insert into public.bill_invoices (number, source) values ('F-X', 'sign_subscription')$q$) ilike '%bill_invoices_source_check%');
  perform pg_temp.chk('G8 sem fatura para isenta, grátis e conta criada depois', not exists (select 1 from public.bill_invoices where sign_account_id in
    ('50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000005')));
  -- fatura gerada antes pelo botão manual (bo_inv_generate) não é duplicada pelo automático
  delete from public.bill_invoices; perform pg_temp.act('approver');
  perform public.bo_inv_generate('2026-10-01');
  r1 := public._bill_generate_auto('2026-10-01');
  perform pg_temp.chk('G9 manual + automático não duplicam a taxa de plataforma', (r1->>'platform_fee')::int = 0 and (select count(*) from public.bill_invoices where source = 'platform_fee') = 2);
  -- cancelada pode ser regerada; due_day respeitado
  update public.bill_invoices set status = 'cancelled' where source = 'sign';
  update public.billing_settings set due_day = 40 where id = 1;
  r1 := public._bill_generate_auto('2026-10-01');
  perform pg_temp.chk('G10 due_day é limitado a 28', (select min(due_date) from public.bill_invoices where source = 'sign' and status = 'open') = '2026-11-28');
  update public.billing_settings set due_day = 10 where id = 1;
  perform pg_temp.chk('G11 execução direta negada para authenticated e anon', pg_temp.err('select public._bill_generate_auto()', 'authenticated') ilike 'permission denied%'
    and pg_temp.err('select public._bill_generate_auto()', 'anon') ilike 'permission denied%');
end $$;

-- ---- bo_overdue_list ----
do $$ declare o jsonb; begin
  delete from public.bill_invoices;
  insert into public.bill_invoices (number, customer_kind, customer_name, amount, due_date, status, source) values
    ('F-T-1', 'funder', 'Cliente Exemplo 1', 100, current_date - 3, 'open', 'manual'),
    ('F-T-2', 'sign', 'Cliente Exemplo 2', 250.50, current_date - 15, 'open', 'manual'),
    ('F-T-3', 'sign', 'Cliente Exemplo 3', 80, current_date - 16, 'open', 'manual'),
    ('F-T-4', 'sign', 'Paga', 70, current_date - 40, 'paid', 'manual'),
    ('F-T-5', 'sign', 'A vencer', 60, current_date + 2, 'open', 'manual'),
    ('F-T-6', 'sign', 'Vence hoje', 60, current_date, 'open', 'manual'),
    ('F-T-7', 'sign', 'Cancelada', 60, current_date - 20, 'cancelled', 'manual');
  perform pg_temp.act('analyst');
  o := public.bo_overdue_list();
  perform pg_temp.chk('O1 só abertas vencidas (3), total 430,50', (o->>'total')::int = 3 and (o->>'total_amount')::numeric = 430.50);
  perform pg_temp.chk('O2 ordem do mais antigo e dias de atraso', o->'items'->0->>'number' = 'F-T-3' and (o->'items'->0->>'days_overdue')::int = 16);
  perform pg_temp.chk('O3 estágio: 15 dias ainda na carência, 16 além', (select stage from jsonb_to_recordset(o->'items') as x(number text, stage text) where number = 'F-T-2') = 'grace'
    and (select stage from jsonb_to_recordset(o->'items') as x(number text, stage text) where number = 'F-T-3') = 'beyond_grace');
  perform pg_temp.act(null);
  perform pg_temp.chk('O5 sem equipe: forbidden', pg_temp.err('select public.bo_overdue_list()', 'authenticated') = 'forbidden');
  perform pg_temp.chk('O6 anon sem permissão', pg_temp.err('select public.bo_overdue_list()', 'anon') ilike 'permission denied%');
  update public.billing_settings set grace_days = 20 where id = 1;
  perform pg_temp.act('analyst');
  perform pg_temp.chk('O7 carência configurável (20 dias)', (select stage from jsonb_to_recordset(public.bo_overdue_list()->'items') as x(number text, stage text) where number = 'F-T-3') = 'grace');
  update public.billing_settings set grace_days = 15 where id = 1;
end $$;

-- ---- proteção e grants ----
do $$ declare f record; n int := 0; begin
  perform pg_temp.chk('D1 _guard_delete bloqueia delete', pg_temp.err('delete from public.price_overrides') = 'protected_delete');
  perform pg_temp.chk('D2 _guard_delete bloqueia truncate', pg_temp.err('truncate public.price_overrides') = 'protected_table');
  perform pg_temp.chk('D3 RLS ligada em price_overrides', (select relrowsecurity from pg_class where oid = 'public.price_overrides'::regclass));
  perform pg_temp.chk('D4 sem política de RLS (acesso só por RPC)', not exists (select 1 from pg_policies where tablename = 'price_overrides'));
  perform pg_temp.chk('D5 anon e authenticated sem privilégio na tabela', not has_table_privilege('anon', 'public.price_overrides', 'select,insert,update,delete')
    and not has_table_privilege('authenticated', 'public.price_overrides', 'select,insert,update,delete'));
  for f in select p.oid::regprocedure fn, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in
      ('bo_plan_catalog','bo_customer_plan','bo_price_override_list','bo_price_override_set','bo_price_override_revoke','bo_set_plan','bo_overdue_list') loop
    n := n + 1;
    perform pg_temp.chk('D6 ' || f.proname || ': só authenticated, nunca anon', has_function_privilege('authenticated', f.fn, 'execute') and not has_function_privilege('anon', f.fn, 'execute')
      and (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = f.fn));
  end loop;
  perform pg_temp.chk('D7 as 7 RPCs foram verificadas', n = 7);
  n := 0;
  for f in select p.oid::regprocedure fn, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in
      ('_effective_price','_override_fee_rate','_partners_fee_calc','_w_price_for','_price_subject','_platform_fee_run','_bill_generate_auto') loop
    n := n + 1;
    perform pg_temp.chk('D8 ' || f.proname || ': só service_role', has_function_privilege('service_role', f.fn, 'execute')
      and not has_function_privilege('anon', f.fn, 'execute') and not has_function_privilege('authenticated', f.fn, 'execute'));
  end loop;
  perform pg_temp.chk('D9 as 7 internas foram verificadas', n = 7);
  perform pg_temp.chk('D10 nenhuma função nova executável por anon', not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
    and (p.proname like 'bo\_price\_override%' or p.proname in ('bo_plan_catalog','bo_customer_plan','bo_set_plan','bo_overdue_list') or p.proname in ('_effective_price','_bill_generate_auto','_w_price_for'))
    and has_function_privilege('anon', p.oid, 'execute')));
  perform pg_temp.chk('D11 índices e CHECKs presentes', (select count(*) from pg_indexes where tablename = 'price_overrides') >= 4
    and (select count(*) from pg_constraint where conrelid = 'public.price_overrides'::regclass and contype = 'c') >= 5);
  perform pg_temp.chk('D12 job pg_cron só se a extensão existe (aqui não existe: nada criado)', not exists (select 1 from pg_extension where extname = 'pg_cron'));
end $$;

do $$ declare v_t int; v_ok int; bad text; begin
  select count(*), count(*) filter (where r.ok) into v_t, v_ok from t_res r;
  select string_agg(r.name, '; ') into bad from t_res r where not r.ok;
  raise notice '% de % passaram', v_ok, v_t;
  if v_ok <> v_t then raise exception 'FALHARAM: %', bad; end if;
end $$;
