"use server";

// Aprovacao de caso de recuperacao de legado (§6). CRITICAL: exige admin com
// MFA ativa (getAdminOrThrow) + step-up + audit. A aprovacao NAO verifica o
// telefone: emite o grant; a posse do novo numero segue provada por OTP.
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { guardarAcaoCritica } from "@/server/services/admin/sessao";
import { registrarEventoDeSeguranca } from "@/server/services/admin/audit";
import { aprovarCaso } from "@/server/services/otp/recuperacao";
import type { ActionResult } from "@/server/actions/auth";

export async function aprovarRecuperacaoLegadoAction(
  raw: unknown,
): Promise<ActionResult<{ grant: string }>> {
  const session = await getAdminOrThrow(); // ja exige MFA ativa
  const caseId = typeof (raw as { caseId?: unknown })?.caseId === "string" ? (raw as { caseId: string }).caseId : "";
  const totp = typeof (raw as { totp?: unknown })?.totp === "string" ? (raw as { totp: string }).totp : "";
  if (!caseId) return { ok: false, error: "Caso invalido" };

  const guarda = await guardarAcaoCritica({
    sessao: { userId: session.user.id, sessionVersion: session.user.sessionVersion },
    totp,
  });
  if (!guarda.ok) return { ok: false, error: "Confirmacao de seguranca (MFA) necessaria." };

  const r = await aprovarCaso(caseId, session.user.id);
  if (!r.ok) return { ok: false, error: "Nao foi possivel aprovar este caso." };
  await registrarEventoDeSeguranca({ action: "LEGACY_RECOVERY_APPROVAL", actorAdminId: session.user.id, targetType: "LegacyRecoveryCase", targetId: caseId });
  return { ok: true, data: { grant: r.grant } };
}
