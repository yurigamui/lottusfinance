# MAPA DE VINCULOS: Lottus Wealth

Versão inicial de 23/11/2026. A parte 1 (dados) vem do levantamento de 19/11; a parte 2 (navegação) está vazia de propósito: ela é preenchida pela auditoria B0 a partir do código e confirmada no navegador, sem suposição.

## 1. Fontes únicas de dados

| Dado | Fonte única | Quem duplica hoje |
| --- | --- | --- |
| Pessoa (nome, CPF, telefone, e-mail) | `public.profiles` (id = auth.uid) | `w_profiles`, `funder_members`, `sign_contacts`, `sign_identity`, `fund_collection_signers`, `one_members` |
| Empresa (CNPJ, razão, fantasia, cidade e UF) | `public.companies` | `one_orgs`, `funders`, `funder_parties`, `api_partners`, `customers`, `debtors`, `one_customers` |
| Bancos (código, ISPB, nome) | `w_banks` | `bank_accounts`, `fin_accounts`, `funder_bank_accounts`, `funders` (texto livre) |
| Custodiantes (DTVM, corretora, CNPJ) | `w_custodians` | `funders.custodian_name`, `funders.administrator_*` (texto livre) |
| Endereço de cobrança | `w_billing_profiles` | `one_customers`, `one_orgs`, `funders`, `funder_parties`, `companies` (só cidade e UF) |

## 2. Navegação entre seções (B0 real, 23/11/2026)

Levantado do código (`apps/wealth/js`) e conferido no navegador com o ambiente local (`scripts/wealth-local`). **Saídas comuns a toda tela logada:** menu lateral (Minhas carteiras; Patrimônio: Visão geral, Bens e dívidas; Investimentos: Visão geral, Posição, Transações, Ativos personalizados; Gastos: Visão geral, Transações, Cadastros e regras; Carteira: Relatórios, Acessos, Configurações só para gestor; Conta: Conta e plano, White-label), seletor de carteira no topo e menu do avatar (Conta e plano, Sair). Rota desconhecida leva a Minhas carteiras (ou a Entrar sem sessão).

| Seção de origem | Elemento | Destino | Existe volta? | Verificado em |
| --- | --- | --- | --- | --- |
| 1. Entrar | Entrar (sucesso) | tela pedida antes do login, senão Minhas carteiras; sem cadastro completo, Finalizar | sim | 23/11 navegador |
| 1. Entrar | Esqueci a senha · Criar conta grátis | Recuperar · Criar conta | sim (links Voltar/Entrar) | 23/11 navegador |
| 2. Criar conta | Criar conta (sucesso) | Finalizar cadastro (ou "Confirme seu e-mail") | sim (Voltar para entrar) | 23/11 navegador |
| Convite (link do e-mail) | token válido / inválido | Criar conta com e-mail do convite / "Convite indisponível" → Entrar | sim | 23/11 navegador (inválido) |
| Recuperar senha · Nova senha | Enviar link · Salvar | mensagem na tela · Minhas carteiras | sim | 23/11 (recuperar); nova senha só por código |
| 3. Finalizar cadastro | Continuar · Sair | tela pedida ou Minhas carteiras · Entrar | sim | 23/11 navegador |
| 4. Minhas carteiras | cartão da carteira · Nova carteira · convite Aceitar/Recusar · grupo | Patrimônio da carteira · Nova carteira · Patrimônio da carteira aceita · Grupo | sim (menu) | 23/11 navegador |
| 5. Nova carteira | Criar (sucesso) · Informar dados de cobrança · ← Minhas carteiras | Patrimônio · modal de cobrança · Minhas carteiras | sim | 23/11 navegador |
| Grupo de carteiras | carteira da tabela · ← Minhas carteiras · Conhecer o Fund | Patrimônio da carteira · Minhas carteiras · Conta | sim | 23/11 navegador |
| 6. Patrimônio | Bens e dívidas · Nova transação · período | Bens · Transações (abre o modal) · mesma tela | sim (menu) | 23/11 navegador |
| 21. Bens e dívidas | Bem · Dívida · editar · excluir | modais na mesma tela | sim (menu) | 23/11 navegador |
| Investimentos · Visão geral | Posição · ativo · Nova transação · Importar arquivo | Posição · Detalhe do ativo · Transações · assistente | sim (menu) | 23/11 navegador |
| 7. Posição | ativo · Nova transação · Importar arquivo | Detalhe do ativo · modal · assistente | sim | 23/11 navegador |
| 8. Transações | ativo · filtros · paginação · editar/excluir | Detalhe do ativo · mesma tela | sim | 23/11 navegador |
| 10. Ativos personalizados | ativo · Novo ativo · Atualizar valor | Detalhe do ativo · modais | sim | 23/11 navegador |
| 11. Detalhe do ativo | ← Posição | Posição | sim | 23/11 navegador |
| 9. Conexões (importar arquivo) | assistente "Importar arquivo" em Visão geral, Posição e Transações (não há rota própria `…/conexoes`, ao contrário do README) | assistente → Concluir → mesma tela | sim | 23/11 navegador |
| 12. Gastos · Visão geral | Classificar agora · Importar extrato · contas | Gastos › Transações · assistente · modais de conta | sim | 23/11 navegador |
| 14. Importar extrato | Concluir | tela de origem atualizada (não há rota `…/gastos/importar`) | sim | 23/11 navegador |
| 13. Gastos · Transações | editar classificação · filtros · paginação | modal · mesma tela | sim | 23/11 navegador |
| 15. Cadastros e regras | Novo · Nova regra · Reaplicar regras | modais · mesma tela | sim | 23/11 navegador |
| 16. Relatórios | Planilha (CSV) · Imprimir/PDF | download · impressão do navegador | sim | 23/11 (CSV); PDF não testado |
| 17. Acessos | Convidar · alçada · Remover · Sair da carteira | modal · mesma tela · Minhas carteiras | sim | 23/11 navegador |
| 18. Configurações | Salvar · Ver plano e faturas · Arquivar | mesma tela · Conta · Minhas carteiras | sim | 23/11 navegador |
| 19. Conta e plano | Criar a 2ª carteira · Assinar o Fund · dados de cobrança · Pagar fatura · 2FA · senha | Nova carteira · modais | sim (menu) | 23/11 navegador (fatura sem dados reais) |
| 20. White-label | sem Fund: Falar com a Lottus (e-mail) · com Fund: grupo · Nova chave · Revogar | e-mail · Grupo · modais | sim | 23/11 navegador |

Nenhuma seção ficou sem saída. Rotas do README que **não existem** no roteador: `…/conexoes` e `…/gastos/importar` (funcionam como assistentes dentro das telas); README a corrigir (W-034).
