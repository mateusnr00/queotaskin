-- A procedência do preço da skin, no prêmio.
--
-- `Prize.skinValueBrl` já guardava o valor de referência e continua sendo ele
-- que a página pública mostra como "Valor de mercado". O que faltava era saber
-- de ONDE aquele número veio: o nome exato consultado na Steam, a mediana ao
-- lado do menor anúncio, e quando a consulta aconteceu.
--
-- Tudo nulo por padrão. Prêmio antigo continua funcionando exatamente como
-- antes, com o valor digitado à mão e sem data de consulta, e nada precisa ser
-- migrado.

ALTER TABLE "Prize" ADD COLUMN IF NOT EXISTS "steamMarketHashName" TEXT;
ALTER TABLE "Prize" ADD COLUMN IF NOT EXISTS "steamMedianPriceBrl" DECIMAL(10,2);
ALTER TABLE "Prize" ADD COLUMN IF NOT EXISTS "steamPriceUpdatedAt" TIMESTAMP(3);
