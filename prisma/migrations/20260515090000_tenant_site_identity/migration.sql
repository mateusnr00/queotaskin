-- Move a identidade visual e os textos do site do `SiteSettings` global
-- (singleton) para cada `Tenant`, antes André editar Configurações
-- sobrescrevia o painel do Mateus, e vice-versa.
--
-- Backfill: copia os valores atuais do SiteSettings (que estavam sendo
-- compartilhados entre todos os tenants) pra cada Tenant existente. Assim,
-- depois da migration, ambos veem exatamente o que viam antes. A partir
-- desse ponto, cada um edita independente.

ALTER TABLE "Tenant"
  ADD COLUMN "logoUrl"              TEXT,
  ADD COLUMN "siteDescription"      TEXT,
  ADD COLUMN "supportPhone"         TEXT,
  ADD COLUMN "supportEmail"         TEXT,
  ADD COLUMN "homeCampaignsTitle"   TEXT,
  ADD COLUMN "homeCampaignsCaption" TEXT,
  ADD COLUMN "showWinnersOnHome"    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN "themeMode"            "ThemeMode" NOT NULL DEFAULT 'LIGHT',
  ADD COLUMN "themePreset"          TEXT        NOT NULL DEFAULT 'orange',
  ADD COLUMN "headerAccent"         BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN "cardColor"            TEXT        NOT NULL DEFAULT 'black',
  ADD COLUMN "termsOfUse"           TEXT,
  ADD COLUMN "privacyPolicy"        TEXT,
  ADD COLUMN "aboutUs"              TEXT;

UPDATE "Tenant" t
   SET "logoUrl"              = COALESCE(t."logoUrl",              s."logoUrl"),
       "siteDescription"      = COALESCE(t."siteDescription",      s."siteDescription"),
       "supportPhone"         = COALESCE(t."supportPhone",         s."supportPhone"),
       "supportEmail"         = COALESCE(t."supportEmail",         s."supportEmail"),
       "homeCampaignsTitle"   = COALESCE(t."homeCampaignsTitle",   s."homeCampaignsTitle"),
       "homeCampaignsCaption" = COALESCE(t."homeCampaignsCaption", s."homeCampaignsCaption"),
       "showWinnersOnHome"    = COALESCE(s."showWinnersOnHome",    t."showWinnersOnHome"),
       "themeMode"            = COALESCE(s."themeMode",            t."themeMode"),
       "themePreset"          = COALESCE(s."themePreset",          t."themePreset"),
       "headerAccent"         = COALESCE(s."headerAccent",         t."headerAccent"),
       "cardColor"            = COALESCE(s."cardColor",            t."cardColor"),
       "termsOfUse"           = COALESCE(t."termsOfUse",           s."termsOfUse"),
       "privacyPolicy"        = COALESCE(t."privacyPolicy",        s."privacyPolicy"),
       "aboutUs"              = COALESCE(t."aboutUs",              s."aboutUs")
  FROM "SiteSettings" s
 WHERE s."id" = 'singleton';
