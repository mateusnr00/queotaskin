-- Toggle de visibilidade da seção de Prêmios + bloco de E-book entregue
-- após o pagamento (link de download que aparece no comprovante).

ALTER TABLE "Raffle"
  ADD COLUMN "prizesShow"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "ebookEnabled"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ebookTitle"      TEXT,
  ADD COLUMN "ebookText"       TEXT,
  ADD COLUMN "ebookUrl"        TEXT,
  ADD COLUMN "ebookButtonText" TEXT;
