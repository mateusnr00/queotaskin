// FASE 5.2 - enforcement de sessao, reauth e acoes sensiveis.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import { FakeOtpProvider } from "@/server/services/otp/provider";
import { criarDesafio } from "@/server/services/otp/otp-service";
import { revogarTodasAsSessoes } from "@/server/services/otp/sessao";
import {
  validarSessaoParticipante,
  donoOuAdminPodeAcessar,
} from "@/server/services/otp/sessao-participante";
import { alterarSteamTradeUrl } from "@/server/services/otp/steam-url";
import { trocarTelefoneVerificado } from "@/server/services/otp/conta";

function cpfValido(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (b: number[]) => { let s = 0; for (let i = 0; i < b.length; i++) s += b[i]! * (b.length + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(n); const d2 = dv([...n, d1]); return [...n, d1, d2].join("");
}
let tel = 800000000;
const telUnico = () => String(++tel).padStart(11, "2");

// SESS-2/3 predicado de posse (puro, sem DB)
describe("SESS-2/3 posse: userId da sessao, User A nao acessa recurso B", () => {
  it("dono acessa; outro usuario nao; admin sim; deslogado por capability-URL", () => {
    expect(donoOuAdminPodeAcessar("A", "PARTICIPANT", "A")).toBe(true);
    expect(donoOuAdminPodeAcessar("B", "PARTICIPANT", "A")).toBe(false); // IDOR barrado
    expect(donoOuAdminPodeAcessar("B", "ADMIN", "A")).toBe(true);
    expect(donoOuAdminPodeAcessar(undefined, undefined, "A")).toBe(true); // link e credencial
  });
});

suiteDeIntegracao("FASE 5.2 · enforcement de sessao (DB)", () => {
  const users: string[] = [];
  async function novoUser(): Promise<{ id: string; sv: number }> {
    const u = await prisma.user.create({
      data: { name: "Sess", cpf: cpfValido(), phone: telUnico(), phoneCountry: "BR", phoneVerifiedAt: new Date(), role: "PARTICIPANT" },
      select: { id: true, sessionVersion: true },
    });
    users.push(u.id);
    return { id: u.id, sv: u.sessionVersion };
  }
  async function reauth(userId: string): Promise<{ challengeId: string; codigo: string }> {
    const fake = new FakeOtpProvider();
    const d = await criarDesafio({ userId, purpose: "CRITICAL_ACTION", destino: { phoneCountry: "BR", phoneDigits: telUnico() } }, fake);
    return { challengeId: d.challengeId, codigo: fake.ultimoCodigo()! };
  }

  beforeAll(() => { if (!integracaoLiberada) return; });
  afterAll(async () => {
    if (!integracaoLiberada) return;
    await prisma.authChallenge.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it("SESS-1 sessao com version certa passa; version defasada (revogada) e recusada", async () => {
    const u = await novoUser();
    expect((await validarSessaoParticipante({ userId: u.id, sessionVersion: u.sv })).ok).toBe(true);
    const nova = await revogarTodasAsSessoes(u.id);
    expect(nova).toBe(u.sv + 1);
    const r = await validarSessaoParticipante({ userId: u.id, sessionVersion: u.sv });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.falha).toBe("SESSAO_REVOGADA");
  });

  it("SESS-8 sessao legada (sem sessionVersion) e fail-closed", async () => {
    const u = await novoUser();
    const r = await validarSessaoParticipante({ userId: u.id, sessionVersion: undefined });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.falha).toBe("SESSAO_LEGADA");
  });

  it("SESS-5 Steam URL: sem reauth rejeita; reauth valido aceita; reauth expirado/outro user/outro purpose rejeita", async () => {
    const u = await novoUser();
    const url = "https://steamcommunity.com/tradeoffer/new/?partner=1&token=abc";
    // sem reauth (codigo invalido)
    expect((await alterarSteamTradeUrl({ sessao: { userId: u.id, sessionVersion: u.sv }, steamTradeUrl: url, reauth: { challengeId: "x", codigo: "000000" } })).ok).toBe(false);
    // reauth valido
    const ok = await reauth(u.id);
    expect((await alterarSteamTradeUrl({ sessao: { userId: u.id, sessionVersion: u.sv }, steamTradeUrl: url, reauth: ok })).ok).toBe(true);
    // reauth expirado
    const exp = await reauth(u.id);
    await prisma.authChallenge.update({ where: { id: exp.challengeId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await alterarSteamTradeUrl({ sessao: { userId: u.id, sessionVersion: u.sv }, steamTradeUrl: url, reauth: exp })).ok).toBe(false);
    // reauth de OUTRO user
    const outro = await novoUser();
    const doOutro = await reauth(outro.id);
    expect((await alterarSteamTradeUrl({ sessao: { userId: u.id, sessionVersion: u.sv }, steamTradeUrl: url, reauth: doOutro })).ok).toBe(false);
    // reauth de OUTRO purpose (LOGIN)
    const fake = new FakeOtpProvider();
    const login = await criarDesafio({ userId: u.id, purpose: "LOGIN", destino: { phoneCountry: "BR", phoneDigits: telUnico() } }, fake);
    expect((await alterarSteamTradeUrl({ sessao: { userId: u.id, sessionVersion: u.sv }, steamTradeUrl: url, reauth: { challengeId: login.challengeId, codigo: fake.ultimoCodigo()! } })).ok).toBe(false);
  });

  it("SESS-5 Steam URL: sessao revogada nao altera", async () => {
    const u = await novoUser();
    await revogarTodasAsSessoes(u.id); // sv do token agora defasado
    const ok = await reauth(u.id);
    const r = await alterarSteamTradeUrl({ sessao: { userId: u.id, sessionVersion: u.sv }, steamTradeUrl: "https://x", reauth: ok });
    expect(r.ok).toBe(false);
  });

  it("SESS-6 troca de telefone: exige sessao valida + OTP do novo numero; revoga sessoes", async () => {
    const u = await novoUser();
    const novo = telUnico();
    const fake = new FakeOtpProvider();
    const d = await criarDesafio({ userId: u.id, purpose: "CHANGE_PHONE", destino: { phoneCountry: "BR", phoneDigits: novo } }, fake);
    // sessao revogada -> rejeita mesmo com OTP certo
    await revogarTodasAsSessoes(u.id);
    const rRev = await trocarTelefoneVerificado({ sessao: { userId: u.id, sessionVersion: u.sv }, novoPhone: novo, novoPhoneCountry: "BR", challengeIdDoNovoTelefone: d.challengeId, codigo: fake.ultimoCodigo()! });
    expect(rRev.ok).toBe(false);
  });

  it("SESS-6 troca de telefone com sessao valida troca e sobe a version", async () => {
    const u = await novoUser();
    const novo = telUnico();
    const fake = new FakeOtpProvider();
    const d = await criarDesafio({ userId: u.id, purpose: "CHANGE_PHONE", destino: { phoneCountry: "BR", phoneDigits: novo } }, fake);
    const r = await trocarTelefoneVerificado({ sessao: { userId: u.id, sessionVersion: u.sv }, novoPhone: novo, novoPhoneCountry: "BR", challengeIdDoNovoTelefone: d.challengeId, codigo: fake.ultimoCodigo()! });
    expect(r.ok).toBe(true);
    const dbu = await prisma.user.findUnique({ where: { id: u.id }, select: { phone: true, sessionVersion: true } });
    expect(dbu?.phone).toBe(novo);
    expect(dbu?.sessionVersion).toBe(u.sv + 1);
  });

  it("SESS-9 §28 concorrencia: 20 revogacoes -> version sobe 20, nunca regride", async () => {
    const u = await novoUser();
    await Promise.all(Array.from({ length: 20 }, () => revogarTodasAsSessoes(u.id)));
    const dbu = await prisma.user.findUnique({ where: { id: u.id }, select: { sessionVersion: true } });
    expect(dbu?.sessionVersion).toBe(u.sv + 20);
  });

  it("SESS-7 §29 reauth CRITICAL single-use: 20 usos simultaneos do mesmo -> so 1 vence", async () => {
    const u = await novoUser();
    const url = "https://steamcommunity.com/tradeoffer/new/?partner=1&token=z";
    const ok = await reauth(u.id);
    const res = await Promise.all(Array.from({ length: 20 }, () =>
      alterarSteamTradeUrl({ sessao: { userId: u.id, sessionVersion: u.sv }, steamTradeUrl: url, reauth: ok }),
    ));
    expect(res.filter((x) => x.ok)).toHaveLength(1); // reauth consumida uma vez
  });
});
