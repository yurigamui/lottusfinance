# Funções de borda (Supabase Edge Functions)

Código-fonte das funções do Wealth. **Nenhuma destas versões foi publicada**: as de produção (23/11/2026) são as anteriores.
Publicar só com o OK do Yuri e depois de aplicar a migração `20261123125000` (a `wealth-api` e a cobrança dependem dela).

| Função | O que faz | Segredos (Vault/variáveis da função, nunca no código) |
| --- | --- | --- |
| `wealth-pu` | P.U. diário: índices (BCB), Tesouro, CVM, B3, cripto (Mercado Bitcoin), renda fixa na curva e a mercado, ANBIMA (debêntures, CRI/CRA; ligada com credenciais); ação `pu_at` (P.U. de um dia, pedido pela tela) | `WEALTH_CRON_SECRET`, `ANBIMA_CLIENT_ID`, `ANBIMA_CLIENT_SECRET`; opcionais `ANBIMA_BASE_URL` (sandbox: `https://api.sandbox.anbima.com.br`), `ANBIMA_ENABLED=0`, `B3_COTAHIST=0`, `CRYPTO_SOURCE=0`, `CVM_BACKFILL_MONTHS`, `B3_BACKFILL_MONTHS`, `WEALTH_APP_ORIGINS` |
| `wealth-billing` | Checkout da assinatura, cobranças das faturas e webhooks (Trio para Pix Automático, Asaas para cartão e boleto) | `WEALTH_CRON_SECRET`, `BILLING_LIVE`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BASE_URL`, `TRIO_CLIENT_ID`, `TRIO_CLIENT_SECRET`, `TRIO_BANK_ACCOUNT_ID`, `TRIO_WEBHOOK_SECRET`, `TRIO_NOTIFICATION_KEY`, opcionais `TRIO_BASE_URL` (padrão: sandbox `https://api.sandbox.trio.com.br`; produção `https://api.trio.com.br`), `TRIO_VERSION` (padrão `2026-10-19.v2`), `TRIO_REQUESTER_TAX_NUMBER`, `PAYMENT_WEBHOOK_TOKEN`, `WEALTH_APP_ORIGINS` |
| `wealth-api` | API pública só de leitura (`/v1/carteiras…`), chave `wk_…` | nenhum além dos padrão |

`verify_jwt` deve ficar **desligado** nas três: cada uma autentica por conta própria (segredo do cron, token do webhook, JWT do usuário no checkout ou chave de API).
O adaptador da **Trio** segue a documentação oficial da API V2 (docs.trio.com.br, lida em 24/11/2026): recorrência de Pix Automático de valor variável com mínimo = 1 carteira, cobrança de cada ciclo criada e agendada 2 a 10 dias antes do vencimento, webhook com `x-webhook-secret` + assinatura HMAC-SHA-256. A **ANBIMA** segue developers.anbima.com.br (mesma data). Nada foi testado contra os provedores (sem credenciais): ver `docs/agente/depende-de-mim.md`. A **Asaas** (cartão e boleto) foi escrita sem acesso à documentação: conferir antes de ligar.
