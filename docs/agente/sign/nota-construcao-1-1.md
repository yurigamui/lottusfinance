# Nota de construção: Sign 1.1 Entrar e criar conta
24/11/2026 · Desenvolvedor · status: **construída, NÃO verificada** (vai ao Verificador).

## O que foi feito
Front novo em módulos ES nativos (sem build, sem CDN, sem script inline, sem `style=""`, sem `innerHTML`; tudo montado por DOM/`textContent`):
- Entrar e Criar conta (abas `role=tablist`, setas, `#/entrar` e `#/criar`), tela "Confirme seu e-mail" (cadastro e login de conta não confirmada), reenvio (60 s, 3/h por navegador em `localStorage`, 429 vira o texto de limite), link vencido com botão de reenvio, aviso de sessão e de e-mail confirmado.
- Tratamento do hash do e-mail antes do roteador (R-6): signup -> `#/onboarding/1`, recovery -> `#/nova-senha`, erro/otp_expired -> Entrar com aviso. O hash é apagado com `history.replaceState`.
- Roteador com guarda (privada sem sessão -> Entrar com aviso, `de` na lista branca em `sessionStorage`), redirecionamento de quem já tem sessão (AC15), evento `storage` e `SIGNED_OUT`.
- Telas provisórias "Em construção" (com saída) e "Página não encontrada".
- `signUp` envia só e-mail, senha e `data` {name, terms_version, privacy_version}; nada de CPF/celular.
- `index.html` carrega o app novo. `home.js` removido com `git rm` (nada mais dependia dele; assinar.html e verificar.html seguem com os arquivos antigos).

## Arquivos tocados
Novos: `apps/sign/js/app.js`, `js/lib/{router,ui,api,fmt}.js`, `js/views/{entrar,construcao}.js`; `scripts/sign-local/testes/{fake-sign,drv,lib,t-ac,t-layout,medir}.cjs`; esta nota.
Alterados: `apps/sign/index.html`, `assinar.html`, `verificar.html` (só a versão `?v=20261124a` de `styles.css` e `config.js`), `styles.css` (bloco `sg-*` no fim; `.sign-body` com `100dvh`), `js/config.js` (chaves `termsUrl`, `privacyUrl`, `termsVersion`, `privacyVersion`, vazias ou `[preencher]`). Removido: `js/home.js`. `_headers` inalterado. Nenhuma migração, nada em produção; `wealth-local` intocado.
Consequência do `git rm home.js`: a antiga lista "meus documentos" e a verificação embutida no index deixam de existir; `#/documentos` é provisória até a Parte 2. "Verificar um documento" leva a `verificar.html`.

## O que foi testado, e onde
Ambiente: Playwright (Chromium) contra `scripts/sign-local/testes/fake-sign.cjs` (Supabase falso em memória: `/auth/v1/*` e `rpc/sign_me`, modos de 429, queda, atraso, e-mail existente revelado), com a CSP real do `_headers`; o endereço de produção é desviado para o fake. Dados fictícios (`@teste.example`).
- `node scripts/sign-local/testes/t-ac.cjs`: **96 de 96** (AC1 a AC12, AC15 a AC19, mais ausência de texto "null" perdido).
- `node scripts/sign-local/testes/t-layout.cjs`: **99 de 99** (AC13 nas 7 larguras 320/360/390/768/1280/1920/2560 x tema claro e escuro; AC14 zoom 200% em 320 e 1280, simulado como metade da largura com escala 2; AC20: 56 capturas em `/tmp/sign-shots` = 7 larguras x 2 temas x 4 estados; alvos de 44 px em 390).
- `node scripts/check.mjs`: só os 6 erros antigos de `apps/site`; nada no Sign.
- `node scripts/smoke.mjs sign`: sem problemas no Sign (os 10 problemas são do site).
- Desempenho (`medir.cjs`): JS da seção **29,2 kB brutos / 11,0 kB gzip** (meta 60 kB). Tempo até o E-mail focado, mediana de 7: **127 ms** local; **1757 ms** com rede simulada 1,6 Mbps/150 ms (CDP). A meta de 1 s em 4G NÃO foi atingida na rede lenta simulada (parece dominada por 7 módulos em cascata de round trips; ver dúvidas).

## O que NÃO foi testado
- Supabase real: confirmação de e-mail, texto real do `signUp` para e-mail existente, limites do Auth, lista de redirecionamento (P1-12). O fake imita o que supomos.
- A `sign_me` real (só o fake). Fontes do Google (bloqueadas nos testes): salto de layout ao carregar a fonte não medido.
- Leitor de tela real, teclado virtual real em celular, Safari/Firefox, celular deitado, fonte do sistema ampliada. Zoom 200% foi emulado por viewport, não por zoom real do navegador.
- Tema escuro: `theme.js` força o claro; o escuro foi aplicado nos testes via `data-theme='dark'`. Não há como o usuário chegar ao escuro hoje.
- Evento `storage` testado entre duas abas no mesmo contexto Playwright.
- Contraste AA não medido por ferramenta.

## Decisões minhas (revisar)
- Foco: ao entrar em `#/entrar`/`#/criar` o foco vai ao E-mail (AC1); nas demais rotas e na tela de confirmação, ao `h1`.
- Ordem dos campos no Criar: E-mail, Nome, Senha, Aceite (E-mail primeiro nas duas abas; preserva o digitado ao trocar de aba).
- "Voltar ao início" só aparece sem sessão; com sessão a tela provisória mostra só "Sair" (o início seria a própria tela). Adicionei "Entrar" na tela de confirmação para não haver beco sem saída (não estava no texto da spec).
- Painel lateral do desktop só tem o logo (sem texto de apresentação, que a spec não define). No escuro o logo ganha um fundo creme, pois só existe `logo-rosa.png`.
- Tempo limite de rede de 15 s (`cfg.timeoutMs`) para tratar "atraso" (AC17); reenvio e tempo configuráveis em `config.js` (`resendCooldownMs`), usados pelos testes.
- Chave de `sessionStorage` da origem: `lottus.sign.de`; e-mail do "Esqueci a senha": `lottus.sign.rec_email`; reenvios: `localStorage lottus.sign.resend` (só horários).
- Links de Termos/Política: sem URL (J-02), aparecem como texto sublinhado pontilhado, sem link; versão mostrada "[preencher]" e enviada assim em `terms_version`/`privacy_version`.
- Nome com 140 letras sem espaço dá erro "Informe o nome completo." (regra de 2 palavras); o AC13 usa nome de duas palavras longas para chegar à tela de confirmação.
- `sign_me` tem cache de 5 s no cliente para não chamar duas vezes no login.
- Links inline dos Termos têm área de toque de 44 px por padding com margem negativa.
- Sessão válida em rota privada exige `onboarding_done` (RN18) via `sign_me`; `email_not_confirmed` encerra a sessão local.

## Dúvidas
1. Desempenho em rede lenta: aceitar, ou pré-carregar (`modulepreload`) / juntar módulos? Não fiz, fora do escopo.
2. Dark mode: liberar no `theme.js` é decisão de produto.
3. Pendências a registrar: P1-12, J-02/P1-10 (URLs e versão), "Entrar" extra na confirmação, `theme.js` forçando claro.
