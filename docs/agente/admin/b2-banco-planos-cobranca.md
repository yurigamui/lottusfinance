# B2 (leitura): planos, preços e cobrança no banco · 25/11/2026
[MAESTRO/AUDITOR] Só SELECT em produção (projeto Lottus Finance). Funções lidas com `pg_get_functiondef`. Nada alterado.

## Como é hoje
| Produto | Onde mora o plano | Preço efetivo | Troca de plano pelo Admin | Preço personalizado |
| --- | --- | --- | --- | --- |
| **Sign** | `sign_accounts.plan` (+ `plan_since`, `cycle`, `plan_requested`) e `sign_plans` (4 planos) | `sign_plans.price_month` | `bo_sign_account_set` (admin) | **já existe**: `custom_price`, `custom_docs`, `exempt` (sem validade, sem motivo) |
| **Partners** | tabela global `billing_settings.tiers` (fundo que se cadastrou sozinho, `origin='self'`) ou `platform_fee_plans` por fundo (convite, hoje 0 linhas) | `_plan_fee(pl)` ou `rate_aa`/`min_monthly` do fundo | **não há RPC**: `bo_billing_funder_set` só muda `exempt`; a faixa é só calculada | só pelo `platform_fee_plans`, **sem RPC nem tela** |
| **Wealth** | `w_profiles.plan` ('gratis','pro','fund'), `payment_ok` | `_w_price` **fixo no código** (pro 79, fund 199) | `w_admin_set_plan` **sem grant ao `authenticated`**: o Admin não consegue chamar | nenhum |
| **Invest / Business** | n/a (Invest fora do repo; Business pausado) | — | — | — |

## Cobrança automática hoje (pg_cron)
- Automático: `lottus-platform-fee` (dia 1, calcula `platform_fees` do mês anterior), `lottus-billing-watch` (marca fundo acima da faixa grátis), `lottus-bill-reminders` (régua: 3 dias antes, no dia, +3, +7, +15; só para organizações com `remind_enabled`), `lottus-charge-reminders`, `lottus-mrr-snapshot`, `wealth-billing-close`, `wealth-billing-charge`, `wealth-billing-notices`, `wealth-overdue`.
- **Manual**: transformar `platform_fees` em fatura (`bo_inv_generate`, botão, nível aprovador); enviar fatura (`bo_inv_send`); baixar pagamento (`bo_inv_pay`). Mensalidade do Sign: nenhum job gera fatura (`bo_subscriptions` só calcula MRR).
- `bill_invoices` e `lottus_bill_invoices`: colunas idênticas, 0 linhas nas duas (tabelas gêmeas; remover uma só com OK do Yuri).
- Segurança: todas as `bo_*` consultadas existem, `SECURITY DEFINER`, `search_path=''`, `_staff(nível)` dentro da função, sem `anon`. `w_admin_*` só service_role (correto; falta wrapper `bo_w_*`).

## Lacunas para o pedido (ordem de prioridade)
1. Preço personalizado **com validade e motivo** e limite de desconto (D4) para os três produtos; hoje só o Sign tem campo, sem validade/motivo/auditoria.
2. Trocar plano do Partners (faixa/contrato) e do Wealth pelo Admin.
3. Gerar fatura automaticamente (taxa de plataforma e mensalidade Sign) e enviar sem clique; hoje é botão.
4. Fila "Em atraso" e ação de inadimplência (D3) no Admin.
5. Catálogo único (D1): hoje 3 catálogos; expor uma visão única `bo_plan_catalog` sem mover dados.

## Menor desenho proposto (migração `AAAAMMDD_admin_planos_precos_cobranca.sql`, não aplicada)
- `price_overrides` (product, subject_kind, subject_id, kind `fixed|discount_pct|fee_rate`, value, valid_from, valid_until, reason NOT NULL, created_by, revoked_at/by): RLS ligada sem política (acesso só por RPC), CHECKs (value>=0, discount_pct<=100, valid_until>=valid_from, reason ≥5 caracteres), índice único parcial de um override ativo por sujeito+produto, `_guard_delete`.
- RPCs `bo_price_override_set` / `_revoke` / `_list` (aprovador até 20% de desconto, acima disso admin; `_staff_log`; idempotente), `bo_plan_catalog`, `bo_customer_plan` (plano, preço de tabela, override vigente, preço efetivo, próximo ciclo), `bo_set_plan(product, subject, plan)` (Sign por `bo_sign_account_set`; Wealth por wrapper de `w_admin_set_plan`; Partners por `platform_fee_plans`), `bo_overdue_list`.
- Cálculo efetivo: `_effective_price(product, subject)` usado por `_platform_fee_run`, `_w_price` e pela geração de faturas, sem alterar o que não tem override.
- Cron `lottus-billing-auto` (dia 2, 10:00 UTC-3): `_bill_generate_auto()` gera as faturas do mês (taxa de plataforma + mensalidade Sign), idempotente por (cliente, ref_month, origem), e deixa a régua existente enviar.
- Testes em Postgres local (`scripts/test-db.sh`/`wealth-local`), nunca produção.
