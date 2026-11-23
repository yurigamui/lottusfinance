# Relatório da plataforma: Site e páginas públicas (inclui News) · 23/11/2026

[MAESTRO] Modo Beta. Ambiente: arquivos locais + navegador (Playwright) com a CSP de cada `_headers` aplicada e rede externa bloqueada.

## Feito
- **CSP estrita** no site (antes: sem `script-src`) e no News (antes: sem CSP nenhuma; agora em `_headers` e em `vercel.json`). Scripts inline extraídos para arquivos (`ciencia.js`, `pagar.js`, `lenis-init.js`, `apps/news/app.js`).
- Verificado no navegador: `pagar.html`, `ciencia.html` e News carregam sem violação de CSP e mostram o estado de erro certo com link inválido ou sem rede. 7 páginas do site e a do News sem rolagem horizontal nem cortes de 320 a 1920 px (`scripts/smoke.mjs`).
- `apps/news/README.md` criado; aviso sobre os geradores no README do site.

## Pendências por severidade
- **Alta:** S-001 (`[preencher]` visível na home e nos textos legais).
- **Média:** S-002 (links de redes e lojas genéricos), S-003 (geradores desatualizados).
- **Baixa:** S-004 (formulário sem destino), S-005.

## Não testado
Formulário de contato real, `conectar/` dentro de um iframe de parceiro com câmera, chamadas reais às funções `pix-charge` e `cession-ack` (rede bloqueada de propósito), Lighthouse/LCP medidos em 4G.

## Depende do Yuri
CNPJ, endereço, encarregado e comarca (S-001); endereços das redes e das lojas (S-002); qual versão dos Termos é a vigente (S-003); destino do formulário (S-004); apontar a hospedagem para `apps/site` e `apps/news` (P-01).
