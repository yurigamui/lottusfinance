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

## 2. Navegação entre seções (a preencher em B0)

| Seção de origem | Elemento | Destino | Existe volta? | Verificado em |
| --- | --- | --- | --- | --- |
| (a levantar) | | | | |

Regra: toda seção aparece como destino de ao menos um vínculo (exceto a porta de entrada) e como origem de ao menos um. Seção sem saída reprova a verificação.
