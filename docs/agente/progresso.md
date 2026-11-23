# Progresso do time autônomo Lottus

## Plano (5 linhas)
1. Repositório público: varrer segredos e dados de negócio primeiro (histórico incluído), depois organizar em `apps/<plataforma>`, `docs/`, `scripts/`, `supabase/migrations`, com `git mv`.
2. Criar a base de verificação sem dependências (`scripts/check.mjs`: sintaxe JS, links locais, CSP sem script inline, segredos) e o CI gratuito; rodar antes de cada commit.
3. Wealth (Beta): inventário real (código e banco, só leitura), auditoria transversal e migrations de correção prontas em `supabase/migrations`, sem aplicar.
4. Partners e Sign → Admin → Invest → Site e API: auditoria por seção (11 blocos), correções de bloqueante/alto, pendências e decisões registradas.
5. Ao fim de cada plataforma: relatório, repetição da frente de repositório e atualização deste arquivo; no fim, `docs/agente/resumo-final.md`.

## Estado
- Em andamento: frente de repositório.
