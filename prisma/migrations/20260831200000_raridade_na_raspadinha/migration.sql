-- A raridade da skin no prêmio da raspadinha, como na caixa surpresa.
--
-- O cadastro deixou de ter seletor de Pix ou skin: o prêmio é o que se digita,
-- e pode ser uma peça de computador. A classificação passa a sair do NOME,
-- conferido contra o catálogo do tenant, que é como a caixa já faz.
--
-- Nula é o normal: prêmio que não é skin simplesmente não casa e fica sem cor.
ALTER TABLE "RaspadinhaPremio" ADD COLUMN "skinRarity" "SkinRarity";
