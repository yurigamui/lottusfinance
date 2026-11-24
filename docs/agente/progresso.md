# Progresso do time autônomo Lottus

Atualizado em 23/11/2026. Branch git: `agentes-autonomo` (enviada ao GitHub; cópia em `claude/blissful-dijkstra-mw332a`).

## Plano (5 linhas)
1. Repositório público: varrer segredos e dados de negócio primeiro (histórico incluído), depois organizar em `apps/<plataforma>`, `docs/`, `scripts/`, `supabase/migrations`, com `git mv`.
2. Criar a base de verificação sem dependências (`scripts/check.mjs`, `scripts/smoke.mjs`, `scripts/test-db.sh`) e o CI gratuito; rodar antes de cada commit.
3. Wealth (Beta): inventário real (código e banco, só leitura), auditoria transversal e migrations de correção prontas em `supabase/migrations`, sem aplicar.
4. Partners e Sign → Admin → Invest → Site e API: auditoria por seção (11 blocos), correções de bloqueante/alto, pendências e decisões registradas.
5. Ao fim de cada plataforma: relatório, repetição da frente de repositório e atualização deste arquivo; no fim, `docs/agente/resumo-final.md`.

## Pronto
- **Repositório:** reorganizado, limpo, CSP estrita em todos os fronts, CI, documentação. Relatório: `repositorio/relatorio.md`.
- **Wealth (concluído no ambiente local, 23/11):** front enviado pelo Yuri, testado contra as funções reais (`scripts/wealth-local`); 9 partes aprovadas (4 com ressalvas) em 5 ciclos do verificador; 4 achados altos de front, 2 de banco e 1 de segurança (CSV) corrigidos; 2 migrações novas (123000 posição, 124000 ativos da carteira). Falta: decisões do Yuri, branch e publicação. `wealth/relatorio.md`.
- **Banco transversal:** migração de RLS/helpers **aprovada com ressalvas**.
- **Admin:** RPC que faltava criada (**aprovada com ressalvas**, 2 ciclos). `admin/relatorio.md`.
- **Site e News:** CSP e scripts corrigidos; pendências de conteúdo. `site/relatorio.md`.
- **Sign:** sem achados nas 3 páginas públicas. `sign/relatorio.md`.
- **Invest:** banco conferido; app fora do repo → bloqueado. `invest/relatorio.md`.
- **API:** 3 de 22 funções sem JWT lidas e corretas; 19 não avaliadas. `api/relatorio.md`.

- **Partners:** injeção de HTML corrigida (**aprovada com ressalvas**, 2 ciclos); 192 RPCs conferidas. `partners/relatorio.md`.

## Em andamento
- Nada. **Wealth v2 e v3 concluídas (24/11); migrações aplicadas em produção com OK do Yuri; funções de borda novas aguardam OK para publicar**: ver `wealth/status.md`. Todo o restante está bloqueado por itens de `depende-de-mim.md` (ver `resumo-final.md`).

## Próximo passo exato (para "retome")
1. Se o branch do Supabase existir (D-01): aplicar `supabase/migrations/*.sql` no branch, nesta ordem, rodar `supabase/tests/*.sql` e os testes de `scripts/wealth-local/testes/` contra ele; ler os advisors.
2. Se o código do Invest e das funções de borda chegar (D-02): Fase 0 do Invest e leitura das 19 funções de borda restantes (API-02). O mesmo ambiente local (`scripts/wealth-local`) serve de modelo para testar outras plataformas.
3. Com usuários de teste no branch (2e): auditar as telas logadas do Partners (10 áreas) e do Admin, seção por seção.
