-- Som da transmissão do sorteio, configurável por tenant.
--
-- A transmissão já tinha som, sintetizado por oscilador. O que faltava era o
-- painel poder trocar cada momento por um arquivo próprio (vinheta, aplauso,
-- trilha de suspense) e poder desligar tudo. Colunas nulas mantêm o
-- comportamento atual: sem arquivo, toca o som sintetizado de sempre.
ALTER TABLE "Tenant"
  ADD COLUMN "somDoSorteioAtivo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "somContagemUrl" TEXT,
  ADD COLUMN "somContagemFinalUrl" TEXT,
  ADD COLUMN "somRolagemUrl" TEXT,
  ADD COLUMN "somRevelacaoUrl" TEXT;
