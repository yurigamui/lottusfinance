# DECISOES: Site e páginas públicas

| Data | Decisão | Motivo | Quem decidiu |
| --- | --- | --- | --- |
| 2026-11-23 | Scripts inline de `ciencia.html`, `pagar.html` e das páginas legais movidos para `ciencia.js`, `pagar.js` e `lenis-init.js`; CSP do site passa a ter `script-src 'self'` | Padrão de segurança da Lottus (CSP estrita, sem script inline). Antes, a CSP do site não restringia scripts | Time (desenvolvedor), verificado no navegador com a CSP aplicada |
| 2026-11-23 | Não rodar `build.py`/`legal.py` e não preencher `[preencher]` | Geradores regrediriam o site; dados da empresa não podem ser inventados | Time |
