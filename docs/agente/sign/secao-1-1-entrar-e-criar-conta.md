# Seção: Sign / Parte 1 / 1.1 Entrar e criar conta
v0.1 · 24/11/2026 · Idealizador (gravado pelo Maestro). Limites numéricos são hipóteses do Arquiteto; jurídico é `[preencher]`.

## Decisões do Maestro sobre a especificação (24/11/2026)
- CPF e celular **saem do cadastro** e vão ao onboarding (1.3) e ao perfil (1.4): dado mínimo (RN14) e não confiar em `raw_user_meta_data` (R3/R5). O cadastro envia ao Auth só e-mail e senha; o nome vai como sugestão em `data.name`.
- O texto de bloqueio por tentativas é o **genérico** ("Aguarde alguns minutos"), sem prometer 15 minutos.
- `sign_terms_accept` (aceite versionado) é proposta de migração para a 1.5 e **não** é aplicada; até lá o front envia `terms_version` e `privacy_version` em `data` do `signUp`.

## Objetivo e papéis com acesso
Autenticar ou cadastrar o Remetente por e-mail e senha, confirmar o e-mail (reenvio com limite) e entregá-lo à rota certa. Acesso: Visitante (sem sessão). Quem já tem sessão válida em `#/entrar` ou `#/criar` é redirecionado (AC15).
Fora do escopo: recuperar senha (1.2, só o link), onboarding (1.3), perfil (1.4), código de contato (1.5), MFA e "Sair" da conta (1.6). Login social.

## Entradas e saídas
| Elemento | Destino ou efeito | Condição |
| --- | --- | --- |
| Raiz do Sign, "Entrar" das páginas públicas | `#/entrar` | sem sessão |
| Login correto, e-mail confirmado, `sign_me.onboarding_done` = false | `#/onboarding/1` (1.3) | RN18 |
| Login correto, onboarding concluído | rota de origem guardada, ou `#/documentos` (Parte 2) | rota na lista branca |
| Login correto, e-mail não confirmado (RN1) | tela "Confirme seu e-mail" desta seção, sem sessão ativa | `email_not_confirmed` |
| "Esqueci a senha" | `#/recuperar` (1.2); o e-mail digitado vai em `sessionStorage`, nunca na URL | sempre visível no Entrar |
| "Verificar um documento" | `verificar.html` (Parte 4) | sempre visível |
| Link de confirmação do e-mail | `#/entrar` com aviso de sucesso, ou `#/onboarding/1` se a sessão abriu | hash tratado antes do roteador (R-6) |
| Termos e Política | páginas do Site, nova aba, `rel="noopener"` | URL [preencher: J-02] |

Enquanto as Partes 2 a 5 e as seções 1.2 a 1.6 não existem, os destinos `#/documentos`, `#/onboarding/1` e `#/recuperar` mostram uma tela provisória "Em construção" **com saída** (sair e voltar ao Entrar), nunca beco sem saída.

## Elementos e comportamento
| Elemento | Tipo | Comportamento | Validação |
| --- | --- | --- | --- |
| Abas Entrar / Criar conta | `role=tablist`; setas trocam, Tab segue ao campo | troca a rota `#/entrar` ou `#/criar`; `aria-selected` | n/a |
| E-mail | `input type=email`, `autocomplete=username` | `trim` e minúsculas ao enviar | formato; até 254 caracteres |
| Senha | `input password`, botão "Mostrar" (44 px) | `current-password` no Entrar, `new-password` no Criar | Criar: mínimo 10 (RN2), contador "Faltam N"; Entrar: obrigatória |
| Nome completo (só Criar) | `input`, `autocomplete=name` | espaços normalizados | 2 ou mais palavras; até 140 caracteres |
| Aceite (só Criar) | checkbox com rótulo e dois links | desmarcado por padrão | obrigatório |
| Entrar / Criar conta | botão principal único (`.btn.lg.block`) | `aria-busy` e desligado durante a chamada | Enter envia |
| Reenviar e-mail | botão na tela "Confirme seu e-mail" | contagem de 60 s; limite de 3 por hora por navegador; o Auth freia no servidor | n/a |
| Usar outro e-mail | link | volta ao Criar, com o e-mail limpo | n/a |

Regras testáveis:
- **R-1** Senha com menos de 10 caracteres é recusada na tela antes da chamada; o erro de senha do Auth é mapeado ao mesmo texto.
- **R-2** E-mail inexistente e senha errada mostram o mesmo texto, no mesmo elemento, com o mesmo foco (RN3).
- **R-3** Cadastro com e-mail existente mostra o mesmo texto do cadastro novo (RN4). Se o Auth revelar `already registered`, o front mapeia para o texto neutro e registra P1-12.
- **R-4** Sem bloqueio próprio de 15 min por e-mail. 429 ou `over_request_rate_limit` do Auth vira o texto de "Muitas tentativas".
- **R-5** Reenvio por `auth.resend({type:'signup'})`; cliente impõe 60 s entre envios e 3 por hora; 429 vira o texto de limite. Reenviar nunca informa se a conta existe.
- **R-6 (links do e-mail)** Antes do roteador, `app.js` lê `location.hash`. Se houver `access_token` ou `error_code`, cria o cliente com `detectSessionInUrl:false`, processa o hash uma vez e o apaga com `history.replaceState`. Casos: `type=signup`, `type=recovery` (encaminha à 1.2), `error=access_denied` com `otp_expired`. O hash nunca é tratado como rota. `redirectTo` = `location.origin + location.pathname` (a registrar na lista do Auth, P1-12).
- **R-7** Origem: `de=<hash>` em `sessionStorage`, só se estiver na lista branca; qualquer outro valor leva a `#/documentos`.
- **R-8** A senha nunca vai a URL, log, `localStorage` ou texto de erro; é limpa após erro de rede.
- **R-9** Sem script inline e sem `style=""`. Módulos ES (`js/app.js`, `js/lib/{router,ui,api,fmt}.js`, `js/views/entrar.js`) por `<script type="module">`; CSP `script-src 'self'` inalterada. Marca só por `img/logo-rosa.png` (`alt="Lottus"`); o `h1` é texto neutro, sem "Lottus Sign" em texto.

## Estados
- **Carregando:** `.spinner` (`aria-label="Carregando"`) na troca de rota; botão com `aria-busy`.
- **Vazio:** não se aplica.
- **Erro:** de campo (`.ferr`, `aria-describedby`, `aria-invalid`) e geral (`role="alert"`); de rede com "Tentar de novo"; foco no primeiro campo inválido.
- **Sem permissão:** sessão expirada em rota privada leva ao Entrar com o aviso de sessão.
- **Sucesso:** tela "Confirme seu e-mail" (cadastro) ou redirecionamento (login); foco no `h1`; `aria-live` só na região de mensagens, não no `main`.
- **Muitos dados:** e-mail de 254 e nome de 140 caracteres sem espaço quebram linha (AC13).

## Dados lidos e escritos
- **Escreve:** `auth.users` via `signUp` e `resend`. Nenhum campo de pessoa fora de `profiles` (nome e CPF nascem na 1.4).
- **Lê:** `auth.getSession`; `sign_me()` (`onboarding_done`; `email_not_confirmed` = mostrar a tela de confirmação).
- Nenhuma RPC recebe id de usuário (RN17).
- O `fake-supabase` precisa ganhar `/auth/v1/resend`, `sign_me` e os modos forçáveis (usuário inexistente, senha errada, não confirmado, 429, atraso, queda de rede).

## Textos da interface (PT-BR, exatos)
- Título da aba: "Entrar · Lottus Sign". `h1`: "Entrar" e "Criar conta". Subtítulo do Entrar: "Acesse seus documentos e envios."
- Rótulos: "E-mail", "Senha", "Nome completo", "Mostrar", "Ocultar", "Entrar", "Criar conta", "Esqueci a senha", "Verificar um documento".
- Aceite: "Li e aceito os [Termos de uso] e a [Política de Privacidade] (versão [preencher J])."
- Ajuda (RN14): e-mail, "Para entrar e receber avisos."; nome, "Para identificar você como remetente."; senha, "Mínimo de 10 caracteres."
- Campos: "Informe um e-mail válido." · "Informe a senha." · "A senha precisa ter pelo menos 10 caracteres. Faltam N." · "Informe o nome completo." · "Aceite os Termos e a Política para criar a conta."
- Login errado ou inexistente (idêntica): "E-mail ou senha incorretos."
- Muitas tentativas: "Muitas tentativas. Aguarde alguns minutos e tente de novo, ou use Esqueci a senha."
- Cadastro, neutra: "Se este e-mail puder ser usado, enviamos um link de confirmação para {e-mail}. Abra o e-mail e volte para entrar. Se você já tem conta, entre ou use Esqueci a senha."
- Não confirmado: "Confirme seu e-mail para continuar. Enviamos um link para {e-mail}."
- Reenvio: "Reenviar e-mail" · "Reenviar em {n} s" · "Enviamos de novo. Verifique também a caixa de spam." · "Você atingiu o limite de reenvios. Tente em 1 hora."
- Link: "Este link venceu ou já foi usado. Peça um novo." · "E-mail confirmado. Entre para continuar."
- Rede e geral: "Não foi possível concluir agora. Verifique sua conexão." (botão "Tentar de novo") · "Não foi possível concluir agora. Tente de novo."
- Sessão: "Sua sessão terminou. Entre de novo para continuar."
- Tela provisória: "Esta área está em construção." com "Sair" e "Voltar ao início".

## Layout por faixa
- **Celular (320 a 767):** uma coluna, campos a 100%, alvos de 44 px, `100dvh`, botão principal alcançável com teclado aberto.
- **Tablet (768):** cartão centralizado, máximo de 480 px.
- **Desktop (1280 ou mais):** duas colunas (apresentação e cartão) com largura máxima; em 1920 e 2560 centraliza, sem esticar.
- Contêineres com `min-width:0` e `overflow-wrap:anywhere`; sem rolagem horizontal.

## Orçamento de desempenho
Hipótese a medir: tela interativa em até 1 s em 4G simulado; JS da seção até 60 kB sem o vendor; sem salto de layout ao carregar a fonte.

## Critérios de aceite
Ambiente: Playwright contra `fake-supabase` local (modelo `scripts/wealth-local`). Larguras L = 320, 360, 390, 768, 1280, 1920, 2560.
- **AC1.** Dado visitante em `#/entrar`, quando abro o Sign, então a aba Entrar está ativa, o foco está no E-mail, há 1 `h1`, "Esqueci a senha" e "Verificar um documento" estão visíveis e o logo é o PNG.
- **AC2.** Dado e-mail e senha válidos, conta confirmada e onboarding pendente, quando envio, então a rota vira `#/onboarding/1` e `sign_me` foi chamada.
- **AC3.** Dado onboarding concluído e `de=#/envio/novo`, quando entro, então vou a `#/envio/novo`. Dado `de=https://externo.com`, vou a `#/documentos`.
- **AC4.** Dado e-mail inexistente e depois senha errada de conta real, quando envio cada um, então texto, elemento e foco são idênticos.
- **AC5.** Dado e-mail inválido ou senha vazia, quando envio, então não há chamada de rede, o texto de campo aparece e o foco vai ao campo.
- **AC6.** Dado o Criar com senha de 9 caracteres, quando envio, então "A senha precisa ter pelo menos 10 caracteres. Faltam 1." e nenhum `signUp`. Com 10 caracteres, a chamada acontece.
- **AC7.** Dado o Criar sem o aceite, quando envio, então o erro do aceite aparece e não há `signUp`. Com aceite, o corpo do `signUp` contém `terms_version` e `privacy_version`.
- **AC8.** Dado `signUp` com e-mail novo e com e-mail já existente, quando comparo as telas, então o texto é o mesmo e nenhum contém "já existe". O corpo do `signUp` não contém CPF nem celular.
- **AC9.** Dado cadastro feito, quando vejo "Confirme seu e-mail", então o e-mail aparece sem corte, "Reenviar e-mail" fica desligado por 60 s com contagem, o 4º reenvio em 1 h mostra "Você atingiu o limite de reenvios. Tente em 1 hora." e, com 429 do fake, o mesmo texto.
- **AC10.** Dado login de conta não confirmada, quando envio, então "Confirme seu e-mail para continuar. Enviamos um link para {e-mail}." e nenhuma rota privada abre.
- **AC11.** Dado o hash `#access_token=...&type=signup` no carregamento, quando a página abre, então o hash é apagado, nenhuma "rota desconhecida" aparece e o resultado é `#/onboarding/1`. Dado `#error=access_denied&error_code=otp_expired`, então aparecem "Este link venceu ou já foi usado. Peça um novo." e o botão de reenvio. O Voltar do navegador não reabre o hash.
- **AC12.** Dado `#access_token=...&type=recovery`, quando abre, então encaminha a `#/nova-senha` (1.2) sem mostrar o formulário de entrar.
- **AC13 (anti-corte).** Dado e-mail de 254 caracteres e nome de 140 sem espaços, quando digito, envio com erro e vejo "Confirme seu e-mail", então em todas as larguras L `scrollWidth <= innerWidth`, nada fica fora do cartão (`getBoundingClientRect`) e os textos quebram linha.
- **AC14 (zoom 200%).** Dado zoom de 200% em 320 e 1280, quando navego por Entrar, Criar e "Confirme seu e-mail", então sem rolagem horizontal, campos e botão principal alcançáveis por Tab e visíveis, alvos com 44 px ou mais.
- **AC15.** Dado sessão válida, quando abro `#/entrar`, então redireciona conforme AC2 ou AC3 sem mostrar o formulário. Dado `SIGNED_OUT` vindo de outra aba (evento `storage`), a aba vai a `#/entrar`.
- **AC16 (teclado e leitor).** Dado só teclado, quando navego, então Tab segue a ordem visual, setas trocam de aba, Enter envia, o erro leva o foco ao primeiro campo inválido, `aria-invalid` e `aria-describedby` estão corretos, o `aria-live` fica só na região de mensagens, e a rota nova move o foco ao `h1` e muda o `<title>`.
- **AC17 (rede).** Dado erro de rede ou atraso no fake, quando envio, então o botão volta ao normal, aparece "Não foi possível concluir agora. Verifique sua conexão." com "Tentar de novo", o digitado é preservado e a senha é limpa.
- **AC18 (segurança estática).** `node scripts/check.mjs` passa nos arquivos do Sign; sem `<script>` inline nem `style=""` nas views da seção; CSP não afrouxada; senha ausente de `localStorage`, URL e console.
- **AC19 (marca).** Logo só de `img/logo-rosa.png`, favicon de `img/mark-rosa.png`; não existe "Lottus Sign" como `h1` em texto.
- **AC20 (capturas).** Captura por largura L dos estados Entrar, Criar com erro, "Confirme seu e-mail" e link vencido, em tema claro e escuro.

## Pendências geradas
P1-12 (conferir no painel do Auth: "Confirm email", senha mínima, se o `signUp` revela e-mail existente, lista de redirecionamento) · P1-13 (RPC `sign_terms_accept`, não aplicada) · J-02/P1-10 (textos, URLs e versão de Termos e Privacidade) · P1-11 (SMTP e limite de e-mails) · D-01 (divergências do front atual).
