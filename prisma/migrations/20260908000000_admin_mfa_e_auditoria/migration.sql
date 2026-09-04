-- P1-B: MFA de admin (TOTP), recovery codes e auditoria privilegiada. ADITIVO.
CREATE TABLE "AdminMfa" (
    "userId" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastUsedStep" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    CONSTRAINT "AdminMfa_pkey" PRIMARY KEY ("userId")
);
CREATE TABLE "AdminRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminRecoveryCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdminRecoveryCode_userId_idx" ON "AdminRecoveryCode"("userId");
CREATE TABLE "AdminSecurityEvent" (
    "id" TEXT NOT NULL,
    "actorAdminId" TEXT,
    "tenantId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "result" TEXT NOT NULL DEFAULT 'OK',
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminSecurityEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdminSecurityEvent_actorAdminId_idx" ON "AdminSecurityEvent"("actorAdminId");
CREATE INDEX "AdminSecurityEvent_action_idx" ON "AdminSecurityEvent"("action");
CREATE INDEX "AdminSecurityEvent_tenantId_idx" ON "AdminSecurityEvent"("tenantId");
