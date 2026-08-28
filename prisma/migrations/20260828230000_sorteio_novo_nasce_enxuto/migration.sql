-- Sorteio novo nasce sem Titulos Premiados e sem Promocoes.
--
-- As duas secoes nasciam ligadas, entao todo sorteio novo ja aparecia para o
-- publico com uma lista de premios vazia e uma area de promocoes que ninguem
-- tinha configurado. Quem quiser liga na aba, que e onde a decisao pertence.
--
-- Isto muda SO o padrao de linhas novas. Nenhum sorteio existente e tocado:
-- ALTER COLUMN SET DEFAULT nao reescreve dado nenhum.
ALTER TABLE "Raffle" ALTER COLUMN "awardedTicketsEnabled" SET DEFAULT false;
ALTER TABLE "Raffle" ALTER COLUMN "awardedTicketsShowList" SET DEFAULT false;
ALTER TABLE "Raffle" ALTER COLUMN "awardedTicketsLoserShow" SET DEFAULT false;
ALTER TABLE "Raffle" ALTER COLUMN "promotionsEnabled" SET DEFAULT false;
