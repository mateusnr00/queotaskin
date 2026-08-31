-- QUANDO cada prêmio da caixa surpresa sai.
--
-- Antes o prêmio só era escolhido na hora da abertura, por chance ou uniforme
-- entre os disponíveis. Ninguém, nem quem cadastrou, sabia quando um prêmio ia
-- aparecer: um item grande podia sair na primeira caixa ou não sair nunca.
--
-- Agora cada prêmio nasce com um ponto de saída, medido em títulos vendidos, e
-- esse ponto é uma promessa: o prêmio vai para a PRIMEIRA caixa aberta a
-- partir dali. O painel mostra o ponto em porcentagem e deixa editar.
--
-- Em títulos e não em porcentagem: porcentagem é leitura, não dado. Guardada
-- como número, ela mudaria de significado no dia em que a campanha alterasse o
-- total de números, sem ninguém ter tocado no prêmio.
CREATE TYPE "TipoDeSaida" AS ENUM ('PROGRESSO', 'PERSONALIZADO');

ALTER TABLE "SurpriseBoxPrize"
  ADD COLUMN "tipoDeSaida"     "TipoDeSaida" NOT NULL DEFAULT 'PROGRESSO',
  ADD COLUMN "saidaEmTitulos"  INTEGER,
  ADD COLUMN "saidaTitulosDe"  INTEGER,
  ADD COLUMN "saidaTitulosAte" INTEGER,
  ADD COLUMN "saidaDataDe"     TIMESTAMP(3),
  ADD COLUMN "saidaDataAte"    TIMESTAMP(3),
  ADD COLUMN "saidaDdds"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Os prêmios que já existem ficam SEM ponto de saída, e não com um inventado.
-- Sem ponto, eles continuam saindo pelo sorteio de chance de sempre, que é
-- exatamente o comportamento que tinham antes desta migration. Agendá-los
-- automaticamente aqui mudaria o resultado de campanhas em andamento.

-- A busca do prêmio da vez pergunta "quais já venceram", em toda abertura.
CREATE INDEX "SurpriseBoxPrize_saida_idx"
  ON "SurpriseBoxPrize" ("raffleId", "tipoDeSaida", "saidaEmTitulos");
