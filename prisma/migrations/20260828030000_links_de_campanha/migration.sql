-- Links de campanha por sorteio.
--
-- Cada sorteio ganha um link por canal (anúncio, bio do Instagram, grupo,
-- stories). O canal viaja na URL como utm_content, fica gravado na reserva e
-- é contado aqui a cada abertura. Com os dois lados, o painel responde a
-- pergunta que decide onde investir: quantos vieram por este canal e quantos
-- deles compraram.
--
-- utmContent faltava na reserva. As outras três marcas já existiam, mas sem
-- esta não dá para separar "veio do anúncio" de "veio da bio" quando as duas
-- apontam para o mesmo sorteio.
ALTER TABLE "Reservation" ADD COLUMN "utmContent" TEXT;

-- Sem dimensão de dia de propósito: o painel mostra o total por canal, e
-- guardar por dia multiplicaria as linhas por nada.
CREATE TABLE "VisitaDeCampanha" (
  "id"       TEXT NOT NULL,
  "raffleId" TEXT NOT NULL,
  "canal"    TEXT NOT NULL,
  "visitas"  INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "VisitaDeCampanha_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisitaDeCampanha_raffleId_canal_key" ON "VisitaDeCampanha"("raffleId", "canal");
CREATE INDEX "VisitaDeCampanha_raffleId_idx" ON "VisitaDeCampanha"("raffleId");

ALTER TABLE "VisitaDeCampanha"
  ADD CONSTRAINT "VisitaDeCampanha_raffleId_fkey"
  FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
