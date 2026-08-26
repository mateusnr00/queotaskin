-- Catálogo de skins do tenant.
--
-- Abrir campanha da mesma faca duas vezes obrigava a redigitar raridade,
-- desgaste, float, coleção e valor, e a reenviar a mesma imagem. A skin passa
-- a ser cadastrada uma vez e reaproveitada.
CREATE TABLE "SkinTemplate" (
  "id"             TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "imageUrl"       TEXT,
  "skinRarity"     "SkinRarity",
  "skinWear"       "SkinWear",
  "skinFloat"      DOUBLE PRECISION,
  "skinStatTrak"   BOOLEAN NOT NULL DEFAULT false,
  "skinSouvenir"   BOOLEAN NOT NULL DEFAULT false,
  "skinValueBrl"   DECIMAL(10,2),
  "skinCollection" TEXT,
  "skinInspectUrl" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SkinTemplate_pkey" PRIMARY KEY ("id")
);

-- Nome único por tenant: a mesma skin duas vezes só cria dúvida na escolha.
CREATE UNIQUE INDEX "SkinTemplate_tenantId_name_key" ON "SkinTemplate"("tenantId", "name");
CREATE INDEX "SkinTemplate_tenantId_idx" ON "SkinTemplate"("tenantId");

ALTER TABLE "SkinTemplate"
  ADD CONSTRAINT "SkinTemplate_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
