-- Sistema de boost, sequência e decomposição do XP.
--
-- O QUE ESTA MIGRATION NÃO FAZ: converter XP.
--
-- O projeto já grava XP multiplicado por dez (R$ 8,00 pagos = 80 XP no
-- extrato, conferido em produção antes de escrever isto), e a escada de
-- níveis já é a de 1.000 a 500.000. Multiplicar de novo inflaria todo mundo
-- em dez vezes. Nenhum valor de XP é tocado aqui, e por isso ninguém pode
-- perder nível: a única coisa que muda de significado é o GOAT, que passa a
-- exigir gasto, e hoje nenhuma conta está nele.

CREATE TYPE "BoostReason" AS ENUM (
  'ACTIVITY', 'STREAK', 'MISSION', 'DECAY', 'TEMPORARY_BOOST', 'ADMIN_ADJUSTMENT'
);

ALTER TABLE "UserProgress"
  ADD COLUMN "totalSpent" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "boostPoints" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "currentStreak" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "longestStreak" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastActiveDate" TEXT,
  ADD COLUMN "lastParticipationAt" TIMESTAMP(3),
  ADD COLUMN "streakProtectionAvailable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "streakProtectionUsedAt" TIMESTAMP(3),
  ADD COLUMN "diasAtivosAposProtecao" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastDecayAppliedAt" TIMESTAMP(3),
  ADD COLUMN "lastDecayDay" TEXT,
  ADD COLUMN "lastWinAt" TIMESTAMP(3);

-- A decomposição do XP no extrato. Nula nos lançamentos antigos, e é assim
-- que a página sabe distinguir "creditado antes do multiplicador" de
-- "creditado com boost": o extrato antigo continua verdadeiro do jeito que
-- foi gravado, sem recálculo retroativo.
ALTER TABLE "XpEntry"
  ADD COLUMN "baseXp" INTEGER,
  ADD COLUMN "multiplier" DECIMAL(4,2),
  ADD COLUMN "bonusXp" INTEGER,
  ADD COLUMN "metadata" JSONB;

CREATE TABLE "BoostEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "type" "BoostReason" NOT NULL,
  "points" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BoostEntry_pkey" PRIMARY KEY ("id")
);

-- A chave de idempotência é única: é ela que impede o mesmo marco de
-- sequência, o mesmo decaimento do dia ou a mesma missão de pontuarem duas
-- vezes num reprocessamento.
CREATE UNIQUE INDEX "BoostEntry_idempotencyKey_key" ON "BoostEntry"("idempotencyKey");
CREATE INDEX "BoostEntry_userId_tenantId_createdAt_idx"
  ON "BoostEntry"("userId", "tenantId", "createdAt" DESC);

ALTER TABLE "BoostEntry"
  ADD CONSTRAINT "BoostEntry_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "BoostEntry_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill do gasto acumulado, a partir das reservas realmente pagas.
--
-- Dado real, e não estimativa: soma o que já existe em Reservation. É o que
-- o GOAT passa a exigir, e sem isto todo mundo começaria com gasto zero e a
-- exigência ficaria retroativa contra quem já comprou.
UPDATE "UserProgress" p
SET "totalSpent" = coalesce(g.total, 0)
FROM (
  SELECT r."userId", ra."tenantId", sum(r."totalAmount") AS total
  FROM "Reservation" r
  JOIN "Raffle" ra ON ra.id = r."raffleId"
  WHERE r.status = 'PAID' AND r."userId" IS NOT NULL
  GROUP BY r."userId", ra."tenantId"
) g
WHERE g."userId" = p."userId" AND g."tenantId" = p."tenantId";
