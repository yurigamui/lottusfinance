# Relatório da plataforma: API, motores e funções de borda · 23/11/2026

[MAESTRO] Modo Beta, só leitura. O código das funções de borda **não está no repositório** (D-02); a leitura foi feita no projeto de produção pela ferramenta do Supabase, sem chamar nenhuma função.

## Inventário (B0)
23 funções ativas: `api`, `lottus-bank`, `wealth-pu`, `send-sms`, `email-events`, `team-invite`, `one-bank`, `wealth-billing`, `wealth-catalog`, `cession-ack`, `swift-api` (nome `cnpj-lookup`, duplicada), `sign-messenger`, `invoice-import`, `cnpj-lookup`, `sign-cert`, `one-nfse`, `verify`, `charges`, `pix-charge`, `backoffice-access`, `signature-mail`, `social-sync`, `cedente-enrich`. Só `cedente-enrich` tem `verify_jwt=true`; as outras 22 validam o chamador no próprio código (ou deveriam).

Banco: 283 RPCs chamadas pelas telas do Partners, Sign, Admin e News; **282 existem e estão liberadas** ao papel certo. A que faltava (`bo_nfe_manual_check`) foi criada (ver `admin/relatorio.md`).

## Lido e correto
| Função | Como valida | Observação |
| --- | --- | --- |
| `send-sms` | Assinatura do hook do Supabase Auth (standardwebhooks), aceita troca de segredo | Segredos só em variáveis de ambiente; registra formato, nunca valor |
| `email-events` | Token do webhook do Postmark comparado em tempo constante | — |
| `lottus-bank` | Token interno (`_internal_token_ok`) ou equipe `approver/admin` com MFA (`bo_me`) | API-01 abaixo |

## Pendências
| ID | Descrição | Severidade |
| --- | --- | --- |
| API-01 | `lottus-bank` (e possivelmente outras) monta o cliente "do usuário" com `SUPABASE_ANON_KEY ?? SERVICE`: se a variável faltar, a checagem `bo_me` roda com a chave de serviço. Trocar o fallback por erro | Baixa |
| API-02 | 19 funções sem JWT ainda não lidas: `api`, `one-bank`, `charges`, `pix-charge`, `backoffice-access`, `team-invite`, `cession-ack`, `verify`, `invoice-import`, `cnpj-lookup`, `swift-api`, `sign-messenger`, `sign-cert`, `signature-mail`, `one-nfse`, `social-sync`, `wealth-pu`, `wealth-billing`, `wealth-catalog`. Tratar como **risco não avaliado** até a leitura (prioridade: `api`, `one-bank`, `charges`, `pix-charge`, `backoffice-access`) | Alta (não avaliado) |
| API-03 | `swift-api` e `cnpj-lookup` parecem a mesma função publicada duas vezes (mesmo nome) | Baixa |
| API-04 | Limite de uso dos endpoints públicos (`api`, `pix-charge`, `cession-ack`, `verify`) não verificado | Média (não avaliado) |
| API-05 | Funções importam `supabase-js` por URL remota (`esm.sh`) sem lockfile; preferir `npm:` com versão fixa | Baixa |

## Depende do Yuri
D-02 (trazer `supabase/functions/` para o repositório, sem segredos) para auditar as 19 restantes com calma e versionar.
