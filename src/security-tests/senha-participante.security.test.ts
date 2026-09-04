// FASE 10.2 - autenticacao de participante por CPF + senha.
import { afterAll, beforeAll, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import {
  autenticarParticipantePorSenha, hashDeSenha, emitirProvaDeAcaoCritica, consumirProvaDeAcaoCritica,
} from "@/server/services/otp/senha-participante";
import { revogarTodasAsSessoes } from "@/server/services/otp/sessao";
import { chaveDeAuth } from "@/server/services/otp/rate-limit";
import { verificarDesafio } from "@/server/services/otp/otp-service";
import { abrirCasoDeRecuperacao, aprovarCaso, concluirRecuperacaoComSenha } from "@/server/services/otp/recuperacao";

function cpfValido(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (b: number[]) => { let s = 0; for (let i = 0; i < b.length; i++) s += b[i]! * (b.length + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(n); const d2 = dv([...n, d1]); return [...n, d1, d2].join("");
}
let seqTel = 600000000;
const tel = () => String(++seqTel).padStart(11, "4");

suiteDeIntegracao("FASE 10.2 · CPF + senha", () => {
  const users: string[] = [];
  const cases: string[] = [];
  async function criar(senha: string | null): Promise<{ id: string; cpf: string }> {
    const cpf = cpfValido();
    const u = await prisma.user.create({
      data: { name: "P Senha", cpf, phone: tel(), phoneCountry: "BR", phoneVerifiedAt: null,
        passwordHash: senha ? await hashDeSenha(senha) : null, role: "PARTICIPANT" },
      select: { id: true },
    });
    users.push(u.id);
    return { id: u.id, cpf };
  }
  beforeAll(() => { if (!integracaoLiberada) return; });
  afterAll(async () => {
    if (!integracaoLiberada) return;
    await prisma.legacyRecoveryAudit.deleteMany({ where: { userId: { in: users } } });
    await prisma.legacyRecoveryCase.deleteMany({ where: { userId: { in: users } } });
    await prisma.authChallenge.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.loginAttempt.deleteMany({ where: { chave: { startsWith: "auth:" } } });
    void cases;
  });

  it("PART-PASS-1/2/3/4 senha valida autentica; errada/inexistente/sem-senha falham (neutro)", async () => {
    const a = await criar("SenhaForte123");
    expect((await autenticarParticipantePorSenha({ cpf: a.cpf, senha: "SenhaForte123" }))?.id).toBe(a.id);
    expect(await autenticarParticipantePorSenha({ cpf: a.cpf, senha: "errada" })).toBeNull();
    expect(await autenticarParticipantePorSenha({ cpf: cpfValido(), senha: "qualquer" })).toBeNull(); // inexistente
    const legado = await criar(null); // LEGACY_NO_PASSWORD
    expect(await autenticarParticipantePorSenha({ cpf: legado.cpf, senha: "qualquer" })).toBeNull(); // fail-closed
  });

  it("PART-PASS-7 rate-limit de brute force: chave bloqueada barra ate a senha certa", async () => {
    const a = await criar("SenhaForte123");
    // Pre-bloqueia a chave da conta (deterministico, sem depender de acumulo
    // sob carga paralela) e verifica NA SEQUENCIA, minimizando interferencia.
    const chave = chaveDeAuth("PARTICIPANT_PASSWORD_ATTEMPT", "cpf", a.cpf);
    await prisma.loginAttempt.upsert({
      where: { chave },
      create: { chave, falhas: 99, desde: new Date(), bloqueadoAte: new Date(Date.now() + 60_000) },
      update: { falhas: 99, bloqueadoAte: new Date(Date.now() + 60_000) },
    });
    expect(await autenticarParticipantePorSenha({ cpf: a.cpf, senha: "SenhaForte123" })).toBeNull();
  });

  it("PASS-CHANGE-4/5 nova senha autentica; antiga nao", async () => {
    const a = await criar("SenhaVelha1");
    await prisma.user.update({ where: { id: a.id }, data: { passwordHash: await hashDeSenha("SenhaNova2") } });
    expect((await autenticarParticipantePorSenha({ cpf: a.cpf, senha: "SenhaNova2" }))?.id).toBe(a.id);
    expect(await autenticarParticipantePorSenha({ cpf: a.cpf, senha: "SenhaVelha1" })).toBeNull();
  });

  it("PASS-CRIT-1..6 prova por senha: correta gera; errada nao; single-use; cross-user; cross-purpose; expira", async () => {
    const a = await criar("SenhaForte123");
    expect(await emitirProvaDeAcaoCritica({ userId: a.id, senha: "errada" })).toBeNull(); // senha errada
    const pr = await emitirProvaDeAcaoCritica({ userId: a.id, senha: "SenhaForte123" });
    expect(pr).not.toBeNull();
    // single-use
    expect(await consumirProvaDeAcaoCritica({ userId: a.id, challengeId: pr!.challengeId, prova: pr!.prova })).toBe(true);
    expect(await consumirProvaDeAcaoCritica({ userId: a.id, challengeId: pr!.challengeId, prova: pr!.prova })).toBe(false); // replay
    // cross-user
    const b = await criar("SenhaForte123");
    const prb = await emitirProvaDeAcaoCritica({ userId: b.id, senha: "SenhaForte123" });
    expect(await consumirProvaDeAcaoCritica({ userId: a.id, challengeId: prb!.challengeId, prova: prb!.prova })).toBe(false);
    // cross-purpose (usar como LOGIN)
    const prc = await emitirProvaDeAcaoCritica({ userId: a.id, senha: "SenhaForte123" });
    expect((await verificarDesafio({ challengeId: prc!.challengeId, codigo: prc!.prova, purpose: "LOGIN", userId: a.id })).resultado).toBe("BINDING_INVALIDO");
    // expira
    const prd = await emitirProvaDeAcaoCritica({ userId: a.id, senha: "SenhaForte123" });
    await prisma.authChallenge.update({ where: { id: prd!.challengeId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await consumirProvaDeAcaoCritica({ userId: a.id, challengeId: prd!.challengeId, prova: prd!.prova })).toBe(false);
  });

  it("LEGACY-PASS-1..6 recovery define nova senha; grant single-use/consumido; revoga sessoes", async () => {
    const a = await criar(null); // legado sem senha
    const svAntes = (await prisma.user.findUnique({ where: { id: a.id }, select: { sessionVersion: true } }))!.sessionVersion;
    const { caseId } = await abrirCasoDeRecuperacao(a.id); cases.push(caseId);
    const ap = await aprovarCaso(caseId, "operador");
    if (!ap.ok) throw new Error("nao aprovou");
    // sem grant: falha
    expect((await concluirRecuperacaoComSenha({ caseId, grant: "errado", novaSenha: "NovaSenha9" })).ok).toBe(false);
    // grant certo: redefine
    const ok = await concluirRecuperacaoComSenha({ caseId, grant: ap.grant, novaSenha: "NovaSenha9" });
    expect(ok.ok).toBe(true);
    // login com a nova senha funciona
    expect((await autenticarParticipantePorSenha({ cpf: a.cpf, senha: "NovaSenha9" }))?.id).toBe(a.id);
    // sessoes revogadas
    const svDepois = (await prisma.user.findUnique({ where: { id: a.id }, select: { sessionVersion: true } }))!.sessionVersion;
    expect(svDepois).toBe(svAntes + 1);
    // grant consumido: replay falha
    expect((await concluirRecuperacaoComSenha({ caseId, grant: ap.grant, novaSenha: "Outra9999" })).ok).toBe(false);
    void revogarTodasAsSessoes;
  });

  it("LEGACY-PASS-5 20 concorrentes com o mesmo grant -> 1 redefine", async () => {
    const a = await criar(null);
    const { caseId } = await abrirCasoDeRecuperacao(a.id); cases.push(caseId);
    const ap = await aprovarCaso(caseId, "operador");
    if (!ap.ok) throw new Error();
    const res = await Promise.all(Array.from({ length: 20 }, () => concluirRecuperacaoComSenha({ caseId, grant: ap.grant, novaSenha: "NovaSenha9" })));
    expect(res.filter((x) => x.ok)).toHaveLength(1);
  });
});
