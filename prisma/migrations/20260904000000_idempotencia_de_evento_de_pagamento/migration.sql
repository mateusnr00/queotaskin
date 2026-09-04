-- Idempotência por evento de webhook, no banco.
--
-- Colunas ADITIVAS e NULLABLE: nenhuma linha existente muda, nada quebra. A
-- unique parcial (NULLs não conflitam no Postgres) só passa a valer para
-- eventos novos, que sempre trazem uma chave canônica calculada no handler.
-- As 7 linhas legadas ficam com providerEventId NULL, sem conflito.
ALTER TABLE "PaymentWebhookEvent" ADD COLUMN "providerEventId" TEXT;
ALTER TABLE "PaymentWebhookEvent" ADD COLUMN "signatureValid" BOOLEAN;
ALTER TABLE "PaymentWebhookEvent" ADD COLUMN "verificationResult" TEXT;
ALTER TABLE "PaymentWebhookEvent" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "PaymentWebhookEvent" ADD COLUMN "previousStatus" "PaymentStatus";
ALTER TABLE "PaymentWebhookEvent" ADD COLUMN "nextStatus" "PaymentStatus";
ALTER TABLE "PaymentWebhookEvent" ADD COLUMN "rawPayloadHash" TEXT;

CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_providerEventId_key"
  ON "PaymentWebhookEvent"("provider", "providerEventId");
