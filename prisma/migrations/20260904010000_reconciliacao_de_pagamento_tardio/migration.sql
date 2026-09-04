-- Estado seguro para "dinheiro recebido, entrega impossível" (pagamento
-- tardio em rifa encerrada ou sem cotas). Colunas aditivas e com default,
-- não quebram nada nem alteram linhas existentes.
ALTER TABLE "Reservation" ADD COLUMN "precisaReconciliacao" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Reservation" ADD COLUMN "motivoReconciliacao" TEXT;
