-- CreateEnum
CREATE TYPE "LogOrigin" AS ENUM ('PAINEL', 'SISTEMA', 'PUBLICO');

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "origem" "LogOrigin" NOT NULL DEFAULT 'PAINEL',
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" "Role",
    "actorEmail" TEXT,
    "acao" TEXT NOT NULL,
    "alvoTipo" TEXT,
    "alvoId" TEXT,
    "alvoRotulo" TEXT,
    "detalhes" JSONB,
    "ip" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityLog_tenantId_criadoEm_idx" ON "ActivityLog"("tenantId", "criadoEm");

-- CreateIndex
CREATE INDEX "ActivityLog_alvoTipo_alvoId_idx" ON "ActivityLog"("alvoTipo", "alvoId");

-- CreateIndex
CREATE INDEX "ActivityLog_acao_criadoEm_idx" ON "ActivityLog"("acao", "criadoEm");

-- CreateIndex
CREATE INDEX "ActivityLog_actorId_criadoEm_idx" ON "ActivityLog"("actorId", "criadoEm");

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
