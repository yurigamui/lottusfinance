# STATUS: Admin · atualizado em 23/11/2026

**Modo:** Beta (código existe; auditoria parcial em `relatorio.md`) + pedido novo de evolução (Admin v2).
**Leitura adotada (G0, sem resposta ainda):** o Yuri quer (1) reorganizar a UX do Admin, hoje com informação demais numa tela; (2) vincular o Admin a todas as plataformas Lottus; (3) automatizar a cobrança; (4) trocar plano e definir preço personalizado por cliente. Preço, plano e regra de cobrança são decisão dele (manual, seção 15).
**Fase atual:** Parte 1, seção 1 (Base visual) em construção. D2 a D4 abertas (só travam a Parte 4).

## Linha de base (Fase 0, fatos verificados em 23/11/2026)
- Front: 1 página, 20 módulos JS (~4,8 mil linhas), 89 RPCs chamadas. Menu: 6 grupos, 18 itens (Configurações mistura Motor, Equipe, E-mails, Auditoria, Indicações e Taxa).
- **O front não tem nenhuma tela de planos, assinaturas ou faturas**, embora o banco já tenha: `bo_billing_partners`, `bo_billing_funder_set`, `bo_billing_settings_save`, `bo_sign_plan_save`, `bo_subscriptions` (todas liberadas a `authenticated`, sem `anon`).
- Wealth: `w_admin_set_plan`, `w_admin_invoice_paid`, `w_billing_close` **não** têm grant a `authenticated` (só service_role): o Admin não consegue chamá-las; precisam de wrapper `bo_w_*`.
- Preço vive em 4 lugares sem painel único: `billing_settings.tiers` (taxa de plataforma dos fundos: grátis até PL 100 mil; faixas 149 / 390 / 0,1% a.a.), `platform_fee_plans` (por fundo, 0 linhas), `sign_plans` (Grátis 0, Essencial 39, Profissional 99, Empresa 249), plano do Wealth (função `_w_price`).
- Faturas: `bill_invoices` e `lottus_bill_invoices` têm colunas idênticas e 0 linhas cada (**tabelas gêmeas**, a decidir qual fica). `platform_fees` 1 linha, `funder_billing` 2, `staff_users` 1.
- Rotinas de cobrança já agendadas: `lottus-platform-fee` (dia 1), `lottus-bill-reminders`, `lottus-charge-reminders`, `lottus-billing-watch`, `lottus-mrr-snapshot`, `wealth-billing-close`, `wealth-overdue`, `one-billing`.
- Pendências herdadas: A-001 (migração NF-e não aplicada), A-004 (telas logadas não auditadas; falta usuário de equipe no branch).

## Painel
| Parte | Seção | Especificada | Construída | Verificada | Veredito | Ciclos |
| --- | --- | --- | --- | --- | --- | --- |
| Base | Conferência manual da NF-e | sim | sim | sim | Aprovada c/ ressalvas | 2 |
| (demais seções existentes) | — | — | existem | não | não verificado | 0 |
| v2 | Tudo abaixo | ver `ficha-plataforma-v2.md` | não | não | — | 0 |

## Próximo passo exato
1. Construir seção 1 (base visual), verificar, e seguir a ordem de `ficha-parte-1.md`.
2. Fase 2, Parte 1 "Navegação e organização" (sem regra de negócio): Ficha da Parte, depois micro-spec da seção "Menu e Início".
3. Em paralelo possível, só leitura: B0 completo (mapa de vínculos real) em `mapa-de-vinculos.md`.

## Bloqueios que dependem do Yuri
G1 (Ficha); D1 a D4 em `ficha-plataforma-v2.md`; D-01 (branch Supabase) para testar migrações de cobrança.
