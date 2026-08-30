-- A entrega deixa de ser "saiu ou não saiu".
--
-- Era um booleano disfarçado, `deliveredAt` nulo ou preenchido, e a fila tem
-- mais do que dois estados: skin que precisa sair na frente, compra que deu
-- errado, envio que precisa ser refeito, e prêmio pago em dinheiro.
CREATE TYPE "DeliveryStatus" AS ENUM ('PRIORIDADE', 'AGUARDANDO', 'ENVIADO', 'ERRO', 'REENVIO', 'PIX');

ALTER TABLE "Raffle"
  ADD COLUMN "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'AGUARDANDO';

-- O que já estava marcado como entregue vira ENVIADO. Sem isto, todo trabalho
-- já feito voltaria para a fila como se ninguém tivesse enviado nada.
UPDATE "Raffle" SET "deliveryStatus" = 'ENVIADO' WHERE "deliveredAt" IS NOT NULL;

-- A fila é lida por status. Sem índice, é varredura da tabela a cada abertura.
CREATE INDEX "Raffle_deliveryStatus_idx" ON "Raffle"("deliveryStatus");
