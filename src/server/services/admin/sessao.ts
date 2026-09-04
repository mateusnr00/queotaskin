// Sessao privilegiada e step-up. Nucleo sem NextAuth (as actions chamam auth()
// e delegam). Admins sao Users: a revogacao reusa User.sessionVersion.
import { prisma } from "@/lib/db";
import { mfaAtivo, verificarTotpDoAdmin, usarRecoveryCode } from "@/server/services/admin/mfa";
import { registrarEventoDeSeguranca } from "@/server/services/admin/audit";
import { chaveDeAuth, permitido, registrar } from "@/server/services/otp/rate-limit";

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
  // §17 rate-limit dedicado do step-up (fail-closed), independente do login.
  const chaves = [chaveDeAuth("ADMIN_STEP_UP", "user", userId)];
  if (!(await permitido(chaves)).permitido) {
    await registrarEventoDeSeguranca({ action: "STEP_UP_FAILURE", actorAdminId: userId, reason: "rate-limit" });
    return false;
  }
  let ok = /^[0-9]{6}$/.test(codigo)
    ? await verificarTotpDoAdmin(userId, codigo)
    : false;
  if (!ok && codigo.length >= 8) ok = await usarRecoveryCode(userId, codigo); // recovery como step-up
  if (!ok) await registrar("ADMIN_STEP_UP", chaves);
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

/// Guard central de acao CRITICAL (§10 wrapper server-side): sessao admin
/// valida + (opcional) super-admin + tenant autorizado + step-up recente. As
/// actions criticas chamam isto; sem ok, nao mutam.
export async function guardarAcaoCritica(entrada: {
  sessao: SessaoAdmin;
  totp: string;
  tenantContexto?: string | null;
  exigeSuperAdmin?: boolean;
}): Promise<{ ok: true; userId: string; role: string; tenantId: string | null } | { ok: false; motivo: string }> {
  const v = await validarSessaoAdmin(entrada.sessao);
  if (!v.ok) return { ok: false, motivo: v.falha };
  if (entrada.exigeSuperAdmin && v.role !== "SUPER_ADMIN") return { ok: false, motivo: "SEM_SUPER_ADMIN" };
  if (entrada.tenantContexto !== undefined) {
    const t = tenantAutorizado(v.role, v.tenantId, entrada.tenantContexto ?? null);
    if (t === false) return { ok: false, motivo: "TENANT_NAO_AUTORIZADO" };
  }
  if (!(await exigirStepUpAdmin(v.userId, entrada.totp))) return { ok: false, motivo: "STEP_UP" };
  return { ok: true, userId: v.userId, role: v.role, tenantId: v.tenantId };
}

/// Politica pura de alteracao de role (§4/§5). SUPER_ADMIN so e concedido por
/// SUPER_ADMIN; ninguem se auto-eleva; rebaixar SUPER_ADMIN alheio e negado.
export function podeAlterarRole(entrada: {
  actorRole: string; actorId: string;
  targetId: string; targetRoleAtual: string; novaRole: string;
}): boolean {
  const { actorRole, actorId, targetId, targetRoleAtual, novaRole } = entrada;
  if (novaRole === targetRoleAtual) return true; // sem mudanca
  // Conceder ou revogar SUPER_ADMIN exige ator SUPER_ADMIN.
  if (novaRole === "SUPER_ADMIN" || targetRoleAtual === "SUPER_ADMIN") {
    if (actorRole !== "SUPER_ADMIN") return false;
  }
  // Ninguem se auto-promove a SUPER_ADMIN.
  if (actorId === targetId && novaRole === "SUPER_ADMIN") return false;
  return actorRole === "ADMIN" || actorRole === "SUPER_ADMIN";
}
