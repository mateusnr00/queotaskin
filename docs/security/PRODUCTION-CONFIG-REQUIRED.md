# CONFIGURAÇÃO DE PRODUÇÃO NECESSÁRIA (operador humano)

O código está pronto (CODE COMPLETE). Estes passos dependem de mudança real em
Supabase/Vercel e NÃO podem ser feitos localmente por esta fase:

1. **Separação de roles do Postgres** (prisma/roles/roles.sql):
   - Criar `app_runtime` (LOGIN + senha), `migration_role` (dona do schema).
   - Aplicar os grants; apontar DATABASE_URL→app_runtime, DIRECT_URL→migration_role.
   - Provado localmente em scratch (db-roles.security.test.ts); falta aplicar no real.
2. **Guard financeiro instalado** (prisma/guard/*.sql) pela migration_role.
3. **Migration fora do build**: configurar o pipeline de deploy para rodar
   `npm run db:migrate:deploy` como passo separado (o build não migra mais).
4. **CRON_SECRET, AUTH_SECRET, PAYMENT_SECRET_ENCRYPTION_KEY** definidos em prod
   (env-validation derruba o boot se faltarem).
5. **Backup/PITR** (BACKUP-CHECKLIST) — habilitar e testar restore.
6. **Provider real de OTP (participante) — NAO REQUERIDO (FASE 10.2):** o login
   do participante e por CPF+SENHA. Nenhum SMS/WhatsApp/OTP externo e necessario
   para abrir o site. O antigo item de provider fica historico; a arquitetura de
   `provider-registry.ts` permanece no codigo, dormente (`REAIS` vazio), e so
   seria integrada se um recurso futuro exigir OTP - fora do escopo deste release.
7. **Lockdown financeiro no banco** (prisma/roles/financial-fsm-lockdown.sql):
   aplicar pela migration_role, na mesma janela do guard (revoga UPDATE(status)
   de Payment da app_runtime; força INSERT PENDING; guarda Reservation PAID).
8. **ADMIN_MFA_ENCRYPTION_KEY** em prod (32 bytes, **diferente** de
   PAYMENT_SECRET_ENCRYPTION_KEY); rodar `recifrarSegredosMfaLegados` para migrar
   TOTP legados para v2.
9. **Alerting** conforme ALERTING-CONTRACT (Sentry/Datadog).
10. **RLS do runtime** (prisma/roles/runtime-rls.sql) — **PRE-REQUISITO DO CUTOVER
    para app_runtime.** No Supabase a event trigger nativa `ensure_rls` habilita
    RLS em TODA tabela (63/63, zero policies); app_runtime (sem BYPASSRLS) seria
    negada em tudo. Correcao: `ALTER ROLE app_runtime BYPASSRLS` (exige superuser
    `supabase_admin`; o `postgres` do Supabase nao consegue). Preserva o column
    lockdown (BYPASSRLS nao ignora grant de coluna) e mantem a RLS protegendo a
    Data API (anon/authenticated). Validar com prisma/roles/verify-runtime-rls.sql.
    **Sem isto, apontar DATABASE_URL para app_runtime quebra o app (fail-closed).**
