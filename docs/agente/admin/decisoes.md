# DECISÕES: Admin

| Data | Decisão | Motivo | Quem | Descartado |
| --- | --- | --- | --- | --- |
| 23/11/2026 | Pedido de evolução tratado como Admin v2, em partes; UX primeiro (reversível, sem regra de negócio), cobrança depois | Manual: enxuto primeiro; preço/plano exigem o Yuri | Maestro | Fazer tudo de uma vez |
| 23/11/2026 | Reaproveitar as RPCs `bo_billing_*`, `bo_sign_plan_save` e `bo_subscriptions` já existentes antes de criar novas | Regra 6 e "procure antes de criar" | Arquiteto/Maestro | Criar tabelas de plano novas |
| 23/11/2026 | Funções `w_admin_*` seguem só para service_role; Admin as acessa por wrappers `bo_w_*` com checagem de nível e `_staff_log` | Segurança por padrão | Maestro | Dar grant de `w_admin_*` a authenticated |
