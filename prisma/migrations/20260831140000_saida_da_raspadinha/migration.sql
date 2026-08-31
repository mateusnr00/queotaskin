-- A mesma saída agendada da caixa surpresa, agora na raspadinha.
--
-- As duas mecânicas são iguais por baixo: um bolo de prêmios, sorteado no
-- instante em que a pessoa abre ou raspa. Ter agendamento em uma e não na
-- outra faria a mesma campanha se comportar de dois jeitos.
ALTER TABLE "RaspadinhaPremio"
  ADD COLUMN "tipoDeSaida"     "TipoDeSaida" NOT NULL DEFAULT 'PROGRESSO',
  ADD COLUMN "saidaEmTitulos"  INTEGER,
  ADD COLUMN "saidaTitulosDe"  INTEGER,
  ADD COLUMN "saidaTitulosAte" INTEGER,
  ADD COLUMN "saidaDataDe"     TIMESTAMP(3),
  ADD COLUMN "saidaDataAte"    TIMESTAMP(3),
  ADD COLUMN "saidaDdds"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Os prêmios que já existem ficam SEM ponto, e não com um inventado: sem ele
-- seguem saindo pelo sorteio de chance, exatamente como antes. Agendá-los
-- aqui mudaria o resultado de campanhas em andamento.
CREATE INDEX "RaspadinhaPremio_saida_idx"
  ON "RaspadinhaPremio" ("raffleId", "tipoDeSaida", "saidaEmTitulos");
