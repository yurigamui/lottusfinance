# STATUS: Lottus Wealth · atualizado em 23/11/2026

Modo: **Beta** (código gerado em 19/11, ainda não aplicado em produção nem testado em Postgres real) · Fase atual: **0 (linha de base)** · Parte atual: nenhuma · Seção atual: nenhuma

Leitura adotada: o Wealth entra em modo Beta; nada novo é construído antes da auditoria B0 a B5 (manual, seção 10).

## Painel

Todas as 21 páginas têm idealização no doc "Lottus Wealth — idealização página por página" e código gerado em `07 - Wealth`. Nenhuma foi verificada.

| Parte | Seção (página) | Especificada | Construída | Verificada | Veredito | Ciclos |
| --- | --- | --- | --- | --- | --- | --- |
| Entrada | 1. Entrar | sim | sim (não testada) | não | - | 0 |
| Entrada | 2. Criar conta | sim | sim (não testada) | não | - | 0 |
| Entrada | 3. Finalizar cadastro | sim | sim (não testada) | não | - | 0 |
| Carteiras | 4. Minhas carteiras | sim | sim (não testada) | não | - | 0 |
| Carteiras | 5. Nova carteira | sim | sim (não testada) | não | - | 0 |
| Patrimônio | 6. Patrimônio | sim | sim (não testada) | não | - | 0 |
| Investimentos | 7. Posição | sim | sim (não testada) | não | - | 0 |
| Investimentos | 8. Transações | sim | sim (não testada) | não | - | 0 |
| Investimentos | 9. Conexões (B3 e Open Finance "Em breve") | sim | parcial | não | - | 0 |
| Investimentos | 10. Ativos personalizados | sim | sim (não testada) | não | - | 0 |
| Investimentos | 11. Detalhe do ativo | sim | sim (não testada) | não | - | 0 |
| Gastos | 12. Visão geral | sim | sim (não testada) | não | - | 0 |
| Gastos | 13. Transações | sim | sim (não testada) | não | - | 0 |
| Gastos | 14. Importar extrato | sim | sim (não testada) | não | - | 0 |
| Gastos | 15. Cadastros e regras | sim | sim (não testada) | não | - | 0 |
| Relatórios | 16. Relatórios | sim | sim (não testada) | não | - | 0 |
| Acessos | 17. Acessos | sim | sim (não testada) | não | - | 0 |
| Carteira | 18. Configurações da carteira | sim | sim (não testada) | não | - | 0 |
| Conta | 19. Conta e plano | sim | sim (não testada) | não | - | 0 |
| Integração | 20. White-label e integração (Fund) | sim | sim (não testada) | não | - | 0 |
| Patrimônio | 21. Bens e dívidas | sim | sim (não testada) | não | - | 0 |

## Próximo passo

1. Fase 0: confirmar com o Yuri o modo Beta e o ambiente de teste.
2. B0: inventário real de `07 - Wealth`, da migração `20261119000000_wealth.sql` e das funções de borda `wealth-pu` e `wealth-api`; montar o Mapa de Vínculos real.
3. Criar um branch do Supabase, aplicar a migração só nele e rodar os testes de banco.
4. B1: auditar seção por seção, começando pela 1. Entrar, sem corrigir nada durante a auditoria.

## Bloqueios que dependem do Yuri

- Revisão jurídica: LGPD, guarda de dados, DPA, termos de uso e privacidade.
- Termos da B3 para o COTAHIST e formato de exportação da B3.
- Acesso ao Open Finance sem ser instituição autorizada.
- Validar faixas de AuM, mensalidade mínima e carência; decidir Grátis com 1 ou 3 carteiras.
- Confirmar `ENABLE ROW LEVEL SECURITY` em `public.legacy_gl_lines`.

## Últimas decisões

Ver `decisoes.md` (documento `claude/wealth-decisoes.md`).
