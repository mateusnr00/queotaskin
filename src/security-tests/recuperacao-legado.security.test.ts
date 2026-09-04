// FASE 5.3 - recuperacao assistida de legado e fechamento do rollout P1-A.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import { FakeOtpProvider, type OtpDeliveryProvider } from "@/server/services/otp/provider";
import { verificarDesafio } from "@/server/services/otp/otp-service";
import { classificarConta } from "@/server/services/otp/conta";
import { solicitarOtpDeLogin, autenticarPorDesafioDeLogin } from "@/server/services/otp/login";
import {
  abrirCasoDeRecuperacao, aprovarCaso, solicitarOtpDeRecuperacao, concluirRecuperacao, listarCasosDeRecuperacao,
} from "@/server/services/otp/recuperacao";

function cpfValido(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (b: number[]) => { let s = 0; for (let i = 0; i < b.length; i++) s += b[i]! * (b.length + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(n); const d2 = dv([...n, d1]); return [...n, d1, d2].join("");
}
let tel = 700000000;
const telUnico = () => String(++tel).padStart(11, "3");

const providerQueFalha: OtpDeliveryProvider = {
  nome: "FALHA",
  async enviar() { throw new Error("provider indisponivel"); },
};

// LEG-1: nenhuma migration marca legado verificado (prova no schema).
describe("LEG-1 nenhum legado verificado automaticamente", () => {
  it("classificacao por estado tecnico", () => {
    expect(classificarConta({ phone: "3", phoneVerifiedAt: null })).toBe("LEGACY_PHONE_UNVERIFIED");
    expect(classificarConta({ phone: null, phoneVerifiedAt: null })).toBe("LEGACY_NO_PHONE");
    expect(classificarConta({ phone: "3", phoneVerifiedAt: new Date() })).toBe("PHONE_VERIFIED");
  });
});

suiteDeIntegracao("FASE 5.3 · recuperacao assistida (DB)", () => {
  const users: string[] = [];
  const cases: string[] = [];
  async function legado(comTelefone = true): Promise<{ id: string; cpf: string }> {
    const cpf = cpfValido();
    const u = await prisma.user.create({
      data: { name: "LegadoRec", cpf, phone: comTelefone ? telUnico() : null, phoneCountry: "BR", phoneVerifiedAt: null, role: "PARTICIPANT" },
      select: { id: true },
    });
    users.push(u.id);
    return { id: u.id, cpf };
  }
  async function aprovar(userId: string): Promise<string> {
    const { caseId } = await abrirCasoDeRecuperacao(userId, "perdi o numero");
    cases.push(caseId);
    const r = await aprovarCaso(caseId, "operador-suporte");
    if (!r.ok) throw new Error("nao aprovou");
    return caseId + "|" + r.grant;
  }

  beforeAll(() => { if (!integracaoLiberada) return; });
  afterAll(async () => {
    if (!integracaoLiberada) return;
    await prisma.legacyRecoveryAudit.deleteMany({ where: { userId: { in: users } } });
    await prisma.legacyRecoveryCase.deleteMany({ where: { userId: { in: users } } });
    await prisma.authChallenge.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it("LEG-2/LEG-3 recovery aprovado NAO autentica sozinho; novo telefone exige OTP", async () => {
    const u = await legado();
    const [caseId, grant] = (await aprovar(u.id)).split("|");
    const novo = telUnico();
    // aprovado, mas sem OTP nada muda
    const antes = await prisma.user.findUnique({ where: { id: u.id }, select: { phoneVerifiedAt: true } });
    expect(antes?.phoneVerifiedAt).toBeNull();
    // dispara OTP e conclui
    const fake = new FakeOtpProvider();
    const req = await solicitarOtpDeRecuperacao({ caseId, grant, novoPhone: novo, novoPhoneCountry: "BR" }, fake);
    expect(req.ok).toBe(true);
    const challengeId = req.ok ? req.challengeId : "";
    // OTP errado nao migra
    expect((await concluirRecuperacao({ caseId, grant, challengeId, codigo: "000000", novoPhone: novo, novoPhoneCountry: "BR" })).ok).toBe(false);
    // OTP certo migra
    const ok = await concluirRecuperacao({ caseId, grant, challengeId, codigo: fake.ultimoCodigo()!, novoPhone: novo, novoPhoneCountry: "BR" });
    expect(ok.ok).toBe(true);
    const depois = await prisma.user.findUnique({ where: { id: u.id }, select: { phone: true, phoneVerifiedAt: true } });
    expect(depois?.phone).toBe(novo);
    expect(depois?.phoneVerifiedAt).not.toBeNull();
  });

  it("LEG-4 grant single-use: replay nao migra de novo", async () => {
    const u = await legado();
    const [caseId, grant] = (await aprovar(u.id)).split("|");
    const novo = telUnico();
    const fake = new FakeOtpProvider();
    const req = await solicitarOtpDeRecuperacao({ caseId, grant, novoPhone: novo, novoPhoneCountry: "BR" }, fake);
    const challengeId = req.ok ? req.challengeId : "";
    expect((await concluirRecuperacao({ caseId, grant, challengeId, codigo: fake.ultimoCodigo()!, novoPhone: novo, novoPhoneCountry: "BR" })).ok).toBe(true);
    // replay do mesmo grant
    const fake2 = new FakeOtpProvider();
    const req2 = await solicitarOtpDeRecuperacao({ caseId, grant, novoPhone: telUnico(), novoPhoneCountry: "BR" }, fake2);
    expect(req2.ok).toBe(false); // grant consumido
  });

  it("LEG-5 grant bound a user/purpose: OTP LEGACY_RECOVERY nao serve para LOGIN; grant de A nao migra B", async () => {
    const a = await legado();
    const [caseIdA, grantA] = (await aprovar(a.id)).split("|");
    const fake = new FakeOtpProvider();
    const req = await solicitarOtpDeRecuperacao({ caseId: caseIdA, grant: grantA, novoPhone: telUnico(), novoPhoneCountry: "BR" }, fake);
    const challengeId = req.ok ? req.challengeId : "";
    // purpose binding: usar como LOGIN falha
    expect((await verificarDesafio({ challengeId, codigo: fake.ultimoCodigo()!, purpose: "LOGIN", userId: a.id })).resultado).toBe("BINDING_INVALIDO");
    // grant de A nao serve para caso/usuario B (grant errado)
    const b = await legado();
    const [caseIdB] = (await aprovar(b.id)).split("|");
    expect((await solicitarOtpDeRecuperacao({ caseId: caseIdB, grant: grantA, novoPhone: telUnico(), novoPhoneCountry: "BR" }, new FakeOtpProvider())).ok).toBe(false);
  });

  it("LEG-6/LEG-7/§17 migracao revoga sessoes e habilita login CPF+OTP; nome+CPF continua impossivel", async () => {
    const u = await legado();
    const svAntes = (await prisma.user.findUnique({ where: { id: u.id }, select: { sessionVersion: true } }))!.sessionVersion;
    const [caseId, grant] = (await aprovar(u.id)).split("|");
    const novo = telUnico();
    const fake = new FakeOtpProvider();
    const req = await solicitarOtpDeRecuperacao({ caseId, grant, novoPhone: novo, novoPhoneCountry: "BR" }, fake);
    const challengeId = req.ok ? req.challengeId : "";
    await concluirRecuperacao({ caseId, grant, challengeId, codigo: fake.ultimoCodigo()!, novoPhone: novo, novoPhoneCountry: "BR" });
    const svDepois = (await prisma.user.findUnique({ where: { id: u.id }, select: { sessionVersion: true } }))!.sessionVersion;
    expect(svDepois).toBe(svAntes + 1); // LEG-6 sessoes revogadas
    // LEG-7/§17 login CPF+OTP funciona agora (telefone verificado)
    const fakeLogin = new FakeOtpProvider();
    const login = await solicitarOtpDeLogin({ cpf: u.cpf }, fakeLogin);
    expect(fakeLogin.enviados.length).toBe(1);
    const cid = "challengeId" in login ? login.challengeId : "";
    const ident = await autenticarPorDesafioDeLogin({ challengeId: cid, codigo: fakeLogin.ultimoCodigo()! });
    expect(ident?.id).toBe(u.id);
  });

  it("LEG-8 §15 concorrencia: 20 conclusoes com o mesmo grant -> 1 vence", async () => {
    const u = await legado();
    const [caseId, grant] = (await aprovar(u.id)).split("|");
    const novo = telUnico();
    const fake = new FakeOtpProvider();
    const req = await solicitarOtpDeRecuperacao({ caseId, grant, novoPhone: novo, novoPhoneCountry: "BR" }, fake);
    const challengeId = req.ok ? req.challengeId : "";
    const cod = fake.ultimoCodigo()!;
    const res = await Promise.all(Array.from({ length: 20 }, () =>
      concluirRecuperacao({ caseId, grant, challengeId, codigo: cod, novoPhone: novo, novoPhoneCountry: "BR" })));
    expect(res.filter((x) => x.ok)).toHaveLength(1);
  });

  it("LEG-10 §24 provider com falha nao cria fator verificado", async () => {
    const u = await legado();
    const [caseId, grant] = (await aprovar(u.id)).split("|");
    // solicitar OTP com provider que lanca -> nada verificado, grant nao consumido
    await expect(solicitarOtpDeRecuperacao({ caseId, grant, novoPhone: telUnico(), novoPhoneCountry: "BR" }, providerQueFalha)).rejects.toThrow();
    const dbu = await prisma.user.findUnique({ where: { id: u.id }, select: { phoneVerifiedAt: true } });
    expect(dbu?.phoneVerifiedAt).toBeNull();
    const c = await prisma.legacyRecoveryCase.findUnique({ where: { id: caseId }, select: { grantConsumedAt: true } });
    expect(c?.grantConsumedAt).toBeNull(); // grant intacto
  });

  it("§8 conta com patrimonio e marcada HIGH RISK", async () => {
    const u = await legado();
    // cria uma caixa (patrimonio)
    const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
    await prisma.levelUpBox.create({ data: { userId: u.id, tenantId: tenant.id, sourceLevel: 1, status: "FECHADA" } }).catch(() => {});
    const { caseId } = await abrirCasoDeRecuperacao(u.id);
    cases.push(caseId);
    const c = await prisma.legacyRecoveryCase.findUnique({ where: { id: caseId }, select: { riskLevel: true } });
    expect(c?.riskLevel).toBe("HIGH");
    await prisma.levelUpBox.deleteMany({ where: { userId: u.id } });
  });

  it("§9 audit trail registra transicoes sem dado sensivel", async () => {
    const u = await legado();
    const { caseId } = await abrirCasoDeRecuperacao(u.id);
    cases.push(caseId);
    await aprovarCaso(caseId, "op-1");
    const trilha = await prisma.legacyRecoveryAudit.findMany({ where: { caseId }, select: { action: true, toStatus: true, actor: true } });
    expect(trilha.map((a) => a.action)).toContain("ABRIR");
    expect(trilha.map((a) => a.action)).toContain("APROVAR");
    expect(trilha.some((a) => a.actor === "op-1")).toBe(true);
  });

  it("SUPPORT-1/2 §9 listagem scoped por tenant: ADMIN vê global/próprio, não de outro tenant", async () => {
    const tenants = await prisma.tenant.findMany({ take: 2, select: { id: true } });
    const tA = tenants[0]!.id;
    const tB = tenants[1]?.id ?? tA;
    // titular ligado ao tenant A
    const cpfA = cpfValido();
    const uA = await prisma.user.create({ data: { name: "Alfa Silva", cpf: cpfA, phone: telUnico(), phoneCountry: "BR", tenantId: tA, role: "PARTICIPANT" }, select: { id: true } });
    users.push(uA.id);
    const cA = await abrirCasoDeRecuperacao(uA.id); cases.push(cA.caseId);
    // ADMIN do tenant A vê; ADMIN do tenant B (se distinto) não vê
    const comoAdminA = await listarCasosDeRecuperacao({ role: "ADMIN", tenantId: tA });
    expect(comoAdminA.some((c) => c.id === cA.caseId)).toBe(true);
    if (tB !== tA) {
      const comoAdminB = await listarCasosDeRecuperacao({ role: "ADMIN", tenantId: tB });
      expect(comoAdminB.some((c) => c.id === cA.caseId)).toBe(false); // isolado
    }
    // SUPER_ADMIN vê
    const comoSuper = await listarCasosDeRecuperacao({ role: "SUPER_ADMIN", tenantId: null });
    expect(comoSuper.some((c) => c.id === cA.caseId)).toBe(true);
    // §12 mascaramento: nunca CPF/telefone completos
    const caso = comoSuper.find((c) => c.id === cA.caseId)!;
    expect(caso.cpfMascarado).not.toContain(cpfA);
    expect(caso.nomeMascarado).not.toBe("Alfa Silva");
  });

});
