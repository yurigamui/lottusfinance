# PENDENCIAS: Lottus Wealth

Origem: documentos do Projeto (lottus-wealth e vinculos-wealth). Severidade "a classificar" significa que o Verificador define na auditoria. Dono padrão: Yuri, salvo indicação.

| ID | Descrição | Severidade | Dono | Prazo | Origem |
| --- | --- | --- | --- | --- | --- |
| W-001 | **Divergência encontrada em 23/11:** os documentos dizem que a migração do Wealth não foi aplicada, mas o histórico do projeto *Lottus Finance* mostra `wealth_1_tabelas_e_ajudantes` a `wealth_12_import_extrato_ocorrencias` aplicadas em 19/11 (27 tabelas `w_`, 1 perfil). Confirmar se foi intencional. Funções `wealth-pu` e `wealth-api` não estão no repositório | Alta | Yuri | imediato | inventário 23/11 |
| W-002 | Gateway de pagamento: hoje o plano é definido por `w_admin_set_plan` pelo backend | a classificar | Yuri | a definir | lottus-wealth |
| W-003 | B3 Área do Investidor e Open Investment aparecem como "Em breve" | a classificar | Yuri | a definir | lottus-wealth |
| W-004 | COTAHIST desligado até confirmar os termos de uso da B3 | a classificar | Yuri / jurídico | a definir | lottus-wealth |
| W-005 | Rentabilidade ponderada (cota) não implementada | a classificar | Agente | a definir | lottus-wealth |
| W-006 | Importação de XLSX não implementada | a classificar | Agente | a definir | lottus-wealth |
| W-007 | Páginas de termos de uso e privacidade ainda por criar | Alta | Yuri / jurídico | antes do lançamento | lottus-wealth |
| W-008 | DPA e revisão LGPD (guarda de dados, controlador e operador) | Alta | jurídico | antes do lançamento | lottus-wealth |
| W-009 | Acesso ao Open Finance sem ser instituição autorizada | a classificar | Yuri / jurídico | a definir | lottus-wealth |
| W-010 | Formato de exportação da B3 e termos das cotações | a classificar | Yuri | a definir | lottus-wealth |
| W-011 | Tratamento de proventos na v1 | a classificar | Yuri | a definir | lottus-wealth |
| W-012 | Validar faixas de AuM, mínimo de R$ 200 e carência de 10 dias | Média | Yuri | a definir | lottus-wealth |
| W-013 | Decidir se o Grátis tem 1 ou 3 carteiras | Média | Yuri | a definir | lottus-wealth |
| W-014 | Decidir Centro de Custo e Grupo como eixos independentes | Média | Yuri | a definir | lottus-wealth |
| W-015 | Confirmar 90 dias de guarda de relatórios e 12 meses para "Valor antigo" (sugestões) | Baixa | Yuri | a definir | lottus-wealth |
| W-016 | `public.legacy_gl_lines` sem RLS: confirmada em 23/11 (sem grant para anon/authenticated, então não exposta hoje). Correção pronta em `20261123121000_seguranca_rls_e_helpers_internos.sql` | Bloqueante | Yuri (aplicar) | antes do lançamento | vinculos-wealth |
| W-017 | Duplicidade de cadastros: tratar `profiles` como mestre de pessoa e `companies` como mestre de empresa; unicidade por CPF e CNPJ normalizado | Alta | Agente | a definir | vinculos-wealth |
| W-018 | Banco e custodiante em texto livre em várias tabelas: trocar por referência a `w_banks` e `w_custodians` | Média | Agente | a definir | vinculos-wealth |
| W-019 | Tabela única de endereços reutilizada por cobrança, contratos e assinatura | Média | Agente | a definir | vinculos-wealth |
| W-020 | Tabelas gêmeas (`crm_leads` e `lottus_crm_leads`, `bill_invoices` e `lottus_bill_invoices`, `fin_accounts` e `lottus_fin_accounts`, `mkt_*` e `lottus_mkt_*`): confirmar qual está em uso | Média | Agente (relato) e Yuri (OK) | a definir | vinculos-wealth |
| W-021 | LGPD: o Wealth não deve expor CPF a quem apenas visualiza; documentar a finalidade de cada uso do mesmo dado | Alta | Agente e jurídico | a definir | vinculos-wealth |
| W-022 | `w_spend_update` e `w_rule_save` aceitavam contraparte/centro/grupo de outra carteira (IDOR de referência). Correção: gatilhos em `20261123120000_wealth_integridade_e_indices.sql` (aprovada com ressalvas) | Alta (corrigida, não aplicada) | Yuri (aplicar) | antes do lançamento | auditoria 23/11 |
| W-023 | 16 chaves estrangeiras/`wallet_id` sem índice de apoio nas tabelas `w_`. Índices na mesma migração | Média (corrigida, não aplicada) | Yuri (aplicar) | antes do lançamento | auditoria 23/11 |
| W-024 | `w_invoices` e `w_payment_events` sem `_guard_delete`. Gatilhos na mesma migração | Média (corrigida, não aplicada) | Yuri (aplicar) | antes do lançamento | auditoria 23/11 |
| W-025 | `w_audit` sem `_guard_delete`: tem `ON DELETE CASCADE` da carteira; proteger depende da política de exclusão de carteira/conta (LGPD) | Média | Yuri / jurídico | a definir | auditoria 23/11 |
| W-026 | `w_bank_delete` confere "em uso" sem filtrar a carteira (só revela se um id de conta de outra carteira está em uso; id é uuid) | Baixa | Agente | com o front | auditoria 23/11 |
| W-027 | `_w_cadastro_lock` é INVOKER: se um dia houver escrita direta de `authenticated` em `w_cadastros` (hoje não há grant), a RLS esconderia usos de outras carteiras | Baixa | Agente | se mudar o modelo de acesso | verificação 23/11 (R3) |
| W-028 | Custodiante em texto livre em `w_invest_tx.custodian` (399 lançamentos); trocar por `custodian_id` → `w_custodians` (parte de W-018) | Média | Agente | com o front | auditoria 23/11 |
| W-029 | Pessoa duplicada: `w_profiles` guarda `name`, `cpf`, `phone`, que também existem em `profiles` (hoje 0 divergência). Mover para `profiles` exige mudar RPCs e front (parte de W-017) | Alta | Agente | bloqueada até o front chegar | auditoria 23/11 |
| W-030 | Projeto Supabase separado "Lottus Wealth" (criado em 19/11) com as mesmas tabelas `w_` vazias e sem migrações registradas: duplica o modelo e pode confundir deploys | Média | Yuri | a definir | inventário 23/11 |
| W-031 | Cobrança: o código cobra valor fixo por carteira (Pro R$ 79, Fund R$ 199, `_w_price`); a decisão de 19/11 fala em faixas de AuM com mínimo de R$ 200. Confirmar qual vale (preço é decisão do Yuri) | Alta | Yuri | antes do lançamento | auditoria do front 23/11 |
| W-032 | Aceite de "termos de uso e política de privacidade" no cadastro sem link para os textos (as páginas do Wealth não existem; ver W-007) | Alta | Yuri / jurídico | antes do lançamento | auditoria do front 23/11 |
| W-033 | Pagamento: "Pagar" mostra Pix/boleto só se a fatura tiver dados do provedor; sem gateway integrado (W-002). Não testado com fatura real | Média | Yuri | com o gateway | auditoria do front 23/11 |
| W-034 | README listava rotas `…/conexoes` e `…/gastos/importar`, que não existem (são assistentes). README corrigido em 23/11 | Baixa (corrigida) | Agente | — | B0 23/11 |
| W-035 | Componente de data compartilhado: o Partners tinha o mesmo defeito do calendário. Correção portada em 23/11 (`apps/partners/js/mask.js`, `?v=20261123a`) e testada no componente isolado; telas logadas do Partners não reverificadas (exigem login) | Média (corrigida) | Agente | com P-002 | auditoria do front 23/11 |
| W-036 | Imprimir/PDF dos relatórios e o gráfico de evolução não foram verificados visualmente em impressão | Baixa | Agente | com o front no ar | auditoria do front 23/11 |
| W-037 | Desconexão por inatividade (30 min) não testada (exige espera real) | Baixa | Agente | — | auditoria do front 23/11 |
| W-038 | `w_asset_search` busca nome com `ilike '%q%'` em ~35 mil ativos sem índice de trigramas: medir no branch; se passar de 300 ms, criar índice `pg_trgm` | Média | Agente | branch | auditoria do front 23/11 |
| W-039 | Grupos de carteiras: Conta e plano e Nova carteira anunciam Grupos no plano Pro, mas `w_group_save`/`_w_group_plan_ok` só liberam no Fund ("Disponível no plano Fund."). Decidir qual plano inclui Grupos e alinhar texto ou banco | Média | Yuri (plano) | antes do lançamento | verificação 23/11 (M5) |
| W-040 | Modal de dados de cobrança: erros de CPF/CEP aparecem só no aviso flutuante, não ao lado do campo | Baixa | Agente | próxima rodada | verificação 23/11 (B1) |
| W-041 | **Resolvida na v2 (pede a senha atual).** Troca de senha em Conta e plano não pede a senha atual nem a confirmação da nova: uma sessão aberta basta. Opções: pedir a senha atual e reautenticar antes de `updateUser`, ou ligar "Secure password change" no Supabase Auth | Média | Agente (front) e Yuri (configuração do Auth) | antes do lançamento | verificação 23/11 (X3) |
| W-042 | CSV: o "Peso" sai com muitas casas decimais e o "Tipo" das transações sai como código (compra/venda) | Baixa | Agente | próxima rodada | verificação 23/11 (X2) |
| W-043 | v2: adaptadores de pagamento (Trio Pix Automático, Asaas cartão/boleto) **não testados contra os provedores**; endereços e campos da Trio a preencher (documentação não pública) | Alta | Yuri (credenciais de sandbox e documentação da Trio) | antes de cobrar | v2 23/11 |
| W-044 | v2: ANBIMA desligada até confirmar a licença de uso dos dados de debêntures/CRI/CRA; endpoints a conferir com a documentação da ANBIMA Data | Média | Yuri (jurídico/contrato) | a definir | v2 23/11 |
| W-045 | v2: mês da assinatura é cobrado inteiro (sem proporcional) | Baixa | Yuri (regra de preço) | a definir | v2 23/11 |
| W-046 | v2: API sem limite de chamadas por minuto e sem escrita | Média | Agente | próxima rodada | v2 23/11 |
| W-047 | v2: `w_equity` com benchmark faz uma soma por transação por mês; medir com volume real no branch (1.000+ transações, 60 meses) | Média | Agente | no branch (D-01) | v2 23/11 |
| W-048 | v2: Grupos liberados no Pro e no Fund pelo `_w_group_plan_ok` atual; marca só no Fund (resolve W-039 na tela; confirmar) | Média | Yuri (plano) | antes do lançamento | v2 23/11 |
| W-049 | v2 R1: com duas etapas ativas, código errado na troca de senha deixa a sessão no nível 1 até sair (a senha atual é conferida antes do código). Usar a reautenticação do Supabase (nonce) no lugar de `signInWithPassword` | Média | Agente | próxima rodada | verificação v2 ciclo 2 |
| W-050 | v2 R2: `w_equity` com benchmark passa de 300 ms com 120 meses × 1.000 lançamentos (398 ms) ou 60 meses × 5.000 (670 ms); somar `tw` uma vez com janela | Média | Agente | próxima rodada | verificação v2 ciclo 2 |
| W-051 | v2 R3/R4/R5: abas do gráfico quebram em 2 linhas em 320 px; erro de CPF/CNPJ de cobrança só no aviso e CPF/CEP sem máscara no cartão; logo Lottus some do menu até 420 px | Baixa | Agente | próxima rodada | verificação v2 ciclo 2 |
| W-052 | v3 M6: Ativos personalizados sem paginação (106 linhas numa página com 100 ativos) | Média | Agente | próxima rodada | verificação v3 ciclo 1 |
| W-053 | v3 M7: `wealth-pu?action=pu_at` sem limite de chamadas por usuário nem cache (agora exige editor) | Média | Agente | antes de publicar a função | verificação v3 ciclo 1 |
| W-054 | v3 B7: `w_equity_range` 1ª chamada a frio 440 ms (mediana 177 ms); medir no branch com volume real | Baixa | Agente | no branch (D-01) | verificação v3 ciclo 1 |
| W-055 | v3: mês sem preço na fonte (ativo sem negócio no mês) fica como "buraco" e é baixado de novo a cada execução (limitado a 3–4 arquivos por execução) | Baixa | Agente | próxima rodada | revisão própria |
| W-056 | v3: textos do recibo e do e-mail de atraso para o jurídico | Média | Yuri (jurídico) | antes de cobrar | verificação v3 ciclo 1 |
| W-057 | v3 B5: visualizadora vê o formulário de Nova transação por `?new=1` (o servidor nega ao salvar) | Baixa | Agente | próxima rodada | verificação v3 (pré-existente) |
| W-058 | v3 C2-B2: ao trocar um ativo de manual para "pela curva", o cálculo pode sobrescrever valores informados à mão nas mesmas datas (sem aviso) | Baixa | Agente | próxima rodada | verificação v3 ciclo 2 |
| W-059 | v3 C2-B6: Gastos > Cadastros em 1280 px esconde botões de uma tabela de meia coluna atrás de rolagem lateral (fora do escopo da v3) | Baixa | Agente | próxima rodada | verificação v3 ciclo 2 |
| W-038 | **Resolvida na v3:** índice de trigramas (pg_trgm) sobre o nome sem acento; busca em 50 mil ativos ~10 ms | — | — | — | v3 ciclo 3 |
| W-060 | v3 C3-B2: "Desde o início" com 41 anos de histórico leva ~800 ms (passo mensal); a meta de 300 ms vale para 1 ano diário, que passou | Baixa | Agente | acompanhar no branch | verificação v3 ciclo 3 |
| W-061 | v3: linha clicável das faturas sem `tabindex`/`role` (o "Ver" continua acessível por teclado) | Baixa | Agente | próxima rodada | verificação v3 ciclo 3 |
