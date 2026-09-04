"use server";

// Actions de enrollment de MFA do admin. Usam getAdminParaEnrollment (nao
// exigem MFA ativa, senao nao daria para ativar).
import { getAdminParaEnrollment } from "@/lib/auth-helpers";
import { iniciarEnrollment, confirmarEnrollment } from "@/server/services/admin/mfa";
import type { ActionResult } from "@/server/actions/auth";

/// Inicia o enrollment: devolve a otpauth URI (para o QR) e o secret (para
/// digitacao manual). So aqui o secret e exposto - depois de ACTIVE, nunca.
export async function iniciarEnrollmentMfaAction(): Promise<ActionResult<{ uri: string; secret: string }>> {
  const session = await getAdminParaEnrollment();
  const conta = session.user.email ?? session.user.id;
  const { secret, uri } = await iniciarEnrollment(session.user.id, conta);
  return { ok: true, data: { uri, secret } };
}

/// Confirma o codigo do app e ativa a MFA. Devolve os recovery codes UMA vez.
export async function confirmarEnrollmentMfaAction(
  raw: unknown,
): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  const session = await getAdminParaEnrollment();
  const codigo = typeof (raw as { codigo?: unknown })?.codigo === "string" ? (raw as { codigo: string }).codigo.trim() : "";
  if (!/^[0-9]{6}$/.test(codigo)) return { ok: false, error: "Codigo invalido" };
  const r = await confirmarEnrollment(session.user.id, codigo);
  if (!r.ok) return { ok: false, error: "Codigo incorreto. Tente o codigo atual do app." };
  return { ok: true, data: { recoveryCodes: r.recoveryCodes } };
}
