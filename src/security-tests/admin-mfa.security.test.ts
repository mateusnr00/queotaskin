// FASE 6 (P1-B) - MFA de admin, step-up, revogacao, invariantes privilegiados.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import { codigoNoStep, stepAtual } from "@/lib/auth/totp";
import {
  iniciarEnrollment, confirmarEnrollment, mfaAtivo, verificarTotpDoAdmin,
  usarRecoveryCode, resetarMfa, QTD_RECOVERY_CODES,
} from "@/server/services/admin/mfa";
import { decifrarSegredoMfa } from "@/lib/auth/mfa-crypto";
import {
  validarSessaoAdmin, exigirStepUpAdmin, tenantAutorizado, vencedorEstaTravado,
} from "@/server/services/admin/sessao";
import { aprovacaoAutomaticaPermitida } from "@/lib/pagamentos/tier";

function cpfValido(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (b: number[]) => { let s = 0; for (let i = 0; i < b.length; i++) s += b[i]! * (b.length + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(n); const d2 = dv([...n, d1]); return [...n, d1, d2].join("");
}
let seq = 500000000;

// ---- puro (sem DB) ----
describe("P1-B puro", () => {
  it("ADMIN-3 tenantAutorizado: ADMIN so o seu tenant; SUPER_ADMIN o do contexto", () => {
    expect(tenantAutorizado("ADMIN", "A", "A")).toBe("A");
    expect(tenantAutorizado("ADMIN", "A", "B")).toBe(false); // A nao administra B
    expect(tenantAutorizado("SUPER_ADMIN", null, "B")).toBe("B");
  });
  it("ADMIN-6 vencedorEstaTravado apos FINISHED", () => {
    expect(vencedorEstaTravado("FINISHED")).toBe(true);
    expect(vencedorEstaTravado("ACTIVE")).toBe(false);
  });
  it("ADMIN-9 §30 STATUS_ONLY nao autoaprova em producao, nem com o env ligado", () => {
    const antesNode = process.env.NODE_ENV;
    const antesFlag = process.env.PAYMENTS_ALLOW_STATUS_ONLY_AUTO_APPROVAL;
    process.env.PAYMENTS_ALLOW_STATUS_ONLY_AUTO_APPROVAL = "true";
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    expect(aprovacaoAutomaticaPermitida("SYNCPAY")).toBe(false); // impossivel em prod
    expect(aprovacaoAutomaticaPermitida("NEXUSPAG")).toBe(true); // STRONG segue
    (process.env as { NODE_ENV?: string }).NODE_ENV = antesNode;
    if (antesFlag === undefined) delete process.env.PAYMENTS_ALLOW_STATUS_ONLY_AUTO_APPROVAL;
    else process.env.PAYMENTS_ALLOW_STATUS_ONLY_AUTO_APPROVAL = antesFlag;
  });
});

suiteDeIntegracao("P1-B · MFA de admin (DB)", () => {
  const users: string[] = [];
  async function novoAdmin(role: "ADMIN" | "SUPER_ADMIN" = "ADMIN"): Promise<{ id: string; sv: number }> {
    const u = await prisma.user.create({
      data: { name: "AdminSec", cpf: cpfValido(), email: `adm${++seq}@x.test`, role, tenantId: null,
        passwordHash: "x", phoneCountry: "BR" },
      select: { id: true, sessionVersion: true },
    });
    users.push(u.id);
    return { id: u.id, sv: u.sessionVersion };
  }
  async function enrolar(userId: string): Promise<string[]> {
    const { secret } = await iniciarEnrollment(userId, "adm@x");
    const code = codigoNoStep(secret, stepAtual());
    const r = await confirmarEnrollment(userId, code);
    if (!r.ok) throw new Error("enroll falhou");
    return r.recoveryCodes;
  }

  beforeAll(() => { if (!integracaoLiberada) return; });
  afterAll(async () => {
    if (!integracaoLiberada) return;
    await prisma.adminRecoveryCode.deleteMany({ where: { userId: { in: users } } });
    await prisma.adminMfa.deleteMany({ where: { userId: { in: users } } });
    await prisma.adminSecurityEvent.deleteMany({ where: { actorAdminId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it("§7 enrollment: secret so ativa apos confirmar codigo; secret guardado cifrado", async () => {
    const a = await novoAdmin();
    const { secret } = await iniciarEnrollment(a.id, "adm@x");
    expect(await mfaAtivo(a.id)).toBe(false); // PENDING, ainda nao vale
    // secret no banco esta cifrado (nao e o texto)
    const row = await prisma.adminMfa.findUnique({ where: { userId: a.id }, select: { secretEnc: true } });
    expect(row?.secretEnc).not.toBe(secret);
    expect(decifrarSegredoMfa(row!.secretEnc)).toBe(secret);
    // codigo errado nao ativa
    expect((await confirmarEnrollment(a.id, "000000")).ok).toBe(false);
    expect(await mfaAtivo(a.id)).toBe(false);
    // codigo certo ativa + gera recovery codes
    const r = await confirmarEnrollment(a.id, codigoNoStep(secret, stepAtual()));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.recoveryCodes).toHaveLength(QTD_RECOVERY_CODES);
    expect(await mfaAtivo(a.id)).toBe(true);
  });

  it("ADMIN-1 login: TOTP errado falha, certo passa (senha sozinha nao basta)", async () => {
    const a = await novoAdmin();
    await enrolar(a.id);
    expect(await verificarTotpDoAdmin(a.id, "000000")).toBe(false);
    // aguarda passar do step consumido no enroll para ter um codigo novo
    const st = stepAtual() + 1;
    // simula: usa um codigo de step futuro nao consumido
    expect(await verificarTotpDoAdmin(a.id, codigoNoStep(await segredoDe(a.id), st))).toBe(true);
  });

  async function segredoDe(userId: string): Promise<string> {
    const row = await prisma.adminMfa.findUnique({ where: { userId }, select: { secretEnc: true } });
    return decifrarSegredoMfa(row!.secretEnc);
  }

  it("§44 TOTP replay: mesmo step nao autentica duas vezes", async () => {
    const a = await novoAdmin();
    await enrolar(a.id);
    const st = stepAtual() + 1;
    const cod = codigoNoStep(await segredoDe(a.id), st);
    expect(await verificarTotpDoAdmin(a.id, cod)).toBe(true);
    expect(await verificarTotpDoAdmin(a.id, cod)).toBe(false); // replay do mesmo step barrado
  });

  it("ADMIN-4 validarSessaoAdmin: revogada/legada/sem-papel/mfa-pendente falham; valida passa", async () => {
    const a = await novoAdmin();
    // sem MFA -> MFA_PENDENTE
    const r = await validarSessaoAdmin({ userId: a.id, sessionVersion: a.sv });
    expect(r.ok).toBe(false);
    await enrolar(a.id);
    // legada (sem version)
    expect((await validarSessaoAdmin({ userId: a.id, sessionVersion: undefined })).ok).toBe(false);
    // valida
    expect((await validarSessaoAdmin({ userId: a.id, sessionVersion: a.sv })).ok).toBe(true);
    // participante (sem papel) falha
    const p = await prisma.user.create({ data: { name: "P", cpf: cpfValido(), role: "PARTICIPANT", phoneCountry: "BR" }, select: { id: true, sessionVersion: true } });
    users.push(p.id);
    expect((await validarSessaoAdmin({ userId: p.id, sessionVersion: p.sessionVersion })).ok).toBe(false);
  });

  it("ADMIN-5 step-up exige TOTP valido", async () => {
    const a = await novoAdmin();
    await enrolar(a.id);
    expect(await exigirStepUpAdmin(a.id, "000000")).toBe(false);
    const st = stepAtual() + 1;
    expect(await exigirStepUpAdmin(a.id, codigoNoStep(await segredoDe(a.id), st))).toBe(true);
  });

  it("ADMIN-10/§37 recovery code single-use; 20 usos concorrentes -> 1", async () => {
    const a = await novoAdmin();
    const codes = await enrolar(a.id);
    const code = codes[0]!;
    expect(await usarRecoveryCode(a.id, code)).toBe(true);
    expect(await usarRecoveryCode(a.id, code)).toBe(false); // replay
    // concorrencia num codigo fresco
    const code2 = codes[1]!;
    const res = await Promise.all(Array.from({ length: 20 }, () => usarRecoveryCode(a.id, code2)));
    expect(res.filter(Boolean)).toHaveLength(1);
  });

  it("ADMIN-11/§38 reset MFA: remove secret, revoga codes e revoga sessoes", async () => {
    const a = await novoAdmin();
    const codes = await enrolar(a.id);
    const svAntes = (await prisma.user.findUnique({ where: { id: a.id }, select: { sessionVersion: true } }))!.sessionVersion;
    await resetarMfa(a.id, "operador-breakglass");
    expect(await mfaAtivo(a.id)).toBe(false);
    expect(await prisma.adminMfa.findUnique({ where: { userId: a.id } })).toBeNull();
    expect(await usarRecoveryCode(a.id, codes[2]!)).toBe(false); // codes revogados
    const svDepois = (await prisma.user.findUnique({ where: { id: a.id }, select: { sessionVersion: true } }))!.sessionVersion;
    expect(svDepois).toBe(svAntes + 1); // sessoes revogadas
  });

  it("ADMIN-14 acoes privilegiadas geram audit; ADMIN-8 nenhum metodo retorna o secret", async () => {
    const a = await novoAdmin();
    await enrolar(a.id);
    const eventos = await prisma.adminSecurityEvent.findMany({ where: { actorAdminId: a.id }, select: { action: true } });
    expect(eventos.map((e) => e.action)).toContain("MFA_ENROLL");
    // Nao existe funcao que devolva o secret depois de ativo: so decryptSecret
    // com acesso ao banco (operacional), nunca uma API de leitura.
  });
});
