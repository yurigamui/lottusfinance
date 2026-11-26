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
| A-022 | (corrigido na seção 3, aguarda verificação) `validDest` aceita `#//evil.com` (só vira hash e cai em painel; sem risco externo): exigir `^#/[A-Za-z0-9_-]` após `#/` | Baixa | Dev | seção 3 | s2 ciclo 2 (N1) |
| A-023 | (corrigido na seção 3, aguarda verificação) Caixa de bloqueio: migalha ainda diz "Admin · Equipe/E-mails" e não há h1 | Baixa | Dev | seção 3 | s2 ciclo 2 (N2) |
| A-024 | Destino guardado em sessionStorage pode ser herdado por outro usuário na mesma aba (só hash, acesso validado por nível); limpar no login de outro usuário | Baixa | Dev | seção 10 | s2 ciclo 2 |
| A-025 | MFA e expiração por inatividade com restauração de destino só lidos no código; h1 do Motor não confirmado com fixture completa | Média | Verificador | com usuário de teste no branch (A-004) | s2 ciclo 2 |
| A-026 | **Merge d9c988e quebrou o Admin**: `apps/admin/js/app.js` tem `NAV_GROUPS` declarado duas vezes (erro de sintaxe; `check.mjs` e `smoke.mjs admin` falham) e `index.html` carrega um segundo bloco de scripts/estilos de outra versão do Admin (inclusive `painel.js`, que sobrescrevia `views.painel`). Seção 3 removeu só a linha `js/painel.js`; resolver o merge (manter a versão de 11f999d ou decidir o que de `main` entra) | Alta | Maestro/Yuri | antes da verificação da seção 3 | build s3 |
| A-026 | Merge d9c988e deixou app.js com NAV_GROUPS duplicado (Admin não carregava): resolvido em 25/11 restaurando a versão do Yuri (f55fa8f) | Alta (resolvida) | Maestro | — | merge |
| A-027 | Arquivos do Admin antigo sem uso na nova index (operations.js, credit*.js, pricing.js, growth.js, legal.js, receipt.js, notices.js, verify.js, api-partners.js, dashboard.js, portal.js, reports.js?, base-demo.js): confirmar o que a versão nova ainda carrega e mover o restante para `_revisar/` (não apagar) | Média | Maestro | Parte 1 | replanejamento |
| A-028 | Régua `_bill_reminders_run` só cobre faturas com `org_id` em `one_orgs` com `remind_enabled`; faturas automáticas (taxa de plataforma e Sign) têm `org_id` nulo e NÃO recebem lembrete. Decidir: régua cobrir `org_id` nulo (usando `billing_settings.remind_enabled`) ou atribuir org às faturas | Alta | Arquiteto | Parte 4 (antes de aplicar) | migração planos/preços |
| A-029 | Migração `20261125120000` nunca rodou contra o banco real: comparar `_platform_fee_run`, `_plan_fee`, `_staff` com produção; validar `customer_email` nulo nas faturas do Sign (sign_accounts não tem e-mail); `w_billing_close` passar a usar `_w_price_for`; job pg_cron | Alta | Yuri (D-01 branch) | antes do release | migração planos/preços |
| A-101 | (B1 A-01) Menu mobile inexistente (≤768 px) | **Bloqueante** | Dev | Pacote 1 | relatorio-b1 |
| A-102 | (B1 A-02) Fuso UTC em faturamento/comercial/financeiro | Alta | Dev | Pacote 1 | relatorio-b1 |
| A-103 | (B1 A-03) Hash `/new` reabre modal após salvar | Alta | Dev | Pacote 1 | relatorio-b1 |
| A-104 | (B1 A-04) Rotas admin:true abertas por link; escrita visível sem nível; token no DOM; conferir RPCs no servidor | Alta | Dev + Auditor | Pacote 1 | relatorio-b1 |
| A-105 | (B1 A-05) Preço personalizado/plano sem motivo, validade, alçada, confirmação | Alta | Dev | Pacote 3 (usa migração 20261125120000) | relatorio-b1 |
| A-106 | (B1 A-06..A-19) Médios do relatório B1 (corrida, listas, alvos, modal, validações, rotas mortas) | Média | Dev | Pacotes 1 e 2 | relatorio-b1 |
| A-107 | (B1 A-20..A-24) Baixos do relatório B1 | Baixa | Dev | Pacote 2 | relatorio-b1 |
| A-030 | Migração de preços: correções M1 a M3/B1/B2/B4 do verificador aplicadas (134 de 134 no local); falta reverificação independente das mudanças e teste de concorrência (B3) | Média | Verificador | Fase 6 | verificação da migração |
| A-031 | **Segurança (servidor):** `sign_messaging_save`, `sign_root_add` e `sign_root_toggle` só checam `is_staff()` (qualquer nível, sem MFA, sem `_staff_log`): um analista pode trocar o token de WhatsApp (Vault) e as raízes de confiança do Sign. Corrigir com wrapper `_staff('admin')` + log (migração nova) | Alta (corrigida em migração `20261126120000`, 24 de 24 local; assinaturas reais conferidas em produção: jsonb, p_id uuid; NÃO aplicada) | Arquiteto/Dev | aplicar no release | auditoria do Pacote 1 |
