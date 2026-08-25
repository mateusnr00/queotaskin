-- Reservar EXIGE login, e cadastro já coleta nome + celular + CPF.
-- Isso torna o conceito de "campos requeridos por rifa" obsoleto: não há
-- mais formulário do participante pra ligar/desligar campos. Removemos
-- também as colunas de Reservation que ninguém preenche mais (nome social
-- e data de nascimento nunca foram lidas em lugar algum).

ALTER TABLE "Raffle" DROP COLUMN "requiredFields";

ALTER TABLE "Reservation"
  DROP COLUMN "participantSocialName",
  DROP COLUMN "participantBirthDate";
