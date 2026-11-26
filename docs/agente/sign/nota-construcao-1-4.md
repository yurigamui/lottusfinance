# Nota de construção: Sign 1.4 Perfil e conta
26/11/2026 · Desenvolvedor · **Construída, NÃO verificada.** Nada aplicado em produção; nada commitado por mim (o commit 6d9e6e8 com o trabalho em andamento veio do Maestro).

## O que foi feito
- **Migração** `supabase/migrations/20261126120000_sign_perfil_fonte_unica.sql` (só no Postgres local): `sign_me` sem fallback de metadado + `name_hint`, `cpf_locked`, `profile_complete`; `sign_profile_save` (R5: nome sempre editável 3 a 140 e 2+ palavras; CPF só preenche; igual = no-op; diferente = `cpf_locked`; duplicado = `cpf_in_use`; nunca toca email/phone); `sign_account_save` e `sign_plan_state` lendo/gravando só `profiles`; `_senv_owner_name` de `profiles` (R3). Internas novas sem grant: `_sign_name_norm`, `_sign_cpf_locked`, `_sign_profile_apply`. Revoke de public/anon e grant só a authenticated. Idempotente, reversão no topo (gerar-reversao.sh grava fora do repo).
- **Front** `js/views/perfil.js` (aba Perfil, sem innerHTML, sem style=), ajustes em `shell.js` (remonta por usuário, `updateMe`, `ownMe`, Sair com confirmação), `ui.js` (pageHead só `#/…`, `abasConta`, `confirm` com rótulo, toast ok `role=status`), `router.js` (guarda de formulário sujo, `sessionEnded`, pageshow, hash solto), `api.js` (`profileSave`, `me` com fusão de chamadas e `fresh`, rascunho só em memória, `dropSession`, `classify` novo), `fmt.js` (CPF, máscaras), `construcao.js` (replace), `entrar.js` (B-1), `app.js`, `styles.css` (layout por faixa, M-2, B-2, `.skel`, CLS), `config.js` (`supportEmail` vazio), `_headers` (no-store só nos HTML, CSP intacta). `?v=` global trocado para 20261126a.
- **Pacote 1.0-C2**: A10-MA, A10-MB, M-1, M-2, B-1, B-2, A10-B1, A10-B2, A10-B4.
- **Infra de teste**: `fake-sign.cjs` com modo repasse ao Postgres (porta 54350, pacote `pg` em `testes/package.json`, node_modules não commitado), `drv.cjs` (opção `pg`, `_headers` por caminho), `seed.sql` (U1..U7), `reset.sh [antes|depois|ambos]` (bancos `sign_antes` e `sign`), `gerar-reversao.sh`, `perfil-lib.cjs`.

## Testado (Postgres local 16 + Chromium/Playwright)
| Suíte | Resultado |
| --- | --- |
| t-perfil-db.cjs (AC-B1 a B14) | 119 de 119 |
| t-perfil.cjs (AC1 a AC16, AC-R1 a R9, LCP/CLS) | 149 de 149 |
| t-ac / t-shell / t-layout / t-comp / t-corr | 96 / 183 / 99 / 63 / 45, todos n de n |
| t-regressao (36 capturas, antes 059afb2 x depois) | 35 de 36 idênticas; 1920-3-confirme difere em 45 px, desvio máx 4/765 (antialiasing), não investigado |
| check.mjs | 0 erros |
| smoke.mjs sign | nenhum problema (ver saída no relatório) |

Números: `sign_me` p95 3,4 ms e `sign_profile_save` p95 3,9 ms sequenciais ponta a ponta (100 chamadas, 10 mil perfis); paralelo 10x10 p95 30,3 e 13,3 ms; banco puro p95 2,1 e 2,8 ms. EXPLAIN (ANALYZE, BUFFERS) e p95 em `docs/agente/sign/evidencias-1-4/`. Sem Seq Scan em profiles, sign_identity, sign_envelopes, auth.users. Tela (4G simulado, sem compressão): LCP 1692 ms, CLS 0. JS: perfil.js 4,4 kB gzip; delta total do JS do app +8,4 kB gzip (antes 18,5; agora 26,9), um pouco acima do teto de 8 kB se contado tudo.

## Mudanças nos testes existentes
- t-ac AC18: compara só as linhas de segurança do `_headers` com o último commit (o arquivo ganhou `Cache-Control`); CSP idêntica.
- t-shell: #/conta/perfil agora é a tela real (AC4 usa o botão "Ir para Documentos" por texto; AC23 Tab com 18 passos; títulos "Perfil · Conta · Lottus Sign"; AC28 seletor por texto; teste de erro de `sign_me` usa #/plano, pois o Perfil mostra o erro na própria tela).
- t-comp AC9: toast ok com `role !== 'alert'` (agora `status`).
- `.sidenav-mark` 44 px (AC13 pegou 40 px na 1.0) e `.sg-root{display:flow-root}` (CLS do body).

## NÃO testado
Produção e Supabase real (PostgREST, GoTrue); bfcache real (simulado por `PageTransitionEvent`); `unique(cpf)` e índices de produção (T-08, o esquema local infere); leitor de tela real; Safari/Firefox; modo escuro; compressão em produção; reenvio real de e-mail; troca de usuário por outra aba (só pelo hash do Auth).

## Decisões e dúvidas
1. `cpf_locked` também quando o CPF já está preenchido (E-04). Sem isso AC1 mostraria campo editável que o servidor recusa.
2. `_sign_cpf_locked` (a)/(b) com CPF vazio trava; só passa o CPF igual ao do certificado verificado.
3. CPF 529.982.247-25 do AC-B4 já é de outra conta do seed (unique): o teste usa o CPF livre de U3 com máscara e prova o outro como `cpf_locked`.
4. `sign_account_save` não toca `crm_leads.doc` (só `name`). Sem linha em `profiles` e sem CPF, `invalid_cpf`.
5. Mailto do suporte sem endereço (E-06). Texto LGPD com `[preencher]` visível, como na spec (G7).
6. Rascunho do perfil guardado em memória e devolvido ao mesmo usuário após novo login; apagado em Sair.
7. Em formulário sujo, a navegação desfeita usa `replaceState` (pode duplicar uma entrada do histórico).
8. `pageHead` aceita `{href,label}` também como 3º argumento (a spec escreve assim; o código usava o 4º).
9. Criar índices em tabelas de Partners/Wealth ficou de fora (E-05).

## Ciclo 2 (correções da reprovação do ciclo 1; verificacao-1-4-ciclo-1.md)
Só os itens listados foram tocados. Testes rodados no banco isolado `sign_dev` (e `sign_dev_antes`) com `SIGN_DB=sign_dev SIGN_DB_ANTES=sign_dev_antes` (o `reset.sh` e `perfil-lib.cjs` aceitam essas variáveis). `?v=` trocado para 20261126b.

### O que mudou
| Item | Correção |
| --- | --- |
| V-01 (Alto) | `styles.css`: `.banner .ico, .sg-alert .ico, .empty .ico` com 20 px e `flex:none`; teto de 32 px para qualquer `svg` em `.banner/.sg-alert/.empty/.toast`; `.banner` com `flex-wrap` e `.banner .grow` com base de 160 px (o botão desce em tela estreita; o texto não vira coluna fina). Cobre faixa do Perfil, erro ao salvar, erro ao carregar, aviso do shell, estado vazio e a tela "Confirme seu e-mail" |
| V-02 | `router.js`: a navegação recusada é desfeita andando o histórico (`back` ou `forward`, pela Navigation API ou `history.state`), sem `replaceState` que duplicava entrada. Resta, após clicar um link, a entrada "para frente" desse link (não é duplicata); Voltar continua funcionando |
| V-03 | `perfil.js`: ao colar texto que o `maxlength` corta, aparece "O nome pode ter até 140 caracteres. O texto colado foi cortado." |
| V-05 | `a.org-link` com 44 x 44 px |
| V-07 | `.org-name` limitado a 2 linhas (line-clamp), `title` com o nome inteiro, avatar `flex:none` |
| V-08 | Medido (abaixo); nenhuma correção necessária |
| A14-M1 | Migração: `cpf_in_use` também quando outro `id` tem o mesmo CPF normalizado (dígitos); Verificação 0 ganhou `select count(*) from profiles where cpf ~ '\D'` (item d0). Custo: uma varredura de `profiles` só no momento de preencher o CPF (acontece uma vez por pessoa) |
| A14-B1 | `_sign_cpf_locked`: vínculo com empresa/fundo só trava com CPF do perfil preenchido |
| A14-B3 | Servidor e cliente recusam U+200B a U+200F, U+202A a U+202E e U+2066 a U+2069 no nome (`invalid_name`; mensagem "O nome tem caracteres que não podem ser usados. Digite só letras e espaços.") |
| A14-B5 | `_headers`: `Cache-Control: no-store` também em `/index`, `/assinar`, `/verificar` (CSP e demais cabeçalhos idênticos) |
| Infra | `reset.sh`/`perfil-lib.cjs` com `SIGN_DB`/`SIGN_DB_ANTES`; `t-perfil.cjs` com `ONLY=<regex>`; `lib.cjs` mostra as linhas do teste na exceção; `restaurar` apaga envelopes de teste de U3 |

### Passou (banco `sign_dev`)
| Suíte | Resultado |
| --- | --- |
| t-perfil-db.cjs | 137 de 137 (+18: M1, B1, B3) |
| t-perfil.cjs | 229 de 229 (+80: V-01 mecânico, V-02, V-03, B3, V-05/V-07, V-08, B5) |
| t-ac / t-shell / t-layout / t-comp / t-corr | 96 / 183 / 99 / 63 / 45, todos n de n |
| t-regressao | 35 de 36 idênticas; a diferença é a mesma do ciclo 1 (1920-3-confirme, 45 px, desvio máx 4) |
| check.mjs / smoke.mjs sign | 0 erros / nenhum problema |

Checagem mecânica nova do V-01: em 8 larguras (320 a 2560) e em 6 estados (faixa de perfil incompleto, erro ao salvar, erro ao carregar, aviso do shell, estado vazio, toast) mais "Confirme seu e-mail": nenhum `svg` em `.banner/.toast/.empty/.sg-alert/.tag/.btn` passa de 32 px, o texto do banner tem >= 90 px e nenhum banner passa de 220 px de altura; capturas dos banners em `/tmp/sign-shots-perfil/banner-<estado>-<largura>.png` (40 arquivos) e `confirme-email-<largura>.png`.

V-08, tema escuro com composição real de alfa: contrastes `.help` 6,83, `.pf-label` 6,83, `.tag` 11,45, h2 13,76, link 13,76, banner 4,54 (o mais apertado), campo 13,76, texto do cartão lateral 6,83, subtítulo 7,52, erro 6,33, botão secundário 13,76, botão principal 13,76; borda do campo em foco 6,33:1 (mínimo 3:1). O tema escuro segue sem ser acionável pelo usuário (decisão de 25/11), então é medida de CSS.

### NÃO testado (ciclo 2)
Safari, Firefox (a Navigation API do V-02 tem fallback por `history.state`, que só foi exercitado no Chromium), teclado virtual e leitor de tela reais, colar com o menu de contexto do sistema (testado Ctrl+V), A14-M1 contra dados reais de produção (só o banco local com máscara simulada), tema escuro em tela real.

### Seções a reverificar (regra 14: `styles.css`, `.banner`, `router.js` são compartilhados)
- **1.0 (shell e correções)**: `.banner` agora com `flex-wrap` e `.grow` de base 160 px (aviso `.shell-notice`, estado de erro de `sign_me`), tamanho do ícone dentro de banner/toast/estado vazio, `.org-link` 44 px, `.org-name` com 2 linhas, `router.js` (navegação, `history.state`, pageshow).
- **1.1 (Entrar e criar conta)**: `.banner` não é usado na entrada (usa `.sg-alert`, só ganhou o teto de 32 px no svg), mas `styles.css` e `router.js` mudaram: reverificar capturas de Entrar/Criar/"Confirme seu e-mail"/link vencido (t-regressao) e o retorno após login.
- `assinar.html` e `verificar.html` carregam o mesmo `styles.css` (capturas ok no t-regressao).

## Ciclo 3 (2ª reprovação: N-01 Alto, V-09, B-01 a B-05; verificacao-1-4-ciclo-2.md)
Rodado com `SIGN_DB=sign_dev SIGN_DB_ANTES=sign_dev_antes` exportados. `?v=` 20261126c.

### O que mudou
| Item | Correção |
| --- | --- |
| N-01 (Alto) | Origem: `perfil.js` passava `null` ao `replaceChildren` nativo (escreve o texto "null"). **Guarda sistêmica:** novo `setKids(el, ...filhos)` em `lib/ui.js` (ignora null, undefined, false e true; achata arrays; texto vira nó de texto); `mount` usa ele; `h()` também ignora `true`; **todos** os `.replaceChildren(` de `shell.js`, `construcao.js`, `perfil.js` e `entrar.js` foram trocados por `setKids` |
| Teste novo `t-texto.cjs` | Percorre Entrar (e erros), Criar, Confirme seu e-mail (e reenvio), link vencido, provisória pública, 404 público, shell, menu, todas as rotas privadas, 404 privado, Perfil (U1 completo/travado, U3 incompleto com sugestão, erros de campo, erro ao salvar, erro ao carregar, aviso do shell, U4, U5, U6, U7), toasts, modal "Descartar", `confirm()`; em 320, 768 e 1280; falha se algum nó de texto visível, valor de campo, title, aria-label, alt ou placeholder tiver `null`, `undefined`, `[object Object]` ou `NaN`; mais checagem estática de que não resta `.replaceChildren(` nativo fora de `ui.js`. **Rodado antes da correção contra o código com o bug: 24 FALHAS (todas "null" no cartão do Perfil)**; depois: 95 de 95 |
| V-09 | `router.js`: o desfazer da navegação não é mais bloqueado pelo modal aberto (Voltar duplo/triplo desfaz de novo); o hashchange do desfazer só é engolido se a URL já voltou à tela; depois de "Continuar editando" a URL é conferida e corrigida; item Documentos do menu funciona |
| B-03 | `img/logo-creme.png` e `img/mark-creme.png` copiados de `apps/wealth/img` (md5 idêntico ao de admin, partners e site: são os PNGs oficiais) |
| B-01 | Nome também recusa U+2060, U+FEFF, U+00AD e U+180E (migração e cliente) |
| B-02 | Iniciais do avatar com `color-mix` (como `.tag.brand`): 6,07:1 no claro e 5,36:1 no escuro (eram 4,25 e 3,86) |
| B-04 | "fale com o suporte." sem espaço antes do ponto e o ponto preso ao link (`.nw`) |
| B-05 | Botão dentro de banner/`sg-alert`/aviso do shell com fundo do cartão e borda de 1 px (contraste do texto >= 4,5; da borda >= 3) |

### Passou
t-perfil-db 141 de 141 (+4 de B-01) · t-perfil 245 de 245 (+16: V-09, B-02..B-05) · t-texto 95 de 95 · t-ac 96 · t-shell 183 · t-layout 99 · t-comp 63 · t-corr 45 · check.mjs 0 erros · smoke sign nenhum problema. t-regressao: 29 de 36 idênticas; as 7 diferenças: `*-4-link-vencido` nas 6 larguras (o botão "Reenviar e-mail" ganhou borda e fundo, mudança pedida em B-05, 6280 px) e a antiga 1920-3-confirme (45 px, desvio 4).

### O que vi nas capturas (/tmp/sign-shots-perfil)
- Perfil no tema escuro em 320 (`escuro-perfil-320.png`): a marca creme aparece na topbar; sem texto "null" no cartão; CPF mascarado, "fale com o suporte." com o ponto colado ao link na mesma linha; selos legíveis; iniciais "EE" legíveis.
- Perfil em 1280 (`perfil-1280.png`, usuário com nome de 140 letras sem espaço): topo com o nome em 2 linhas e avatar inteiro; cartão e coluna lateral lado a lado; faixa "Complete seu perfil" (correta: o nome sem espaço não é nome completo); campo de nome sem estourar.
- Banner de erro em 320 (`banner-botao-320.png`): ícone pequeno alinhado ao texto, botão "Tentar de novo" claro com borda, com cara de botão.

### NÃO testado
Safari, Firefox, leitor de tela, teclado virtual reais; Navigation API ausente (fallback por `history.state` só no Chromium); Voltar duplo foi simulado com `goBack()` do Playwright, não com cliques reais do usuário; tema escuro só por CSS (não acionável pelo usuário).

### Seções a reverificar (regra 14)
- **1.0**: `ui.js` (`setKids`, `mount`, `h`), `shell.js` (todas as trocas), `router.js` (guarda/histórico), `styles.css` (avatar, `.banner .btn`), imagens `*-creme.png` (marca no escuro).
- **1.1**: `entrar.js` (trocas por `setKids`; todas as telas de Entrar/Criar/Confirme/link vencido); o botão "Reenviar e-mail" do link vencido mudou de aparência (B-05).
- `assinar.html`/`verificar.html`: usam o mesmo `styles.css` (capturas idênticas).
