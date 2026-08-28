-- Raspadinha Premiada.
--
-- Espelha a Caixa Surpresa de propósito. As duas são "o comprador ganhou N
-- tentativas e cada uma pode ter prêmio"; o que muda é a experiência, não a
-- regra. Copiar a forma faz o sorteio, a atomicidade e a checagem de dono se
-- comportarem igual nos dois, em vez de duas invenções com bugs diferentes.
CREATE TYPE "RaspadinhaStatus" AS ENUM ('DISPONIVEL', 'PREMIADA', 'SEM_PREMIO');
CREATE TYPE "TipoDePremioDaRaspadinha" AS ENUM ('PIX', 'SKIN');

ALTER TABLE "Raffle" ADD COLUMN "raspadinhaEnabled"     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Raffle" ADD COLUMN "raspadinhaRasparTodas" BOOLEAN NOT NULL DEFAULT false;

-- claimedAt é a trava de unicidade: o mesmo prêmio nunca sai duas vezes,
-- porque quem revela primeiro o marca dentro da mesma transação.
CREATE TABLE "RaspadinhaPremio" (
  "id"        TEXT NOT NULL,
  "raffleId"  TEXT NOT NULL,
  "tipo"      "TipoDePremioDaRaspadinha" NOT NULL DEFAULT 'PIX',
  "rotulo"    TEXT NOT NULL,
  "valor"     DECIMAL(10,2),
  "chance"    DECIMAL(5,2),
  "travado"   BOOLEAN NOT NULL DEFAULT false,
  "claimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RaspadinhaPremio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RaspadinhaPremio_raffleId_idx" ON "RaspadinhaPremio"("raffleId");
CREATE INDEX "RaspadinhaPremio_raffleId_travado_claimedAt_idx"
  ON "RaspadinhaPremio"("raffleId", "travado", "claimedAt");

CREATE TABLE "RaspadinhaCombo" (
  "id"         TEXT NOT NULL,
  "raffleId"   TEXT NOT NULL,
  "minimo"     INTEGER NOT NULL,
  "quantidade" INTEGER NOT NULL,
  "visivel"    BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "RaspadinhaCombo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RaspadinhaCombo_raffleId_minimo_key" ON "RaspadinhaCombo"("raffleId", "minimo");
CREATE INDEX "RaspadinhaCombo_raffleId_idx" ON "RaspadinhaCombo"("raffleId");

-- numero é o que fica impresso no bilhete, sequencial por sorteio. É
-- identidade visual, não chave: quem manda é o id.
CREATE TABLE "Raspadinha" (
  "id"            TEXT NOT NULL,
  "raffleId"      TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "status"        "RaspadinhaStatus" NOT NULL DEFAULT 'DISPONIVEL',
  "numero"        INTEGER NOT NULL,
  "premioId"      TEXT,
  "raspadaEm"     TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Raspadinha_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Raspadinha_premioId_key" ON "Raspadinha"("premioId");
CREATE UNIQUE INDEX "Raspadinha_raffleId_numero_key" ON "Raspadinha"("raffleId", "numero");
CREATE INDEX "Raspadinha_reservationId_idx" ON "Raspadinha"("reservationId");
CREATE INDEX "Raspadinha_raffleId_status_idx" ON "Raspadinha"("raffleId", "status");

ALTER TABLE "RaspadinhaPremio" ADD CONSTRAINT "RaspadinhaPremio_raffleId_fkey"
  FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaspadinhaCombo" ADD CONSTRAINT "RaspadinhaCombo_raffleId_fkey"
  FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Raspadinha" ADD CONSTRAINT "Raspadinha_raffleId_fkey"
  FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Raspadinha" ADD CONSTRAINT "Raspadinha_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Raspadinha" ADD CONSTRAINT "Raspadinha_premioId_fkey"
  FOREIGN KEY ("premioId") REFERENCES "RaspadinhaPremio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
