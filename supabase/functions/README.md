# Funções de borda (Supabase Edge Functions)

Código-fonte das funções do Wealth. **Nenhuma destas versões foi publicada**: as de produção (23/11/2026) são as anteriores.
Publicar só com o OK do Yuri e depois de aplicar a migração `20261123125000` (a `wealth-api` e a cobrança dependem dela).

| Função | O que faz | Segredos (Vault/variáveis da função, nunca no código) |
| --- | --- | --- |
| `wealth-pu` | P.U. diário: índices (BCB), Tesouro, CVM, B3, cripto (Mercado Bitcoin), renda fixa na curva e a mercado; ANBIMA desligada | `WEALTH_CRON_SECRET`; opcionais `B3_COTAHIST`, `CRYPTO_SOURCE`, `ANBIMA_ENABLED`, `ANBIMA_CLIENT_ID`, `ANBIMA_CLIENT_SECRET` |
| `wealth-billing` | Checkout da assinatura, cobranças das faturas e webhooks (Trio para Pix Automático, Asaas para cartão e boleto) | `WEALTH_CRON_SECRET`, `BILLING_LIVE`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BASE_URL`, `TRIO_API_KEY`, `TRIO_BASE_URL`, `TRIO_PATH_AUTHORIZATION`, `TRIO_PATH_CHARGE`, `TRIO_WEBHOOK_TOKEN`, `PAYMENT_WEBHOOK_TOKEN`, `WEALTH_APP_ORIGINS` |
| `wealth-api` | API pública só de leitura (`/v1/carteiras…`), chave `wk_…` | nenhum além dos padrão |

`verify_jwt` deve ficar **desligado** nas três: cada uma autentica por conta própria (segredo do cron, token do webhook, JWT do usuário no checkout ou chave de API).
Os adaptadores de pagamento e a ANBIMA **não foram testados contra os provedores** (sem credenciais de sandbox): ver `docs/agente/depende-de-mim.md`.
