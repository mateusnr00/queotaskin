-- Quantos títulos estavam vendidos quando a caixa foi sorteada.
--
-- O painel mostra em que porcentagem cada prêmio estava PROGRAMADO para sair;
-- faltava a outra metade, em que porcentagem ele SAIU de verdade. Sem guardar
-- no momento do sorteio não há como saber depois: a venda continua andando, e
-- recalcular diria a porcentagem de hoje, não a daquele instante.
--
-- Nula nas caixas que já existem: elas foram sorteadas antes desta coluna, e
-- inventar um número para elas seria pior do que deixar em branco.
ALTER TABLE "SurpriseBox" ADD COLUMN "vendidosNaSaida" INTEGER;
