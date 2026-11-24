# Prints do painel para o site

Geram `apps/site/img/sign-painel.webp`, `wealth-painel.webp` (1600x1000) a partir do front real
(`apps/sign`, `apps/wealth`), servido localmente com a CSP do `_headers`. Toda a rede é interceptada e respondida com
dados fictícios definidos nos próprios scripts; nada toca o Supabase de produção.

```bash
NODE_PATH=$(npm root -g) node scripts/prints/sign.cjs
NODE_PATH=$(npm root -g) node scripts/prints/wealth.cjs            # patrimonio e gastos
NODE_PATH=$(npm root -g) node scripts/prints/wealth.cjs patrimonio # só um
```

Requer Playwright/Chromium e Python com Pillow. Captura em 2x e reduz para 1600x1000 (webp, qualidade 82).
Se o formato das respostas das RPCs mudar, ajuste os dados em `sign.cjs` / `wealth.cjs`.
