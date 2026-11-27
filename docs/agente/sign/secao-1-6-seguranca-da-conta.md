# Seção: Sign / Parte 1 / 1.6 Segurança da conta + pacote C2-12 (ciclo 2 da 1.2)

Status: especificação (Fase 3.0). Nada foi construído nem aplicado. Rota `#/conta/seguranca` (aba "Segurança"), custo zero, só Supabase Auth. A única mudança no banco é a migração do C2-12 (nome) e a `_sign_aal_ok` (D5). Preço, plano e jurídico não entram. Itens marcados como hipótese precisam de confirmação do Yuri ou de teste no Auth real. Os insumos foram lidos só em parte: `api.js`, `senha.js`, trechos de `entrar.js`, router e ui, e a migração 20261129. Não li `/root/sign-schema.sql`, `construcao.js`, `styles.css`, `_headers` nem o fake. O verificador deve conferir `_headers` (CSP `img-src`) e a assinatura real das RPCs antes de construir.

## Objetivo e papéis com acesso
O usuário logado, com e-mail confirmado, controla a segurança da própria conta: trocar a senha, sair dos outros aparelhos, ligar ou desligar a verificação em duas etapas (TOTP) e sair desta sessão. O mesmo pacote fecha o ciclo 2 da 1.2.
- Acesso: qualquer sessão válida. A rota tem `gate:false` no router, porque quem ainda não concluiu o onboarding também pode trocar a senha.
- Sem sessão: vai para `#/entrar?de=…` (`#/conta/seguranca` já está na lista de destinos permitidos).
- Sessão aal1 com MFA ativo: não entra no app, volta para o código (D5 e etapa do código).

## Decisões desta ficha (registrar em decisoes.md)
- **D1. Reautenticação para trocar a senha.** Pedir "Senha atual" em campo próprio e conferi-la com `signInWithPassword` num **cliente descartável** (`persistSession:false`, `autoRefreshToken:false`).
  - Motivo: `signInWithPassword` no cliente principal derrubaria a sessão aal2 e o `updateUser` falharia para quem tem MFA.
  - Depois da conferência o cliente descartável faz `signOut({scope:'local'})`, que revoga só aquela sessão.
  - O erro `invalid_credentials` vira "Senha atual incorreta."
  - "Login recente" não é aceito, porque o tempo da sessão não é confiável no cliente.
  - A senha atual conta na cota de tentativas do Auth. Limitação conhecida.
- **D2. "Sair dos outros aparelhos" sem o `signOut` do supabase-js.** Ele devolve sucesso em 401, 403 e 404 (A12-B2). Em vez dele, `api.signOutOthers()` faz `fetch` direto em `POST /auth/v1/logout?scope=others`, com o token da sessão e o `timedFetch`. Só 204 ou 200 é sucesso.
  - 401 ou 403: sessão morta, então `dropSession` e `#/entrar`.
  - 404 ou 5xx: "Não foi possível encerrar agora".
  - 429: texto de limite.
  - Rede: texto de rede.
  - A 1.2 passa a usar a mesma função.
- **D3. Sem códigos de recuperação.** O Auth gratuito não os oferece. A tela avisa antes de ativar e na confirmação final. A remoção do fator de quem perdeu o aplicativo é pela equipe (P1-03), com verificação manual de identidade. Pendência P1.6-01: procedimento do suporte, com o Yuri.
- **D4. PKCE (A12-M1): não adotar agora.** O fluxo atual é implícito, com o hash tratado pelo app (`detectSessionInUrl:false`).
  - PKCE exige abrir o link no mesmo navegador do pedido, o que quebra o e-mail aberto no celular ou em outro aplicativo.
  - O risco de fixação de sessão é tratado pela exibição da conta mais o aviso (AC-R1).
  - Reavaliar quando houver SMTP próprio (A12-M3, Yuri).
- **D5. MFA só no cliente não basta.** Sem checagem no servidor, quem tem a senha obtém um token aal1 e chama os RPCs direto.
  - Recomendação: migração `20261130130000_sign_aal2.sql` com `_sign_aal_ok()` (true se `auth.jwt()->>'aal'='aal2'` ou o usuário não tem fator `verified` em `auth.mfa_factors`).
  - Ela é chamada no início de `sign_me`, `sign_profile_save`, `sign_phone_send`, `sign_phone_verify`, `sign_cert_challenge` e `sign_onboarding_done`. Quando falha, levanta `aal2_required`, que o `classify` traduz como `mfa` e leva ao código.
  - Idempotente, com reversão, grants explícitos, **não aplicada**.
  - A função de borda do certificado também precisa checar o `aal` do JWT. Pendência.
  - Sem isso a 1.6 não pode dizer que o MFA "protege a conta": fica "não verificado".
- **D6. QR code.** `totp.qr_code` do supabase-js é um data-URI de SVG (hipótese a confirmar no Auth real). Renderizar em `<img alt>` (nunca `innerHTML`). Sem biblioteca de CDN.
  - O CSP de `apps/sign/_headers` precisa de `img-src 'self' data:`. Verificar e ajustar só essa diretiva.
  - O QR fica num contêiner de 192 px com fundo branco, fora do teto de 32 px dos svg de ícone, e é justificado em comentário no CSS.

## Entradas e saídas
| Elemento | Destino ou efeito | Condição |
| --- | --- | --- |
| Aba "Segurança" (perfil, verificação) | `#/conta/seguranca` | sessão válida |
| Aviso da 1.2 "Abrir Segurança" | `#/conta/seguranca`, foco em "Outros aparelhos" | só quando a 1.2 não conseguiu sair dos outros |
| "Sair desta sessão" | `api.signOut()` local, depois `#/entrar` | sempre |
| Senha trocada | permanece na tela, campos limpos, `signOutOthers` | senha atual correta, nova válida |
| MFA ativado ou desativado | permanece na tela, status atualizado | código correto |
| Entrar, senha correta e `nextLevel==='aal2'` | etapa "Código de verificação" (sem `afterLogin`) | fator `verified` existe |
| Nova senha (1.2) com MFA | etapa de código antes do formulário | link de recuperação com `nextLevel==='aal2'` |
| Link "Preciso de ajuda" na tela do código | suporte (`suporte()` do perfil-form) | sempre |

## Elementos e comportamento
**Estrutura.** `pageHead('Conta', …)`, `abasConta`, depois 4 cartões nesta ordem: "Esta sessão", "Senha", "Verificação em duas etapas", "Outros aparelhos".

**Esta sessão (D)**
- `Conectado como <e-mail da conta>`: leitura de `getUser()` (servidor), nunca de cache de URL.
- `Último login registrado: dd/mm/aaaa hh:mm` (America/Sao_Paulo), lido **ao abrir a tela** (a conferência de D1 atualiza o campo no servidor). Se o campo não vier, a linha não aparece.
- Botão secundário "Sair desta sessão" (`signOut` local, sem confirmação, volta para o Entrar).

**Senha (A)** usa o componente extraído `views/campo-senha.js` (`pwField`, `nivel`, contador "Faltam n caracteres", medidor, confirmação, mostrar/ocultar). A 1.2 e a 1.6 importam dele; `senha.js` perde o código duplicado.
- Campos: "Senha atual" (`autocomplete=current-password`), "Nova senha" e "Confirmar nova senha" (`new-password`). Mínimo de 10 caracteres.
- Ordem das validações: atual vazia → nova curta → confirmação diferente → nova igual à atual (checagem local, e `same_password` do Auth também) → conferir a atual → `updateUser` → `signOutOthers`.
- Duplo clique envia uma vez só (`ocupado`).
- Sucesso: limpa os 3 campos e mostra o toast "Senha alterada." (sem o texto "entre em Perfil").
  - Se `signOutOthers` falhar: banner de atenção "Senha alterada, mas não conseguimos sair dos outros aparelhos. Use Sair de todos os outros aparelhos abaixo." Não é toast de sucesso.

**Verificação em duas etapas (C)** com chip "Ativa" ou "Inativa" e, se ativa, "Ativada em dd/mm/aaaa" (`factor.updated_at` do fator `verified`; hipótese a confirmar no Auth real, sem a data se vier vazio).
- Inativa mostra o botão "Ativar verificação em duas etapas".
  1. Aviso antes de ativar: "Se você perder o aplicativo, só a equipe da Lottus consegue remover a verificação, depois de confirmar sua identidade. O Lottus não gera códigos de recuperação." Botões "Continuar" e "Cancelar".
  2. Ao continuar: `listFactors` → `unenroll` dos fatores `unverified` esquecidos → `mfa.enroll({factorType:'totp', friendlyName:'Aplicativo autenticador'})` → mostra o QR (`<img alt="QR code para o aplicativo autenticador">`).
  3. Alternativa: "Não consegue ler o QR? Digite este código no aplicativo" mostra o segredo em `<code>` agrupado de 4 em 4, com o botão "Copiar" (clipboard; feedback "Copiado" por 2 s; sem clipboard, o texto fica selecionável).
  4. Campo "Código de 6 dígitos" (`inputmode=numeric`, `autocomplete=one-time-code`, `maxlength=6`, só dígitos) e botão "Ativar".
  5. Verificação com `challengeAndVerify`.
  6. Fechar o assistente ou sair da rota com fator `unverified` chama `unenroll` (melhor esforço).
  7. Ao verificar, o segredo e o QR somem do DOM; o chip muda para "Ativa" e o foco vai para o título do cartão.
- Ativa mostra "Desativar verificação em duas etapas" (botão secundário perigo), que abre modal com o campo "Código de 6 dígitos atual".
  - Fluxo: `challengeAndVerify` (eleva a sessão para aal2) → `unenroll`.
  - Código errado não desativa.
  - Confirmar leva o texto "A conta volta a pedir só a senha."

**Outros aparelhos (B, E)**
- Texto: "O Lottus usa o login gratuito do Supabase, que não lista aparelhos individuais. Você pode sair de todos os outros aparelhos de uma vez; esta sessão continua aberta."
- Botão "Sair de todos os outros aparelhos" → `confirm('Sair dos outros aparelhos?', 'Todos os outros aparelhos e navegadores precisarão entrar de novo. Esta sessão continua.', 'Sair dos outros', true)`.
- Sucesso (204 ou 200): banner "Pedido concluído: os outros aparelhos serão desconectados. Quem já estiver com a tela aberta pode levar alguns minutos para ser desconectado." Isso é honesto: o token de acesso dos outros vale até expirar (hipótese: ≤ 1 h) e o refresh é revogado.

**Etapa do código no Entrar (C)** — Em `entrar.js`, após `signIn` sem erro: `mfa.getAuthenticatorAssuranceLevel()`. Se `nextLevel==='aal2' && currentLevel==='aal1'`, mostra a tela "Código de verificação" (h1, campo, "Verificar", link "Usar outra conta" que faz `signOut` local, "Preciso de ajuda").
- `listFactors` → primeiro fator `totp` com `status==='verified'`.
- `challengeAndVerify` → `afterLogin()`.
- Falha em obter o fator: erro genérico com "Tentar de novo".
- O estado da etapa fica só em memória; F5 reabre a etapa (a sessão aal1 persiste, mas o `app.js` nunca monta o app com aal1 pendente: redireciona a `#/entrar` em etapa de código).
- Limite: 5 erros seguidos desativam o botão por 30 s, de forma visual (o limite real é do Auth). O 429 do Auth mostra "Muitas tentativas. Aguarde alguns minutos e tente de novo." e não conta como erro de código.
- Nenhum erro do Auth revela se o código existe ou o que o servidor disse.

**Nova senha (1.2) com MFA.** A recuperação de senha **não desativa o MFA**. O link abre sessão aal1 e o Auth exige aal2 para `updateUser`. Por isso, se `nextLevel==='aal2'`, a tela de Nova senha antes mostra "Confirme que é você" com o mesmo campo de código, e só então exibe o formulário.
- Falha de aal2 no `updateUser` (400/403 com `insufficient_aal` ou "AAL2 required") mostra a etapa do código, não "Link inválido".
- Perdeu o aplicativo: "Preciso de ajuda" leva ao suporte.

## Estados
- **carregando**: `loading()` enquanto `getUser` e `listFactors` respondem. Cada cartão tem o seu esqueleto, e Senha e Sair aparecem de imediato.
- **vazio**: não se aplica. MFA "Inativa" é um estado normal.
- **erro**: falha ao ler fatores gera, no cartão do MFA, "Não foi possível carregar. Tentar de novo". O resto continua usável.
- **sem permissão**: sessão morta (401 ou 403) → `dropSession` → Entrar com o aviso "Sua sessão terminou. Entre de novo."
- **sucesso**: toast ou banner conforme cada texto.
- **muitos dados**: não se aplica (no máximo um fator).

## Dados lidos e escritos
- Auth: `getUser`, `getSession`, `signInWithPassword` (cliente descartável), `updateUser({password})`, `mfa.enroll/challenge/verify/challengeAndVerify/unenroll/listFactors/getAuthenticatorAssuranceLevel`, `POST /auth/v1/logout?scope=others|local`.
- Banco: nenhuma tabela nova. Fonte única do e-mail: `auth.users`.
- Segredos: senha, segredo TOTP, códigos e QR **não** vão a storage, URL, console, DOM depois do uso nem `sessionStorage`. Limpar `input.value` e `textContent`, e remover o `img`.
- Só o cartão do MFA e a etapa de código usam `mfa.*`. Tudo é carregado por `import()` na rota (lazy).

## Textos da interface (PT-BR exatos)
- Erros de senha: "Senha atual incorreta." · "As senhas não são iguais." · "A nova senha precisa ser diferente da atual." · "Essa senha é fraca ou já apareceu em vazamentos. Escolha outra."
- Código: "Digite os 6 números do aplicativo." (vazio ou curto) · "Código incorreto ou vencido. Confira a hora do celular e tente de novo."
- Rede: "Sem conexão. Verifique a internet e tente de novo."
- Erro genérico: "Não foi possível concluir agora. Tente de novo."
- Limite (429): "Muitas tentativas. Aguarde alguns minutos e tente de novo."
- Rótulos: "Senha atual", "Nova senha", "Confirmar nova senha", "Salvar nova senha", "Ativar", "Cancelar", "Copiar", "Copiado", "Verificar".
- Títulos: "Esta sessão", "Senha", "Verificação em duas etapas", "Outros aparelhos", "Código de verificação".
- Desativado: toast "Verificação em duas etapas desativada." Ativado: toast "Verificação em duas etapas ativada."
- O aviso da 1.2 passa a ser banner de atenção (V-05): "Senha alterada. Não conseguimos sair dos outros aparelhos. Em Segurança, use Sair de todos os outros aparelhos." com o link "Abrir Segurança" para `#/conta/seguranca`.
- Zero `null`, `undefined`, `[object Object]`, `NaN`, `{n}`, `{mm}`, inglês ou código cru.

## Layout por faixa
- **320–599** (celular): uma coluna, cartões empilhados, botões 100%. Campo de senha com ≥ 200 px úteis (V-04: o botão mostrar/ocultar é só ícone, 44×44, com `aria-label` "Mostrar senha" ou "Ocultar senha").
- **600–1023** (tablet): uma coluna de até 640 px, centrada.
- **≥ 1024** (desktop): grade de 2 colunas. Esquerda: Esta sessão, Senha. Direita: Verificação, Outros aparelhos. Máximo de 1100 px, centrado em 2560.
- Sem corte horizontal em 320 px com o QR (192 px) nem com o segredo (quebra a cada 4 dígitos). Alvos de toque ≥ 44 px. Svg de ícone em banner, toast ou vazio ≤ 32 px. Tema claro e escuro, com QR em fundo branco nos dois temas.

## Orçamento de desempenho
JS ≤ +6 kB gzip no total, medido no `scripts/check.mjs`. Rota de segurança e MFA carregadas por `import()` (fora do caminho de Entrar, salvo a etapa do código, ~0,8 kB). A extração de `campo-senha.js` é neutra. 0 requisições externas: o QR é local. Medido, não estimado, com o build antes e depois.

## Pacote C2-12 (AC-R)
| ID | O que fazer |
| --- | --- |
| AC-R1 (A12-M1) | A Nova senha mostra "Conta: x@…" e o topo mostra o e-mail. Se já havia sessão local de outro usuário e o hash trouxe tokens, banner de atenção "Você entrou como x@…. Não é você? Sair." (botão faz `signOut` local → Entrar). Nunca confirma silenciosamente. PKCE decidido em D4. |
| AC-R2 (A12-M2) | Migração `20261130120000_sign_ciclo2_1_2.sql`, idempotente, **não aplicada**. Nome por lista de permissão: NFC, normalizar espaços, ≥ 2 palavras, cada uma com ≥ 1 `[[:alpha:]]`, nenhuma categoria Cf/Cc/Zs/Mn por faixas amplas. Invisíveis só como escapes `\uXXXX`, nunca literais. A mesma `_sign_name_ok` serve a `_sign_profile_apply`, `sign_me.profile_complete` e `sign_onboarding_done`. |
| AC-R3 (V-01) | "Voltar ao Entrar" da Nova senha usa `dropSession` (`signOut` local), não global. |
| AC-R4 (V-02) | `.sg-single` alinhado ao topo: o logo e o cartão não deslocam ao trocar de estado ou digitar em ≥ 1280. |
| AC-R5 (V-03 / 1.2-A) | "Link inválido" oferece "Pedir novo link de senha" e "Reenviar e-mail de confirmação". |
| AC-R6 (V-04) | Botão mostrar/ocultar só ícone com `aria-label` em 320 (ver Layout). |
| AC-R7 (V-05) | Aviso de segurança em banner de atenção, não toast de sucesso, apontando para `#/conta/seguranca`. |
| AC-R8 (V-06) | Foco coerente nos erros sem campo (429, rede): vai para a mensagem `aria-live`, não para o body. |
| AC-R9 (V-07) | Texto do 429: "Muitas tentativas. Aguarde um pouco e tente de novo." Falha de rede não consome vaga das 3 por hora (carimbar só depois de resposta do Auth). |
| AC-R10 (V-08) | `menu-name` sem quebra no meio da palavra (`overflow-wrap:normal`, `text-overflow:ellipsis`). |
| AC-R11 (T-SHELL) | Investigar o AC21 do `t-shell` ("56 capturas sem corte"): reproduzir ≥ 20 execuções seguidas, no commit atual e no 193b0bb, registrando falhas, largura e hora. Hipóteses: corrida com fontes ou logo, transição ou animação no instante da captura, porta do fake compartilhada em testes paralelos, barra de rolagem. Estabilizar com `document.fonts.ready`, animações finalizadas e porta própria. Aceito com 30 execuções seguidas verdes e a causa em `decisoes.md`. |

**Migração `20261130120000_sign_ciclo2_1_2.sql`**
- Cabeçalho com a ordem de reversão (`create or replace` da versão anterior de `_sign_name_ok`, `_sign_profile_apply`, `sign_me`, `sign_onboarding_done` da 20261129120000).
- Lista do que **não reverte**: perfis já salvos com nome aceito, `onboarding_done` já gravado e dados já purgados na 1.2. A migração não altera nenhum dado; traz só uma consulta comentada que lista os perfis que passariam a falhar, para decisão do Yuri.
- `revoke all` das funções internas e `grant execute` explícito nas públicas, mantendo a assinatura.
- Faixas rejeitadas: U+0001–001F, 007F–00A0, 00AD, 034F, 0300–036F, 061C, 115F–1160, 1680, 180B–180F, 2000–200F, 2028–202F, 205F–206F, 2800, 3000, 3164, FE00–FE0F, FEFF, FFA0.
- Limitação aceita: nomes com marcas combinantes fora do NFC (alguns alfabetos não latinos) ficam fora. Locale do Postgres de produção: não testado.

## Critérios de aceite
Playwright contra o fake local (`scripts/sign-local/testes/fake-sign.cjs`) e, onde há banco, em banco isolado `SIGN_DB` com `SIGN_DB_ANTES` (a versão anterior) exportados.

**O que adicionar ao fake:**
- `POST /auth/v1/factors` (enroll, devolve `qr_code` como data-URI SVG e `secret`), `POST /factors/:id/challenge`, `POST /factors/:id/verify`, `DELETE /factors/:id`, `GET /user` com `factors` e `last_sign_in_at`.
- `aal`: o `signIn` de usuário com fator `verified` devolve JWT `aal1` com `amr`; o `verify` correto devolve JWT `aal2`.
- `PUT /user` exige aal2 se há fator verificado (`insufficient_aal`).
- `POST /logout?scope=others|local` com modos de resposta 204, 401, 403, 404, 429 e 500.
- Modos de erro: `invalid_credentials`, `same_password`, `weak_password`, 429, rede (`abort`), 5xx.
- Contadores de requisição por rota, para provar uma só chamada em duplo clique.

**Aceite**
- AC1. Dado sessão válida, quando abro `#/conta/seguranca`, então vejo os 4 cartões, o e-mail da conta e a aba "Segurança" selecionada. Sem sessão, vou para o Entrar com `de=#/conta/seguranca` e volto após o login.
- AC2. Dado senha atual errada, quando salvo, então "Senha atual incorreta.", nenhum `PUT /user`, foco no campo.
- AC3. Dado dados válidos, quando salvo com duplo clique, então 1 `PUT /user`, 1 `logout?scope=others`, os 3 campos vazios, o toast "Senha alterada." e a sessão continua.
- AC4. Dado `same_password`, `weak_password`, 429 e rede, quando salvo, então o texto exato de cada um, sem texto cru. Se `logout=others` falhar após a troca, o banner de atenção aparece (sem toast verde).
- AC5. Dado "Sair dos outros" com respostas 204, 401, 403, 404, 429, 500 e rede, então 204 mostra sucesso; 401 e 403 levam ao Entrar; 404, 500 e rede mostram erro, **nunca sucesso falso**; 429 mostra o texto de limite.
- AC6. Dado MFA inativo, quando ativo com o código certo, então QR em `<img>` (não `innerHTML`), segredo com "Copiar", chip "Ativa", segredo e QR ausentes do DOM, de `localStorage`, `sessionStorage`, URL e console.
- AC7. Dado código errado ou 429 na ativação, então a mensagem certa, o fator continua `unverified` e some ao fechar o assistente (`DELETE` chamado).
- AC8. Dado MFA ativo, quando faço login, então vejo "Código de verificação" e o app só monta após aal2. F5 durante a etapa volta para ela. 5 erros seguidos bloqueiam o botão por 30 s. Um 429 do Auth mostra o texto de limite.
- AC9. Dado MFA ativo, quando uso o link de recuperação, então a etapa do código vem antes da nova senha e o MFA continua ativo depois da troca. Falha `insufficient_aal` leva ao código, não a "Link inválido".
- AC10. Dado MFA ativo, quando desativo com código errado, então nada é removido. Com o certo, `DELETE` do fator e chip "Inativa".
- AC11. Dado a captura da tela em 320, 375, 768, 1280, 1920 e 2560, claro e escuro, então não há corte horizontal, alvos ≥ 44 px, QR visível e svg de ícone ≤ 32 px. **O verificador abre e olha todas as capturas.**
- AC12. Varredura `t-texto.cjs` ampliada: `null`, `undefined`, `[object Object]`, `NaN`, `{n}`, `{mm}`, inglês e códigos crus em todas as telas e estados × 4 larguras × 2 temas. A senha, o segredo TOTP e os códigos nunca aparecem no DOM após o uso, em storage, URL ou console.
- AC13. `_sign_aal_ok` em banco isolado: token aal1 de usuário com fator `verified` recebe `aal2_required` em cada RPC listada; aal2 passa; usuário sem fator passa. IDOR com 3 usuários.
- AC14 (R2, banco ANTES e DEPOIS). **Rejeitados depois**: U+3164, U+2800, U+2061, U+034F, controles C0, NBSP+espaço+NBSP, '. .', '1 2'. **Aceitos antes e depois**: 'Ana Souza', 'José Maria', 'Maria da Conceição D'Ávila'. Mesmo resultado em `_sign_profile_apply`, `sign_me.profile_complete` e `sign_onboarding_done`. A migração roda duas vezes sem erro e a reversão restaura o comportamento anterior.
- AC15 (R1, R3 a R10). Um teste por linha da tabela AC-R: e-mail visível, banner "Você entrou como…", `scope=local` no "Voltar ao Entrar", logo estável em 1280+, dois botões em "Link inválido", ícone com `aria-label` em 320, banner e não toast, foco, 429 e rede sem consumir vaga, `menu-name`.
- AC16. T-SHELL: 30 execuções seguidas do `t-shell` verdes, com a causa registrada.
- AC17. Regressão (regra 14): router, app, ui, shell, entrar, senha e perfil foram tocados, então reverificar 1.0, 1.1, 1.2, 1.3, 1.4 e 1.5. `node scripts/check.mjs` limpo.

## Regras de construção (lições 1.4–1.2)
- Helper `setKids` em toda montagem.
- `_headers` (CSP) com `data:` só em `img-src`.
- Sem `innerHTML` com dado do Auth.
- `t-texto.cjs` ampliado.
- Banco isolado `SIGN_DB` e `SIGN_DB_ANTES` exportados.

## Pendências a registrar
- **P1.6-01.** Procedimento do suporte para remover o fator de quem perdeu o aplicativo (Yuri).
- **P1.6-02.** Aplicar `_sign_aal_ok` e a checagem de `aal` na função de borda do certificado.
- **P1.6-03.** A12-M3: limites e SMTP próprio (Yuri, pago).
- **P1.6-04.** MFA habilitado no painel do Auth (TOTP "Enabled").

## Não testado (por desenho, só no Auth real)
Supabase/GoTrue reais: `totp.qr_code`, `updated_at` do fator, `insufficient_aal`, limites e códigos de erro reais, TTL do token das outras sessões, `logout?scope=others` real. Aplicativos autenticadores reais (relógio defasado), leitor de tela, Safari, Firefox e locale de produção do Postgres.
