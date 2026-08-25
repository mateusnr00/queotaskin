-- Ganhador do sorteio principal. Setado quando o admin declara o
-- resultado (via modal admin). A rifa vira FINISHED nesse momento.

ALTER TABLE "Raffle"
  ADD COLUMN "winnerTicketNumber" INTEGER,
  ADD COLUMN "winnerDrawnAt"      TIMESTAMP(3),
  ADD COLUMN "winnerNote"         TEXT;
