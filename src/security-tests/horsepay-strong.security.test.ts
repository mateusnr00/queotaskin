// GATE 10F: HorsePay promovido STATUS_ONLY -> STRONG.
//
// A prova de aprovação automática vem da CONSULTA AUTORITATIVA server-to-server
// (GET /api/orders/deposit/{externalId}), nunca do webhook. Para HorsePay,
// verifyPayment exige os TRÊS: status=paid + amount(centavos) exato + identity
// (id) igual ao externalId gravado. Qualquer um faltando/divergente => NÃO
// aprova (INVALID/PENDING/UNVERIFIABLE), fail-closed. SyncPay/SigiloPay seguem
// STATUS_ONLY. Nada aqui usa o corpo do webhook como prova.
import { createHmac } from "node:crypto";

import { describe, it, expect } from "vitest";

import { verifyPayment, normalizeProviderId } from "@/server/services/payment-verification";
import { tierDoProvider } from "@/lib/pagamentos/tier";
import { assinaturaConfere } from "@/lib/horsepay";

// ---- verifyPayment via injeção de dependências (sem rede, sem banco) --------

type StatusGw = "PENDING" | "APPROVED" | "REJECTED";
interface RespostaGw {
  status: StatusGw;
  raw: unknown;
  amountBrl?: number | null;
  identity?: { id?: string | null; txid?: string | null; externalId?: string | null };
}

function verify(
  gw: RespostaGw,
  o: { provider?: string; externalId?: string; amount?: number; externalIdDoWebhook?: string } = {},
) {
  const provider = o.provider ?? "HORSEPAY";
  const externalId = o.externalId ?? "12345";
  const amount = o.amount ?? 1.01;
  const deps = {
    buscarPagamento: async () => ({
      provider,
      externalId,
      amount,
      reservation: { raffleId: "r1" },
    }),
    resolverProvider: async () =>
      ({
        ok: true as const,
        provider: {
          name: provider as never,
          webhookPath: "x",
          createPixCharge: async () => ({ pixCode: "", identifier: "" }),
          getStatus: async () => gw,
        },
      }),
  };
  return verifyPayment(
    {
      paymentId: "p1",
      providerDaRota: provider,
      externalIdDoWebhook: o.externalIdDoWebhook ?? externalId,
    },
    // deps é estruturalmente compatível; cast estreito p/ o tipo público.
    deps as unknown as Parameters<typeof verifyPayment>[1],
  );
}

const OK: RespostaGw = { status: "APPROVED", raw: {}, amountBrl: 1.01, identity: { id: "12345" } };

describe("HorsePay STRONG · verifyPayment (S2S prova, webhook só gatilho)", () => {
  it("1. paid + value certo + id certo => VERIFIED_APPROVED (com centavos e método forte)", async () => {
    const r = await verify(OK);
    expect(r.resultado).toBe("VERIFIED_APPROVED");
    expect(r.centavosConfirmados).toBe(101);
    expect(r.metodo).toBe("S2S_STATUS_AMOUNT");
  });

  it("2. underpayment (value menor) => NÃO aprova", async () => {
    expect((await verify({ ...OK, amountBrl: 0.5 })).resultado).toBe("INVALID");
  });
  it("3. overpayment (value maior) => NÃO aprova", async () => {
    expect((await verify({ ...OK, amountBrl: 1.02 })).resultado).toBe("INVALID");
  });
  it("4. value ausente (null) => NÃO aprova", async () => {
    expect((await verify({ ...OK, amountBrl: null })).resultado).toBe("INVALID");
  });
  it("4b. value ausente (undefined) => NÃO aprova", async () => {
    const { amountBrl: _omit, ...semValor } = OK;
    void _omit;
    expect((await verify(semValor)).resultado).toBe("INVALID");
  });
  it("5. value NaN => NÃO aprova", async () => {
    expect((await verify({ ...OK, amountBrl: Number.NaN })).resultado).toBe("INVALID");
  });
  it("6. value Infinity => NÃO aprova", async () => {
    expect((await verify({ ...OK, amountBrl: Number.POSITIVE_INFINITY })).resultado).toBe("INVALID");
  });
  it("7. value string inválida => NÃO aprova", async () => {
    expect((await verify({ ...OK, amountBrl: "1.01" as unknown as number })).resultado).toBe("INVALID");
  });
  it("7b. value string 1e309 (overflow) => NÃO aprova", async () => {
    expect((await verify({ ...OK, amountBrl: "1e309" as unknown as number })).resultado).toBe("INVALID");
  });

  it("8. id diferente => NÃO aprova (confused-deputy)", async () => {
    expect((await verify({ ...OK, identity: { id: "99999" } })).resultado).toBe("INVALID");
  });
  it("9. id ausente (null) => NÃO aprova (identidade obrigatória p/ HorsePay)", async () => {
    expect((await verify({ ...OK, identity: { id: null } })).resultado).toBe("INVALID");
  });
  it("9b. identity ausente por completo => NÃO aprova", async () => {
    const { identity: _omit, ...semId } = OK;
    void _omit;
    expect((await verify(semId)).resultado).toBe("INVALID");
  });
  it("10. id number(12345) casa externalId numeric-string('12345') com segurança", async () => {
    const r = await verify({ ...OK, identity: { id: 12345 as unknown as string } });
    expect(r.resultado).toBe("VERIFIED_APPROVED");
  });
  it("11. id malformado ('12345abc') => NÃO aprova", async () => {
    expect((await verify({ ...OK, identity: { id: "12345abc" } })).resultado).toBe("INVALID");
  });
  it("11b. id com espaço/sujeira (' 12345x') => NÃO aprova", async () => {
    expect((await verify({ ...OK, identity: { id: " 12345x" } })).resultado).toBe("INVALID");
  });

  it("12. pending + tudo certo => VERIFIED_PENDING (não aprova)", async () => {
    expect((await verify({ ...OK, status: "PENDING" })).resultado).toBe("VERIFIED_PENDING");
  });
  it("14. 'webhook diz pago' mas GET pending => PENDING (webhook não prova)", async () => {
    // o corpo do webhook nem entra em verifyPayment; a prova é o GET.
    expect((await verify({ ...OK, status: "PENDING" })).resultado).toBe("VERIFIED_PENDING");
  });
  it("15/16/17. amount/id errado no GET => NÃO aprova, independente do que o webhook alegue", async () => {
    expect((await verify({ ...OK, amountBrl: 2.0 })).resultado).toBe("INVALID"); // 15
    expect((await verify({ ...OK, amountBrl: null })).resultado).toBe("INVALID"); // 16
    expect((await verify({ ...OK, identity: { id: "0" } })).resultado).toBe("INVALID"); // 17
  });

  it("25/26/27. getStatus lança (timeout/5xx/JSON inválido) => UNVERIFIABLE (fail-closed)", async () => {
    const deps = {
      buscarPagamento: async () => ({ provider: "HORSEPAY", externalId: "12345", amount: 1.01, reservation: { raffleId: "r1" } }),
      resolverProvider: async () => ({
        ok: true as const,
        provider: {
          name: "HORSEPAY" as never, webhookPath: "x",
          createPixCharge: async () => ({ pixCode: "", identifier: "" }),
          getStatus: async () => { throw Object.assign(new Error("boom"), { name: "TimeoutError" }); },
        },
      }),
    };
    const r = await verifyPayment(
      { paymentId: "p1", providerDaRota: "HORSEPAY", externalIdDoWebhook: "12345" },
      deps as unknown as Parameters<typeof verifyPayment>[1],
    );
    expect(r.resultado).toBe("UNVERIFIABLE");
  });

  it("29. externalId do webhook != Payment => INVALID antes de qualquer aprovação", async () => {
    expect((await verify(OK, { externalIdDoWebhook: "99999" })).resultado).toBe("INVALID");
  });

  it("34/35. só com status+amount+identity TODOS corretos aparece VERIFIED_APPROVED", async () => {
    // remover qualquer um dos três derruba a aprovação:
    expect((await verify(OK)).resultado).toBe("VERIFIED_APPROVED");
    expect((await verify({ ...OK, status: "PENDING" })).resultado).not.toBe("VERIFIED_APPROVED");
    expect((await verify({ ...OK, amountBrl: null })).resultado).not.toBe("VERIFIED_APPROVED");
    expect((await verify({ ...OK, identity: { id: null } })).resultado).not.toBe("VERIFIED_APPROVED");
  });
});

describe("regressão: NexusPag e STATUS_ONLY não mudam", () => {
  it("NexusPag (STRONG) continua aprovando por valor, com identidade OPCIONAL", async () => {
    const gw: RespostaGw = { status: "APPROVED", raw: {}, amountBrl: 1.01, identity: { id: null } };
    const r = await verify(gw, { provider: "NEXUSPAG", externalId: "uuid-abc", amount: 1.01 });
    expect(r.resultado).toBe("VERIFIED_APPROVED"); // NexusPag não exige identity
  });
  it("NexusPag com valor errado => INVALID", async () => {
    const gw: RespostaGw = { status: "APPROVED", raw: {}, amountBrl: 9.99, identity: { id: "uuid-abc" } };
    expect((await verify(gw, { provider: "NEXUSPAG", externalId: "uuid-abc", amount: 1.01 })).resultado).toBe("INVALID");
  });
  it("SyncPay (STATUS_ONLY) aprova por STATUS no verify (a POLÍTICA hard-false é aplicada depois)", async () => {
    const gw: RespostaGw = { status: "APPROVED", raw: {} }; // sem amount
    expect((await verify(gw, { provider: "SYNCPAY", externalId: "x" })).resultado).toBe("VERIFIED_APPROVED");
  });
});

describe("normalizeProviderId · comparação segura, sem coerção perigosa", () => {
  it("number seguro vira string canônica; string numérica passa; equivalência 12345 == '12345'", () => {
    expect(normalizeProviderId(12345)).toBe("12345");
    expect(normalizeProviderId("12345")).toBe("12345");
    expect(normalizeProviderId(12345)).toBe(normalizeProviderId("12345"));
  });
  it("rejeita números perigosos e não-strings => null", () => {
    for (const mau of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1.5, -1, null, undefined, {}, [], true]) {
      expect(normalizeProviderId(mau as unknown)).toBeNull();
    }
  });
  it("string vazia/whitespace => null", () => {
    expect(normalizeProviderId("")).toBeNull();
    expect(normalizeProviderId("   ")).toBeNull();
  });
  it("string suja NÃO é truncada (diferente de parseInt) e NUNCA casa o id limpo", () => {
    // A segurança não vem de virar null: vem de a comparação estrita falhar.
    expect(normalizeProviderId("12345abc")).toBe("12345abc");
    expect(normalizeProviderId(" 12345x")).toBe("12345x");
    expect(normalizeProviderId("12345abc")).not.toBe(normalizeProviderId("12345"));
    expect(normalizeProviderId(" 12345x")).not.toBe(normalizeProviderId("12345"));
  });
});

describe("tier + HMAC (invariantes preservadas)", () => {
  it("31/32. SyncPay e SigiloPay continuam STATUS_ONLY", () => {
    expect(tierDoProvider("SYNCPAY")).toBe("STATUS_ONLY");
    expect(tierDoProvider("SIGILOPAY")).toBe("STATUS_ONLY");
  });
  it("HorsePay agora é STRONG", () => {
    expect(tierDoProvider("HORSEPAY")).toBe("STRONG");
  });
  it("18/19. HMAC do webhook: válida passa, inválida e ausente rejeitam (preservado)", () => {
    const segredo = "s3gr3d0";
    const corpo = '{"external_id":1,"status":true}';
    const boa = createHmac("sha256", segredo).update(corpo).digest("hex");
    expect(assinaturaConfere(`sha256=${boa}`, corpo, segredo)).toBe(true);
    expect(assinaturaConfere(boa, corpo, segredo)).toBe(true); // prefixo opcional
    expect(assinaturaConfere("sha256=deadbeef", corpo, segredo)).toBe(false);
    expect(assinaturaConfere(null, corpo, segredo)).toBe(false);
    expect(assinaturaConfere(`sha256=${boa}`, corpo, "")).toBe(false);
    expect(assinaturaConfere(`sha256=${boa}`, corpo + "x", segredo)).toBe(false);
  });
});
