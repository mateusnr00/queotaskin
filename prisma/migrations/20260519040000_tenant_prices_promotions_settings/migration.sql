-- Configurações da aba "Preços / Promoções" no painel admin (per-tenant).
-- 3 toggles globais que afetam o que aparece na tela de compra pública.

ALTER TABLE "Tenant"
  ADD COLUMN "showPromotionsPercentage" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "showCombosPrice"          BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "showFees"                 BOOLEAN NOT NULL DEFAULT TRUE;
