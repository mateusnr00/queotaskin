-- Google Analytics 4 e pixel do TikTok, ao lado do pixel da Meta.
--
-- Nulo ou vazio desliga: sem id cadastrado nenhum script de terceiro entra na
-- página de quem compra. Rastreamento é escolha de quem opera, e não padrão do
-- produto.
ALTER TABLE "Tenant" ADD COLUMN "googleAnalyticsId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "tiktokPixelId" TEXT;
