# DECISOES: Lottus Wealth

Registro de decisões já tomadas, extraído dos documentos do Projeto (decisões de 19/11/2026, salvo indicação). Nova decisão entra no topo: data, decisão, motivo, quem decidiu, alternativas descartadas.

| Data | Decisão | Motivo | Quem decidiu |
| --- | --- | --- | --- |
| 2026-11-19 | O Wealth é sistema de visualização e organização financeira: não custodia, não movimenta dinheiro e não recomenda ativos | Limite de produto e de regulação | Yuri |
| 2026-11-19 | Login por CPF; estrutura Usuário, Carteira, Patrimônio, Gastos, Investimentos, Relatórios, Acessos; papéis Visualizador, Editor e Gestor | Definição de produto | Yuri |
| 2026-11-19 | Patrimônio líquido = investimentos + saldo das contas importadas em Gastos + bens − dívidas; bens e dívidas lançados à mão, fora da base de cobrança | Definição de produto | Yuri |
| 2026-11-19 | Plano Grátis: 1 carteira criada, carteiras convidadas ilimitadas, com importação de arquivo | Posicionamento frente à concorrência | Yuri |
| 2026-11-19 | Plano Pro: carteiras ilimitadas, cobrança por AuM em faixas marginais ao ano (até 10 mi 0,060%; 10 a 50 mi 0,040%; 50 a 200 mi 0,025%; 200 mi a 1 bi 0,015%; acima de 1 bi sob contrato), mínimo de R$ 200 por mês; conexão automática B3 e Open Finance no Pro. Valores são hipóteses a validar | Modelo de receita | Yuri (hipóteses) |
| 2026-11-19 | Plano Fund: white-label e integração por API, sob contrato | Modelo de receita | Yuri |
| 2026-11-19 | Todo Gestor pode remover qualquer usuário; quem remove o responsável pela cobrança passa a ser o responsável; sem pagamento (carência sugerida de 10 dias) a carteira fica só para visualização | Regra de acesso e cobrança | Yuri |
| 2026-11-19 | Convite por CPF: se o CPF já tem conta, o convite vai ao e-mail cadastrado, mostrado parcialmente ao convidador | Privacidade e entrega | Yuri |
| 2026-11-19 | 2FA opcional para todos, inclusive Gestores | Segurança com baixa fricção | Yuri |
| 2026-11-19 | Dados: começar sem custo (cadastro manual, importação de arquivo, índices públicos); depois API da Área do Investidor da B3 e Open Investment | Custo e dependência de terceiros | Yuri |
| 2026-11-19 | P.U. diário calculado por processo noturno com fontes gratuitas (BCB, Tesouro Transparente, CVM, B3) | Custo zero na v1 | Yuri |
| 2026-11-19 | LGPD: nos planos Pro e Fund o escritório é controlador e a Lottus é operador, com DPA no contrato | Enquadramento LGPD (revisão jurídica pendente) | Yuri |
| 2026-11-19 | Cadastro do Wealth completa `profiles` só onde estiver vazio e nunca sobrescreve dado de outra plataforma; `w_identity_prefill()` pré-preenche cadastro e cobrança | Fonte única de pessoa | Yuri |
