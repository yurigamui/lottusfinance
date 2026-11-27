# Seção: Sign / Parte 1 / 1.2 Recuperar senha (inclui o pacote C2-13, ciclo 2 da 1.3)

Status da especificação: proposta do idealizador. Não foi executado nem testado nada. Li só o manual (seção 14), `app.js`, `router.js` e `entrar.js` (por busca), a migração 20261128 (purga, `sign_me`, `sign_onboarding_done`) e o `fake-sign.cjs` (por busca). Os demais insumos listados não foram lidos; conferir contra eles antes de gravar.
Hipóteses a confirmar:
- O comportamento do Auth (mensagens de erro, `signOut({scope:'others'})` na versão instalada do `supabase-js`).
- A lista de redirecionamento do Auth (P1-12), que depende do Yuri.

## Objetivo e papéis com acesso
- O usuário que esqueceu a senha volta à conta sozinho, usando só o Supabase Auth (custo zero). Não há RPC nova.
- `#/recuperar` e `#/nova-senha` são públicas.
- `#/nova-senha` só funciona com a sessão de recuperação aberta pelo link do e-mail.
- O pacote C2-13 corrige 8 itens abertos da 1.3 (M-01, B-1 a B-6, A13-B3).

## Entradas e saídas
| Elemento | Destino ou efeito | Condição |
|---|---|---|
| Entrar, "Esqueci a senha" | `#/recuperar`. Grava `lottus.sign.rec_email` (sessionStorage) só se o e-mail for válido. | Já existe no `entrar.js` linha 222. |
| `#/recuperar`, enviar | Chama `resetPasswordForEmail(email,{redirectTo: location.origin+location.pathname})`. Mostra a tela neutra "Enviamos". | E-mail válido. |
| `#/recuperar`, "Voltar ao Entrar" | `#/entrar` | Sempre visível. |
| Link do e-mail | O `app.js` abre a sessão, grava o marcador `lottus.sign.rec_ok=1` (sessionStorage, sem segredo) e vai a `#/nova-senha`. | `type=recovery` e sessão aberta. |
| Link vencido ou inválido | Hoje o `app.js` manda a `#/entrar` com aviso "vencido". **Mudança:** manda a `#/nova-senha`; o estado "link vencido" abre a tela com o botão para `#/recuperar`. Para isso o `app.js` grava `lottus.sign.rec_fail=1`, e a tela o consome uma vez. | `error_code` presente ou `setSession` com erro. |
| `#/nova-senha`, salvar | `updateUser({password})`, depois `signOut({scope:'others'})`, depois destino pós-login. | Senha válida e iguais. |
| `#/nova-senha` aberta direto, sem `rec_ok` | `#/recuperar` com aviso. | Sem marcador de recuperação. |

## Decisão: destino após trocar a senha (hipótese técnica, reversível)
Continuar logado e ir ao destino normal pós-login: `me().onboarding_done ? DEFAULT_AFTER : ONBOARDING`.

Justificativa:
- A sessão de recuperação já prova a posse do e-mail.
- Voltar ao Entrar obrigaria a digitar a senha recém-criada, uma etapa a mais.
- Não expõe a senha.
- `signOut({scope:'others'})` encerra os outros dispositivos, que é o ponto de segurança.

Ao concluir ou abandonar, o marcador `rec_ok` é apagado. Se o `signOut others` falhar, a troca vale mesmo assim, com o aviso "Senha alterada. Não conseguimos encerrar as outras sessões; entre em Perfil para sair dos outros aparelhos." Esse aviso vira pendência se não houver essa função no Perfil: registrar.

## Elementos e comportamento
| Elemento | Tipo | Comportamento | Validação |
|---|---|---|---|
| E-mail (recuperar) | campo | Pré-preenchido com `rec_email`, que é lido e apagado ao montar. Nunca vem por URL. | Mesma regra do Entrar (`normEmail`). Vazio: "Informe seu e-mail." Inválido: "Confira o e-mail digitado." |
| Enviar link | botão | Desabilita e mostra "Enviando…". Trava duplo clique por flag. | |
| Reenviar | botão | Contagem "Reenviar em 0:SS" de 60 s. Limite de 3 por hora no cliente, contado em memória e em sessionStorage `lottus.sign.rec_n` (só carimbos de hora). No limite: "Você já pediu 3 links. Tente de novo em N min." | 429 do Auth: o mesmo texto de limite, sem expor a causa. |
| Nova senha, Confirmar senha | campos senha | `autocomplete="new-password"`. Botão mostrar/ocultar com `aria-pressed`. Nunca vão ao DOM como texto, nem a storage, URL ou console. | Mínimo 10 caracteres (RN2). Contador "Faltam N caracteres" (singular "Falta 1 caractere") e medidor de 3 níveis com texto: Fraca, Média, Forte. As senhas devem ser iguais. |
| Salvar nova senha | botão | "Salvando…" e trava de duplo clique. Em erro, os campos mantêm o digitado e o foco vai ao primeiro erro. | |
| Duas abas | | A aba 2 que usar o mesmo link recebe sessão inválida e mostra o estado de link vencido. Se a aba 1 já trocou a senha, a aba 2 mostra "Este link venceu ou já foi usado. Peça um novo." | |
| F5 em `#/nova-senha` | | Com `rec_ok` e sessão persistida, a tela se mantém. Sem eles, volta a `#/recuperar` com aviso. | |
| Voltar do navegador | | Vindo de `#/nova-senha` com sucesso, o histórico usa `replace` e não volta ao formulário. | |

Regras de construção:
- Tudo via helper `setKids`.
- Sem `innerHTML` com dado do usuário.
- Foco: o título recebe foco ao trocar de estado, com `aria-live="polite"` para o contador e para os erros.

## Estados
- **Recuperar**
  - Carregando: botão "Enviando…".
  - Erro de rede: "Sem conexão. Verifique a internet e tente de novo."
  - 429: texto de limite.
  - Sucesso: a tela neutra aparece **sempre** que o Auth responde OK, com e-mail existente ou não. Erros 4xx do Auth que revelariam a existência da conta (inclusive `user_not_found`) caem no mesmo texto neutro. Só rede e 429 são mostrados.
  - Sem permissão e vazio: não se aplicam.
- **Nova senha**
  - Verificando sessão: "Verificando o link…".
  - Link vencido ou usado: com botão "Pedir novo link".
  - Sem sessão: aviso e redirecionamento.
  - Senha fraca ou vazada (`weak_password`, e `pwned` quando o Auth devolver): "Essa senha é fraca ou já apareceu em vazamentos. Escolha outra."
  - Mesma senha (`same_password`): "A nova senha precisa ser diferente da atual."
  - Sessão caída no envio (401/403): estado link vencido.
  - 429: "Muitas tentativas. Aguarde um pouco e tente de novo."
  - Rede: o texto de rede acima.
  - Erro desconhecido: "Não foi possível alterar a senha. Tente de novo." Nunca o texto cru do Auth.
  - Sucesso: faixa "Senha alterada." e redirecionamento imediato.

## Dados lidos e escritos
- Só o Supabase Auth: `resetPasswordForEmail`, `setSession`, `updateUser`, `signOut({scope:'others'})`, `getSession`.
- Depois do sucesso, lê `sign_me` (RPC existente) para decidir o destino.
- sessionStorage: `lottus.sign.rec_email` (e-mail, apagado ao ler), `lottus.sign.rec_ok`, `lottus.sign.rec_fail`, `lottus.sign.rec_n`.
- Nenhum dado novo em tabela. O e-mail é fonte única do Auth.
- Pendência P1-12 (Yuri ou infraestrutura): incluir `location.origin+pathname` do Sign (produção e testes) na lista de redirecionamento do Auth. Sem isso o link cai no Site URL.
- Pendência: o modelo do e-mail de recuperação no Auth deve estar em PT-BR, com texto `[preencher]`. É texto de marca, do Yuri.

## Textos da interface (PT-BR exatos)
- **Recuperar**
  - Título: "Recuperar senha".
  - Apoio: "Informe o e-mail da sua conta. Se ele puder ser usado, enviamos um link para criar uma nova senha."
  - Botão: "Enviar link".
  - Link: "Voltar ao Entrar".
- **Tela neutra**
  - Título: "Verifique seu e-mail".
  - Corpo: "Se este e-mail puder ser usado, enviamos o link. Ele vale por tempo limitado. Veja também a caixa de spam."
  - Ações: "Reenviar" e "Usar outro e-mail".
- **Nova senha**
  - Título: "Criar nova senha".
  - Rótulos: "Nova senha" e "Confirmar nova senha".
  - Botão: "Salvar nova senha".
  - Mostrar/ocultar: "Mostrar senha" e "Ocultar senha".
  - Erro de confirmação: "As senhas não são iguais."
- **Link vencido**
  - Título: "Link inválido".
  - Texto: "Este link venceu ou já foi usado. Peça um novo."
  - Botão: "Pedir novo link". Link: "Voltar ao Entrar".
- **Aviso sem sessão** (na tela Recuperar): "Para trocar a senha, peça um link ao seu e-mail."
- **Sucesso**: "Senha alterada."

## Layout por faixa
- 320 px: coluna única `.sg-single`, botões em largura total, e-mail com `overflow-wrap:anywhere`.
- 768 px: cartão centralizado, até 420 px.
- 1280 a 2560 px: o cartão se mantém em 420 px, sem esticar.
- Ícones SVG em banner, toast ou vazio: teto de 32 px.
- Sem rolagem horizontal. Foco visível. Alvos de toque de pelo menos 44 px. Os dois temas.

## Orçamento de desempenho
- JS adicional ≤ +3 kB gzip. Uma view nova `recuperar.js` e uma `novasenha.js`, ou um único arquivo `senha.js`.
- Sem biblioteca nova.
- Medir o gzip antes e depois com o script existente.
- A troca de estado em até 100 ms depois da resposta.

## Critérios de aceite

### A) Recuperar e Nova senha (Playwright contra `fake-sign.cjs`)
- **AC1.** Dado e-mail válido, quando envia, então `POST /auth/v1/recover` ocorre com `redirect_to` igual a `origin+pathname` e aparece a tela neutra.
- **AC2.** Dado e-mail inexistente, ou o fake em `revealExisting`, quando envia, então a tela e o texto são idênticos ao do AC1, byte a byte.
- **AC3.** Dado "Esqueci a senha" no Entrar com e-mail preenchido, quando abre `#/recuperar`, então o campo vem preenchido, a URL não contém o e-mail e `rec_email` já foi apagado.
- **AC4.** Dada a tela neutra, então "Reenviar" fica desabilitado com a contagem de 60 s e libera no fim, com relógio simulado. No 3º reenvio na hora, aparece o texto de limite sem chamar a rede.
- **AC5.** Dado 429 no fake, quando envia, então aparece o texto de limite e o botão volta.
- **AC6.** Dada a rede derrubada, então aparece o texto de rede e o digitado é mantido.
- **AC7.** Dado link recovery válido no hash, então o hash é apagado da URL, a tela é `#/nova-senha` e o título é "Criar nova senha".
- **AC8.** Dada senha com 9 caracteres, então aparece "Faltam 1 caractere" e o botão não envia. Com 10 e confirmação diferente, aparece "As senhas não são iguais."
- **AC9.** Dado o botão de olho, então o tipo do campo alterna e `aria-pressed` fica coerente. Após o envio, a senha não existe em `document.body.innerText`, `localStorage`, `sessionStorage`, URL nem `console`.
- **AC10.** Dados dois cliques rápidos em Salvar, então há exatamente 1 `PUT /auth/v1/user`.
- **AC11.** Dado sucesso, então aparece "Senha alterada.", ocorre 1 `POST /auth/v1/logout?scope=others`, a sessão continua e o destino é o normal conforme `onboarding_done`. O Voltar não reabre o formulário.
- **AC12.** Dado `signOut others` com erro, então a troca vale e aparece o aviso de sessões não encerradas.
- **AC13.** Dado link vencido (`#error_code=otp_expired`) ou `setSession` com erro, então aparece "Este link venceu ou já foi usado. Peça um novo." com o botão que vai a `#/recuperar`.
- **AC14.** Dado `#/nova-senha` aberto direto sem `rec_ok`, então vai a `#/recuperar` com o aviso. Dado F5 com `rec_ok` e sessão, a tela permanece.
- **AC15.** Dada senha fraca ou vazada (422 `weak_password`), mesma senha (`same_password`) e 401 na troca, então cada um mostra seu texto, sem texto cru do Auth.
- **AC16.** Dadas duas abas com o mesmo link, quando a 2ª tenta usar depois da 1ª, então mostra link vencido.
- **AC17.** Dado o percurso completo Entrar → Esqueci → e-mail → link → senha → destino, então todos os passos funcionam e cada tela tem "Voltar ao Entrar" ou equivalente. O percurso não tem beco.
- **AC18.** Dado `t-texto.cjs` ampliado para as telas novas, então não há `null`, `undefined`, `[object Object]`, `NaN`, `{n}`, `{mm}`, inglês nem códigos crus, nos 6 estados de cada tela. A senha nunca aparece no DOM como texto.
- **AC19.** Dadas as larguras 320, 768, 1280 e 2560 nos dois temas, então não há rolagem horizontal nem corte. O verificador abre e olha cada captura (24 no mínimo).

**O que adicionar ao `fake-sign.cjs`:**
- `POST /auth/v1/recover`: registra `redirect_to` e `email` e responde 200 `{}` sempre. Modo `rl429.recover` e modo `down`.
- `PUT /auth/v1/user` (hoje a rota `/auth/v1/user` só trata leitura): modos `weak` (422 `weak_password`), `same` (422 `same_password`), `expired` (401) e `rl429.update`. Em sucesso, grava um contador de chamadas.
- `POST /auth/v1/logout`: ler `scope` da query e registrar. Modo `others500`.
- Emissor de link recovery: `#access_token=…&refresh_token=…&type=recovery`, e variantes vencido e já usado.
- Contadores consultáveis (`state.calls`) para os ACs de "exatamente 1".

### B) Pacote C2-13 (AC-R)
- **AC-R1 (M-01).** Dada a migração nova `/home/user/lottusfinance/supabase/migrations/20261129120000_sign_ciclo2_1_3.sql`, que é idempotente (`create or replace`), tem grants explícitos (`revoke all … from public, anon, authenticated` e `grant execute` onde já havia), tem reversão comentada e **não é aplicada**:
  - O cabeçalho lista o que **não reverte**: dados já gravados e `onboarding_done=true` já marcado antes não são desfeitos.
  - `_sign_name_norm` (ou o cálculo em `sign_me.profile_complete` e `sign_onboarding_done`, hoje em `20261128120000` linhas 159 e 172) remove U+200B, U+200C, U+200D, U+2060 e U+FEFF, além de espaços, antes de medir o tamanho e o espaço interno.
  - Teste de banco ANTES (`SIGN_DB_ANTES`, esquema da 20261128) e DEPOIS (`SIGN_DB`, com a nova), em bancos isolados e exportados. Nomes: só U+200B, só U+2060, só U+FEFF, só espaços e "Ana<U+200B>" com 1 palavra. ANTES: aceita (prova da falha). DEPOIS: `profile_complete=false` e `onboarding_incomplete`. Nome válido "Ana Souza" continua passando.
- **AC-R2 (B-1).** Dado erro de carga nos passos 2 e 3 do onboarding, então o `h1` é o título do passo correspondente, e não o do passo 1.
- **AC-R3 (B-2).** Dado e-mail longo no topo em 320 px, então não quebra no meio da palavra: `overflow-wrap:normal` com reticências e `title` com o e-mail inteiro. Sem rolagem horizontal.
- **AC-R4 (B-3).** Dado passo 3 sem `certEndpoint`, então "Gerar desafio" fica desligado com o indicador. "Pular certificado" aparece só sem certificado vinculado. Com certificado vinculado, só "Concluir".
- **AC-R5 (B-4).** Dado o resumo, então as tags ficam alinhadas na mesma coluna, nas 4 larguras.
- **AC-R6 (B-5).** Dado `contact_kind='email'`, então o Perfil mostra "E-mail confirmado". Com `'phone'`, mostra "Celular verificado". Quando o celular guardado difere do contato verificado, o Perfil diz que ele **não** é o contato verificado: "Este celular ainda não foi verificado. O contato verificado é o e-mail."
- **AC-R7 (B-6 e A13-B3).** Dado `_sign_outbox_purge` (versão atual em `20261128120000` linhas 68 a 80, com faixas limitadas por data), então remove `code` de **qualquer** linha com mais de 15 min, em todos os estados e sem limite inferior de data, sem apagar linhas, retornando a contagem. Teste de banco: linhas em queued, sent e failed, com idades de 10 min, 20 min, 2 dias e 40 dias. Só as de mais de 15 min perdem `code`, a contagem de linhas é igual e a 2ª execução retorna 0. A regra "queued com mais de 1 dia vira failed" é mantida.

## Reverificação (regra 14)
Tocam `router.js`, `ui.js`, `entrar.js`, `shell.js`, `onboarding.js`, `perfil.js` e `app.js`. Por isso reverificar:
- 1.0, 1.1, 1.3, 1.4 e 1.5.

Fazer e registrar:
- Rodar `node scripts/check.mjs`.
- Subir a versão `?v=` dos módulos.
- Conferir o CSP em `apps/sign/_headers`: sem origem nova.
- Atualizar `mapa-de-vinculos.md` com Entrar ↔ Recuperar ↔ Nova senha ↔ destino.
- Banco isolado `SIGN_DB`/`SIGN_DB_ANTES` exportados.
- Teto de 32 px para svg em banner, toast e vazio.

## Pendências e decisões em aberto
- P1-12 (lista de redirecionamento do Auth): Yuri.
- Modelo do e-mail de recuperação em PT-BR: Yuri, `[preencher]`.
- Política de senha do Auth (mínimo 10, proteção contra senhas vazadas): confirmar no painel. O cliente valida 10, mas o servidor decide. Se o Auth estiver com 6, o cliente continua exigindo 10. Registrar a divergência.
- Limite real de e-mails por hora: do Auth, não do Sign. Com o SMTP padrão ele é muito baixo. Se o Yuri contratar SMTP próprio, é serviço pago (decisão dele).
- Decisão técnica "continuar logado": registrar em `decisoes.md`.
- Usuário já logado (sem `rec_ok`) que abre `#/recuperar` ou `#/nova-senha`: o comportamento do roteador para rotas públicas com sessão não foi verificado; o construtor deve conferir.
