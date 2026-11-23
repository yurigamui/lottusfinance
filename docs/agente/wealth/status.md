# STATUS: Lottus Wealth · atualizado em 23/11/2026

Modo: **Beta** · Fase atual: **B2/B4 (auditoria do banco e correções preparadas)** · Parte atual: Banco · Seção atual: nenhuma em construção

Leitura adotada (execução autônoma, 23/11): o front `07 - Wealth` e as funções de borda **não estão no repositório**, então B0 e B1 ficaram limitados ao banco. O banco de produção **já tem** as migrações `wealth_1` a `wealth_12` aplicadas (19/11) e 27 tabelas `w_`; a auditoria foi feita só com consultas de leitura. Correções saíram como migrações prontas, testadas em Postgres local, não aplicadas.

## Painel

Banco (auditado em 23/11, leitura): ver `relatorio.md`. Seção "Banco · integridade de cadastros, índices e _guard_delete": **Aprovada com ressalvas** (2 ciclos). Seção "Banco · RLS e helpers internos" (transversal): ver `docs/agente/repositorio/relatorio.md`.

As 21 páginas: código fora do repositório (`depende-de-mim.md`, D-02). Nenhuma pôde ser aberta nem verificada; todas ficam **bloqueadas** até o código chegar.

| Parte | Seção (página) | Especificada | Construída | Verificada | Veredito | Ciclos |
| --- | --- | --- | --- | --- | --- | --- |
| Entrada | 1. Entrar | sim | sim (fora do repo) | bloqueada | - | 0 |
| Entrada | 2. Criar conta | sim | sim (fora do repo) | bloqueada | - | 0 |
| Entrada | 3. Finalizar cadastro | sim | sim (fora do repo) | bloqueada | - | 0 |
| Carteiras | 4. Minhas carteiras | sim | sim (fora do repo) | bloqueada | - | 0 |
| Carteiras | 5. Nova carteira | sim | sim (fora do repo) | bloqueada | - | 0 |
| Patrimônio | 6. Patrimônio | sim | sim (fora do repo) | bloqueada | - | 0 |
| Investimentos | 7. Posição | sim | sim (fora do repo) | bloqueada | - | 0 |
| Investimentos | 8. Transações | sim | sim (fora do repo) | bloqueada | - | 0 |
| Investimentos | 9. Conexões (B3 e Open Finance "Em breve") | sim | parcial (fora do repo) | bloqueada | - | 0 |
| Investimentos | 10. Ativos personalizados | sim | sim (fora do repo) | bloqueada | - | 0 |
| Investimentos | 11. Detalhe do ativo | sim | sim (fora do repo) | bloqueada | - | 0 |
| Gastos | 12. Visão geral | sim | sim (fora do repo) | bloqueada | - | 0 |
| Gastos | 13. Transações | sim | sim (fora do repo) | bloqueada | - | 0 |
| Gastos | 14. Importar extrato | sim | sim (fora do repo) | bloqueada | - | 0 |
| Gastos | 15. Cadastros e regras | sim | sim (fora do repo) | bloqueada | - | 0 |
| Relatórios | 16. Relatórios | sim | sim (fora do repo) | bloqueada | - | 0 |
| Acessos | 17. Acessos | sim | sim (fora do repo) | bloqueada | - | 0 |
| Carteira | 18. Configurações da carteira | sim | sim (fora do repo) | bloqueada | - | 0 |
| Conta | 19. Conta e plano | sim | sim (fora do repo) | bloqueada | - | 0 |
| Integração | 20. White-label e integração (Fund) | sim | sim (fora do repo) | bloqueada | - | 0 |
| Patrimônio | 21. Bens e dívidas | sim | sim (fora do repo) | bloqueada | - | 0 |

## Próximo passo

1. Quando o código chegar em `apps/wealth/` (D-02): B0 do front (rotas, RPCs chamadas, Mapa de Vínculos real) e `node scripts/smoke.mjs wealth`.
2. Quando houver branch (D-01): aplicar `supabase/migrations/2026112312*.sql` no branch, rodar `supabase/tests/*.sql` contra o esquema real e as RPCs `w_spend_update`, `w_rule_save`, `w_spend_import`.
3. B1 seção por seção, começando por 1. Entrar.

## Bloqueios que dependem do Yuri

- Revisão jurídica: LGPD, guarda de dados, DPA, termos de uso e privacidade.
- Termos da B3 para o COTAHIST e formato de exportação da B3.
- Acesso ao Open Finance sem ser instituição autorizada.
- Validar faixas de AuM, mensalidade mínima e carência; decidir Grátis com 1 ou 3 carteiras.
- Confirmar `ENABLE ROW LEVEL SECURITY` em `public.legacy_gl_lines`.

## Últimas decisões

Ver `decisoes.md` (documento `claude/wealth-decisoes.md`).
