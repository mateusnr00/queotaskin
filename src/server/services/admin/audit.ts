// Trilha de eventos de seguranca privilegiados (§46/§50). Nunca grava secret.
import { prisma } from "@/lib/db";

export type AcaoDeSeguranca =
  | "LOGIN_SUCCESS" | "LOGIN_FAILURE" | "MFA_FAILURE" | "MFA_ENROLL" | "MFA_RESET"
  | "RECOVERY_CODE_USED" | "STEP_UP_SUCCESS" | "STEP_UP_FAILURE" | "ROLE_CHANGE"
  | "PAYMENT_OVERRIDE" | "WINNER_OVERRIDE" | "GATEWAY_CONFIG_CHANGE"
  | "LEGACY_RECOVERY_APPROVAL" | "PASSWORD_CHANGE";

export async function registrarEventoDeSeguranca(e: {
  action: AcaoDeSeguranca;
  actorAdminId?: string | null;
  tenantId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  result?: "OK" | "DENIED" | "FAIL";
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
}): Promise<void> {
  try {
    await prisma.adminSecurityEvent.create({
      data: {
        action: e.action,
        actorAdminId: e.actorAdminId ?? null,
        tenantId: e.tenantId ?? null,
        targetType: e.targetType ?? null,
        targetId: e.targetId ?? null,
        result: e.result ?? "OK",
        reason: e.reason ?? null,
        before: (e.before ?? undefined) as never,
        after: (e.after ?? undefined) as never,
        requestId: e.requestId ?? null,
      },
    });
  } catch (err) {
    console.error("[admin-audit] falha ao registrar evento (nao bloqueia acao):", err);
  }
}
