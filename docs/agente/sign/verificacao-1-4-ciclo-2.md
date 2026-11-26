# Verificação: Sign / 1.4 Perfil e conta · ciclo 2 (reverificação) · 26/11/2026
[VERIFICADOR] · HEAD 6bb64fc · bancos isolados · nada aplicado em produção

## Veredito: REPROVADA (2ª reprovação seguida). Motivo: N-01 (Alto, aceito pelo Maestro).
V-01 corrigido (126 capturas, 14 estados, nenhum svg > 32 px, texto do banner ≥ 178 px em 320; capturas inspecionadas). V-02 em parte (V-09), V-03, V-05, V-07, A14-M1, A14-B1, A14-B3 (faixas pedidas), A14-B5 corrigidos. Banco e segurança: 57/59 asserções (2 erros do teste do verificador), idempotência, reversão, grants, IDOR com 3 atacantes e 3 vítimas, R5, M2, R3, T-02 ok. Regressão: 75/78 capturas idênticas (3 por cursor piscando); assinar/verificar idênticos.

## Achados novos
| ID | Sev. | O que |
| --- | --- | --- |
| N-01 | **Alto** | Texto literal "null" no cartão de Perfil de todo usuário com `profile_complete=true`: `perfil.js` ~l.175 `box.replaceChildren(..., me.profile_complete ? null : h(...), form)` (o `replaceChildren` nativo converte null em texto). Existia desde o ciclo 1; os testes do desenvolvedor não pegam |
| V-09 | Médio | Voltar duplo com modal "Descartar" aberto deixa URL em `#/documentos` com a tela em Perfil; depois de "Continuar editando" o item Documentos do menu não faz nada (link morto). Causa provável: `if (confirming) return;` em `router.js` sem reverter a URL |
| B-03 | Médio (1.0) | `img/logo-creme.png` e `img/mark-creme.png` não existem em `apps/sign/img` (usadas pelo CSS no tema escuro); marca em branco no escuro |
| B-01 | Baixo | Nome ainda aceita U+2060, U+FEFF, U+00AD, U+180E |
| B-02 | Baixo | Iniciais do avatar: contraste 4,25:1 (claro) e 3,86:1 (escuro) |
| B-04 | Baixo | "fale com o suporte ." com espaço antes do ponto e ponto órfão em 320 |
| B-05 | Baixo | "Reenviar e-mail"/"Tentar de novo" dentro do banner vermelho sem afordância de botão |
| V-04 / V-06 | Médio (G7) | `[preencher]` LGPD e mailto vazio; índices de `company_members`/`funder_members` em produção |

## Não testado
Supabase/PostgREST/GoTrue reais, RLS e `profiles` de produção · leitor de tela, Safari, Firefox, teclado virtual, zoom real · bfcache real · desempenho não refeito.
