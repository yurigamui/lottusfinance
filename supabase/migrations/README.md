# Migrações

Migrações **novas**, preparadas pelo time de agentes, no formato `AAAAMMDDHHMMSS_assunto.sql`.

- **Nenhuma foi aplicada em produção.** As já aplicadas no projeto vivem no histórico do Supabase (`supabase_migrations.schema_migrations`); este repositório ainda não as espelha (ver `docs/agente/depende-de-mim.md`).
- Ordem de execução = ordem do nome. Cada arquivo é idempotente quando possível e traz no topo o que faz, o motivo e como reverter.
- Testar sempre num branch do Supabase ou num Postgres local antes de pedir o OK para produção.
