-- O CRONOGRAMA DE SORTEIOS: uma fila por painel.
--
-- Nada aqui altera o motor do sorteio nem o ciclo de vida da campanha. Sao
-- duas tabelas novas, um valor novo no enum de status e um indice parcial que
-- e a garantia de verdade contra ativacao dupla.

-- QUEUED entra DEPOIS de DRAFT, e a posicao importa: a lista do painel ordena
-- por status usando a ordem do enum no banco, entao a fila precisa aparecer no
-- topo, junto do que ainda pede trabalho, e nao depois de CANCELLED.
--
-- Nenhuma linha existente muda de status: campanha que hoje e DRAFT continua
-- DRAFT ate alguem colocar na fila pelo painel.
ALTER TYPE "RaffleStatus" ADD VALUE IF NOT EXISTS 'QUEUED' AFTER 'DRAFT';

CREATE TYPE "ScheduleItemStatus" AS ENUM (
  'AGUARDANDO',
  'ATIVO',
  'CONCLUIDO',
  'PULADO',
  'REMOVIDO',
  'FALHOU'
);

CREATE TABLE "DrawSchedule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "automacaoAtiva" BOOLEAN NOT NULL DEFAULT true,
  "atrasoEmSegundos" INTEGER NOT NULL DEFAULT 0,
  "ultimoErro" TEXT,
  "ultimoErroEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DrawSchedule_pkey" PRIMARY KEY ("id")
);

-- Uma fila por painel. Com duas, "qual e o proximo?" teria duas respostas.
CREATE UNIQUE INDEX "DrawSchedule_tenantId_key" ON "DrawSchedule"("tenantId");

ALTER TABLE "DrawSchedule"
  ADD CONSTRAINT "DrawSchedule_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DrawScheduleItem" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "raffleId" TEXT NOT NULL,
  "status" "ScheduleItemStatus" NOT NULL DEFAULT 'AGUARDANDO',
  "posicao" INTEGER NOT NULL DEFAULT 0,
  "dia" DATE,
  "ativadoEm" TIMESTAMP(3),
  "concluidoEm" TIMESTAMP(3),
  "puladoEm" TIMESTAMP(3),
  "removidoEm" TIMESTAMP(3),
  "ativadoPor" TEXT,
  "erro" TEXT,
  "criadoPorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DrawScheduleItem_pkey" PRIMARY KEY ("id")
);

-- Uma campanha ocupa no maximo uma linha da fila.
CREATE UNIQUE INDEX "DrawScheduleItem_raffleId_key" ON "DrawScheduleItem"("raffleId");
CREATE INDEX "DrawScheduleItem_scheduleId_status_posicao_idx"
  ON "DrawScheduleItem"("scheduleId", "status", "posicao");

ALTER TABLE "DrawScheduleItem"
  ADD CONSTRAINT "DrawScheduleItem_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "DrawSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DrawScheduleItem"
  ADD CONSTRAINT "DrawScheduleItem_raffleId_fkey"
  FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A GARANTIA CONTRA ATIVACAO DUPLA.
--
-- Um item ATIVO por fila, cobrado pelo Postgres. Nao e enfeite: dois workers
-- terminando sorteios no mesmo segundo, um webhook reentregue e o admin
-- clicando "ativar agora" ao mesmo tempo passariam todos por um "if (jaTem)
-- return" em JavaScript, porque entre o SELECT e o UPDATE cabe a outra
-- transacao inteira. Aqui a segunda transacao morre com violacao de chave, que
-- e exatamente o que se quer: uma ativacao so, e a outra desiste em silencio.
--
-- Indice PARCIAL de proposito: concluidos, pulados e removidos podem se
-- repetir a vontade, e so o estado ATIVO e exclusivo.
CREATE UNIQUE INDEX "DrawScheduleItem_um_ativo_por_fila"
  ON "DrawScheduleItem"("scheduleId")
  WHERE "status" = 'ATIVO';
