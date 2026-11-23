# Wealth v3 · plano (pedido do Yuri em 23/11/2026)

## Diagnóstico no banco de produção (só leitura, 23/11)
- 399 transações numa carteira. **89 CDBs/LIGs importados** estão como ativo personalizado `rf_pos` **sem indexador, taxa nem data de emissão**: o robô não consegue valorizar (e ignora personalizados), então ficam parados no preço da última transação.
- **Bitcoin** está como personalizado: o robô não busca cotação de ativo personalizado.
- **Tesouro:** 58 títulos no catálogo, só 3 com P.U., e o último P.U. é de **2010**. A rotina regrava o histórico inteiro do arquivo do Tesouro a cada execução e estoura o tempo da função; os 3 títulos da carteira (Prefixado com Juros 2035, IPCA+ 2032, IPCA+ 2040) não têm nenhum P.U.
- **Fundos:** 33.917 fundos no catálogo, 25.163 com P.U., mas só a cota mais recente (17 a 19/11). Não há histórico: escolher um fundo com data antiga não tem P.U. daquele dia. Desde 2024 a CVM publica uma linha por subclasse (`ID_SUBCLASSE`) no mesmo CNPJ; a rotina pega qualquer uma, e a cota pode sair errada.
- B3 (ações, FII, BDR, ETF): só o último pregão; sem histórico desde a primeira compra.

## Seções
| # | Pedido | O que será feito |
| --- | --- | --- |
| 1 | P.U. no dia do aporte | Na nova transação, ao escolher ativo e data, mostrar "P.U. em dd/mm/aaaa: X (fonte)" com botão "Usar este P.U."; se o banco não tiver o dia, a função de borda busca na fonte (B3 do dia, CVM do mês, Tesouro, curva) e grava |
| 2 | P.U. dos fundos | Cota por subclasse correta (linha sem subclasse ou a principal, sempre a mesma); histórico desde a primeira aplicação (arquivos mensais e anuais da CVM); idem para Tesouro (incremental, sem estourar tempo) e B3 (arquivo mensal) |
| 3 | Seleção por digitação | Todo campo de escolha de DTVM/custodiante, ativo/fundo, contraparte, centro de custo, grupo e banco só mostra nomes depois de 2 letras digitadas |
| 4 | Sistema de cobrança | Rotinas agendadas (fechar o mês, gerar cobrança, lembrete, atraso), página da fatura com itens e recibo, e-mails (fatura aberta, lembrete 3 dias antes, paga, em atraso) pela fila de e-mails existente, nova tentativa no cartão |
| 5 | Ativos personalizados | Editar todos os dados (tipo, indexador, taxa, emissão, vencimento, emissor, código); edição em lote (ex.: 89 CDBs "% do CDI"); forma de valorização visível (curva, cotação automática, manual) e alerta "sem dados para valorizar"; histórico de P.U. manual com editar/excluir; tipos Imóvel e Veículo |
| 6 | Calendário na página inicial | Período por calendário (de/até) no Patrimônio e em Investimentos, com visão diária |
| 7 | Saldo dia a dia | Série diária do patrimônio e de cada aplicação pelos P.U. diários (curva diária da renda fixa, cotações diárias), alimentando o gráfico |
