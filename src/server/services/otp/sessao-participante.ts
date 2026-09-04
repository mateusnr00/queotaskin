// Enforcement de sessao de participante. Nucleo testavel, SEM NextAuth: as
// server actions chamam auth() e delegam a validacao aqui.
//
// Politica de reauth (§7/§10): CRITICAL_ACTION e SINGLE-USE POR ACAO. A acao
// sensivel consome um OTP fresco na hora; a linha consumida do AuthChallenge e
// a prova server-side. Sem janela em cookie do cliente, sem replay.
import { prisma } from "@/lib/db";
import { verificarDesafio } from "@/server/services/otp/otp-service";

export type FalhaDeSessao = "NAO_AUTENTICADO" | "SESSAO_REVOGADA" | "SESSAO_LEGADA";

export interface SessaoParticipante {
  userId: string;
  sessionVersion?: number | null;
}

/// Valida a sessao contra o banco. FAIL-CLOSED: token sem sessionVersion
/// (legado, nascido de auth fraca) e recusado para acao protegida - nao
/// reabrimos takeover por UX (§30). Retorna a identidade ou a falha.
export async function validarSessaoParticipante(
  sessao: SessaoParticipante | null | undefined,
): Promise<{ ok: true; userId: string } | { ok: false; falha: FalhaDeSessao }> {
  if (!sessao?.userId) return { ok: false, falha: "NAO_AUTENTICADO" };
  if (typeof sessao.sessionVersion !== "number") {
    return { ok: false, falha: "SESSAO_LEGADA" }; // sem claim confiavel
  }
  const u = await prisma.user.findUnique({
    where: { id: sessao.userId },
    select: { sessionVersion: true },
  });
  if (!u) return { ok: false, falha: "NAO_AUTENTICADO" };
  if (u.sessionVersion !== sessao.sessionVersion) {
    return { ok: false, falha: "SESSAO_REVOGADA" };
  }
  return { ok: true, userId: sessao.userId };
}

/// Prova de acao critica single-use, ligada a este usuario e ao purpose
/// CRITICAL_ACTION. Consome o desafio (uso unico).
export async function exigirReautenticacao(entrada: {
  userId: string;
  challengeId: string;
  codigo: string;
}): Promise<boolean> {
  const r = await verificarDesafio({
    challengeId: entrada.challengeId,
    codigo: entrada.codigo,
    purpose: "CRITICAL_ACTION",
    userId: entrada.userId,
  });
  return r.resultado === "VERIFICADO";
}

/// Predicado PURO da decisao de posse (sem NextAuth, testavel):
/// - sem sessao (uid undefined): capability-URL, o link e a credencial;
/// - com sessao: so o proprio dono, ou admin/super-admin.
/// O uid vem SEMPRE da sessao de quem chama, nunca do request (§3).
export function donoOuAdminPodeAcessar(
  uid: string | null | undefined,
  role: string | null | undefined,
  ownerUserId: string | null | undefined,
): boolean {
  if (!uid) return true;
  if (ownerUserId && uid === ownerUserId) return true;
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/// A sessao foi REVOGADA? Verdadeiro so quando o token traz um sessionVersion
/// numerico que NAO bate com o banco (logout-all, troca de telefone, recovery).
/// Sessao legada (sem o claim) nao e classificada como revogada aqui - ela e
/// barrada nas MUTACOES sensiveis por validarSessaoParticipante; para LEITURA
/// de recurso proprio na transicao, o ownership decide. Revogacao explicita
/// SEMPRE nega (§21).
export async function sessaoFoiRevogada(sessao: SessaoParticipante | null | undefined): Promise<boolean> {
  if (!sessao?.userId || typeof sessao.sessionVersion !== "number") return false;
  const u = await prisma.user.findUnique({ where: { id: sessao.userId }, select: { sessionVersion: true } });
  if (!u) return true; // conta sumiu: nega
  return u.sessionVersion !== sessao.sessionVersion;
}
