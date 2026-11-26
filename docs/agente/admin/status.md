# STATUS: Admin · atualizado em 25/11/2026

> **REPLANEJAMENTO (25/11):** o merge do `main` trouxe a **versão reformulada do Admin** (upload do Yuri em 23/11, commit f55fa8f): menu Início / Clientes / Comercial / Marketing / Financeiro / Produtos / Configurações (com Preços e planos e Régua de cobrança), 32 RPCs `bo_*` **todas existentes e liberadas só a `authenticated` em produção**. É a "demo" do pedido. As seções 1 a 3 da Parte 1 foram feitas sobre o Admin antigo (menu antigo, rotas antigas) e ficam **superadas** no `app.js`, `views.js` e `index.html` (restaurados para a versão do Yuri). Ficam aproveitáveis: componentes de `ui.js` (pageHead, list, more, skeleton) e a lógica de bloqueio por nível/destino pós-login, a portar. Novo plano: Modo Beta na versão reformulada (auditar), depois UX, vínculos, cobrança e preços. O plano das Partes 1 a 4 de `ficha-plataforma-v2.md` vale; `ficha-parte-1.md` é reescrita sobre a versão nova.

> **MODO SEM SUPERVISÃO (ordem do Yuri em 24/11: "não pergunte mais nada, nem solicite aprovação, termine a plataforma").** O Maestro adota a leitura mais razoável, registra aqui e segue. Continuam valendo, sem exceção: nada aplicado em produção, nenhum preço/texto jurídico inventado, nada apagado. Entrega final = código + migrações prontas e testadas só em Postgres local + roteiro de release; a aplicação em produção e a publicação ficam como passo do Yuri.
> **Suposições adotadas (hipóteses marcadas, todas configuráveis, a rever antes do release):** D2 ciclo mensal, vencimento no dia 10 (`billing_settings.due_day`), cobrança pós-paga por `ref_month`. D3 carência de 15 dias (`grace_days` atual); depois dela: lembrete por e-mail e entrada na fila "Em atraso"; sem bloqueio nem rebaixa automáticos (ação manual da equipe). D4 desconto personalizado: aprovador até 20%, acima disso só administrador; todo preço personalizado exige motivo, validade e fica na auditoria. Valores de planos = os que já existem no banco; nenhum preço novo.

**Modo:** Beta (código existe; auditoria parcial em `relatorio.md`) + pedido novo de evolução (Admin v2).
**Leitura adotada (G0, sem resposta ainda):** o Yuri quer (1) reorganizar a UX do Admin, hoje com informação demais numa tela; (2) vincular o Admin a todas as plataformas Lottus; (3) automatizar a cobrança; (4) trocar plano e definir preço personalizado por cliente. Preço, plano e regra de cobrança são decisão dele (manual, seção 15).
**Fase atual:** Modo Beta, B4: Pacote 1 e Pacote 2 (2a e 2b) aprovados com ressalvas; migrações de preços e de segurança do Sign prontas e testadas localmente (não aplicadas). Em andamento: Pacote 3 (plano, preço personalizado e cobrança no front).

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
| v2/P1 | 1 Base visual | sim | sim | sim | **Aprovada com ressalvas** | 1 |
| v2/P1 | 2 Menu e roteador | sim | sim | sim | **Aprovada com ressalvas** | 2 (1 reprovação: rota E-mails aberta por link) |
| v2/P1 | 3 a 10 (Início, listas, abas, fichas, fechamento) | `ficha-parte-1.md` | não | não | — | 0 |

## Próximo passo exato
1. Micro-spec e construção da seção 3 (Início por tarefa; `bo_dashboard`), incluindo A-022 e A-023; verificar; seguir `ficha-parte-1.md`.
2. Fase 2, Parte 1 "Navegação e organização" (sem regra de negócio): Ficha da Parte, depois micro-spec da seção "Menu e Início".
3. Em paralelo possível, só leitura: B0 completo (mapa de vínculos real) em `mapa-de-vinculos.md`.

## Bloqueios que dependem do Yuri
G1 (Ficha); D1 a D4 em `ficha-plataforma-v2.md`; D-01 (branch Supabase) para testar migrações de cobrança.
