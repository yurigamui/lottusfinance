# DECISOES: Site e páginas públicas

| Data | Decisão | Motivo | Quem decidiu |
| --- | --- | --- | --- |
| 2026-11-23 | Scripts inline de `ciencia.html`, `pagar.html` e das páginas legais movidos para `ciencia.js`, `pagar.js` e `lenis-init.js`; CSP do site passa a ter `script-src 'self'` | Padrão de segurança da Lottus (CSP estrita, sem script inline). Antes, a CSP do site não restringia scripts | Time (desenvolvedor), verificado no navegador com a CSP aplicada |
| 2026-11-23 | Não rodar `build.py`/`legal.py` e não preencher `[preencher]` | Geradores regrediriam o site; dados da empresa não podem ser inventados | Time |
| 2026-11-24 | Leitura adotada do pedido do Yuri: molde do Partners (texto + arte + 3 checks + CTA) para todas as soluções, alternando o lado; os 3 cartões sob o Partners não são replicados. Partners mantém os seus cartões | "Pode tirar só os boxes" entendido como dispensáveis nas cópias; fácil de reverter | Time (sem supervisão) |
| 2026-11-24 | Só Partners e Sign entram na home. Wealth e Invest não ganham seção | Não há página pública aprovada; Invest não pode mostrar oferta em tela aberta (manual, seção 13) | Time; confirmar com o Yuri |
| 2026-11-24 | Arte do Sign usa a ilustração `.mock` (dados fictícios, legenda visível) em vez de print real | Não há print público do Sign; não inventar interface | Time |
| 2026-11-24 | SEO sem AggregateRating/avaliações e sem preço no JSON-LD além do plano grátis do Sign | Só publicar o que já está no site; sem dados falsos | Time |
| 2026-11-24 | Domínio canônico `https://lottusfinance.com.br` (de `depende-de-mim.md`, G-01) | Único domínio documentado do site | Time; confirmar se há `www` |
| 2026-11-24 | Corrigida regressão do upload a9a2883: scripts inline voltaram nas páginas legais, `pagar`, `ciencia`, `descadastrar`, e a CSP do `/*` ficou sem `script-src`. Scripts extraídos de novo, CSP estrita restaurada | Padrão de segurança; `check.mjs` reprovava | Time |
| 2026-11-24 | Rodapé: removido "CNPJ [preencher]" da home e de `precos.html`; fica "marca da Lottus Tecnologia LTDA". Pedido do Yuri. (Termos e Privacidade ainda têm `[preencher]`: S-001 reduzida a eles) | Não publicar campo em branco | Yuri |
| 2026-11-24 | Páginas de apresentação por solução em `lottusfinance.com.br/partners/` e `/sign/` (SEO concentrado em um domínio). Os subdomínios `partners.` e `sign.` seguem como o app (entrada, login, assinar, verificar). Evita dividir autoridade de busca e não move a entrada dos apps | Subdomínio conta como site separado para o Google; mover a entrada do app quebraria links já enviados por e-mail e o `signUrl` do Partners | Time; Yuri aprovou seguir com páginas dedicadas e perguntou sobre o subdomínio (recomendação aguarda resposta) |
