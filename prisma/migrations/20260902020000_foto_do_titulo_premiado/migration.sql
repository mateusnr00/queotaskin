-- A foto da skin no título premiado.
--
-- Copiada do catálogo pelo mesmo casamento de nome que já resolve a raridade,
-- e guardada na linha porque a lista é pública: cruzar o catálogo inteiro a
-- cada visita para achar meia dúzia de fotos sairia caro no lugar errado.
ALTER TABLE "AwardedTicket" ADD COLUMN "skinImageUrl" TEXT;
