# STATUS: Site · atualizado em 24/11/2026
Modo: Beta · Fase: 3/4 (construção e verificação por seção) · Branch: `claude/funny-carson-f0lr9l`

## Painel
| Parte | Seção | Construída | Verificada | Veredito | Ciclos |
| --- | --- | --- | --- | --- | --- |
| Home | Soluções (Sign no molde do Partners) + SEO técnico | sim | sim | Aprovada com ressalvas | 1 |
| Páginas | `/partners/` e `/sign/` | sim | sim | Aprovada com ressalvas | 2 (contraste e alvos de 44 px corrigidos) |
| Páginas | `/wealth/` e `/invest/` (em breve) + seções na home + formulário | sim | sim | Aprovada com ressalvas (ciclo 1 reprovada: meta keywords do Invest; ciclo 2 aprovada) | 2 |
| Compartilhado | CSS de menu, rodapé e redes (44 px) | sim | sim (regressão em 7 páginas) | Aprovada com ressalvas | 1 |

## Próximo passo exato
0. Pull request da branch para a `main` aberto; merge e publicação são do Yuri (e dependem de S-014, revisão jurídica).
1. Decidido pelo Yuri (24/11): páginas em `lottusfinance.com.br/partners/` e `/sign/`; subdomínios seguem como app.
2. Depois: decidir S-007 (Wealth e Invest no site), S-001 (CNPJ, endereço, encarregado nos Termos e Privacidade) e, no lançamento, S-008 (Search Console, sitemap, Teste de Resultados Ricos, medir LCP/INP/CLS).
3. Não rodar `build.py` nem `legal.py` (S-009).

## Bloqueios que dependem do Yuri
S-001, S-002 (links de lojas e redes), S-004 (destino do formulário), S-007, S-010.

## Últimas decisões
Ver `decisoes.md` (24/11: molde do Partners, páginas por solução no domínio principal, CNPJ removido do rodapé, CSP restaurada).
