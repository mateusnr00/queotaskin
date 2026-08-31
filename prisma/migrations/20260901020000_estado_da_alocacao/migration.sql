-- O estado da decisão do prêmio vira explícito, e a raspadinha passa a decidir
-- na compra, como a caixa surpresa.
--
-- POR QUE UM ESTADO E NÃO MAIS UM NULO
--
-- `prizeId = null` significava três coisas ao mesmo tempo: "ainda não decidi",
-- "decidi e não deu prêmio" e "nasci antes de existir decisão na compra". Com
-- os três no mesmo valor, uma falha no meio da alocação fazia a unidade cair em
-- silêncio no caminho antigo e sortear na abertura, que é justamente o que se
-- quer eliminar.
--
-- O QUE ACONTECE COM O QUE JÁ EXISTE
--
-- Nada é redecidido. Caixa aberta e raspadinha raspada já têm resultado e ficam
-- como ALOCADA: o histórico não muda. Caixa fechada que já tinha sorteio
-- gravado (premioSorteadoEm preenchido) também é ALOCADA.
--
-- Caixa fechada sem sorteio e raspadinha ainda disponível ficam como LEGADO:
-- elas continuam resolvendo na abertura, exatamente como fariam hoje. A
-- alternativa era alocar todas agora, o que reservaria prêmios para bilhetes
-- que talvez nunca sejam raspados e tiraria esses prêmios do bolo de quem
-- compra amanhã. Preservar o comportamento delas altera menos do que
-- antecipar a decisão.

CREATE TYPE "EstadoDaAlocacao" AS ENUM ('LEGADO', 'PENDENTE', 'ALOCADA');

-- ---------------------------------------------------------------- CAIXA
ALTER TABLE "SurpriseBox"
  ADD COLUMN "alocacao" "EstadoDaAlocacao" NOT NULL DEFAULT 'PENDENTE',
  ADD COLUMN "vendidosAntes" INTEGER;

UPDATE "SurpriseBox"
   SET "alocacao" = 'ALOCADA'
 WHERE "premioSorteadoEm" IS NOT NULL OR "status" <> 'UNOPENED';

UPDATE "SurpriseBox"
   SET "alocacao" = 'LEGADO'
 WHERE "premioSorteadoEm" IS NULL AND "status" = 'UNOPENED';

-- ------------------------------------------------------------ RASPADINHA
ALTER TABLE "Raspadinha"
  ADD COLUMN "alocacao" "EstadoDaAlocacao" NOT NULL DEFAULT 'PENDENTE',
  ADD COLUMN "alocadoEm" TIMESTAMP(3),
  ADD COLUMN "vendidosAntes" INTEGER,
  ADD COLUMN "vendidosNaSaida" INTEGER;

UPDATE "Raspadinha"
   SET "alocacao" = 'ALOCADA', "alocadoEm" = "raspadaEm"
 WHERE "status" <> 'DISPONIVEL';

UPDATE "Raspadinha"
   SET "alocacao" = 'LEGADO'
 WHERE "status" = 'DISPONIVEL';

-- O índice serve à retomada: achar o que ficou PENDENTE por falha, sem varrer
-- a tabela inteira.
CREATE INDEX "SurpriseBox_reservationId_alocacao_idx"
  ON "SurpriseBox"("reservationId", "alocacao");
CREATE INDEX "Raspadinha_reservationId_alocacao_idx"
  ON "Raspadinha"("reservationId", "alocacao");
