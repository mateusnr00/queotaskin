-- Configurações da aba "Experiência do Usuário" no painel admin (per-tenant).
-- Controla comportamento global da UI pública: afiliados, ranking, share,
-- privacidade do comprador, carrossel, exibição de preços nos cards, etc.

ALTER TABLE "Tenant"
  ADD COLUMN "affiliateCookieHours"       INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "rankingOrderBy"             TEXT    NOT NULL DEFAULT 'quantity',
  ADD COLUMN "rankingCacheMinutes"        INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "requireAddressOnSignup"     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "allowPublicAffiliate"       BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "shareButtonsGlobal"         BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "allowQuantityKeyboardInput" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "buyerPrivacy"               BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "carouselAutoPlay"           BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "showCardPrices"             BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "showAppButton"              BOOLEAN NOT NULL DEFAULT TRUE;
