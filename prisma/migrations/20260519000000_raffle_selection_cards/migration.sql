-- Quick-picks de quantidade no form de reserva. Até 6 valores numéricos
-- (ex: [5, 10, 100, 500, 1000, 5000]). bestseller: índice (0-5) que recebe
-- o destaque "MAIS POPULAR"; -1 = nenhum card destacado.

ALTER TABLE "Raffle"
  ADD COLUMN "selectionCards"           INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "selectionCardsBestseller" INTEGER   NOT NULL DEFAULT -1;
