# Wealth v2 · micro-especificação (pedido do Yuri em 23/11/2026)

Seções: S1 Navegação · S2 Configurações da carteira · S3 Patrimônio sem Bens e dívidas · S4 Visão A mercado × Na curva e benchmark · S5 Conta (Conta, Plano, Integração) · S6 API pública · S7 Preços automáticos (função de borda) · S8 Cobrança (função de borda).

## S1 · Navegação
1. Menu lateral da carteira: **Patrimônio** (Visão geral, Relatórios, Acessos), Investimentos, Gastos, **Configurações** (só gestor; botão único), **Conta** (botão único). Não existe mais o grupo "Carteira" nem o item "Bens e dívidas".
2. Menu do avatar: "Conta" e "Sair".
3. Endereços antigos continuam funcionando: `#/w/{id}/bens` leva ao Patrimônio; `#/white-label` leva a `#/conta?aba=integracao`.

## S2 · Configurações (`#/w/{id}/config`, só gestor)
1. Portfólio: **Nome do portfólio** (2 a 80 caracteres), **Benchmark** (CDI, IPCA ou Nenhum), **Visão padrão dos preços** (Na curva ou A mercado). Salvar atualiza para todas as pessoas da carteira.
2. **Marca**: pertence a um grupo de carteiras.
   - Plano Grátis/Pro: cartão explicando que é do Fund, com link para Conta > Plano.
   - Fund, carteira fora de grupo seu: formulário "Colocar no grupo" (grupo existente ou novo, nome padrão = nome da carteira). Depois aparece o formulário da marca (ativar, nome exibido, logo https, cores, estilo, tipografia, domínio) com pré-visualização.
   - Fund, carteira em grupo seu: aviso "A marca pertence ao grupo X e vale para todas as carteiras dele" + formulário da marca.
   - Carteira em grupo de outra pessoa: aviso de que a marca é definida por quem criou o grupo.
   - Com a marca ativada e logo https, o **logo substitui as iniciais** (ex.: "YG") no topo, no seletor de carteiras e nos cartões de Minhas carteiras, para todos os membros. Sem logo, as iniciais usam a cor principal da marca.
3. Cobrança: quem é o titular, link para Conta > Plano.
4. Só o titular: **Arquivar** e **Excluir de vez**. Excluir abre confirmação em que é preciso digitar o nome da carteira (maiúsculas/minúsculas e espaços nas pontas ignorados); o botão só habilita com o nome certo. Exclui a carteira e tudo dela (lançamentos, contas, ativos personalizados, acessos, histórico); faturas já emitidas ficam. Depois volta para Minhas carteiras.
5. Editor/visualizador que abrir o endereço vê "Só gestores acessam esta tela" com botão de volta.

## S3 · Patrimônio sem Bens e dívidas
1. Patrimônio líquido = investimentos + saldo das contas. Bens (imóveis, veículos) são lançados como ativos personalizados (tipo Outro, valorização manual); o texto da tela de Ativos personalizados diz isso.
2. No Patrimônio, no lugar do botão "Bens e dívidas": botões **Relatórios** e **Acessos**.
3. Relatórios: sem o relatório de bens e dívidas; CSV e impressão da posição sem linhas de bens/dívidas e com a visão usada.
4. Grupo de carteiras: indicadores e tabela sem bens e dívidas.

## S4 · A mercado × Na curva e benchmark
1. Patrimônio, Investimentos > Visão geral e Posição têm o seletor **Na curva | A mercado**; começa na visão padrão da carteira; trocar recarrega os valores e fica no endereço (`?v=`), preservado ao trocar o período.
2. Na curva: renda fixa pela taxa contratada. A mercado: renda fixa com preço a mercado quando existe; demais ativos pela última cotação. Frase explicando a visão abaixo do título; se nada tem preço a mercado, a frase diz isso.
3. Com benchmark CDI ou IPCA: indicador "Comparado ao {índice}" = valor dos investimentos − quanto os mesmos aportes valeriam rendendo o índice desde a data de cada um; linha pontilhada "Aportes rendendo {índice}" no gráfico de Investimentos × aportes, com legenda. Com "Nenhum", não aparece.

## S5 · Conta (`#/conta?aba=conta|plano|integracao`)
1. Abas Conta, Plano, Integração (links; aba inválida cai em Conta).
2. **Conta**: Dados pessoais editáveis: nome (3 a 120), celular (10 a 13 dígitos ou vazio), e-mail de acesso (troca pede confirmação no novo e-mail; aviso), CPF só leitura com explicação. Segurança: 2FA (ativar/desativar) e **trocar senha pedindo a senha atual** (erro ao lado do campo se errada; mínimo 8).
3. **Plano**: cartões Grátis/Pro/Fund. Não existe mais o selo "Em dia" (só aparece aviso quando há atraso). **Pro não exige a 2ª carteira**: "Assinar o Pro" abre o formulário de cobrança + forma de pagamento (**Pix Automático**, Cartão de crédito, Boleto) e ativa o plano na hora; depois mostra o link de autorização do provedor ou, sem link, o aviso de que a cobrança chega por e-mail. "Voltar ao Grátis" só com 1 carteira (senão o botão vem desabilitado com o motivo). Cobrança: dados, forma de pagamento (cartão: bandeira e 4 últimos dígitos), situação (Autorizado / Aguardando autorização / Boleto por e-mail), faturas com "Pagar".
4. Nova carteira no Grátis com 1 carteira: campo desabilitado, aviso e botão "Assinar o Pro".
5. **Integração**: sem Fund, explica e oferece "Assinar o Fund" (não existe mais "Falar com a Lottus") e mostra o que a API entrega. Com Fund: chaves de API (nome, carteiras: todas ou escolhidas, validade: sem prazo/30/90/365 dias), chave mostrada uma vez com Copiar, lista com carteiras, situação (Ativa, Vale até, Expirada, Revogada) e Revogar; documentação das rotas; lista de grupos com a marca.

## S6 · API pública (`supabase/functions/wealth-api`, RPC `w_api_call` só para service_role)
Rotas `GET /v1/carteiras`, `/v1/carteiras/{id}`, `/patrimonio`, `/posicoes`, `/evolucao?meses=`, `/transacoes?de=&ate=&pagina=`, `/gastos?…`, `?visao=curva|mercado`. Chave `Authorization: Bearer wk_…`. 401 chave inválida/expirada/revogada ou titular sem Fund em dia; 404 carteira fora da chave ou recurso inexistente; 400 parâmetro inválido. Só leitura.

## S7 · Preços automáticos (`supabase/functions/wealth-pu`)
Cripto pelo Mercado Bitcoin (par SÍMBOLO-BRL); renda fixa pré e IPCA+ a mercado = taxa do Tesouro de prazo parecido hoje + spread da emissão; % do CDI igual à curva; ANBIMA (debêntures, CRI, CRA) atrás de `ANBIMA_ENABLED=1`, desligada.

## S8 · Cobrança (`supabase/functions/wealth-billing`)
Pix Automático pela Trio; cartão (assinatura, cartão digitado na página do provedor) e boleto pelo Asaas; `BILLING_LIVE=1` liga os provedores; sem isso, modo manual. Webhooks autenticados por token; confirmação do cartão grava só bandeira e 4 dígitos.

## Fora desta entrega
Escrita pela API; limite de chamadas por minuto; proporcional no mês da assinatura; testes contra os provedores reais (sem credenciais).
