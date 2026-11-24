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
| A-010 | `list`: busca compara valor bruto, não o texto exibido (1.234,56 e dd/mm/aaaa não acham); oferecer `searchText` por coluna | Média | Dev | antes da 1ª tela usar `list` (seção 2) | verificação s1 (A1) |
| A-011 | Tela grande (≥2560): `.content` sem largura máxima, conteúdo estica; mudança compartilhada, exige reverificação geral | Média | Designer/Maestro | seção 10 | verificação s1 (A2) |
| A-012 | Abas em 320/360 sem indicação de rolagem interna | Baixa | Dev | seção 2 | s1 (A3) |
| A-013 | `skeleton(0)` devolve 5 linhas | Baixa | Dev | seção 2 | s1 (A4) |
| A-014 | Rastro da rota `#/_base` diz "Painel" | Baixa | Dev | seção 2 | s1 (A5) |
| A-015 | Borda do campo de busca com contraste <3:1 | Baixa | Dev | seção 2 | s1 (A6) |
| A-016 | `base-demo.js` vai a produção (inalcançável fora de admin); remover do index.html no fechamento da Parte 1 se o Yuri preferir | Baixa | Maestro | seção 10 | build s1 |
| A-017 | Duas barras de abas empilhadas em telas com abas internas (Quitações, Identidade, Crédito, Taxa); decisão de design, tratar na seção 5 | Média | Designer | seção 5 | verificação s2 (M3) |
| A-018 | Breakpoint do bloco mobile passou de 760 para 768 px (h1 24px, raio 24px em 761–768); aceito | Baixa | Dev | seção 10 | s2 (B1) |
| A-019 | Recolher « da lateral desktop nunca existiu (ícone sem uso); decidir se entra | Baixa | Designer | seção 10 | s2 (B2) |
| A-020 | Abas com role=tab sem setas; busca `text:true` não casa NBSP em "R$ 5"; foco após gaveta vai ao botão Menu | Baixa | Dev | seção 10 | s2 (B3, B4, B6) |
| A-021 | Ficha com id não UUID mostra barra de abas (ids reais são UUID) | Baixa | Dev | seção 6 | s2 (B5) |
| A-022 | `validDest` aceita `#//evil.com` (só vira hash e cai em painel; sem risco externo): exigir `^#/[A-Za-z0-9_-]` após `#/` | Baixa | Dev | seção 3 | s2 ciclo 2 (N1) |
| A-023 | Caixa de bloqueio: migalha ainda diz "Admin · Equipe/E-mails" e não há h1 | Baixa | Dev | seção 3 | s2 ciclo 2 (N2) |
| A-024 | Destino guardado em sessionStorage pode ser herdado por outro usuário na mesma aba (só hash, acesso validado por nível); limpar no login de outro usuário | Baixa | Dev | seção 10 | s2 ciclo 2 |
| A-025 | MFA e expiração por inatividade com restauração de destino só lidos no código; h1 do Motor não confirmado com fixture completa | Média | Verificador | com usuário de teste no branch (A-004) | s2 ciclo 2 |
