// Recuperacao/migracao ASSISTIDA de conta legada. Suporte AUTORIZA a migracao
// (nao substitui o telefone); a posse do NOVO telefone e provada por OTP
// (LEGACY_RECOVERY). Duas provas diferentes (§5/§7). Nenhum telefone legado
// vira verificado automaticamente (§2).
import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/db";
import { hmac, hmacConfere } from "@/lib/auth/cripto";
import { criarDesafio, verificarDesafio } from "@/server/services/otp/otp-service";
import { revogarTodasAsSessoes } from "@/server/services/otp/sessao";
import { hashDeSenha } from "@/server/services/otp/senha-participante";
import type { OtpDeliveryProvider } from "@/server/services/otp/provider";

/// Grant de recovery expira em 24h apos aprovado (§11): tempo de o suporte
/// falar com a pessoa e ela concluir, sem virar autorizacao eterna.
export const GRANT_EXPIRA_MS = 24 * 60 * 60 * 1000;

/// Patrimonio => HIGH RISK (§8): caixa de level-up ou reserva paga.
export async function contaTemPatrimonio(userId: string): Promise<boolean> {
  const [caixas, pagas] = await Promise.all([
    prisma.levelUpBox.count({ where: { userId } }),
    prisma.reservation.count({ where: { userId, status: "PAID" } }),
  ]);
  return caixas > 0 || pagas > 0;
}

async function auditar(entrada: {
  caseId: string; userId: string; action: string; actor?: string | null;
  fromStatus?: string | null; toStatus?: string | null; reason?: string | null;
}): Promise<void> {
  await prisma.legacyRecoveryAudit.create({ data: {
    caseId: entrada.caseId, userId: entrada.userId, action: entrada.action,
    actor: entrada.actor ?? null, fromStatus: entrada.fromStatus ?? null,
    toStatus: entrada.toStatus ?? null, reason: entrada.reason ?? null,
  } });
}

export async function abrirCasoDeRecuperacao(userId: string, reason?: string): Promise<{ caseId: string; riskLevel: string }> {
  const risk = (await contaTemPatrimonio(userId)) ? "HIGH" : "NORMAL";
  const c = await prisma.legacyRecoveryCase.create({
    data: { userId, reason: reason ?? null, riskLevel: risk, status: "OPEN" },
    select: { id: true },
  });
  await auditar({ caseId: c.id, userId, action: "ABRIR", toStatus: "OPEN", reason });
  return { caseId: c.id, riskLevel: risk };
}

export async function revisarCaso(caseId: string, operador: string): Promise<boolean> {
  const c = await prisma.legacyRecoveryCase.findUnique({ where: { id: caseId }, select: { status: true, userId: true } });
  if (!c || c.status !== "OPEN") return false;
  await prisma.legacyRecoveryCase.update({ where: { id: caseId }, data: { status: "IN_REVIEW" } });
  await auditar({ caseId, userId: c.userId, action: "REVISAR", actor: operador, fromStatus: "OPEN", toStatus: "IN_REVIEW" });
  return true;
}

/// Aprova o caso e emite um GRANT single-use/expiravel. O token e devolvido
/// UMA vez (para o suporte repassar por fora); no banco fica so o HMAC. NAO
/// altera telefone (§5).
export async function aprovarCaso(caseId: string, operador: string): Promise<{ ok: true; grant: string } | { ok: false }> {
  const c = await prisma.legacyRecoveryCase.findUnique({ where: { id: caseId }, select: { status: true, userId: true } });
  if (!c || (c.status !== "OPEN" && c.status !== "IN_REVIEW")) return { ok: false };
  const grant = randomBytes(24).toString("base64url");
  await prisma.legacyRecoveryCase.update({ where: { id: caseId }, data: {
    status: "APPROVED", resolvedBy: operador, resolvedAt: new Date(),
    grantHash: hmac(grant), grantExpiresAt: new Date(Date.now() + GRANT_EXPIRA_MS), grantConsumedAt: null,
  } });
  await auditar({ caseId, userId: c.userId, action: "APROVAR", actor: operador, fromStatus: c.status, toStatus: "APPROVED" });
  return { ok: true, grant };
}

export async function decidirRejeitarOuCancelar(caseId: string, operador: string, status: "REJECTED" | "CANCELLED", reason?: string): Promise<boolean> {
  const c = await prisma.legacyRecoveryCase.findUnique({ where: { id: caseId }, select: { status: true, userId: true } });
  if (!c || c.status === "APPROVED") return false;
  await prisma.legacyRecoveryCase.update({ where: { id: caseId }, data: { status, resolvedBy: operador, resolvedAt: new Date() } });
  await auditar({ caseId, userId: c.userId, action: status, actor: operador, fromStatus: c.status, toStatus: status, reason });
  return true;
}

/// Valida o grant (aprovado, nao consumido, nao expirado, HMAC bate).
async function grantValido(caseId: string, grant: string) {
  const c = await prisma.legacyRecoveryCase.findUnique({ where: { id: caseId } });
  if (!c || c.status !== "APPROVED" || !c.grantHash || c.grantConsumedAt) return null;
  if (!c.grantExpiresAt || c.grantExpiresAt.getTime() <= Date.now()) return null;
  if (!hmacConfere(c.grantHash, hmac(grant))) return null;
  return c;
}

/// Passo do usuario: com o grant valido, dispara OTP ao NOVO telefone
/// (purpose LEGACY_RECOVERY, bound ao user do caso). NAO consome o grant ainda.
export async function solicitarOtpDeRecuperacao(
  entrada: { caseId: string; grant: string; novoPhone: string; novoPhoneCountry: string },
  provider: OtpDeliveryProvider,
): Promise<{ ok: true; challengeId: string } | { ok: false }> {
  const c = await grantValido(entrada.caseId, entrada.grant);
  if (!c) return { ok: false };
  const d = await criarDesafio(
    { userId: c.userId, purpose: "LEGACY_RECOVERY", destino: { phoneCountry: entrada.novoPhoneCountry, phoneDigits: entrada.novoPhone } },
    provider,
  );
  return { ok: true, challengeId: d.challengeId };
}

export type ResultadoConclusaoRecovery =
  | { ok: true; userId: string }
  | { ok: false; motivo: "GRANT_INVALIDO" | "OTP_INVALIDO" | "CORRIDA" };

/// Conclusao: grant valido + OTP do novo telefone. Consome o grant (compare-
/// and-set), grava telefone + phoneVerifiedAt, REVOGA sessoes antigas (§16) e
/// fecha o caso. Atomico o suficiente: 20 concorrentes -> 1 vence (§15).
export async function concluirRecuperacao(entrada: {
  caseId: string; grant: string; challengeId: string; codigo: string;
  novoPhone: string; novoPhoneCountry: string;
}): Promise<ResultadoConclusaoRecovery> {
  const c = await grantValido(entrada.caseId, entrada.grant);
  if (!c) return { ok: false, motivo: "GRANT_INVALIDO" };

  // OTP prova a posse do NOVO telefone (bound ao user do caso, purpose certo).
  const verif = await verificarDesafio({
    challengeId: entrada.challengeId, codigo: entrada.codigo,
    purpose: "LEGACY_RECOVERY", userId: c.userId,
  });
  if (verif.resultado !== "VERIFICADO") return { ok: false, motivo: "OTP_INVALIDO" };

  // Consome o grant: so a 1a conclusao vence (§12/§15).
  const claim = await prisma.legacyRecoveryCase.updateMany({
    where: { id: c.id, grantConsumedAt: null },
    data: { grantConsumedAt: new Date(), status: "APPROVED", resolution: "MIGRADO" },
  });
  if (claim.count === 0) return { ok: false, motivo: "CORRIDA" };

  // Novo telefone nao pode pertencer a outra conta.
  const emUso = await prisma.user.findFirst({ where: { phone: entrada.novoPhone, id: { not: c.userId } }, select: { id: true } });
  if (emUso) return { ok: false, motivo: "GRANT_INVALIDO" };

  await prisma.user.update({ where: { id: c.userId }, data: {
    phone: entrada.novoPhone, phoneCountry: entrada.novoPhoneCountry, phoneVerifiedAt: new Date(),
  } });
  await revogarTodasAsSessoes(c.userId); // §16 sessoes antigas invalidas
  await auditar({ caseId: c.id, userId: c.userId, action: "CONCLUIR", fromStatus: "APPROVED", toStatus: "APPROVED", reason: "telefone verificado por OTP" });
  return { ok: true, userId: c.userId };
}

export interface CasoResumo {
  id: string;
  userId: string;
  status: string;
  riskLevel: string;
  reason: string | null;
  openedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  // Dados do titular, MASCARADOS (§12): nunca CPF/telefone completos.
  nomeMascarado: string;
  cpfMascarado: string | null;
  telefoneMascarado: string | null;
}

function mascararNome(n: string): string {
  const p = n.trim().split(/\s+/);
  return p.map((x, i) => (i === 0 ? x : (x[0] ?? "") + ".")).join(" ");
}
function mascararCpf(c: string | null): string | null {
  if (!c) return null;
  const d = c.replace(/\D/g, "");
  return d.length === 11 ? `***.***.${d.slice(6, 9)}-**` : "***";
}
function mascararTel(t: string | null): string | null {
  if (!t) return null;
  const d = t.replace(/\D/g, "");
  return d.length <= 2 ? "*".repeat(d.length) : "*".repeat(d.length - 2) + d.slice(-2);
}

/// Lista casos para o painel de suporte, SCOPED por tenant (§9). ADMIN vê só o
/// tenant informado (resolvido no backend, nunca do request); SUPER_ADMIN vê
/// todos. Dados do titular vêm MASCARADOS.
export async function listarCasosDeRecuperacao(
  contexto: { role: string; tenantId: string | null },
  filtro: { status?: string } = {},
): Promise<CasoResumo[]> {
  const ehSuper = contexto.role === "SUPER_ADMIN";
  const casos = await prisma.legacyRecoveryCase.findMany({
    where: { ...(filtro.status ? { status: filtro.status } : {}) },
    orderBy: { openedAt: "desc" },
    take: 100,
    select: { id: true, userId: true, status: true, riskLevel: true, reason: true, openedAt: true, resolvedAt: true, resolvedBy: true },
  });
  const userIds = [...new Set(casos.map((c) => c.userId))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, cpf: true, phone: true, tenantId: true } });
  const porId = new Map(users.map((u) => [u.id, u]));
  return casos
    .filter((c) => {
      if (ehSuper) return true;
      const u = porId.get(c.userId);
      // ADMIN: só casos de titulares ligados ao seu tenant (ou globais).
      return !u?.tenantId || u.tenantId === contexto.tenantId;
    })
    .map((c) => {
      const u = porId.get(c.userId);
      return {
        ...c,
        nomeMascarado: u ? mascararNome(u.name) : "?",
        cpfMascarado: mascararCpf(u?.cpf ?? null),
        telefoneMascarado: mascararTel(u?.phone ?? null),
      };
    });
}

export type ResultadoRecoverySenha =
  | { ok: true; userId: string }
  | { ok: false; motivo: "GRANT_INVALIDO" | "CORRIDA" };

/// Conclusao da recuperacao definindo NOVA SENHA (FASE 10.2). Grant valido +
/// nova senha -> hash, consome o grant (single-use), revoga sessoes, fecha o
/// caso. NAO toca o telefone (segue nao verificado).
export async function concluirRecuperacaoComSenha(entrada: {
  caseId: string; grant: string; novaSenha: string;
}): Promise<ResultadoRecoverySenha> {
  const c = await grantValido(entrada.caseId, entrada.grant);
  if (!c) return { ok: false, motivo: "GRANT_INVALIDO" };
  const claim = await prisma.legacyRecoveryCase.updateMany({
    where: { id: c.id, grantConsumedAt: null },
    data: { grantConsumedAt: new Date(), status: "APPROVED", resolution: "SENHA_REDEFINIDA" },
  });
  if (claim.count === 0) return { ok: false, motivo: "CORRIDA" };
  await prisma.user.update({ where: { id: c.userId }, data: { passwordHash: await hashDeSenha(entrada.novaSenha) } });
  await revogarTodasAsSessoes(c.userId);
  await auditar({ caseId: c.id, userId: c.userId, action: "CONCLUIR", fromStatus: "APPROVED", toStatus: "APPROVED", reason: "senha redefinida" });
  return { ok: true, userId: c.userId };
}
