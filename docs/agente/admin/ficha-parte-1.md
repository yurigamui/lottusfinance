# Ficha da Parte: Admin / 1 Navegação e organização
23/11/2026 · fonte: proposta do designer (leitura de código, sem navegador)

## Objetivo
Cada tela mostra só o que decide a ação; o resto fica em abas ou "Ver mais". Só front: nenhum RPC nem migração novos.

## Papéis
Analista, aprovador e administrador veem o mesmo menu, com itens `admin:true` filtrados como hoje. Representante de fundo (superfície Partners) não vê nada novo.

## Seções, em ordem de construção
| # | Seção | Saída verificável |
| --- | --- | --- |
| 1 | Base visual `page`/`list` (cabeçalho com 1 ação principal e "Mais ações", cartão de lista no celular, paginação, "Ver mais", vazio, esqueleto) | componentes em styles.css/ui.js; nenhuma tela mudou |
| 2 | Menu e roteador com `ALIAS`: 5 grupos, "Em breve" (Clientes, Planos, Cobrança), gaveta no celular | todos os ids antigos abrem a tela certa; item pai ativo |
| 3 | Início "Para fazer hoje" | filas com contagem > 0, ação "Começar pela fila mais antiga" |
| 4 | Listas com busca e 25 por página: Identidade, Documentos, Crédito, Cedentes, Sacados | mesmo dado, cartões no celular |
| 5 | Abas em Análises e Operações (Quitações e Agendamentos passam a ser alcançáveis) | |
| 6 | Ficha da empresa em abas (Resumo, Pessoas, Documentos e contas, Operações, Histórico) | casca do Cliente 360 |
| 7 | Fundo: faixa "Pronto para operar" recolhe; ações destrutivas só em "Mais" | |
| 8 | Taxa (máx. 4 KPIs, aba Indicações) e Configurações em abas | |
| 9 | Análise de crédito: resumo e decisão no topo, o resto em abas | |
| 10 | Fechamento da parte: 9 larguras, regressão, Partners reverificado | |

## Regras
RN1. Todo id de rota antigo continua abrindo a mesma tela (links e favoritos).
RN2. No máximo 1 botão principal por página; ação destrutiva só em "Mais ações", com confirmação.
RN3. No máximo 4 KPIs por tela, cada um com "atualizado em".
RN4. Lista com mais de 25 linhas: busca e paginação (no cliente; ganho de desempenho só se medido).
RN5. Itens "Em breve" não navegam e não prometem data.
RN6. Sem estilo inline novo nem CDN; classes no styles.css.

## Riscos
`styles.css` pode ser copiado no Partners: reverificar. Contagens do menu não podem duplicar ao agrupar. `cobranca` já é aba de fundo (partners.js:135): a rota nova da Parte 4 não pode colidir.

## Decisões técnicas tomadas (Maestro)
Indicações vira aba de Taxa (id preservado); Plataformas (API) fica no menu; limite de 12 conta só itens ativos. Reversíveis. **Pendente do Yuri (negócio):** quais 3 fases de cliente ficam como KPI em Taxa (seção 8).
