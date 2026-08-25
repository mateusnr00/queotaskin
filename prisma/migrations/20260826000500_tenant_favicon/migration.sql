-- Ícone da aba do navegador, por tenant.
--
-- Fica separado de logoUrl porque os dois têm formatos incompatíveis: a logo
-- do cabeçalho é uma faixa larga com o nome escrito, e o favicon é lido a
-- 16px num quadrado. Usar a mesma imagem nos dois deixa a aba com um borrão.
--
-- Nulo cai na logo, que é melhor do que ícone genérico.
ALTER TABLE "Tenant" ADD COLUMN "faviconUrl" TEXT;
