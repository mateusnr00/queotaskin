-- Quanto custou comprar a skin do fornecedor para entregar ao ganhador.
--
-- É o custo REAL da premiação, e não sai de nenhum outro dado: o preço da cota
-- é receita, o valor de mercado da skin é estimativa, e o que saiu do caixa só
-- quem comprou sabe.
--
-- Decimal(10,2), e não double: dinheiro em ponto flutuante acumula erro de
-- centavo, e a soma da coluna é justamente o número que interessa.
ALTER TABLE "Raffle" ADD COLUMN "deliveryCost" DECIMAL(10,2);
