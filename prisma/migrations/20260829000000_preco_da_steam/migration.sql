-- Preco da Steam por skin e desgaste.
CREATE TABLE "SkinPreco" (
    "id" TEXT NOT NULL,
    "skinTemplateId" TEXT NOT NULL,
    "wear" "SkinWear",
    "brl" DECIMAL(10,2) NOT NULL,
    "nomeConsultado" TEXT NOT NULL,
    "volume" INTEGER,
    "buscadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkinPreco_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SkinPreco_skinTemplateId_idx" ON "SkinPreco"("skinTemplateId");

-- Um preco por desgaste. Em Postgres NULL nao e igual a NULL, entao o unique
-- comum deixaria cadastrar varios precos "sem desgaste" para a mesma skin: o
-- indice parcial abaixo e o que fecha esse caso.
CREATE UNIQUE INDEX "SkinPreco_skinTemplateId_wear_key"
    ON "SkinPreco"("skinTemplateId", "wear") WHERE "wear" IS NOT NULL;
CREATE UNIQUE INDEX "SkinPreco_skinTemplateId_sem_wear_key"
    ON "SkinPreco"("skinTemplateId") WHERE "wear" IS NULL;

ALTER TABLE "SkinPreco" ADD CONSTRAINT "SkinPreco_skinTemplateId_fkey"
    FOREIGN KEY ("skinTemplateId") REFERENCES "SkinTemplate"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
