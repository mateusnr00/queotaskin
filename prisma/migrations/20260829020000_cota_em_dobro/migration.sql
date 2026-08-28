-- Cota em dobro: janela da promocao e a marca na reserva.
--
-- A marca fica na reserva porque a promocao acaba. Sem ela, uma reserva feita
-- durante a janela seria reconstruida com metade dos numeros caso o webhook do
-- pagamento chegasse depois do fim da promocao.
ALTER TABLE "Raffle" ADD COLUMN IF NOT EXISTS "promotionsDoubleFrom" TIMESTAMP(3);
ALTER TABLE "Raffle" ADD COLUMN IF NOT EXISTS "promotionsDoubleUntil" TIMESTAMP(3);
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "dobroAplicado" BOOLEAN NOT NULL DEFAULT false;
