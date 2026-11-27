# Migrações

Migrações **novas**, preparadas pelo time de agentes, no formato `AAAAMMDDHHMMSS_assunto.sql`.

- **Nenhuma foi aplicada em produção.** As já aplicadas no projeto vivem no histórico do Supabase (`supabase_migrations.schema_migrations`); este repositório ainda não as espelha (ver `docs/agente/depende-de-mim.md`).
- Ordem de execução = ordem do nome. Cada arquivo é idempotente quando possível e traz no topo o que faz, o motivo e como reverter.
- Testar sempre num branch do Supabase ou num Postgres local antes de pedir o OK para produção.

## Admin (25 a 27/11/2026)
- `20261125120000_admin_planos_precos_cobranca.sql`: preços personalizados, troca de plano, fila em atraso e geração automática de faturas (testes: `supabase/tests/admin_planos_precos.sql`).
- `20261126120000_admin_seguranca_sign_mensageria.sql`: escritas de mensageria e raízes de confiança do Sign só para administrador (teste: `supabase/tests/admin_seguranca_sign.sql`).
- Roteiro completo, reversão e verificações antes de aplicar: `docs/agente/admin/release.md`. Rodar os testes locais com `PG_ONLY='admin|seguranca|integridade' bash scripts/test-db.sh`.
