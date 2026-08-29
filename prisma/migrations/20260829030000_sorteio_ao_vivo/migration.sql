-- Sorteio ao vivo: cronograma, resultado e prova.
--
-- O resultado deixou de ser digitado no painel e passou a ser decidido pelo
-- sistema. Esta tabela guarda as tres coisas que isso exige e que nao existiam
-- em lugar nenhum: quando cada fase acontece, qual foi o numero e de quem, e a
-- prova de que o universo sorteado nao foi mexido no caminho.
--
-- O cronograma inteiro e gravado no instante do encerramento. E por isso que a
-- transmissao sobrevive a um restart: o estado nao mora na memoria de ninguem,
-- e qualquer processo que acorde depois consegue reconstruir onde o sorteio
-- esta olhando so para os carimbos de tempo.

DO $$ BEGIN
  CREATE TYPE "DrawStatus" AS ENUM (
    'WAITING_DRAW', 'COUNTDOWN', 'DRAWING', 'REVEALING', 'FINISHED', 'ERROR'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Draw" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "raffleId" TEXT NOT NULL,
  "status" "DrawStatus" NOT NULL DEFAULT 'WAITING_DRAW',

  "raffleEndedAt" TIMESTAMP(3) NOT NULL,
  "drawScheduledAt" TIMESTAMP(3) NOT NULL,
  "drawStartsAt" TIMESTAMP(3) NOT NULL,
  "revealAt" TIMESTAMP(3) NOT NULL,
  "winnerRevealAt" TIMESTAMP(3) NOT NULL,

  "countdownStartedAt" TIMESTAMP(3),
  "drawExecutedAt" TIMESTAMP(3),
  "winnerRevealedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),

  "winningNumber" INTEGER,
  "winnerTicketId" TEXT,
  "winnerUserId" TEXT,
  "winnerName" TEXT,

  "eligibleTicketCount" INTEGER NOT NULL DEFAULT 0,
  "rngMethod" TEXT NOT NULL DEFAULT 'node:crypto.randomInt',
  "snapshotHash" TEXT,
  "drawVersion" INTEGER NOT NULL DEFAULT 1,

  "errorReason" TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Draw_pkey" PRIMARY KEY ("id")
);

-- Um sorteio oficial por campanha. Esta e a trava que decide a corrida entre
-- dois workers que acordem no mesmo minuto: os dois montam a linha, so um
-- consegue grava-la, e o outro leva erro de chave duplicada em vez de criar um
-- segundo sorteio para o mesmo premio.
CREATE UNIQUE INDEX IF NOT EXISTS "Draw_raffleId_key" ON "Draw"("raffleId");
CREATE UNIQUE INDEX IF NOT EXISTS "Draw_publicId_key" ON "Draw"("publicId");

-- "O que esta pendente e ja passou da hora": as duas perguntas do worker.
CREATE INDEX IF NOT EXISTS "Draw_status_drawScheduledAt_idx" ON "Draw"("status", "drawScheduledAt");
CREATE INDEX IF NOT EXISTS "Draw_status_drawStartsAt_idx" ON "Draw"("status", "drawStartsAt");

DO $$ BEGIN
  ALTER TABLE "Draw"
    ADD CONSTRAINT "Draw_raffleId_fkey"
    FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- O numero sorteado so pode existir junto com a hora em que foi sorteado. Sem
-- isto, um update pela metade deixaria um resultado sem carimbo, que e um
-- resultado sem prova de quando foi decidido.
DO $$ BEGIN
  ALTER TABLE "Draw"
    ADD CONSTRAINT "Draw_resultado_completo"
    CHECK (("winningNumber" IS NULL) = ("drawExecutedAt" IS NULL));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- O cronograma nao pode andar para tras.
DO $$ BEGIN
  ALTER TABLE "Draw"
    ADD CONSTRAINT "Draw_cronograma_em_ordem"
    CHECK (
      "drawScheduledAt" >= "raffleEndedAt"
      AND "drawStartsAt" > "drawScheduledAt"
      AND "revealAt" > "drawStartsAt"
      AND "winnerRevealAt" >= "revealAt"
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
