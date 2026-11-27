# UX do Sign alinhada às outras plataformas
25/11/2026 · v0.1 · Designer. Só especificação; nenhum código foi alterado nem executado. Complementa `parte-1-design.md` (onde divergir, vale este documento; ver seção 2, item "Menu").

**Achado central.** `apps/sign/styles.css` já é uma cópia do `apps/partners/styles.css` (mesmos tokens e mesmas classes de shell e de componentes: `.shell .sidenav .nav-sec .flyout .frame .surface .topbar .menu .page-head .card .kv .list-row .tag .tabs .seg .modal .drawer .toast .empty .spinner .note-box .switch-row .choice .filebox .enroll`). O que falta no Sign é (a) **estrutura/JS** que monte o esqueleto (hoje só existe a tela de entrar, `.sg-*`, e as telas provisórias de `js/views/construcao.js`) e (b) **poucas classes** que só o Wealth tem (`.banner`, `.ob-steps`, `.plans/.plan-table/.plan-meter`, `.tabs .tab-link`, `.sr-only`, `.show-sm/.hide-sm`). Admin e Partners usam o mesmo esqueleto do Wealth; a diferença é só o que entra na barra superior.

## 1. Tabela comparativa

| Item | Sign hoje | Wealth (referência) | Partners | Admin |
| --- | --- | --- | --- | --- |
| Esqueleto logado | Não existe. Telas `.sg-page/.sg-card` (centradas, sem menu), `views/construcao.js` | `.shell > aside.sidenav + main.frame > .surface > header.topbar + .content#view`; montado por `renderShell` em `wealth/js/app.js` (l.119); CSS `styles.css` l.142-246 | Igual, `startShell` em `partners/js/app.js` (l.455); `#nav` preenchido por JS | Igual, `startShell` em `admin/js/app.js` (l.476) |
| Menu lateral (desktop) | Classes copiadas (`.sidenav .nav-btn .flyout .fly-item .nav-count`), sem uso | Barra de 84 px só com ícone; `.nav-sec` com `.flyout` ao passar o mouse ou `:focus-within`; 1 item = `.nav-sec.single` | Igual | Igual |
| Menu no celular | n/d | `@media (max-width:760px)`: `.shell` vira coluna, `.sidenav` vira faixa horizontal de ícones, `.flyout` fixo; `<=420px` esconde a marca e usa botões de 44 px (l.608-660, 1722) | Igual | Igual (l.428) |
| Barra superior | n/d | `.topbar`: à esquerda `.org` (`.org-mark` + `.org-name` + `.org-sub`), à direita `.profile > .avatar` + `.menu` (`.menu-head .menu-item .menu-item.danger`) | Igual; seletor de fundo `.org-btn` + `.org-menu` | Igual + `.gsearch`, botão "Novo" (`.tb-pop`), sino (`.icon-btn`, `.menu.notif`) |
| Cabeçalho de página | Só `h1` solto em `.sg-card` | `W.pageHead` (l.28): `.page-head > div{.back, h1, .page-sub} + .row{ações}` | Igual | Igual |
| Cartão | `.card`, `.sg-card` (só login) | `.card`, `.card.flush`, `.card-head` | Igual | Igual + `.panel`, `.card-pad-head` |
| Chave-valor / lista | `.kv`, `.list-row` existem | `.kv`, `.list-row`, `.list-row.dup` (grid), `button.list-row` | Igual | Igual |
| Tabela | `.table-wrap` com `min-width:640px` no celular | `.table-wrap` rola dentro, sombras nas bordas (l.312); `.hide-sm/.show-sm` escondem colunas; **não há** tabela-vira-cartão genérica | Igual | `.table-wrap` |
| Abas | `.tabs` (botões), `.sg-tabs` (login, `role=tab`) | `.tabs` pílula (botão `.active`), `nav.tabs > a.tab-link` para rotas (Conta: Conta/Plano/Integração), `.seg` para opção em formulário | `.tabs` | `.tabs` |
| Modal / folha | `.modal-backdrop .modal` (centrado), `.modal.drawer` (lateral) | `W.modal({title,sub,body,foot,wide,drawer})` (`core.js` l.139): `role=dialog`, `.modal-head/.modal-body/.modal-foot`, Esc e clique no fundo fecham; `W.confirm(título, texto, rótulo, danger)`; **sem** folha inferior no celular (`.drawer` só vira tela cheia) | Igual | Igual |
| Toast | `.toast` copiado, sem `#toast-root` | `#toast-root` (`aria-live=polite`, canto sup. direito) + `W.toast(título,msg,'ok'/'error')`, ícone, barra de tempo 4,5 s | Igual | Igual |
| Aviso em página | `.note-box`, `.error-box`, `.sg-alert .ok/.err/.warn` | `.banner` + `.warn/.danger/.info`, ícone e `.grow`; `.note-box` dentro de cartão | `.note-box` | `.note-box` |
| Selo | `.tag` e `.success/.warning/.danger/.brand` | Igual (l.347-355); `.badge-soon` (pílula "em breve") | Igual | Igual |
| Estado vazio / carregando | `.empty`, `.spinner` | `.empty` (texto `--faint`), `W.loading()` = `.empty > .spinner`; **sem esqueleto** em nenhuma plataforma | Igual | Igual |
| Formulário | `.field/.input/.help/.ferr`, `.sg-form` (login) | `.field label`, `.input`, `.form-grid` (2 colunas, 1 no celular), `.fgrid`, `.drawer .field`, `.choices/.choice`, `.switch-row`, `.filebox` | Igual | Igual |
| Onboarding | Planejado (`.enroll`, `.ready`) | `.ob-steps` (`li.on/.done`), `.ob-actions`, `.ob-sub`, `.ob-kinds` (l.1605) | n/d | n/d |
| Plano / conta | n/d | `#/conta` com `nav.tabs` (aba `?aba=plano`), `.plans > .card.plan(.current)`, `.plan-table`, `.plan-meter > i` (cota), `.banner.danger` de cobrança em atraso | n/d | `planos.js` |
| Rodapé | n/d | Não há rodapé no app logado; links legais só na tela de entrar | Idem | Idem |
| Tema | `js/theme.js` força `data-theme='light'` e apaga `lottus.bo.theme` | **Idêntico** (`wealth/js/theme.js`), igual em Partners e Admin; site remove o atributo (`site/main.js` l.54) | Idêntico | Idêntico (`getTheme = () => 'light'`, `setTheme` morto) |

## 2. Decisões do Sign (copiar o que existe)

1. **Esqueleto.** Adotar o do Wealth sem alteração de classes: `.shell > aside.sidenav(+ a.sidenav-mark, nav.sidenav-items) + main.frame > .surface > header.topbar + .content#view`. Criar `js/views/shell.js` com `renderShell(ctx, inner)` espelhando `renderShell` do Wealth, em DOM (`h()`), não em `innerHTML` (regra do Sign: texto do usuário nunca vira HTML). Telas públicas (entrar, recuperar, assinar, verificar) continuam em `.sg-page`/`.auth`; **só rotas privadas usam o shell**.
2. **Menu da área logada** (um `.nav-sec.single` por item, ícones já existentes em `NI` do Wealth, rótulo no flyout e `aria-label`): **Documentos** (`#/documentos`, inicial), **Novo envio** (`#/envio/novo`), **Verificar** (`verificar.html`, link de saída), **Plano e uso** (`#/plano`), **Conta** (`#/conta/perfil`; Perfil, Verificação e Segurança como abas `nav.tabs > a.tab-link` dentro da página, como a Conta do Wealth). Isso dá 5 botões: cabem a 320 px com a regra `<=420px` (44 px cada). Muda em relação a `parte-1-design.md`: sem botão "Menu"/folha e sem "Em breve"; item de parte ainda não construída **não aparece** (evita beco sem saída; o Wealth também só mostra o que existe). **Contatos** (Parte 6) e Empresas (7) são v2: entram como `.nav-sec.single` quando existirem. Ação principal "Novo envio" também aparece como `.btn` em `.page-head` de Documentos (uma ação principal por tela).
3. **Barra superior.** `.org`: `.org-mark.logo` (PNG da marca via `--logo-mark`, nunca texto) + **nome do usuário** em `.org-name` e o nível (Simples/Avançada/Qualificada) em `.org-sub`. À direita só `.profile > .avatar` (iniciais) com `.menu`: `.menu-head` (nome, e-mail), `.menu-item` Conta, `.menu-item.danger` Sair. Sem busca e sem sino na v1 (isso é só do Admin).
4. **Cabeçalho de página.** Todo `#view` começa com `.page-head` (h1, `.page-sub` com a contagem ou frase de apoio, `.row` com a ação principal), `.back` quando houver origem. Substitui o `h1` isolado das telas provisórias.
5. **Tabela para cartões.** Lista de Documentos = `.card.flush > .table-wrap > table` no desktop (colunas: Documento, Signatários, Status, Atualizado em dd/mm/aaaa, ação). No celular (`<=640px`) **não** rolar para o lado: cada linha vira `.list-row.dup` (padrão do Wealth, grid no desktop, `grid-template-columns:1fr auto` no celular, l.344 e 614) com nome do documento, `.tag` e data. Para isso gerar as duas marcações e alternar com as classes **`.hide-sm`/`.show-sm`** do Wealth (l.1757; copiar o par). Ordem e rótulos iguais nas duas. Linha inteira clicável: `tr.link` / `button.list-row`.
6. **Selos de status** (`.tag`, sempre ícone + texto, nunca só cor):

| Status | Classe | Ícone |
| --- | --- | --- |
| Rascunho | `.tag` (neutro) | lápis |
| Enviado | `.tag.brand` | avião/seta |
| Aguardando | `.tag.warning` | relógio |
| Assinado | `.tag.success` | check |
| Recusado | `.tag.danger` | x |
| Expirado | `.tag.muted` (novo: fundo transparente, borda `--line`, texto `--muted`) | relógio riscado |
| Cancelado | `.tag.muted` | círculo cortado |

   Expirado e Cancelado ficam neutros de propósito (não são erro do signatário); a diferença é texto e ícone. `.tag.muted` é a única classe nova; usa só tokens existentes. Contraste AA nos dois temas fica para o verificador.
7. **Estados vazios.** `.empty` com título curto, uma frase e o botão da ação ("Você ainda não enviou documentos. [Novo envio]"). Carregando: `W.loading()` equivalente (`.empty > .spinner` com `role=status`); esqueleto `.skel` fica **adiado** (nenhuma plataforma tem; criar só se o Yuri quiser para todas). Erro: `.banner.danger` + "Tentar de novo". Sem permissão: tela do `.sg-alert.warn` levando a Entrar.
8. **Toasts.** Copiar `#toast-root` (`aria-live=polite`) e `toast(título, msg, 'ok'|'error')` do Wealth para `lib/ui.js`; sucesso discreto ("Lembrete enviado", "Dados salvos"), erro com `role=alert`. Mensagem de erro de campo continua em `.ferr`.
9. **Modal e folha.** Usar `.modal-backdrop > .modal` do Wealth (`role=dialog aria-modal`, `.modal-head/.modal-body/.modal-foot`, Esc). **Confirmação destrutiva** (cancelar envelope, sair de todos, desativar verificação) por `confirm(título, texto, rótulo, danger=true)` com foco inicial em Cancelar. Folha inferior no celular: única adição fora do Wealth e deve nascer em `styles.css` e ser portada ao Wealth/Partners/Admin depois (seção 3, item 8); até lá, `.modal` centrado com `max-height:calc(100dvh - 48px)` já é aceitável.
10. **Formulários e onboarding.** `.field`, `.form-grid`, `.choices`, `.switch-row`, `.filebox` como estão. Onboarding: `.ob-steps` + `.ob-actions` do Wealth (l.1605) no lugar do `.stepper` novo de `parte-1-design.md`; "Passo N de 3" e `aria-current="step"` mantidos. Conta/Plano: `nav.tabs` + `.plans`, `.plan-table`, `.plan-meter` (cota de envelopes) e `.banner.danger` para bloqueio por cota.
11. **Rodapé.** Sem rodapé no app logado (igual às demais). Links de Termos, Privacidade e Verificar documento ficam no `.menu` do perfil e na tela de entrar.
12. **Tema claro/escuro.** Hoje **as quatro plataformas forçam claro** (`theme.js` igual, sem botão; o Admin tem `setTheme` e `[data-theme-opt]` desativados). Recomendação: **Sign não cria botão de tema** e mantém `theme.js` como está; é a única forma de ficar igual às demais, e o CSS escuro (`:root[data-theme='dark'|'system']`) já está pronto para o dia em que o Yuri decidir. Se decidir ligar, a mudança é **única e para todas**: `theme.js` lê `lottus.theme` (`light|dark|system`, padrão `light`), um seletor `.seg` em Conta e `meta theme-color` atualizado; o armazenamento é por origem, então cada plataforma guarda o seu. Pendência para o Yuri, sem urgência. Já observado: `.sg-brand img` no escuro usa fundo creme (l.1400), correto; no shell a marca vem de `--logo-mark` e já troca sozinha.

## 3. Mudanças priorizadas para o desenvolvedor (sem tocar na tela de entrar)

1. **(P0)** `js/lib/ui.js`: adicionar `toast()` + criar `<div id="toast-root" aria-live="polite">` e `#modal-root` em `index.html`; `modal()` e `confirm()` com foco preso, Esc e retorno do foco.
2. **(P0)** `styles.css`: acrescentar, copiando literalmente do Wealth, `.banner` (+ `.warn/.danger/.info/.grow`, l.1639), `.ob-steps/.ob-actions/.ob-sub` (l.1605), `.plans/.plan.current/.plan-table/.plan-meter` (l.1615-1620, 1708), `.tabs .tab-link` + `nav.tabs` (l.1700), `.sr-only`, `.hide-sm/.show-sm` (l.1757). Colocar num bloco no **fim** do arquivo, comentado "importado do Wealth".
3. **(P0)** Criar `js/views/shell.js` (`renderShell`, menu, `.profile`/`.menu`, Esc e clique fora fecham) e fazer o roteador envolver toda rota privada nele; `construcao.js` passa a renderizar dentro do shell quando houver sessão (hoje usa `.sg-single`).
4. **(P0)** `js/lib/ui.js`: `pageHead(title, sub, actions, back)` equivalente a `W.pageHead` e `emptyState(título, texto, ação)`, `loading()`.
5. **(P1)** `.tag.muted` e mapa único `STATUS = {rascunho, enviado, aguardando, assinado, recusado, expirado, cancelado}` em `lib/ui.js` (rótulo, classe, ícone); uma só função `statusTag(s)` usada em lista, detalhe e verificação pública.
6. **(P1)** Lista de Documentos: dupla marcação tabela/`.list-row.dup` (decisão 5) com `data-label`.
7. **(P1)** Alvos de 44 px: `.btn.sm`, `.tabs button`, `.tab-link`, `.avatar`, `.menu-item` (regra única `min-height:44px` em `@media (max-width:760px)`).
8. **(P2)** `100vh` para `100dvh` em `.shell`, `.modal`, `.auth`, `.sign-body` (7 ocorrências no `styles.css` do Sign); folha inferior `.modal` até 760 px (alça, `max-height:100dvh`); **avisar o Maestro** para portar ao Wealth/Partners/Admin por reverificação.
9. **(P2)** `js/theme.js` e o botão de tema: não mexer (decisão 12).
10. **(P2)** Trocar estilos inline e `.u-*` por classes; não copiar os ~60 `.u-*` do Wealth, usar `.stack`, `.row`, `.muted`, `.small` já existentes.

## 4. Riscos de regressão

- **Tela de entrar aprovada** (`.sg-page/.sg-card/.sg-tabs/.sg-*`, seção 1.1, 96/96 e 99/99 em testes locais): não renomear nem reordenar essas regras. O bloco novo vai **depois** das `.sg-*`, com seletores que não as tocam. Reexecutar `node scripts/smoke.mjs sign --shots <pasta>` em 320, 360, 390, 768, 1280, 1920 e comparar com as capturas aprovadas antes e depois.
- **Colisão de nomes.** `.sg-alert` x `.banner`, `.sg-tabs` x `.tabs`: manter os dois sistemas; entrar usa `.sg-*`, logado usa as classes do Wealth. Não unificar agora.
- **Regra solta herdada.** `h1 { font-size:24px }` e `.content { overflow:visible }` em `@media (max-width:760px)` do shell afetam todas as telas: verificar que `.sg-card h1` (`clamp`) continua vencendo por especificidade.
- **`.shell { height:100vh; overflow:hidden }`**: no celular com teclado virtual esconde botão principal; trocar por `100dvh` e testar com `visualViewport`. Regra 9 do CLAUDE (320 px a monitor grande) e teste anti-corte do manual (nome de 60 caracteres, e-mail longo, 12 itens de menu, zoom 200%) valem para o shell novo: `.sidenav` rola só dentro de si.
- **Mudança em `styles.css` compartilhado** (itens 7 e 8) é "algo compartilhado": dispara reverificação (regra 14) das telas de Wealth, Partners e Admin se for portada; se ficar só no Sign, não afeta as outras.
- **CSP.** Tudo por `import` de módulos e classes; nenhum `style=""` novo e nenhum script inline (`style-src` aceita inline, `script-src` não).
- **Foco e leitores de tela.** O shell reescreve `#view` a cada rota: manter `focusH1` do roteador e `aria-live` só em `#toast-root`.
- **Não testado:** nada foi executado, contraste de `.tag.muted`, alvos de 44 px e quebra do menu em 320 px são pontos para o `verificador`.
