# Verificação: Sign / 1.5 Verificação de identidade · ciclo 1 · 27/11/2026
[VERIFICADOR] + [AUDITOR] (contexto limpo) · commit 63476c7 · bancos isolados · nada aplicado em produção

## Veredito: APROVADA COM RESSALVAS (0 Bloqueante, 0 Alto)
S-05 provado ANTES (6 erros deixam attempts=0 e o código certo ainda passa) e DEPOIS (remaining 4..0; bloqueio de 30 min persistido, vale para o código certo, sobrevive a novo envio e novo login; 12 erros simultâneos = attempts 5). Reenvio 3/h e 30 s; canais (whatsapp desligado nunca oferecido; sms inválido); R2; hash; RN9 completo; A14-M3 por texto; grants, IDOR com 3 usuários, idempotência (332 itens idênticos), reversão. Gatilho RN7 em `profiles.phone` seguro (sem recursão/erro, usuário Partners do seed). Contrato `{ok:false}`: só o Sign chama essas RPCs. Tela: todos os estados, varredura de texto em 320/390/768/1280 sem null/undefined/{n}/{mm}; capturas inspecionadas; AC-R1..R4 ok; regressão 120 capturas (diferenças só esperadas).

## Achados
| ID | Sev. | O que |
| --- | --- | --- |
| V6-01 | Médio | Perfil rotula o celular "Verificado" quando a prova foi por e-mail (`perfil.js` usa `phone_verified` sem `contact_kind`) |
| V6-02 | Médio | Gatilho RN7: limpar/trocar o telefone no Partners/Wealth derruba a verificação do Sign (intencional por RN7; documentar) |
| V6-03 | Médio | `sign_phone_send` por e-mail derruba a verificação de celular já existente no envio (só por chamada direta; a tela não expõe) |
| A15-M1 | Médio | Limite de CPF furado por concorrência (11 em vez de 5): advisory lock |
| A15-M2 | Médio | Código em claro em outbox `queued` sem prazo: agendar a purga na migração |
| A15-M3/M4 | Médio | WhatsApp: UNIQUE/ordem de checagem antes de ligar; deploy exige nonce na função de borda |
| A15-B2 | Médio→Baixo | Deadlock latente verify(WhatsApp) × gatilho em `profiles`: mesma ordem de locks |
| V6-04..V6-09 | Baixo | Aviso do shell duplicado com e-mail não confirmado; CPF inteiro no "Titular" do certificado; `cpf_in_use` distinto no JSON; JS +7 kB gzip; acentos faltando no desafio vindo do servidor; purga sem índice em `created_at` |

## Não testado
Entrega real de e-mail/WhatsApp e `sign-messenger` (T-07b) · validação criptográfica do certificado (T-07) · Supabase/PostgREST/GoTrue reais e gatilhos reais de `profiles` · pg_cron agendado · leitor de tela, Safari, Firefox, teclado virtual, bfcache · 4G simulado · capturas de 1280/2560 claro e bloqueio nas 6 larguras abertas uma a uma.
