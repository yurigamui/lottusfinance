# Como contribuir

1. Leia o `CLAUDE.md` e o manual em `docs/manual-agente-desenvolvedor.md`: uma seção por vez, especificar → construir → verificar.
2. Crie uma branch a partir da `main`. Nunca faça push direto na `main` nem force push.
3. Commits pequenos, no formato `plataforma/seção: o que mudou` (ex.: `sign/verificar: mostra erro quando o código não existe`).
4. Antes de cada commit: `node scripts/check.mjs`. Para telas, também `node scripts/smoke.mjs <app>` (usa o Playwright instalado na máquina).
5. Banco: migração nova em `supabase/migrations/AAAAMMDDHHMMSS_assunto.sql`, com RLS, escrita só por RPC `SECURITY DEFINER` e `grant execute` explícito. Teste em branch do Supabase ou banco local; produção só com OK do Yuri.
6. Ao alterar JS ou CSS de uma app, troque o `?v=` nos `<script>`/`<link>` para invalidar o cache.
7. Abra o pull request com o modelo preenchido, dizendo o que não foi testado.

Nunca versione segredos, `.env`, dumps, planilhas de clientes ou dados reais. Use dados fictícios rotulados como exemplo.
