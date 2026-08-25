-- Customização por tenant das páginas "pagamento confirmado" e "reserva
-- expirada". Quando o valor é NULL, o componente front-end usa o texto
-- padrão hardcoded.
--
-- Backfill: a coluna global SiteSettings.thankYouImageUrl (singleton) vira
-- o valor inicial de Tenant.paidImageUrl pra todo tenant — assim a imagem
-- que o admin já tinha configurado continua aparecendo após o deploy. Os
-- novos tenants criados depois nascem com NULL.

ALTER TABLE "Tenant"
  ADD COLUMN "paidTitle"          TEXT,
  ADD COLUMN "paidDescription"    TEXT,
  ADD COLUMN "paidButtonLabel"    TEXT,
  ADD COLUMN "paidImageUrl"       TEXT,
  ADD COLUMN "expiredTitle"       TEXT,
  ADD COLUMN "expiredDescription" TEXT,
  ADD COLUMN "expiredButtonLabel" TEXT,
  ADD COLUMN "expiredImageUrl"    TEXT;

UPDATE "Tenant"
   SET "paidImageUrl" = (SELECT "thankYouImageUrl" FROM "SiteSettings" WHERE "id" = 'singleton')
 WHERE "paidImageUrl" IS NULL;
