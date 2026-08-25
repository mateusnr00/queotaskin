-- Adiciona configuração por tenant de provider de PIX + credenciais.
-- Secrets (syncpayClientSecretEnc, codepayPasswordEnc) ficam encriptados
-- com AES-256-GCM usando PAYMENT_SECRET_ENCRYPTION_KEY (env var no Vercel).
-- A coluna paymentProvider tem default SYNCPAY pra preservar o fluxo atual
-- dos tenants que ainda dependem das env vars SYNCPAY_CLIENT_ID/SECRET.
--
-- O valor CODEPAY do enum é adicionado numa migration separada
-- (20260515060001_add_codepay_provider) porque Postgres não permite usar
-- um novo enum value na mesma transação em que ele foi criado.

ALTER TABLE "Tenant"
  ADD COLUMN "paymentProvider" "PaymentProvider" NOT NULL DEFAULT 'SYNCPAY',
  ADD COLUMN "syncpayClientId" TEXT,
  ADD COLUMN "syncpayClientSecretEnc" TEXT,
  ADD COLUMN "syncpayBaseUrl" TEXT,
  ADD COLUMN "codepayClientId" TEXT,
  ADD COLUMN "codepayPasswordEnc" TEXT;
