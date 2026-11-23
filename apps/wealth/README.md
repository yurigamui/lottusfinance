# Lottus Wealth

Visualização e organização financeira: **Gastos** (extratos bancários) + **Investimentos** → **Patrimônio**, em carteiras que podem ser compartilhadas.
Mesma arquitetura dos outros apps da Lottus: HTML/CSS/JS puro (sem build), Supabase JS, a regra toda em funções no banco (`w_*`), sem scripts inline (CSP).

## O que tem

| Tela | Rota | Quem acessa |
|---|---|---|
| Entrar, criar conta, recuperar senha, finalizar cadastro, convite | `#/entrar` · `#/criar-conta` · `#/recuperar` · `#/finalizar` · `#/convite/:token` | público |
| Minhas carteiras (convites + carteiras) · Nova carteira | `#/carteiras` · `#/carteiras/nova` | logado |
| Patrimônio · Bens e dívidas | `#/w/:id/patrimonio` · `…/bens` | Visualizador+ (edita: Editor+) |
| Posição · Transações · Ativos personalizados · Detalhe do ativo · Conexões (importar arquivo) | `…/posicao` · `…/transacoes` · `…/ativos` · `…/ativo/:aid` · `…/conexoes` | idem |
| Gastos: visão geral · transações · importar extrato · cadastros e regras | `…/gastos` · `…/gastos/transacoes` · `…/gastos/importar` · `…/gastos/cadastros` | idem |
| Relatórios (CSV e PDF) | `…/relatorios` | todas as alçadas |
| Acessos (+ registro de acessos) · Configurações | `…/acessos` · `…/config` | Gestor |
| Conta e plano (faturas, 2FA opcional) · White-label e integração (Fund) | `#/conta` · `#/white-label` | logado |

Alçadas: **Visualizador** (vê e extrai relatórios) · **Editor** (adiciona/edita/exclui) · **Gestor** (tudo + acessos). Qualquer gestor remove qualquer pessoa; remover o titular da cobrança passa a titularidade a quem removeu.

## Publicar

1. **Migration** (já está em `01 - App/lottus-app/supabase/migrations/20261119000000_wealth.sql`). **Teste primeiro num branch do Supabase**, depois rode no SQL Editor. Depende de `_sha256`, `_send_email`, `_email_html`, `_html_escape` e `app_settings.signature_email_from` (migration `20261014010000_email_delivery`). Cria as tabelas `w_*` (fechadas, RLS ligado e sem acesso direto), as funções `w_*` e agenda no `pg_cron` o fechamento mensal e a checagem de atraso.
2. **Funções de borda** (`supabase/functions/wealth-pu` e `wealth-api`):
   - `wealth-pu`: segredo `WEALTH_CRON_SECRET` (qualquer texto longo). Opcional: `B3_COTAHIST=1` (veja “Pendências”).
   - `wealth-api`: sem segredo extra (usa as chaves criadas no app, plano Fund).
   - Agende o P.U. diário (depois do fechamento, dias úteis), no SQL Editor:
     ```sql
     select cron.schedule('wealth-pu', '30 21 * * 1-5', $$
       select net.http_post(url := 'https://rowhslnnlzfbhmzbylbz.supabase.co/functions/v1/wealth-pu',
         headers := jsonb_build_object('x-cron-secret', '<WEALTH_CRON_SECRET>', 'Authorization', 'Bearer <anon key>'));
     $$);
     ```
     Rode uma vez à mão para carregar CDI/IPCA (histórico de 10 anos) e os primeiros preços.
3. **Auth** (Supabase → Authentication → URL Configuration): `Site URL` = `https://wealth.lottusfinance.com.br` e inclua o mesmo endereço em *Redirect URLs*. Os e-mails de confirmação e recuperação voltam para a raiz do site.
4. **Site**: publique esta pasta (`07 - Wealth`) no domínio `wealth.lottusfinance.com.br` como os demais apps (`_headers` já traz a CSP). Se o domínio for outro, ajuste `siteUrl`/`apiUrl` em `js/config.js` e o endereço do convite em `w_invite_create`.
5. **Plano Fund / forma de pagamento**: ficam sob controle do backend. Para liberar alguém: `select public.w_admin_set_plan('<user_id>', 'fund', true);` (service role). Para marcar fatura paga: `select public.w_admin_invoice_paid('<invoice_id>');`.

## Como funciona

- **Patrimônio líquido** = investimentos + saldos das contas (Gastos) + bens − dívidas. Bens e dívidas são manuais e **não** entram na base de cobrança.
- **Planos**: Grátis (1 carteira criada, convidados ilimitados, importação de arquivo incluída) · Pro (2+ carteiras criadas; ambas passam a ser cobradas) · Fund (white-label + API).
- **Cobrança Pro**: AuM = investimentos das carteiras sob titularidade do usuário no fechamento do mês anterior. Faixas marginais ao ano, divididas por 12: até R$ 10 mi 0,060% · 10–50 mi 0,040% · 50–200 mi 0,025% · 200 mi–1 bi 0,015% · acima de 1 bi sob contrato. Mínimo **R$ 200/mês**. Fatura vence 10 dias após o fechamento; **10 dias de carência** e, em atraso, todas as carteiras do titular ficam **somente para visualização** para todos (função `_w_need` bloqueia escrita).
- **P.U. diário** (`wealth-pu`): pré `PU = PU₀·(1+i)^(du/252)` · pós `PU = PU₀·∏(1+p·CDIₖ)` · IPCA+ com IPCA acumulado (mês corrente pro rata) × taxa real; Tesouro Transparente; CVM (informe diário, cotas); B3 COTAHIST (opcional). Pré-fixado “a mercado” é uma **estimativa** (usa a taxa do Tesouro Prefixado de vencimento mais próximo). Dias úteis consideram feriados nacionais.
- **Convites**: o CPF decide o destino — se já tem conta, vai para o e-mail cadastrado (o gestor vê só uma versão mascarada). O acesso só começa depois do aceite. Editor/Visualizador não veem e-mail/CPF dos outros.
- **Gastos**: OFX e CSV (colunas reconhecidas automaticamente, conferência antes de importar), duplicados ignorados por impressão digital, transferências entre contas da carteira detectadas (mesmo valor, sinal oposto, ±3 dias), regras de classificação por Contraparte / Centro de custo / Grupo (eixos independentes). Receita/despesa vem do sinal.
- **Duas etapas (2FA)** opcional para todos, em Conta e plano.

## Pendências e decisões para você

- **B3 Área do Investidor e Open Investment**: telas já mostram “Em breve · Pro”. B3 exige licença paga; Open Investment depende de participante. Hoje o caminho gratuito é arquivo/manual.
- **COTAHIST (B3)**: está desligado por padrão — confirme os termos de uso de redistribuição antes de ligar `B3_COTAHIST=1`.
- **Pagamento (cartão/boleto)**: não há gateway integrado. O botão “Cadastrar forma de pagamento” registra o pedido; a validação é feita pelo backend (`w_admin_set_plan`). Quando integrar com a cobrança da Lottus, trocar `w_payment_request`.
- **Crédito privado a mercado, proventos e desdobramentos**: sem fonte gratuita; ficam manuais/arquivo.
- **Rentabilidade** exibida é simples (resultado ÷ aportes líquidos); rentabilidade ponderada pelo tempo (cota) é uma evolução.
- **Importação de XLSX** (planilhas da B3): exporte como CSV por enquanto.
- **LGPD**: no Pro/Fund o escritório é controlador e a Lottus, operadora — falta o contrato de operador (DPA) e revisão jurídica dos termos/privacidade linkados no cadastro (hoje só há o aceite; as páginas ainda não existem).
- A migration e as funções **não foram executadas em produção** e não puderam ser testadas contra um Postgres real nesta sessão (a sintaxe foi validada e o front foi testado com o banco simulado). Rode primeiro num branch.

## Estrutura

```
index.html · styles.css · _headers · README.md
img/        logos e marcas (copiados do Partners)
js/config.js     endereço do Supabase e chave pública
js/core.js       cliente, formatação pt-BR, ícones, avisos, janelas, calendário de período
js/charts.js     linha/área, receitas × despesas, rosca (SVG, com tabela equivalente)
js/files.js      leitura de OFX/CSV    js/import.js   assistente de importação
js/app.js        roteador, estrutura, entrar/criar conta, carteiras, conta e plano, white-label
js/invest.js     patrimônio, bens e dívidas, posição, transações, ativos, conexões
js/gastos.js     gastos     js/gestao.js   relatórios, acessos, configurações
js/vendor/supabase.js
```
