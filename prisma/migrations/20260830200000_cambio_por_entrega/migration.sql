-- O câmbio deixa de ser um número só do painel e passa a viver em cada entrega.
--
-- Antes havia uma taxa em Tenant, aplicada a TODO custo de TODA entrega. Isso
-- fazia o relatório mentir de um jeito silencioso: atualizar a taxa
-- reconvertia o gasto de julho pelo câmbio de hoje, e o mês já fechado mudava
-- de valor sem ninguém ter mexido nele.
--
-- Agora cada entrega guarda o PTAX de venda do dia em que ela saiu, mais o dia
-- do boletim que o gerou. A taxa do painel continua existindo como rede de
-- segurança, para as linhas sem boletim próprio e para o dia em que o Olinda
-- estiver fora do ar.
--
-- Nulo em ambas é o estado normal de quem ainda não tem custo anotado. O
-- preenchimento das entregas antigas é feito por scripts/backfill-cambio.mjs,
-- que busca o boletim da data de cada uma; migration não é lugar de ir à rede.
ALTER TABLE "Raffle" ADD COLUMN "deliveryFxRate" DECIMAL(12,6);
ALTER TABLE "Raffle" ADD COLUMN "deliveryFxDate" TIMESTAMP(3);
