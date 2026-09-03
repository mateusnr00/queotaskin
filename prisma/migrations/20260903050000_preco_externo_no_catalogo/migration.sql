-- A procedência do preço vai para o CATÁLOGO, com nome neutro de fonte.
--
-- A migration anterior colocou três colunas "steam*" no Prize. Duas coisas
-- estavam erradas nisso:
--
-- 1. O LUGAR. A consulta acontece sobre a skin do catálogo, e é o catálogo que
--    alimenta o formulário. O prêmio é a CÓPIA CONGELADA do que o catálogo
--    dizia no instante da criação, e continua sendo só isso: `skinValueBrl`.
--    Guardar a procedência nos dois lugares criaria duas fontes de verdade
--    sobre o mesmo número.
--
-- 2. O NOME. A arquitetura é multi-provider: a Steam é uma fonte entre outras
--    possíveis, e é a que já falhou uma vez neste projeto. Coluna chamada
--    "steam*" vira mentira no dia em que a fonte mudar.
--
-- As colunas do Prize estavam TODAS nulas em produção (5 prêmios, nenhum com
-- valor), então nada se perde ao removê-las.

ALTER TABLE "Prize" DROP COLUMN IF EXISTS "steamMarketHashName";
ALTER TABLE "Prize" DROP COLUMN IF EXISTS "steamMedianPriceBrl";
ALTER TABLE "Prize" DROP COLUMN IF EXISTS "steamPriceUpdatedAt";

ALTER TABLE "SkinTemplate" ADD COLUMN IF NOT EXISTS "marketHashName" TEXT;
ALTER TABLE "SkinTemplate" ADD COLUMN IF NOT EXISTS "priceProvider" TEXT;
ALTER TABLE "SkinTemplate" ADD COLUMN IF NOT EXISTS "externalMedianPriceBrl" DECIMAL(10,2);
ALTER TABLE "SkinTemplate" ADD COLUMN IF NOT EXISTS "externalPriceUpdatedAt" TIMESTAMP(3);
