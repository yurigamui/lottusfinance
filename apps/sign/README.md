# Lottus Sign — sign.lottusfinance.com.br

Site estático só com a assinatura e a verificação de documentos. Sem login e sem código do Partners.
Esta pasta já está completa: html, styles.css, _headers, js/ (assinar, verificar, pdfdoc, theme, config, vendor/) e img/.

## Publicar
1. Novo projeto no Cloudflare Pages apontando para esta pasta, domínio `sign.lottusfinance.com.br`.
2. Depois de no ar, acrescente no `js/config.js` do Partners: `signUrl: 'https://sign.lottusfinance.com.br/'`.
   A partir daí os links de assinatura e o rodapé dos PDFs usam o Lottus Sign. Antes disso eles continuam no Partners, que também tem as páginas.
3. No Supabase nada muda: a assinatura usa só funções públicas por token.
