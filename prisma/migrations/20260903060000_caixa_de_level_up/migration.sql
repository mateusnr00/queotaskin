-- A Caixa de Boost de XP por Level Up.
--
-- NADA RETROATIVO
--
-- `levelUpBoxesEnabled` nasce FALSO e `levelUpBoxesEnabledAt` nasce NULO de
-- propósito. Ninguém ganha caixa por níveis já conquistados: a concessão
-- acontece na TRANSIÇÃO de nível de uma compra, e transição só existe em
-- compra nova. A data de ativação é a trava explícita disso.
--
-- A IDEMPOTÊNCIA MORA NO BANCO
--
-- O índice único (userId, tenantId, sourceLevel) é o que impede caixa
-- duplicada por webhook reentregue, retry ou duas confirmações simultâneas.
-- Checagem em memória não sobrevive a duas transações concorrentes; o índice
-- sobrevive.

CREATE TYPE "LevelUpBoxStatus" AS ENUM ('FECHADA', 'ATIVA', 'CONSUMIDA', 'EXPIRADA');
CREATE TYPE "LevelUpBoxRarity" AS ENUM ('COMUM', 'RARO', 'EPICO', 'LENDARIO', 'ULTRA_RARO');

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "levelUpBoxesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "levelUpBoxesEnabledAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "levelUpBoostMinutes" INTEGER NOT NULL DEFAULT 15;

CREATE TABLE "LevelUpBox" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceLevel" INTEGER NOT NULL,
    "status" "LevelUpBoxStatus" NOT NULL DEFAULT 'FECHADA',
    "multiplier" DECIMAL(4,2),
    "rarity" "LevelUpBoxRarity",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "consumedByReservationId" TEXT,
    "baseXp" INTEGER,
    "bonusXp" INTEGER,
    "finalXp" INTEGER,
    CONSTRAINT "LevelUpBox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LevelUpBox_userId_tenantId_sourceLevel_key"
  ON "LevelUpBox"("userId", "tenantId", "sourceLevel");
CREATE INDEX "LevelUpBox_userId_tenantId_status_idx"
  ON "LevelUpBox"("userId", "tenantId", "status");
CREATE INDEX "LevelUpBox_tenantId_idx" ON "LevelUpBox"("tenantId");

ALTER TABLE "LevelUpBox" ADD CONSTRAINT "LevelUpBox_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LevelUpBox" ADD CONSTRAINT "LevelUpBox_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LevelUpBox" ADD CONSTRAINT "LevelUpBox_consumedByReservationId_fkey"
  FOREIGN KEY ("consumedByReservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LevelUpBoxDrop" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "multiplier" DECIMAL(4,2) NOT NULL,
    "rarity" "LevelUpBoxRarity" NOT NULL,
    "chance" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LevelUpBoxDrop_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LevelUpBoxDrop_tenantId_multiplier_key"
  ON "LevelUpBoxDrop"("tenantId", "multiplier");
CREATE INDEX "LevelUpBoxDrop_tenantId_ativo_idx" ON "LevelUpBoxDrop"("tenantId", "ativo");

ALTER TABLE "LevelUpBoxDrop" ADD CONSTRAINT "LevelUpBoxDrop_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
