-- P1-A rollout: recuperacao assistida de conta legada. ADITIVO.
CREATE TABLE "LegacyRecoveryCase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reason" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'NORMAL',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "grantHash" TEXT,
    "grantExpiresAt" TIMESTAMP(3),
    "grantConsumedAt" TIMESTAMP(3),
    CONSTRAINT "LegacyRecoveryCase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LegacyRecoveryCase_userId_idx" ON "LegacyRecoveryCase"("userId");
CREATE INDEX "LegacyRecoveryCase_status_idx" ON "LegacyRecoveryCase"("status");

CREATE TABLE "LegacyRecoveryAudit" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegacyRecoveryAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LegacyRecoveryAudit_caseId_idx" ON "LegacyRecoveryAudit"("caseId");
CREATE INDEX "LegacyRecoveryAudit_userId_idx" ON "LegacyRecoveryAudit"("userId");
