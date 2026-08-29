-- Campanha nova nasce com números aleatórios, não com escolha manual.
--
-- Só o DEFAULT da coluna muda. Campanha que já existe mantém o modelo que foi
-- escolhido para ela: DEFAULT vale para linha nova, nunca reescreve linha
-- antiga, e mudar o modelo de uma campanha em venda trocaria a regra no meio
-- do jogo para quem já comprou.
ALTER TABLE "Raffle" ALTER COLUMN "reservationModel" SET DEFAULT 'RANDOM_NUMBERS';
