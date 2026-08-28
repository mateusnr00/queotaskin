-- A arte de campanha de cada skin, por desgaste.
--
-- É diferente da foto da skin. A foto é o render do jogo e serve para mostrar
-- o item em "Ver as skins premiadas". A arte é feita à mão, tem logo, fundo e
-- o nome escrito, e é ela que vira a capa do sorteio quando a skin é escolhida
-- no catálogo.
--
-- Presa ao desgaste porque a arte traz o desgaste escrito nela: a de
-- "AK-47 | Redline (Field Tested)" não serve para a Minimal Wear.
CREATE TABLE "SkinArt" (
  "id"             TEXT NOT NULL,
  "skinTemplateId" TEXT NOT NULL,
  "wear"           "SkinWear",
  "url"            TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SkinArt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SkinArt_skinTemplateId_idx" ON "SkinArt"("skinTemplateId");

CREATE UNIQUE INDEX "SkinArt_skinTemplateId_wear_key"
  ON "SkinArt"("skinTemplateId", "wear");

-- Em Postgres NULL não é igual a NULL, então o índice acima deixaria cadastrar
-- duas artes genéricas para a mesma skin. Este cobre esse caso.
CREATE UNIQUE INDEX "SkinArt_uma_generica_por_skin"
  ON "SkinArt"("skinTemplateId") WHERE "wear" IS NULL;

ALTER TABLE "SkinArt"
  ADD CONSTRAINT "SkinArt_skinTemplateId_fkey"
  FOREIGN KEY ("skinTemplateId") REFERENCES "SkinTemplate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
