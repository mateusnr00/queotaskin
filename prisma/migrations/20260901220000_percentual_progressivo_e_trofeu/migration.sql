-- Duas coisas independentes, na mesma migration porque vão no mesmo deploy.
--
-- 1. O percentual progressivo do afiliado. O modo padrão continua sendo o de
--    valor fixo, então nada muda para quem já está configurado: só quem for
--    posto no modo novo passa a ter o cupom dimensionado pelo gasto de cada
--    indicado.
--
-- 2. A imagem do troféu da campanha, opcional. Nula não desenha nada.

CREATE TYPE "ModoDeRecompensa" AS ENUM ('VALOR_FIXO', 'PERCENTUAL_PROGRESSIVO');

ALTER TABLE "Affiliate"
  ADD COLUMN "modoDeRecompensa" "ModoDeRecompensa" NOT NULL DEFAULT 'VALOR_FIXO',
  -- A cada R$ 100 gastos por um indicado, +2 pontos percentuais.
  ADD COLUMN "degrauEmCentavos" INTEGER NOT NULL DEFAULT 10000,
  ADD COLUMN "bpsPorDegrau" INTEGER NOT NULL DEFAULT 200;

ALTER TABLE "Raffle" ADD COLUMN "trofeuUrl" TEXT;
