-- Selo automático da campanha, por faixa de vendas.
--
-- O selo era digitado por campanha e ficava congelado: "Adquira já" continuava
-- lá com 95% vendido, e campanha esgotada seguia chamando para comprar número
-- que não existia mais.
--
-- Texto nulo cai no padrão do código. Os percentuais vêm com 50 e 80, que é o
-- que o dono pediu, mas ficam editáveis: campanha de 100 números tem outro
-- ritmo que campanha de 10 mil.
ALTER TABLE "Tenant"
  ADD COLUMN "halfwayText"       TEXT,
  ADD COLUMN "almostGoneText"    TEXT,
  ADD COLUMN "soldOutText"       TEXT,
  ADD COLUMN "halfwayPercent"    INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "almostGonePercent" INTEGER NOT NULL DEFAULT 80;
