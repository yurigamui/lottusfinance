# Design da Parte 1: Lottus Sign / Conta e identidade
24/11/2026 · v0.1 · Designer. Não altera regra de negócio nem código. `[preencher]` = depende do Arquiteto (A) ou do jurídico (J).
Base: `apps/sign/styles.css` (tokens `--ink --rosa --field --line --success --warning --danger` e tintas, claro e escuro; foco `--focus`), `index.html`, `js/home.js`, `_headers` (CSP: `script-src 'self'`, `style-src 'self' 'unsafe-inline'` + Google Fonts, `connect-src` só Supabase e BrasilAPI, `form-action 'self'`).

## 1. Fluxo e navegação

```
Visitante -> [1 Entrar/Criar] --e-mail não confirmado--> aviso "Confirme seu e-mail" (RN1) --link do e-mail--> [1]
   |  "Esqueci a senha" -> [2 Recuperar] -> (e-mail) -> link -> nova senha -> [1] (outras sessões encerradas)
   |  "Verificar documento" -> verificar.html (Parte 4), sempre visível sem login
   v login ok
 onboarding pendente? --sim--> [3 Onboarding: 1 Perfil -> 2 Contato -> 3 Certificado (pular) ] -> "Concluir" -> Parte 2
                      --não--> área logada (Parte 2)
Menu da conta: [4 Perfil] [5 Verificação] [6 Segurança] -> cada uma volta ao ponto de origem (parâmetro `de`)
```
| Seção | Entra com | Sai com | Caminho de volta |
| --- | --- | --- | --- |
| 1 | e-mail, senha; cadastro: nome, CPF, celular, aceite (P1-10) | sessão; `#/onboarding` ou rota de origem (RN13) | de 2 e 3 volta a 1 |
| 2 | e-mail; depois nova senha | "Senha alterada" e vai a 1 | "Voltar para entrar" |
| 3 | sessão, estado de `sign_accounts` | `sign_onboarding_done` | "Fazer depois" leva à Parte 2 com aviso fixo do que falta; retomável pelo menu |
| 4 | dados de `profiles` | dados salvos | "Voltar" à origem (`de`) |
| 5 | contato; arquivo de certificado | nível Simples/Avançada/Qualificada | "Voltar" à origem; vinda da Parte 2 devolve ao envio |
| 6 | senha atual, nova senha, TOTP | sessão encerrada | seção 1 |

**Navegação logada (já pensando nas Partes 2 a 5).** Uma única barra, mesmo componente `.topbar` + menu:
- Celular (até 760 px): barra superior com logo (PNG), botão "Menu" (44 px) que abre folha inferior com os itens; ação principal da tela fixa no rodapé da página.
- 768 px: barra superior com itens em linha; item excedente vai para "Mais".
- 1280 px: coluna lateral `.sidenav` expandida com rótulos (não só ícones), conteúdo centralizado com largura máxima.
Itens, em ordem: **Documentos** (Parte 2, início), **Novo envio** (Parte 2, destaque), **Verificar** (Parte 4), **Plano e uso** (Parte 5), **Minha conta** (grupo: Perfil, Verificação, Segurança, Sair). Partes ainda não construídas aparecem desligadas com "Em breve" [preencher: A decide se oculta]. Item ativo com `aria-current="page"`. "Verificar documento" fica visível ao visitante na seção 1.

## 2. Seções: elementos, estados, textos, layout, teclado

Convenções: um `h1` por tela; uma ação principal (`.btn.lg.block`); erro de campo abaixo do campo (`.ferr`, ligado por `aria-describedby`), erro geral em `.error-box role="alert"`; sucesso em `.sign-ok` + texto, `role="status"`. Estado comum de rede: "Não foi possível carregar agora. Verifique sua conexão." + botão "Tentar de novo". Carregando: esqueleto/`.spinner` com `aria-label="Carregando"` e botão com `.loading` e `aria-busy`. Sem permissão (sessão expirada): "Sua sessão terminou. Entre de novo para continuar." levando a 1 com retorno à origem.

### 2.1 Entrar e criar conta
- Elementos: abas Entrar/Criar conta (tabs reais), campos (E-mail; Senha com botão mostrar `.pw-toggle`; no cadastro: Nome completo, CPF, Celular, aceite "Li e aceito os [Termos] e a [Política de Privacidade]" com links ao site [preencher J: texto e versão]), cada campo com uma linha "Para que usamos" (RN14), "Esqueci a senha", "Verificar um documento".
- Mensagens: login errado ou e-mail inexistente (RN3, idêntica): **"E-mail ou senha incorretos."** Bloqueio: **"Muitas tentativas. Tente de novo em 15 minutos ou redefina sua senha."** [A: valor]. Senha curta (RN2): **"A senha precisa ter pelo menos 10 caracteres. Faltam N."** Cadastro com e-mail existente (neutro, RN4): **"Enviamos um e-mail para este endereço. Se você ainda não tem conta, siga o link; se já tem, entre ou use Esqueci a senha."** Conta criada: **"Quase lá. Enviamos um link de confirmação para {e-mail}. Abra o e-mail e volte para entrar."** + "Reenviar e-mail" (com contagem: "Reenviar em 60 s"; limite: "Você atingiu o limite de reenvios. Tente em 1 hora."). E-mail não confirmado ao entrar: **"Confirme seu e-mail para continuar. Enviamos um link para {e-mail}."** Link de confirmação vencido ou usado: **"Este link venceu ou já foi usado. Peça um novo."** + botão. Campos: "Informe um e-mail válido.", "Informe a senha.", "Informe o nome completo.", "CPF inválido. Confira os números.", "Informe o celular com DDD.", "Aceite os Termos e a Política para criar a conta."
- Estados: carregando (botão), erro de rede, sucesso (tela "Confirme seu e-mail"), vazio n/a, sem permissão n/a.
- Layout: 320 uma coluna, cartão sem moldura lateral, campos 100%; 768 cartão centrado até 480 px; 1280 duas colunas (texto de apresentação à esquerda, cartão à direita; reutilizar `.auth`/`.auth-side`) com limite de largura.
- Foco/teclado: foco inicial no primeiro campo da aba; Enter envia; setas trocam de aba, Tab segue ao campo; erro move o foco para o primeiro campo inválido; `autocomplete` correto (`current-password`/`new-password`, `username`).

### 2.2 Recuperar senha
- Passo A (pedir): campo E-mail, botão "Enviar link". Resposta sempre (RN4): **"Se o e-mail existir, enviamos o link. Ele vale por 1 hora e só pode ser usado uma vez."** Reenvio com contagem.
- Passo B (link): Nova senha + Repetir senha, regras visíveis ("Mínimo de 10 caracteres"), botão "Salvar senha". Sucesso: **"Senha alterada. Por segurança, saímos dos seus outros aparelhos."** + "Entrar". Link inválido: **"Este link venceu ou já foi usado. Peça um novo."** + "Pedir novo link". Senhas diferentes: "As senhas não são iguais."
- Estados: carregando, erro de rede, link inválido, sucesso. Layout igual a 2.1. Foco: no sucesso vai ao título; "Voltar para entrar" sempre presente.

### 2.3 Onboarding
- Elementos: **stepper** "Passo 1 de 3: Perfil / Contato / Certificado (opcional)", cartão do passo, botão principal "Continuar", secundário "Voltar", "Fazer depois" só no passo 3 (e no 2 se P1-02 liberar [preencher A]). Aviso no topo enquanto RN1 pendente: **"Confirme seu e-mail para poder enviar documentos."** Resumo final: lista "O que falta para enviar" com marca de feito/pendente e botão "Concluir e ir para meus documentos".
- Textos: passo 1 "Conte quem é você. Usamos estes dados só para identificar o remetente e dar prova da assinatura." (RN14, [preencher J]); passo 2 "Vamos confirmar seu contato."; passo 3 "Certificado digital (opcional). Com ele sua assinatura passa a ser qualificada. Sem ele, você envia normalmente."; conclusão: "Tudo pronto. Você já pode enviar documentos."
- Estados: carregando (esqueleto do passo), erro por passo com retentativa, retomada ("Continuar de onde parou"), sucesso. Cada passo é endereçável (`#/onboarding/2`).
- Layout: 320 stepper compacto (só "Passo 2 de 3" + barra), botão principal fixo no rodapé; 768 stepper com rótulos; 1280 stepper à esquerda e cartão à direita.
- Foco: ao trocar de passo, foco no `h2` do passo (tabindex -1) e anúncio por `aria-live`. O stepper é `ol` com `aria-current="step"`, não clicável adiante.

### 2.4 Perfil e conta
- Elementos: `.kv`/formulário com Nome, CPF ou CNPJ (tipo de conta), E-mail (somente leitura, com selo "Confirmado"), Celular (selo "Verificado"/"Não verificado"), Plano atual com link à Parte 5, selo de nível de assinatura, botão "Salvar alterações" (desligado sem mudança), bloco "Seus dados e a LGPD" com link para pedido de exclusão/portabilidade [preencher J/DPO] e o aviso de que dado de documento já assinado é mantido [preencher J].
- Textos: salvo: **"Dados salvos."** Mudar celular: **"Ao trocar o celular você precisará confirmar de novo com um código."** (RN7, confirmação antes de salvar). CPF duplicado, neutro: **"Não foi possível salvar este CPF. Confira os números ou fale com o suporte."** CPF bloqueado após envio (P1-05): campo desabilitado com **"Para alterar o CPF, fale com o suporte."** [A]. Sessão expirada no meio: preservar o digitado e mostrar "Sua sessão terminou. Entre de novo; seus dados continuam aqui."
- Estados: carregando (esqueleto das linhas), erro de rede, vazio n/a (campos vazios mostram "Não informado"), sem permissão (sessão), sucesso (toast + foco no campo editado).
- Layout: 320 uma coluna; 768 duas colunas de campos; 1280 formulário 640 px + coluna lateral com selo e plano. Foco: ao erro, primeiro campo inválido; alterações não salvas pedem confirmação ao sair ("Descartar alterações?").

### 2.5 Verificação de identidade
- Elementos: dois cartões. **Contato**: canal ativo (só `email` hoje; WhatsApp não aparece), botão "Enviar código", **campo de código de 6 dígitos**, "Reenviar código" com contagem, "Confirmar". **Certificado ICP-Brasil (opcional)**: explicação, seletor de arquivo (`.filebox`), passo "Provar a posse" (desafio, texto [preencher A]), resultado. Selo do nível no topo. Aviso de uso do certificado [preencher J: J-01/P1-09].
- Textos: enviado: **"Enviamos um código de 6 dígitos para {contato mascarado}. Ele vale por 10 minutos."** Errado: **"Código incorreto. Você tem mais {n} tentativas."** Expirado: **"O código venceu. Peça um novo."** Tentativas esgotadas: **"Muitas tentativas com este código. Peça um novo."** Limite de reenvios (RN5): **"Você pediu muitos códigos. Tente de novo em 1 hora."** Canal desligado: **"Este canal não está disponível agora."** Sucesso: **"Contato verificado. Você já pode enviar documentos."** Certificado, motivo específico (RN9): "Este certificado venceu em dd/mm/aaaa." · "Não reconhecemos a autoridade que emitiu este certificado." · "O arquivo não é um certificado válido ou está corrompido." · "O CPF/CNPJ do certificado não é o do seu perfil." · "Não foi possível provar que o certificado é seu. Tente de novo." Todas terminam com "Você ainda pode enviar documentos com o contato verificado." Sucesso: **"Certificado válido. Sua assinatura agora é qualificada."**
- Vinda da Parte 2 com pendência: faixa **"Para enviar documentos, verifique seu contato ou envie um certificado."**
- Estados: carregando, erro de rede, sem permissão, sucesso, vazio (sem contato cadastrado: "Informe um celular no perfil" + link à seção 4).
- Layout: 320 cartões empilhados, campo de código com caixas fluidas; 768 empilhados 560 px; 1280 dois cartões lado a lado.
- Foco: após "Enviar código" foco na primeira caixa; digitar avança, Backspace volta, colar distribui os 6 dígitos; `inputmode="numeric"`, `autocomplete="one-time-code"`; erro faz foco voltar à primeira caixa e anuncia por `role="alert"`; animação `shake` respeita `prefers-reduced-motion`.

### 2.6 Segurança da conta
- Elementos: Trocar senha (atual, nova, repetir), MFA (`.switch-row`, só se P1-03 couber; fluxo: QR + código de 6 dígitos + códigos de recuperação [preencher A]), Sessão atual (aparelho e último acesso em dd/mm/aaaa hh:mm), "Sair" e "Sair de todos os aparelhos".
- Textos: **"Senha alterada."**; "A senha atual não confere."; MFA ativado: "Verificação em duas etapas ativada. Guarde seus códigos de recuperação."; desativar exige confirmação em modal: **"Desativar a verificação em duas etapas? Sua conta ficará menos protegida."** [Desativar] [Cancelar] (foco inicial em Cancelar). Sair de todos: **"Sair de todos os aparelhos? Você precisará entrar de novo em cada um."**
- Estados: carregando, erro, sem permissão, sucesso; MFA indisponível: bloco omitido e "Verificação em duas etapas: em breve" [A].
- Layout: 320 cartões empilhados, botões 100%; 768/1280 cartões em coluna única de 640 px. Foco: no modal, foco preso e Esc fecha; ao fechar volta ao botão de origem.

## 3. Componentes

**Já existem em `styles.css`:** tokens e tema claro/escuro; `.btn` (primário, secondary, ghost, danger, brand, sm, lg, block, loading); `.field/.input/.help/.ferr`; `.input-ico` com `.pw-toggle`; `.tabs` e `.seg`; `.otp/.otp-box` (6 caixas, shake); `.tag` (success, warning, danger, brand); `.note-box` (aviso âmbar) e `.error-box`; `.modal/.modal-backdrop/.modal-foot`; `.drawer`; `.toast`; `.spinner`; `.empty`; `.kv`; `.list-row`; `.filebox`; `.switch-row`; `.enroll` (lista numerada); `.ready`; `.topbar`, `.menu`, `.sidenav`, `.page-head`, `.back`; `.sign-wrap/.sign-card/.sign-ok/.sign-intro`; `.table-wrap`.
**Faltam (criar uma vez, em `styles.css`, herdados pelas demais plataformas):**
1. **Tabs acessíveis**: `.tabs` existe só como estilo; faltam `role=tablist/tab`, `aria-selected` e teclado.
2. **Stepper do onboarding** (`.stepper`: `ol`, estados feito/atual/pendente, versão compacta).
3. **Campo de código** (`.code-field`): `.otp` existe; falta o comportamento (um `input` real agrupado ou 6 com colar e avanço) e o `label` único "Código de 6 dígitos".
4. **Aviso** (`.alert` com variantes info, success, warning, danger, ícone e `role`); hoje só `.note-box`/`.error-box`.
5. **Folha inferior**: `.modal` vira `.sheet` até 760 px (ancorada embaixo, `max-height: 100dvh` menos área segura, alça), com foco preso.
6. **Selo de nível de assinatura** (`.level-tag`): Simples (neutro), Avançada (rosa), Qualificada (verde), sempre ícone + texto, nunca só cor; `title` explica cada nível [preencher J: texto da explicação].
7. Esqueleto de carregamento (`.skel`), contador de reenvio e medidor de senha (texto, não só barra).
Correção prevista: `.sign-body` e `.modal` usam `100vh`; trocar por `100dvh`.

## 4. Acessibilidade e anti-corte (pontos concretos)
- Contraste AA nos selos e `.tag` nos dois temas; o `--faint` (#9a8f88) não serve para texto útil.
- Estado nunca só por cor: "Verificado", "Qualificada", erro com texto e ícone.
- Alvos de 44 px: `.btn.sm`, `.tabs button`, `.pw-toggle` (38 px) e `.otp-box` precisam de `min-height: 44px`; hoje não há regra.
- Cada `input` com `label` visível; `aria-describedby` para ajuda e erro; `aria-invalid`; `autocomplete` correto; sem `placeholder` como rótulo.
- Foco visível (`:focus-visible` já existe) e gerenciado a cada troca de tela/passo (a SPA hoje reescreve `innerHTML` e perde o foco); `aria-live` apenas na região de mensagens, não em `<main>` inteiro como hoje (leitor relê a tela toda).
- Teclado: modal/folha com foco preso, Esc e retorno do foco; menu da conta com Esc; ordem de Tab = ordem visual.
- Anti-corte: e-mail longo e nome de 60 caracteres sem espaço (`overflow-wrap: anywhere` e `min-width: 0` em `.kv dd`, cabeçalho, menu e selo); no cabeçalho atual, nome e "Sair" ficam em `row` sem quebra: permitir quebra ou truncar com `title`. CPF/CNPJ e código com `font-variant-numeric: tabular-nums`. Caixas do código com `minmax(0,1fr)` e fonte em `clamp()` para 320 px. Doze itens no menu: rolagem interna no menu, nunca na página. Zoom de 200%: conteúdo em coluna única e botão principal sem sair da tela; teclado virtual: botão principal acima do teclado (`scroll-margin`, `visualViewport`, não fixar rodapé que cubra o campo).
- Moeda e data: dd/mm/aaaa em todas as datas (o código atual usa `toLocaleDateString('pt-BR')`, ok); esta parte quase não tem moeda (plano na Parte 5, R$ 1.234,56).
- Marca só pelos PNGs `img/logo-rosa.png` e `img/mark-rosa.png`; o título "Lottus Sign" em texto no `h1` da seção 1 deve ser substituído por texto sem a marca ou pelo PNG [preencher: Yuri]. `alt` curto do logo.
- Divergência a avisar: `home.js` valida 8 caracteres e RN2 pede 10; `index.html` carrega fonte do Google (já permitida pela CSP).
- Captura por largura: `node scripts/smoke.mjs sign --shots <pasta>` em 320, 360, 390, 768, 1280, 1920 para as seis seções e cada estado de erro.

## 5. Estrutura do front (sem build, sem CDN)
Hoje `home.js` mistura cliente, visitante, recuperação e documentos. Proposta: módulos ES nativos (`<script type="module" src="js/app.js">`; passa em `script-src 'self'`, sem inline), todos em `apps/sign/js/`:
```
js/app.js          entrada: cliente Supabase, sessão, inicia o roteador
js/lib/router.js   hash, guarda de rota, retorno à origem
js/lib/ui.js       esc, shell, setErr, foco, toast, modal/folha, tabs, stepper
js/lib/fmt.js      máscaras CPF/telefone, data dd/mm/aaaa, moeda, validação de CPF/CNPJ (a do servidor manda)
js/lib/api.js      chamadas RPC e tradução de erros para os textos deste documento
js/views/entrar.js recuperar.js onboarding.js perfil.js verificacao.js seguranca.js
js/views/shell.js  barra/menu da área logada (Partes 2 a 5 só registram rotas)
```
`assinar.js`, `verificar.js` e `config.js` ficam; extrair `fmt` para `lib` evita duplicar. `vendor/supabase.js` continua local. Sem build: versionar por `?v=` no `index.html` e nos imports (ou manter um `js/version.js`) para cache. Cada view exporta `render(ctx)` e `title`; o `<title>` e o foco no `h1` mudam a cada rota. Estilo inline (`style="..."` espalhado em `home.js`) vira classes em `styles.css`.

**Rotas (hash)**: `#/entrar`, `#/criar`, `#/recuperar`, `#/nova-senha`, `#/onboarding/<n>`, `#/conta/perfil`, `#/conta/verificacao`, `#/conta/seguranca`, e das outras partes `#/documentos`, `#/envio/novo`, `#/plano`.
- Guarda: rota pública (entrar, criar, recuperar, nova-senha) ou privada. Privada sem sessão: grava `de=<hash original>` em `sessionStorage` (nunca em URL com dados), vai a `#/entrar` com o aviso "Sua sessão terminou. Entre de novo para continuar." e, após login, volta à rota gravada; só aceita rotas da lista branca (evita redirecionamento aberto).
- Onboarding pendente: toda rota privada exceto as da conta redireciona a `#/onboarding/<passo>` (RN18); concluído, `#/onboarding` leva a `#/documentos`.
- Links de e-mail: o Supabase devolve `#access_token...&type=recovery` ou confirmação no hash, que colide com o roteador. Tratar antes: ler `type`, limpar o hash com `history.replaceState` e então navegar a `#/nova-senha` ou ao onboarding. Os `redirectTo` hoje são `location.origin + location.pathname`; manter e registrar as URLs na lista do Auth [A].
- `onAuthStateChange` `SIGNED_OUT` (inclusive vinda de outra aba, via evento `storage`) redireciona a `#/entrar`; botão Voltar do navegador funciona porque cada passo é uma rota.
- Rota desconhecida: tela "Página não encontrada" com botão "Ir para o início".

**Não testado:** nada foi executado; este documento é especificação. Contrastes, alvos de 44 px e quebras são pontos de verificação para o `verificador`.
