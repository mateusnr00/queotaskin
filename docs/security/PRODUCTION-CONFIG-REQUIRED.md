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
6. **~~Provider real de OTP (participante)~~ — NAO REQUERIDO (FASE 10.2):** o
   login do participante e por CPF+SENHA. Nenhum SMS/WhatsApp/OTP externo. O
   antigo item de provider fica historico. Provider real de OTP (participante): escolher vendor, registrar o adapter
   em `provider-registry.ts` (`REAIS`), setar `OTP_PROVIDER`/`OTP_PROVIDER_API_KEY`/
   `OTP_PROVIDER_BASE_URL` (HTTPS, host oficial na allowlist). Arquitetura pronta;
   falta a seleção do vendor + `montarRequisicao`.
7. **Lockdown financeiro no banco** (prisma/roles/financial-fsm-lockdown.sql):
   aplicar pela migration_role, na mesma janela do guard (revoga UPDATE(status)
   de Payment da app_runtime; força INSERT PENDING; guarda Reservation PAID).
8. **ADMIN_MFA_ENCRYPTION_KEY** em prod (32 bytes, **diferente** de
   PAYMENT_SECRET_ENCRYPTION_KEY); rodar `recifrarSegredosMfaLegados` para migrar
   TOTP legados para v2.
9. **Alerting** conforme ALERTING-CONTRACT (Sentry/Datadog).
