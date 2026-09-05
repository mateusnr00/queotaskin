-- Escurecimento do fundo do pop-up de aviso (0 a 90 = opacidade da camada preta
-- sobre o site, em %). Default 70, que é o valor que já estava fixo no código,
-- então nada muda para quem não regular.
ALTER TABLE "Tenant" ADD COLUMN "avisoFundoOpacidade" INTEGER NOT NULL DEFAULT 70;
