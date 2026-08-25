-- Adiciona personalização da página inicial pública.
-- Strings vazias = esconder o cabeçalho da seção.
-- Ganhadores ficam escondidos por padrão.

ALTER TABLE "SiteSettings"
  ADD COLUMN "homeCampaignsTitle" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "homeCampaignsCaption" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "showWinnersOnHome" BOOLEAN NOT NULL DEFAULT false;
