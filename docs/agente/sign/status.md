# STATUS: Lottus Sign · atualizado em 24/11/2026

**Leitura adotada (G0):** Modo **Parcial**. O back-end já existe no banco de produção (22 tabelas com RLS, ~50 RPCs `sign_*`/`verify_*`); o front logado não existe no repositório. As 3 páginas públicas são auditadas (relatorio.md, 23/11) e usam só as RPCs antigas (`sign_public_*`, `sign_collection_*`, `verify_collection*`); as RPCs de envelope (`sign_env_*`, `verify_envelope*`) não têm tela. Pedido do Yuri: construir o Sign completo, funcional, conforme a regulação brasileira.

Fase atual: **2 (Parte 1: Conta e identidade), G1 liberado em 24/11/2026** · Parte atual: nenhuma · Seção atual: nenhuma

## Linha de base (só leitura em produção, 24/11/2026)
| Item | Achado |
| --- | --- |
| Front no repo | `index.html` (entrar/criar conta/verificar), `assinar.html`, `verificar.html`; `pdfdoc.js` gera PDF no navegador |
| Tabelas `sign_*` | accounts, company_links, contacts, env_events, env_signers, envelopes, identity, messaging_config, otps, outbox, plans, trusted_roots; mais `signature_evidence` (cadeia de hash) e `signature_notifications`. Todas com RLS |
| RPCs ao usuário logado | sign_me, sign_profile_save, sign_account_save, sign_phone_send/verify, sign_cert_challenge, sign_root_*, sign_env_create/list/get/inbox/cancel/remind/pdf/my_link, sign_contacts_*, sign_company_*, sign_plan_state/request, sign_messaging_*, sign_my_documents, sign_onboarding_done, sign_otp_delivery |
| RPCs públicas (anon) | sign_env_public_get/submit/decline; sign_public_get/submit; sign_collection_get/submit; verify_envelope/_pdf; verify_collection/_pdf |
| Regras já no banco | PDF até 10 MB e começa com `%PDF-`; 1 a 10 signatários, CPF validado, e-mail único por envelope; validade 1 a 90 dias; limite de 30 envelopes em 24 h; cota de plano (`_sign_quota_check`); exige telefone verificado ou certificado com cadeia válida; ordem sequencial opcional; eventos com hash encadeado |
| Planos no banco | Grátis R$ 0 (3 docs), Essencial R$ 39 (20), Profissional R$ 99 (80), Empresa R$ 249 (300); extra R$ 2,40 / 1,90 / 1,40 |
| Não testado | RPCs `sign_env_*` executadas de ponta a ponta; OTP real; certificado ICP-Brasil real; envio de SMS/WhatsApp (sem provedor testado) |

## Painel
| Parte | Seção | Especificada | Construída | Verificada | Veredito | Ciclos |
| --- | --- | --- | --- | --- | --- | --- |
| (aguardando G1) | | | | | | |

## Próximo passo exato
1. Fase 2 da Parte 1: Ficha da Parte com `idealizador`, `arquiteto`, `designer`. Antes, auditar no banco local se o OTP do signatário existe (hoje `sign_otps` só tem `user_id`; lacuna para "avançada", T-04).
2. Montar o ambiente local de teste (Postgres local com as funções `sign_*`, modelo `scripts/wealth-local`); não aplicar nada em produção.
3. Fase 2 da Parte 1 (Conta e identidade).

## Bloqueios que dependem do Yuri
Ver `pendencias.md` (J-01 a J-04, jurídico) e `docs/agente/depende-de-mim.md` (D-01 branch Supabase).
