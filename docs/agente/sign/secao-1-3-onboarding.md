# Seção: Sign / Parte 1 / 1.3 Onboarding + pacote ciclo 2 da 1.5 (C2-15)

Plataforma: Lottus Sign. Autor: idealizador. Status: especificação, não construída, não verificada. Nada aplicado em produção.
Arquivo sugerido: docs/agente/sign/secao-1-3-onboarding.md
Premissas e limites: li `sign_onboarding_done`, `sign_me`, `sign_profile_save`, `sign_phone_send` e `sign_phone_verify` no esquema real (/root/sign-schema.sql), o roteador, o CSS `.ob-steps` e os exports de `perfil.js` e `verificacao.js`. O texto da migração 20261127120000 (que define RN7, `contact_kind` e `_sign_cpf_guarded_apply`) não foi relido em detalhe. O construtor deve conferir os nomes exatos antes de editar (marcado [conferir]). Preço e plano: não há nada nesta seção; o certificado é só "nível de assinatura".

## 1. Objetivo e papéis com acesso
Levar quem acabou de criar a conta, em até 3 passos curtos, ao ponto de poder enviar o primeiro documento: dados pessoais (1), contato verificado (2) e certificado opcional (3). Papel: usuário autenticado com e-mail confirmado (`_sign_me()` não nulo). Sem sessão vai para o login; e-mail não confirmado cai no fluxo de "Confirme seu e-mail" já existente.
Decisão fechada: não se envia documento sem os passos 1 e 2 (é o próprio `sign_onboarding_done`, no servidor, que exige). Pode-se sair e voltar a qualquer momento. O passo 3 é pulável.

## 2. Entradas e saídas
- Entradas: o redirecionamento pós-login existente (`me.onboarding_done=false` → `#/onboarding/1`), o link profundo `#/onboarding/1|2|3`, F5 e Voltar do navegador.
- Saídas: ao concluir (botão "Concluir" no passo 3, ou "Pular certificado"), chama `sign_onboarding_done` e vai para `DEFAULT_AFTER` (ou o `de` salvo em `DE_KEY`, respeitando `safeDe`). A saída "Sair" pelo avatar fica sempre disponível (o shell já está em modo reduzido; ele só deve exibir avatar e Sair, sem menu de navegação).
- Quem já tem `onboarding_done=true` e abre `#/onboarding/*` vai para `DEFAULT_AFTER` (replace, sem entrada no histórico).

## 3. Elementos e comportamento
Rotas novas no `router.js`: `#/onboarding/2` e `#/onboarding/3`, todas com `{view:'onboarding', gate:false}`. A rota `/1` já existe. A view única `views/onboarding.js` lê o passo do hash e re-renderiza ao trocar o hash. O foco vai para o h1 (`focusH1`) a cada troca de passo.

Cabeçalho: lista `<ol class="ob-steps" aria-label="Etapas">` do Wealth com 3 itens. O passo atual tem `aria-current="step"` e a classe `on`; os concluídos têm a classe `done` e "✓" visível (não só cor). Rótulos: "Seus dados", "Verificar contato", "Certificado (opcional)".

Regras (RN-OB):
- **RN-OB1 Passo inicial calculado.** Ao entrar pelo redirecionamento (`ctx.entrada`, marcado pelo router em `go(ONBOARDING,true)`), o passo é o primeiro pendente: perfil incompleto → 1; senão `!me.verified` → 2; senão 3.
- **RN-OB2 Hash digitado ou F5.** Hash digitado ou recarregado é respeitado se o passo ≤ primeiro pendente. Se for maior (ex.: `/3` com perfil incompleto), faz replace para o primeiro pendente e mostra o aviso "Falta concluir esta etapa antes." (`role=status`). Hash inválido (`/9`, `/x`) vira o passo inicial, também por replace.
- **RN-OB3 Perfil completo.** Perfil completo significa nome com 2 ou mais palavras e CPF válido (mesmas validações da 1.4). Fonte: `sign_me` (profiles).
- **RN-OB4 Passo 1.** Usa o componente de formulário extraído de `perfil.js`: `perfilForm({me, cfg, onSaved, modo:'onboarding'})` em `views/perfil-form.js`. Ele traz campos, validação, mensagens, trava de CPF e chamada a `sign_profile_save`. O `perfil.js` passa a consumi-lo (nada duplicado). No modo onboarding: botão primário "Salvar e continuar"; ao salvar com sucesso, `go('#/onboarding/2')`. Não mostra a coluna lateral nem o e-mail como editável.
- **RN-OB5 Passo 2.** Usa o componente extraído de `verificacao.js`: `contatoCard(st, {onVerified, modo:'onboarding'})` (`contactCard` hoje) em `views/verificacao-contato.js`. Com `me.verified` já verdadeiro, mostra o estado de sucesso (V6-01: "E-mail confirmado" ou "Celular verificado" conforme `contact_kind`) e o botão "Continuar". Se não, mostra o fluxo de código existente. Ao verificar, atualiza o `me` (`updateMe`) e libera "Continuar".
- **RN-OB6 Passo 3.** Mostra o resumo "O que falta para enviar" com 3 linhas (Seus dados, Contato verificado, Certificado) e o nível de assinatura atual (mesma `levelCard`, só leitura). O certificado usa o `certCard` existente, que já é pulável. Botões: "Concluir" (primário; vale com ou sem certificado) e "Pular certificado" (secundário, mesma chamada). O texto explica que sem certificado o envio sai no nível básico e que dá para adicioná-lo depois em Conta > Verificação.
- **RN-OB7 Servidor decide.** `sign_onboarding_done` passa a exigir (no servidor) perfil completo (`profiles.full_name` com 2 ou mais palavras e `_cpf_ok(cpf)`) e identidade verificada (`phone_verified_at` ou certificado válido, a mesma lógica de `verified` em `sign_me`). Senão `raise exception 'onboarding_incomplete'`. Idempotente (`on conflict`). Mantém `email_not_confirmed`. Continua retornando `sign_me()`.
- **RN-OB8 Voltar.** O botão "Voltar" de cada passo vai para o hash anterior. Os dados de um passo já salvo ficam preservados. Os passos concluídos no resumo são links.
- **RN-OB9 Sem beco.** Todo passo tem saída: Sair (avatar), Voltar, e o botão "Tentar de novo" em erro de rede. Reabrir a qualquer hora retoma pelo RN-OB1.
- **RN-OB10 Documento antes da hora.** Com `onboarding_done=false`, qualquer rota privada não-onboarding redireciona ao onboarding (o router já faz isso). O servidor também bloqueia o envio (RPCs de envio). [conferir se `sign_envio_*` já checa `onboarding_done`; se não checar, registrar como pendência e não ampliar o escopo.]

## 4. Estados
- **Carregando:** esqueleto (`loading('Carregando')`), sem piscar a tela do passo errado: o passo só renderiza depois do `sign_me`.
- **Erro de rede ao carregar:** banner `danger` com "Não foi possível carregar seus dados." e botão "Tentar de novo".
- **Vazio:** não se aplica (conta nova tem formulário em branco).
- **Sem permissão:** sessão expirada vai ao login, preservando `de`. E-mail não confirmado vai ao aviso existente.
- **Sucesso:** toast "Tudo pronto. Sua conta está configurada." ao concluir.
- **Erro ao concluir:** `onboarding_incomplete` leva ao primeiro passo pendente com o aviso do RN-OB2. Erro de rede mantém o passo e mostra o banner de erro com "Tentar de novo".
- **Concorrência:** dois navegadores. O segundo, ao concluir, recebe sucesso idempotente.

## 5. Dados lidos e escritos (fonte única)
- Leitura: `sign_me()` (nome e CPF vêm de `profiles`; telefone, `verified`, `onboarding_done` e `cert` de `sign_identity`; empresas de `companies`). Nada novo é guardado no navegador além do hash, e o `DE_KEY` já existente.
- Escrita: `sign_profile_save` (passo 1), `sign_phone_send`, `sign_phone_verify` e RPCs de certificado existentes (passos 2 e 3), e `sign_onboarding_done` (final). Nenhuma tabela nova. Nenhum dado duplicado: o passo 1 grava em `profiles`, nunca em `sign_identity`.
- A migração nova (não aplicada): `supabase/migrations/20261128120000_sign_onboarding_e_ciclo2_1_5.sql` (ver seção 9). Para cada função alterada, mantém `grant execute` explícito só para `authenticated` e `revoke` de `anon`/`public`.

## 6. Textos da interface (PT-BR, exatos)
- h1 do passo 1: "Seus dados". Sub: "Precisamos do seu nome e CPF para identificar você nas assinaturas." Botão: "Salvar e continuar". Aviso: "Falta concluir esta etapa antes."
- Passo 2 h1: "Verificar contato". Sub: "Confirme que você recebe mensagens neste contato. Isso protege suas assinaturas." Botão: "Continuar". Estado ok: "E-mail confirmado" ou "Celular verificado" (V6-01).
- Passo 3 h1: "Certificado (opcional)". Sub: "Com certificado digital seus documentos podem ter nível mais alto de assinatura. Você pode fazer isso depois." Botões: "Concluir", "Pular certificado", "Voltar".
- Resumo "O que falta para enviar". Itens: "Seus dados" e "Contato verificado" (cada um com "Pronto" ou "Falta fazer"), "Certificado" ("Opcional" ou "Pronto"). Linha do nível: "Nível de assinatura hoje: {nível}." [usar os nomes de nível de `NIVEIS` da 1.4].
- Erros: "Não foi possível carregar seus dados.", "Não foi possível concluir agora. Tente de novo.", "Complete seus dados e verifique seu contato para concluir." (para `onboarding_incomplete`). Botão "Tentar de novo". Título de aba: "Primeiros passos · Lottus Sign".
- Avatar: item "Sair" (já existe). Sem textos em inglês, sem código cru (`onboarding_incomplete` nunca aparece para o usuário).
- Hipóteses: nenhum preço e nenhum texto jurídico. Se algum texto de consentimento for exigido, `[preencher]` e registrar pendência para o Yuri.

## 7. Layout por faixa
- **320–479 (celular):** uma coluna, `.ob-steps` em quebra de linha (flex-wrap) sem cortar rótulos (rótulo pode ir para a linha de baixo). Botões em largura total, empilhados (primário em cima). Sem rolagem horizontal. Alvos ≥ 44 px.
- **480–1023 (tablet):** coluna central de até 560 px, botões em linha (Voltar à esquerda, primário à direita).
- **≥ 1024 (desktop):** coluna de 640 px centralizada, resumo do passo 3 em cartão ao lado do certificado só se couber (≥ 1024 px, duas colunas 1fr/320 px). 2560 px: o conteúdo não passa de 640 px nem estica o fundo.
- Zoom 200% a 1440 px equivale ao layout de 720 px e não pode cortar nada. Ícones (`svg`) em banner, toast e vazio com teto de 32 px.
- Contraste mínimo AA (4.5:1). O estado `on` não depende só de cor.

## 8. Orçamento de desempenho
Medido, não estimado: JS novo ≤ +6 kB gzip (somado `onboarding.js` + componentes extraídos, que saem de `perfil.js`/`verificacao.js`, então o líquido deve ser menor). Troca de passo ≤ 100 ms (sem rede). `sign_me` ≤ 150 ms local. Sem nova dependência. Sem layout shift ao trocar de passo (CLS ≤ 0,05). Registrar as medidas na verificação.

## 9. Pacote ciclo 2 da 1.5 (C2-15)
Mesma migração `20261128120000_...sql`, com o topo documentando o que NÃO reverte (A15-N): constraint de canal NOT VALID, colunas `otp_locked_until` e `bound_at`, índice, revokes de tabela, remoção de `code` do outbox (irreversível), OTPs em voo deixam de valer. Mais: o `cron.unschedule` da purga e a perda do conteúdo do outbox já limpo. Cada item abaixo é um AC-R*.

- **A15-M1 CPF com lock.** `_sign_cpf_guarded_apply` abre com `pg_advisory_xact_lock(hashtextextended('cpf_guard:'||uid::text,0))` antes de contar. A resposta `cpf_in_use` continua (decisão de oráculo vai ao Arquiteto, já em A15-M1).
- **A15-M2 Purga agendada.** Bloco `do $$ ... if exists (select 1 from pg_extension where extname='pg_cron') then ... end if $$`: `cron.unschedule('lottus-sign-outbox-purge')` se já existir, depois `cron.schedule(...)`. Comentário de reversão: `select cron.unschedule('lottus-sign-outbox-purge')`. A purga deve limpar também `queued` antigos (> 1 dia) e apagar o `code` de `params`.
- **A15-B2 Ordem de locks.** Em `sign_phone_verify` (e onde o gatilho RN7 toca as duas tabelas) a ordem única é: 1º `profiles` (`select ... for update`), 2º `sign_identity`. O gatilho em `profiles` já segura `profiles` e depois toca `sign_identity`, então o verify segue a mesma ordem.
- **V6-01** Perfil usa `contact_kind` (`me` passa a expor `contact_kind`): "E-mail confirmado" quando `email`, "Celular verificado" quando `phone`. [conferir nome do campo na migração 1.5.]
- **V6-03 RN7 ajustada.** `sign_phone_send` por e-mail não altera `sign_identity.phone`, `phone_verified_at` nem `contact_kind` (apenas cria OTP e outbox). A verificação existente só é substituída quando o NOVO contato for confirmado em `sign_phone_verify`, que então grava `phone`, `phone_verified_at` e `contact_kind` do novo contato. O gatilho em `profiles` mantém a regra: telefone alterado fora do Sign continua derrubando a verificação por celular (A15-B3, documentar no Release).
- **V6-04** O aviso do shell ("Confirme seu e-mail") não aparece junto do banner de e-mail não confirmado na mesma tela: uma única origem do aviso (`shell.js` suprime quando a view já mostra o banner).
- **V6-05** CPF mascarado ("***.123.456-**" ou o padrão já usado no projeto, [conferir `_mask_cpf`]) na linha "Titular" do certificado e no `title`.
- **V6-08** Textos do desafio do servidor com acentos corretos (revisar todas as strings geradas em `sign_cert_challenge`).
- **V6-09** `create index if not exists sign_outbox_created_at_idx on public.sign_outbox (created_at);`

## 10. Critérios de aceite
Banco isolado local, com `SIGN_DB` e `SIGN_DB_ANTES` exportados (ANTES = esquema atual, DEPOIS = com a migração). Nada em produção.

**Banco (AC-B*)**
- AC-B1: Dado perfil incompleto, quando `sign_onboarding_done`, então `onboarding_incomplete` e `onboarding_done` continua false. ANTES: grava true (prova do defeito). DEPOIS: recusa.
- AC-B2: Dado perfil completo mas sem verificação, quando chama, então `onboarding_incomplete`.
- AC-B3: Dado perfil completo e contato verificado, sem certificado, quando chama, então `onboarding_done=true`, chamada repetida é idempotente.
- AC-B4: Dado certificado válido e sem celular, quando chama, então ok (`verified` = true).
- AC-B5: IDOR: usuário A não altera o estado de B (a função só usa `auth.uid()`).
- AC-B6: `anon` recebe permission denied em `sign_onboarding_done`; `authenticated` com e-mail não confirmado recebe `email_not_confirmed`. Grants: `anon` sem execute, `authenticated` com execute explícito, em todas as funções tocadas.
- AC-B7: Esquema: `sign_me` mantém o contrato anterior (campos antigos intactos) e acrescenta `contact_kind`.

**Pacote 1.5 (AC-R*)**
- AC-R1 (A15-M1): Dado 40 sessões simultâneas do mesmo usuário alterando CPF, então no máximo 5 `cpf_in_use` na hora (hoje 11, medir ANTES e DEPOIS).
- AC-R2 (A15-M2): Dado banco sem `pg_cron`, a migração roda sem erro. Dado com `pg_cron` (se houver), aplicar duas vezes deixa 1 job, e o `cron.unschedule` da reversão o remove. Outbox `queued` antigo é limpo e sem `code` em `params`.
- AC-R3 (A15-B2): Teste de deadlock em duas conexões: (a) verify e (b) update de `profiles.phone` em paralelo, repetido 200 vezes. ANTES: reproduz deadlock (40P01) ao menos uma vez; DEPOIS: zero.
- AC-R4 (A15-N): o topo da migração lista os itens que não revertem (teste: `grep` das 5 linhas no cabeçalho).
- AC-R5 (V6-01): `sign_me` devolve `contact_kind` coerente. UI mostra "E-mail confirmado" ou "Celular verificado" conforme o caso (Playwright).
- AC-R6 (V6-03): Dado celular verificado, quando envia código por e-mail e não confirma, então `phone_verified_at` e `phone` permanecem. Quando confirma o código, então a verificação passa ao novo contato. O teste de RN7 existente é atualizado e continua exigindo que mudar `profiles.phone` fora do Sign derruba a verificação.
- AC-R7 (V6-04): Com e-mail não confirmado, existe um só aviso visível (contagem = 1).
- AC-R8 (V6-05): O CPF completo não aparece no DOM nem no `title` da linha Titular.
- AC-R9 (V6-08): Nenhum texto do desafio vindo do servidor tem palavra sem acento (lista de palavras do teste: "assinatura", "verificação", "certificação"...).
- AC-R10 (V6-09): `explain` da purga usa o índice em `sign_outbox(created_at)`.

**Playwright (AC*)**
- AC1: Dado conta nova, quando entra, então chega em `#/onboarding/1` com `.ob-steps` (item 1 `aria-current="step"`).
- AC2: Dado o passo 1 válido, quando "Salvar e continuar", então vai ao passo 2. Dado nome com uma palavra, então a mensagem de erro da 1.4 aparece, sem sair do passo.
- AC3: Dado o passo 2 verificado (código), quando "Continuar", então vai ao 3. Dado `contact_kind` e-mail, rotula "E-mail confirmado".
- AC4: Passo 3: "Pular certificado" conclui, vai a Documentos, `onboarding_done=true`. "Concluir" idem. O resumo mostra o que falta e o nível.
- AC5: Retomada: fechar no passo 2 e relogar abre no passo 2. Perfil completo e sem verificação abre no 2. Tudo pronto sem done abre no 3.
- AC6: F5 em `/2` fica em `/2`. Voltar do navegador sai do `/2` para `/1` sem perder dados. Hash `/3` com perfil incompleto vira `/1` (replace) com o aviso. Hash inválido vira o passo inicial.
- AC7: Sem beco: em cada passo e em cada estado de erro (rede caída simulada) há saída (Sair pelo avatar, Voltar, "Tentar de novo"). "Sair" encerra a sessão.
- AC8: Tentar `#/documentos` com `onboarding_done=false` volta ao onboarding. Quem já terminou e abre `#/onboarding/2` vai a Documentos.
- AC9: Larguras 320, 375, 768, 1024, 1440, 2560: sem rolagem horizontal, sem corte, 3 itens de `.ob-steps` legíveis. Zoom 200% sem cortes. O verificador ABRE e olha cada captura (não vale só o teste passar).
- AC10: Teclado: Tab percorre na ordem visual, Enter aciona, foco visível, foco no h1 a cada troca de passo. Alvos ≥ 44 px (medir). Contraste ≥ 4.5:1 (medir em `on`, `done`, botões, banners).
- AC11: CSP: nenhum erro de CSP no console, nenhum estilo ou script inline novo, `node scripts/check.mjs` verde.
- AC12: `t-texto.cjs` varre todas as telas novas (os 3 passos, cada estado, erro, mobile e desktop) e não encontra `null`, `undefined`, `[object Object]`, `NaN`, `{n}`, `{mm}`, texto em inglês nem código cru (`onboarding_incomplete`, `cpf_in_use`...).
- AC13: Teto de 32 px para `svg` em banner, toast e vazio (medir `getBoundingClientRect`).

## 11. Regras de construção obrigatórias (lições 1.4/1.5)
`setKids` em toda renderização (nunca `replaceChildren` direto). Extrair os componentes em vez de copiar. Banco isolado com `SIGN_DB` e `SIGN_DB_ANTES` exportados. Seletores `.ob-steps` reutilizam o CSS existente (acrescentar só o que faltar). Nota de construção não vai ao verificador.

## 12. Reverificação (regra 14)
Tocam `ui.js`, `shell.js`, `router.js`, `perfil.js` e `verificacao.js`, portanto reverificar 1.0, 1.1, 1.4 e 1.5, com ANTES/DEPOIS das telas de Perfil e Verificação (mesmas capturas por largura). Nenhuma delas pode ter regressão visual ou de texto.

## 13. Pendências e decisões
- Para o Yuri: nenhuma nova decisão de preço ou jurídico. Confirmar apenas se "Pular certificado" fica visível a todos (recomendado: sim).
- Pendências já abertas e fora deste pacote: A15-M3 (antes do WhatsApp), A15-M4 (deploy do nonce), A15-B1, A15-B3, A15-B4, V6-02, V6-06 (oráculo `cpf_in_use`: decisão do Arquiteto).
- Registrar [conferir] da seção 3 (RN-OB10, nomes `contact_kind`, `_mask_cpf`) como verificações do construtor antes de editar.
- Próximo passo: `arquiteto` valida RN-OB7 e a ordem de locks; `designer` valida a seção 7; depois `desenvolvedor`.
