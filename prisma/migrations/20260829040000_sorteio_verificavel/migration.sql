-- Sorteio verificavel: compromisso e revelacao.
--
-- O motor sorteava com crypto.randomInt. Honesto e imprevisivel, e sem
-- nenhuma forma de o participante conferir: o numero saia, a gente publicava,
-- e ele acreditava ou nao. Agora o sorteio e um HMAC-SHA256 sobre uma semente
-- comprometida ANTES da primeira venda, e qualquer pessoa refaz a conta.
--
-- A semente mora em tabela propria por seguranca: varios caminhos deste codigo
-- leem a linha inteira de Raffle e entregam para componente de cliente. Uma
-- coluna secreta ali iria para o navegador em silencio.

CREATE TABLE IF NOT EXISTS "DrawSeed" (
  "raffleId" TEXT NOT NULL,
  "serverSeed" TEXT NOT NULL,
  "serverSeedHash" TEXT NOT NULL,
  "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revealedAt" TIMESTAMP(3),
  CONSTRAINT "DrawSeed_pkey" PRIMARY KEY ("raffleId")
);

DO $$ BEGIN
  ALTER TABLE "DrawSeed"
    ADD CONSTRAINT "DrawSeed_raffleId_fkey"
    FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- A prova, no sorteio. snapshotHash sai: o SHA-256 do manifesto agora e o
-- clientSeed, que tem o mesmo papel (provar que a lista nao foi mexida) e
-- ainda participa do calculo do vencedor.
ALTER TABLE "Draw" ADD COLUMN IF NOT EXISTS "serverSeedHash" TEXT;
ALTER TABLE "Draw" ADD COLUMN IF NOT EXISTS "clientSeed" TEXT;
ALTER TABLE "Draw" ADD COLUMN IF NOT EXISTS "nonce" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Draw" ADD COLUMN IF NOT EXISTS "winnerIndex" INTEGER;
ALTER TABLE "Draw" ADD COLUMN IF NOT EXISTS "hmacHex" TEXT;
ALTER TABLE "Draw" DROP COLUMN IF EXISTS "snapshotHash";

ALTER TABLE "Draw" ALTER COLUMN "rngMethod" SET DEFAULT 'hmac-sha256 (compromisso e revelação)';
ALTER TABLE "Draw" ALTER COLUMN "drawVersion" SET DEFAULT 2;
