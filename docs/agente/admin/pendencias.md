# PENDÊNCIAS: Admin

| ID | Descrição | Sev. | Dono | Prazo | Origem |
| --- | --- | --- | --- | --- | --- |
| A-001 | Aplicar migração NF-e manual após teste no branch | Alta | Yuri (D-01) | — | relatorio.md |
| A-002 | Modal da conferência sem `<form>`; erro vai ao toast | Baixa | Dev | v2 | relatorio.md |
| A-003 | 320 px: toast cobre título do modal; select longo cortado | Baixa | Dev | v2 | relatorio.md |
| A-004 | Telas logadas (cadastros, crédito, jurídico, controle, crescimento) não auditadas | Alta | Verificador | após usuário de teste no branch | relatorio.md |
| A-005 | Menu "Configurações" mistura 6 itens sem relação; páginas com informação demais | Média | Designer | Parte 1 | pedido do Yuri |
| A-006 | Não há tela de planos, assinaturas, faturas nem preço personalizado, apesar das RPCs `bo_billing_*` | Alta | Dev | Parte 3 | B0 |
| A-007 | Tabelas gêmeas `bill_invoices` / `lottus_bill_invoices` (0 linhas): descobrir a em uso e propor remoção da outra | Média | Arquiteto | Parte 3 (precisa OK do Yuri para apagar) | B0 |
| A-008 | `w_admin_set_plan` e `w_admin_invoice_paid` sem acesso do Admin | Alta | Arquiteto | Parte 3 | B0 |
| A-009 | Fonts do Google carregadas por CDN no `index.html` (contraria "sem CDN"; confirmar com a CSP do `_headers`) | Média | Dev | Parte 1 | B0 |
