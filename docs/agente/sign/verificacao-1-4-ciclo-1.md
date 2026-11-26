# Verificação: Sign / 1.4 Perfil e conta (com pacote 1.0-C2) · ciclo 1 · 26/11/2026
[VERIFICADOR] + [AUDITOR] · Ambiente local (Postgres 54350, app com CSP real, Auth falso) · Versão: 16bd361

## Veredito: REPROVADA (1 Alto: V-01). Primeira reprovação desta seção.

## Resultado por bloco (resumo)
1 Funcional: aprovado exceto V-01 · 2 Vínculos: aprovado (V-03) · 3 Estados: falha parcial (V-01) · 4 Dados: aprovado · 5 Segurança: aprovado (IDOR com 7 usuários, anon negado, grants, XSS, concorrência de CPF) · 6 Design: reprovado (V-01) · 7 Responsivo: medições ok, visual reprovado por V-01 · 8 Acessibilidade: aprovado com ressalvas · 9 Desempenho: sign_me p95 2,0 ms, sign_profile_save p95 2,7 ms com 10 mil perfis; Seq Scan só em stubs de Partners/Wealth · 10 Conteúdo: `[preencher]` no cartão LGPD e mailto sem destinatário (pendência G7) · 11 Regressão: aprovado (Entrar idêntica; assinar/verificar ok). Banco B1–B14 e pacote 1.0-C2 (R1–R9) passaram. Nada aplicado em produção.

## Achados
| ID | Sev. | O que |
| --- | --- | --- |
| V-01 | **Alto** | `.banner .ico` sem regra de tamanho em `styles.css`: SVG ocupa o banner inteiro (260–520 px), texto vira uma letra por linha, em todas as larguras (faixa "Complete seu perfil", erro ao salvar, erro ao carregar, "Confirme seu e-mail"). Possivelmente pré-existente também no aviso do shell |
| V-02 | Médio | Guarda de descarte: "Continuar editando" deixa uma entrada de histórico duplicada; Voltar fica "morto" uma vez |
| V-04 | Médio (G7) | `[preencher]` LGPD/DPO visível; mailto sem destinatário (`supportEmail` vazio) |
| V-06 | Médio | Sem índice em `company_members`/`funder_members(user_id)` no local (stubs): conferir produção |
| V-03, V-05, V-07, V-08 | Baixo | `maxlength` trunca em silêncio; `a.org-link` 36 px; nome de 140 em 320 px deixa topo com ~210 px; contraste do tema escuro não conclusivo |
| A14-M1 | Médio | CPF com máscara em `profiles` (Partners/Wealth) não é detectado como duplicado: comparar normalizado |
| A14-B1/B3/B5 | Baixo | cpf_locked só com CPF preenchido; recusar bidi/zero-width no nome; `Cache-Control` também em `/assinar`, `/verificar`, `/index` |

## Não testado
Supabase/PostgREST/GoTrue reais · RLS e `profiles` de produção · leitor de tela, Safari, Firefox, teclado virtual real · bfcache real · zoom 200% real.
