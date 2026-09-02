-- HorsePay entra, CodePay sai.
--
-- A CodePay fechou, entao o valor sai do enum de verdade e nao so das telas:
-- valor morto no enum vira opcao selecionavel no painel e credencial orfa na
-- tabela do tenant.
--
-- Conferido no banco de producao ANTES de escrever isto: zero linha com
-- CODEPAY em Tenant, Raffle, Payment, PaymentWebhookEvent e TaxaDeGateway, e
-- nenhum tenant com credencial dela gravada. Os UPDATEs abaixo existem para
-- banco de desenvolvimento com dado de teste, onde a conversao do tipo
-- falharia; em producao eles nao tocam em nada, entao nenhum historico de
-- pagamento e reescrito.

UPDATE "Tenant" SET "paymentProvider" = 'SYNCPAY' WHERE "paymentProvider" = 'CODEPAY';
UPDATE "Raffle" SET "paymentProvider" = NULL WHERE "paymentProvider" = 'CODEPAY';
UPDATE "Payment" SET "provider" = 'SYNCPAY' WHERE "provider" = 'CODEPAY';
UPDATE "PaymentWebhookEvent" SET "provider" = 'SYNCPAY' WHERE "provider" = 'CODEPAY';
-- Faixa de taxa e tabela de preco de um gateway. Sem o gateway, ela nao tem o
-- que descrever.
DELETE FROM "TaxaDeGateway" WHERE "provider" = 'CODEPAY';

-- Postgres nao remove valor de enum: o tipo e recriado e as colunas migram.
ALTER TABLE "Tenant" ALTER COLUMN "paymentProvider" DROP DEFAULT;

CREATE TYPE "PaymentProvider_new" AS ENUM ('MERCADO_PAGO', 'SYNCPAY', 'SIGILOPAY', 'NEXUSPAG', 'HORSEPAY');

ALTER TABLE "Tenant" ALTER COLUMN "paymentProvider" TYPE "PaymentProvider_new" USING ("paymentProvider"::text::"PaymentProvider_new");
ALTER TABLE "Raffle" ALTER COLUMN "paymentProvider" TYPE "PaymentProvider_new" USING ("paymentProvider"::text::"PaymentProvider_new");
ALTER TABLE "Payment" ALTER COLUMN "provider" TYPE "PaymentProvider_new" USING ("provider"::text::"PaymentProvider_new");
ALTER TABLE "PaymentWebhookEvent" ALTER COLUMN "provider" TYPE "PaymentProvider_new" USING ("provider"::text::"PaymentProvider_new");
ALTER TABLE "TaxaDeGateway" ALTER COLUMN "provider" TYPE "PaymentProvider_new" USING ("provider"::text::"PaymentProvider_new");

DROP TYPE "PaymentProvider";
ALTER TYPE "PaymentProvider_new" RENAME TO "PaymentProvider";

ALTER TABLE "Tenant" ALTER COLUMN "paymentProvider" SET DEFAULT 'SYNCPAY';

-- As credenciais da CodePay: sem gateway, sao segredo guardado a toa.
ALTER TABLE "Tenant" DROP COLUMN "codepayClientId";
ALTER TABLE "Tenant" DROP COLUMN "codepayPasswordEnc";

-- As da HorsePay. O client_secret e o segredo do webhook sao gravados
-- cifrados (AES-256-GCM, PAYMENT_SECRET_ENCRYPTION_KEY), como os outros.
ALTER TABLE "Tenant" ADD COLUMN "horsepayClientKey" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "horsepayClientSecretEnc" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "horsepayWebhookSecretEnc" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "horsepayBaseUrl" TEXT;
