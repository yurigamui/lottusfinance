# DECISÕES: Admin

| Data | Decisão | Motivo | Quem | Descartado |
| --- | --- | --- | --- | --- |
| 23/11/2026 | Pedido de evolução tratado como Admin v2, em partes; UX primeiro (reversível, sem regra de negócio), cobrança depois | Manual: enxuto primeiro; preço/plano exigem o Yuri | Maestro | Fazer tudo de uma vez |
| 23/11/2026 | Reaproveitar as RPCs `bo_billing_*`, `bo_sign_plan_save` e `bo_subscriptions` já existentes antes de criar novas | Regra 6 e "procure antes de criar" | Arquiteto/Maestro | Criar tabelas de plano novas |
| 23/11/2026 | Funções `w_admin_*` seguem só para service_role; Admin as acessa por wrappers `bo_w_*` com checagem de nível e `_staff_log` | Segurança por padrão | Maestro | Dar grant de `w_admin_*` a authenticated |
| 23/11/2026 | **D1: catálogo único de planos** (uma tabela de planos para Sign, Partners e Wealth + preço personalizado por cliente com validade e motivo) | Uma tela só; preço deixa de ficar espalhado | Yuri | Manter 4 mecanismos |
| 23/11/2026 | G1 adotado como aprovado para as Partes 1 e 2 (sem regra de negócio), pela resposta a D1; Partes 3 e 4 seguem travadas até D2 a D4 | Yuri respondeu D1 sem ressalvas à Ficha | Maestro (leitura mais razoável) | Esperar aprovação formal |
| 23/11/2026 | Parte 1 aprovada para construção em 10 seções (ficha-parte-1.md); Indicações dentro de Taxa; limite de 12 itens só para ativos | Proposta do designer; reversível | Maestro | Menu com 14 itens |
| 24/11/2026 | Modo sem supervisão: D2 (mensal, dia 10, pós-pago), D3 (carência 15 dias, depois lembrete e fila Em atraso, sem bloqueio automático), D4 (aprovador até 20% de desconto, acima só admin; motivo e validade obrigatórios) adotadas como **hipóteses configuráveis** | Yuri ordenou terminar sem perguntas; usa valores que já estão no banco, nada inventado | Maestro | Parar a Parte 4 |
| 24/11/2026 | Fases 6 e 7 produzem pacote de release (migrações testadas em Postgres local, plano de reversão, roteiro de 5 min); aplicação em produção e publicação NÃO são feitas pelo time | Regra 12 do manual e do CLAUDE.md: produção só com OK explícito | Maestro | Aplicar em produção |
| 25/11/2026 | Adotar a versão reformulada do Admin (f55fa8f) como base; descartar app.js/views.js/index.html da Parte 1 antiga (seções 1 a 3) e reaproveitar só `ui.js`; Modo Beta nela | A "demo" do pedido é essa versão; refazer menu em cima do app antigo duplicaria o que o Yuri já entregou | Maestro | Fundir as duas versões de app.js (quebra) |
| 26/11/2026 | Remover "Oferecer upgrade" de Produtos › Sign (1 ação por linha: Ficha; tarefa continua em Mais ações da ficha) | Meta de no máximo 1 botão principal por tela e 30 primários eram ruído | Maestro | Manter o botão como secundário |
