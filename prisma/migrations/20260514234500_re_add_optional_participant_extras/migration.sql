-- Volta os campos opcionais por rifa. A migration anterior
-- (20260514230000_drop_required_fields_and_extras) tinha removido tudo
-- assumindo que o cadastro cobria 100%, mas o admin quer poder pedir
-- email/nome social/data de nascimento (e até reconfirmar nome/telefone/
-- CPF) em rifas específicas. Defaults ficam todos em FALSE: nada aparece
-- na reserva a menos que o admin ligue explicitamente.

ALTER TABLE "Raffle"
  ADD COLUMN "requiredFields" JSONB NOT NULL
  DEFAULT '{"name":false,"phone":false,"cpf":false,"email":false,"socialName":false,"birthDate":false}';

ALTER TABLE "Reservation"
  ADD COLUMN "participantSocialName" TEXT,
  ADD COLUMN "participantBirthDate" TIMESTAMP(3);
