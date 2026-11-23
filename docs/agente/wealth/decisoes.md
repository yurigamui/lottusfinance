# DECISOES: Lottus Wealth

Registro de decisões já tomadas, extraído dos documentos do Projeto (decisões de 19/11/2026, salvo indicação). Nova decisão entra no topo: data, decisão, motivo, quem decidiu, alternativas descartadas.

| Data | Decisão | Motivo | Quem decidiu |
| --- | --- | --- | --- |
| 2026-11-23 | Testar o front do Wealth contra as funções REAIS num Postgres local com um Supabase falso (`scripts/wealth-local`), em vez de esperar o branch | O branch foi recusado; o ambiente local pegou 2 defeitos que testes só de banco não pegariam (gatilho adiado rodando como authenticated; filtro com catálogo global) | Time |
| 2026-11-23 | Não versionar o esquema exportado da produção no repositório (é público); o README do ambiente local explica como exportar | Expõe a lógica interna sem necessidade | Time |
| 2026-11-23 | Venda maior que a posição é recusada (gatilho adiado `position_negative`), em vez de só avisar | Posição negativa corrompe patrimônio, pesos e rentabilidade; nenhuma posição negativa existe hoje em produção | Time (contestável: Yuri) |
| 2026-11-23 | Verificação do Wealth por parte (várias seções de uma vez) com o mesmo checklist, em vez de 21 ciclos separados | Volume de seções e telas que compartilham componentes; cada micro-especificação continua listada no relatório | Time |
| 2026-11-23 | Calendário de data abre por clique, não ao focar; digitar fecha o calendário e substitui a data | O calendário cobria o botão Salvar e trocava a data sem salvar | Time |
| 2026-11-23 | README do Wealth descreve a cobrança como está no código (valor fixo) e aponta a divergência com a decisão de 19/11 | Documentação deve refletir o sistema; preço continua com o Yuri (W-031) | Time |
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
| 2026-11-23 | v2: aba "Carteira" vira **Configurações** (nome do portfólio, benchmark, visão padrão, marca, arquivar, excluir); Relatórios e Acessos vão para o menu Patrimônio e para os botões onde ficava "Bens e dívidas" | Pedido do Yuri; resposta "No lugar do botão de Bens e Dívidas" | Yuri |
| 2026-11-23 | v2: **Bens e dívidas saem**; bens viram ativos personalizados (tipo Outro, valorização manual); dívidas deixam de entrar no patrimônio. Tabela `w_other` mantida (0 linhas em produção em 23/11) e RPCs dela sem permissão | Pedido do Yuri; nada apagado | Yuri / Maestro |
| 2026-11-23 | v2: marca é do **grupo**; em Configurações, carteira sem grupo é colocada num grupo (novo ou existente) antes de definir a marca; logo substitui as iniciais para todos os membros; com mais de um grupo com marca, vale o grupo mais antigo | Pedido do Yuri; regra de desempate escolhida pelo Maestro (contestável) | Maestro |
| 2026-11-23 | v2: **Excluir = apagar de vez**, só o titular, digitando o nome; faturas ficam; registro "carteira excluída" fora da carteira | Resposta do Yuri "Apagar de vez" | Yuri |
| 2026-11-23 | v2: **Pro sem exigir a 2ª carteira**: assinatura explícita (`w_plan_change`), plano ativo na hora; Grátis = 1 carteira; fatura para todo Pro/Fund; inadimplência cai na regra de 10 dias já existente. Fund também passa a ser contratado na tela (sem "Falar com a Lottus") | Pedido do Yuri; ativação imediata para não haver beco sem saída enquanto o provedor confirma | Maestro (contestável) |
| 2026-11-23 | v2: pagamento **Pix Automático pela Trio**; **cartão e boleto pelo Asaas** (cartão digitado na página do Asaas; guardamos só bandeira e 4 dígitos). Provedores ligados só com `BILLING_LIVE=1` | Resposta do Yuri "Trio (Pix) + outro p/ cartão"; Asaas escolhido pelo Maestro por ter cartão recorrente e documentação pública | Yuri / Maestro (contestável) |
| 2026-11-23 | v2: renda fixa **a mercado por cálculo** (taxa do Tesouro de prazo parecido hoje + spread da emissão; % do CDI = curva) e **ANBIMA atrás de chave desligada** até confirmar a licença | Resposta do Yuri "ANBIMA + cálculo"; licença dos dados não confirmada | Yuri / Maestro |
| 2026-11-23 | v2: cripto pela API pública do Mercado Bitcoin (sem chave), par SÍMBOLO-BRL | Fonte gratuita em reais | Maestro (contestável) |
| 2026-11-23 | v2: benchmark mostrado como "os mesmos aportes rendendo o índice" (não é rentabilidade ponderada no tempo); padrão CDI | Simples e comparável; TWR fica para depois | Maestro |
| 2026-11-23 | v2: API pública só leitura, chave restrita a carteiras e com validade opcional; uma RPC (`w_api_call`) só para `service_role` reaproveita as RPCs da tela com as mesmas regras de acesso | Organização e segurança | Maestro |
| 2026-11-23 | v2: troca de senha passa a pedir a senha atual (resolve W-041); e-mail de acesso editável com confirmação pelo Supabase; CPF não editável | Segurança | Maestro |
