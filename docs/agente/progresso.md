# Progresso do time autônomo Lottus

Atualizado em 23/11/2026. Branch git: `agentes-autonomo` (**ainda não enviada ao GitHub**: push recusado com 403, ver `depende-de-mim.md` G-04).

## Plano (5 linhas)
1. Repositório público: varrer segredos e dados de negócio primeiro (histórico incluído), depois organizar em `apps/<plataforma>`, `docs/`, `scripts/`, `supabase/migrations`, com `git mv`.
2. Criar a base de verificação sem dependências (`scripts/check.mjs`, `scripts/smoke.mjs`, `scripts/test-db.sh`) e o CI gratuito; rodar antes de cada commit.
3. Wealth (Beta): inventário real (código e banco, só leitura), auditoria transversal e migrations de correção prontas em `supabase/migrations`, sem aplicar.
4. Partners e Sign → Admin → Invest → Site e API: auditoria por seção (11 blocos), correções de bloqueante/alto, pendências e decisões registradas.
5. Ao fim de cada plataforma: relatório, repetição da frente de repositório e atualização deste arquivo; no fim, `docs/agente/resumo-final.md`.

## Pronto
- **Repositório:** reorganizado, limpo, CSP estrita em todos os fronts, CI, documentação. Relatório: `repositorio/relatorio.md`.
- **Wealth:** banco auditado (só leitura); migração de integridade **aprovada com ressalvas** (2 ciclos). Front fora do repo → telas bloqueadas. `wealth/relatorio.md`.
- **Banco transversal:** migração de RLS/helpers **aprovada com ressalvas**.
- **Admin:** RPC que faltava criada (**aprovada com ressalvas**, 2 ciclos). `admin/relatorio.md`.
- **Site e News:** CSP e scripts corrigidos; pendências de conteúdo. `site/relatorio.md`.
- **Sign:** sem achados nas 3 páginas públicas. `sign/relatorio.md`.
- **Invest:** banco conferido; app fora do repo → bloqueado. `invest/relatorio.md`.
- **API:** 3 de 22 funções sem JWT lidas e corretas; 19 não avaliadas. `api/relatorio.md`.

## Em andamento
- **Partners:** correção de injeção de HTML (subtítulos e confirmação de Pix) em reverificação (ciclo 2).

## Próximo passo exato (para "retome")
1. `git push -u origin agentes-autonomo` (depois do G-04).
2. Se o branch do Supabase existir (D-01): aplicar `supabase/migrations/*.sql` no branch, nesta ordem, e rodar `supabase/tests/*.sql` contra ele; ler os advisors.
3. Se o código do Wealth/Invest/funções chegar (D-02): B0 do front do Wealth (`node scripts/smoke.mjs wealth`) e leitura das 19 funções de borda restantes (API-02).
4. Com usuários de teste no branch (2e): auditar as telas logadas do Partners (10 áreas) e do Admin, seção por seção.
