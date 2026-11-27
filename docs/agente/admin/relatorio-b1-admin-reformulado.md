# Auditoria Beta B0/B1: Admin reformulado · 25/11/2026
[VERIFICADOR] Somente leitura, Supabase simulado, CSP do `_headers` aplicada, 27 rotas × 10 larguras. Veredito: **Reprovada** (1 bloqueante, 4 altos). Scripts e capturas no scratchpad da sessão (não versionados). `check.mjs` 0 erro; `smoke.mjs` só cobre o login.

## Achados (ID da auditoria → pendência `A-1xx` aqui)
| ID | Sev. | Resumo |
| --- | --- | --- |
| A-01 | **Bloqueante** | Sem menu em ≤768 px: CSS espera `.drawer`/`.menu-open` que o `app.js` não gera; grupos `tabs:true` deixam o flyout vazio. |
| A-02 | Alto | "Gerar faturas do mês" usa UTC (`toISOString`): das 21h às 23h59 do último dia gera o mês seguinte; afeta datas padrão e KPIs do mês (faturamento.js, comercial.js, financeiro.js). |
| A-03 | Alto | Depois de salvar pelo botão Novo, `#/x/new` permanece e o modal reabre (fatura, conta a pagar, campanha, peça): risco de duplicar. |
| A-04 | Alto | `#/emails`, `#/mensageria`, `#/integracoes` abrem por link para analista/aprovador, com botões de escrita e `webhook_token` no DOM; sem checagem de `admin:true` na rota. RPCs não verificadas no servidor (SQL fora do repo). |
| A-05 | Alto | Preço combinado sem motivo, validade, alçada nem histórico; preço de plano sem validação nem confirmação; Partners sem preço personalizado; Isentar sem confirmação. |
| A-06..A-19 | Médio | corrida entre rotas; hash perdido ao expirar sessão; Novo abre nada para analista; tabelas sem cartões e listas sem paginação (300 itens = 60 mil px); alvos <44 px; avatar cortado a 320 px; modal não é folha inferior e usa 100vh; `#/operacoes/*` morto e rota inexistente cai no Início sem aviso; fatura sem validação (valor -50, data 2020, e-mail inválido); Reabrir sem confirmação; `#/planos/*` sem "Tentar de novo"; régua com texto fixo e dia 31 aceito; abas de Configurações quebram em 4 linhas a 320 px; busca global sem controle de ordem. |
| A-20..A-24 | Baixo | notificação sem `safeUrl`; Funil só com arrastar (sem toque); overflow-wrap ausente; menu só ícone no desktop; nomes inconsistentes (Preços e planos × Planos e cobrança). |

## Positivos verificados
Sem rolagem horizontal da página (10 larguras × 27 rotas); XSS escapado em 17 rotas e no modal de fatura; duplo clique sem duplicar em Receber/Cobrar/Gerar/Salvar; confirmação em cancelar, cobrar e gerar; estados vazio e erro nas telas principais.

## Telas mais carregadas e divisão proposta
Preços e planos (3 abas, 2 faixas de abas, 13 campos): tabela de preços só leitura + drawer de edição com confirmação de impacto; Início (8 KPIs): "Hoje" + 4 KPIs e o resto em "ver mais"; Assinaturas (60 mil px): paginar e abas; A receber (3 botões de cabeçalho, 2 por linha): 1 principal + "Mais ações" + `ui.list`; Clientes (2 faixas de abas, 7 colunas): 4 colunas + `ui.list`, ficha com aba "Plano e preço"; Produtos › Sign (30 botões primários): 1 ação por linha; Partners (7 colunas): 4 + "ver mais"; Resultado (13 colunas) / Campanhas (34 cartões): 3 meses + "ver mais", cartão compacto.

## Lacunas do pedido do Yuri
Trocar plano só existe para Sign; falta Partners, Wealth e a partir da ficha. Preço personalizado só `custom_price`/`custom_docs` no Sign. Cobrança: régua fixa de 5 e-mails; geração mensal é botão (sem automação); sem link de pagamento/Pix/boleto na fatura; sem ação em lote; sem vínculo com Wealth no front; ficha do cliente não liga às faturas filtradas, nem ao plano.

## Não testado
Banco real/RLS/grants, ficha do fundo e da empresa, fluxos de escrita do Financeiro, login/MFA reais, teclado virtual, contraste, leitor de tela, tempos de renderização.
