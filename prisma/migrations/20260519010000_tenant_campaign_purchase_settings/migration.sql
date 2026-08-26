-- Configurações da aba "Campanha / Compra" no painel admin (per-tenant).
-- loginMode: "phone" ou "cpf", qual identificador usar no login público.
-- numbersNomenclature: como chamar as cotas ("titulos"/"numeros"/"bilhetes"/"numeros_sorte").
-- quantityCardsHeading: texto custom acima dos quick-picks na reserva.
-- minPurchaseAge: idade mínima exigida pra reservar (16/18/21).

ALTER TABLE "Tenant"
  ADD COLUMN "loginMode"             TEXT NOT NULL DEFAULT 'phone',
  ADD COLUMN "numbersNomenclature"   TEXT NOT NULL DEFAULT 'titulos',
  ADD COLUMN "quantityCardsHeading"  TEXT,
  ADD COLUMN "minPurchaseAge"        INTEGER NOT NULL DEFAULT 18;
