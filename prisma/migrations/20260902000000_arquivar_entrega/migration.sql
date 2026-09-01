-- Tirar uma entrega da fila sem apagar o sorteio.
--
-- Nulo é entrega na fila. Com data, ela sai da tela de Entregas e só volta
-- pelo filtro "Removidas". O sorteio, o ganhador e o comprovante continuam
-- exatamente como estavam.
ALTER TABLE "Raffle" ADD COLUMN "entregaArquivadaEm" TIMESTAMP(3);
