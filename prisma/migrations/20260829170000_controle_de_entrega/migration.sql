-- Controle de entrega na fila de /admin/entregas.
--
-- A tela já listava ganhador, prêmio e link de troca, mas nada dizia o que já
-- tinha saído: campanha sorteada há um mês ficava do lado da de ontem, e quem
-- operava precisava lembrar de cor.
--
-- Três colunas nulas, sem enum: ou a entrega saiu, e existe uma data, ou não
-- saiu. Toda campanha existente nasce como pendente, que é a verdade sobre
-- elas: ninguém marcou nada ainda.
ALTER TABLE "Raffle" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Raffle" ADD COLUMN "deliveredById" TEXT;
ALTER TABLE "Raffle" ADD COLUMN "deliveryNote" TEXT;

-- A fila é lida por "pendentes primeiro". Sem índice, isso é varredura na
-- tabela inteira a cada abertura da tela.
CREATE INDEX "Raffle_deliveredAt_idx" ON "Raffle"("deliveredAt");
