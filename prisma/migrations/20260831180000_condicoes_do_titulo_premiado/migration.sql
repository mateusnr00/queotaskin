-- Condições para o número premiado pagar.
--
-- SEM PONTO DE SAÍDA EM PORCENTAGEM, e a diferença é do modelo, não um
-- esquecimento. O título premiado é amarrado a um NÚMERO: quem comprar o 120
-- leva, e não há bolo para sortear nem quando agendar. O número já é o
-- agendamento, e agendá-lo para 30% seria contraditório, porque o 120 pode ser
-- comprado no primeiro minuto ou nunca.
--
-- O que faz sentido é o outro eixo: para QUAL COMPRA ele paga. É o caso do
-- disparo com hora marcada.
--
-- Todos nulos, que é como toda linha existente nasce, é o comportamento de
-- sempre: comprou o número, ganhou. Nenhuma campanha em andamento muda.
ALTER TABLE "AwardedTicket"
  ADD COLUMN "saidaTitulosDe"  INTEGER,
  ADD COLUMN "saidaTitulosAte" INTEGER,
  ADD COLUMN "saidaDataDe"     TIMESTAMP(3),
  ADD COLUMN "saidaDataAte"    TIMESTAMP(3),
  ADD COLUMN "saidaDdds"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
