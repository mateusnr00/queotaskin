-- =====================================================================
-- Multi-tenant: cria Tenant + TenantHost, adiciona tenantId em User e
-- Raffle, faz backfill dos dados existentes pro tenant default ("mateus")
-- e torna Raffle.tenantId NOT NULL com slug único por tenant.
-- =====================================================================

-- ---------- Enum kind do host ----------
CREATE TYPE "TenantHostKind" AS ENUM ('PUBLIC', 'ADMIN');

-- ---------- Tabela Tenant ----------
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE UNIQUE INDEX "Tenant_ownerId_key" ON "Tenant"("ownerId");

-- ---------- Tabela TenantHost ----------
CREATE TABLE "TenantHost" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "kind" "TenantHostKind" NOT NULL,

    CONSTRAINT "TenantHost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantHost_host_key" ON "TenantHost"("host");
CREATE INDEX "TenantHost_tenantId_idx" ON "TenantHost"("tenantId");

ALTER TABLE "TenantHost" ADD CONSTRAINT "TenantHost_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------- User.tenantId (nullable: membership) ----------
ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------- Raffle.tenantId (nullable durante backfill) ----------
ALTER TABLE "Raffle" ADD COLUMN "tenantId" TEXT;

-- ---------- Backfill: cria tenant default a partir do primeiro ADMIN ----------
-- Se houver pelo menos 1 ADMIN, cria o tenant "mateus" com ele como dono,
-- promove pra SUPER_ADMIN, cria hosts default e linka rifas/usuários ADMIN
-- pré-existentes nesse tenant.
DO $$
DECLARE
  default_owner_id TEXT;
  default_tenant_id TEXT := 'tenant_default_mateus';
BEGIN
  SELECT "id" INTO default_owner_id
  FROM "User"
  WHERE "role" = 'ADMIN'
  ORDER BY "createdAt" ASC
  LIMIT 1;

  IF default_owner_id IS NOT NULL THEN
    INSERT INTO "Tenant" ("id", "slug", "name", "ownerId", "createdAt", "updatedAt")
    VALUES (default_tenant_id, 'mateus', 'Sorteios VIP', default_owner_id, NOW(), NOW())
    ON CONFLICT ("ownerId") DO NOTHING;

    UPDATE "User"
    SET "role" = 'SUPER_ADMIN'
    WHERE "id" = default_owner_id;

    INSERT INTO "TenantHost" ("id", "tenantId", "host", "kind") VALUES
      ('th_default_root', default_tenant_id, 'sorteios.vip', 'PUBLIC'),
      ('th_default_www', default_tenant_id, 'www.sorteios.vip', 'PUBLIC'),
      ('th_default_admin', default_tenant_id, 'admin.sorteios.vip', 'ADMIN')
    ON CONFLICT ("host") DO NOTHING;

    UPDATE "Raffle"
    SET "tenantId" = default_tenant_id
    WHERE "tenantId" IS NULL;

    UPDATE "User"
    SET "tenantId" = default_tenant_id
    WHERE "role" IN ('SUPER_ADMIN', 'ADMIN', 'AFFILIATE') AND "tenantId" IS NULL;
  END IF;
END $$;

-- ---------- Garante que não sobrou raffle sem tenant antes do NOT NULL ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Raffle" WHERE "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'Existem rifas sem tenantId — crie ao menos 1 ADMIN no banco antes de aplicar essa migration (rode prisma db seed).';
  END IF;
END $$;

-- ---------- Raffle.tenantId NOT NULL + FK + slug único por tenant ----------
ALTER TABLE "Raffle" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Raffle" ADD CONSTRAINT "Raffle_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Raffle_tenantId_idx" ON "Raffle"("tenantId");

-- Slug deixa de ser único globalmente — passa a ser único por tenant.
ALTER TABLE "Raffle" DROP CONSTRAINT IF EXISTS "Raffle_slug_key";
DROP INDEX IF EXISTS "Raffle_slug_key";
CREATE UNIQUE INDEX "Raffle_tenantId_slug_key" ON "Raffle"("tenantId", "slug");
