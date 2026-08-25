-- Configurações da aba "Prêmios Instantâneos" no painel admin (per-tenant).
-- instantPrizesOrder controla a ordem das modalidades na página pública.
-- Os 7 toggles controlam exibição/agrupamento dos números premiados.

ALTER TABLE "Tenant"
  ADD COLUMN "instantPrizesOrder"                TEXT[]  NOT NULL DEFAULT ARRAY['awarded_numbers', 'awarded_box', 'reward_spin', 'scratch_card']::TEXT[],
  ADD COLUMN "awardedSectionTitle"               TEXT    NOT NULL DEFAULT 'Títulos Premiados',
  ADD COLUMN "showAwardedOnlyWhenDistributed"    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "showAwardedNumbers"                BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "showAwardedNumbersBoxes"           BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "showAwardedNumbersRoulette"        BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "showAwardedNumbersScratchCard"     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "aggregateInstantAwards"            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "disableInstantAwardsRepeatWinners" BOOLEAN NOT NULL DEFAULT FALSE;
