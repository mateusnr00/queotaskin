-- Adiciona tagline curta do site (exibida em meta description e headers).

ALTER TABLE "SiteSettings"
  ADD COLUMN "siteDescription" TEXT NOT NULL DEFAULT '';
