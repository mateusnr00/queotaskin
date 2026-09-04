// P1-A - invariantes de autenticação forte e isolamento.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import { hmac, gerarCodigoOtp, destinoCanonico } from "@/lib/auth/cripto";
import { FakeOtpProvider } from "@/server/services/otp/provider";
import { chaveDeAuth } from "@/server/services/otp/rate-limit";
import {
  criarDesafio,
  verificarDesafio,
  OTP_MAX_TENTATIVAS,
} from "@/server/services/otp/otp-service";
import {
  solicitarOtpDeLogin,
  autenticarPorDesafioDeLogin,
} from "@/server/services/otp/login";

// ---- unit (sem DB) -------------------------------------------------------

describe("cripto do auth", () => {
  it("§10 OTP é 6 dígitos por CSPRNG e varia (não é constante)", () => {
    const cods = Array.from({ length: 200 }, () => gerarCodigoOtp());
    expect(cods.every((c) => /^[0-9]{6}$/.test(c))).toBe(true);
    expect(new Set(cods).size).toBeGreaterThan(150); // alta variação
  });
  it("§11 código nunca aparece igual ao hash (HMAC, não texto)", () => {
    const c = "123456";
    expect(hmac(c)).not.toBe(c);
    expect(hmac(c)).toHaveLength(64); // sha256 hex
  });
  it("§16 chave de rate-limit não contém CPF em texto", () => {
    const cpf = "39053344705";
    const chave = chaveDeAuth("REQUEST_OTP", "cpf", cpf);
    expect(chave).not.toContain(cpf);
    expect(chave).toContain(hmac(cpf));
  });
});

// ---- integração (DB) -----------------------------------------------------


// Gera um CPF válido aleatório (dígitos verificadores corretos). Aleatório
// para nunca colidir com dados de seed.
function ipRand(): string { return `10.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`; }
function cpfAleatorioValido(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (base: number[]) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += base[i]! * (base.length + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(n);
  const d2 = dv([...n, d1]);
  return [...n, d1, d2].join("");
}

suiteDeIntegracao("P1-A · OTP e isolamento", () => {
  let tenantA = "", tenantB = "";
  const users: string[] = [];

  async function criarUser(tenantId: string | null, phone: string | null) {
    const cpf = cpfAleatorioValido();
    const u = await prisma.user.create({
      data: { name: `U ${cpf}`, cpf, tenantId, phone, phoneCountry: "BR", role: "PARTICIPANT" },
      select: { id: true },
    });
    users.push(u.id);
    return { id: u.id, cpf };
  }

  beforeAll(async () => {
    if (!integracaoLiberada) return;
    const ts = await prisma.tenant.findMany({ take: 2, select: { id: true } });
    tenantA = ts[0]!.id; tenantB = ts[1]?.id ?? ts[0]!.id;
  });
  afterAll(async () => {
    if (!integracaoLiberada) return;
    await prisma.authChallenge.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.loginAttempt.deleteMany({ where: { chave: { startsWith: "auth:" } } });
  });

  it("AUTH-1 / §44 conhecer nome+CPF não produz identidade: sem desafio válido, nada", async () => {
    // Não existe função que troque nome+CPF por sessão. O único caminho é
    // autenticarPorDesafioDeLogin, que exige um challenge de LOGIN consumido.
    const semDesafio = await autenticarPorDesafioDeLogin({ challengeId: "inexistente", codigo: "000000" });
    expect(semDesafio).toBeNull();
  });

  it("AUTH-3 OTP é single-use; AUTH-4 expira; AUTH-5 limite de tentativas", async () => {
    const uid = (await criarUser(null, "11999990001")).id;
    const fake = new FakeOtpProvider();
    const { challengeId } = await criarDesafio(
      { userId: uid, purpose: "LOGIN", destino: { phoneCountry: "BR", phoneDigits: "11999990001" } },
      fake,
    );
    const codigo = fake.ultimoCodigo()!;
    // single-use
    expect((await verificarDesafio({ challengeId, codigo, purpose: "LOGIN", userId: uid })).resultado).toBe("VERIFICADO");
    expect((await verificarDesafio({ challengeId, codigo, purpose: "LOGIN", userId: uid })).resultado).toBe("JA_CONSUMIDO");

    // expiração
    const d2 = await criarDesafio({ userId: uid, purpose: "LOGIN", destino: { phoneCountry: "BR", phoneDigits: "11999990001" } }, fake);
    await prisma.authChallenge.update({ where: { id: d2.challengeId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await verificarDesafio({ challengeId: d2.challengeId, codigo: fake.ultimoCodigo()!, purpose: "LOGIN", userId: uid })).resultado).toBe("EXPIRADO");

    // tentativas: erra maxAttempts vezes -> esgota
    const d3 = await criarDesafio({ userId: uid, purpose: "LOGIN", destino: { phoneCountry: "BR", phoneDigits: "11999990001" } }, fake);
    for (let i = 0; i < OTP_MAX_TENTATIVAS - 1; i++) {
      expect((await verificarDesafio({ challengeId: d3.challengeId, codigo: "000000", purpose: "LOGIN", userId: uid })).resultado).toBe("CODIGO_INCORRETO");
    }
    expect((await verificarDesafio({ challengeId: d3.challengeId, codigo: "000000", purpose: "LOGIN", userId: uid })).resultado).toBe("TENTATIVAS_ESGOTADAS");
    // mesmo com o código certo depois de esgotar, não passa
    expect((await verificarDesafio({ challengeId: d3.challengeId, codigo: fake.ultimoCodigo()!, purpose: "LOGIN", userId: uid })).resultado).toBe("TENTATIVAS_ESGOTADAS");
  });

  it("AUTH-6 §35 purpose binding: OTP de LOGIN não serve para CHANGE_PHONE", async () => {
    const uid = (await criarUser(null, "11999990002")).id;
    const fake = new FakeOtpProvider();
    const { challengeId } = await criarDesafio({ userId: uid, purpose: "LOGIN", destino: { phoneCountry: "BR", phoneDigits: "11999990002" } }, fake);
    expect((await verificarDesafio({ challengeId, codigo: fake.ultimoCodigo()!, purpose: "CHANGE_PHONE", userId: uid })).resultado).toBe("BINDING_INVALIDO");
  });

  it("AUTH-6 §37 user binding: OTP de User A não autentica User B", async () => {
    const uidA = (await criarUser(null, "11999990003")).id;
    const fake = new FakeOtpProvider();
    const { challengeId } = await criarDesafio({ userId: uidA, purpose: "LOGIN", destino: { phoneCountry: "BR", phoneDigits: "11999990003" } }, fake);
    expect((await verificarDesafio({ challengeId, codigo: fake.ultimoCodigo()!, purpose: "LOGIN", userId: "outro-user-id" })).resultado).toBe("BINDING_INVALIDO");
  });

  it("AUTH-6 §36 tenant binding: OTP do tenant A não verifica no tenant B", async () => {
    const uid = (await criarUser(tenantA, "11999990004")).id;
    const fake = new FakeOtpProvider();
    const { challengeId } = await criarDesafio({ tenantId: tenantA, userId: uid, purpose: "LOGIN", destino: { phoneCountry: "BR", phoneDigits: "11999990004" } }, fake);
    if (tenantA !== tenantB) {
      expect((await verificarDesafio({ challengeId, codigo: fake.ultimoCodigo()!, purpose: "LOGIN", tenantId: tenantB, userId: uid })).resultado).toBe("BINDING_INVALIDO");
    }
    expect((await verificarDesafio({ challengeId, codigo: fake.ultimoCodigo()!, purpose: "LOGIN", tenantId: tenantA, userId: uid })).resultado).toBe("VERIFICADO");
  });

  it("§40 reenvio invalida o desafio anterior", async () => {
    const uid = (await criarUser(null, "11999990005")).id;
    const fake = new FakeOtpProvider();
    const d1 = await criarDesafio({ userId: uid, purpose: "LOGIN", destino: { phoneCountry: "BR", phoneDigits: "11999990005" } }, fake);
    const cod1 = fake.ultimoCodigo()!;
    await criarDesafio({ userId: uid, purpose: "LOGIN", destino: { phoneCountry: "BR", phoneDigits: "11999990005" } }, fake); // reenvio
    expect((await verificarDesafio({ challengeId: d1.challengeId, codigo: cod1, purpose: "LOGIN", userId: uid })).resultado).toBe("JA_CONSUMIDO");
  });

  it("§39 concorrência: 20 consumos simultâneos do código certo, só 1 vence", async () => {
    const uid = (await criarUser(null, "11999990006")).id;
    const fake = new FakeOtpProvider();
    const { challengeId } = await criarDesafio({ userId: uid, purpose: "LOGIN", destino: { phoneCountry: "BR", phoneDigits: "11999990006" } }, fake);
    const codigo = fake.ultimoCodigo()!;
    const res = await Promise.all(
      Array.from({ length: 20 }, () => verificarDesafio({ challengeId, codigo, purpose: "LOGIN", userId: uid })),
    );
    expect(res.filter((r) => r.resultado === "VERIFICADO")).toHaveLength(1);
  });

  it("§8/§42 enumeração: CPF existente e inexistente produzem a MESMA forma de resposta", async () => {
    const fake = new FakeOtpProvider();
    const conta = await criarUser(null, "11999990010");
    const existe = await solicitarOtpDeLogin({ cpf: conta.cpf, ip: ipRand() }, fake);
    const naoExiste = await solicitarOtpDeLogin({ cpf: cpfAleatorioValido(), ip: ipRand() }, fake);
    // ambos retornam { challengeId, enviado:true }
    expect("challengeId" in existe && existe.enviado).toBe(true);
    expect("challengeId" in naoExiste && naoExiste.enviado).toBe(true);
  });

  it("AUTH-1 §43 account takeover: sabe nome+CPF+telefone mascarado mas não controla o telefone → não entra", async () => {
    const vitima = await criarUser(null, "11999990007");
    const uid = vitima.id;
    const fake = new FakeOtpProvider();
    // atacante pede o código (vai para o telefone da vítima, não para ele)
    const r = await solicitarOtpDeLogin({ cpf: vitima.cpf, ip: ipRand() }, fake);
    const challengeId = "challengeId" in r ? r.challengeId : "";
    // ele NÃO tem o código; tenta adivinhar
    const ident = await autenticarPorDesafioDeLogin({ challengeId, codigo: "000000", ip: ipRand() });
    expect(ident).toBeNull();
    // com o código real (que só a vítima recebeu) entraria - prova o fator
    const codReal = fake.ultimoCodigo()!;
    const ok = await autenticarPorDesafioDeLogin({ challengeId, codigo: codReal, ip: ipRand() });
    expect(ok?.id).toBe(uid);
  });
});
