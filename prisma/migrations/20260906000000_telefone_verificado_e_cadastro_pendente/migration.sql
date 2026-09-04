-- P1-A rollout: confiança do telefone + cadastro pendente. ADITIVO.
-- phoneVerifiedAt nullable => legados nascem NULL (não verificados). ZERO
-- contas marcadas verificadas por migration.

ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

CREATE TABLE "PendingRegistration" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneCountry" TEXT NOT NULL DEFAULT 'BR',
    "tenantId" TEXT,
    "codigoDeIndicacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "PendingRegistration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PendingRegistration_challengeId_key" ON "PendingRegistration"("challengeId");
CREATE INDEX "PendingRegistration_cpf_idx" ON "PendingRegistration"("cpf");
CREATE INDEX "PendingRegistration_expiresAt_idx" ON "PendingRegistration"("expiresAt");
