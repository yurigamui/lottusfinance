-- Teste da migração 20261123120000_wealth_integridade_e_indices.sql
-- Rodar depois da migração. Cada bloco imprime "ok: ..." ou aborta com erro.
\set ON_ERROR_STOP on
do $$
declare u uuid; w1 uuid; w2 uuid; acc uuid; c1 uuid; c2 uuid; cc1 uuid; s uuid; ok boolean;
begin
  insert into auth.users default values returning id into u;
  insert into public.w_wallets (name, owner_id, created_by) values ('Exemplo A', u, u) returning id into w1;
  insert into public.w_wallets (name, owner_id, created_by) values ('Exemplo B', u, u) returning id into w2;
  insert into public.w_bank_accounts (wallet_id, name) values (w1, 'Conta exemplo') returning id into acc;
  insert into public.w_cadastros (wallet_id, kind, name) values (w1, 'contraparte', 'Fornecedor exemplo') returning id into c1;
  insert into public.w_cadastros (wallet_id, kind, name) values (w2, 'contraparte', 'Fornecedor de outra carteira') returning id into c2;
  insert into public.w_cadastros (wallet_id, kind, name) values (w1, 'centro', 'Centro exemplo') returning id into cc1;

  -- AC1: referência da mesma carteira e do tipo certo é aceita
  insert into public.w_spend_tx (wallet_id, account_id, date, description, amount, counterparty_id, cost_center_id)
  values (w1, acc, '2024-02-29', 'Compra exemplo', -10.50, c1, cc1) returning id into s;
  raise notice 'ok: AC1 referência válida aceita';

  -- AC2: contraparte de outra carteira é recusada (insert e update)
  ok := false; begin
    insert into public.w_spend_tx (wallet_id, account_id, date, description, amount, counterparty_id) values (w1, acc, current_date, 'x', -1, c2);
  exception when others then ok := sqlerrm = 'invalid_reference'; end;
  if not ok then raise exception 'AC2 insert cruzado não foi recusado'; end if;
  ok := false; begin
    update public.w_spend_tx set counterparty_id = c2 where id = s;
  exception when others then ok := sqlerrm = 'invalid_reference'; end;
  if not ok then raise exception 'AC2 update cruzado não foi recusado'; end if;
  raise notice 'ok: AC2 referência de outra carteira recusada';

  -- AC3: tipo errado (centro usado como contraparte) é recusado
  ok := false; begin
    update public.w_spend_tx set counterparty_id = cc1 where id = s;
  exception when others then ok := sqlerrm = 'invalid_reference'; end;
  if not ok then raise exception 'AC3 tipo errado não foi recusado'; end if;
  raise notice 'ok: AC3 tipo errado recusado';

  -- AC4: regras seguem a mesma validação
  ok := false; begin
    insert into public.w_rules (wallet_id, match_text, group_id) values (w1, 'mercado', c2);
  exception when others then ok := sqlerrm = 'invalid_reference'; end;
  if not ok then raise exception 'AC4 regra cruzada não foi recusada'; end if;
  insert into public.w_rules (wallet_id, match_text, counterparty_id) values (w1, 'mercado', c1);
  raise notice 'ok: AC4 regras validadas';

  -- AC5: apagar o cadastro continua zerando a referência (ON DELETE SET NULL passa pelo gatilho)
  delete from public.w_cadastros where id = c1;
  if (select counterparty_id from public.w_spend_tx where id = s) is not null then raise exception 'AC5 set null falhou'; end if;
  raise notice 'ok: AC5 exclusão de cadastro zera a referência';

  -- AC6: notas e eventos de pagamento não podem ser apagados
  insert into public.w_invoices (user_id) values (u);
  ok := false; begin delete from public.w_invoices; exception when others then ok := sqlerrm = 'protected_delete'; end;
  if not ok then raise exception 'AC6 delete em w_invoices não foi bloqueado'; end if;
  raise notice 'ok: AC6 _guard_delete em w_invoices';

  -- AC10 (regressão A1): dado legado inconsistente não trava edição de outra coluna nem a exclusão de outro cadastro
  declare g1 uuid; legado uuid;
  begin
    insert into public.w_cadastros (wallet_id, kind, name) values (w1, 'grupo', 'Grupo exemplo') returning id into g1;
    alter table public.w_spend_tx disable trigger w_spend_tx_cad_refs;
    insert into public.w_spend_tx (wallet_id, account_id, date, description, amount, counterparty_id, group_id)
      values (w1, acc, current_date, 'Legado', -2, c2, g1) returning id into legado;
    alter table public.w_spend_tx enable trigger w_spend_tx_cad_refs;
    update public.w_spend_tx set notes = 'editado', cost_center_id = cc1 where id = legado;
    delete from public.w_cadastros where id = g1;
    if (select group_id from public.w_spend_tx where id = legado) is not null then raise exception 'AC10 set null falhou'; end if;
    raise notice 'ok: AC10 dado legado não trava edição nem exclusão';
  end;

  -- AC11: trocar só a carteira revalida tudo
  ok := false; begin
    update public.w_spend_tx set wallet_id = w2 where id = s;
  exception when others then ok := sqlerrm = 'invalid_reference'; end;
  if not ok then raise exception 'AC11 troca de carteira não foi recusada'; end if;
  raise notice 'ok: AC11 troca de carteira revalidada';

  -- AC12: cadastro em uso não muda de carteira nem de tipo; sem uso, pode
  ok := false; begin
    update public.w_cadastros set wallet_id = w2 where id = cc1;
  exception when others then ok := sqlerrm = 'in_use'; end;
  if not ok then raise exception 'AC12 cadastro em uso mudou de carteira'; end if;
  ok := false; begin
    update public.w_cadastros set kind = 'grupo' where id = cc1;
  exception when others then ok := sqlerrm = 'in_use'; end;
  if not ok then raise exception 'AC12 cadastro em uso mudou de tipo'; end if;
  update public.w_cadastros set name = 'Fornecedor renomeado' where id = c2;
  raise notice 'ok: AC12 cadastro em uso travado; renomear continua livre';

  -- AC13: truncate e delete bloqueados também em w_payment_events
  insert into public.w_payment_events (provider) values ('exemplo');
  ok := false; begin delete from public.w_payment_events; exception when others then ok := sqlerrm = 'protected_delete'; end;
  if not ok then raise exception 'AC13 delete em w_payment_events não foi bloqueado'; end if;
  ok := false; begin truncate public.w_payment_events; exception when others then ok := sqlerrm = 'protected_table'; end;
  if not ok then raise exception 'AC13 truncate em w_payment_events não foi bloqueado'; end if;
  ok := false; begin truncate public.w_invoices; exception when others then ok := sqlerrm = 'protected_table'; end;
  if not ok then raise exception 'AC13 truncate em w_invoices não foi bloqueado'; end if;
  raise notice 'ok: AC13 delete e truncate bloqueados';
end $$;

-- AC7 e AC8: função interna sem grant e índices criados
do $$
begin
  if has_function_privilege('anon', 'public._w_check_cad_refs()', 'execute')
     or has_function_privilege('authenticated', 'public._w_check_cad_refs()', 'execute')
     or has_function_privilege('authenticated', 'public._w_cadastro_lock()', 'execute')
     or has_function_privilege('anon', 'public._w_cadastro_lock()', 'execute') then
    raise exception 'AC7 função interna executável por anon/authenticated';
  end if;
  raise notice 'ok: AC7 função interna sem grant';
  if (select count(*) from pg_indexes where schemaname = 'public' and indexname in
      ('w_spend_tx_counterparty_idx','w_rules_wallet_idx','w_imports_wallet_idx','w_bank_accounts_wallet_idx','w_invest_tx_asset_idx','w_other_wallet_idx')) <> 6 then
    raise exception 'AC8 índices ausentes';
  end if;
  raise notice 'ok: AC8 índices criados';
end $$;
