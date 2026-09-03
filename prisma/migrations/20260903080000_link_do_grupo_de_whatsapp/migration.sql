-- Convite do grupo de WhatsApp, por tenant.
--
-- Coluna nova e opcional: nenhuma linha existente muda, e o site segue igual
-- enquanto ninguém preencher. Link de grupo expira e é trocado de tempos em
-- tempos, então ele mora no banco e não em variável de ambiente: trocar não
-- pode exigir deploy.
ALTER TABLE "Tenant" ADD COLUMN "whatsappGroupUrl" TEXT;
