# Seção: Sign / Parte 1 / 1.0 Shell da área logada + correções da 1.1
v0.1 · 25/11/2026 · Idealizador. Preço, plano e jurídico não entram nesta seção. Itens marcados "hipótese" são do Arquiteto ou do Designer e podem ser vetados.

## Objetivo e papéis com acesso
Dar à área logada o esqueleto do Wealth (menu, barra superior, cabeçalho de página, avisos, estados) e os componentes de interface que toda seção seguinte vai usar. Também fecha as ressalvas da 1.1 (M-1, M-3, B-1, B-2, B-3, T-09, `100dvh`).
Acesso:
- Remetente com sessão: vê o shell.
- Visitante: continua nas telas públicas, sem shell (entrar, criar, recuperar, nova senha, `assinar.html`, `verificar.html`).
- Fora do escopo: conteúdo real de Documentos, Conta, Plano e Onboarding; tema escuro (decisão de 25/11: `theme.js` não muda); folha inferior no celular (UX-02); esqueleto `.skel`; migrações; qualquer RPC nova.

## Entradas e saídas
| Elemento | Destino ou efeito | Condição |
| --- | --- | --- |
| Login correto (1.1) | `#/documentos` ou `#/onboarding/1`, ambos com **replace** (M-1) | sessão válida |
| Rotas privadas `#/documentos`, `#/envio/novo`, `#/plano`, `#/conta/*`, `#/onboarding/1`, rota desconhecida com sessão | telas provisórias **dentro do shell** | sessão válida |
| Item "Documentos" do menu | `#/documentos` | sempre |
| Item "Conta" do menu | `#/conta/perfil` | sempre |
| Itens Novo envio, Verificar e Plano e uso | **não aparecem** (parte não construída). Entram no menu só quando a seção existir, com a mesma estrutura | hoje: ausentes |
| Logo da topbar | `#/documentos` | sempre |
| Avatar, "Conta" | `#/conta/perfil` | sempre |
| Avatar, "Sair" | `signOut()`, depois `#/entrar` com replace | sempre; sem confirmação (não é destrutivo) |
| Abas Perfil, Verificação, Segurança | `#/conta/perfil`, `#/conta/verificacao`, `#/conta/seguranca` | só na Conta |
| Botão da tela provisória | Documentos leva a `#/conta/perfil` ("Ir para Conta"); Conta, Novo envio, Plano e uso e rota desconhecida levam a `#/documentos` ("Ir para Documentos") | sempre |
| Sessão que termina (outra aba ou token vencido) | `#/entrar` com replace e aviso "Sua sessão terminou. Entre de novo para continuar." | comportamento da 1.1, mantido |

Onboarding (hipótese): `#/onboarding/1` usa o shell reduzido, com `.sidenav` só com a marca, sem itens de menu e com avatar (Conta e Sair). Motivo: Documentos e Conta devolveriam o usuário ao onboarding pendente. A 1.3 pode revisar.
Vínculos: todo destino acima tem saída (item do menu ou botão) e volta pelo menu ou pelo Voltar do navegador.

## Elementos e comportamento

### A. Shell (`js/views/shell.js`)
`ensureShell(ctx, { minimal })` monta por DOM (`h()`), sem `innerHTML`, e devolve o nó `#view`. Estrutura:
- Raiz: `div.shell > aside.sidenav + div.frame > div.surface > header.topbar + div.content#view`.
- `.frame` e `.content` são `div`, não `main`. O `main#sign` de `index.html` continua sendo o único landmark `main` (nenhuma mudança no markup da tela de Entrar).
- Dentro de `aside.sidenav`: `a.sidenav-mark[aria-label="Lottus, início"]` (href `#/documentos`) e `nav.sidenav-items[aria-label="Menu principal"]`.
- Cada item é `div.nav-sec.single > a.nav-btn[aria-label=<rótulo>][aria-current=page quando ativo] + div.flyout > .flyout-title`. O ícone é SVG inline criado por DOM com `aria-hidden`.
- Itens hoje: Documentos (ícone da lista de arquivos) e Conta (`NI.conta` do Wealth). Os itens vêm de uma tabela `NAV = [{id, label, href, icon, built}]` e só entra quem tem `built:true`.
- O shell **não é recriado** ao navegar entre rotas privadas (o mesmo nó permanece). Só `#view` troca. Ao ir a uma rota pública, o shell é desmontado.
- Botão para pular a navegação: `button.sr-only.skip-link` com o texto "Ir para o conteúdo" (visível ao receber foco). Ao clicar, leva o foco ao `h1` de `#view`. Não usa `href="#..."`, para não colidir com o roteador.

Barra superior:
- Esquerda, `.org`: `.org-mark.logo` (PNG da marca via `--logo-mark`, com `role="img" aria-label="Lottus"`), `.org-name` com o nome do usuário e `.org-sub` com o nível (Simples, Avançada ou Qualificada).
- Direita, `.profile > button.avatar#avatar` (iniciais, `aria-haspopup="true"`, `aria-expanded`, `aria-label="Perfil"`) e `.menu#pmenu`.
- `.menu`: `.menu-head` (nome e e-mail), `a.menu-item` "Conta", `button.menu-item.danger` "Sair".
- O menu abre e fecha pelo clique no avatar. Esc e clique fora fecham, e o Esc devolve o foco ao avatar. Tab para fora do menu também fecha.
- Sem busca, sino ou botão de tema.
- Texto do usuário só por `textContent` e com `overflow-wrap:anywhere`.

Origem dos dados (hipótese, a confirmar pelo Arquiteto): nome e nível vêm de `sign_me` (`name`, `level`), com cache de 5 s já existente em `api.me()`. Se o campo faltar, `.org-name` mostra o e-mail e `.org-sub` fica oculto, sem inventar nome. As iniciais são a 1ª letra da 1ª e da última palavra do nome em maiúsculas; sem nome, a 1ª letra do e-mail. Registrar em `pendencias.md` (dono: Arquiteto): "campos reais de `sign_me` para nome e nível". Nenhum dado de pessoa é copiado para o Sign (T-02).

Roteador:
- O roteador chama `ensureShell` para toda rota privada e entrega `ctx.view`.
- Enquanto carrega, `#view` mostra `loading()`.
- A cada rota, `focusH1(view)` e `setTitle` continuam.
- `aria-live` fica só em `#toast-root` e nas regiões de mensagem da 1.1.

### B. Telas provisórias (`views/construcao.js`, reescrita)
Dentro do shell, cada uma com `pageHead` e `emptyState`.

| Rota | `h1` | Subtítulo | Vazio, botão |
| --- | --- | --- | --- |
| `#/documentos` | Documentos | "Aqui ficam os documentos que você enviou e os que precisam da sua assinatura." | "Esta área está em construção." · "Ir para Conta" |
| `#/envio/novo` | Novo envio | "Envie um documento para assinatura." | idem, "Ir para Documentos" |
| `#/plano` | Plano e uso | "Acompanhe o uso do seu plano." | idem, "Ir para Documentos" |
| `#/conta/*` | Conta | "Seus dados, verificação e segurança." | idem, "Ir para Documentos" |
| `#/onboarding/1` | Primeiros passos | "Vamos preparar sua conta." | idem, sem botão de menu; "Sair" pelo avatar |
| rota desconhecida com sessão | Página não encontrada | "Não encontramos esta página." | "Ir para Documentos" |

- Em `#/conta/*` há `nav.tabs[aria-label="Conta"]` com `a.tab-link` "Perfil", "Verificação" e "Segurança". A aba da rota atual tem `.active` e `aria-current="page"`.
- Em `#/envio/novo` e `#/plano` (rotas de deep link, fora do menu) nenhum item do menu fica ativo.
- Telas públicas provisórias (`#/recuperar`, `#/nova-senha`) e rota desconhecida sem sessão continuam como hoje (`.sg-single`, "Voltar ao início").

### C. `js/lib/ui.js` (acrescentar, sem alterar o que existe)
- **`toast(titulo, msg, kind = 'ok' | 'error')`**
  - Monta em `#toast-root` (novo `div` fixo no `index.html`, fora de `#sign`, com `aria-live="polite"`).
  - Ícone, título e mensagem em `textContent`, `button.toast-close` com `aria-label="Fechar aviso"` (44 px).
  - Some sozinho em 4,5 s (ok) e 8 s (error); não some enquanto o mouse ou o foco estiver sobre ele.
  - Erro tem `role="alert"`; no máximo 3 visíveis (o mais antigo sai).
- **`modal({title, sub, body, foot, wide, drawer})`**
  - Monta em `#modal-root` (novo `div` fixo no `index.html`) com `.modal-backdrop > .modal[role=dialog][aria-modal=true][aria-labelledby]`.
  - Devolve `{ el, close() }`.
  - Foco preso (Tab e Shift+Tab ciclam), Esc e clique no fundo fecham, e o foco volta ao elemento que abriu.
  - Foco inicial no primeiro campo ou botão do corpo.
  - Rola por dentro (`max-height: calc(100dvh - 48px)`), nunca a página.
- **`confirm(titulo, texto, rotulo = 'Confirmar', danger = false)`**
  - Devolve `Promise<boolean>`.
  - O botão de ação usa `.btn.danger` quando `danger`; "Cancelar" é `.btn.secondary`.
  - Com `danger`, o foco inicial vai em "Cancelar". Esc e fechar resolvem `false`.
- **`pageHead(titulo, sub, acoes, voltar)`**: `.page-head > div{a.back (se houver {href,label}), h1[tabindex=-1], p.page-sub} + div.row{acoes}`. Um único `h1` por rota.
- **`emptyState(titulo, texto, acao)`**: `.empty` com `strong`, `p` e a ação (nó) opcional.
- **`loading(rotulo = 'Carregando')`**: `.empty > .spinner[role=status][aria-label]`.
- **`STATUS` e `statusTag(status)`**
  - Mapa único; devolve `span.tag` com ícone SVG `aria-hidden` mais texto (nunca só cor).
  - Status desconhecido vira `.tag.muted` com "Status desconhecido" (nunca quebra).

| Chave | Rótulo | Classe | Ícone |
| --- | --- | --- | --- |
| `rascunho` | Rascunho | `.tag` | lápis |
| `enviado` | Enviado | `.tag.brand` | seta de envio |
| `aguardando` | Aguardando | `.tag.warning` | relógio |
| `assinado` | Assinado | `.tag.success` | check |
| `recusado` | Recusado | `.tag.danger` | x |
| `expirado` | Expirado | `.tag.muted` | relógio riscado |
| `cancelado` | Cancelado | `.tag.muted` | círculo cortado |

Os traços SVG são do Designer (24 px, stroke 2, como o `NI` do Wealth).

### D. Correções da 1.1
- **M-1:** no `router.js`, `afterLogin` chama `go(destino, true)` (replace) para onboarding e para o destino guardado. A tela de Entrar não fica no histórico depois do login.
- **M-3:** em `entrar.js`, no estado "link vencido", `doResend` com sucesso não pode apagar o botão.
  - O alerta vermelho vira "Enviamos de novo. Verifique também a caixa de spam." e o botão permanece, desligado, com "Reenviar em N s".
  - Ao zerar, o botão volta a "Reenviar e-mail".
  - Em falha (rede, limite, geral), o botão continua. O limite de 3 por hora e os 60 s não mudam.
- **B-1:** `app.js` extrai `processAuthHash()`. Ela roda no carregamento **e** em `hashchange`.
  - O listener do `app.js` é registrado antes do `router.start()`.
  - No `router.js`, `currentHash` ignora (não trata como rota) todo hash que não comece com `#/` e não seja vazio. Assim o hash do Auth nunca mostra "Página não encontrada".
- **B-2:** quando `setSession` falha em `type=signup`, o aviso deixa de dizer "E-mail confirmado".
  - Novo texto, no mesmo alerta de link vencido (com o botão "Reenviar e-mail"): "Não foi possível usar este link. Entre com seu e-mail e senha ou, se o link venceu, peça um novo."
  - "E-mail confirmado. Entre para continuar." só aparece quando a sessão realmente abriu e não há onboarding a mostrar.
- **B-3:** o botão "Mostrar" ganha `aria-pressed="false"` e vira `"true"` ao mostrar. O texto visível continua "Mostrar" e "Ocultar", sem mudar a tela aprovada.
- **T-09:** `index.html` ganha `<link rel="modulepreload">` para os módulos do grafo (app, router, ui, api, fmt, entrar, construcao, shell), com a **mesma URL e `?v=` dos imports**. O `?v=` sobe junto em todos.
  - Se após o preload a mediana continuar acima de 1 s, registrar o número e propor agrupamento manual em um só arquivo, sem bundler (decisão do Maestro).
- **100dvh:** `.shell { height: 100vh; height: 100dvh; }` (o `100vh` fica como fallback), `.modal { max-height: calc(100dvh - 48px) }` e `.auth` com `min-height: 100dvh`. As regras `.sg-*` já usam `dvh` e não são tocadas.

### E. `styles.css`
- Um bloco no **fim** do arquivo, comentado "importado do Wealth (seção 1.0)". Não renomeia nem reordena nenhuma regra `.sg-*`. Copia literalmente do Wealth:
  - `.banner` com `.warn`, `.danger`, `.info` e `.grow`;
  - `.ob-steps` (4 regras);
  - `.tabs .tab-link` (3 regras) e `nav.tabs { display: inline-flex }`;
  - `.sr-only`;
  - `.hide-sm` e `.show-sm`, com `@media (max-width: 640px)`;
  - o bloco `@media (max-width: 420px)` do menu (marca oculta, `.nav-btn` 44×44).
- Regras novas, só com tokens existentes:
  - `.tag.muted { background: transparent; border: 1px solid var(--line); color: var(--muted) }` e `.tag .ico { width: 12px; height: 12px; margin-right: 4px }`;
  - `.skip-link:focus`;
  - `.org { min-width: 0; flex: 1 }`, `.org-name, .menu-name, .menu-sub { overflow-wrap: anywhere }` e `.topbar-right { flex-shrink: 0 }`;
  - `.avatar`, `.menu-item`, `.btn.sm`, `.tabs button` e `.tab-link` com `min-height: 44px` e `min-width: 44px`.
- Não copiar `.plans`, `.plan-*` nem `.u-*` (ficam para a 5.x).

## Estados
- **Carregando:** `loading()` em `#view`; botão com `aria-busy`.
- **Vazio:** `emptyState` das telas provisórias.
- **Erro:** `sign_me` com falha de rede no shell mostra `.banner.danger` com "Não foi possível carregar seus dados. Verifique sua conexão." e o botão "Tentar de novo". O shell continua usável (menu e Sair).
- **Sem permissão:** sem sessão em rota privada, o comportamento da 1.1 se mantém (Entrar com aviso de sessão).
- **Sucesso:** `toast` ok, sem uso nesta seção além do teste.
- **Muitos dados:** nome de 60 ou mais caracteres sem espaço e e-mail de 254 quebram linha. O avatar fica sempre visível.

## Dados lidos e escritos
- Lê `api.me()` (`sign_me`) e `getSession`. Escreve nada.
- Nenhuma RPC, tabela, migração ou campo de pessoa novos.
- Extensão do `fake-sign.cjs`: `sign_me` devolve também `name` ("Ana Exemplo da Silva") e `level` ("simples"). Modos novos: `meName` (nome longo) e `meNoName`.

## Textos da interface (PT-BR, exatos)
- Menu: "Documentos", "Conta". Perfil: "Conta", "Sair". Avatar: `aria-label="Perfil"`.
- Abas: "Perfil", "Verificação", "Segurança".
- Skip link: "Ir para o conteúdo".
- Botões: "Ir para Conta", "Ir para Documentos", "Tentar de novo".
- Toast: botão `aria-label="Fechar aviso"`.
- Demais textos estão nas tabelas das seções B e D e nos estados acima.
- Nenhum `[preencher]` visível nesta seção.

## Layout por faixa
- **Celular (320 a 760):**
  - `.shell` em coluna, `.sidenav` vira faixa horizontal, `.flyout` fixo, `.org-sub` oculto.
  - Em 420 px ou menos, a marca da faixa some (a marca fica na topbar), os botões têm 44 px e os 5 itens cabem em 320 px.
  - Sem rolagem lateral na faixa nem na página.
  - O botão principal continua alcançável com teclado virtual (`100dvh`; no celular o shell tem `height:auto`).
- **Tablet (761 a 1279):** trilho vertical de 84 px, `.surface` com cantos de 32 px.
- **Desktop (1280 ou mais):** o mesmo layout do Wealth.
- **1920 e 2560:** conteúdo da `.surface` centralizado com largura máxima, sem esticar (reaproveitar o limite existente no Wealth, se houver; senão `.content > * { max-width: 1200px; margin-inline: auto }`).

## Orçamento de desempenho (a medir)
- Tela de Entrar interativa (campo E-mail focado, `#sign h1` presente) em até 1 s com 4G simulado (1,6 Mbps, 150 ms de RTT, a mesma condição que deu 1,7 s). Usar a mediana de 5 execuções, com CDP, em `scripts/sign-local/testes/medir.cjs`. Registrar antes e depois.
- JS do app (módulos) até 70 kB comprimido, sem o vendor (hipótese). Registrar o número real.
- CLS até 0,1 ao montar o shell (shell sem salto, com `#view` ocupando o espaço).
- INP até 200 ms ao abrir e fechar o menu do avatar.

## Critérios de aceite
Ambiente: Playwright contra `fake-sign.cjs` via `drv.cjs`. Larguras L = 320, 360, 390, 768, 1024, 1280, 1920 e 2560. Sessão pelo fake (`pronto@teste.example` com onboarding concluído).

**Shell e navegação**
- **AC1.** Dado sessão válida, quando abro `#/documentos`, então existem 1 `aside.sidenav`, 1 `header.topbar` e `#view` com 1 `h1` "Documentos". Há exatamente 1 `main` no documento (conferir também em `#/entrar`). A logo é o PNG (`--logo-mark` resolve a `img/mark-rosa.png`) e não há texto "Lottus Sign" como marca.
- **AC2.** Dado o shell, quando conto `nav.sidenav-items .nav-sec`, então são 2 (Documentos e Conta), nenhum com "Em breve", "Novo envio", "Verificar" ou "Plano". O item da rota atual tem `aria-current="page"`.
- **AC3.** Dado `#/documentos`, quando navego a Conta, então `#view` troca, o nó `.shell` é o mesmo de antes (marca `data-test` ou referência do nó no teste) e o foco vai ao `h1` "Conta". A aba "Perfil" fica `.active` e `aria-current="page"`; clicar "Verificação" muda a rota e a aba ativa.
- **AC4.** Dado cada rota privada (`#/documentos`, `#/envio/novo`, `#/plano`, `#/conta/perfil|verificacao|seguranca`, `#/onboarding/1`, `#/inexistente` com sessão), quando abro, então aparece dentro do shell, com `h1`, `.page-head` e um botão ou link de saída funcional. O link da lista de entradas leva ao destino previsto e não há 404 nem tela sem saída.
- **AC5.** Dado `#/onboarding/1`, então o menu não tem itens, o avatar tem Conta e Sair, e "Sair" funciona.
- **AC6.** Dado o avatar, quando clico (ou uso Enter e Espaço), então `aria-expanded="true"`, o menu mostra nome e e-mail e os itens "Conta" e "Sair". Esc fecha e devolve o foco ao avatar; clique fora fecha. "Sair" vai a `#/entrar`, o localStorage do Auth fica sem token, e o Voltar não reabre dados privados (cai em Entrar com o aviso de sessão).
- **AC7.** Dado visitante, quando abro `#/documentos`, então vai a `#/entrar` com o aviso de sessão, sem montar o shell (nenhum `.shell` no DOM).
- **AC8.** Dado o Tab inicial no shell, então o primeiro foco é "Ir para o conteúdo" e, ao ativá-lo, o foco vai ao `h1`. Ordem de Tab: skip link, marca, menu, avatar, conteúdo. O foco é sempre visível (`box-shadow` do `:focus-visible`).

**Componentes**
- **AC9 (toast).** Dado `toast('Dados salvos','', 'ok')`, quando chamado, então existe 1 `.toast.ok` em `#toast-root[aria-live=polite]`, que some em 4,5 s ±0,5 s. Dado `kind='error'`, então o toast tem `role="alert"` e some em 8 s ±0,5 s. Dado 4 chamadas seguidas, então há 3 visíveis. O botão fechar tem 44 px ou mais e o texto do usuário com `<b>` aparece como texto, sem virar HTML.
- **AC10 (modal e confirm).**
  - Dado `modal(...)` aberto, então há `role="dialog"` e `aria-modal="true"` com nome acessível. Tab e Shift+Tab ciclam dentro dele, Esc e clique no fundo fecham, e o foco volta ao elemento de origem.
  - Dado `confirm(..., true)`, então o foco inicial está em "Cancelar", o botão de ação é `.btn.danger`, Esc resolve `false` e o clique na ação resolve `true`.
  - Dado o modal com conteúdo longo em 320×568, então o modal rola por dentro, nenhum botão fica fora da tela e `scrollWidth <= innerWidth`.
- **AC11 (`pageHead`, `emptyState`, `loading`).** Dado cada um, então `pageHead` tem 1 `h1[tabindex=-1]`, `emptyState` com ação tem um botão alcançável, e `loading()` tem `role="status"` e `aria-label`.
- **AC12 (`statusTag`).** Dados os 7 status, então cada selo tem ícone (`svg[aria-hidden]`) e o texto exato do mapa, nas classes da tabela. Expirado e Cancelado são `.tag.muted`; status desconhecido não quebra. Em captura ampliada, nenhum selo depende só de cor.
- **AC13 (contraste).** Dados os 7 selos e `.banner` (`warn`, `danger`, `info`), quando calculo o contraste texto/fundo no tema claro, então o mínimo é 4,5:1. Para `.tag.muted`, o fundo efetivo é `--surface` e o texto é `--muted`. (O tema escuro é forçado a claro; medir o escuro só como informação.)

**Correções da 1.1**
- **AC14 (M-1).** Dado `#/entrar` aberto, quando faço login com `pronto@teste.example`, então `history.length` é igual ao de antes do login. Ao executar `history.back()`, a página não volta a mostrar o formulário de Entrar de forma repetida. Com `ok@teste.example` o resultado é o mesmo para `#/onboarding/1`.
- **AC15 (M-3).** Dado `#error_code=otp_expired` e e-mail válido digitado, quando clico "Reenviar e-mail", então o botão continua visível e desligado com "Reenviar em N s", a mensagem "Enviamos de novo. Verifique também a caixa de spam." aparece e, após o intervalo de reenvio configurável (`resendCooldownMs: 1500`), volta a "Reenviar e-mail". Com 429 no fake, o botão continua e aparece "Você atingiu o limite de reenvios. Tente em 1 hora."
- **AC16 (B-1).** Dado `#/entrar` já aberto, quando o teste altera `location.hash` para `#access_token=<mint>&refresh_token=<mint>&type=signup`, então o hash é apagado, o resultado é `#/onboarding/1` e, observando as mutações do DOM, "Página não encontrada" **nunca** aparece. Dado `#error_code=otp_expired` com a página aberta, então aparece "Este link venceu ou já foi usado. Peça um novo." e o botão de reenvio.
- **AC17 (B-2).** Dado `#access_token=lixo&type=signup`, então não aparece "E-mail confirmado". Aparece o texto neutro da seção D, com o botão "Reenviar e-mail". O hash é apagado.
- **AC18 (B-3).** Dado o botão "Mostrar", então `aria-pressed="false"` no início, `"true"` depois do clique e `"false"` no segundo clique. O texto visível alterna "Mostrar" e "Ocultar" e o campo alterna `type`.
- **AC19 (T-09).** Dado o perfil 1,6 Mbps / 150 ms (5 execuções, mediana), então o `#sign h1` de Entrar aparece e o campo E-mail fica focado em até 1,0 s. Dado `index.html`, então há `modulepreload` para cada módulo do grafo, com URLs idênticas às dos imports (nenhum módulo é buscado duas vezes na aba de rede). Registrar antes e depois e o JS comprimido. Se > 1,0 s, o número vai ao relatório e a decisão (agrupar) volta ao Maestro; isto não é desculpa para declarar atingida.
- **AC20 (`dvh`).** Dado `styles.css`, então `.shell`, `.modal` e `.auth` usam `dvh` (com fallback `vh` só como linha anterior). Dado 390×500 com a janela reduzida pelo teclado virtual simulado (`visualViewport`), então o botão de ação principal e o avatar continuam visíveis ou alcançáveis por rolagem da `.content`, sem rolagem horizontal.

**Anti-corte, acessibilidade e segurança**
- **AC21 (anti-corte, todas as L).** Dado `meName` de 60 caracteres sem espaço, e-mail de 254, `.page-sub` longo e texto longo nos toasts, quando abro `#/documentos` e o menu do avatar, então em cada L `scrollWidth <= innerWidth`, nenhum elemento passa da borda (`getBoundingClientRect`, usando o `overflow()` do `drv.cjs` adaptado a `#sign *`), o avatar fica visível e inteiro, e `.org-name` e `.menu-name` quebram linha. Guardar 1 captura por L por rota privada.
- **AC22 (5 itens em 320).** Dado 320×568, quando o teste clona `.nav-sec` até 5 itens (simulando o menu final), então todos ficam visíveis dentro da largura, sem rolagem horizontal da faixa, com 44×44 px ou mais cada. (12 itens não se aplica.) `.sidenav` rola só dentro de si se um dia exceder.
- **AC23 (zoom 200%).** Dado zoom de 200% em 320 e 1280, quando navego Documentos, Conta e o menu do avatar, então sem rolagem horizontal da página, com Tab alcançando menu, avatar e botão da tela, e a ordem de leitura mantida.
- **AC24 (alvos de 44 px).** Dado cada L, então avatar, itens de menu, `.nav-btn`, `.tab-link`, `.menu-item`, botões da tela e o fechar do toast medem 44×44 px ou mais (`getBoundingClientRect`).
- **AC25 (teclado e leitor).** Dado só teclado, quando navego, então o menu abre e fecha com Enter e Esc, o foco nunca some, e `aria-live` existe só em `#toast-root` e nas regiões de mensagem da 1.1 (não em `main`, `#view` ou `.shell`). A rota nova move o foco ao `h1` e atualiza o `<title>`.
- **AC26 (CSP e estático).** Dado `node scripts/check.mjs`, então passa. Nenhum `<script>` inline e nenhum `style="` em `index.html`, `shell.js`, `ui.js` e `construcao.js`. `grep` de `innerHTML` em `shell.js` e `ui.js` retorna zero. Nenhuma violação de CSP no console (o `drv.cjs` serve com a CSP real do `_headers`, que não é afrouxada). Sem erro JS, sem requisição externa além das fontes.
- **AC27 (regressão da Entrar aprovada).** Dado as capturas de Entrar, Criar com erro, "Confirme seu e-mail" e link vencido, nas larguras 320, 360, 390, 768, 1280 e 1920, refeitas depois da mudança, então as capturas "antes" (commit atual) e "depois" são iguais pixel a pixel, ou os desvios estão listados e justificados. Os testes `t-ac.cjs` e `t-layout.cjs` existentes passam (n de n). `assinar.html` e `verificar.html` abrem sem corte e sem erro, porque o `styles.css` compartilhado muda. Conferir também a especificidade: `.sg-card h1` continua vencendo a regra `h1 { font-size: 24px }` do `@media (max-width: 760px)`.
- **AC28 (links percorridos).** Todos os links e botões da tabela "Entradas e saídas" e das telas provisórias foram clicados e levam ao destino previsto (lista anexada). F5 em cada rota privada com sessão permanece na mesma rota, dentro do shell.

## Pendências a registrar ao construir
- PEND (Arquiteto): campos reais de `sign_me` para nome e nível (a hipótese acima usa `name` e `level`).
- PEND (Designer): traços SVG dos 7 ícones de status e do menu (Documentos), no mesmo traço do `NI` do Wealth.
- PEND (Maestro): se T-09 não bater 1 s, decidir o agrupamento dos módulos.
- Reverificação por mudança compartilhada (regra 14): `ui.js`, `shell.js`, `styles.css` e `router.js` impactam 1.1 (todas as telas), `assinar.html`, `verificar.html` e as seções 1.3 a 1.6 futuras. Registrar no `status.md`.
- O desenvolvedor deve apenas portar `.tag.muted` e a folha inferior ao Wealth, Partners e Admin depois (UX-02), com reverificação delas.

## Referências lidas
`/home/user/lottusfinance/docs/manual-agente-desenvolvedor.md`; `/home/user/lottusfinance/docs/agente/sign/{ux-alinhamento,plano-de-construcao,decisoes,pendencias,secao-1-1-entrar-e-criar-conta,verificacao-1-1-ciclo-1}.md`; `/home/user/lottusfinance/apps/sign/{index.html,_headers,styles.css}` e `js/{app.js,lib/router.js,lib/ui.js,lib/api.js,views/entrar.js,views/construcao.js}`; `/home/user/lottusfinance/apps/wealth/js/app.js` (`renderShell`, l.119) e `/home/user/lottusfinance/apps/wealth/styles.css` (`.banner`, `.ob-steps`, `.tab-link`, `.sr-only`, `.hide-sm`, regra de 420 px); `/home/user/lottusfinance/scripts/sign-local/testes/{fake-sign.cjs,drv.cjs}`.
