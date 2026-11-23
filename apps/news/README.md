# Lottus News

Portal público de previsões do mercado e notícias, em **news.lottusfinance.com.br**. Página única (`index.html` + `app.js`) que lê do Supabase por RPCs públicas de leitura com a chave publicável.

- Rotas `/noticias`, `/materia/<slug>` e `/previsoes/<chave>` são reescritas para `index.html` (`_redirects` no Cloudflare Pages, `vercel.json` na Vercel).
- Cabeçalhos de segurança e CSP em `_headers` e em `vercel.json` (mantenha os dois iguais).
- Marca em `assets/` (PNGs oficiais).

## Publicar

Publique esta pasta como site estático com o domínio `news.lottusfinance.com.br`.
