-- Cor própria por resultado, chance com casas decimais, e retrato do drop.
--
-- Incremental de propósito: a migration anterior já foi aplicada em produção,
-- e migration aplicada não se edita.
--
-- A CHANCE VIRA PONTOS-BASE
--
-- `chance` era percentual inteiro e não permitia 0,5% nem 1,25%. Somar
-- probabilidade em ponto flutuante não fecha em 100 de forma confiável, e "a
-- soma precisa dar exatamente 100%" é a regra que o painel recusa salvar
-- quando falha. Em pontos-base a soma é aritmética de inteiro: o total é
-- 10000, sem margem de erro. Os valores existentes são convertidos por 100.
--
-- A COR NÃO VEM DA RARIDADE
--
-- Amarrar cor a raridade obrigaria a mexer em código para pintar o 3.5x de
-- azul. A paleta é decisão de quem opera.
--
-- O RETRATO É CÓPIA, NÃO REFERÊNCIA
--
-- A caixa guarda a cor e a chance que valiam no instante da abertura. Repintar
-- o 3.5x amanhã não pode mudar o prêmio ganho hoje. `dropId` é texto solto e
-- não chave estrangeira: a auditoria continua legível mesmo se o drop for
-- apagado.

ALTER TABLE "LevelUpBoxDrop" ADD COLUMN IF NOT EXISTS "color" TEXT NOT NULL DEFAULT '#A1A1A1';
ALTER TABLE "LevelUpBoxDrop" ADD COLUMN IF NOT EXISTS "probabilityBps" INTEGER NOT NULL DEFAULT 0;
UPDATE "LevelUpBoxDrop" SET "probabilityBps" = "chance" * 100 WHERE "probabilityBps" = 0;
ALTER TABLE "LevelUpBoxDrop" DROP COLUMN IF EXISTS "chance";

ALTER TABLE "LevelUpBox" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "LevelUpBox" ADD COLUMN IF NOT EXISTS "dropId" TEXT;
ALTER TABLE "LevelUpBox" ADD COLUMN IF NOT EXISTS "probabilityBps" INTEGER;
