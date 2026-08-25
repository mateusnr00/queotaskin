-- Config das Promoções por sorteio:
--   - 3 toggles em Raffle (ativar, em dobro, acumulativo)
--   - tipo da promoção em Promotion (combo QTY fixo OU tier MORE_THAN)
--
-- A "Promoção em Dobro" é só toggle por enquanto; multiplicar tickets
-- na hora da reserva é mudança futura no createReservation.

CREATE TYPE "PromotionType" AS ENUM ('QTY', 'MORE_THAN');

ALTER TABLE "Promotion"
  ADD COLUMN "type" "PromotionType" NOT NULL DEFAULT 'QTY';

ALTER TABLE "Raffle"
  ADD COLUMN "promotionsEnabled"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "promotionsDoubleEnabled"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "promotionsAccumulative"   BOOLEAN NOT NULL DEFAULT false;
