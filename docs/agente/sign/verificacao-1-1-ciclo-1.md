# Verificação: Sign / 1.1 Entrar e criar conta · ciclo 1 · 24/11/2026
[VERIFICADOR] + [AUDITOR] · Ambiente: Chromium (Playwright) contra Supabase falso local e Postgres local; sem Supabase, e-mail ou Auth reais · Versão: c038d58

## Veredito: Aprovada com ressalvas (0 Bloqueante, 0 Alto, 5 Médios, 8 Baixos somando os dois relatórios)

## Resultado por bloco
| # | Bloco | Resultado | Evidência |
| --- | --- | --- | --- |
| 1 | Funcional | OK | ~150 verificações independentes (AC1–AC12, 15, 17), duplo clique gera 1 chamada |
| 2 | Vínculos e navegação | OK com M-1, B-1 | todos os destinos levam a saída; F5 e link profundo com sessão expirada |
| 3 | Estados e bordas | OK | nome de 140 e e-mail de 254 caracteres, apóstrofo, duas abas |
| 4 | Dados e integridade | Não se aplica (sem tabela nova); corpo do signUp sem CPF/celular | auditor |
| 5 | Segurança | OK com M1, M2 | XSS, redirecionamento aberto, hash forjado, vazamento de senha, `anon` negado, alertas de produção lidos |
| 6 | Design e UX | OK | 1 ação principal; tema escuro inacessível ao usuário (B-4) |
| 7 | Responsivo | OK | 10 larguras × 2 temas × 6 estados; scrollWidth = innerWidth; alvos ≥ 44 px; zoom 200% |
| 8 | Acessibilidade | OK com B-3 | contraste mín. 4,9:1 (claro) e 5,7:1 (escuro); sem leitor de tela real |
| 9 | Desempenho | Parcial | JS ~30 kB (meta 60 kB); 4G simulado do desenvolvedor 1,7 s (meta 1 s não atingida, suspeita de módulos em cascata) |
| 10 | Conteúdo e conformidade | Ressalva M-2 | `[preencher]` visível e enviado em `terms_version` |
| 11 | Regressão | OK | `assinar.html` e `verificar.html` abrem; smoke do Sign passou |

## Achados
| ID | Sev. | Onde | O que acontece | Esperado |
| --- | --- | --- | --- | --- |
| M-1 | Médio | router.js | Voltar do navegador após login sempre cai em `#/documentos` | usar replace no redirecionamento pós-login |
| M-2 | Médio (J-02) | config.js, entrar.js | "(versão [preencher])" visível, Termos/Política sem link, `terms_version:"[preencher]"` enviado | preencher ou bloquear cadastro com aviso honesto; nada em produção assim |
| M-3 | Médio | entrar.js | Após reenviar no estado "link vencido", o botão e a contagem somem | botão permanece em contagem |
| M1 | Médio | produção | 6 auxiliares `_` executáveis por `anon` (confirmado) | migração nova |
| M2 | Médio | sign_me | cpf/phone de metadado editável | tratar na 1.3/1.4 |
| B-1/B1 | Baixo | app.js | hash do Auth só tratado no carregamento; "E-mail confirmado" com token inválido | tratar hashchange; texto neutro |
| B-3 | Baixo | botão Mostrar | sem `aria-pressed` | polimento |
| B-4 | Baixo | theme.js | tema escuro forçado a claro | registrar decisão |
| B2, B3, B4 | Baixo | ver pendencias.md | PKCE; limite de reenvio só no cliente; CSP | — |

## O que não foi testado
Supabase/Auth/SMTP reais (P1-12, P1-11) · Safari, Firefox, leitor de tela, teclado virtual, celular deitado, fonte ampliada · 4G simulado pelo verificador e salto de layout da fonte · links externos de Termos (sem URL) · IDOR entre dois usuários em `sign_me` (só leitura do código e negação a `anon`) · timing de resposta.

## Seções reverificadas (regressão)
`assinar.html`, `verificar.html` (abrem, smoke ok).
