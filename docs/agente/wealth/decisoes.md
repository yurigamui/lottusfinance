# DECISOES: Lottus Wealth

Registro de decisões já tomadas, extraído dos documentos do Projeto (decisões de 19/11/2026, salvo indicação). Nova decisão entra no topo: data, decisão, motivo, quem decidiu, alternativas descartadas.

| Data | Decisão | Motivo | Quem decidiu |
| --- | --- | --- | --- |
| 2026-11-23 | Validar referências de `w_cadastros` por gatilho, não reescrevendo `w_spend_update`/`w_rule_save` | Corrige todo caminho de escrita com mudança mínima e testável sem o código das RPCs no repositório | Time (arquiteto) |
| 2026-11-23 | Validar no UPDATE só a coluna que mudou | Dado antigo inconsistente não pode travar exclusão de cadastro nem edição de outra coluna (achado A1 do verificador) | Time (verificador) |
| 2026-11-23 | Não proteger `w_audit` com `_guard_delete` agora | Bloquearia a exclusão em cascata da carteira, cuja política (LGPD) ainda não foi decidida | Time; decisão final do Yuri |
| 2026-11-23 | Testar migrações em Postgres local com esquema mínimo, já que o branch do Supabase foi recusado | Evidência real de Postgres sem tocar produção; o branch continua sendo o teste definitivo | Time |
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
