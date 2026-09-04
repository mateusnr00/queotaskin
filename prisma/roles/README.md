# Separação de roles do Postgres (P1-C)

Reduz o blast radius de uma aplicação comprometida (RCE com a credencial de
runtime). **Artefatos** — o operador aplica no banco real (Supabase); não são
executados por esta fase.

- **migration_role**: DONA de todos os objetos (DDL, índices, triggers, guard).
  Usada SÓ por `prisma migrate deploy` (DIRECT_URL). Nunca no runtime.
- **app_runtime**: só DML nas tabelas de negócio. SEM DDL, SEM DROP TRIGGER, SEM
  alterar o financial maintenance guard, SEM UPDATE/DELETE em tabelas de audit.
  Usada pelo runtime da app (DATABASE_URL / pooler).

Ordem de aplicação (operador, uma vez):
1. `prisma migrate deploy` como migration_role (cria/possui o schema).
2. `psql -f prisma/guard/financial-maintenance.install.sql` como migration_role.
3. `psql -f prisma/roles/roles.sql` como migration_role (cria app_runtime e grants).
4. Apontar DATABASE_URL (runtime) para app_runtime; DIRECT_URL para migration_role.
