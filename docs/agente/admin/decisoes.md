# DECISÕES: Admin

| Data | Decisão | Motivo | Quem | Descartado |
| --- | --- | --- | --- | --- |
| 23/11/2026 | Pedido de evolução tratado como Admin v2, em partes; UX primeiro (reversível, sem regra de negócio), cobrança depois | Manual: enxuto primeiro; preço/plano exigem o Yuri | Maestro | Fazer tudo de uma vez |
| 23/11/2026 | Reaproveitar as RPCs `bo_billing_*`, `bo_sign_plan_save` e `bo_subscriptions` já existentes antes de criar novas | Regra 6 e "procure antes de criar" | Arquiteto/Maestro | Criar tabelas de plano novas |
| 23/11/2026 | Funções `w_admin_*` seguem só para service_role; Admin as acessa por wrappers `bo_w_*` com checagem de nível e `_staff_log` | Segurança por padrão | Maestro | Dar grant de `w_admin_*` a authenticated |
| 23/11/2026 | **D1: catálogo único de planos** (uma tabela de planos para Sign, Partners e Wealth + preço personalizado por cliente com validade e motivo) | Uma tela só; preço deixa de ficar espalhado | Yuri | Manter 4 mecanismos |
| 23/11/2026 | G1 adotado como aprovado para as Partes 1 e 2 (sem regra de negócio), pela resposta a D1; Partes 3 e 4 seguem travadas até D2 a D4 | Yuri respondeu D1 sem ressalvas à Ficha | Maestro (leitura mais razoável) | Esperar aprovação formal |
