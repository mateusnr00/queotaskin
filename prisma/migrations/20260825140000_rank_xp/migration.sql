-- Sistema de rank: XP por compra, níveis 0–21 e patentes de prestígio.
--
-- O ledger (XpEntry) é a fonte da verdade; UserProgress.xp é um total
-- desnormalizado, recalculado a partir do ledger dentro de um advisory lock
-- por usuário. Sem esse lock, dois pagamentos concorrentes do mesmo usuário
-- leem o mesmo total antigo e um sobrescreve o outro.

CREATE TYPE "XpReason" AS ENUM (
  'PURCHASE',
  'REFUND',
  'ADMIN_ADJUST',
  'BONUS'
);

CREATE TABLE "XpEntry" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  -- Negativo em estorno. O XP total nunca fica abaixo de zero (clamp na leitura).
  "amount"        INTEGER NOT NULL,
  "reason"        "XpReason" NOT NULL,
  "reservationId" TEXT,
  "description"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "XpEntry_pkey" PRIMARY KEY ("id")
);

-- Progresso por (usuário, tenant): comprar no site de outro operador não
-- pode levantar o rank aqui.
CREATE TABLE "UserProgress" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "xp"        INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserProgress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "XpEntry_userId_tenantId_createdAt_idx"
  ON "XpEntry"("userId", "tenantId", "createdAt" DESC);
CREATE INDEX "XpEntry_tenantId_idx" ON "XpEntry"("tenantId");

-- Idempotência: no máximo um crédito por (usuário, motivo, reserva). Uma
-- reentrega do webhook vira no-op por violação de unique, não XP dobrado.
-- O Postgres trata NULLs como distintos num índice único, então ajustes
-- manuais e bônus (reservationId NULL) continuam podendo repetir.
CREATE UNIQUE INDEX "XpEntry_userId_reason_reservationId_key"
  ON "XpEntry"("userId", "reason", "reservationId");

CREATE UNIQUE INDEX "UserProgress_userId_tenantId_key"
  ON "UserProgress"("userId", "tenantId");
-- Ordenação do ranking público.
CREATE INDEX "UserProgress_tenantId_xp_idx" ON "UserProgress"("tenantId", "xp" DESC);

ALTER TABLE "XpEntry"
  ADD CONSTRAINT "XpEntry_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "XpEntry_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "XpEntry_reservationId_fkey" FOREIGN KEY ("reservationId")
    REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserProgress"
  ADD CONSTRAINT "UserProgress_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "UserProgress_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Economia do rank, ajustável por tenant no painel.
ALTER TABLE "Tenant"
  ADD COLUMN "xpPerBrl"     INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "rankEnabled"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "rankShowOnHome" BOOLEAN NOT NULL DEFAULT true;

-- Campanha exclusiva: nível mínimo para reservar. NULL = aberta a todos.
-- É o que dá consequência ao rank, sem isso ele é só um selo.
ALTER TABLE "Raffle"
  ADD COLUMN "minLevel" INTEGER;

ALTER TABLE "Raffle"
  ADD CONSTRAINT "Raffle_minLevel_range"
    CHECK ("minLevel" IS NULL OR ("minLevel" >= 1 AND "minLevel" <= 21));
