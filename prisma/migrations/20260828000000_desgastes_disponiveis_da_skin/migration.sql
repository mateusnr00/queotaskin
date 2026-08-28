-- Em quais desgastes cada skin do catálogo existe.
--
-- O catálogo passou a guardar uma linha por skin, sem o desgaste no nome, e
-- quem cria a campanha escolhe o desgaste na hora. Para essa escolha não
-- oferecer o que não existe, a lista de desgastes possíveis vem junto da
-- skin: 281 das 865 linhas não existem nos cinco, e a M4A4 Howl não chega a
-- Battle-Scarred porque o float dela não passa de 0,4.
--
-- Lista vazia quer dizer "não tem desgaste", que é o caso do agente, que é
-- personagem, e da faca sem pintura.
--
-- NOT NULL de propósito. A primeira versão desta coluna aceitava NULL para
-- separar "não sei" de "não tem", e não funciona: o Prisma não tem lista
-- escalar opcional e devolve array vazio para NULL, então os dois estados
-- chegavam iguais na tela. Quem cadastra skin à mão pelo painel recebe os
-- cinco no ato da criação, e aí não existe "não sei" para representar.
ALTER TABLE "SkinTemplate"
  ADD COLUMN "skinWears" "SkinWear"[] NOT NULL DEFAULT ARRAY[]::"SkinWear"[];
