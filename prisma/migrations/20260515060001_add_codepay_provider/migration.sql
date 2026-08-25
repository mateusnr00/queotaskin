-- Adiciona CODEPAY ao enum PaymentProvider. Postgres exige que valores
-- novos de enum sejam adicionados numa transação separada antes de poder
-- ser usados em INSERT/UPDATE.

ALTER TYPE "PaymentProvider" ADD VALUE 'CODEPAY';
