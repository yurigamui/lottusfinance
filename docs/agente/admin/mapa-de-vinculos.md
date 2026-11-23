# MAPA DE VÍNCULOS: Admin (esboço B0; completar na Parte 1 com o navegador)

| Seção de origem | Elemento | Destino | Existe volta? | Verificado em |
| --- | --- | --- | --- | --- |
| Menu | 18 itens em 6 grupos (`NAV_GROUPS` em `js/app.js`) | cada view `B.views.*` | menu fixo | não verificado |
| Taxa e repasse | link do cedente | `#/empresas/<id>` | sim (menu) | não verificado |
| Fundos (parceiros) | aba Condições → Conta Trio | cobrança do fundo | sim | não verificado |

## Vínculos entre plataformas (alvo da v2)
| Plataforma | Dado/ação que o Admin vai controlar | Já existe no banco? |
| --- | --- | --- |
| Partners | taxa de plataforma do fundo (`billing_settings`, `platform_fee_plans`, `platform_fees`, `funder_billing`) | sim, sem tela |
| Sign | planos (`sign_plans`), assinatura por conta | sim (`bo_sign_plan_save`), sem tela |
| Wealth | plano do usuário, faturas `w_invoices` | funções só service_role |
| Invest | nenhum plano conhecido | a confirmar (app fora do repo) |
| Cedentes (Business, pausado) | taxa e split | sim (Taxa e repasse) |
