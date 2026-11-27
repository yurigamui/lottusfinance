# Ficha da Plataforma: Lottus Admin v2
23/11/2026 · v0.1 (aguarda G1) · Modo Beta

## Problema e público
A equipe Lottus (analista, aprovador, administrador) usa um Admin com telas carregadas de informação, sem tela de planos nem de cobrança, apesar de o banco já ter boa parte da infraestrutura. Preços ficam em 4 lugares sem painel único.

## Promessa
Uma central em que a equipe entende cada cliente num olhar, troca plano e define preço personalizado em poucos cliques e deixa a cobrança rodar sozinha.

## Papéis
Analista (identidade, documentos) · Aprovador (+ crédito, operações, preços) · Administrador (+ equipe, planos, regras de cobrança).

## Jornada de ouro (7 passos)
1. Entra com MFA e vê o Início: só o que exige ação hoje.
2. Abre um Cliente (cedente, fundo, conta Sign ou usuário Wealth) em uma ficha com abas.
3. Na aba Plano e cobrança vê plano atual, preço efetivo e próxima fatura.
4. Troca o plano ou define preço personalizado (valor, validade, motivo); o sistema mostra o efeito antes de salvar.
5. A cobrança do ciclo é gerada, enviada e lembrada sozinha (rotinas `lottus-`).
6. Pagamento confirmado baixa a fatura sozinho; inadimplência vira fila de ação.
7. Tudo fica na Auditoria, com quem mudou o quê.

## Mapa de partes
| # | Parte | Objetivo | v1? | Motivo |
| --- | --- | --- | --- | --- |
| 1 | Navegação e organização | Menu enxuto, Início por tarefa, páginas em abas, informação sob demanda | Sim | Pedido principal; sem regra de negócio |
| 2 | Cliente 360 | Ficha única por cliente, com vínculos para Partners, Sign, Wealth | Sim | Base para plano e cobrança |
| 3 | Planos e preços | Catálogo de planos, troca de plano, preço personalizado com validade | Sim | Pedido principal; depende de D1 |
| 4 | Cobrança automática | Faturas, geração, lembretes, baixa, inadimplência, fila de ação | Sim | Pedido principal; depende de D2 a D4 |
| 5 | Visão financeira | Receita recorrente, inadimplência, previsto x recebido | Não (v2) | Só útil depois da 4 |

Teste do enxuto: sem a 5 a jornada funciona; sem a 2 não há onde trocar plano; logo 1 a 4.

## Fora da v1
Nota fiscal de serviço automática (já há campos `nfse_*`, exige decisão fiscal); cartão de crédito recorrente (precisa de provedor e contrato); cupons e promoções (`bo_save_promo_code` existe, entra na v2); Invest e Business (app fora do repo / pausado).

## Dados mestres reaproveitados
Pessoa `profiles`, empresa `companies`, fundo `funders`, plano Sign `sign_plans`, taxa do fundo `billing_settings` e `platform_fee_plans`, faturas `bill_invoices` (a tabela gêmea `lottus_bill_invoices` será avaliada), Wealth `w_invoices`. Criar só o que falta: **catálogo único de planos** e **preço personalizado por cliente** (D1).

## Planos e preços (hipóteses, valores de hoje no banco; o Yuri valida)
Sign: Grátis 0 / Essencial 39 / Profissional 99 / Empresa 249 (reais por mês). Fundos: grátis até PL de 100 mil; 149; 390; 0,1% a.a. Wealth: Grátis, Pro e Fund (valores a confirmar). Nenhum preço novo será inventado.

## Riscos e dependências
Cobrança por Pix/boleto depende da conta Trio e dos segredos no Vault. Texto de cobrança, multa, juros e termos de plano: **jurídico**. Nota fiscal: contador. Nada vai a produção sem OK.

## Métricas
1. Tempo para trocar plano de um cliente (meta: abaixo de 1 min). 2. Faturas geradas e baixadas sem ação manual (meta: acima de 90%). 3. Itens na fila de ação do Início (reduz ao longo do dia).

## Decisões que são do Yuri
- **D1 Modelo de planos:** um catálogo único (`plans` por produto) com preço personalizado em tabela própria (recomendado) ou manter 4 mecanismos e só dar tela a cada um.
- **D2 Ciclo e vencimento:** mensal, dia 10 como hoje (`billing_settings.due_day`)? Pré ou pós-pago?
- **D3 Inadimplência:** carência hoje 15 dias; o que acontece depois (aviso, bloqueio, rebaixa para Grátis)?
- **D4 Quem pode dar preço personalizado e até quanto desconto** sem segunda aprovação.

## Aprovação do Yuri (D1 respondida em 23/11: catálogo único; G1 adotado para as Partes 1 e 2)
Parcial: D1 aprovada; D2 a D4 pendentes.
