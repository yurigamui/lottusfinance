# Seção: Sign / Parte 1 / 1.5 Verificação de identidade

[IDEALIZADOR] · Rota `#/conta/verificacao` (aba Verificação de `#/conta`) · Status: especificação, não construída, não verificada. Nada aplicado em produção.

## Objetivo e papéis com acesso

Provar o contato do usuário com código de 6 dígitos e vincular um certificado ICP-Brasil. O nível de assinatura (Simples, Avançada ou Qualificada) fica visível. A seção é a única fonte de `phone_verified_at` e de `cert_*`.

- **Usuário logado com e-mail confirmado (RN1):** acesso total aos próprios dados.
- **Sem sessão:** vai para `#/entrar`.
- **E-mail não confirmado:** vê o aviso "Confirme seu e-mail para poder enviar documentos." e todas as ações ficam desligadas.
- **Admin:** não tem acesso nesta seção. O catálogo de raízes (`sign_root_*`) e a `sign_messaging_config` seguem no Admin. A 1.5 só os lê.

**Hipóteses do Yuri (não decididas por mim):**
- E-mail confirmado conta como nível Avançada, como o shell já deriva.
- O WhatsApp fica desligado até o Yuri ligar.
- A exigência de contato verificado antes de gravar o CPF.

## Entradas e saídas

| Elemento | Destino ou efeito | Condição |
|---|---|---|
| Entrada: aba "Verificação" do Perfil (`perfil.js`, hoje apontando para `construcao.js`) | `#/conta/verificacao` | sessão válida |
| Entrada: "O que falta para enviar" (onboarding 1.3) e erro `identity_required` ao enviar documento | `#/conta/verificacao` | sempre |
| Saída: "Voltar ao perfil" | `#/conta` | sempre |
| Saída: "Ir para meus documentos" | `#/documentos` | quando `verified=true` |
| Saída: "Corrigir meu CPF" | `#/conta` (campo CPF) | erro `cert_cpf_mismatch` |
| Saída: "Suporte" | link de suporte da 1.4 | erros sem saída própria |

## Elementos e comportamento

| Elemento | Tipo | Comportamento | Validação |
|---|---|---|---|
| Cartão "Nível de assinatura" | tag + texto | Usa `levelOf(me)` do `shell.js`, sem segunda derivação. Mostra a regra em uma linha. | Qualificada só com `cert.not_after > agora` |
| Seletor de canal | rádio | Mostra só canais com `channels.<canal>=true`. Hoje só "E-mail". Canal desligado nunca aparece, nem desabilitado. | cliente filtra; servidor recusa com `channel_unavailable` |
| "Enviar código" | botão | Chama `sign_phone_send(p_phone, p_channel)`. Com canal `email`, o destino é o e-mail da conta e `p_phone` é ignorado. Depois do envio, mostra o campo de código e o contador. | canal válido; sem bloqueio ativo |
| Campo de código | input de 6 dígitos (`inputmode=numeric`, `autocomplete=one-time-code`) | Aceita colar com espaços. Envia ao completar 6 dígitos ou no botão "Confirmar". | `^\d{6}$` |
| "Reenviar código" | botão | Fica desligado por 30 s, com contagem regressiva. Permite 3 envios por hora. | `too_soon`, `too_many` |
| Linha "Contato verificado" | texto | Mostra "E-mail confirmado" ou "Celular verificado" conforme `contact_kind`, com a data. | rótulo honesto (P1-02) |
| Cartão "Certificado digital (opcional)" | seção | 1) "Gerar desafio" chama `sign_cert_challenge`. 2) Mostra o texto do desafio com "Copiar" e validade de 5 min. 3) Campo de envio do arquivo assinado `[preencher: formato e componente de assinatura local, definidos por T-07]`. 4) Chama a função de borda de validação (não existe no repositório). | CPF, cadeia e validade |
| Indicador "Validação de certificado indisponível neste ambiente" | faixa de aviso | Aparece quando a função de borda dá timeout (8 s), 404 ou 5xx, ou quando `roots_loaded=false`. Nesse caso o envio fica desligado e o restante da tela segue funcionando. | verificado por simulação de falha |
| Cartão do certificado vinculado | leitura | Mostra titular, emissor, CPF mascarado, validade e série. Vencido vira "Certificado vencido em dd/mm/aaaa" e o nível cai. | `cert_expired` |

**Regras de servidor, todas testáveis:**

- **Tentativas (S-05).** Cada código errado persiste `attempts+1` e **não levanta exceção**: devolve `{ok:false, error:'otp_invalid', remaining:n}`. Na 5ª tentativa errada, grava `sign_identity.otp_locked_until = now()+30 min` e devolve `{ok:false, error:'otp_locked', retry_after:1800}`. O código consumido ou expirado devolve `{ok:false}` com o mesmo formato (`otp_expired`, `otp_not_found`). Exceção fica só para `email_not_confirmed`, `invalid_channel` e `invalid_input`.
- **Bloqueio.** Enquanto `otp_locked_until > now()`, `sign_phone_send` e `sign_phone_verify` devolvem `otp_locked` com `retry_after`. O bloqueio sobrevive a um novo envio e a um novo login.
- **Reenvio.** São 3 envios por hora (hoje o limite é 6) e 30 s de intervalo mínimo. O 4º devolve `too_many` com `retry_after`.
- **Hash do código.** `sha256(código || ':' || user_id || ':' || id do otp)`. O código vale 10 min e é de uso único. Pepper no Vault fica como pendência (hipótese).
- **Canal.** `sign_phone_send` aceita `email` e `whatsapp`. `sms` devolve `invalid_channel`. `whatsapp` com `whatsapp_enabled=false` devolve `channel_unavailable`. Com `email`, a prova grava `phone_verified_at` e `phone_channel='email'`, sem exigir telefone. `sign_me` ganha o campo `contact_kind` (`email`, `phone` ou null) e `cert_expired` (boolean).
- **RN7.** Se o contato mudar, `phone_verified_at` e `phone_channel` voltam a null, na mesma transação. Vale para `sign_profile_save` e para `sign_phone_send` com destino diferente do verificado. Um reenvio para o mesmo destino não derruba a verificação.
- **R2.** `sign_outbox.params` guarda `{minutes, otp_id}` e o código apenas enquanto o status é `queued`. Um trigger `BEFORE UPDATE` remove a chave `code` quando o status vira `sent` ou `failed`. O esboço da rotina `lottus-sign-outbox-purge` (pg_cron, `*/15 * * * *`) remove `code` de linhas com mais de 15 min. Fica só como SQL na migração, sem `cron.schedule` ativo. O `authenticated` não lê `sign_outbox`. `sign_otp_delivery` devolve só `status` e `channel`.
- **RN9.**
  - `_sign_cert_save` rejeita `cert_expired` (`not_after < agora`), `cert_not_yet_valid`, `cert_cpf_mismatch` e `cert_chain_invalid` (`chain_ok=false` não vincula). Exige CPF no perfil (`cpf_required`).
  - `sign_cert_challenge` exige CPF no perfil, limita a 10 desafios por hora e usa nonce de uso único válido por 5 min.
  - `sign_me.cert` e `verified` consideram só certificado com `not_after > now()`.
  - `sign_env_create` troca a checagem de identidade por `cert_not_after > now()` (`identity_required` caso contrário).
- **A14-M3.** Em `sign_profile_save`, cada `cpf_in_use`, `cpf_invalid` ou `cpf_locked` conta numa tabela `sign_cpf_attempts(user_id, at)`. A partir da 5ª no intervalo de 1 hora devolve `too_many_attempts` com `retry_after`. A mensagem de `cpf_in_use` passa a ser genérica e não confirma quem tem o CPF. A exigência de contato verificado antes do CPF fica como hipótese do Yuri.

## Estados

- **Carregando:** esqueleto dos 3 cartões, com `aria-busy`. Sem salto de layout.
- **Vazio:** nenhum contato nem certificado. Mostra "Seu e-mail ainda não foi confirmado como contato de assinatura." e o botão "Enviar código".
- **Erro de rede ou servidor:** "Não foi possível carregar seus dados. Verifique sua conexão." com "Tentar de novo". As mensagens por causa vêm da tabela abaixo.
- **Sem permissão:** sem sessão vai para `#/entrar`. E-mail não confirmado mostra o aviso e deixa tudo desligado.
- **Sucesso:** "E-mail confirmado." com o nível atualizado no shell. O certificado vinculado aparece como "Certificado vinculado".
- **Muitos dados:** não se aplica. O certificado tem uma linha, com titular longo truncado e `title` completo.

## Dados lidos e escritos (fonte única)

- **Lidos:** `sign_me`, `sign_otp_delivery`, `sign_messaging_config` (via `channels` do `sign_me`), `sign_cert_challenge`.
- **Escritos:** `sign_phone_send`, `sign_phone_verify`, `sign_cert_challenge`, `_sign_cert_save` (só pela função de borda), e `sign_profile_save` (CPF e telefone).
- **Tabelas:** `sign_otps`, `sign_identity`, `sign_outbox`, `sign_cert_challenges`, `sign_trusted_roots` (somente leitura).
- **Fonte única:** pessoa e CPF em `profiles`; empresa em `companies`. A 1.5 não duplica nenhum deles.
- **Migração nova:** `supabase/migrations/AAAAMMDDHHMMSS_sign_verificacao_identidade.sql`, não aplicada. Revogar `execute` de `anon` e `public` e dar `grant execute` explícito ao `authenticated` nas funções alteradas. RLS ligado nas tabelas novas.

## Textos da interface e mensagens de erro (PT-BR)

Títulos e botões:
- "Verificação de identidade"
- "Nível de assinatura"
- "Enviar código"
- "Confirmar"
- "Reenviar código"
- "Gerar desafio"
- "Copiar"
- "Tentar de novo"

Descrições:
- Simples: "Simples: e-mail confirmado."
- Avançada: "Avançada: contato verificado."
- Qualificada: "Qualificada: certificado digital válido."
- Aviso do desafio: "O desafio vale 5 minutos."

Mensagens por causa:

| Código | Texto |
|---|---|
| `otp_invalid` | "Código incorreto. Você tem mais {n} tentativas." |
| `otp_locked` | "Muitas tentativas. Tente de novo em {mm} minutos." |
| `otp_expired` | "O código expirou. Peça um novo." |
| `otp_not_found` | "Peça um código para continuar." |
| `too_soon` | "Aguarde {s} segundos para reenviar." |
| `too_many` | "Limite de reenvios atingido. Tente de novo em {mm} minutos." |
| `channel_unavailable` | "Este canal não está disponível." |
| `email_not_confirmed` | "Confirme seu e-mail para poder enviar documentos." |
| `identity_required` | "Verifique sua identidade para enviar documentos." |
| `cert_expired` | "Este certificado está vencido. Use um certificado válido." |
| `cert_not_yet_valid` | "Este certificado ainda não está válido." |
| `cert_cpf_mismatch` | "O CPF do certificado é diferente do CPF do seu perfil." |
| `cert_chain_invalid` | "Não foi possível confirmar a cadeia de certificação. Use um certificado ICP-Brasil." |
| `challenge_expired` | "O desafio expirou. Gere um novo." |
| `cpf_required` | "Informe seu CPF no perfil antes de usar um certificado." |
| `roots_not_loaded` | "Nenhuma autoridade raiz confiável está carregada." |
| `too_many_attempts` | "Muitas tentativas. Tente de novo em {mm} minutos." |
| `cpf_in_use` (genérico) | "Não foi possível usar este CPF. Confira o número ou fale com o suporte." |
| indisponível | "Validação de certificado indisponível neste ambiente." |

## Layout por faixa: celular / tablet / desktop

- **320 a 479 px:** uma coluna, botões com largura total e altura mínima de 44 px. O campo de código mostra os 6 dígitos sem corte. Modais com botões empilhados em largura total.
- **480 a 1023 px:** uma coluna com largura máxima de 640 px, centralizada. Botões em linha.
- **1024 a 2560 px:** cartão de nível à esquerda e contato com certificado à direita, container de até 1120 px centralizado. Sem barra horizontal em nenhuma largura.
- **Larguras de teste:** 320, 375, 768, 1024, 1440 e 2560.

## Orçamento de desempenho

- Tela interativa em menos de 1,5 s em rede 4G simulada.
- `sign_me` com p95 abaixo de 150 ms em banco local.
- `sign_phone_verify` com p95 abaixo de 150 ms.
- Sem aumento do pacote JS acima de 15 KB.
- Medir e registrar os números. Não estimar.

## Critérios de aceite

### Banco real local (AC-B)

Rodar em banco isolado criado para o teste. Nunca usar o banco compartilhado.

- **AC-B1 (S-05, ANTES).** Dado o esquema atual, quando um usuário erra `sign_phone_verify` 6 vezes, então `attempts` continua em 0 e a 6ª tentativa ainda é avaliada. Registrar como prova da falha.
- **AC-B2 (S-05, DEPOIS).** Dado o esquema migrado, quando erra 5 vezes, então `attempts=5`, cada retorno traz `ok:false` e `remaining` decrescente (4, 3, 2, 1, 0), e na 5ª `otp_locked_until≈now()+30 min`.
- **AC-B3 (bloqueio 30 min).** Dado `otp_locked_until` no futuro, quando chama `sign_phone_send` ou `sign_phone_verify` (inclusive com o código certo), então devolve `otp_locked` com `retry_after`. Com `otp_locked_until` no passado, o fluxo volta a funcionar.
- **AC-B4 (reenvio).** Quando faz 3 envios em 1 hora (com 30 s de intervalo simulado), então o 4º devolve `too_many` e o envio dentro de 30 s devolve `too_soon`.
- **AC-B5 (canal e-mail).** Dado `channel=email`, quando envia e confirma o código certo, então `phone_verified_at` é preenchido, `phone_channel='email'`, `sign_me.verified=true` e `contact_kind='email'`.
- **AC-B6 (canal desligado).** Dado `whatsapp_enabled=false`, quando chama `sign_phone_send` com `whatsapp`, então `channel_unavailable` e nenhuma linha nova em `sign_otps` e `sign_outbox`. Com `sms`, `invalid_channel`. `sign_me.channels` traz `whatsapp:false` e `sms:false`.
- **AC-B7 (anon).** Quando `anon` chama qualquer RPC alterada ou nova, então permissão negada. A checagem consulta `has_function_privilege`.
- **AC-B8 (IDOR).** Quando o usuário B tenta consumir o código do usuário A, ou ler `sign_otps`, `sign_outbox`, `sign_cert_challenges` ou `sign_identity` de A, então não vê nada e nada é alterado.
- **AC-B9 (hash).** Dado um código gerado, então `sign_otps.code_hash` não contém o código e dois usuários com o mesmo código têm hashes diferentes.
- **AC-B10 (RN7).** Dado contato verificado, quando `sign_profile_save` troca o telefone ou `sign_phone_send` usa outro destino, então `phone_verified_at` e `phone_channel` ficam nulos e `sign_me.verified` vira false (sem certificado). Reenvio para o mesmo destino mantém a verificação.
- **AC-B11 (R2).** Dado um envio, então enquanto `queued` `sign_outbox.params` tem `code`. Ao virar `sent` ou `failed`, o trigger remove `code`. Após rodar o SQL da rotina de purga manualmente, linhas `queued` com mais de 15 min também ficam sem `code`. `grep` no dump de `sign_outbox` não encontra nenhum código já usado. Nenhum `cron.schedule` na migração.
- **AC-B12 (RN9: certificado vencido).** Dado `cert_not_after` no passado, então `sign_me.cert` é null, `cert_expired=true`, `verified=false` (sem contato verificado) e `sign_env_create` devolve `identity_required`. Com `not_after` no futuro, passa.
- **AC-B13 (RN9: demais).** Quando `_sign_cert_save` recebe CPF diferente do perfil: `cert_cpf_mismatch`. Com `chain_ok=false`: `cert_chain_invalid`. Perfil sem CPF: `cpf_required`. Nonce usado ou vencido: `challenge_expired`. Sem raízes ativas: `roots_loaded=false`. O 11º desafio da hora é recusado.
- **AC-B14 (A14-M3).** Dado um usuário com 5 tentativas de CPF recusadas em 1 hora, então a 6ª devolve `too_many_attempts` mesmo com CPF livre. O texto de `cpf_in_use` é igual ao de `cpf_invalid`.
- **AC-B15 (sem regressão).** Os testes de `sign_phone_*`, `sign_me`, `sign_profile_save` e `sign_env_create` das seções 1.1 a 1.4 continuam passando.

### Playwright (AC)

- **AC1.** Dado e-mail confirmado e canal e-mail ativo, quando clica em "Enviar código" e digita o código obtido no banco, então aparece "E-mail confirmado." e o nível sobe para Avançada no shell e no Perfil.
- **AC2.** Dado `whatsapp_enabled=false`, então a tela mostra só "E-mail". Uma chamada direta pelo console recebe `channel_unavailable`.
- **AC3.** Quando erra o código 5 vezes, então vê "Código incorreto. Você tem mais {n} tentativas." de 4 a 1, depois "Muitas tentativas. Tente de novo em 30 minutos.", e o botão fica desligado. Recarregar a página mantém o bloqueio.
- **AC4.** O botão "Reenviar código" fica desligado por 30 s com contagem regressiva. Após 3 envios mostra o limite.
- **AC5.** Com a função de borda de certificado simulada fora do ar, aparece "Validação de certificado indisponível neste ambiente." e o envio fica desligado. O contato continua funcionando.
- **AC6.** Com certificado vencido, vencido em `sign_identity`, o cartão mostra "Certificado vencido em dd/mm/aaaa" e o nível não é Qualificada. Cada mensagem de erro de certificado da tabela aparece, com o texto exato.
- **AC7.** Sem sessão vai para `#/entrar`. E-mail não confirmado mostra o aviso e tudo desligado. Cada estado (carregando, vazio, erro, sem permissão, sucesso) é capturado.
- **AC8.** Nas larguras 320, 375, 768, 1024, 1440 e 2560 não há barra horizontal, texto cortado nem botão menor que 44 px. Cada captura é inspecionada visualmente por quem verifica, não só pelo script.
- **AC9.** Nenhum beco sem saída: todo estado tem "Voltar ao perfil" ou "Tentar de novo". Todos os links da tela são percorridos.
- **AC10.** O nível exibido na aba, no Perfil e no shell é igual para os mesmos dados (uma só função `levelOf`).

### Pacote de correções P-01 a P-04 (AC-R)

- **AC-R1 (P-01).** Dado `termsUrl` ou `privacyUrl` vazio, quando abre `#/criar`, então "Termos de uso" e "Política de Privacidade" aparecem só como texto, sem `<a>`, e o clique não navega. Com URL válida, abre em nova aba com `rel="noopener noreferrer"`.
- **AC-R2 (P-02).** Dado nome só com caracteres invisíveis (por exemplo U+200B), então avatar e `.org-name` mostram o e-mail ou a inicial do e-mail, nunca em branco (`initialsOf` e `paintMe`).
- **AC-R3 (P-03).** O checkbox de aceite tem área clicável de no mínimo 44×44 px, medida em 320 e em 1440.
- **AC-R4 (P-04).** Em 320, os botões do modal "Descartar" têm largura total e altura mínima de 44 px, empilhados, sem corte.

## Regras de construção obrigatórias (lições da 1.4)

1. **`setKids`:** toda atualização de filhos de um nó usa o helper `setKids`. Nada de `innerHTML` com dados.
2. **`t-texto.cjs`:** varredura de texto ampliada para cobrir as telas novas. Ela reprova texto em inglês, código de erro vazando, "undefined", "null", "[object", `{n}` ou `{mm}` sem substituir, e acentos faltando.
3. **Capturas inspecionadas:** o verificador abre e olha as capturas por largura. Não basta o teste passar.
4. **Banco isolado:** os testes criam e destroem o próprio banco. Nunca tocam o banco compartilhado nem produção.
5. **Reverificação:** a mudança em `levelOf`, `sign_me`, `_sign_cert_save`, `sign_env_create` ou `sign_profile_save` dispara a reverificação das seções 1.1 a 1.4.
6. Rodar `node scripts/check.mjs` antes do commit. Cache-bust (`?v=`) atualizado nos módulos alterados.

## Pendências registradas

| ID | Pendência | Dono |
|---|---|---|
| T-07 (reafirmada) | A Edge Function de validação da cadeia do certificado não está no repositório. A UI e o banco ficam prontos, mas a validação criptográfica real fica não verificada. Não inventar a função. O formato do arquivo assinado fica `[preencher]`. | Yuri/time (D-02) |
| T-07b | `sign-messenger` também não está no repositório. O envio real do código por e-mail não é testável aqui. Os testes validam a linha em `sign_outbox` e o hash. | Yuri/time |
| H-1 | E-mail confirmado conta como Avançada? (hipótese a confirmar) | Yuri |
| H-2 | Exigir contato verificado antes de gravar o CPF (alternativa ao limite de A14-M3). | Yuri |
| H-3 | Pepper do hash do código no Vault. | Arquiteto |
| H-4 | Prazo de retenção das linhas de `sign_outbox` (apagar dados é decisão do Yuri). | Yuri |
| H-5 | Ligar o WhatsApp: precisa de template aprovado e `whatsapp_secret_id` (serviço pago). | Yuri |

## Não testável agora

- Entrega real de e-mail e WhatsApp.
- Validação criptográfica real da cadeia do certificado.
- Agendamento real do pg_cron.
- Comportamento em produção.

Todos esses itens entram como "não verificado" no relatório.
