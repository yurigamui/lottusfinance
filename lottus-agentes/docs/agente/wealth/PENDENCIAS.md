# PENDENCIAS: Lottus Wealth

Origem: documentos do Projeto (lottus-wealth e vinculos-wealth). Severidade "a classificar" significa que o Verificador define na auditoria. Dono padrão: Yuri, salvo indicação.

| ID | Descrição | Severidade | Dono | Prazo | Origem |
| --- | --- | --- | --- | --- | --- |
| W-001 | Migração `20261119000000_wealth.sql` e funções `wealth-pu` e `wealth-api` não foram aplicadas em produção nem testadas em Postgres real; rodar primeiro em branch | Alta | Agente (branch) e Yuri (OK) | antes de qualquer publicação | lottus-wealth |
| W-002 | Gateway de pagamento: hoje o plano é definido por `w_admin_set_plan` pelo backend | a classificar | Yuri | a definir | lottus-wealth |
| W-003 | B3 Área do Investidor e Open Investment aparecem como "Em breve" | a classificar | Yuri | a definir | lottus-wealth |
| W-004 | COTAHIST desligado até confirmar os termos de uso da B3 | a classificar | Yuri / jurídico | a definir | lottus-wealth |
| W-005 | Rentabilidade ponderada (cota) não implementada | a classificar | Agente | a definir | lottus-wealth |
| W-006 | Importação de XLSX não implementada | a classificar | Agente | a definir | lottus-wealth |
| W-007 | Páginas de termos de uso e privacidade ainda por criar | Alta | Yuri / jurídico | antes do lançamento | lottus-wealth |
| W-008 | DPA e revisão LGPD (guarda de dados, controlador e operador) | Alta | jurídico | antes do lançamento | lottus-wealth |
| W-009 | Acesso ao Open Finance sem ser instituição autorizada | a classificar | Yuri / jurídico | a definir | lottus-wealth |
| W-010 | Formato de exportação da B3 e termos das cotações | a classificar | Yuri | a definir | lottus-wealth |
| W-011 | Tratamento de proventos na v1 | a classificar | Yuri | a definir | lottus-wealth |
| W-012 | Validar faixas de AuM, mínimo de R$ 200 e carência de 10 dias | Média | Yuri | a definir | lottus-wealth |
| W-013 | Decidir se o Grátis tem 1 ou 3 carteiras | Média | Yuri | a definir | lottus-wealth |
| W-014 | Decidir Centro de Custo e Grupo como eixos independentes | Média | Yuri | a definir | lottus-wealth |
| W-015 | Confirmar 90 dias de guarda de relatórios e 12 meses para "Valor antigo" (sugestões) | Baixa | Yuri | a definir | lottus-wealth |
| W-016 | `public.legacy_gl_lines` sem RLS (2.391 linhas): ativar RLS | Bloqueante | Yuri (OK) | antes do lançamento | vinculos-wealth |
| W-017 | Duplicidade de cadastros: tratar `profiles` como mestre de pessoa e `companies` como mestre de empresa; unicidade por CPF e CNPJ normalizado | Alta | Agente | a definir | vinculos-wealth |
| W-018 | Banco e custodiante em texto livre em várias tabelas: trocar por referência a `w_banks` e `w_custodians` | Média | Agente | a definir | vinculos-wealth |
| W-019 | Tabela única de endereços reutilizada por cobrança, contratos e assinatura | Média | Agente | a definir | vinculos-wealth |
| W-020 | Tabelas gêmeas (`crm_leads` e `lottus_crm_leads`, `bill_invoices` e `lottus_bill_invoices`, `fin_accounts` e `lottus_fin_accounts`, `mkt_*` e `lottus_mkt_*`): confirmar qual está em uso | Média | Agente (relato) e Yuri (OK) | a definir | vinculos-wealth |
| W-021 | LGPD: o Wealth não deve expor CPF a quem apenas visualiza; documentar a finalidade de cada uso do mesmo dado | Alta | Agente e jurídico | a definir | vinculos-wealth |
