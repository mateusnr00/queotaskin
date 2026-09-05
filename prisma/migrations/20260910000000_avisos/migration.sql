-- Aviso/promoção em imagem (pop-up de restaurante): imagem clicável com "X"
-- para fechar, ligada por tenant. Tudo opcional e desligado por padrão, então
-- a migration não muda o comportamento de nenhum site já existente.
ALTER TABLE "Tenant" ADD COLUMN "avisoAtivo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "avisoImagemUrl" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "avisoAspecto" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "avisoLinkUrl" TEXT;
