# Nota de construção: Sign 1.5 Verificação de identidade
27/11/2026 · Desenvolvedor · **Construída, NÃO verificada.** Nada aplicado em produção; nada commitado por mim (o commit 33acdf4 com o trabalho em andamento veio do Maestro).

## O que foi feito
- **Migração** `supabase/migrations/20261127120000_sign_verificacao_identidade.sql` (só no Postgres local; idempotente; reversão no topo; `cron.schedule` só em comentário): S-05 com tentativa persistida (`{ok:false,...}` em vez de exceção), bloqueio de 30 min (`sign_identity.otp_locked_until`), 3 envios por hora + 30 s, canais (e-mail ativo, whatsapp pronto e desligado, sms = `invalid_channel`), hash `sha256(código:user:otp)`, RN7 (envio para outro destino + trigger em `profiles.phone`), R2 (trigger em `sign_outbox` + `_sign_outbox_purge`), RN9 (`_sign_cert_save`, `sign_cert_challenge`, `sign_me`, `sign_env_create`), A14-M3 (`sign_cpf_attempts`, `_sign_cpf_guarded_apply`). `sign_outbox` passou a aceitar canal `email`. Revoke de `anon`/`authenticated` nas tabelas `sign_otps`, `sign_outbox`, `sign_cert_challenges`. `gerar-reversao-1-5.sh` gera a reversão (fora do repo).
- **Front**: `js/views/verificacao.js` (nível, contato com código de 6 dígitos, certificado), rota `#/conta/verificacao` real; `api.js` (`phoneSend`, `phoneVerify`, `certChallenge`, `ok:false` vira Error com code/remaining/retryAfter, `classify` com `cpf_limite`); `config.js` com `certEndpoint` (vazio = desligado); `perfil.js` (texto genérico de `cpf_in_use`, limite de CPF; `suporte` exportado); `styles.css`; `?v=20261127a` em todos os módulos (tem de ser todos juntos, senão o shell duplica).
- **Pacote AC-R**: P-01 (`safeUrl('')` devolve vazio), P-02 (`cleanName` em `initialsOf`/`paintMe`), P-03 (checkbox 44x44 desenhado por CSS, também o rádio), P-04 (rodapé do modal empilhado, largura total, `flex:none`).
- **Infra**: `fake-sign.cjs` (`codeOf(email)` lê o código do banco isolado; borda de certificado SIMULADA em `/functions/v1/sign-cert-validate` com modos `down|timeout|404|500`), `reset.sh` (aplica 1.4 e 1.5; `SIGN_SO_ATE=1.4`), `prova.sql`, `perfil-lib.cjs` (`restaurar` limpa tentativas de CPF), `t-verif-db.cjs`, `t-verif.cjs`, `t-texto.cjs` ampliado.

## Testado (Postgres 16 local isolado `sign_dev15`/`sign_dev15_antes` + Chromium/Playwright)
| Suíte | Resultado |
| --- | --- |
| t-verif-db.cjs (AC-B1..B15, idempotência 2x, reversão, desempenho) | 204 de 204 |
| t-verif.cjs (AC1..AC10, A14-M3 na tela, AC-R1..R4, LCP/CLS, JS) | 315 de 315 |
| t-texto.cjs (ampliado: 152 verificações; novo regex `{n}`/`{mm}`/`{s}`, código de erro vazando, inglês; 15 estados da Verificação em 320/768/1280) | 152 de 152 |
| t-perfil-db / t-perfil / t-ac / t-shell / t-layout / t-comp / t-corr | 141 / 245 / 96 / 183 / 99 / 63 / 45, todos n de n |
| t-regressao (36 capturas, 655ac83 x atual) | 30 idênticas; as 6 que diferem são `*-2-criar-erro` (só o checkbox de P-03, visto lado a lado em 320) |
| check.mjs / smoke.mjs | 0 erros / "nenhum problema" (o smoke rodou todos os apps) |

Provas: S-05 ANTES (6 erros, `attempts=0`, 7ª tentativa certa passa) e DEPOIS (`remaining` 4,3,2,1,0, `otp_locked_until`≈+30 min) em `t-verif-db`; idempotência: hashes de definição, ACL e dados idênticos na 2ª aplicação; reversão devolve as 8 funções com hash idêntico e o `sms` volta a funcionar.
Números (`docs/agente/sign/evidencias-1-5/p95-1-5.txt`, `explain-1-5.txt`, 10 mil perfis, 30 mil otps): `sign_me` p95 3,1 ms (ponta a ponta), 29,0 ms em 10x10 paralelas; `sign_phone_verify` p95 4,8 ms (erro) e 4,5 ms (sucesso); `sign_phone_send` 5,1 ms; banco puro ≤ 3,3 ms. EXPLAIN sem Seq Scan em `sign_identity`, `sign_otps`, `sign_cpf_attempts`, `sign_cert_challenges`, `sign_outbox`, `profiles`; cada consulta < 5 ms. Tela: tela pronta em ~930 ms e LCP ~930 ms, CLS 0 (4G simulado 1,6 Mbps/150 ms, **com gzip**, como o Cloudflare serve; o primeiro teste sem gzip deu 1867 ms, acima de 1,5 s). JS: +8,3 kB gzip sobre a 1.4 (verificacao.js 7,3 kB; teto 15 kB).

Capturas (fora do repo): `/tmp/claude-0/-home-user-lottusfinance/517b6e59-fb48-5e18-a9f7-f5941e47c5f2/scratchpad/shots/` (ac8-<largura>-<estado>.png, 6 larguras x 9 estados, ac3, ac4, ac5, ac6, ac7, acr3, acr4). Abri e li: 320 (código com erro, erro de certificado), 390 e 1280 (vazio) e 1440 (certificado longo). Achei e corrigi: grade a 1440 centralizada fora do alinhamento do título (agora alinhada). Não abri uma a uma as 54 de AC8; para elas valem só os testes automáticos (sem barra, controle ≥ 44 px, sem corte).

## Mudanças nas suítes anteriores
- `t-perfil-db`: os erros de CPF de `sign_profile_save`/`sign_account_save` (`cpf_locked`, `cpf_in_use`, `invalid_cpf`) agora voltam `200 {ok:false,error}`; 10 asserções passam pelo helper `E()` que aceita os dois formatos. Nada mais.
- `t-perfil` AC5: texto novo "Não foi possível usar este CPF. Confira o número ou fale com o suporte."
- `t-shell` AC4: `#/conta/verificacao` deixou de ser "Em construção": saída "Voltar ao perfil".
- `perfil-lib.cjs` `restaurar` apaga `sign_cpf_attempts` (senão o limite de 5/h atrapalha os testes da 1.4).
- `t-texto`: regex ampliado (ver acima) vale para todas as telas já cobertas; nenhuma falhou.

## NÃO testado
Produção, Supabase/PostgREST/GoTrue reais; entrega real de e-mail/WhatsApp (T-07b, só a linha do outbox e o hash); **validação criptográfica do certificado e a função de borda reais (T-07): o fake apenas chama `_sign_cert_save` com campos de um JSON de teste**; formato do arquivo assinado ainda `[preencher]`; agendamento real do pg_cron; leitor de tela, Safari, Firefox, teclado virtual; clipboard real (`Copiar`: só o caminho de falha foi pensado, não testado); vínculo por CNPJ (`_sign_link_try`) no `_sign_cert_save`; as 54 capturas de AC8 não foram vistas uma a uma.

## Decisões
1. Erros esperados voltam `{ok:false,...}` (S-05, A14-M3, `sign_cert_challenge`); exceção só para `email_not_confirmed`, `invalid_channel`, `invalid_input` e demais erros de 1.4 (`invalid_name`...). Contrato do cliente mudou (`api.js` converte).
2. RN7 "sign_profile_save troca o telefone": como a 1.4 (R5) diz que ele nunca toca `phone`, a regra foi posta num **trigger em `profiles.phone`** (vale para qualquer escritor). Atinge uma tabela compartilhada com Partners/Wealth, mas só age em quem tem celular verificado.
3. `_sign_cert_save` exige o **nonce** do desafio (`sign_cert_challenges.bound_at`, uso único, 5 min). A função de borda atual (se existir em produção) precisa enviá-lo; senão o vínculo é recusado.
4. `cert sem CPF` conta como `cert_cpf_mismatch` (antes passava). `not_after` nulo = inválido.
5. `sign_account_save` (doc) passa pelo mesmo limite de CPF; senão seria atalho para enumerar CPFs.
6. A tentativa de CPF só conta quando um CPF é enviado.
7. Extras fora da lista da spec, necessários: `sign_me.cert_expired_at` (data do vencimento), `sign_me.otp_retry_after` (bloqueio sobrevive ao recarregar), `sign_phone_send.limit_retry_after` e `sends_left`.
8. Outbox: o trigger também limpa `code` em `not_configured`.
9. "Gerar desafio" continua ligado com a borda indisponível (a spec desliga só o envio do arquivo); "Enviar arquivo assinado" fica desligado. Disponibilidade é lembrada no redesenho.
10. Entrada `#/conta/verificacao?motivo=identity_required` mostra o aviso (para a 1.3 e o envio de documento).
11. Texto literal da spec mantido mesmo com número 1: "mais 1 tentativas", "1 minutos", "1 segundos".

## Dúvidas para o Yuri/time
- Aplicar a migração só depois de conferir se a função de borda de produção envia o nonce (decisão 3) e se `sign-messenger` aceita `channel='email'`.
- Códigos em voo na hora da migração (≤ 10 min) deixam de valer (novo hash).
- Singular nos textos (decisão 11): corrigir a spec?
- Reenvio muda o contato por e-mail para telefone e vice-versa: cai a verificação na hora do envio, não só ao confirmar (literal da spec). Pode surpreender.
- Contrato assumido da borda: `POST {nonce, signed_b64}` com Bearer do usuário, resposta `{ok:true}` ou `{ok:false,error:<código>}`; GET = ping. Não é a função real.
- H-1..H-5 seguem em `pendencias.md`.
