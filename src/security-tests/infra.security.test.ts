// P1-C - invariantes de infra testaveis localmente.
import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import { processarWebhookDePagamento } from "@/server/services/payment-webhook";
import type { ProviderResolution } from "@/server/services/payment-provider";

import { coletarProblemasDeProducao } from "@/lib/env-validation";
import { securityHeaders } from "@/lib/security-headers";
import { visivelAoPublico } from "@/lib/vitrine";
import { aprovacaoAutomaticaPermitida } from "@/lib/pagamentos/tier";
import { redigir } from "@/lib/log-redaction";

const envProdBase = {
  NODE_ENV: "production",
  AUTH_SECRET: "x".repeat(40),
  PAYMENT_SECRET_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  DATABASE_URL: "postgresql://app@host/db",
  DIRECT_URL: "postgresql://mig@host/db",
  ADMIN_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  OTP_PROVIDER: "vendorx",
  OTP_PROVIDER_API_KEY: "k",
} as unknown as NodeJS.ProcessEnv;

describe("INFRA-4 build nao executa migration", () => {
  it("o script build nao contem 'migrate deploy'", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts.build).not.toMatch(/migrate\s+deploy/);
    expect(pkg.scripts.build).toBe("prisma generate && next build");
    // job explicito existe
    expect(pkg.scripts["db:migrate:deploy"]).toMatch(/migrate deploy/);
  });
});

describe("INFRA-5 production env fail-fast", () => {
  it("ambiente valido nao acusa problema", () => {
    expect(coletarProblemasDeProducao(envProdBase)).toHaveLength(0);
  });
  it("secret ausente e acusado (sem valor)", () => {
    const { AUTH_SECRET, ...semAuth } = envProdBase as Record<string, string>;
    void AUTH_SECRET;
    const p = coletarProblemasDeProducao(semAuth as NodeJS.ProcessEnv);
    expect(p.some((x) => x.variavel === "AUTH_SECRET")).toBe(true);
    expect(JSON.stringify(p)).not.toContain(envProdBase.PAYMENT_SECRET_ENCRYPTION_KEY);
  });
  it("fora de producao nao valida", () => {
    expect(coletarProblemasDeProducao({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toHaveLength(0);
  });
});

describe("INFRA-6 STATUS_ONLY impossivel em producao", () => {
  it("flag ligada nao habilita STATUS_ONLY em prod", () => {
    const p = coletarProblemasDeProducao({ ...envProdBase, PAYMENTS_ALLOW_STATUS_ONLY_AUTO_APPROVAL: "true" } as NodeJS.ProcessEnv);
    expect(p.some((x) => x.variavel === "PAYMENTS_ALLOW_STATUS_ONLY_AUTO_APPROVAL")).toBe(true);
    // e a propria decisao de aprovacao ignora o toggle em prod
    const antes = process.env.NODE_ENV;
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    process.env.PAYMENTS_ALLOW_STATUS_ONLY_AUTO_APPROVAL = "true";
    expect(aprovacaoAutomaticaPermitida("SYNCPAY")).toBe(false);
    (process.env as { NODE_ENV?: string }).NODE_ENV = antes;
    delete process.env.PAYMENTS_ALLOW_STATUS_ONLY_AUTO_APPROVAL;
  });
});

describe("INFRA-7 fake OTP / flags inseguras impossiveis em prod", () => {
  it("ALLOW_DESTRUCTIVE_TESTS e AUTH_DEBUG sao barrados em prod", () => {
    const p1 = coletarProblemasDeProducao({ ...envProdBase, ALLOW_DESTRUCTIVE_TESTS: "true" } as NodeJS.ProcessEnv);
    expect(p1.some((x) => x.variavel === "ALLOW_DESTRUCTIVE_TESTS")).toBe(true);
    const p2 = coletarProblemasDeProducao({ ...envProdBase, AUTH_DEBUG: "true" } as NodeJS.ProcessEnv);
    expect(p2.some((x) => x.variavel === "AUTH_DEBUG")).toBe(true);
  });
  it("segredo em NEXT_PUBLIC_ e acusado", () => {
    const p = coletarProblemasDeProducao({ ...envProdBase, NEXT_PUBLIC_STRIPE_SECRET: "x" } as NodeJS.ProcessEnv);
    expect(p.some((x) => x.variavel === "NEXT_PUBLIC_STRIPE_SECRET")).toBe(true);
  });
});

describe("INFRA-11 security headers", () => {
  it("cabecalhos essenciais presentes; HSTS so em prod", () => {
    const prod = securityHeaders(true);
    const nomes = prod.map((h) => h.key);
    expect(nomes).toContain("Content-Security-Policy");
    expect(nomes).toContain("X-Content-Type-Options");
    expect(nomes).toContain("Referrer-Policy");
    expect(nomes).toContain("Permissions-Policy");
    expect(nomes).toContain("Strict-Transport-Security");
    const csp = prod.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
    // fora de prod nao manda HSTS
    expect(securityHeaders(false).map((h) => h.key)).not.toContain("Strict-Transport-Security");
  });
});

describe("§22 redacao de log", () => {
  it("mascara chaves sensiveis, preserva o resto", () => {
    const r = redigir({ userId: "u1", cpf: "39053344705", phone: "11999", totp: "123456", nested: { secret: "abc", ok: "visivel" } }) as Record<string, unknown>;
    expect(r.userId).toBe("u1");
    expect(r.cpf).toBe("[REDIGIDO]");
    expect(r.phone).toBe("[REDIGIDO]");
    expect(r.totp).toBe("[REDIGIDO]");
    expect((r.nested as Record<string, unknown>).secret).toBe("[REDIGIDO]");
    expect((r.nested as Record<string, unknown>).ok).toBe("visivel");
  });
});

describe("INFRA-13 draft winner nao vaza", () => {
  it("DRAFT/QUEUED e nao-PUBLIC nao sao visiveis ao publico", () => {
    expect(visivelAoPublico({ status: "DRAFT", privacy: "PUBLIC" })).toBe(false);
    expect(visivelAoPublico({ status: "QUEUED", privacy: "PUBLIC" })).toBe(false);
    expect(visivelAoPublico({ status: "ACTIVE", privacy: "PRIVATE" })).toBe(false);
    expect(visivelAoPublico({ status: "ACTIVE", privacy: "PUBLIC" })).toBe(true);
    expect(visivelAoPublico({ status: "FINISHED", privacy: "PUBLIC" })).toBe(true);
  });
});


suiteDeIntegracao("INFRA-8 · gateway indisponivel = fail-closed", () => {
  let tenantId = "", donoId = "";
  const criados: string[] = [];
  beforeAll(async () => {
    if (!integracaoLiberada) return;
    tenantId = (await prisma.tenant.findFirstOrThrow({ select: { id: true } })).id;
    donoId = (await prisma.user.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;
  });
  afterAll(async () => {
    if (!integracaoLiberada) return;
    await prisma.paymentWebhookEvent.deleteMany({ where: { externalId: { startsWith: "INFRA8-" } } });
    for (const rid of criados) {
      await prisma.payment.deleteMany({ where: { reservationId: rid } });
      await prisma.reservation.deleteMany({ where: { id: rid } });
    }
  });

  it("NexusPag lancando em getStatus -> Payment segue PENDING, sem fallback", async () => {
    const sx = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const raffle = await prisma.raffle.create({ data: { tenantId, title: `I8 ${sx}`, slug: `i8-${sx}`, status: "ACTIVE", privacy: "PUBLIC", modality: "OWN_DRAW", reservationModel: "RANDOM_NUMBERS", requiredFields: { name: true }, totalNumbers: 100, pricePerNumber: 10, createdById: donoId }, select: { id: true } });
    const r = await prisma.reservation.create({ data: { raffleId: raffle.id, userId: donoId, participantName: "x", totalAmount: 100, status: "PENDING", expiresAt: new Date(Date.now() + 3_600_000) }, select: { id: true } });
    criados.push(r.id);
    const externalId = `INFRA8-${r.id}`;
    await prisma.payment.create({ data: { reservationId: r.id, provider: "NEXUSPAG", externalId, status: "PENDING", amount: 100, method: "PIX" } });
    const resolver = async (): Promise<ProviderResolution> => ({ ok: true, provider: { name: "NEXUSPAG", webhookPath: "nexuspag", createPixCharge: async () => ({ pixCode: "x", identifier: "x" }), getStatus: async () => { throw new Error("gateway indisponivel"); } } });
    const out = await processarWebhookDePagamento({ evento: { provider: "NEXUSPAG", externalId, statusAfirmado: "APPROVED", eventoOficial: null }, corpoCru: "", payload: {}, assinaturaValida: true }, { resolverProvider: resolver as never });
    expect(out.desfecho).not.toBe("APROVADO"); // gateway indisponivel nunca aprova
    const pg = await prisma.payment.findFirst({ where: { externalId }, select: { status: true } });
    expect(pg?.status).toBe("PENDING");
    await prisma.raffle.delete({ where: { id: raffle.id } }).catch(() => {});
  });
});
