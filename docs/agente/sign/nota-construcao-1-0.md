# Nota de construção: Sign / 1.0 Shell da área logada + correções da 1.1
26/11/2026 · Desenvolvedor. Nada em produção, nada commitado, nada declarado verificado (o veredito é do `verificador`).

## Feito
- **Shell** (`js/views/shell.js`, novo): `div.shell > aside.sidenav + div.frame > div.surface > header.topbar + .shell-notice + .content#view`, por DOM, sem `innerHTML`. Menu por tabela `NAV` (só `built:true`: Documentos e Conta), skip link `button.sr-only.skip-link`, topbar com logo PNG, nome, nível e avatar com menu (Conta, Sair; Esc, clique fora e Tab para fora fecham). O nó `.shell` permanece entre rotas privadas; só `#view` troca. Onboarding usa shell reduzido (`.sidenav.minimal`, sem itens).
- **Nível e nome** (decisão de 25/11): nome de `sign_me.name` (fallback no e-mail); nível derivado: `cert.not_after` futuro = Qualificada, `verified` = Avançada, senão Simples. Iniciais: 1ª letra da 1ª e da última palavra.
- **`lib/ui.js`** (só acrescentado): `icon`/`ICON` (SVG por DOM), `toast`, `modal`, `confirm`, `pageHead`, `emptyState`, `loading`, `STATUS`, `statusTag`.
- **Telas provisórias** (`views/construcao.js`): públicas como antes (`.sg-single`); privadas dentro do shell (`privadas`: documentos, envio, plano, conta com abas, onboarding, naoencontradaApp).
- **Roteador**: `ensureShell`/`releaseShell`, `hold`/`release`, `currentHash()` ignora hash que não começa com `#/` (B-1), `afterLogin` com replace (M-1).
- **Correções da 1.1**: M-1, M-3 (alerta e botão permanecem; "Reenviar em N s"), B-1 (`processAuthHash` no carregamento e em `hashchange`, listener antes do `router.start()`), B-2 (texto neutro `invalido`), B-3 (`aria-pressed`), T-09 (`modulepreload` dos 8 módulos), `100dvh` (`.shell`, `.modal`, `.auth`, `.auth-main`).
- **CSS**: `.shell`/`.modal`/`.auth` editados no lugar (dvh); bloco novo no fim, comentado "importado do Wealth (seção 1.0)", com as regras literais do Wealth e depois as regras novas. Nenhuma regra `.sg-*` tocada.
- **Versão `?v=20261125a`** em todos os imports, `modulepreload`, `app.js`, `styles.css` (index, assinar, verificar). `config.js` e `theme.js` não mudaram e mantêm a versão.
- **HTML**: `index.html` ganhou `#toast-root` (`aria-live=polite`) e `#modal-root`; markup de `main#sign` intacto.

## Arquivos
Alterados: `apps/sign/{index.html,assinar.html,verificar.html,styles.css}`, `js/app.js`, `js/lib/{router.js,ui.js}`, `js/views/{construcao.js,entrar.js}`. Novo: `js/views/shell.js`.
Testes: `scripts/sign-local/testes/` novos `t-shell.cjs` (AC1-8, 21-25, 28 e estado de erro), `t-comp.cjs` (AC9-13), `t-corr.cjs` (AC14-20, 26, CLS, INP), `t-regressao.cjs` + `cmp-capturas.py` (AC27); alterados `fake-sign.cjs` (sign_me com `name`, `cert`, `verified`; modos `meName`, `meNoName`, `meVerified`, `meCert`, `meCertVencido`, `meDown`), `lib.cjs` (`logged`, `VER`), `drv.cjs` (`SIGN_APP` e `SIGN_GZIP`), `medir.cjs` (5 execuções, `N` por ambiente).
Registro: `pendencias.md` (PEND-1.0-a a f) e `decisoes.md`.

## Testado (local, contra o Supabase falso, Chromium via Playwright)
| Comando | Resultado |
| --- | --- |
| `node scripts/check.mjs` | 332 arquivos, 0 erro, 0 aviso (os 6 erros antigos de `apps/site` não apareceram nesta execução) |
| `node scripts/smoke.mjs sign` | nenhum problema (index, assinar, verificar x 7 larguras) |
| `t-ac.cjs` (1.1) | 96 de 96 |
| `t-layout.cjs` (1.1) | 99 de 99 |
| `t-shell.cjs` | 183 de 183 |
| `t-comp.cjs` | 63 de 63 |
| `t-corr.cjs` | 45 de 45 |

Ajustes em `t-ac.cjs` obrigados pela spec 1.0 (nada além): onboarding agora é "Primeiros passos" com Sair pelo avatar; Sair da tela provisória passa pelo menu do avatar; título de `#/documentos` é "Documentos · Lottus Sign"; o teste de `aria-live` aceita `#toast-root`. `t-layout.cjs` não mudou.

**AC27 (regressão):** `t-regressao.cjs` captura Entrar, Criar com erro, "Confirme seu e-mail", link vencido, `assinar.html` e `verificar.html` em 320, 360, 390, 768, 1280 e 1920 (36 capturas), "antes" = `git archive HEAD` servido via `SIGN_APP`, "depois" = árvore atual. Resultado: idênticas pixel a pixel em 3 de 4 execuções; em 1 execução, 1920-3-confirme diferiu em 45 pixels com desvio máximo 4 em 765 (ruído de renderização; não reproduziu). O "antes" é idêntico a si mesmo em 3 execuções. `t-layout.cjs` (capturas antigas com tema escuro) mostrou diferenças só no escuro, também entre duas execuções do mesmo código (transição de cor após trocar o tema), por isso a comparação válida é a do `t-regressao`. Especificidade conferida: `.sg-card h1` continua vencendo o `h1 { font-size: 24px }` do media 760 (capturas iguais).

**Desempenho (AC19):**
| Ambiente (1,6 Mbps, 150 ms, mediana de 5) | Antes | Depois |
| --- | --- | --- |
| servidor de teste sem compressão | 1751 ms | **1595 ms** |
| com gzip (como o Cloudflare Pages) | 1030 ms | **823 ms** |
| localhost sem limite | 115 ms | 125 ms |

JS do app (8 módulos, sem vendor): 48,7 kB brutos, **18,0 kB gzip** (antes 29,2 / 11,0; limite 70 kB). 8 módulos pedidos 1 vez cada (sem requisição duplicada). **A meta de 1 s só é atingida com compressão; sem compressão não é (1595 ms).** O gargalo é banda (vendor 111 kB + CSS 68 kB + JS 49 kB, sem gzip), não cascata; agrupar módulos economizaria pouco e não foi implementado. Decisão registrada em PEND-1.0-c para o Maestro.
CLS ao montar o shell: 0,08 (390) e 0,05 (1280); limite 0,1. INP do menu do avatar: pior evento 16 ms (resolução do Event Timing), limite 200 ms.

**Contraste (AC13):** os 7 selos e os 3 `.banner` passam com 4,60 a 12,37 no claro. Antes do ajuste três falhavam (`.tag.brand` 4,25; `.tag.success` 4,47; `.banner.info` 4,25).

## NÃO testado
- Produção, Supabase real, Auth real, e-mail real, `sign_me` real (só o falso: `name`, `cert`, `verified` são suposição do formato descrito em `parte-1-arquitetura.md`).
- Firefox, Safari e dispositivos reais; teclado virtual real (simulado só por redução da janela, 390x500 e 1280x500; `visualViewport` não foi emulado de verdade).
- Leitor de tela real (NVDA, VoiceOver); só atributos ARIA e ordem de foco.
- Compressão em produção (assumida pelo Cloudflare Pages; medi com gzip local).
- Tema escuro (forçado a claro por `theme.js`); contraste no escuro só informativo (impresso por `t-comp.cjs`).
- Zoom de 200% por escala do navegador real; simulado por viewport pela metade e `deviceScaleFactor` 2 (320 e 1280).
- Folha inferior do celular (fora do escopo, UX-02) e os 12 itens de menu (não se aplica).

## Decisões e dúvidas (para o Maestro)
1. **Foco no 1º carregamento:** o roteador não chama `focusH1` na primeira rota privada da página (para o primeiro Tab cair no skip link, AC8). Nas navegações o foco vai ao h1 (AC3, AC25). Se o verificador preferir foco no h1 sempre, o AC8 só passa com o teste partindo do clique no corpo.
2. **Toast no canto inferior direito**, não no superior como no Wealth: no superior ele cobria o avatar e o "Sair" (um teste de clique no avatar falhou por isso). PEND-1.0-e.
3. **Contraste:** só a cor do texto de três classes foi escurecida (`color-mix` com `--ink`), no Sign. PEND-1.0-d.
4. **Aviso de erro do `sign_me`** fica em `div.shell-notice` (fora de `#view`) com `.banner.danger` e "Tentar de novo" (`aria-busy` ao tentar). Sem `role=alert` porque a regra do AC25 limita `aria-live` ao `#toast-root` e à 1.1; o aviso, portanto, não é anunciado sozinho.
5. **"E-mail confirmado. Entre para continuar."** deixou de existir: com a sessão realmente aberta o link leva a Onboarding (ou Documentos se `onboarding_done`); sem sessão, o texto neutro `invalido`. Com sessão aberta, mostrar "Entre para continuar" seria contraditório; a condição "só quando a sessão abriu e não há onboarding" é inalcançável porque Entrar redireciona quem tem sessão.
6. **Nível sem `level`:** `.org-sub` mostra sempre o nível derivado (Simples quando não há `cert` nem `verified`), mesmo sem nome; a hipótese da spec de ocultar `.org-sub` sem o campo ficou superada pela decisão de 25/11. Certificado vencido com `verified` cai em Avançada.
7. **Textos que a spec não fixou:** `emptyState` das telas provisórias usa só o título "Esta área está em construção." (sem parágrafo); "Página não encontrada" usa "Esta página não existe." como título do vazio. Sem `[preencher]`.
8. **`modal()` devolve `el` = o `.modal[role=dialog]`** (não o fundo). Extras opcionais: `onClose` no `modal()`. O fundo (`#sign`) fica `inert` enquanto há modal. O corpo do modal rola por dentro e ganha `tabindex=0` só se rolar.
9. **Topbar:** o logo da topbar é `a.org-link` com `tabindex=-1` (clicável com o mouse; o teclado usa a marca da faixa), para a ordem de Tab do AC8 não ganhar uma parada redundante.
10. **Foco da navegação ativa:** acrescentei `.nav-sec:focus-within .nav-btn.active:focus-visible` porque a regra herdada do Wealth sobrescrevia o anel de foco do item ativo.
11. **Largura máxima:** em vez de `.content > * { max-width }`, o `.content` ganhou `padding-inline: max(40px, calc((100% - 1200px) / 2))` a partir de 761 px (centraliza em 1920 e 2560 sem desalinhar as abas inline).
12. **Zoom 200% em 320** (largura útil de 160 px): regras novas em `@media (max-width: 240px)` (botões e abas quebram linha, menu com largura `min(230px, 100vw - 32px)`).
13. **Fake:** além de `meName` e `meNoName`, criei `meVerified`, `meCert`, `meCertVencido` e `meDown`, necessários para testar o nível e o estado de erro. `level` ("simples") não existe no fake porque o nível é derivado.
14. **Mudanças compartilhadas (regra 14):** `ui.js`, `shell.js`, `styles.css`, `router.js` pedem reverificação de 1.1, `assinar.html`, `verificar.html`. `status.md` não foi alterado (cabe ao Maestro).
15. **Bug achado e corrigido durante os testes:** `replaceChildren(null)` desenhava "null" nas telas privadas; o teste do AC4 agora confere que nenhum texto "null" ou "undefined" aparece.
