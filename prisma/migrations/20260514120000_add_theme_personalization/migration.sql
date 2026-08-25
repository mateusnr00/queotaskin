-- Adiciona campos de personalização de tema na SiteSettings:
--   themePreset  → chave do preset de cor (default 'orange')
--   headerAccent → header do site na cor do preset (default false)
--   cardColor    → cor dos cards de seleção (default 'black')
-- Também muda o default do primaryColor pra um laranja consistente
-- com o preset 'orange' (não afeta linhas existentes).

ALTER TABLE "SiteSettings"
  ADD COLUMN "themePreset" TEXT NOT NULL DEFAULT 'orange',
  ADD COLUMN "headerAccent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cardColor" TEXT NOT NULL DEFAULT 'black';

ALTER TABLE "SiteSettings"
  ALTER COLUMN "primaryColor" SET DEFAULT '#fda92d';
