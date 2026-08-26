-- Formato da logo no cabeçalho, escolhido por quem envia a imagem.
--
-- O header recortava toda logo num quadrado com object-cover. Isso destrói
-- marca em faixa: "SKINS LENDÁRIAS" vira um pedaço do meio. E object-contain
-- para todo mundo deixaria um emblema redondo flutuando numa caixa larga.
-- Não dá para inferir da imagem qual é o caso, quem a envia sabe.
--
-- RECTANGLE é o padrão por ser o não destrutivo: encaixa a imagem inteira
-- seja qual for a proporção.
CREATE TYPE "LogoShape" AS ENUM ('ROUND', 'RECTANGLE');

ALTER TABLE "Tenant"
  ADD COLUMN "logoShape" "LogoShape" NOT NULL DEFAULT 'RECTANGLE';
