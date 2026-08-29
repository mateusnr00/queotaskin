-- O time de CS2 para quem o participante torce.
--
-- Coluna simples de texto, sem tabela de times e sem chave estrangeira: a
-- lista mora em código (src/lib/times-cs2.ts) porque é curta, estável e
-- ninguém a cadastra pelo painel. Ver a nota no schema.
--
-- Nula por padrão: torcer é opcional, e toda conta que já existe continua
-- válida sem escrita nenhuma.
ALTER TABLE "User" ADD COLUMN "favoriteTeamId" TEXT;
