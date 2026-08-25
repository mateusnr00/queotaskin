-- Texto custom mostrado no card de preço de rifas gratuitas (isFree=true).
-- Quando NULL, o front-end usa "SORTEIO GRATUITO" como default.

ALTER TABLE "Raffle"
  ADD COLUMN "freeLabel" TEXT;
