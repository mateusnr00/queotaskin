// FASE 6.1 - enforcement em nivel de acao critica de admin.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import { codigoNoStep, stepAtual } from "@/lib/auth/totp";
import { iniciarEnrollment, confirmarEnrollment } from "@/server/services/admin/mfa";
import { decifrarSegredoMfa } from "@/lib/auth/mfa-crypto";
import {
  guardarAcaoCritica, podeAlterarRole, exigirStepUpAdmin,
} from "@/server/services/admin/sessao";
import { chaveDeAuth, registrar } from "@/server/services/otp/rate-limit";

function cpfValido(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (b: number[]) => { let s = 0; for (let i = 0; i < b.length; i++) s += b[i]! * (b.length + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(n); const d2 = dv([...n, d1]); return [...n, d1, d2].join("");
}
let seq = 300000000;

// ADMIN-C2 / §5 politica de role (pura)
describe("ADMIN-C2/§5 self-escalation e SUPER_ADMIN", () => {
  it("ninguem se auto-promove a SUPER; ADMIN nao concede SUPER; SUPER concede", () => {
    expect(podeAlterarRole({ actorRole: "ADMIN", actorId: "a", targetId: "a", targetRoleAtual: "ADMIN", novaRole: "SUPER_ADMIN" })).toBe(false);
    expect(podeAlterarRole({ actorRole: "ADMIN", actorId: "a", targetId: "b", targetRoleAtual: "ADMIN", novaRole: "SUPER_ADMIN" })).toBe(false);
    expect(podeAlterarRole({ actorRole: "ADMIN", actorId: "a", targetId: "b", targetRoleAtual: "SUPER_ADMIN", novaRole: "ADMIN" })).toBe(false); // rebaixar SUPER exige SUPER
    expect(podeAlterarRole({ actorRole: "SUPER_ADMIN", actorId: "s", targetId: "b", targetRoleAtual: "ADMIN", novaRole: "SUPER_ADMIN" })).toBe(true);
    expect(podeAlterarRole({ actorRole: "ADMIN", actorId: "a", targetId: "b", targetRoleAtual: "PARTICIPANT", novaRole: "ADMIN" })).toBe(true);
  });
});

suiteDeIntegracao("FASE 6.1 · guard de acao critica (DB)", () => {
  const users: string[] = [];
  async function adminComMfa(role: "ADMIN" | "SUPER_ADMIN" = "ADMIN", tenantId: string | null = null): Promise<{ id: string; sv: number }> {
    const u = await prisma.user.create({ data: { name: "AdmEnf", cpf: cpfValido(), email: `e${++seq}@x.test`, role, tenantId, passwordHash: "x", phoneCountry: "BR" }, select: { id: true, sessionVersion: true } });
    users.push(u.id);
    const { secret } = await iniciarEnrollment(u.id, "e@x");
    await confirmarEnrollment(u.id, codigoNoStep(secret, stepAtual()));
    return { id: u.id, sv: u.sessionVersion };
  }
  async function totpFresco(userId: string): Promise<string> {
    const row = await prisma.adminMfa.findUnique({ where: { userId }, select: { secretEnc: true } });
    return codigoNoStep(decifrarSegredoMfa(row!.secretEnc), stepAtual() + 1);
  }

  beforeAll(() => { if (!integracaoLiberada) return; });
  afterAll(async () => {
    if (!integracaoLiberada) return;
    await prisma.adminRecoveryCode.deleteMany({ where: { userId: { in: users } } });
    await prisma.adminMfa.deleteMany({ where: { userId: { in: users } } });
    await prisma.adminSecurityEvent.deleteMany({ where: { actorAdminId: { in: users } } });
    await prisma.loginAttempt.deleteMany({ where: { chave: { startsWith: "auth:" } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it("ADMIN-C1/C10 guardarAcaoCritica: sem step-up nega; com step-up valido libera", async () => {
    const a = await adminComMfa();
    expect((await guardarAcaoCritica({ sessao: { userId: a.id, sessionVersion: a.sv }, totp: "000000" })).ok).toBe(false);
    expect((await guardarAcaoCritica({ sessao: { userId: a.id, sessionVersion: a.sv }, totp: await totpFresco(a.id) })).ok).toBe(true);
  });

  it("ADMIN-4 guard nega sessao revogada e sessao legada", async () => {
    const a = await adminComMfa();
    // legada
    expect((await guardarAcaoCritica({ sessao: { userId: a.id, sessionVersion: undefined }, totp: await totpFresco(a.id) })).ok).toBe(false);
    // revogada
    await prisma.user.update({ where: { id: a.id }, data: { sessionVersion: { increment: 1 } } });
    const r = await guardarAcaoCritica({ sessao: { userId: a.id, sessionVersion: a.sv }, totp: await totpFresco(a.id) });
    expect(r.ok).toBe(false);
  });

  it("ADMIN-3/§20 guard nega tenant nao autorizado (ADMIN do tenant real -> contexto diferente)", async () => {
    const tenantReal = (await prisma.tenant.findFirstOrThrow({ select: { id: true } })).id;
    const a = await adminComMfa("ADMIN", tenantReal);
    // contexto pedindo OUTRO tenant que nao o do admin -> negado
    const r = await guardarAcaoCritica({ sessao: { userId: a.id, sessionVersion: a.sv }, totp: await totpFresco(a.id), tenantContexto: tenantReal + "-outro" });
    expect(r.ok).toBe(false);
    // o proprio tenant -> liberado
    const r2 = await guardarAcaoCritica({ sessao: { userId: a.id, sessionVersion: a.sv }, totp: await totpFresco(a.id), tenantContexto: tenantReal });
    expect(r2.ok).toBe(true);
  });

  it("§4 guard exigeSuperAdmin nega ADMIN comum", async () => {
    const a = await adminComMfa("ADMIN");
    const r = await guardarAcaoCritica({ sessao: { userId: a.id, sessionVersion: a.sv }, totp: await totpFresco(a.id), exigeSuperAdmin: true });
    expect(r.ok).toBe(false);
    const s = await adminComMfa("SUPER_ADMIN");
    const r2 = await guardarAcaoCritica({ sessao: { userId: s.id, sessionVersion: s.sv }, totp: await totpFresco(s.id), exigeSuperAdmin: true });
    expect(r2.ok).toBe(true);
  });

  it("ADMIN-C7 §17 step-up tem rate-limit dedicado (fail-closed ao estourar)", async () => {
    const a = await adminComMfa();
    // estoura o bucket ADMIN_STEP_UP direto
    const chaves = [chaveDeAuth("ADMIN_STEP_UP", "user", a.id)];
    for (let i = 0; i < 8; i++) await registrar("ADMIN_STEP_UP", chaves);
    // agora nem um TOTP valido passa (rate-limited)
    expect(await exigirStepUpAdmin(a.id, await totpFresco(a.id))).toBe(false);
  });
});
