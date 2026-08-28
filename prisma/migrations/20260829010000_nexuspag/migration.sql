-- NexusPag como quarto gateway de Pix.
--
-- Mesmo desenho dos outros: credenciais no Tenant, segredos encriptados, e o
-- gateway efetivo de cada sorteio resolvido em payment-provider.ts. Este e o
-- primeiro que assina o webhook, dai a coluna do segredo.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'NEXUSPAG';

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "nexuspagApiKeyEnc" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "nexuspagWebhookSecretEnc" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "nexuspagBaseUrl" TEXT;
