-- Um Cupom de Entrada por pessoa indicada, uma vez na vida.
--
-- A regra antiga era progressiva e por afiliado: uma coluna somava o dinheiro
-- de todos os indicados juntos e liberava um cupom a cada R$ 10. Dois
-- indicados gastando R$ 5 cada geravam cupom; um indicado gastando R$ 1.000
-- gerava cem. O progresso passa a ser individual, e o teto é um por pessoa.
--
-- NADA É APAGADO AQUI.
--
-- Cupom já concedido continua valendo, disponível, reservado ou usado. A
-- coluna de progresso geral fica onde está, zerada e sem leitor, porque
-- apagar coluna não tem volta e ela é a única testemunha do que cada afiliado
-- tinha acumulado na virada. O backfill abaixo é idempotente: rodar de novo
-- não cria linha repetida nem muda o que já existe.

CREATE TABLE "QualificacaoDeIndicado" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "indicadoId" TEXT NOT NULL,
  "pagoEmCentavos" INTEGER NOT NULL DEFAULT 0,
  "qualificadoEm" TIMESTAMP(3),
  "entradaId" TEXT,
  "revertidoEm" TIMESTAMP(3),
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QualificacaoDeIndicado_pkey" PRIMARY KEY ("id")
);

-- As duas travas da regra, no banco e não no código: uma qualificação por
-- pessoa indicada, e um cupom reclamado por no máximo uma qualificação.
CREATE UNIQUE INDEX "QualificacaoDeIndicado_indicadoId_key"
  ON "QualificacaoDeIndicado"("indicadoId");
CREATE UNIQUE INDEX "QualificacaoDeIndicado_entradaId_key"
  ON "QualificacaoDeIndicado"("entradaId");
CREATE INDEX "QualificacaoDeIndicado_affiliateId_qualificadoEm_idx"
  ON "QualificacaoDeIndicado"("affiliateId", "qualificadoEm");

ALTER TABLE "QualificacaoDeIndicado"
  ADD CONSTRAINT "QualificacaoDeIndicado_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "QualificacaoDeIndicado_indicadoId_fkey"
  FOREIGN KEY ("indicadoId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "QualificacaoDeIndicado_entradaId_fkey"
  FOREIGN KEY ("entradaId") REFERENCES "EntradaGratis"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- O valor de face do cupom. Guardado na linha, e não lido de uma constante:
-- mudar o valor do programa amanhã não pode reescrever o que já foi dado.
ALTER TABLE "EntradaGratis"
  ADD COLUMN "valorEmCentavos" INTEGER NOT NULL DEFAULT 1000;

ALTER TYPE "TipoDeMovimentoDeAfiliado" ADD VALUE 'QUALIFICACAO_REVERTIDA';

-- BACKFILL, sem destruir nada.
--
-- Uma qualificação para cada pessoa já indicada. Quem já gerou cupom pela
-- regra antiga nasce QUALIFICADA, com a data do primeiro cupom: assim ela
-- guarda o cupom que tem e nunca gera outro, que é exatamente a regra nova.
-- Quem ainda não gerou nasce em progresso, e o total é recalculado no
-- primeiro pagamento seguinte.
INSERT INTO "QualificacaoDeIndicado"
  ("id", "affiliateId", "indicadoId", "pagoEmCentavos", "qualificadoEm", "criadoEm", "atualizadoEm")
SELECT
  gen_random_uuid()::text,
  u."referredByAffiliateId",
  u."id",
  0,
  (SELECT MIN(m."criadoEm") FROM "MovimentoDeAfiliado" m
    WHERE m."indicadoId" = u."id" AND m."tipo" = 'ENTRADA_LIBERADA'),
  u."createdAt",
  CURRENT_TIMESTAMP
  FROM "User" u
 WHERE u."referredByAffiliateId" IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM "QualificacaoDeIndicado" q WHERE q."indicadoId" = u."id"
   );
