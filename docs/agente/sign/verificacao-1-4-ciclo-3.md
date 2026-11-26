# Verificação: Sign / 1.4 Perfil e conta · ciclo 3 · 26/11/2026
[VERIFICADOR] (contexto limpo) · commit ab71033 · bancos isolados · nada aplicado em produção

## Veredito: APROVADA COM RESSALVAS (0 Bloqueante, 0 Alto)
N-01, V-09, B-01 a B-05 corrigidos com evidência própria; V-01 a V-08 e A14-* seguem corrigidos. Varredura própria de 41 telas/estados em 320, 768, 1280 e 2560 (texto, valores, title, aria-label, alt, placeholder, href): nenhum `null`/`undefined`/`[object Object]`/`NaN` alcançável. Capturas abertas e lidas nos dois temas. Banco: 62/63 asserções (a falha era suposição errada do teste), idempotência, reversão, grants, IDOR com 3 atacantes e 3 vítimas, R5, M2, R3, T-02, CPF mascarado, bidi/zero-width. Regressão 1.0/1.1 e assinar/verificar: 96 capturas; diferenças só esperadas (botão Reenviar com borda; logo 1 px por alvo de 44 px) ou anti-aliasing (≤ 4/765).

## Achados
| ID | Sev. | O que |
| --- | --- | --- |
| P-01 | Médio (1.1) | Em `#/criar`, "Termos de uso" e "Política de Privacidade" viram link `target=_blank` para a própria página do Sign: `safeUrl('')` devolve a URL atual; `legalLink` deve mostrar só texto quando a URL está vazia |
| P-02 | Baixo | Nome legado só com U+200B deixa avatar e `.org-name` em branco (perfis vindos de Partners/Wealth) |
| P-03 | Baixo | Checkbox de aceite com 24×24 px |
| P-04 | Baixo | Modal "Descartar" em 320 empilha botões sem largura total |
| G7 | Pendência jurídica | `[preencher]` no cartão LGPD e em "(versão [preencher])"; mailto sem destinatário (E-01); índices em produção (V-04, V-06) |

## Não testado
Supabase/PostgREST/GoTrue reais, RLS e `profiles` de produção (`unique(cpf)`, T-08) · leitor de tela, Safari, Firefox, teclado virtual, zoom real · bfcache real · desempenho e LCP em 4G não medidos pelo verificador · Auth real (hash de senha, e-mail).
