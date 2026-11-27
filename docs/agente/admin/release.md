# Pacote de release: Lottus Admin v2 · 27/11/2026
[MAESTRO] **Nada foi aplicado em produção nem publicado.** Este documento é o roteiro para o Yuri (ou quem ele indicar) executar com OK explícito (Fase 7, gate G7). Hipóteses de negócio marcadas como **[hipótese]** foram adotadas em modo sem supervisão e precisam de revisão antes de publicar.

## 1. O que muda
- **Front (`apps/admin`)**: versão reformulada (upload do Yuri, f55fa8f) com menu em gaveta no celular, bloqueio por nível nas rotas de administrador, datas no fuso de Brasília, modal em folha inferior, tabelas que viram cartões, busca global, telas divididas em abas/"Ver mais", ficha do cliente com aba **Plano e preço** (trocar plano, preço personalizado com validade e motivo, histórico), **Catálogo** e **Preços personalizados** em Preços e planos, fila **Em atraso** em A receber e bloco de geração automática na Régua.
- **Banco** (migrações novas, nenhuma aplicada): ver seção 2.

## 2. Migrações, em ordem de execução (testadas só em Postgres local com stubs)
| # | Arquivo | O que faz | Testes locais |
| --- | --- | --- | --- |
| 1 | `20261123122000_admin_conferencia_manual_nfe.sql` | cria `bo_nfe_manual_check` (botão da NF-e) | N1 a N6 |
| 2 | `20261125120000_admin_planos_precos_cobranca.sql` | `price_overrides`; RPCs `bo_plan_catalog`, `bo_customer_plan`, `bo_price_override_list/set/revoke`, `bo_set_plan`, `bo_overdue_list`; internas `_effective_price`, `_platform_fee_run` (redefinida, +2 linhas de override), `_bill_generate_auto`; job `lottus-billing-auto` (dia 2, 10h de Brasília) | 158 de 158 |
| 3 | `20261126120000_admin_seguranca_sign_mensageria.sql` | `sign_messaging_save`, `sign_root_add`, `sign_root_toggle` passam a exigir **administrador** + log (A-031) | 24 de 24 |
As migrações do Wealth (`20261123120000` a `20261123130000`) e a `20261123121000` (RLS/helpers) pertencem a outras plataformas: seguem o roteiro delas em `docs/agente/depende-de-mim.md`.

## 3. ANTES de aplicar (obrigatório)
1. **Branch do Supabase (D-01)**: aplicar tudo no branch primeiro e rodar `supabase/tests/admin_*.sql` contra ele.
2. **Comparar com produção** (a migração 2 usa `create or replace`; falha se a assinatura diferir): `pg_get_functiondef` de `_platform_fee_run(date)`, `_plan_fee(numeric)`, `_staff(text)`, `bo_inv_generate(date)`. Em 27/11 o corpo de `_platform_fee_run` foi lido e confere com o do arquivo `b2-defs-producao.sql`.
3. **Migração 3**: rodar a consulta do cabeçalho do arquivo para ver se alguma função, gatilho ou rotina chama `sign_messaging_save`, `sign_root_add` ou `sign_root_toggle` por dentro (passam a exigir administrador). Assinaturas reais conferidas em produção: `sign_messaging_save(p jsonb)`, `sign_root_add(p_name text, p_pem text)`, `sign_root_toggle(p_id uuid, p_active boolean)`, todas retornam `jsonb`.
4. **Confirmar no branch**: `bo_customer(kind,id).id` = `funders.id`/`sign_accounts.id` (lido em produção: confere); `bo_inv_list` devolve `funder_id` e `sign_account_id` (A-036: "Ver cliente" só aparece se vierem); `bo_customer_plan` devolve o mínimo mensal do contrato (o front aceita `min_monthly` ou `list_min`).
5. **Backup** do banco de produção (restauração testada) antes de qualquer mudança.

## 4. Plano de reversão
- Migração 2: o cabeçalho traz o `drop`/`unschedule` e o corpo original de `_platform_fee_run` em comentário. Sem faturas automáticas geradas, remover é seguro; com faturas já geradas, **não** apagar `bill_invoices` (tabela protegida): cancelar as faturas pelo Admin.
- Migração 3: renomear de volta `_<nome>_impl` para o nome original (reversão no cabeçalho).
- Front: publicar de novo a versão anterior da pasta (a hospedagem mantém versões) ou reverter o merge.

## 5. Publicação do front
Pasta `apps/admin` em admin.lottusfinance.com.br (ver `apps/admin/README.md` e `docs/agente/depende-de-mim.md` P-01: a hospedagem deve apontar para `apps/admin`). Conferir `_headers` (CSP) e a versão de cache (`?v=`) dos JS/CSS.

## 6. Teste de fumaça e roteiro de 5 minutos
Ver o roteiro entregue pela verificação final (`verificacao-final.md`, seção "Roteiro de 5 minutos").

## 7. Primeiras 48 horas
Acompanhar: execução do job `lottus-billing-auto` no dia 2 (`select * from cron.job_run_details where jobid=(select jobid from cron.job where jobname='lottus-billing-auto') order by start_time desc limit 5`), faturas geradas (contagem e valores contra `platform_fees`), erros de RPC nos logs do Supabase, `staff_actions` com `price_override_*` e `set_plan`, nenhum `discount_needs_admin` inesperado. Registrar em `status.md`.

## 8. Decisões do Yuri antes de publicar
- **[hipótese] D2** ciclo mensal, vencimento no dia 10 (`billing_settings.due_day`), cobrança pós-paga.
- **[hipótese] D3** carência de 15 dias; depois, só aviso e fila "Em atraso"; sem bloqueio nem rebaixa automáticos.
- **[hipótese] D4** aprovador até 20% de desconto; acima disso só administrador; motivo ≥5 caracteres; validade opcional.
- **A-028 (alta):** a régua de e-mails atual só cobre faturas com `org_id` em `one_orgs`; as faturas automáticas (taxa de plataforma e Sign) têm `org_id` nulo e **não recebem lembrete por e-mail**. Decidir: a régua passa a cobri-las ou elas ganham `org_id`. Até lá a Régua do Admin avisa isso na tela.
- E-mail da fatura do Sign: `sign_accounts` não tem e-mail; sem ele a régua não envia (as faturas Sign saem com `customer_email` nulo).
- Preço de tabela e planos: os valores são os já existentes no banco; nenhum preço novo foi criado.
- Wealth: `_w_price` segue fixo no código (pro 79, fund 199); `w_billing_close` não usa o override ainda (`_w_price_for` existe); sem tela de usuários Wealth no Admin (A-044).
- Textos de cobrança, multa/juros e termos de plano: **jurídico** (nenhum texto jurídico foi criado).

## 9. Alertas do Supabase hoje (segurança, produção, leitura)
5 grupos de avisos: `rls_enabled_no_policy` (INFO), `function_search_path_mutable` (WARN), `anon_security_definer_function_executable` (WARN, 1 grupo), `authenticated_security_definer_function_executable` (WARN, esperado nas RPCs `bo_*`), `auth_leaked_password_protection` (WARN, ver S-02 em `depende-de-mim.md`). Nenhum ERROR. Reler depois de aplicar as migrações.
