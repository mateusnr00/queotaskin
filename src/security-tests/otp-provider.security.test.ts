// P1-C 10 - arquitetura de provider de OTP (fail-closed, sem vendor real).
import { afterEach, describe, expect, it } from "vitest";

import { resolverProviderDeOtp } from "@/server/services/otp/provider-registry";
import { FakeOtpProvider, MockOtpProvider, baseUrlDeOtpConfiavel } from "@/server/services/otp/provider";
import { HttpOtpProvider } from "@/server/services/otp/providers/http";
import { ErroDeProvider } from "@/server/services/otp/providers/tipos";
import { coletarProblemasDeProducao } from "@/lib/env-validation";

const envAntes = { ...process.env };
afterEach(() => { process.env = { ...envAntes }; });

describe("§3/§37 registry de provider (fail-closed)", () => {
  it("sem OTP_PROVIDER: lança (nenhum envio possível)", () => {
    delete process.env.OTP_PROVIDER; delete (process.env as { NODE_ENV?: string }).NODE_ENV;
    expect(() => resolverProviderDeOtp()).toThrow(ErroDeProvider);
  });
  it("fake/mock fora de produção: ok; em produção: proibido", () => {
    process.env.OTP_PROVIDER = "mock"; (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
    expect(resolverProviderDeOtp()).toBeInstanceOf(MockOtpProvider);
    process.env.OTP_PROVIDER = "fake";
    expect(resolverProviderDeOtp()).toBeInstanceOf(FakeOtpProvider);
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    expect(() => resolverProviderDeOtp()).toThrow(/proibido em produção/);
  });
  it("provider desconhecido: fail-closed", () => {
    process.env.OTP_PROVIDER = "vendorx"; (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
    expect(() => resolverProviderDeOtp()).toThrow(/desconhecido/);
  });
});

describe("§5/§6/§7 HttpOtpProvider (sem vendor selecionado)", () => {
  it("sem montarRequisicao: fail-closed (não inventa API)", async () => {
    const p = new HttpOtpProvider({ nome: "x", baseUrl: "https://api.exemplo.com", apiKey: "k" });
    await expect(p.enviar({ phoneCountry: "BR", phoneDigits: "11999" }, "123456", { purpose: "LOGIN" }))
      .rejects.toThrow(/vendor de OTP nao selecionado/);
  });
  it("mapeia status para desfecho (via montarRequisicao stub + fetch mock)", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response("", { status: 429 })) as typeof fetch;
    const p = new HttpOtpProvider({ nome: "x", baseUrl: "https://api.exemplo.com", apiKey: "k", montarRequisicao: () => ({ url: "https://api.exemplo.com/send", init: { method: "POST" } }) });
    await expect(p.enviar({ phoneCountry: "BR", phoneDigits: "11999" }, "123456", { purpose: "LOGIN" }))
      .rejects.toMatchObject({ desfecho: "RATE_LIMITED" });
    globalThis.fetch = orig;
  });
});

describe("§63 baseUrl allowlist/HTTPS", () => {
  it("HTTP recusado; localhost em prod recusado; sem allowlist em prod recusa qualquer", () => {
    expect(baseUrlDeOtpConfiavel("http://api.x.com", false)).toBe(false);
    expect(baseUrlDeOtpConfiavel("https://localhost", true)).toBe(false);
    expect(baseUrlDeOtpConfiavel("https://api.x.com", true)).toBe(false); // allowlist vazia
    expect(baseUrlDeOtpConfiavel("https://api.x.com", false)).toBe(true); // fora de prod ok
  });
});

describe("§37/§62 env validation do provider", () => {
  const base = {
    NODE_ENV: "production", AUTH_SECRET: "x".repeat(40),
    PAYMENT_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    ADMIN_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
    DATABASE_URL: "postgresql://a@h/d", DIRECT_URL: "postgresql://m@h/d",
  } as unknown as NodeJS.ProcessEnv;
  it("prod sem OTP_PROVIDER = problema", () => {
    expect(coletarProblemasDeProducao(base).some((x) => x.variavel === "OTP_PROVIDER")).toBe(true);
  });
  it("prod com OTP_PROVIDER=fake = problema", () => {
    expect(coletarProblemasDeProducao({ ...base, OTP_PROVIDER: "fake" } as NodeJS.ProcessEnv).some((x) => x.variavel === "OTP_PROVIDER")).toBe(true);
  });
  it("prod com provider real mas sem api key = problema", () => {
    expect(coletarProblemasDeProducao({ ...base, OTP_PROVIDER: "vendorx" } as NodeJS.ProcessEnv).some((x) => x.variavel === "OTP_PROVIDER_API_KEY")).toBe(true);
  });
  it("prod com provider+key+baseUrl HTTPS = sem problema de OTP", () => {
    const p = coletarProblemasDeProducao({ ...base, OTP_PROVIDER: "vendorx", OTP_PROVIDER_API_KEY: "k", OTP_PROVIDER_BASE_URL: "https://api.vendorx.com" } as NodeJS.ProcessEnv);
    expect(p.filter((x) => x.variavel.startsWith("OTP_PROVIDER"))).toHaveLength(0);
  });
});
