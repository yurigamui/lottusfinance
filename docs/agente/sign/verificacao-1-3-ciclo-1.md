# Verificação: Sign / 1.3 Onboarding + pacote C2-15 · ciclo 1 · 27/11/2026
[VERIFICADOR] + [AUDITOR] (contexto limpo) · commit 193b0bb · bancos isolados · nada aplicado em produção

## Veredito: APROVADA COM RESSALVAS (0 Bloqueante, 0 Alto). Fecha também o ciclo 2 da 1.5.
Onboarding: 3 passos em todos os estados, retomada no passo certo, F5/Voltar, hash digitado/inválido, quem já concluiu, erros de rede/500/`onboarding_incomplete`, duas abas. `sign_onboarding_done`: ANTES grava true em 10 casos; DEPOIS recusa 8 (idempotente, IDOR, anon, grants). Pacote C2-15: A15-M1 (40 sessões: 23→5 `cpf_in_use`; auditor 36→5), A15-B2 (deadlock 200→0; auditor 43→0 em 400), A15-M2 (sem pg_cron roda; extensão simulada: 1 job idempotente), A15-N, V6-01, V6-03, V6-05, V6-08, V6-09. Migração idempotente e reversível. Regressão: 1.0/1.1/1.4/1.5 e assinar/verificar sem diferença além da esperada (V6-01 no Perfil). Varredura de texto em 14 estados do onboarding × 4 larguras × 2 temas sem null/undefined/{n}/{mm}/inglês/códigos crus. Auditor: estresse de 81 mil chamadas, 0 deadlock.

## Achados
| ID | Sev. | O que |
| --- | --- | --- |
| M-01 | Médio | Gate do servidor aceita nome só de caracteres invisíveis (`_sign_name_norm`, anterior à 1.3): a UI entende "sem nome" e bloqueia o passo 1, mas `sign_onboarding_done` devolve true; rejeitar invisíveis em `profile_complete` e no gate |
| A13-M1 | Médio (deploy) | Texto do desafio acentuado: a função de borda T-07 precisa usar o `text` devolvido |
| A13-M2 | Médio (latente) | = A15-M3, antes de ligar o WhatsApp |
| B-1 | Baixo | h1 "Seus dados" no erro de carga dos passos 2 e 3 |
| B-2 | Baixo | E-mail do topo quebra no meio da palavra em 320 px (conta sem nome); vem da 1.0 |
| B-3 | Baixo | Passo 3 sem `certEndpoint`: "Gerar desafio" continua ativo; "Pular certificado" aparece com certificado já vinculado |
| B-4 | Baixo | Tags "Pronto/Opcional" desalinhadas no resumo do passo 3 a 1280 px |
| B-5 | Baixo | Perfil mostra "Verificado/Não verificado" e não os rótulos literais do AC-R5; celular antigo segue "Não verificado" após verificar por e-mail |
| B-6 / A13-B3 | Baixo | Purga: `queued` > 15 min perde `code` mas segue queued; > 30 dias só pela migração |
| B-7 | Baixo | RN-OB10: `sign_env_create` não checa `onboarding_done` (decisão A13-B1: marca de fluxo) |

## Não testado
Supabase/PostgREST/GoTrue reais · pg_cron real · entrega real de e-mail/WhatsApp · função de borda do certificado (T-07) · leitor de tela, Safari, Firefox, teclado virtual, bfcache, zoom real · capturas de 768 e 2560 abertas uma a uma e do estado "erro ao concluir" nas 4 larguras.
