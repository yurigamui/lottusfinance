# Verificação: Sign / 1.2 Recuperar senha + pacote C2-13 · ciclo 1 · 27/11/2026
[VERIFICADOR] + [AUDITOR] (contexto limpo) · commit 273d4aa · bancos isolados · nada aplicado em produção

## Veredito: APROVADA COM RESSALVAS (0 Bloqueante, 0 Alto). Fecha também o ciclo 2 da 1.3.
Resposta neutra byte a byte igual (existente, inexistente, revealExisting) sem pista por texto, tempo ou foco; reenvio 60 s e 3/h persistente em F5; nova senha (contador, medidor, confirmação, mostrar/ocultar, fraca, mesma, 401/403, 429, rede, erro desconhecido sem texto cru); 1 PUT em duplo clique; 1 logout scope=others; continua logado; destino por onboarding_done; replace sem reabrir o formulário; senha nunca em DOM/storage/URL/cookie/console; link vencido/usado/forjado/duas abas tratados; `#/nova-senha` direto sem marcador → `#/recuperar`. Token removido do hash antes de qualquer requisição, sem Referer. Pacote C2-13 (M-01 em 19 nomes, purga em 20 linhas sem apagar nenhuma, B-1…B-5) ok; migração idempotente e reversível; grants, IDOR com 3 usuários. Varredura de texto nas telas e estados × 4 larguras × 2 temas sem null/undefined/{n}/{mm}/inglês/códigos crus. Regressão 1.0/1.1/1.3/1.4/1.5/assinar/verificar sem diferença além da esperada.

## Achados
| ID | Sev. | O que |
| --- | --- | --- |
| A12-M1 | Médio | Fixação de sessão por link de recuperação com tokens do atacante: tela de nova senha não mostra a conta; mostrar e-mail e avisar quando o usuário da sessão mudar |
| A12-M2 | Médio | M-01 por lista de proibição: passam U+3164, U+2800, U+2061, U+034F, controles C0, NBSP+espaço+NBSP, ". .", "1 2". Trocar por lista de permissão (≥ 2 palavras, cada uma com ≥ 1 letra) |
| V-01 | Médio | "Voltar ao Entrar" na Nova senha chama `signOut()` global (derruba todos os aparelhos só por desistir): usar `scope:'local'` |
| V-02 | Médio (UX) | Centramento vertical do `.sg-single` ≥ 1280 desloca logo e cartão a cada mudança de estado e enquanto se digita: alinhar ao topo |
| V-03 / 1.2-A | Médio (UX) | Link de cadastro vencido cai em "Link inválido" sem reenvio de confirmação: oferecer os dois caminhos |
| A12-M3 | Médio (infra, Yuri) | Bomba de e-mail e oráculo dependem do Auth real: limites no painel, SMTP próprio (pago) ou captcha |
| V-04..V-08, A12-B* | Baixo | Campo de senha com ~106 px em 320 (botão com texto); aviso de segurança em toast verde de sucesso; foco no body em 429/rede; texto "3 links… 60 min" com 1 pedido e rede consumindo vaga; `menu-name` quebra no meio da palavra; purga deixa `queued` 15 min–1 dia sem `code`; invisíveis literais na migração; `signOut others` engole 401/403/404 |
| T-SHELL | Investigar | `t-shell` AC21 ("56 capturas sem corte") falha igual no 193b0bb segundo o verificador, enquanto o desenvolvedor reportou n de n: intermitente ou ambiente; investigar |

## Não testado
Supabase/GoTrue reais (mensagem de erro real, `signOut others` real, recover para conta não confirmada) · e-mails reais e modelo PT-BR · `redirect_to` na lista do Auth (P1-12) · política de senha e senha vazada do servidor · limites reais de e-mail · pg_cron real e worker do outbox · leitor de tela, Safari, Firefox, teclado virtual, bfcache, zoom real · locale de produção do Postgres.
