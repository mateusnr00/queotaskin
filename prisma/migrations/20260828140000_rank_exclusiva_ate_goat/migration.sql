-- A campanha exclusiva passa a aceitar patente de prestígio, e não só os
-- níveis numéricos.
--
-- O CHECK antigo travava minLevel entre 1 e 21. O código pode mandar 24, que
-- é o GOAT, mas o Postgres recusaria a linha: a regra que vale de verdade é
-- esta, não a validação do formulário.
--
-- A escada agora vai até 24: 1 a 21 são os níveis, 22 é MVP, 23 é Pro Player
-- e 24 é GOAT. Os valores das patentes são fixos por chave em rank.ts, e não
-- pela posição numa lista, para campanha já publicada não trocar de exigência
-- se alguém reordenar a lista de patentes.
ALTER TABLE "Raffle" DROP CONSTRAINT IF EXISTS "Raffle_minLevel_range";

ALTER TABLE "Raffle"
  ADD CONSTRAINT "Raffle_minLevel_range"
  CHECK ("minLevel" IS NULL OR ("minLevel" >= 1 AND "minLevel" <= 24));
