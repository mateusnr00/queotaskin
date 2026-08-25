-- Caixas Surpresas por rifa: toggles + tiers de combo (X cotas → N caixas).
-- A distribuição de prêmios em si (pool, sorteio aleatório, criação de
-- SurpriseBox por reserva paga) será adicionada em iteração futura.

ALTER TABLE "Raffle"
  ADD COLUMN "surpriseBoxEnabled"            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "surpriseBoxCombosAccumulative" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE "SurpriseBoxCombo" (
  "id"          TEXT    NOT NULL,
  "raffleId"    TEXT    NOT NULL,
  "threshold"   INTEGER NOT NULL,
  "boxCount"    INTEGER NOT NULL,
  "visible"     BOOLEAN NOT NULL DEFAULT TRUE,
  "highlighted" BOOLEAN NOT NULL DEFAULT FALSE,

  CONSTRAINT "SurpriseBoxCombo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SurpriseBoxCombo_raffleId_threshold_key"
  ON "SurpriseBoxCombo"("raffleId", "threshold");

CREATE INDEX "SurpriseBoxCombo_raffleId_idx"
  ON "SurpriseBoxCombo"("raffleId");

ALTER TABLE "SurpriseBoxCombo"
  ADD CONSTRAINT "SurpriseBoxCombo_raffleId_fkey"
  FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
