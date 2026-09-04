// Cadastro simplificado do participante: nome + CPF + telefone + código de
// afiliado (opcional). SEM senha, SEM OTP, SEM SMS, SEM e-mail.
//
// O registerAction real roda dentro de um request (headers/cookies/tenant), o
// que não existe fora do Next. Então provamos aqui os invariantes que ele
// carrega e que dão para exercitar diretamente: o SCHEMA (campos exigidos, sem
// senha), a UNICIDADE de CPF (double-submit não duplica) e a INTEGRAÇÃO com o
// sistema de afiliados existente (código válido vincula; inválido não quebra;
// autoindicação bloqueada).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import { registerSchema } from "@/lib/validations/auth";
import { vincularIndicacao } from "@/server/services/afiliados";

function cpfValido(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (b: number[]) => { let s = 0; for (let i = 0; i < b.length; i++) s += b[i]! * (b.length + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(n); const d2 = dv([...n, d1]); return [...n, d1, d2].join("");
}
let seqTel = 800000000;
const tel = () => String(++seqTel).padStart(11, "8");
const BR = "11987654321"; // BR móvel válido

// --- Schema (sem banco): campos exigidos e ausência de senha ---
describe("Cadastro simplificado · schema", () => {
  const base = { name: "Fulano de Tal", cpf: "39053344705", phone: BR, phoneCountry: "BR" };

  it("REG-1/2/5 nome+CPF+telefone com/sem código de afiliado é válido", () => {
    expect(registerSchema.safeParse(base).success).toBe(true); // sem código
    expect(registerSchema.safeParse({ ...base, codigoDeIndicacao: "MATEUS7K" }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, codigoDeIndicacao: "" }).success).toBe(true); // vazio não é erro
  });

  it("REG-6/8/9 CPF inválido, nome vazio e telefone vazio falham", () => {
    expect(registerSchema.safeParse({ ...base, cpf: "11111111111" }).success).toBe(false); // dígito verificador
    expect(registerSchema.safeParse({ ...base, name: "" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, phone: "" }).success).toBe(false);
  });

  it("REG-11/12/13 o schema NÃO tem senha/confirmar/OTP: passwordless de fato", () => {
    const parsed = registerSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("senha");
      expect(parsed.data).not.toHaveProperty("confirmarSenha");
      expect(parsed.data).not.toHaveProperty("otp");
    }
    // Mandar senha junto não a torna exigida nem a persiste: é simplesmente
    // ignorada pelo schema (campo desconhecido).
    const comSenha = registerSchema.safeParse({ ...base, senha: "qualquer" });
    expect(comSenha.success).toBe(true);
    expect(comSenha.success && "senha" in comSenha.data).toBe(false);
  });
});

// --- Integração (banco): unicidade e afiliados ---
suiteDeIntegracao("Cadastro simplificado · banco", () => {
  const users: string[] = [];
  const affs: string[] = [];

  async function criarParticipante(nome = "Cliente Teste"): Promise<{ id: string; cpf: string }> {
    const cpf = cpfValido();
    const u = await prisma.user.create({
      data: { name: nome, cpf, phone: tel(), phoneCountry: "BR", role: "PARTICIPANT" },
      select: { id: true },
    });
    users.push(u.id);
    return { id: u.id, cpf };
  }

  beforeAll(() => { if (!integracaoLiberada) return; });
  afterAll(async () => {
    if (!integracaoLiberada) return;
    await prisma.qualificacaoDeIndicado.deleteMany({ where: { indicadoId: { in: users } } });
    await prisma.affiliate.deleteMany({ where: { id: { in: affs } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it("REG-11 conta nasce SEM passwordHash (passwordless)", async () => {
    const c = await criarParticipante();
    const u = await prisma.user.findUnique({ where: { id: c.id }, select: { passwordHash: true } });
    expect(u?.passwordHash).toBeNull();
  });

  it("REG-7/10 CPF duplicado / double-submit não cria segunda conta", async () => {
    const c = await criarParticipante();
    await expect(
      prisma.user.create({ data: { name: "Outro", cpf: c.cpf, phone: tel(), role: "PARTICIPANT" } }),
    ).rejects.toMatchObject({ code: "P2002" }); // unique(cpf) resolve a concorrência
  });

  it("REG-3/4/5 código válido vincula; inválido não quebra; vazio não vincula", async () => {
    // afiliado com código ACTIVE
    const dono = await criarParticipante("Dono Afiliado");
    const aff = await prisma.affiliate.create({
      data: { userId: dono.id, code: `COD${Math.random().toString(36).slice(2, 7).toUpperCase()}`, status: "ACTIVE" },
      select: { id: true, code: true },
    });
    affs.push(aff.id);

    const indicado = await criarParticipante("Indicado");
    // 3. válido -> vincula
    expect(await vincularIndicacao(indicado.id, aff.code)).toBe(aff.code);
    const vinc = await prisma.user.findUnique({ where: { id: indicado.id }, select: { referredByAffiliateId: true } });
    expect(vinc?.referredByAffiliateId).toBe(aff.id);

    // 4. inválido -> null, cadastro intacto
    const outro = await criarParticipante("Sem Codigo Valido");
    expect(await vincularIndicacao(outro.id, "NAO_EXISTE_999")).toBeNull();
    const semVinc = await prisma.user.findUnique({ where: { id: outro.id }, select: { referredByAffiliateId: true } });
    expect(semVinc?.referredByAffiliateId).toBeNull();

    // 5. vazio -> null (não vincula, não é erro)
    expect(await vincularIndicacao(outro.id, "")).toBeNull();
  });

  it("REG-15 autoindicação continua bloqueada (server-side)", async () => {
    const dono = await criarParticipante("Auto Afiliado");
    const aff = await prisma.affiliate.create({
      data: { userId: dono.id, code: `SELF${Math.random().toString(36).slice(2, 7).toUpperCase()}`, status: "ACTIVE" },
      select: { id: true, code: true },
    });
    affs.push(aff.id);
    // o próprio dono aplicando o próprio código: recusado
    expect(await vincularIndicacao(dono.id, aff.code)).toBeNull();
    const u = await prisma.user.findUnique({ where: { id: dono.id }, select: { referredByAffiliateId: true } });
    expect(u?.referredByAffiliateId).toBeNull();
  });

  it("REG-4b afiliado SUSPENSO não recebe indicado novo", async () => {
    const dono = await criarParticipante("Suspenso");
    const aff = await prisma.affiliate.create({
      data: { userId: dono.id, code: `SUS${Math.random().toString(36).slice(2, 7).toUpperCase()}`, status: "SUSPENDED" },
      select: { id: true, code: true },
    });
    affs.push(aff.id);
    const indicado = await criarParticipante("Tentando Suspenso");
    expect(await vincularIndicacao(indicado.id, aff.code)).toBeNull();
  });
});
