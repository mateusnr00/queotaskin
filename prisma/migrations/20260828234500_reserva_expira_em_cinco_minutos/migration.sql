-- Reserva pendente de sorteio novo passa a expirar em 5 minutos, e nao em 15.
--
-- Numero preso em reserva e numero que ninguem mais pode comprar. Quinze
-- minutos de espera por um Pix que costuma ser pago em menos de um sao doze
-- minutos de estoque parado por desistencia.
--
-- Muda so o padrao de linhas novas. Sorteio existente mantem o tempo que ja
-- tem, e continua editavel na aba Titulos.
ALTER TABLE "Raffle" ALTER COLUMN "reservationTimeoutMinutes" SET DEFAULT 5;
