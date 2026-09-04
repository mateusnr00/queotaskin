// Sessao privilegiada e step-up. Nucleo sem NextAuth (as actions chamam auth()
// e delegam). Admins sao Users: a revogacao reusa User.sessionVersion.
import { prisma } from "@/lib/db";
import { mfaAtivo, verificarTotpDoAdmin, usarRecoveryCode } from "@/server/services/admin/mfa";
import { registrarEventoDeSeguranca } from "@/server/services/admin/audit";

export type FalhaAdmin = "NAO_AUTENTICADO" | "SESSAO_REVOGADA" | "SESSAO_LEGADA" | "SEM_PAPEL" | "MFA_PENDENTE";

const PAPEIS_ADMIN = new Set(["ADMIN", "SUPER_ADMIN"]);

export interface SessaoAdmin {
  userId: string;
  sessionVersion?: number | null;
}

/// Sessao admin valida: autenticada, sessionVersion atual (revogacao), papel
/// admin FRESCO do banco (promocao/rebaixamento imediato) e MFA ACTIVE. Sem
/// MFA ativa, so a area de enrollment (tratada a parte) - nunca CRITICAL.
export async function validarSessaoAdmin(
  sessao: SessaoAdmin | null | undefined,
): Promise<{ ok: true; userId: string; role: string; tenantId: string | null } | { ok: false; falha: FalhaAdmin }> {
  if (!sessao?.userId) return { ok: false, falha: "NAO_AUTENTICADO" };
  if (typeof sessao.sessionVersion !== "number") return { ok: false, falha: "SESSAO_LEGADA" };
  const u = await prisma.user.findUnique({ where: { id: sessao.userId }, select: { sessionVersion: true, role: true, tenantId: true } });
  if (!u) return { ok: false, falha: "NAO_AUTENTICADO" };
  if (u.sessionVersion !== sessao.sessionVersion) return { ok: false, falha: "SESSAO_REVOGADA" };
  if (!PAPEIS_ADMIN.has(u.role)) return { ok: false, falha: "SEM_PAPEL" };
  if (!(await mfaAtivo(sessao.userId))) return { ok: false, falha: "MFA_PENDENTE" };
  return { ok: true, userId: sessao.userId, role: u.role, tenantId: u.tenantId };
}

/// Step-up para acao CRITICAL (§14): prova recente por TOTP (ou recovery code),
/// single-use por timestep. A acao critica passa o codigo; sem prova valida,
/// nao executa. Audita o desfecho.
export async function exigirStepUpAdmin(userId: string, codigo: string): Promise<boolean> {
  let ok = /^[0-9]{6}$/.test(codigo)
    ? await verificarTotpDoAdmin(userId, codigo)
    : false;
  if (!ok && codigo.length >= 8) ok = await usarRecoveryCode(userId, codigo); // recovery como step-up
  await registrarEventoDeSeguranca({ action: ok ? "STEP_UP_SUCCESS" : "STEP_UP_FAILURE", actorAdminId: userId });
  return ok;
}

/// Tenant efetivo para uma acao admin (§19): SUPER_ADMIN opera o tenant do
/// contexto; ADMIN SO o proprio. tenantId nunca vem do request como autoridade.
export function tenantAutorizado(role: string, tenantDoAdmin: string | null, tenantDoContexto: string | null): string | null | false {
  if (role === "SUPER_ADMIN") return tenantDoContexto;
  // ADMIN: so o seu. Se o contexto pedir outro tenant, negar.
  if (tenantDoContexto && tenantDoAdmin && tenantDoContexto !== tenantDoAdmin) return false;
  return tenantDoAdmin;
}

/// Vencedor travado? Depois de FINISHED, alteracao normal e proibida (§25):
/// so break-glass (role privilegiada + MFA + step-up + motivo + audit), que
/// esta acao normal nao oferece. Break-glass fica declarado P2/ops.
export function vencedorEstaTravado(statusDoSorteio: string): boolean {
  return statusDoSorteio === "FINISHED";
}
