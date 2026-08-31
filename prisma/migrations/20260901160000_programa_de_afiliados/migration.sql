-- Programa de afiliados: indicação, progresso e Entradas Grátis.
--
-- O motor de rifas já trazia Affiliate e AffiliateCommission, e as duas
-- estavam mortas: nenhuma linha de código lia qualquer uma delas. Affiliate
-- é aproveitada (já tem userId único, código único e o vínculo com
-- Reservation); AffiliateCommission fica onde está, sem uso, porque este
-- programa não paga comissão em dinheiro e apagar tabela é caminho sem volta.

CREATE TYPE "AffiliateStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'SUSPENDED');
CREATE TYPE "EstadoDaEntradaGratis" AS ENUM ('DISPONIVEL', 'RESERVADA', 'USADA');
CREATE TYPE "TipoDeMovimentoDeAfiliado" AS ENUM (
  'COMPRA_DE_INDICADO',
  'ENTRADA_LIBERADA',
  'ENTRADA_USADA',
  'ENTRADA_DEVOLVIDA',
  'ESTORNO_DE_COMPRA',
  'AJUSTE'
);

ALTER TABLE "Affiliate"
  ADD COLUMN "status" "AffiliateStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "progressoEmCentavos" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Affiliate_status_idx" ON "Affiliate"("status");

ALTER TABLE "User" ADD COLUMN "referredByAffiliateId" TEXT;
ALTER TABLE "User"
  ADD CONSTRAINT "User_referredByAffiliateId_fkey"
  FOREIGN KEY ("referredByAffiliateId") REFERENCES "Affiliate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "User_referredByAffiliateId_idx" ON "User"("referredByAffiliateId");

CREATE TABLE "EntradaGratis" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "estado" "EstadoDaEntradaGratis" NOT NULL DEFAULT 'DISPONIVEL',
  "raffleId" TEXT,
  "reservationId" TEXT,
  "ganhaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usadaEm" TIMESTAMP(3),
  CONSTRAINT "EntradaGratis_pkey" PRIMARY KEY ("id")
);

-- A regra "uma entrada por sorteio" mora aqui, e não num if do código:
-- entrada disponível tem raffleId nulo, e o Postgres aceita vários nulos numa
-- coluna unique. A restrição só passa a valer quando a entrada é reservada.
CREATE UNIQUE INDEX "EntradaGratis_affiliateId_raffleId_key"
  ON "EntradaGratis"("affiliateId", "raffleId");
CREATE INDEX "EntradaGratis_affiliateId_estado_idx"
  ON "EntradaGratis"("affiliateId", "estado");
CREATE INDEX "EntradaGratis_reservationId_idx" ON "EntradaGratis"("reservationId");

ALTER TABLE "EntradaGratis"
  ADD CONSTRAINT "EntradaGratis_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "EntradaGratis_raffleId_fkey"
  FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "EntradaGratis_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MovimentoDeAfiliado" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "tipo" "TipoDeMovimentoDeAfiliado" NOT NULL,
  "centavos" INTEGER NOT NULL DEFAULT 0,
  "entradas" INTEGER NOT NULL DEFAULT 0,
  "reservationId" TEXT,
  "indicadoId" TEXT,
  "raffleId" TEXT,
  "descricao" TEXT,
  "adminId" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MovimentoDeAfiliado_pkey" PRIMARY KEY ("id")
);

-- A trava contra crédito duplo de webhook reentregue. Duas entregas do mesmo
-- pagamento tentam gravar a mesma linha, e o banco recusa a segunda.
CREATE UNIQUE INDEX "MovimentoDeAfiliado_reservationId_tipo_key"
  ON "MovimentoDeAfiliado"("reservationId", "tipo");
CREATE INDEX "MovimentoDeAfiliado_affiliateId_criadoEm_idx"
  ON "MovimentoDeAfiliado"("affiliateId", "criadoEm");
CREATE INDEX "MovimentoDeAfiliado_indicadoId_idx" ON "MovimentoDeAfiliado"("indicadoId");

ALTER TABLE "MovimentoDeAfiliado"
  ADD CONSTRAINT "MovimentoDeAfiliado_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
