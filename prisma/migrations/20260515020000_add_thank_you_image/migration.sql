-- Imagem opcional exibida na tela "Pagamento confirmado" como agradecimento.
-- Admin define via /admin/configuracoes → Experiência do Usuário.

ALTER TABLE "SiteSettings"
  ADD COLUMN "thankYouImageUrl" TEXT;
