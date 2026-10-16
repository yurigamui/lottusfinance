# Lottus Partners

Site dos fundos parceiros, publicado em **partners.lottusfinance.com.br**. Cada representante vê só as operações enviadas ao fundo dele:

- **Para aprovar:** valores, sacados com rating, cedente com rating e documentos. "Aprovar" assina o aceite da cessão; "Recusar" passa a operação para o próximo fundo da fila.
- **A pagar:** pagamento ao cedente pela API (Asaas ou API do fundo) ou registro do pagamento feito.
- **Pagas** e **Todas**.

Entrada com e-mail, senha e segundo fator. Os convites saem do Admin (Partes → Fundos → Acesso). Login da equipe Lottus aqui é recusado com o aviso do endereço certo.

HTML, CSS e JavaScript puro, sem build. Usa o mesmo projeto Supabase do app e do Admin.

## Publicar

1. Publique esta pasta como site estático (Vercel, Netlify, Cloudflare Pages…) com o domínio `partners.lottusfinance.com.br`.
2. No DNS, crie `partners` como CNAME para o endereço que a hospedagem indicar.
3. No Supabase → Authentication → URL Configuration, acrescente `https://partners.lottusfinance.com.br/**` em Redirect URLs.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `js/config.js` | Projeto Supabase e endereços |
| `js/core.js` | Conexão, formatação, avisos, arquivos |
| `js/ui.js` | Títulos, abas e listas |
| `js/portal.js` | Lista e detalhe das operações, aprovar, recusar, pagar |
| `js/app.js` | Login, segundo fator, menu e navegação |
