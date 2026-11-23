# Relatório da plataforma: Lottus Invest · 23/11/2026

[MAESTRO] Modo Parcial. O app (Expo) **não está no repositório** (D-02): nenhuma tela pôde ser aberta, construída ou verificada, e as partes Carteira, Convites, Oferta, Aplicar e Resgate ficam **bloqueadas** até o código chegar.

## Banco (só leitura)
- Tabelas `invest_accounts`, `invest_interests`, `invest_invites`, `investor_access`: RLS ligada, sem política e sem grant para `anon`/`authenticated` (acesso só por RPC).
- RPCs: `invest_me`, `invest_portfolio`, `invest_offers`, `invest_interest`, `invest_claim`, `invest_redeem_request` (só logados) e `invest_invite_get` (pública, por convite). Todas `SECURITY DEFINER` com `search_path` vazio.
- Coerente com a decisão registrada no manual: oferta só para quem tem convite do emissor. Conferido o corpo de `invest_invite_get` (pública): devolve só o nome do investidor convidado, o e-mail do convite e o nome do fundo, por token com hash SHA-256 e validade; **nenhuma oferta, taxa ou valor**.

## Pendências
| ID | Descrição | Severidade |
| --- | --- | --- |
| I-001 | Código do app fora do repositório | Bloqueante para a plataforma (depende do Yuri, D-02) |
| I-002 | ~~Conferir `invest_invite_get`~~ conferido em 23/11: não revela oferta, taxa nem valor | Resolvida |

## Próximo passo exato
Com o código em `apps/invest/`: Fase 0 do Invest (inventário de rotas do expo-router e RPCs chamadas), depois Fase 2 da parte Carteira.
