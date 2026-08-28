-- SigiloPay como terceiro gateway de Pix.
--
-- Mesmo desenho dos outros dois: credenciais no Tenant, secret encriptado
-- (AES-256-GCM), e o gateway efetivo de cada sorteio resolvido em
-- payment-provider.ts. Nada aqui liga a SigiloPay sozinha: o tenant so passa
-- a usa-la quando alguem escolher no painel.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'SIGILOPAY';

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "sigilopayClientId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "sigilopayClientSecretEnc" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "sigilopayBaseUrl" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "sigilopayWebhookToken" TEXT;
