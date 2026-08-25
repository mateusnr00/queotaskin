-- Ficha técnica da skin (raridade, float, coleção, valor) passa a ser
-- opcional por campanha.
--
-- Ela ocupa meia tela no mobile, que é de onde vem a maior parte do tráfego.
-- Para a maioria das campanhas o comprador quer o preço e o botão; a ficha
-- interessa nas skins caras, onde float e padrão justificam o valor.
-- Default false: só aparece quando o admin liga.
ALTER TABLE "Raffle"
  ADD COLUMN "showSkinSpecs" BOOLEAN NOT NULL DEFAULT false;
