# Verificação: Sign / 1.0 Shell da área logada e correções da 1.1 · ciclo 1 · 26/11/2026
[VERIFICADOR] + [AUDITOR] · Ambiente local (Supabase falso, CSP real do `_headers`), sem banco nem produção · Versão: f5ec11c

## Veredito: Aprovada com ressalvas (0 Bloqueante, 0 Alto; Médios: M-1, M-2, A10-MA, A10-MB; vários Baixos)

## Resultado por bloco
| # | Bloco | Resultado |
| --- | --- | --- |
| 1 | Funcional | Passa (testes próprios do verificador); M-1 e B-1 |
| 2 | Vínculos e navegação | Passa: 8 rotas privadas com F5, saída e Voltar |
| 3 | Estados e bordas | Passa: `sign_me` caído, link vencido, hash em hashchange, duas abas |
| 4 | Dados | Não se aplica (sem RPC, tabela ou migração novas) |
| 5 | Segurança | Passa no front (0 innerHTML/style=/script inline, CSP intacta, XSS negado); M médios do auditor |
| 6 | Design e UX | Passa; shell fiel ao Wealth |
| 7 | Responsivo | Passa em 10 larguras × 8 rotas; M-2 latente (sidenav com mais de 5 itens em ≤420 px) |
| 8 | Acessibilidade | Passa: skip link, foco, modal, contrastes ≥ 4,5 no claro |
| 9 | Desempenho | T-09: 1594 ms sem compressão, 819 ms com gzip (meta 1 s só vale com compressão); JS 18,6 kB gzip |
| 10 | Conteúdo | `[preencher]` em `termsVersion`/`privacyVersion` (J-02, já conhecido) |
| 11 | Regressão | Passa: Entrar idêntica ao c038d58 em 25/30 capturas (resto ≤ 4/765 de ruído); `assinar.html`/`verificar.html` 15/15 idênticas |

## Achados que viram o "ciclo 2 da 1.0" (corrigir antes do G5 da Parte 1)
| ID | Sev. | O que |
| --- | --- | --- |
| A10-MA | Médio | Shell mostra nome/e-mail da sessão anterior após troca de usuário: remontar o shell quando `session.user.id` mudar |
| A10-MB | Médio | bfcache sem proteção: `pageshow` com `persisted` rechecando a sessão |
| M-1 | Médio | Sessão encerrada em outra aba ou token vencido não mostra o aviso "Sua sessão terminou…": chamar `setFlash('sessao')` |
| M-2 | Médio (latente) | `.sidenav` em ≤ 420 px com mais de 5 itens faz a página rolar na horizontal: `overflow-x:auto` e `max-width:100%` |
| B-1 | Baixo | Dois alertas contraditórios após reenvio ok + 429 no link vencido |
| B-2 | Baixo | Toasts longos cobrem "Sair" em 320 px |
| B-3 | Baixo | Topbar acompanha 1920/2560 enquanto o conteúdo é centralizado a 1200 px (decisão de design) |
| A10-B1/B2/B4 | Baixo | `pageHead` aceitar só `#/...`; hash sem `#/` e fora do Auth leva a `#/entrar`; `construcao.js` com replace |

## Não testado
Supabase/Auth reais · compressão real e fontes do Google em 4G · leitor de tela, Safari, Firefox, teclado virtual real, zoom real · CLS e INP por conta própria.
