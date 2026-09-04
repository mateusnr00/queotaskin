// P1-A rollout - cadastro seguro, telefone verificado, migracao de legado.
import { afterAll, beforeAll, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import { FakeOtpProvider } from "@/server/services/otp/provider";
import { criarDesafio, verificarDesafio } from "@/server/services/otp/otp-service";
import { solicitarCadastro, concluirCadastro } from "@/server/services/otp/registro";
import { solicitarOtpDeLogin, autenticarPorDesafioDeLogin } from "@/server/services/otp/login";
import { revogarTodasAsSessoes, sessaoAindaValida } from "@/server/services/otp/sessao";
import { trocarTelefoneVerificado, provarAcaoCritica, classificarConta } from "@/server/services/otp/conta";

function cpfValido(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (b: number[]) => { let s = 0; for (let i = 0; i < b.length; i++) s += b[i]! * (b.length + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(n); const d2 = dv([...n, d1]); return [...n, d1, d2].join("");
}
let seqTel = 900000000;
function telUnico(): string { return String(++seqTel).padStart(11, "1"); }

suiteDeIntegracao("P1-A rollout · cadastro seguro e legado", () => {
  const users: string[] = [];
  const challenges: string[] = [];
  const pendings: string[] = [];

  async function cadastrarVerificado(): Promise<{ userId: string; cpf: string; phone: string }> {
    const cpf = cpfValido(), phone = telUnico();
    const fake = new FakeOtpProvider();
    const r = await solicitarCadastro({ name: "Novo Cliente", cpf, phone, phoneCountry: "BR" }, fake);
    if ("bloqueado" in r) throw new Error("bloqueado");
    const out = await concluirCadastro({ challengeId: r.challengeId, codigo: fake.ultimoCodigo()! });
    if (!out.ok) throw new Error("cadastro falhou: " + out.motivo);
    users.push(out.userId);
    return { userId: out.userId, cpf, phone };
  }

  beforeAll(() => { if (!integracaoLiberada) return; });
  afterAll(async () => {
    if (!integracaoLiberada) return;
    await prisma.pendingRegistration.deleteMany({ where: { cpf: { startsWith: "" }, id: { in: pendings } } }).catch(() => {});
    await prisma.pendingRegistration.deleteMany({ where: { phone: { startsWith: "1" }, name: "Novo Cliente" } }).catch(() => {});
    await prisma.authChallenge.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.loginAttempt.deleteMany({ where: { chave: { startsWith: "auth:" } } });
    void challenges;
  });

  it("REG-3 / §11 novo cadastro so vira conta apos verificar o telefone; depois loga por CPF+OTP", async () => {
    const cpf = cpfValido(), phone = telUnico();
    const fake = new FakeOtpProvider();
    const r = await solicitarCadastro({ name: "Novo Cliente", cpf, phone, phoneCountry: "BR" }, fake);
    if ("bloqueado" in r) throw new Error("bloqueado");
    // antes de verificar: nenhuma conta existe
    expect(await prisma.user.findUnique({ where: { cpf } })).toBeNull();
    const out = await concluirCadastro({ challengeId: r.challengeId, codigo: fake.ultimoCodigo()! });
    expect(out.ok).toBe(true);
    if (out.ok) users.push(out.userId);
    const u = await prisma.user.findUnique({ where: { cpf }, select: { phoneVerifiedAt: true } });
    expect(u?.phoneVerifiedAt).not.toBeNull();
    // login e2e
    const fake2 = new FakeOtpProvider();
    const req = await solicitarOtpDeLogin({ cpf }, fake2);
    const cid = "challengeId" in req ? req.challengeId : "";
    const ident = await autenticarPorDesafioDeLogin({ challengeId: cid, codigo: fake2.ultimoCodigo()! });
    expect(ident?.id).toBe(out.ok ? out.userId : "");
  });

  it("REG-2 / §12 telefone NAO verificado (legado) nao autentica: login vira chamariz", async () => {
    const cpf = cpfValido(), phone = telUnico();
    const legado = await prisma.user.create({ data: { name: "Legado", cpf, phone, phoneCountry: "BR", role: "PARTICIPANT" }, select: { id: true } });
    users.push(legado.id);
    const fake = new FakeOtpProvider();
    const req = await solicitarOtpDeLogin({ cpf }, fake);
    expect(fake.enviados).toHaveLength(0); // NADA enviado (telefone nao verificado)
    const cid = "challengeId" in req ? req.challengeId : "";
    // qualquer codigo falha; nao ha usuario ligado ao chamariz
    const ident = await autenticarPorDesafioDeLogin({ challengeId: cid, codigo: "000000" });
    expect(ident).toBeNull();
  });

  it("REG-1 / §6 CPF hijack: cadastro com CPF existente NAO altera o telefone da conta", async () => {
    const { cpf, phone } = await cadastrarVerificado();
    const telAtacante = telUnico();
    const fake = new FakeOtpProvider();
    const r = await solicitarCadastro({ name: "Atacante", cpf, phone: telAtacante, phoneCountry: "BR" }, fake);
    // resposta neutra, mas NADA enviado e conta intacta
    expect(fake.enviados).toHaveLength(0);
    const u = await prisma.user.findUnique({ where: { cpf }, select: { phone: true } });
    expect(u?.phone).toBe(phone); // telefone original preservado
    // e mesmo tentando concluir com o desafio chamariz, nao cria/assume conta
    const cid = "challengeId" in r ? r.challengeId : "";
    const out = await concluirCadastro({ challengeId: cid, codigo: "000000" });
    expect(out.ok).toBe(false);
  });

  it("§44 phone hijack: telefone ja usado nao pode ser registrado por outra conta", async () => {
    const { phone } = await cadastrarVerificado();
    const fake = new FakeOtpProvider();
    const r = await solicitarCadastro({ name: "Outro", cpf: cpfValido(), phone, phoneCountry: "BR" }, fake);
    expect(fake.enviados).toHaveLength(0); // telefone em uso -> chamariz
    const cid = "challengeId" in r ? r.challengeId : "";
    const out = await concluirCadastro({ challengeId: cid, codigo: "000000" });
    expect(out.ok).toBe(false);
  });

  it("§43 concorrencia de cadastro: 20 conclusoes do mesmo desafio -> 1 conta", async () => {
    const cpf = cpfValido(), phone = telUnico();
    const fake = new FakeOtpProvider();
    const r = await solicitarCadastro({ name: "Novo Cliente", cpf, phone, phoneCountry: "BR" }, fake);
    const cid = "challengeId" in r ? r.challengeId : "";
    const cod = fake.ultimoCodigo()!;
    const res = await Promise.all(Array.from({ length: 20 }, () => concluirCadastro({ challengeId: cid, codigo: cod })));
    expect(res.filter((x) => x.ok)).toHaveLength(1);
    const u = await prisma.user.findUnique({ where: { cpf }, select: { id: true } });
    if (u) users.push(u.id);
    expect(await prisma.user.count({ where: { cpf } })).toBe(1);
  });

  it("§45 replay: OTP de cadastro ja consumido nao cria segunda conta", async () => {
    const cpf = cpfValido(), phone = telUnico();
    const fake = new FakeOtpProvider();
    const r = await solicitarCadastro({ name: "Novo Cliente", cpf, phone, phoneCountry: "BR" }, fake);
    const cid = "challengeId" in r ? r.challengeId : "";
    const cod = fake.ultimoCodigo()!;
    const a = await concluirCadastro({ challengeId: cid, codigo: cod });
    expect(a.ok).toBe(true);
    if (a.ok) users.push(a.userId);
    const b = await concluirCadastro({ challengeId: cid, codigo: cod });
    expect(b.ok).toBe(false); // replay barrado
    expect(await prisma.user.count({ where: { cpf } })).toBe(1);
  });

  it("REG-6 / §9 purpose: OTP de REGISTER_PHONE nao autentica LOGIN", async () => {
    const uid = (await cadastrarVerificado()).userId;
    const fake = new FakeOtpProvider();
    const d = await criarDesafio({ userId: uid, purpose: "REGISTER_PHONE", destino: { phoneCountry: "BR", phoneDigits: telUnico() } }, fake);
    // tenta usar como LOGIN
    const r = await verificarDesafio({ challengeId: d.challengeId, codigo: fake.ultimoCodigo()!, purpose: "LOGIN", userId: uid });
    expect(r.resultado).toBe("BINDING_INVALIDO");
  });

  it("REG-7 / §24 revogacao de sessao: version sobe e a sessao antiga deixa de valer", async () => {
    const uid = (await cadastrarVerificado()).userId;
    const antes = await prisma.user.findUnique({ where: { id: uid }, select: { sessionVersion: true } });
    expect(await sessaoAindaValida({ userId: uid, sessionVersion: antes!.sessionVersion })).toBe(true);
    const nova = await revogarTodasAsSessoes(uid);
    expect(nova).toBe(antes!.sessionVersion + 1);
    expect(await sessaoAindaValida({ userId: uid, sessionVersion: antes!.sessionVersion })).toBe(false); // sessao antiga invalida
    expect(await sessaoAindaValida({ userId: uid, sessionVersion: nova })).toBe(true);
  });

  it("REG-4 / §21 troca de telefone: exige OTP no novo numero, verifica e revoga sessoes antigas", async () => {
    const uid = (await cadastrarVerificado()).userId;
    const v0 = (await prisma.user.findUnique({ where: { id: uid }, select: { sessionVersion: true } }))!.sessionVersion;
    const novoPhone = telUnico();
    const fake = new FakeOtpProvider();
    const d = await criarDesafio({ userId: uid, purpose: "CHANGE_PHONE", destino: { phoneCountry: "BR", phoneDigits: novoPhone } }, fake);
    const sv = (await prisma.user.findUnique({ where: { id: uid }, select: { sessionVersion: true } }))!.sessionVersion;
    const r = await trocarTelefoneVerificado({ sessao: { userId: uid, sessionVersion: sv }, novoPhone, novoPhoneCountry: "BR", challengeIdDoNovoTelefone: d.challengeId, codigo: fake.ultimoCodigo()! });
    expect(r.ok).toBe(true);
    const u = await prisma.user.findUnique({ where: { id: uid }, select: { phone: true, phoneVerifiedAt: true, sessionVersion: true } });
    expect(u?.phone).toBe(novoPhone);
    expect(u?.phoneVerifiedAt).not.toBeNull();
    expect(u?.sessionVersion).toBe(v0 + 1); // sessoes antigas revogadas
  });

  it("REG-8 / §26 acao critica exige reauth (OTP CRITICAL_ACTION correto)", async () => {
    const uid = (await cadastrarVerificado()).userId;
    const fake = new FakeOtpProvider();
    const d = await criarDesafio({ userId: uid, purpose: "CRITICAL_ACTION", destino: { phoneCountry: "BR", phoneDigits: telUnico() } }, fake);
    expect(await provarAcaoCritica({ userId: uid, challengeId: d.challengeId, codigo: "000000" })).toBe(false);
    const d2 = await criarDesafio({ userId: uid, purpose: "CRITICAL_ACTION", destino: { phoneCountry: "BR", phoneDigits: telUnico() } }, fake);
    expect(await provarAcaoCritica({ userId: uid, challengeId: d2.challengeId, codigo: fake.ultimoCodigo()! })).toBe(true);
  });

  it("§13 classificacao de conta por estado tecnico", async () => {
    expect(classificarConta({ phone: "11999", phoneVerifiedAt: new Date() })).toBe("PHONE_VERIFIED");
    expect(classificarConta({ phone: "11999", phoneVerifiedAt: null })).toBe("LEGACY_PHONE_UNVERIFIED");
    expect(classificarConta({ phone: null, phoneVerifiedAt: null })).toBe("LEGACY_NO_PHONE");
  });
});
