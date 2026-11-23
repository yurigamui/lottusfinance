# Relatório da plataforma: Lottus Partners · 23/11/2026

[MAESTRO] Modo Beta. Ambiente: front local no navegador com a CSP do `_headers` aplicada e rede externa bloqueada; banco de produção só em leitura.

## B0 (inventário real)
- 4 páginas (`index.html` portal, `assinar.html`, `verificar.html`, `investidor.html`) e 31 módulos JS. `receipts.js` não era carregado por nenhuma página: movido para `_revisar/` (P-03 em `depende-de-mim.md`).
- 192 RPCs chamadas pela tela: **todas existem e estão liberadas** a `authenticated`.

## Seções verificadas
| Seção | Veredito | Ciclos | Evidência |
| --- | --- | --- | --- |
| Entrar (estado sem conexão) e páginas públicas | Sem achados | — | `smoke.mjs` 4 páginas × 7 larguras sem corte nem erro de CSP; login com rede bloqueada mostra "Sem conexão com o servidor." e reabilita o botão |
| Transversal · texto do banco nunca vira HTML | **Aprovada com ressalvas** | 2 | 6 pontos corrigidos: subtítulos com nome de cedente/investidor/série (`docsmk.js`, `series.js`) e a confirmação do Pix irreversível com o nome do favorecido (`tesouraria.js`); `?v=` trocado; prova no navegador (`confirmTextInjects=false`); varredura de ~54 `confirmAction` e de `toast` sem outros pontos |

## Decisões
Ver `decisoes.md` (escape por chamada, não no componente; não unificar com o Sign agora).

## Pendências por severidade
- **Alta (não avaliado):** P-001 (lista pré-MVP fora do repo), P-002 (telas logadas).
- **Média:** P-003, P-005.
- **Baixa:** P-004.

## O que não foi testado
Todas as telas depois do login; Conta Trio e Pix reais; geração e assinatura de PDFs; desempenho com volume real.

## Depende do Yuri
Lista de bloqueios pré-MVP de 16/11 (P-001), usuário de fundo de teste no branch (D-01 e 2e), `signUrl` (2d), apontar a hospedagem para `apps/partners` (P-01, P-02).
