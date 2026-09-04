// Login do participante por CPF + NOME COMPLETO (sem senha).
//
// Prova a decisão de produto (entrar sem senha) SEM abrir mão do que protege:
// comparação determinística do nome completo (nada de parcial/primeiro nome),
// resposta neutra contra enumeração, freio anti-varredura por HMAC(CPF)+IP e
// amarra de tenant (nunca autentica conta de outro tenant). Admin não entra
// por aqui (coberto pelos testes de admin/host).
import { afterAll, beforeAll, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import {
  autenticarParticipantePorNome,
  normalizarNomeCompleto,
} from "@/server/services/otp/nome-participante";
import { hashDeSenha } from "@/server/services/otp/senha-participante";
import { chaveDeAuth } from "@/server/services/otp/rate-limit";
import { participantLoginSchema } from "@/lib/validations/auth";

function cpfValido(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (b: number[]) => { let s = 0; for (let i = 0; i < b.length; i++) s += b[i]! * (b.length + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(n); const d2 = dv([...n, d1]); return [...n, d1, d2].join("");
}
let seqTel = 700000000;
const tel = () => String(++seqTel).padStart(11, "7");

suiteDeIntegracao("Login participante · CPF + nome completo", () => {
  const users: string[] = [];
  const tenants: string[] = [];
  const hosts: string[] = [];

  async function criar(opts: {
    nome: string; passwordHash?: string | null; tenantId?: string | null;
  }): Promise<{ id: string; cpf: string }> {
    const cpf = cpfValido();
    const u = await prisma.user.create({
      data: {
        name: opts.nome, cpf, phone: tel(), phoneCountry: "BR", phoneVerifiedAt: null,
        passwordHash: opts.passwordHash ?? null, role: "PARTICIPANT",
        tenantId: opts.tenantId ?? null,
      },
      select: { id: true },
    });
    users.push(u.id);
    return { id: u.id, cpf };
  }

  // Cria um tenant com host público próprio, para os testes de amarra.
  async function criarTenant(host: string): Promise<string> {
    const dono = await prisma.user.create({
      data: { name: "Dono", role: "ADMIN", cpf: cpfValido(), phone: tel() },
      select: { id: true },
    });
    users.push(dono.id);
    const slug = `t-${Math.random().toString(36).slice(2, 8)}`;
    const t = await prisma.tenant.create({
      data: { slug, name: slug, ownerId: dono.id },
      select: { id: true },
    });
    tenants.push(t.id);
    await prisma.tenantHost.create({ data: { tenantId: t.id, host, kind: "PUBLIC" } });
    hosts.push(host);
    return t.id;
  }

  beforeAll(() => { if (!integracaoLiberada) return; });
  afterAll(async () => {
    if (!integracaoLiberada) return;
    await prisma.tenantHost.deleteMany({ where: { host: { in: hosts } } });
    await prisma.user.updateMany({ where: { id: { in: users } }, data: { tenantId: null } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.loginAttempt.deleteMany({ where: { chave: { startsWith: "auth:PARTICIPANT_NAME_ATTEMPT" } } });
  });

  it("LOGIN-1/3/4 nome exato, caixa diferente e espaços extras autenticam", async () => {
    const a = await criar({ nome: "João da Silva" });
    // 1. exato
    expect((await autenticarParticipantePorNome({ cpf: a.cpf, nome: "João da Silva" }))?.id).toBe(a.id);
    // 3. caixa diferente
    expect((await autenticarParticipantePorNome({ cpf: a.cpf, nome: "joão da silva" }))?.id).toBe(a.id);
    // 4. espaços extras / pontas
    expect((await autenticarParticipantePorNome({ cpf: a.cpf, nome: "  João   da   Silva  " }))?.id).toBe(a.id);
  });

  it("LOGIN-2 CPF com máscara é normalizado e autentica", async () => {
    const a = await criar({ nome: "Maria Souza" });
    const mascarado = a.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    const parsed = participantLoginSchema.safeParse({ cpf: mascarado, nome: "Maria Souza" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.cpf).toBe(a.cpf); // só dígitos
    expect((await autenticarParticipantePorNome({ cpf: parsed.success ? parsed.data.cpf : "", nome: "Maria Souza" }))?.id).toBe(a.id);
  });

  it("LOGIN-5/6/7/8 nome errado, CPF errado, nome parcial e só primeiro nome falham", async () => {
    const a = await criar({ nome: "Carlos Eduardo Lima" });
    // 5. CPF certo + nome errado
    expect(await autenticarParticipantePorNome({ cpf: a.cpf, nome: "Outro Nome Qualquer" })).toBeNull();
    // 6. CPF errado + nome certo
    expect(await autenticarParticipantePorNome({ cpf: cpfValido(), nome: "Carlos Eduardo Lima" })).toBeNull();
    // 7. nome parcial (falta o meio)
    expect(await autenticarParticipantePorNome({ cpf: a.cpf, nome: "Carlos Lima" })).toBeNull();
    // 8. só primeiro nome
    expect(await autenticarParticipantePorNome({ cpf: a.cpf, nome: "Carlos" })).toBeNull();
  });

  it("LOGIN-10 não-enumeração: CPF inexistente e nome errado são indistinguíveis (ambos null)", async () => {
    const a = await criar({ nome: "Ana Paula" });
    const nomeErrado = await autenticarParticipantePorNome({ cpf: a.cpf, nome: "Zzz Yyy" });
    const cpfInexistente = await autenticarParticipantePorNome({ cpf: cpfValido(), nome: "Ana Paula" });
    expect(nomeErrado).toBeNull();
    expect(cpfInexistente).toBeNull();
  });

  it("LOGIN-11 rate-limit: chave da conta bloqueada barra até o nome certo (fail-closed)", async () => {
    const a = await criar({ nome: "Bruno Alves" });
    const chave = chaveDeAuth("PARTICIPANT_NAME_ATTEMPT", "cpf", a.cpf);
    await prisma.loginAttempt.upsert({
      where: { chave },
      create: { chave, falhas: 99, desde: new Date(), bloqueadoAte: new Date(Date.now() + 60_000) },
      update: { falhas: 99, bloqueadoAte: new Date(Date.now() + 60_000) },
    });
    expect(await autenticarParticipantePorNome({ cpf: a.cpf, nome: "Bruno Alves" })).toBeNull();
  });

  it("LOGIN-14/15 participante COM passwordHash legado E SEM senha entram por CPF + nome", async () => {
    // 14. legado com hash: o hash é ignorado, entra pelo nome
    const legado = await criar({ nome: "Legado Antigo", passwordHash: await hashDeSenha("SenhaVelha123") });
    expect((await autenticarParticipantePorNome({ cpf: legado.cpf, nome: "Legado Antigo" }))?.id).toBe(legado.id);
    // 15. sem hash nenhum
    const novo = await criar({ nome: "Novo Cliente", passwordHash: null });
    expect((await autenticarParticipantePorNome({ cpf: novo.cpf, nome: "Novo Cliente" }))?.id).toBe(novo.id);
  });

  it("LOGIN-9 amarra de tenant: host do tenant certo entra; host de OUTRO tenant recusa", async () => {
    const hostA = "cliente-a-teste.example.com";
    const hostB = "cliente-b-teste.example.com";
    const tenantA = await criarTenant(hostA);
    await criarTenant(hostB);
    const conta = await criar({ nome: "Torcedor Fiel", tenantId: tenantA });
    // host do próprio tenant: entra
    expect((await autenticarParticipantePorNome({ cpf: conta.cpf, nome: "Torcedor Fiel", host: hostA }))?.id).toBe(conta.id);
    // host de outro tenant: recusa (nunca cross-tenant)
    expect(await autenticarParticipantePorNome({ cpf: conta.cpf, nome: "Torcedor Fiel", host: hostB })).toBeNull();
    // sem host resolvível (dev/preview): amarra não se aplica, entra
    expect((await autenticarParticipantePorNome({ cpf: conta.cpf, nome: "Torcedor Fiel", host: "localhost" }))?.id).toBe(conta.id);
  });

  it("normalizarNomeCompleto é determinístico: trim + espaços + caixa, acentos preservados", () => {
    expect(normalizarNomeCompleto("  João   da  Silva ")).toBe("joão da silva");
    expect(normalizarNomeCompleto("JOÃO DA SILVA")).toBe("joão da silva");
    // acento preservado: joão != joao (não casa nomes diferentes)
    expect(normalizarNomeCompleto("João")).not.toBe(normalizarNomeCompleto("Joao"));
  });
});
