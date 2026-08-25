-- Config dos "Títulos Premiados" por sorteio: toggle de ativação, exibição
-- da lista pra público, modo de exibição, texto pro ganhador e mensagem
-- pra quem não ganhou. Os números+prêmios continuam em AwardedTicket; esses
-- campos só controlam UX e copy.

ALTER TABLE "Raffle"
  ADD COLUMN "awardedTicketsEnabled"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "awardedTicketsShowList"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "awardedTicketsViewMode"    TEXT    NOT NULL DEFAULT 'list',
  ADD COLUMN "awardedTicketsWinnerText"  TEXT,
  ADD COLUMN "awardedTicketsLoserShow"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "awardedTicketsLoserTitle"  TEXT,
  ADD COLUMN "awardedTicketsLoserText"   TEXT;
