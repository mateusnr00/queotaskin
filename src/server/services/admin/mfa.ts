// MFA (TOTP) de admin: enrollment, verificacao, recovery codes, reset.
import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { hmac, hmacConfere } from "@/lib/auth/cripto";
import { gerarSegredoTotp, verificarTotp, otpauthUri } from "@/lib/auth/totp";
import { revogarTodasAsSessoes } from "@/server/services/otp/sessao";
import { registrarEventoDeSeguranca } from "@/server/services/admin/audit";
import { chaveDeAuth, permitido, registrar } from "@/server/services/otp/rate-limit";

/// Quantidade de recovery codes (§36). Documentado.
export const QTD_RECOVERY_CODES = 10;

export async function mfaAtivo(userId: string): Promise<boolean> {
  const m = await prisma.adminMfa.findUnique({ where: { userId }, select: { status: true } });
  return m?.status === "ACTIVE";
}

/// Passo 1 do enrollment (§7): gera secret (cifrado no banco), status PENDING,
/// devolve o secret/URI SO agora (para o QR). Nao ativa nada.
export async function iniciarEnrollment(userId: string, contaLabel: string): Promise<{ secret: string; uri: string }> {
  const secret = gerarSegredoTotp();
  await prisma.adminMfa.upsert({
    where: { userId },
    create: { userId, secretEnc: encryptSecret(secret), status: "PENDING" },
    update: { secretEnc: encryptSecret(secret), status: "PENDING", lastUsedStep: null, activatedAt: null },
  });
  return { secret, uri: otpauthUri(secret, "QueOta Skin", contaLabel) };
}

/// Passo 2: confirma o codigo do app -> ACTIVE. So aqui a MFA passa a valer, e
/// so aqui os recovery codes sao gerados (retornados UMA vez).
export async function confirmarEnrollment(userId: string, codigo: string): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false }> {
  const chavesSetup = [chaveDeAuth("MFA_SETUP_VERIFY", "user", userId)];
  if (!(await permitido(chavesSetup)).permitido) return { ok: false };
  const m = await prisma.adminMfa.findUnique({ where: { userId } });
  if (!m || m.status === "ACTIVE") return { ok: false };
  const secret = decryptSecret(m.secretEnc);
  const r = verificarTotp(secret, codigo, { ultimoStep: m.lastUsedStep });
  if (!r.ok) { await registrar("MFA_SETUP_VERIFY", chavesSetup); return { ok: false }; }
  await prisma.adminMfa.update({ where: { userId }, data: { status: "ACTIVE", activatedAt: new Date(), lastUsedStep: r.step } });
  const recoveryCodes = await regenerarRecoveryCodes(userId);
  await registrarEventoDeSeguranca({ action: "MFA_ENROLL", actorAdminId: userId, targetType: "User", targetId: userId });
  return { ok: true, recoveryCodes };
}

/// Verifica um TOTP do admin com anti-replay (lastUsedStep). Usado no login e
/// no step-up. Consome o step no sucesso.
export async function verificarTotpDoAdmin(userId: string, codigo: string): Promise<boolean> {
  const m = await prisma.adminMfa.findUnique({ where: { userId } });
  if (!m || m.status !== "ACTIVE") return false;
  const secret = decryptSecret(m.secretEnc);
  const r = verificarTotp(secret, codigo, { ultimoStep: m.lastUsedStep });
  if (!r.ok) return false;
  // Anti-replay concorrente: so avanca se lastUsedStep nao mudou (§44).
  const upd = await prisma.adminMfa.updateMany({
    where: { userId, lastUsedStep: m.lastUsedStep },
    data: { lastUsedStep: r.step },
  });
  return upd.count === 1;
}

function gerarCodigoRecovery(): string {
  // 10 hex chars (40 bits) em grupos, alta entropia, single-use.
  return randomBytes(5).toString("hex");
}

async function regenerarRecoveryCodes(userId: string): Promise<string[]> {
  await prisma.adminRecoveryCode.deleteMany({ where: { userId } });
  const codes = Array.from({ length: QTD_RECOVERY_CODES }, gerarCodigoRecovery);
  await prisma.adminRecoveryCode.createMany({
    data: codes.map((c) => ({ userId, codeHash: hmac(c) })),
  });
  return codes;
}

/// Consome um recovery code (single-use, §37). Compare-and-set no usedAt para
/// 20 usos concorrentes -> 1 vence.
export async function usarRecoveryCode(userId: string, code: string): Promise<boolean> {
  const chaves = [chaveDeAuth("RECOVERY_CODE_VERIFY", "user", userId)];
  if (!(await permitido(chaves)).permitido) return false; // §16 fail-closed
  const candidatos = await prisma.adminRecoveryCode.findMany({ where: { userId, usedAt: null }, select: { id: true, codeHash: true } });
  const alvo = candidatos.find((c) => hmacConfere(c.codeHash, hmac(code)));
  if (!alvo) { await registrar("RECOVERY_CODE_VERIFY", chaves); return false; }
  const claim = await prisma.adminRecoveryCode.updateMany({ where: { id: alvo.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claim.count !== 1) return false;
  await registrarEventoDeSeguranca({ action: "RECOVERY_CODE_USED", actorAdminId: userId, targetType: "User", targetId: userId });
  return true;
}

/// Reset de MFA (§38): remove secret, revoga recovery codes, REVOGA sessoes,
/// audita. Re-enrollment obrigatorio. Fluxo de decisao (quem pode resetar) e
/// assistido/break-glass (§34) - aqui e a operacao segura em si.
export async function resetarMfa(userId: string, operador: string): Promise<void> {
  await prisma.adminMfa.deleteMany({ where: { userId } });
  await prisma.adminRecoveryCode.deleteMany({ where: { userId } });
  await revogarTodasAsSessoes(userId);
  await registrarEventoDeSeguranca({ action: "MFA_RESET", actorAdminId: operador, targetType: "User", targetId: userId });
}
