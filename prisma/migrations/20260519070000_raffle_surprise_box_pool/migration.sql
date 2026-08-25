-- Pool de prêmios das Caixas Surpresas + caixas-instância geradas
-- pós-pagamento. Distribuição automática no PAID + opening flow vêm
-- na próxima migration.

-- Ordem de exibição dos ganhadores na lista pública.
CREATE TYPE "SurpriseBoxDisplayOrder" AS ENUM ('RANDOM', 'ASC', 'DESC');

-- Modo de sorteio dos prêmios: RANDOM (uniforme) ou PERCENT (chance individual).
CREATE TYPE "SurpriseBoxPrizeMode" AS ENUM ('RANDOM', 'PERCENT');

-- Estado da caixa-instância na vida do comprador.
CREATE TYPE "SurpriseBoxStatus" AS ENUM ('UNOPENED', 'OPENED_PRIZE', 'OPENED_EMPTY');

-- Campo novo no Raffle pra ordem de exibição.
ALTER TABLE "Raffle"
  ADD COLUMN "surpriseBoxDisplayOrder" "SurpriseBoxDisplayOrder" NOT NULL DEFAULT 'RANDOM';

-- Pool de prêmios. 1 linha = 1 unidade (estoque implícito = 1). claimedAt
-- + relação inversa em SurpriseBox garantem que cada item só sai 1 vez.
CREATE TABLE "SurpriseBoxPrize" (
  "id"        TEXT                   NOT NULL,
  "raffleId"  TEXT                   NOT NULL,
  "title"     TEXT                   NOT NULL,
  "prize"     TEXT                   NOT NULL,
  "mode"      "SurpriseBoxPrizeMode" NOT NULL DEFAULT 'RANDOM',
  "odds"      DECIMAL(5, 2),
  "locked"    BOOLEAN                NOT NULL DEFAULT FALSE,
  "claimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SurpriseBoxPrize_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SurpriseBoxPrize_raffleId_idx"
  ON "SurpriseBoxPrize"("raffleId");

CREATE INDEX "SurpriseBoxPrize_raffleId_locked_claimedAt_idx"
  ON "SurpriseBoxPrize"("raffleId", "locked", "claimedAt");

ALTER TABLE "SurpriseBoxPrize"
  ADD CONSTRAINT "SurpriseBoxPrize_raffleId_fkey"
  FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Caixa-instância (1 por unidade que o comprador ganhou). Status default
-- UNOPENED; vira OPENED_PRIZE (com prizeId) ou OPENED_EMPTY quando o
-- comprador abre.
CREATE TABLE "SurpriseBox" (
  "id"            TEXT                NOT NULL,
  "raffleId"      TEXT                NOT NULL,
  "reservationId" TEXT                NOT NULL,
  "status"        "SurpriseBoxStatus" NOT NULL DEFAULT 'UNOPENED',
  "prizeId"       TEXT,
  "openedAt"      TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3)        NOT NULL,

  CONSTRAINT "SurpriseBox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SurpriseBox_prizeId_key"
  ON "SurpriseBox"("prizeId");

CREATE INDEX "SurpriseBox_reservationId_idx"
  ON "SurpriseBox"("reservationId");

CREATE INDEX "SurpriseBox_raffleId_status_idx"
  ON "SurpriseBox"("raffleId", "status");

ALTER TABLE "SurpriseBox"
  ADD CONSTRAINT "SurpriseBox_raffleId_fkey"
  FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SurpriseBox"
  ADD CONSTRAINT "SurpriseBox_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SurpriseBox"
  ADD CONSTRAINT "SurpriseBox_prizeId_fkey"
  FOREIGN KEY ("prizeId") REFERENCES "SurpriseBoxPrize"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
