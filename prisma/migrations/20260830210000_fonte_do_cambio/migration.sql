-- De onde a taxa da entrega veio.
--
-- O PTAX é a primeira escolha, mas o Banco Central não publica toda moeda e
-- nem sempre está no ar. Quando ele não responde, a AwesomeAPI entra pelo
-- fechamento diário dela. As duas usam a ponta de venda, então o critério não
-- muda, só a origem.
--
-- Sem esta coluna a taxa seria um número sem procedência: não daria para
-- reconciliar o relatório com o boletim, nem para separar o que veio do oficial.
ALTER TABLE "Raffle" ADD COLUMN "deliveryFxSource" TEXT;
