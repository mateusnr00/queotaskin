-- Camada de nicho Counter-Strike 2 do QuéOta Skin.
--
-- Cada Prize passa a poder descrever uma skin de verdade (raridade, desgaste,
-- float, StatTrak, valor de mercado), e cada User guarda o link de troca da
-- Steam, é por ele que o prêmio é entregue.

CREATE TYPE "SkinRarity" AS ENUM (
  'CONSUMER',
  'INDUSTRIAL',
  'MIL_SPEC',
  'RESTRICTED',
  'CLASSIFIED',
  'COVERT',
  'CONTRABAND',
  'EXTRAORDINARY'
);

CREATE TYPE "SkinWear" AS ENUM (
  'FACTORY_NEW',
  'MINIMAL_WEAR',
  'FIELD_TESTED',
  'WELL_WORN',
  'BATTLE_SCARRED'
);

ALTER TABLE "Prize"
  ADD COLUMN "skinName"       TEXT,
  ADD COLUMN "skinRarity"     "SkinRarity",
  ADD COLUMN "skinWear"       "SkinWear",
  ADD COLUMN "skinFloat"      DOUBLE PRECISION,
  ADD COLUMN "skinStatTrak"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "skinSouvenir"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "skinValueBrl"   DECIMAL(10,2),
  ADD COLUMN "skinCollection" TEXT,
  ADD COLUMN "skinInspectUrl" TEXT;

-- Link de troca da Steam (steamcommunity.com/tradeoffer/new/?partner=...&token=...).
-- Sem ele não é possível enviar a skin ao ganhador.
ALTER TABLE "User"
  ADD COLUMN "steamTradeUrl" TEXT,
  ADD COLUMN "steamId"       TEXT;

-- Exige o link de troca no cadastro? Per-tenant, igual aos outros toggles de UX.
ALTER TABLE "Tenant"
  ADD COLUMN "requireSteamTradeUrl" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "steamDeliveryNotice"  TEXT;
